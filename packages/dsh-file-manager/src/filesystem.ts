import { createHash, randomBytes } from 'node:crypto'
import type { Stats } from 'node:fs'
import {
  lstat, mkdir, open, readdir, realpath, rename, rm, stat,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, parse, resolve, sep } from 'node:path'
import type {
  FileManagerCreateResult, FileManagerDirectory, FileManagerEntry, FileManagerEntryKind,
  FileManagerRevision, FileManagerSaveResult, FileManagerTextDocument, FileManagerVersionResult,
} from './types.ts'

/** Stable filesystem-manager failures translated by the Host Remote. */
export type FileManagerFilesystemErrorCode =
  | 'invalid-path'
  | 'not-found'
  | 'not-directory'
  | 'not-file'
  | 'not-text'
  | 'too-large'
  | 'already-exists'
  | 'stale-version'
  | 'root-delete'
  | 'confirmation-mismatch'
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

interface ExactStat {
  readonly dev: number
  readonly ino: number
  readonly size: number
  readonly mode: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

interface RevisionPayload {
  readonly format: 1
  readonly path: string
  readonly stat: ExactStat
  readonly sha256: string
  readonly eol: 'none' | 'lf' | 'crlf' | 'cr' | 'mixed'
  readonly mixedEolPattern?: string
}

interface ReadBytesResult {
  readonly path: string
  readonly bytes: Uint8Array
  readonly payload: RevisionPayload
}

/** Recoverable-removal adapter used by production and fixture-local tests. */
export type FileManagerTrash = (paths: readonly string[]) => Promise<void>

function normalizedAbsolute(path: string): string {
  if (path.trim() === '' || !isAbsolute(path)) {
    throw new FileManagerFilesystemError('invalid-path', path, 'file-manager requires an absolute path')
  }
  return normalize(resolve(path))
}

function exactStat(value: Stats): ExactStat {
  return {
    dev: value.dev,
    ino: value.ino,
    size: value.size,
    mode: value.mode,
    mtimeMs: value.mtimeMs,
    ctimeMs: value.ctimeMs,
  }
}

function sameStat(left: ExactStat, right: ExactStat): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mode === right.mode && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function encodeRevision(payload: RevisionPayload): FileManagerRevision {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function parseRevision(value: FileManagerRevision, path: string): RevisionPayload {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    const candidate = parsed as Partial<RevisionPayload>
    const revisionStat = candidate.stat as Partial<ExactStat> | null | undefined
    const statFields = revisionStat === null || revisionStat === undefined
      ? []
      : [revisionStat.dev, revisionStat.ino, revisionStat.size, revisionStat.mode, revisionStat.mtimeMs, revisionStat.ctimeMs]
    const validEol = candidate.eol === 'none' || candidate.eol === 'lf' || candidate.eol === 'crlf'
      || candidate.eol === 'cr' || candidate.eol === 'mixed'
    if (candidate.format !== 1 || typeof candidate.path !== 'string'
      || !/^[a-f\d]{64}$/u.test(candidate.sha256 ?? '')
      || statFields.length !== 6 || !statFields.every(field => typeof field === 'number' && Number.isFinite(field))
      || !validEol
      || (candidate.eol === 'mixed' && (typeof candidate.mixedEolPattern !== 'string'
        || !/^[wrl]+$/u.test(candidate.mixedEolPattern)))) {
      throw new Error('missing revision fields')
    }
    return candidate as RevisionPayload
  } catch (error: unknown) {
    throw new FileManagerFilesystemError(
      'stale-version', path, `filesystem revision for "${path}" is invalid`, { cause: error },
    )
  }
}

function eolMetadata(text: string): Pick<RevisionPayload, 'eol' | 'mixedEolPattern'> {
  const endings = text.match(/\r\n|\r|\n/g) ?? []
  if (endings.length === 0) return { eol: 'none' }
  const symbols = endings.map(value => value === '\r\n' ? 'w' : value === '\r' ? 'r' : 'l')
  const first = symbols[0]
  if (symbols.every(value => value === first)) {
    return { eol: first === 'w' ? 'crlf' : first === 'r' ? 'cr' : 'lf' }
  }
  return { eol: 'mixed', mixedEolPattern: symbols.join('') }
}

function canonicalText(text: string): string {
  return text.replace(/\r\n|\r/g, '\n')
}

function restoreEol(text: string, revision: RevisionPayload): string {
  if (revision.eol === 'none' || revision.eol === 'lf') return text
  if (revision.eol === 'crlf') return text.replaceAll('\n', '\r\n')
  if (revision.eol === 'cr') return text.replaceAll('\n', '\r')
  const pattern = revision.mixedEolPattern ?? ''
  let index = 0
  return text.replaceAll('\n', () => {
    const symbol = pattern[index++] ?? pattern.at(-1) ?? 'l'
    return symbol === 'w' ? '\r\n' : symbol === 'r' ? '\r' : '\n'
  })
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

function entryKind(value: Stats): FileManagerEntryKind {
  if (value.isDirectory()) return 'directory'
  if (value.isFile()) return 'file'
  return 'other'
}

/** Node filesystem owner for authenticated browser file-management operations. */
export class FileManagerFilesystem {
  readonly #maxReadBytes: number
  readonly #trash: FileManagerTrash
  readonly #writes = new Map<string, Promise<void>>()
  #mutationTail: Promise<void> = Promise.resolve()

  /** @param maxReadBytes - Inclusive complete-read and save byte bound. @param trash - Recoverable-removal adapter. */
  constructor(maxReadBytes: number, trash: FileManagerTrash) {
    this.#maxReadBytes = maxReadBytes
    this.#trash = trash
  }

  /** Follow one existing path to its stable canonical identity and kind. */
  async resolveExisting(path: string): Promise<{ path: string; kind: FileManagerEntryKind }> {
    const input = normalizedAbsolute(path)
    try {
      const canonical = await realpath(input)
      const info = await stat(canonical)
      return { path: canonical, kind: entryKind(info) }
    } catch (error: unknown) {
      throw mapNodeError(error, input)
    }
  }

  /** List immediate children, following links for navigation identities but retaining link metadata. */
  async list(path: string, showHidden: boolean, signal: AbortSignal): Promise<FileManagerDirectory> {
    signal.throwIfAborted()
    const resolved = await this.resolveExisting(path)
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
            const canonicalPath = await realpath(child)
            const info = await stat(canonicalPath)
            return {
              name: row.name,
              path: child,
              canonicalPath,
              kind: entryKind(info),
              symbolicLink,
              hidden: row.name.startsWith('.'),
            } satisfies FileManagerEntry
          } catch (error: unknown) {
            const code = typeof error === 'object' && error !== null && 'code' in error
              ? String((error as { code?: unknown }).code)
              : ''
            if (symbolicLink && code === 'ENOENT') {
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

  /** Load a complete UTF-8 regular file as canonical LF text and an exact opaque revision. */
  async readText(path: string, signal: AbortSignal): Promise<FileManagerTextDocument> {
    const result = await this.#readBytes(path, signal)
    let decoded: string
    if (result.bytes.includes(0)) {
      throw new FileManagerFilesystemError('not-text', result.path, `path "${result.path}" contains NUL bytes`)
    }
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)
    } catch (error: unknown) {
      throw new FileManagerFilesystemError('not-text', result.path, `path "${result.path}" is not UTF-8 text`, { cause: error })
    }
    const metadata = eolMetadata(decoded)
    const payload: RevisionPayload = { ...result.payload, ...metadata }
    return { path: result.path, text: canonicalText(decoded), version: encodeRevision(payload) }
  }

  /** Read the exact bounded content revision used by source polling. */
  async version(path: string, signal: AbortSignal): Promise<FileManagerVersionResult> {
    const input = normalizedAbsolute(path)
    try {
      const result = await this.#readBytes(input, signal)
      return { path: result.path, version: encodeRevision(result.payload) }
    } catch (error: unknown) {
      const mapped = mapNodeError(error, input)
      if (mapped.code === 'not-found') return { path: input }
      throw mapped
    }
  }

  /** Stage and atomically replace text after the last exact revision check. */
  async saveText(
    path: string,
    text: string,
    version: FileManagerRevision,
    signal: AbortSignal,
  ): Promise<FileManagerSaveResult> {
    const canonical = (await this.resolveExisting(path)).path
    return await this.#exclusiveWrite(canonical, async () => {
      signal.throwIfAborted()
      const expected = parseRevision(version, canonical)
      if (expected.path !== canonical) {
        throw new FileManagerFilesystemError('stale-version', canonical, `filesystem revision belongs to "${expected.path}"`)
      }
      const bytes = new TextEncoder().encode(restoreEol(text, expected))
      if (bytes.byteLength > this.#maxReadBytes) {
        throw new FileManagerFilesystemError('too-large', canonical, `path "${canonical}" exceeds the configured text limit`)
      }
      const stage = join(dirname(canonical), `.${basename(canonical)}.dsh-stage-${randomBytes(12).toString('hex')}`)
      let staged = false
      try {
        const handle = await open(stage, 'wx', expected.stat.mode & 0o777)
        staged = true
        try {
          await handle.chmod(expected.stat.mode & 0o7777)
          await handle.writeFile(bytes)
          await handle.sync()
        } finally {
          await handle.close()
        }
        const current = await this.#readBytes(canonical, signal)
        if (!sameStat(current.payload.stat, expected.stat) || current.payload.sha256 !== expected.sha256) {
          throw new FileManagerFilesystemError('stale-version', canonical, `path "${canonical}" changed after it was loaded`)
        }
        signal.throwIfAborted()
        await rename(stage, canonical)
        staged = false
        // Publication is terminal: cancellation after rename must not report that the save did not happen.
        const saved = await this.#readBytes(canonical, new AbortController().signal)
        const savedText = new TextDecoder('utf-8', { fatal: true }).decode(saved.bytes)
        return { version: encodeRevision({ ...saved.payload, ...eolMetadata(savedText) }) }
      } catch (error: unknown) {
        throw mapNodeError(error, canonical)
      } finally {
        if (staged) {
          try { await rm(stage, { force: true }) } catch { /* A failed stage cleanup cannot replace the primary failure. */ }
        }
      }
    })
  }

  /** Create one immediate child without replacing an existing path. */
  async create(parent: string, name: string, kind: 'file' | 'directory'): Promise<FileManagerCreateResult> {
    const directory = await this.resolveExisting(parent)
    if (directory.kind !== 'directory') {
      throw new FileManagerFilesystemError('not-directory', directory.path, `path "${directory.path}" is not a directory`)
    }
    if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || basename(name) !== name) {
      throw new FileManagerFilesystemError('invalid-path', name, 'new entry name must be one non-empty path segment')
    }
    const target = join(directory.path, name)
    return await this.#exclusiveMutation(async () => {
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

  /** Move or rename one path after refusing an existing destination. */
  async move(source: string, destination: string): Promise<{ path: string }> {
    const from = normalizedAbsolute(source)
    const to = normalizedAbsolute(destination)
    if (from === parse(from).root) {
      throw new FileManagerFilesystemError('root-delete', from, 'filesystem root cannot be moved')
    }
    return await this.#exclusiveMutation(async () => {
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
        await rename(from, to)
        return { path: to }
      } catch (error: unknown) {
        throw mapNodeError(error, from)
      }
    })
  }

  /** Move one file, link, or directory to the operating system's recoverable trash. */
  async moveToTrash(path: string, confirmation: string): Promise<void> {
    const target = normalizedAbsolute(path)
    if (target === parse(target).root) {
      throw new FileManagerFilesystemError('root-delete', target, 'filesystem root cannot be removed')
    }
    if (confirmation !== target) {
      throw new FileManagerFilesystemError('confirmation-mismatch', target, 'delete confirmation must exactly match the normalized path')
    }
    await this.#exclusiveMutation(async () => {
      try {
        await lstat(target)
        await this.#trash([target])
      } catch (error: unknown) {
        throw mapNodeError(error, target)
      }
    })
  }

  async #readBytes(path: string, signal: AbortSignal): Promise<ReadBytesResult> {
    signal.throwIfAborted()
    const input = normalizedAbsolute(path)
    try {
      const canonical = await realpath(input)
      const handle = await open(canonical, 'r')
      try {
        const beforeValue = await handle.stat()
        if (!beforeValue.isFile()) {
          throw new FileManagerFilesystemError('not-file', canonical, `path "${canonical}" is not a regular file`)
        }
        if (beforeValue.size > this.#maxReadBytes) {
          throw new FileManagerFilesystemError('too-large', canonical, `path "${canonical}" exceeds the configured text limit`)
        }
        signal.throwIfAborted()
        const bytes = await handle.readFile()
        signal.throwIfAborted()
        const afterValue = await handle.stat()
        const before = exactStat(beforeValue)
        const after = exactStat(afterValue)
        if (!sameStat(before, after) || bytes.byteLength !== before.size) {
          throw new FileManagerFilesystemError('stale-version', canonical, `path "${canonical}" changed while it was read`)
        }
        return {
          path: canonical,
          bytes,
          payload: { format: 1, path: canonical, stat: before, sha256: sha256(bytes), eol: 'none' },
        }
      } finally {
        await handle.close()
      }
    } catch (error: unknown) {
      throw mapNodeError(error, input)
    }
  }

  async #exclusiveWrite<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const predecessor = this.#writes.get(path) ?? Promise.resolve()
    let release = (): void => {}
    const ticket = new Promise<void>(resolveTicket => { release = resolveTicket })
    const tail = predecessor.then(() => ticket)
    this.#writes.set(path, tail)
    await predecessor
    try {
      return await operation()
    } finally {
      release()
      if (this.#writes.get(path) === tail) this.#writes.delete(path)
    }
  }

  async #exclusiveMutation<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this.#mutationTail
    let release = (): void => {}
    const ticket = new Promise<void>(resolveTicket => { release = resolveTicket })
    this.#mutationTail = predecessor.then(() => ticket)
    await predecessor
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

/** Resolve a Session-relative user path without imposing workspace containment. */
export function resolveUserPath(path: string, cwd: string): string {
  if (path.trim() === '') throw new FileManagerFilesystemError('invalid-path', path, 'path must not be empty')
  return isAbsolute(path) ? normalize(resolve(path)) : normalize(resolve(cwd, path.split('/').join(sep)))
}
