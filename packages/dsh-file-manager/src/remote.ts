import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  FileManagerFilesystem, FileManagerFilesystemError, resolveUserPath,
} from './filesystem.ts'
import type {
  FileManagerCreateRequest, FileManagerCreateResult, FileManagerDirectory,
  FileManagerInitialLocationRequest, FileManagerListRequest, FileManagerMetadata,
  FileManagerMoveRequest, FileManagerMoveResult, FileManagerPathRequest,
  FileManagerResolvedPath, FileManagerSaveRequest, FileManagerSaveResult,
  FileManagerTextDocument, FileManagerTrashRequest, FileManagerTrashResult,
  FileManagerVersionResult,
} from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The Session or addressed path does not exist. */
    'file-manager/not-found': { readonly path: string; readonly sessionId?: SessionId }
    /** The addressed path or child name is invalid. */
    'file-manager/invalid-path': { readonly path: string }
    /** The addressed path is not a directory. */
    'file-manager/not-directory': { readonly path: string }
    /** The addressed path is not a regular file. */
    'file-manager/not-file': { readonly path: string }
    /** The bounded file is not UTF-8 text. */
    'file-manager/not-text': { readonly path: string }
    /** The file exceeds the configured complete-text limit. */
    'file-manager/too-large': { readonly path: string; readonly maxReadBytes: number }
    /** A create or move destination already exists. */
    'file-manager/already-exists': { readonly path: string }
    /** The loaded revision is no longer current. */
    'file-manager/stale-version': { readonly path: string }
    /** Filesystem root cannot be moved or removed. */
    'file-manager/root-delete': { readonly path: string }
    /** Recoverable deletion did not carry the exact normalized path. */
    'file-manager/confirmation-mismatch': { readonly path: string }
    /** The operating system could not complete the filesystem operation. */
    'file-manager/unavailable': { readonly path: string }
  }
}

function cancelled(cause?: unknown): RemoteError<'gateway/cancelled'> {
  return new RemoteError('gateway/cancelled', 'file manager request was cancelled', {}, { cause })
}

/** Host Remote exposing user-authorized filesystem management without agent filesystem policy. */
export class FileManagerRemote extends TypertRemoteService {
  /** @param ctx - Host plugin context. @param filesystem - Node filesystem owner. @param metadata - Validated browser behavior. */
  constructor(
    ctx: Context,
    private readonly filesystem: FileManagerFilesystem,
    private readonly configMetadata: FileManagerMetadata,
  ) {
    super(ctx, 'fileManager', { namespace: 'fileManager' })
  }

  /** Return Host-owned size, polling and Chat routing configuration. */
  @Remote('metadata')
  metadata(): FileManagerMetadata {
    return this.configMetadata
  }

  /** Resolve the Session cwd used only as the first tree location. */
  @Remote('initialLocation')
  async initialLocation(
    request: FileManagerInitialLocationRequest,
    signal: AbortSignal,
  ): Promise<FileManagerResolvedPath> {
    return await this.guard(signal, async () => {
      const cwd = await this.cwdOf(request.sessionId, signal)
      return await this.filesystem.resolveExisting(cwd)
    })
  }

  /** Follow an existing absolute or Session-relative path to its canonical identity. */
  @Remote('resolve')
  async resolvePath(request: FileManagerPathRequest, signal: AbortSignal): Promise<FileManagerResolvedPath> {
    return await this.guard(signal, async () => {
      const path = await this.absolute(request, signal)
      return await this.filesystem.resolveExisting(path)
    })
  }

  /** List one directory with optional hidden entries. */
  @Remote('list')
  async list(request: FileManagerListRequest, signal: AbortSignal): Promise<FileManagerDirectory> {
    return await this.guard(signal, async () => {
      const path = await this.absolute(request, signal)
      return await this.filesystem.list(path, request.showHidden, signal)
    })
  }

  /** Read canonical LF text and its opaque guarded-write revision. */
  @Remote('readText')
  async readText(request: FileManagerPathRequest, signal: AbortSignal): Promise<FileManagerTextDocument> {
    return await this.guard(signal, async () => {
      const path = await this.absolute(request, signal)
      return await this.filesystem.readText(path, signal)
    })
  }

  /** Re-read the exact bounded revision for polling. */
  @Remote('version')
  async version(request: FileManagerPathRequest, signal: AbortSignal): Promise<FileManagerVersionResult> {
    return await this.guard(signal, async () => {
      const path = await this.absolute(request, signal)
      return await this.filesystem.version(path, signal)
    })
  }

  /** Publish text after staging and checking the loaded revision immediately before replacement. */
  @Remote('saveText')
  async saveText(request: FileManagerSaveRequest, signal: AbortSignal): Promise<FileManagerSaveResult> {
    return await this.guard(signal, async () => {
      const path = await this.absolute(request, signal)
      return await this.filesystem.saveText(path, request.text, request.version, signal)
    })
  }

  /** Create one empty file or directory without replacing an existing child. */
  @Remote('create')
  async create(request: FileManagerCreateRequest, signal: AbortSignal): Promise<FileManagerCreateResult> {
    return await this.guard(signal, async () => {
      signal.throwIfAborted()
      const parent = await this.absolute(request, signal)
      return await this.filesystem.create(parent, request.name, request.kind)
    })
  }

  /** Move one entry after refusing a destination that already exists. */
  @Remote('move')
  async move(request: FileManagerMoveRequest, signal: AbortSignal): Promise<FileManagerMoveResult> {
    return await this.guard(signal, async () => {
      signal.throwIfAborted()
      const [source, destination] = await Promise.all([
        this.absolute({ sessionId: request.sessionId, path: request.source }, signal),
        this.absolute({ sessionId: request.sessionId, path: request.destination }, signal),
      ])
      return await this.filesystem.move(source, destination)
    })
  }

  /** Move one entry to recoverable operating-system trash after exact-path confirmation. */
  @Remote('trash')
  async trash(request: FileManagerTrashRequest, signal: AbortSignal): Promise<FileManagerTrashResult> {
    return await this.guard(signal, async () => {
      signal.throwIfAborted()
      const path = await this.absolute(request, signal)
      await this.filesystem.moveToTrash(path, request.confirmation)
      return { trashed: true }
    })
  }

  private async absolute(request: FileManagerPathRequest, signal: AbortSignal): Promise<string> {
    if (isAbsolute(request.path)) return resolveUserPath(request.path, process.cwd())
    return resolveUserPath(request.path, await this.cwdOf(request.sessionId, signal))
  }

  private async cwdOf(sessionId: SessionId, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const live = this.ctx.sessions.get(sessionId)
    let header = live?.header
    if (header === undefined) {
      try {
        header = (await this.ctx.sessionPersistence.inspect(sessionId, signal)).meta
      } catch (error: unknown) {
        if (signal.aborted) throw cancelled(error)
        if (error instanceof SessionPersistenceNotFoundError) {
          throw new RemoteError('file-manager/not-found', `session "${sessionId}" was not found`, {
            sessionId,
            path: '',
          }, { cause: error })
        }
        throw new FileManagerFilesystemError(
          'unavailable', '', `session "${sessionId}" could not be inspected`, { cause: error },
        )
      }
    }
    return header.cwd ?? process.cwd()
  }

  private async guard<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    try {
      signal.throwIfAborted()
      return await operation()
    } catch (error: unknown) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw cancelled(error)
      if (!(error instanceof FileManagerFilesystemError)) throw error
      const details = error.code === 'too-large'
        ? { path: error.path, maxReadBytes: this.configMetadata.maxReadBytes }
        : { path: error.path }
      throw new RemoteError(`file-manager/${error.code}` as keyof import('@deepseek-ai/dsh-typert-protocol').RemoteErrorDetailsMap, error.message, details, { cause: error })
    }
  }
}
