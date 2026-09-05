import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  FileViewerClientService, FileViewerSourceId,
} from '@dsh-external/dsh-file-viewer/client'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import type {
  FileManagerDirectory, FileManagerEntry, FileManagerResolvedPath,
} from '../types.ts'

/** Plain Client adapter over generated Remote operations. */
export interface FileManagerGateway {
  initialLocation(sessionId: SessionId, signal: AbortSignal): Promise<FileManagerResolvedPath>
  resolve(sessionId: SessionId, path: string, signal: AbortSignal): Promise<FileManagerResolvedPath>
  list(sessionId: SessionId, path: string, showHidden: boolean, signal: AbortSignal): Promise<FileManagerDirectory>
  create(sessionId: SessionId, parent: string, name: string, kind: 'file' | 'directory', signal: AbortSignal): Promise<void>
  move(sessionId: SessionId, source: string, destination: string, signal: AbortSignal): Promise<void>
  trash(sessionId: SessionId, path: string, confirmation: string, signal: AbortSignal): Promise<void>
}

/** Viewer intent needed by tree file links. */
export type FileManagerViewer = Pick<FileViewerClientService, 'open'>

/** Immutable state for one Session file-tree instance. */
export interface FileManagerSnapshot {
  readonly instanceId: string
  readonly sessionId: SessionId
  readonly status: 'loading' | 'ready' | 'failed'
  readonly address: string
  readonly showHidden: boolean
  readonly directory?: FileManagerDirectory
  readonly expanded: Readonly<Record<string, FileManagerDirectory>>
  readonly selectedPath?: string
  readonly error?: string
}

interface RecordState {
  snapshot: FileManagerSnapshot
  readonly listeners: Set<() => void>
  generation: number
  controller?: AbortController
}

/** Accepted external selection for the `file-manager` launcher. */
export interface FileManagerSelection { readonly path: string }

/** Validate selector input before opening or changing tree state. */
export function parseFileManagerSelection(value: unknown): FileManagerSelection | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string' && value.trim() !== '') return { path: value }
  if (typeof value === 'object' && value !== null && 'path' in value
    && typeof (value as { path?: unknown }).path === 'string'
    && (value as { path: string }).path.trim() !== '') {
    return { path: (value as { path: string }).path }
  }
  throw new Error('file-manager: selection must be a non-empty path or { path }')
}

function parentOf(path: string): string {
  const separator = path.includes('\\') ? '\\' : '/'
  const withoutTrailing = path.endsWith(separator) && path.length > 1 ? path.slice(0, -1) : path
  const index = withoutTrailing.lastIndexOf(separator)
  if (index < 0) return withoutTrailing
  if (index === 0) return separator
  if (/^[A-Za-z]:$/.test(withoutTrailing.slice(0, index))) return `${withoutTrailing.slice(0, index)}${separator}`
  return withoutTrailing.slice(0, index)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function withoutError(snapshot: FileManagerSnapshot): Omit<FileManagerSnapshot, 'error'> {
  const { error: _error, ...rest } = snapshot
  return rest
}

/** Browser owner of tree instances, operations, and viewer routing. */
export class FileManagerService {
  readonly #gateway: FileManagerGateway
  readonly #sidebar: RightSidebarService
  readonly #viewer: FileManagerViewer
  readonly #sourceId: FileViewerSourceId
  readonly #title: () => string
  readonly #records = new Map<string, RecordState>()
  #disposed = false

  /** @param gateway - Filesystem operations. @param sidebar - Workbench instance host. @param viewer - Text viewer intent. @param sourceId - Filesystem source id. */
  constructor(
    gateway: FileManagerGateway,
    sidebar: RightSidebarService,
    viewer: FileManagerViewer,
    sourceId: FileViewerSourceId,
    title: () => string,
  ) {
    this.#gateway = gateway
    this.#sidebar = sidebar
    this.#viewer = viewer
    this.#sourceId = sourceId
    this.#title = title
  }

  /** Open or focus the Session tree and optionally select a path. */
  async open(sessionId: SessionId, rawSelection?: unknown): Promise<string> {
    this.#assertLive()
    const selection = parseFileManagerSelection(rawSelection)
    const instanceId = `file-manager-tree:${String(sessionId)}`
    let record = this.#records.get(instanceId)
    if (record === undefined) {
      record = {
        snapshot: {
          instanceId, sessionId, status: 'loading', address: selection?.path ?? '', showHidden: false, expanded: Object.freeze({}),
        },
        listeners: new Set(),
        generation: 0,
      }
      this.#records.set(instanceId, record)
      this.#sidebar.openInstance(sessionId, {
        id: instanceId,
        viewId: 'file-manager-tree',
        title: this.#title(),
        onClose: () => this.close(instanceId),
      })
      await this.#navigate(record, selection?.path)
    } else {
      this.#sidebar.activateInstance(sessionId, instanceId)
      if (selection !== undefined) await this.#navigate(record, selection.path)
    }
    return instanceId
  }

  /** Read one immutable tree snapshot. */
  snapshot(instanceId: string): FileManagerSnapshot { return this.#record(instanceId).snapshot }

  /** Subscribe to one tree instance. */
  subscribe(instanceId: string, listener: () => void): () => void {
    const listeners = this.#record(instanceId).listeners
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  /** Navigate the tree address, following files to their parent and selection. */
  async navigate(instanceId: string, path: string): Promise<void> {
    await this.#navigate(this.#record(instanceId), path)
  }

  /** Refresh the current directory and clear stale expanded snapshots. */
  async refresh(instanceId: string): Promise<void> {
    const record = this.#record(instanceId)
    await this.#loadDirectory(record, record.snapshot.address, record.snapshot.selectedPath)
  }

  /** Show or hide dot-prefixed entries and reload the current directory. */
  async setShowHidden(instanceId: string, showHidden: boolean): Promise<void> {
    const record = this.#record(instanceId)
    if (record.snapshot.showHidden === showHidden) return
    record.snapshot = { ...record.snapshot, showHidden, expanded: Object.freeze({}) }
    this.#notify(record)
    await this.#loadDirectory(record, record.snapshot.address, record.snapshot.selectedPath)
  }

  /** Expand a directory lazily, or collapse an already expanded row. */
  async toggleExpanded(instanceId: string, path: string): Promise<void> {
    const record = this.#record(instanceId)
    if (record.snapshot.expanded[path] !== undefined) {
      const expanded = { ...record.snapshot.expanded }
      delete expanded[path]
      record.snapshot = { ...record.snapshot, expanded: Object.freeze(expanded) }
      this.#notify(record)
      return
    }
    const operation = this.#begin(record)
    try {
      const directory = await this.#gateway.list(record.snapshot.sessionId, path, record.snapshot.showHidden, operation.signal)
      if (!this.#current(record, operation)) return
      record.snapshot = {
        ...withoutError(record.snapshot),
        expanded: Object.freeze({ ...record.snapshot.expanded, [directory.path]: directory }),
      }
      this.#notify(record)
    } catch (error: unknown) {
      this.#fail(record, operation, error)
    }
  }

  /** Route a file entry to the shared viewer's filesystem source. */
  async openFile(instanceId: string, entry: FileManagerEntry): Promise<void> {
    const record = this.#record(instanceId)
    if (entry.kind !== 'file') throw new Error('file-manager: only regular files can open in the text viewer')
    try {
      await this.#viewer.open({
        sessionId: record.snapshot.sessionId,
        sourceId: this.#sourceId,
        resourceId: entry.canonicalPath,
      })
    } catch (error: unknown) {
      record.snapshot = { ...record.snapshot, error: messageOf(error) }
      this.#notify(record)
    }
  }

  /** Create one empty child, then refresh the visible tree. */
  async create(instanceId: string, name: string, kind: 'file' | 'directory'): Promise<void> {
    const record = this.#record(instanceId)
    await this.#mutate(record, signal => this.#gateway.create(
      record.snapshot.sessionId, record.snapshot.address, name, kind, signal,
    ))
  }

  /** Move or rename one entry, refusing overwrite in the Host. */
  async move(instanceId: string, source: string, destination: string): Promise<void> {
    const record = this.#record(instanceId)
    await this.#mutate(record, signal => this.#gateway.move(record.snapshot.sessionId, source, destination, signal))
  }

  /** Move one entry to recoverable trash using the exact typed confirmation. */
  async trash(instanceId: string, path: string, confirmation: string): Promise<void> {
    const record = this.#record(instanceId)
    await this.#mutate(record, signal => this.#gateway.trash(record.snapshot.sessionId, path, confirmation, signal))
  }

  /** Clear the retained visible error. */
  clearError(instanceId: string): void {
    const record = this.#record(instanceId)
    if (record.snapshot.error === undefined) return
    const { error: _error, ...snapshot } = record.snapshot
    record.snapshot = snapshot
    this.#notify(record)
  }

  /** Close and forget one tree instance after aborting its active operation. */
  close(instanceId: string): boolean {
    const record = this.#records.get(instanceId)
    if (record === undefined) return true
    record.controller?.abort(new Error('file manager tree closed'))
    this.#records.delete(instanceId)
    record.listeners.clear()
    return true
  }

  /** Permanently stop every tree instance. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const id of [...this.#records.keys()]) this.close(id)
  }

  async #navigate(record: RecordState, path?: string): Promise<void> {
    const operation = this.#begin(record)
    record.snapshot = { ...withoutError(record.snapshot), status: 'loading', address: path ?? record.snapshot.address }
    this.#notify(record)
    try {
      const resolved = path === undefined
        ? await this.#gateway.initialLocation(record.snapshot.sessionId, operation.signal)
        : await this.#gateway.resolve(record.snapshot.sessionId, path, operation.signal)
      if (!this.#current(record, operation)) return
      const directory = resolved.kind === 'directory' ? resolved.path : parentOf(resolved.path)
      await this.#loadDirectory(record, directory, resolved.kind === 'file' ? resolved.path : undefined, operation)
    } catch (error: unknown) {
      this.#fail(record, operation, error)
    }
  }

  async #loadDirectory(
    record: RecordState,
    path: string,
    selectedPath?: string,
    existing?: AbortController,
  ): Promise<void> {
    const operation = existing ?? this.#begin(record)
    if (existing === undefined) {
      record.snapshot = { ...withoutError(record.snapshot), status: 'loading' }
      this.#notify(record)
    }
    try {
      const directory = await this.#gateway.list(
        record.snapshot.sessionId, path, record.snapshot.showHidden, operation.signal,
      )
      if (!this.#current(record, operation)) return
      const { selectedPath: _selectedPath, ...base } = withoutError(record.snapshot)
      record.snapshot = {
        ...base,
        status: 'ready',
        address: directory.path,
        directory,
        expanded: Object.freeze({}),
        ...(selectedPath === undefined ? {} : { selectedPath }),
      }
      this.#notify(record)
    } catch (error: unknown) {
      this.#fail(record, operation, error)
    }
  }

  async #mutate(record: RecordState, operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const controller = this.#begin(record)
    try {
      await operation(controller.signal)
      if (!this.#current(record, controller)) return
      await this.#loadDirectory(record, record.snapshot.address, undefined, controller)
    } catch (error: unknown) {
      this.#fail(record, controller, error)
    }
  }

  #begin(record: RecordState): AbortController {
    record.controller?.abort(new Error('file manager operation superseded'))
    record.generation += 1
    const controller = new AbortController()
    record.controller = controller
    return controller
  }

  #current(record: RecordState, controller: AbortController): boolean {
    return !this.#disposed && this.#records.get(record.snapshot.instanceId) === record
      && record.controller === controller && !controller.signal.aborted
  }

  #fail(record: RecordState, controller: AbortController, error: unknown): void {
    if (!this.#current(record, controller)) return
    record.snapshot = { ...record.snapshot, status: record.snapshot.directory === undefined ? 'failed' : 'ready', error: messageOf(error) }
    this.#notify(record)
  }

  #record(instanceId: string): RecordState {
    this.#assertLive()
    const record = this.#records.get(instanceId)
    if (record === undefined) throw new Error(`file-manager: unknown tree instance "${instanceId}"`)
    return record
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error('file-manager: service is disposed')
  }

  #notify(record: RecordState): void {
    for (const listener of [...record.listeners]) {
      try { listener() } catch { /* Subscriber exceptions cannot starve later listeners. */ }
    }
  }
}
