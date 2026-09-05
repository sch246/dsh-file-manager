import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Opaque revision produced by an exact bounded content and metadata read. */
export type FileManagerRevision = string

/** File kinds shown in the browser tree after following a symbolic link when possible. */
export type FileManagerEntryKind = 'file' | 'directory' | 'other' | 'missing'

/** Filesystem removal mode. */
export type FileManagerDeleteMode = 'trash' | 'permanent'

/** One child of a listed directory. */
export interface FileManagerEntry {
  readonly name: string
  readonly path: string
  readonly canonicalPath: string
  readonly kind: FileManagerEntryKind
  readonly symbolicLink: boolean
  readonly hidden: boolean
  readonly size?: number
  readonly modifiedAtMs?: number
  readonly mediaType?: string
}

/** Complete immediate-child listing for one canonical directory. */
export interface FileManagerDirectory {
  readonly path: string
  readonly parent?: string
  readonly entries: readonly FileManagerEntry[]
}

/** Host-owned browser behavior and polling configuration. */
export interface FileManagerMetadata {
  readonly maxResolveBatchSize: number
  readonly maxTextReadBytes: number
  readonly maxByteReadBytes: number
  readonly resourcePollIntervalMs: number
  readonly directoryPollIntervalMs: number
  readonly openMode: 'preview' | 'system' | 'preview-or-system'
  readonly deleteMode: FileManagerDeleteMode
}

/** Session-relative or absolute path request. */
export interface FileManagerPathRequest {
  readonly sessionId: SessionId
  readonly path: string
}

/** Metadata-only path batch, bounded by maxResolveBatchSize. */
export interface FileManagerResolveManyRequest {
  readonly sessionId: SessionId
  readonly paths: readonly string[]
}

/** One result per input path, preserving order and duplicate inputs. */
export type FileManagerResolveManyResult =
  | { readonly inputPath: string; readonly ok: true; readonly value: FileManagerResolvedPath }
  | { readonly inputPath: string; readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** Request for a Session's initial directory. */
export interface FileManagerInitialLocationRequest { readonly sessionId: SessionId }

/** Resolved existing path and followed kind. */
export interface FileManagerResolvedPath {
  readonly path: string
  readonly kind: FileManagerEntryKind
  readonly name: string
  readonly size?: number
  readonly modifiedAtMs?: number
  readonly mediaType?: string
}

/** Directory listing request. */
export interface FileManagerListRequest extends FileManagerPathRequest { readonly showHidden: boolean }

/** Canonical LF text and the opaque revision needed for a guarded save. */
export interface FileManagerTextDocument {
  readonly path: string
  readonly text: string
  readonly version: FileManagerRevision
}

/** Exact bounded bytes encoded for JSON transport with their opaque content revision. */
export interface FileManagerBytesDocument {
  readonly path: string
  readonly dataBase64: string
  readonly version: FileManagerRevision
}

/** Guarded byte-save request encoded for the JSON Remote transport. */
export interface FileManagerSaveBytesRequest extends FileManagerPathRequest {
  readonly dataBase64: string
  readonly version: FileManagerRevision
}

/** Guarded text-save request. */
export interface FileManagerSaveRequest extends FileManagerPathRequest {
  readonly text: string
  readonly version: FileManagerRevision
}

/** Opaque revision after a successful replacement. */
export interface FileManagerSaveResult { readonly version: FileManagerRevision }

/** Exclusive child-creation request. */
export interface FileManagerCreateRequest extends FileManagerPathRequest {
  readonly name: string
  readonly kind: 'file' | 'directory'
}

/** Created path. */
export interface FileManagerCreateResult { readonly path: string }

/** Non-overwriting move request. */
export interface FileManagerMoveRequest {
  readonly sessionId: SessionId
  readonly source: string
  readonly destination: string
}

/** Successful move result. */
export interface FileManagerMoveResult { readonly path: string }

/** Removal request; permanent deletion requires one confirmed browser action. */
export interface FileManagerDeleteEntryRequest extends FileManagerPathRequest {
  readonly mode: FileManagerDeleteMode
  readonly confirmed: boolean
}

/** Removal acknowledgement naming the completed mode. */
export interface FileManagerDeleteEntryResult { readonly mode: FileManagerDeleteMode }
