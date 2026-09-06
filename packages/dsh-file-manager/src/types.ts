import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { UserFilePathRequest, UserFileEntryKind } from '@dsh-external/dsh-user-files/types'

/** Filesystem removal mode. */
export type FileManagerDeleteMode = 'trash' | 'permanent'

/** One child of a listed directory. */
export interface FileManagerEntry {
  readonly name: string
  readonly path: string
  readonly canonicalPath: string
  readonly kind: UserFileEntryKind
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
  readonly directoryPollIntervalMs: number
  readonly deleteMode: FileManagerDeleteMode
}

/** Request for a Session's initial directory. */
export interface FileManagerInitialLocationRequest { readonly sessionId: SessionId }

/** Directory listing request. */
export interface FileManagerListRequest extends UserFilePathRequest { readonly showHidden: boolean }

/** Exclusive child-creation request. */
export interface FileManagerCreateRequest extends UserFilePathRequest {
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
export interface FileManagerDeleteEntryRequest extends UserFilePathRequest {
  readonly mode: FileManagerDeleteMode
  readonly confirmed: boolean
}

/** Removal acknowledgement naming the completed mode. */
export interface FileManagerDeleteEntryResult { readonly mode: FileManagerDeleteMode }
