import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  FileViewerSourceId,
  type FileViewerDocumentRef,
  type FileViewerLoadedText,
  type FileViewerSource,
  type FileViewerWatchEvent,
} from '@dsh-external/dsh-file-viewer/client'
import type { FileManagerRevision, FileManagerTextDocument } from '../types.ts'

/** Filesystem-source operations implemented by the generated Remote adapter. */
export interface FilesystemSourceGateway {
  readText(sessionId: SessionId, path: string, signal: AbortSignal): Promise<FileManagerTextDocument>
  saveText(
    sessionId: SessionId,
    path: string,
    text: string,
    version: FileManagerRevision,
    signal: AbortSignal,
  ): Promise<{ version: FileManagerRevision }>
  openExternal?(sessionId: SessionId, path: string, signal: AbortSignal): Promise<void>
}

function refKey(ref: FileViewerDocumentRef): string {
  return JSON.stringify([ref.sessionId, ref.resourceId])
}

function pathSegments(path: string): readonly { readonly label: string; readonly selectionHint: { readonly path: string } }[] {
  const windows = /^[A-Za-z]:[\\/]/.test(path)
  const separator = windows ? '\\' : '/'
  const normalized = path.replaceAll(windows ? '/' : '\\', separator)
  const root = windows ? normalized.slice(0, 3) : normalized.startsWith('/') ? '/' : ''
  const rest = normalized.slice(root.length).split(separator).filter(Boolean)
  const segments: { label: string; selectionHint: { path: string } }[] = []
  let current = root
  if (root !== '') segments.push({ label: root, selectionHint: { path: root } })
  for (const part of rest) {
    current = current === '' || current.endsWith(separator) ? `${current}${part}` : `${current}${separator}${part}`
    segments.push({ label: part, selectionHint: { path: current } })
  }
  return segments
}

function loaded(document: FileManagerTextDocument): FileViewerLoadedText {
  const segments = pathSegments(document.path)
  return {
    text: document.text,
    version: document.version,
    title: segments.at(-1)?.label ?? document.path,
    location: {
      segments,
      selectorId: 'file-manager',
    },
  }
}

/** Viewer source backed by the authenticated user-filesystem Remote. */
export class FilesystemFileViewerSource implements FileViewerSource {
  readonly id = FileViewerSourceId('filesystem')
  readonly supportsConditionalSave = true
  readonly openExternal?: (ref: FileViewerDocumentRef, signal: AbortSignal) => Promise<void>
  readonly #gateway: FilesystemSourceGateway
  readonly #pollIntervalMs: number
  readonly #versions = new Map<string, unknown>()

  /** @param gateway - Remote and optional native-open operations. @param pollIntervalMs - Delay between completed polls. */
  constructor(gateway: FilesystemSourceGateway, pollIntervalMs: number) {
    this.#gateway = gateway
    this.#pollIntervalMs = pollIntervalMs
    if (gateway.openExternal !== undefined) {
      this.openExternal = async (ref, signal) => {
        await gateway.openExternal?.(ref.sessionId, ref.resourceId, signal)
      }
    }
  }

  /** Load canonical LF text and retain its revision for the first watch comparison. */
  async load(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<FileViewerLoadedText> {
    const document = await this.#gateway.readText(ref.sessionId, ref.resourceId, signal)
    this.#versions.set(refKey(ref), document.version)
    return loaded(document)
  }

  /** Publish text with the opaque revision supplied by the viewer. */
  async save(
    ref: FileViewerDocumentRef,
    text: string,
    version: unknown,
    signal: AbortSignal,
  ): Promise<{ version: FileManagerRevision }> {
    if (typeof version !== 'string' || version === '') throw new Error('file-manager: save requires a filesystem revision')
    const result = await this.#gateway.saveText(
      ref.sessionId,
      ref.resourceId,
      text,
      version as FileManagerRevision,
      signal,
    )
    this.#versions.set(refKey(ref), result.version)
    return result
  }

  /** Poll only while subscribed, never overlap reads, and stop after disposal. */
  watch(ref: FileViewerDocumentRef, listener: (event: FileViewerWatchEvent) => void): () => void {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastVersion = this.#versions.get(refKey(ref))
    const poll = async (): Promise<void> => {
      try {
        const document = await this.#gateway.readText(ref.sessionId, ref.resourceId, controller.signal)
        if (controller.signal.aborted) return
        if (document.version !== lastVersion) {
          lastVersion = document.version
          this.#versions.set(refKey(ref), document.version)
          listener({ kind: 'snapshot', snapshot: loaded(document) })
        }
      } catch {
        if (!controller.signal.aborted) listener({ kind: 'invalidate' })
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, this.#pollIntervalMs)
      }
    }
    timer = setTimeout(() => { void poll() }, this.#pollIntervalMs)
    return () => {
      controller.abort(new Error('filesystem source watch disposed'))
      if (timer !== undefined) clearTimeout(timer)
    }
  }

}
