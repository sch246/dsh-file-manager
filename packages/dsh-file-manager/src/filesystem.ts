import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  lstat, mkdir, open, readdir, rm, unlink,
} from 'node:fs/promises'
import { basename, dirname, join, parse } from 'node:path'
import { normalizedAbsolute, type UserFileFilesystem } from '@dsh-external/dsh-user-files'
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

const runFile = promisify(execFile)

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

  /** @param filesystem Shared canonical metadata provider. @param trash Recoverable-removal adapter. @param moveCommand GNU mv executable. */
  constructor(private readonly filesystem: UserFileFilesystem, trash: FileManagerTrash, moveCommand: string) {
    this.#trash = trash
    this.#moveCommand = moveCommand
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
    return await this.filesystem.mutate(signal, async () => {
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
        const result = await runFile(this.#moveCommand, [
          '--no-clobber', '--no-copy', '--no-target-directory', '--verbose', '--', from, to,
        ])
        if (result.stdout === '') {
          throw new FileManagerFilesystemError('already-exists', to, `path "${to}" already exists`)
        }
        return { path: to }
      } catch (error: unknown) {
        throw mapNodeError(error, from)
      }
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
      try {
        const info = await lstat(target)
        if (mode === 'trash') {
          await this.#trash([target])
          return
        }
        if (info.isSymbolicLink() || !info.isDirectory()) await unlink(target)
        else await rm(target, { recursive: true })
      } catch (error: unknown) {
        throw mapNodeError(error, target)
      }
    })
  }

}
