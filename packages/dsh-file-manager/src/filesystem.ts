import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { promisify } from 'node:util'
import {
  lstat, mkdir, open, readdir, realpath, rm, unlink,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, sep } from 'node:path'
import { normalizedAbsolute, type UserFileFilesystem } from '@dsh-external/dsh-user-files'
import type { FileManagerTrashPaths } from './trash.ts'
import type {
  FileManagerCreateResult, FileManagerDeleteMode, FileManagerDirectory,
  FileManagerEntry,
} from './types.ts'

/** Stable filesystem-manager failures translated by the Host Remote. */
export type FileManagerFilesystemErrorCode =
  | 'invalid-path'
  | 'not-found'
  | 'not-directory'
  | 'not-file'
  | 'already-exists'
  | 'root-delete'
  | 'confirmation-required'
  | 'trash-unsupported'
  | 'unavailable'

/** Filesystem failure with a stable category and addressed path. */
export class FileManagerFilesystemError extends Error {
  /** @param code - Stable failure category. @param path - Normalized addressed path. @param message - Diagnostic text. @param options - Optional underlying cause. */
  constructor(
    readonly code: FileManagerFilesystemErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'FileManagerFilesystemError'
  }
}

/** Recoverable-removal adapter used by production and fixture-local tests. */
export type FileManagerTrash = (paths: readonly string[]) => Promise<void>

/** Provider-owned home-trash locations; resolver failures reject management operations. */
export type FileManagerTrashLocations = () => Promise<FileManagerTrashPaths>

const runFile = promisify(execFile)

function isInsideDirectory(directory: string, path: string): boolean {
  return path.startsWith(directory.endsWith(sep) ? directory : `${directory}${sep}`)
}

/** Resolve parent links while preserving the final entry for unlink and rename. */
async function entryPath(path: string): Promise<string> {
  return join(await realpath(dirname(path)), basename(path))
}

/** Resolve existing ancestors without creating an absent trash directory. */
async function canonicalLocation(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await canonicalLocation(parent), basename(path))
  }
}

/** Decode the home-trash record's single original absolute path. */
function originalPathOf(content: string, record: string): string {
  let inTrashInfo = false
  const paths: string[] = []
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('[')) inTrashInfo = line === '[Trash Info]'
    else if (inTrashInfo && line.startsWith('Path=')) paths.push(line.slice(5))
  }
  try {
    if (paths.length !== 1) throw new Error('expected one Path in [Trash Info]')
    const value = decodeURIComponent(paths[0]!)
    if (!isAbsolute(value) || value.includes('\0')) throw new Error('expected an absolute path without NUL')
    return normalizedAbsolute(value)
  } catch (error: unknown) {
    throw new FileManagerFilesystemError('invalid-path', record, `trash record "${record}" has an invalid original path`, { cause: error })
  }
}

function mapNodeError(error: unknown, path: string): FileManagerFilesystemError {
  if (error instanceof FileManagerFilesystemError) return error
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  if (code === 'ENOENT') return new FileManagerFilesystemError('not-found', path, `path "${path}" was not found`, { cause: error })
  if (code === 'ENOTDIR') return new FileManagerFilesystemError('not-directory', path, `path "${path}" is not a directory`, { cause: error })
  if (code === 'EISDIR') return new FileManagerFilesystemError('not-file', path, `path "${path}" is not a regular file`, { cause: error })
  if (code === 'EEXIST') return new FileManagerFilesystemError('already-exists', path, `path "${path}" already exists`, { cause: error })
  return new FileManagerFilesystemError('unavailable', path, `filesystem operation failed for "${path}"`, { cause: error })
}

/** Node filesystem owner for authenticated browser file-management operations. */
export class FileManagerFilesystem {
  readonly #trash: FileManagerTrash
  readonly #moveCommand: string
  readonly #trashLocations: FileManagerTrashLocations | undefined

  /** @param filesystem Shared canonical metadata provider. @param trash Recoverable-removal adapter. @param moveCommand GNU mv executable. @param trashLocations Provider home-trash resolver; unsupported platforms omit the scope. */
  constructor(private readonly filesystem: UserFileFilesystem, trash: FileManagerTrash, moveCommand: string, trashLocations?: FileManagerTrashLocations) {
    this.#trash = trash
    this.#moveCommand = moveCommand
    this.#trashLocations = trashLocations
  }

  /** List immediate children, following links for navigation identities but retaining link metadata. */
  async list(path: string, showHidden: boolean, signal: AbortSignal): Promise<FileManagerDirectory> {
    signal.throwIfAborted()
    const resolved = await this.filesystem.resolveExisting(path)
    if (resolved.kind !== 'directory') {
      throw new FileManagerFilesystemError('not-directory', resolved.path, `path "${resolved.path}" is not a directory`)
    }
    try {
      const rows = await readdir(resolved.path, { withFileTypes: true })
      const entries = await Promise.all(rows
        .filter(row => showHidden || !row.name.startsWith('.'))
        .map(async row => {
          signal.throwIfAborted()
          const child = join(resolved.path, row.name)
          const symbolicLink = row.isSymbolicLink()
          try {
            const metadata = await this.filesystem.resolveExisting(child)
            const canonicalPath = metadata.path
            const { kind, mediaType } = metadata
            return {
              name: row.name,
              path: child,
              canonicalPath,
              kind,
              symbolicLink,
              hidden: row.name.startsWith('.'),
              ...(kind === 'file' ? { size: metadata.size, modifiedAtMs: metadata.modifiedAtMs } : {}),
              ...(mediaType === undefined ? {} : { mediaType }),
            } satisfies FileManagerEntry
          } catch (error: unknown) {
            const code = typeof error === 'object' && error !== null && 'code' in error
              ? String((error as { code?: unknown }).code)
              : ''
            if (symbolicLink && (code === 'ENOENT' || code === 'not-found')) {
              return {
                name: row.name, path: child, canonicalPath: child, kind: 'missing', symbolicLink, hidden: row.name.startsWith('.'),
              } satisfies FileManagerEntry
            }
            throw error
          }
        }))
      entries.sort((left, right) => {
        const leftDirectory = left.kind === 'directory' ? 0 : 1
        const rightDirectory = right.kind === 'directory' ? 0 : 1
        return leftDirectory - rightDirectory || left.name.localeCompare(right.name)
      })
      const root = parse(resolved.path).root
      return {
        path: resolved.path,
        ...(resolved.path === root ? {} : { parent: dirname(resolved.path) }),
        entries,
      }
    } catch (error: unknown) {
      throw mapNodeError(error, resolved.path)
    }
  }

  /** Create one immediate child without replacing an existing path. */
  async create(parent: string, name: string, kind: 'file' | 'directory', signal: AbortSignal): Promise<FileManagerCreateResult> {
    const directory = await this.filesystem.resolveExisting(parent)
    if (directory.kind !== 'directory') {
      throw new FileManagerFilesystemError('not-directory', directory.path, `path "${directory.path}" is not a directory`)
    }
    if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || basename(name) !== name) {
      throw new FileManagerFilesystemError('invalid-path', name, 'new entry name must be one non-empty path segment')
    }
    const target = join(directory.path, name)
    return await this.filesystem.mutate(signal, async () => {
      try {
        if (kind === 'directory') await mkdir(target)
        else {
          const handle = await open(target, 'wx', 0o600)
          await handle.close()
        }
        return { path: target }
      } catch (error: unknown) {
        throw mapNodeError(error, target)
      }
    })
  }

  /** Rename with GNU mv's no-clobber operation; cross-filesystem copy/delete fallback is disabled. */
  async move(source: string, destination: string, signal: AbortSignal): Promise<{ path: string }> {
    const from = normalizedAbsolute(source)
    const to = normalizedAbsolute(destination)
    if (from === parse(from).root) {
      throw new FileManagerFilesystemError('root-delete', from, 'filesystem root cannot be moved')
    }
    return await this.filesystem.mutate(signal, async () => await this.#moveNoClobber(from, to))
  }

  /** Resolve the provider scope without creating directories. @returns Canonical locations, or undefined only for an unsupported or omitted resolver; other failures reject. */
  async trashPaths(): Promise<FileManagerTrashPaths | undefined> {
    if (this.#trashLocations === undefined) return undefined
    try {
      const locations = await this.#trashLocations()
      return {
        root: await canonicalLocation(normalizedAbsolute(locations.root)),
        files: await canonicalLocation(normalizedAbsolute(locations.files)),
        info: await canonicalLocation(normalizedAbsolute(locations.info)),
      }
    } catch (error: unknown) {
      if (error instanceof FileManagerFilesystemError && error.code === 'trash-unsupported') return undefined
      throw mapNodeError(error, '')
    }
  }

  /**
   * Restore an immediate trash-files child through the shared mutation queue.
   * @param path Trashed entry, retaining the final symbolic link itself.
   * @param signal Cancellation before publication starts.
   * @returns Original absolute path; move failures preserve the entry and record.
   */
  async restore(path: string, signal: AbortSignal): Promise<{ path: string }> {
    const input = normalizedAbsolute(path)
    return await this.filesystem.mutate(signal, async () => {
      const locations = await this.trashPaths()
      if (locations === undefined) throw new FileManagerFilesystemError('trash-unsupported', input, 'this platform has no browsable home trash to restore from')
      let target: string
      try { target = await entryPath(input) } catch (error: unknown) { throw mapNodeError(error, input) }
      if (dirname(target) !== locations.files) throw new FileManagerFilesystemError('invalid-path', input, `only entries directly inside "${locations.files}" carry a trash record`)
      const record = join(locations.info, `${basename(target)}.trashinfo`)
      let content: string
      try {
        const handle = await open(record, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        try {
          if (!(await handle.stat()).isFile()) throw new FileManagerFilesystemError('not-file', record, `trash record "${record}" is not a regular file`)
          content = new TextDecoder('utf-8', { fatal: true }).decode(await handle.readFile())
        } finally { await handle.close() }
      } catch (error: unknown) { throw mapNodeError(error, record) }
      const original = originalPathOf(content, record)
      let destination: string
      try { destination = await entryPath(original) } catch (error: unknown) { throw mapNodeError(error, original) }
      if (destination === locations.root || isInsideDirectory(locations.root, destination)) throw new FileManagerFilesystemError('invalid-path', record, 'the original path cannot be inside the trash')
      const moved = await this.#moveNoClobber(target, destination)
      await this.#removeRecord(record, `restored to "${destination}"`)
      return moved
    })
  }

  /** Remove one named path according to the configured recovery policy. */
  async remove(path: string, mode: FileManagerDeleteMode, confirmed: boolean, signal: AbortSignal): Promise<void> {
    const target = normalizedAbsolute(path)
    if (target === parse(target).root) {
      throw new FileManagerFilesystemError('root-delete', target, 'filesystem root cannot be removed')
    }
    if (mode === 'permanent' && !confirmed) {
      throw new FileManagerFilesystemError('confirmation-required', target, 'permanent deletion requires confirmation')
    }
    await this.filesystem.mutate(signal, async () => {
      const locations = await this.trashPaths()
      let addressed: string
      try { addressed = await entryPath(target) } catch (error: unknown) { throw mapNodeError(error, target) }
      if (locations !== undefined && [locations.root, locations.files, locations.info, join(locations.root, 'files'), join(locations.root, 'info')].includes(addressed)) {
        throw new FileManagerFilesystemError('invalid-path', target, `path "${target}" is a trash directory and cannot be removed`)
      }
      if (mode === 'trash' && locations !== undefined && isInsideDirectory(locations.root, addressed)) {
        throw new FileManagerFilesystemError('confirmation-required', target, `path "${target}" is already in the trash and can only be deleted permanently`)
      }
      try {
        const info = await lstat(target)
        if (mode === 'trash') {
          await this.#trash([target])
          return
        }
        if (info.isSymbolicLink() || !info.isDirectory()) await unlink(target)
        else await rm(target, { recursive: true })
        if (locations !== undefined && dirname(addressed) === locations.files) {
          await this.#removeRecord(join(locations.info, `${basename(addressed)}.trashinfo`), `permanently deleted "${target}"`)
        }
      } catch (error: unknown) {
        throw mapNodeError(error, target)
      }
    })
  }

  async #removeRecord(record: string, completed: string): Promise<void> {
    try { await unlink(record) } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw new FileManagerFilesystemError('unavailable', record, `entry ${completed}, but trash record "${record}" could not be removed`, { cause: error })
    }
  }

  async #moveNoClobber(from: string, to: string): Promise<{ path: string }> {
    try {
      await lstat(from)
      try {
        await lstat(to)
        throw new FileManagerFilesystemError('already-exists', to, `path "${to}" already exists`)
      } catch (error: unknown) {
        const code = typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : ''
        if (code !== 'ENOENT') throw error
      }
      let result: { stdout: string }
      try {
        result = await runFile(this.#moveCommand, [
          '--no-clobber', '--no-copy', '--no-target-directory', '--verbose', '--', from, to,
        ], { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key))) })
      } catch (error: unknown) {
        // GNU 9.2–9.4 reports a skipped destination with a nonzero exit status.
        if (error instanceof Error && 'code' in error && typeof error.code === 'number') {
          const occupied = await lstat(to).then(() => true, () => false)
          if (occupied) throw new FileManagerFilesystemError('already-exists', to, `path "${to}" already exists`, { cause: error })
        }
        throw new FileManagerFilesystemError('unavailable', from, `move command "${this.#moveCommand}" failed for "${from}"`, { cause: error })
      }
      if (result.stdout === '') {
        throw new FileManagerFilesystemError('already-exists', to, `path "${to}" already exists`)
      }
      return { path: to }
    } catch (error: unknown) {
      throw mapNodeError(error, from)
    }
  }

}
