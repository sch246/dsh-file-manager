import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { UserFileFilesystemError } from '@dsh-external/dsh-user-files'
import type { UserFilePathRequest, UserFileResolvedPath } from '@dsh-external/dsh-user-files/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  FileManagerFilesystem, FileManagerFilesystemError,
} from './filesystem.ts'
import { homeTrashDirectory } from './trash.ts'
import type {
  FileManagerCreateRequest, FileManagerCreateResult, FileManagerDirectory,
  FileManagerDeleteEntryRequest, FileManagerDeleteEntryResult,
  FileManagerInitialLocationRequest, FileManagerListRequest, FileManagerMetadata,
  FileManagerMoveRequest, FileManagerMoveResult,
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
    /** A create or move destination already exists. */
    'file-manager/already-exists': { readonly path: string }
    /** Filesystem root cannot be moved or removed. */
    'file-manager/root-delete': { readonly path: string }
    /** Permanent deletion did not carry browser confirmation. */
    'file-manager/confirmation-required': { readonly path: string }
    /** The trash provider has no supported browser directory on this platform. */
    'file-manager/trash-unsupported': { readonly path: string }
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

  /** Return Host polling, deletion preference and canonical trash scope. @returns Metadata; trash resolver failures reject. */
  @Remote('metadata')
  async metadata(): Promise<FileManagerMetadata> {
    return await this.guard(new AbortController().signal, async () => {
      const locations = await this.filesystem.trashPaths()
      return { ...this.configMetadata, ...(locations === undefined ? {} : { trashDirectory: locations.files }) }
    })
  }

  /**
   * Locate the Linux provider's home trash files directory without creating it.
   * @param request - Session making the authenticated user request.
   * @param signal - Request cancellation.
   * @returns Existing canonical directory; rejects unsupported platforms or an absent/inaccessible directory.
   */
  @Remote('trashLocation')
  async trashLocation(request: FileManagerInitialLocationRequest, signal: AbortSignal): Promise<UserFileResolvedPath> {
    return await this.guard(signal, async () => {
      await this.ctx.userFiles.cwdOf(request.sessionId, signal)
      const path = await homeTrashDirectory()
      signal.throwIfAborted()
      let resolved: UserFileResolvedPath
      try {
        resolved = await this.ctx.userFiles.filesystem.resolveExisting(path)
      } catch (error: unknown) {
        if (error instanceof UserFileFilesystemError && error.code === 'not-found') {
          throw new FileManagerFilesystemError('not-found', path, 'The home trash directory has not been created; there is no directory to browse.', { cause: error })
        }
        throw error
      }
      signal.throwIfAborted()
      if (resolved.kind !== 'directory') throw new FileManagerFilesystemError('not-directory', path, 'The home trash files path is not a directory.')
      return resolved
    })
  }

  /** Resolve the Session cwd used only as the first tree location. */
  @Remote('initialLocation')
  async initialLocation(
    request: FileManagerInitialLocationRequest,
    signal: AbortSignal,
  ): Promise<UserFileResolvedPath> {
    return await this.guard(signal, async () => {
      const cwd = await this.ctx.userFiles.cwdOf(request.sessionId, signal)
      return await this.ctx.userFiles.filesystem.resolveExisting(cwd)
    })
  }

  /** List one directory with optional hidden entries. */
  @Remote('list')
  async list(request: FileManagerListRequest, signal: AbortSignal): Promise<FileManagerDirectory> {
    return await this.guard(signal, async () => {
      const path = await this.ctx.userFiles.absolute(request, signal)
      return await this.filesystem.list(path, request.showHidden, signal)
    })
  }

  /** Create one empty file or directory without replacing an existing child. */
  @Remote('create')
  async create(request: FileManagerCreateRequest, signal: AbortSignal): Promise<FileManagerCreateResult> {
    return await this.guard(signal, async () => {
      signal.throwIfAborted()
      const parent = await this.ctx.userFiles.absolute(request, signal)
      return await this.filesystem.create(parent, request.name, request.kind, signal)
    })
  }

  /** Move one entry after refusing a destination that already exists. */
  @Remote('move')
  async move(request: FileManagerMoveRequest, signal: AbortSignal): Promise<FileManagerMoveResult> {
    return await this.guard(signal, async () => {
      signal.throwIfAborted()
      const [source, destination] = await Promise.all([
        this.ctx.userFiles.absolute({ sessionId: request.sessionId, path: request.source }, signal),
        this.ctx.userFiles.absolute({ sessionId: request.sessionId, path: request.destination }, signal),
      ])
      return await this.filesystem.move(source, destination, signal)
    })
  }

  /** Restore one direct trash-files child without replacing its original destination. @param request Session and visible trashed path. @param signal Request cancellation. @returns Restored path; invalid records and occupied destinations reject without deleting the trash entry. */
  @Remote('restore')
  async restore(request: UserFilePathRequest, signal: AbortSignal): Promise<FileManagerMoveResult> {
    return await this.guard(signal, async () => {
      const path = await this.ctx.userFiles.absolute(request, signal)
      return await this.filesystem.restore(path, signal)
    })
  }

  /** Apply the requested recoverable or confirmed permanent removal behavior. */
  @Remote('deleteEntry')
  async deleteEntry(request: FileManagerDeleteEntryRequest, signal: AbortSignal): Promise<FileManagerDeleteEntryResult> {
    return await this.guard(signal, async () => {
      signal.throwIfAborted()
      const path = await this.ctx.userFiles.absolute(request, signal)
      await this.filesystem.remove(path, request.mode, request.confirmed, signal)
      return { mode: request.mode }
    })
  }

  private async guard<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    try {
      signal.throwIfAborted()
      return await operation()
    } catch (error: unknown) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw cancelled(error)
      if (!(error instanceof FileManagerFilesystemError) && !(error instanceof UserFileFilesystemError)) throw error
      const details = { path: error.path }
      throw new RemoteError(`file-manager/${error.code}` as keyof import('@deepseek-ai/dsh-typert-protocol').RemoteErrorDetailsMap, error.message, details, { cause: error })
    }
  }
}
