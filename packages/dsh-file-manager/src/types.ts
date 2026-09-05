import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Opaque revision produced by an exact bounded content and metadata read. */
export type FileManagerRevision = string

/** File kinds shown in the browser tree after following a symbolic link when possible. */
export type FileManagerEntryKind = 'file' | 'directory' | 'other' | 'missing'

/** One child of a listed directory. */
export interface FileManagerEntry {
  readonly name: string
  readonly path: string
  readonly canonicalPath: string
  readonly kind: FileManagerEntryKind
  readonly symbolicLink: boolean
  readonly hidden: boolean
}

/** Complete immediate-child listing for one canonical directory. */
export interface FileManagerDirectory {
  readonly path: string
  readonly parent?: string
  readonly entries: readonly FileManagerEntry[]
}

/** Host-owned browser behavior and polling configuration. */
export interface FileManagerMetadata {
  readonly maxReadBytes: number
  readonly pollIntervalMs: number
  readonly openMode: 'preview' | 'system' | 'preview-or-system'
}

/** Session-relative or absolute path request. */
export interface FileManagerPathRequest {
  readonly sessionId: SessionId
  readonly path: string
}

/** Request for a Session's initial directory. */
export interface FileManagerInitialLocationRequest { readonly sessionId: SessionId }

/** Resolved existing path and followed kind. */
export interface FileManagerResolvedPath {
  readonly path: string
  readonly kind: FileManagerEntryKind
}

/** Directory listing request. */
export interface FileManagerListRequest extends FileManagerPathRequest { readonly showHidden: boolean }

/** Canonical LF text and the opaque revision needed for a guarded save. */
export interface FileManagerTextDocument {
  readonly path: string
  readonly text: string
  readonly version: FileManagerRevision
}

/** Current exact revision, or absence after the path was removed. */
export interface FileManagerVersionResult {
  readonly path: string
  readonly version?: FileManagerRevision
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

/** Guarded text save request. */
export interface FileManagerSaveRequest extends FileManagerPathRequest {
  readonly text: string
  readonly version: FileManagerRevision
}

/** Successful guarded text save. */
export interface FileManagerSaveResult { readonly version: FileManagerRevision }

/** Current exact revision for polling, or absence after removal. */
export interface FileManagerVersionResult {
  readonly path: string
  readonly version?: FileManagerRevision
}

/** New immediate child request. */
export interface FileManagerCreateRequest extends FileManagerPathRequest {
  readonly name: string
  readonly kind: 'file' | 'directory'
}

/** Successful creation result. */
export interface FileManagerCreateResult { readonly path: string }

/** Move or rename request. */
export interface FileManagerMoveRequest {
  readonly sessionId: SessionId
  readonly source: string
  readonly destination: string
}

/** Successful move result. */
export interface FileManagerMoveResult { readonly path: string }

/** Recoverable removal request with exact-path confirmation. */
export interface FileManagerTrashRequest extends FileManagerPathRequest { readonly confirmation: string }

/** Recoverable removal acknowledgement. */
export interface FileManagerTrashResult { readonly trashed: true }
