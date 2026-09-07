import type { FileManagerTransfers } from './transfers.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ChatFileOpenRequest } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { UserFileResolvedPath } from '@dsh-external/dsh-user-files/types'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { readDeleteMode, saveDeleteMode, readManagerSwitch, saveManagerSwitch, type FileManagerPreferenceStorage } from './preferences.ts'
import type {
  FileManagerDeleteMode, FileManagerDirectory, FileManagerEntry,
} from '../types.ts'

/** Plain Client adapter over generated Remote operations. */
export interface FileManagerGateway {
  initialLocation(sessionId: SessionId, signal: AbortSignal): Promise<UserFileResolvedPath>
  trashLocation(sessionId: SessionId, signal: AbortSignal): Promise<UserFileResolvedPath>
  resolve(sessionId: SessionId, path: string, signal: AbortSignal): Promise<UserFileResolvedPath>
  list(sessionId: SessionId, path: string, showHidden: boolean, signal: AbortSignal): Promise<FileManagerDirectory>
  create(sessionId: SessionId, parent: string, name: string, kind: 'file' | 'directory', signal: AbortSignal): Promise<void>
  move(sessionId: SessionId, source: string, destination: string, signal: AbortSignal): Promise<void>
  restore(sessionId: SessionId, path: string, signal: AbortSignal): Promise<void>
  deleteEntry(sessionId: SessionId, path: string, mode: FileManagerDeleteMode, confirmed: boolean, signal: AbortSignal): Promise<void>
}

/** Identify the home trash root and descendants. @param path Listed canonical-parent path. @param trashDirectory Host trash files directory. @returns Whether deletion requires permanent confirmation. */
export function isInsideTrash(path: string, trashDirectory: string | undefined): boolean {
  if (!trashDirectory) return false
  const root = parentOf(trashDirectory)
  return path === root || path.startsWith(`${root}/`)
}

/** Identify entries eligible for restore. @param path Listed path. @param trashDirectory Host trash files directory. @returns Whether the path is a direct files child. */
export function isTrashRecord(path: string, trashDirectory: string | undefined): boolean {
  return trashDirectory !== undefined && path !== trashDirectory && parentOf(path) === trashDirectory
}

/** Generic resource-opening intent needed by tree file links. */
export interface FileManagerResourceOpener {
  open(request: ChatFileOpenRequest): Promise<void>
}

/** Immutable state for one Session file-tree instance. */
export interface FileManagerSnapshot {
  readonly instanceId: string
  readonly sessionId: SessionId
  readonly status: 'loading' | 'ready' | 'failed'
  readonly address: string
  readonly showHidden: boolean
  readonly filter: string
  readonly filterEnabled: boolean
  readonly deleteMode: FileManagerDeleteMode
  readonly directory?: FileManagerDirectory
  readonly expanded: Readonly<Record<string, FileManagerDirectory>>
  readonly refreshErrors: Readonly<Record<string, string>>
  readonly selectedPath?: string
  readonly trashDirectory?: string
  readonly error?: string
}

interface RecordState {
  snapshot: FileManagerSnapshot
  readonly listeners: Set<() => void>
  resourceOpenGeneration: number
  checkpointEnabled: boolean
  restoreCheckpoint?: string
  controller?: AbortController
  pollController?: AbortController
  pollTimer?: ReturnType<typeof setTimeout>
}

/** Accepted external selection for the `file-manager` launcher. */
export interface FileManagerSelection { readonly path: string }

/** JSON-safe tree state persisted by the sidebar workbench. */
export interface FileManagerRestoreDescriptor {
  readonly version: 2
  readonly address: string
  readonly filter: string
  readonly expanded: readonly string[]
  readonly selectedPath?: string
}

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

/** Decode v1 or v2 navigation state; legacy visibility cannot replace browser preferences. */
export function parseFileManagerRestoreDescriptor(value: unknown): FileManagerRestoreDescriptor {
  if (typeof value !== 'object' || value === null) {
    throw new Error('file-manager: restore descriptor must be an object')
  }
  const candidate = value as Partial<Omit<FileManagerRestoreDescriptor, 'version'>> & { version?: unknown }
  if ((candidate.version !== 1 && candidate.version !== 2) || typeof candidate.address !== 'string'
    || typeof candidate.filter !== 'string'
    || !Array.isArray(candidate.expanded) || !candidate.expanded.every(path => typeof path === 'string' && path !== '')
    || (candidate.selectedPath !== undefined && (typeof candidate.selectedPath !== 'string' || candidate.selectedPath === ''))) {
    throw new Error('file-manager: restore descriptor is invalid')
  }
  return {
    version: 2,
    address: candidate.address,
    filter: candidate.filter,
    expanded: [...new Set(candidate.expanded)],
    ...(candidate.selectedPath === undefined ? {} : { selectedPath: candidate.selectedPath }),
  }
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

function normalizedForMatch(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/u, '')
}

function relativeForMatch(root: string, path: string): string {
  const normalizedRoot = normalizedForMatch(root)
  const normalizedPath = normalizedForMatch(path)
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath
}

/** Return matching loaded rows and ancestors, or undefined when filtering is disabled or empty. */
export function filterLoadedTree(snapshot: FileManagerSnapshot): ReadonlySet<string> | undefined {
  const query = snapshot.filter.trim().toLocaleLowerCase()
  if (!snapshot.filterEnabled || query === '' || snapshot.directory === undefined) return undefined
  const visible = new Set<string>()
  const visited = new Set<string>()
  const visit = (directory: FileManagerDirectory): boolean => {
    if (visited.has(directory.path)) return false
    visited.add(directory.path)
    let directoryMatches = false
    for (const entry of directory.entries) {
      const child = entry.kind === 'directory' ? snapshot.expanded[entry.canonicalPath] : undefined
      const descendantMatches = child === undefined ? false : visit(child)
      const directMatch = entry.name.toLocaleLowerCase().includes(query)
        || relativeForMatch(snapshot.directory?.path ?? '', entry.path).toLocaleLowerCase().includes(query)
      if (directMatch || descendantMatches) {
        visible.add(entry.path)
        directoryMatches = true
      }
    }
    return directoryMatches
  }
  visit(snapshot.directory)
  return visible
}

function retainedExpanded(
  directory: FileManagerDirectory,
  expanded: Readonly<Record<string, FileManagerDirectory>>,
): Record<string, FileManagerDirectory> {
  const retained: Record<string, FileManagerDirectory> = {}
  const visited = new Set<string>()
  const visit = (parent: FileManagerDirectory): void => {
    if (visited.has(parent.path)) return
    visited.add(parent.path)
    for (const entry of parent.entries) {
      const child = expanded[entry.canonicalPath]
      if (entry.kind !== 'directory' || child === undefined) continue
      retained[entry.canonicalPath] = child
      visit(child)
    }
  }
  visit(directory)
  return retained
}

function forgetExpansion(
  path: string,
  expanded: Readonly<Record<string, FileManagerDirectory>>,
): Record<string, FileManagerDirectory> {
  const next = { ...expanded }
  const forget = (current: string): void => {
    const directory = next[current]
    delete next[current]
    if (directory === undefined) return
    for (const entry of directory.entries) {
      if (entry.kind === 'directory') forget(entry.canonicalPath)
    }
  }
  forget(path)
  return next
}

/** Browser owner of tree instances, directory polling, mutations, and resource routing. */
export class FileManagerService {
  readonly #gateway: FileManagerGateway
  readonly #sidebar: RightSidebarService
  readonly #resources: FileManagerResourceOpener
  readonly #title: () => string
  readonly #directoryPollIntervalMs: number
  readonly #trashDirectory: string | undefined
  #deleteMode: FileManagerDeleteMode
  #showHidden: boolean
  #filterEnabled: boolean
  readonly #preferenceStorage: FileManagerPreferenceStorage | undefined
  readonly #records = new Map<string, RecordState>()
  #disposed = false

  /** @param gateway - Filesystem operations. @param sidebar - Workbench instance host. @param resources - Generic resource opener. @param title - Localized tree title. @param directoryPollIntervalMs - Delay after each directory polling cycle. @param deleteMode - Initial deletion preference. @param preferenceStorage - Browser preference persistence, separate from tree restoration. @param trashDirectory Provider-resolved home trash files directory. @param transfers Browser transfer adapter when native opening is unavailable. */
  constructor(
    gateway: FileManagerGateway,
    sidebar: RightSidebarService,
    resources: FileManagerResourceOpener,
    title: () => string,
    directoryPollIntervalMs: number,
    deleteMode: FileManagerDeleteMode,
    preferenceStorage?: FileManagerPreferenceStorage,
    trashDirectory?: string,
    private readonly transfers?: FileManagerTransfers,
  ) {
    this.#gateway = gateway
    this.#sidebar = sidebar
    this.#resources = resources
    this.#title = title
    this.#directoryPollIntervalMs = directoryPollIntervalMs
    this.#trashDirectory = trashDirectory
    this.#preferenceStorage = preferenceStorage
    this.#deleteMode = preferenceStorage === undefined ? deleteMode : readDeleteMode(preferenceStorage, deleteMode)
    this.#showHidden = readManagerSwitch(preferenceStorage, 'show-hidden')
    this.#filterEnabled = readManagerSwitch(preferenceStorage, 'filter-enabled')
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
          instanceId,
          sessionId,
          status: 'loading',
          address: selection?.path ?? '',
          showHidden: this.#showHidden,
          filter: '',
          filterEnabled: this.#filterEnabled,
          deleteMode: this.#deleteMode,
          expanded: Object.freeze({}),
          refreshErrors: Object.freeze({}),
          ...(this.#trashDirectory === undefined ? {} : { trashDirectory: this.#trashDirectory }),
        },
        listeners: new Set(),
        resourceOpenGeneration: 0,
        checkpointEnabled: false,
      }
      this.#records.set(instanceId, record)
      try {
        await this.#sidebar.openInstance(sessionId, {
          id: instanceId,
          viewId: 'file-manager-tree',
          title: this.#title(),
          restoreDescriptor: this.#descriptor(record.snapshot),
          onClosed: () => { this.close(instanceId) },
        })
      } catch (error: unknown) {
        this.#records.delete(instanceId)
        record.listeners.clear()
        throw error
      }
      record.checkpointEnabled = true
      await this.#navigate(record, selection?.path)
    } else {
      this.#sidebar.activateInstance(sessionId, instanceId)
      if (selection !== undefined) await this.#navigate(record, selection.path)
    }
    return instanceId
  }

  /** Reconstruct one persisted tree without reopening or replacing its sidebar instance. */
  async restore(sessionId: SessionId, instanceId: string, rawDescriptor: unknown): Promise<void> {
    this.#assertLive()
    if (this.#records.has(instanceId)) throw new Error(`file-manager: tree instance "${instanceId}" already exists`)
    const descriptor = parseFileManagerRestoreDescriptor(rawDescriptor)
    const record: RecordState = {
      snapshot: {
        instanceId,
        sessionId,
        status: 'loading',
        address: descriptor.address,
        showHidden: this.#showHidden,
        filter: descriptor.filter,
        filterEnabled: this.#filterEnabled,
        deleteMode: this.#deleteMode,
        expanded: Object.freeze({}),
        refreshErrors: Object.freeze({}),
        ...(this.#trashDirectory === undefined ? {} : { trashDirectory: this.#trashDirectory }),
        ...(descriptor.selectedPath === undefined ? {} : { selectedPath: descriptor.selectedPath }),
      },
      listeners: new Set(),
      resourceOpenGeneration: 0,
      checkpointEnabled: false,
    }
    this.#records.set(instanceId, record)
    await this.#navigate(record, descriptor.address === '' ? undefined : descriptor.address)
    if (this.#records.get(instanceId) !== record) return
    if (record.snapshot.directory === undefined) {
      const message = record.snapshot.error ?? 'file-manager: persisted tree could not be restored'
      this.close(instanceId)
      throw new Error(message)
    }
    for (const path of descriptor.expanded) {
      if (this.#records.get(instanceId) !== record) return
      await this.toggleExpanded(instanceId, path)
    }
    if (this.#records.get(instanceId) !== record) return
    record.snapshot = {
      ...record.snapshot,
      filter: descriptor.filter,
      ...(descriptor.selectedPath === undefined ? {} : { selectedPath: descriptor.selectedPath }),
    }
    record.checkpointEnabled = true
    record.restoreCheckpoint = JSON.stringify(descriptor)
    this.#notify(record)
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

  /** Refresh every currently displayed directory without clearing expansion or selection. */
  async refresh(instanceId: string): Promise<void> {
    const record = this.#record(instanceId)
    const operation = this.#begin(record)
    await this.#refreshLoaded(record, operation.signal)
    this.#finish(record, operation)
  }

  /** Persist hidden-entry visibility for every tree and refresh their reachable loaded directories. */
  async setShowHidden(instanceId: string, showHidden: boolean): Promise<void> {
    this.#record(instanceId)
    if (this.#showHidden === showHidden) return
    this.#showHidden = showHidden
    saveManagerSwitch(this.#preferenceStorage, 'show-hidden', showHidden)
    await Promise.all([...this.#records.values()].map(async record => {
      record.snapshot = { ...record.snapshot, showHidden }
      this.#notify(record)
      if (this.#records.get(record.snapshot.instanceId) !== record) return
      if (record.snapshot.status === 'loading') await this.#navigate(record, record.snapshot.address || undefined)
      else await this.refresh(record.snapshot.instanceId)
    }))
  }

  /** Persist filter visibility for every tree while retaining each tree's query and selection. @param enabled - Whether queries filter loaded rows. */
  setFilterEnabled(enabled: boolean): void {
    this.#assertLive()
    this.#filterEnabled = enabled
    saveManagerSwitch(this.#preferenceStorage, 'filter-enabled', enabled)
    for (const record of this.#records.values()) {
      record.snapshot = { ...record.snapshot, filterEnabled: enabled }
      this.#notify(record)
    }
  }

  /** Navigate to the provider's actual trash directory, retaining the current tree on lookup failure. @param instanceId - Tree receiving navigation and visible lookup errors. @returns Completion of lookup and navigation. */
  async openTrash(instanceId: string): Promise<void> {
    const record = this.#record(instanceId)
    const operation = this.#begin(record)
    try {
      const location = await this.#gateway.trashLocation(record.snapshot.sessionId, operation.signal)
      if (!this.#current(record, operation)) return
      record.snapshot = { ...record.snapshot, trashDirectory: location.path }
      await this.#navigate(record, location.path)
    } catch (error: unknown) {
      this.#fail(record, operation, error)
    }
  }

  /** Apply an in-memory filter over names and relative paths in the loaded tree. */
  setFilter(instanceId: string, filter: string): void {
    const record = this.#record(instanceId)
    if (record.snapshot.filter === filter) return
    record.snapshot = { ...record.snapshot, filter }
    this.#checkpoint(record)
    this.#notify(record)
  }

  /** Change the browser-wide deletion preference for every current and future tree. */
  setDeleteMode(mode: FileManagerDeleteMode): void {
    this.#assertLive()
    this.#deleteMode = mode
    if (this.#preferenceStorage !== undefined) saveDeleteMode(this.#preferenceStorage, mode)
    for (const record of this.#records.values()) {
      record.snapshot = { ...record.snapshot, deleteMode: mode }
      this.#notify(record)
    }
  }

  /** Expand a directory lazily, or collapse it and its loaded descendants. */
  async toggleExpanded(instanceId: string, path: string): Promise<void> {
    const record = this.#record(instanceId)
    if (record.snapshot.expanded[path] !== undefined) {
      this.#stopPolling(record)
      const expanded = forgetExpansion(path, record.snapshot.expanded)
      const refreshErrors = Object.fromEntries(
        Object.entries(record.snapshot.refreshErrors).filter(([key]) => key in expanded || key === record.snapshot.address),
      )
      record.snapshot = {
        ...record.snapshot,
        expanded: Object.freeze(expanded),
        refreshErrors: Object.freeze(refreshErrors),
      }
      this.#checkpoint(record)
      this.#notify(record)
      this.#startPolling(record)
      return
    }
    const operation = this.#begin(record)
    try {
      const directory = await this.#gateway.list(
        record.snapshot.sessionId, path, record.snapshot.showHidden, operation.signal,
      )
      if (!this.#current(record, operation)) return
      record.snapshot = {
        ...withoutError(record.snapshot),
        expanded: Object.freeze({ ...record.snapshot.expanded, [path]: directory }),
      }
      this.#checkpoint(record)
      this.#notify(record)
    } catch (error: unknown) {
      this.#fail(record, operation, error)
      return
    }
    this.#finish(record, operation)
  }

  /** Open one file through the central handler router beside the tree. */
  async openFile(instanceId: string, entry: FileManagerEntry, preview = true): Promise<void> {
    const record = this.#record(instanceId)
    if (entry.kind !== 'file') throw new Error('file-manager: only regular files can open as resources')
    const generation = ++record.resourceOpenGeneration
    record.snapshot = {
      ...withoutError(record.snapshot),
      selectedPath: entry.path,
    }
    this.#checkpoint(record)
    this.#notify(record)
    try {
      await this.#resources.open({
        sessionId: record.snapshot.sessionId,
        path: entry.canonicalPath,
        target: { fromInstanceId: instanceId, direction: 'right' },
        preview,
      })
    } catch (error: unknown) {
      if (this.#records.get(instanceId) !== record || record.resourceOpenGeneration !== generation) return
      record.snapshot = { ...record.snapshot, error: messageOf(error) }
      this.#notify(record)
    }
  }

  /** Create one empty child, then refresh every visible listing. */
  async create(instanceId: string, name: string, kind: 'file' | 'directory'): Promise<void> {
    const record = this.#record(instanceId)
    await this.#mutate(record, signal => this.#gateway.create(
      record.snapshot.sessionId, record.snapshot.address, name, kind, signal,
    ))
  }

  /** Whether this runtime exposes browser file transfers. */
  get transfersAvailable(): boolean { return this.transfers !== undefined }

  /** Upload into the displayed root captured at selection/drop time; navigation and close cancel unfinished files. @param instanceId Destination tree. @param files Selected browser files. @returns Completion, with failures retained in the tree. */
  async upload(instanceId: string, files: readonly File[]): Promise<void> {
    const record = this.#record(instanceId)
    const directory = record.snapshot.directory?.path
    if (this.transfers === undefined || directory === undefined) return
    const transfers = this.transfers
    await this.#mutate(record, signal => transfers.upload(record.snapshot.sessionId, directory, files, signal))
  }

  /** Hand a regular-file download to the browser after an authenticated metadata check. @param instanceId Owning tree. @param path Visible file path. @returns Handoff completion; the browser owns subsequent progress and cancellation. */
  async download(instanceId: string, path: string): Promise<void> {
    const record = this.#record(instanceId)
    if (this.transfers === undefined) return
    const transfers = this.transfers
    await this.#mutate(record, signal => transfers.download(record.snapshot.sessionId, path, signal))
  }

  /** Whether a live tree can accept a drop without interrupting foreground work. @param instanceId Destination tree. @returns True only when browser transfers and its current directory are ready. */
  canUpload(instanceId: string): boolean {
    const record = this.#records.get(instanceId)
    return this.transfersAvailable && record !== undefined && record.controller === undefined
      && record.snapshot.status === 'ready' && record.snapshot.directory !== undefined
  }

  /** Retain a drop-dispatch failure while its tree remains open. @param instanceId Owning tree. @param error Failure reported by the optional dispatcher. */
  reportDropError(instanceId: string, error: unknown): void {
    const record = this.#records.get(instanceId)
    if (record === undefined) return
    record.snapshot = { ...record.snapshot, error: messageOf(error) }
    this.#notify(record)
  }

  /** Move or rename one entry, refusing overwrite in the Host. */
  async move(instanceId: string, source: string, destination: string): Promise<void> {
    const record = this.#record(instanceId)
    await this.#mutate(record, signal => this.#gateway.move(record.snapshot.sessionId, source, destination, signal))
  }

  /** Remove one path; the Host enforces root/link safeguards and permanent confirmation. */
  async remove(instanceId: string, path: string, mode: FileManagerDeleteMode, confirmed: boolean): Promise<void> {
    const record = this.#record(instanceId)
    await this.#mutate(record, signal => this.#gateway.deleteEntry(
      record.snapshot.sessionId, path, mode, confirmed, signal,
    ))
  }

  /** Return one trash entry to its recorded path and refresh the loaded listings. */
  async restoreFromTrash(instanceId: string, path: string): Promise<void> {
    const record = this.#record(instanceId)
    await this.#mutate(record, signal => this.#gateway.restore(record.snapshot.sessionId, path, signal))
  }

  /** Clear the retained operation error. */
  clearError(instanceId: string): void {
    const record = this.#record(instanceId)
    if (record.snapshot.error === undefined) return
    const { error: _error, ...snapshot } = record.snapshot
    record.snapshot = snapshot
    this.#notify(record)
  }

  /** Close and forget one tree instance after cancelling foreground and polling reads. */
  close(instanceId: string): boolean {
    const record = this.#records.get(instanceId)
    if (record === undefined) return true
    record.controller?.abort(new Error('file manager tree closed'))
    this.#stopPolling(record)
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
    record.snapshot = {
      ...withoutError(record.snapshot),
      status: 'loading',
      address: path ?? record.snapshot.address,
      refreshErrors: Object.freeze({}),
    }
    this.#notify(record)
    try {
      const resolved = path === undefined
        ? await this.#gateway.initialLocation(record.snapshot.sessionId, operation.signal)
        : await this.#gateway.resolve(record.snapshot.sessionId, path, operation.signal)
      if (!this.#current(record, operation)) return
      const directory = resolved.kind === 'directory' ? resolved.path : parentOf(resolved.path)
      const listing = await this.#gateway.list(
        record.snapshot.sessionId, directory, record.snapshot.showHidden, operation.signal,
      )
      if (!this.#current(record, operation)) return
      const { selectedPath: _selectedPath, ...base } = withoutError(record.snapshot)
      record.snapshot = {
        ...base,
        status: 'ready',
        address: listing.path,
        directory: listing,
        expanded: Object.freeze({}),
        refreshErrors: Object.freeze({}),
        ...(resolved.kind === 'file' ? { selectedPath: resolved.path } : {}),
      }
      this.#checkpoint(record)
      this.#notify(record)
    } catch (error: unknown) {
      this.#fail(record, operation, error)
      return
    }
    this.#finish(record, operation)
  }

  async #refreshLoaded(record: RecordState, signal: AbortSignal): Promise<void> {
    const currentDirectory = record.snapshot.directory
    if (currentDirectory === undefined) return
    const paths = [record.snapshot.address, ...Object.keys(record.snapshot.expanded)]
    let directory = currentDirectory
    let expanded = { ...record.snapshot.expanded }
    const refreshErrors = { ...record.snapshot.refreshErrors }
    for (const path of paths) {
      if (signal.aborted) return
      try {
        const listing = await this.#gateway.list(
          record.snapshot.sessionId, path, record.snapshot.showHidden, signal,
        )
        if (signal.aborted) return
        if (path === record.snapshot.address) directory = listing
        else if (record.snapshot.expanded[path] !== undefined) expanded[path] = listing
        delete refreshErrors[path]
      } catch (error: unknown) {
        if (signal.aborted) return
        refreshErrors[path] = messageOf(error)
      }
    }
    if (signal.aborted) return
    expanded = retainedExpanded(directory, expanded)
    const retainedErrors = Object.fromEntries(
      Object.entries(refreshErrors).filter(([path]) => path === directory.path || path in expanded),
    )
    record.snapshot = {
      ...record.snapshot,
      status: 'ready',
      address: directory.path,
      directory,
      expanded: Object.freeze(expanded),
      refreshErrors: Object.freeze(retainedErrors),
    }
    this.#checkpoint(record)
    this.#notify(record)
  }

  async #mutate(record: RecordState, operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const controller = this.#begin(record)
    try {
      await operation(controller.signal)
      if (!this.#current(record, controller)) return
      await this.#refreshLoaded(record, controller.signal)
      if (!this.#current(record, controller)) return
    } catch (error: unknown) {
      this.#fail(record, controller, error)
      return
    }
    this.#finish(record, controller)
  }

  #begin(record: RecordState): AbortController {
    this.#stopPolling(record)
    record.controller?.abort(new Error('file manager operation superseded'))
    const controller = new AbortController()
    record.controller = controller
    return controller
  }

  #finish(record: RecordState, controller: AbortController): void {
    if (!this.#current(record, controller)) return
    delete record.controller
    this.#startPolling(record)
  }

  #current(record: RecordState, controller: AbortController): boolean {
    return !this.#disposed && this.#records.get(record.snapshot.instanceId) === record
      && record.controller === controller && !controller.signal.aborted
  }

  #fail(record: RecordState, controller: AbortController, error: unknown): void {
    if (!this.#current(record, controller)) return
    record.snapshot = {
      ...record.snapshot,
      status: record.snapshot.directory === undefined ? 'failed' : 'ready',
      error: messageOf(error),
    }
    this.#notify(record)
    delete record.controller
    if (record.snapshot.directory !== undefined) this.#startPolling(record)
  }

  #startPolling(record: RecordState): void {
    if (this.#disposed || this.#records.get(record.snapshot.instanceId) !== record
      || record.snapshot.directory === undefined || record.pollController !== undefined) return
    const controller = new AbortController()
    record.pollController = controller
    const schedule = (): void => {
      if (controller.signal.aborted || record.pollController !== controller) return
      record.pollTimer = setTimeout(() => {
        delete record.pollTimer
        void poll()
      }, this.#directoryPollIntervalMs)
    }
    const poll = async (): Promise<void> => {
      await this.#refreshLoaded(record, controller.signal)
      if (!controller.signal.aborted && record.pollController === controller) schedule()
    }
    schedule()
  }

  #stopPolling(record: RecordState): void {
    record.pollController?.abort(new Error('file manager directory polling stopped'))
    delete record.pollController
    if (record.pollTimer !== undefined) clearTimeout(record.pollTimer)
    delete record.pollTimer
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

  #descriptor(snapshot: FileManagerSnapshot): FileManagerRestoreDescriptor {
    return {
      version: 2,
      address: snapshot.address,
      filter: snapshot.filter,
      expanded: Object.keys(snapshot.expanded),
      ...(snapshot.selectedPath === undefined ? {} : { selectedPath: snapshot.selectedPath }),
    }
  }

  #checkpoint(record: RecordState): void {
    if (!record.checkpointEnabled || this.#records.get(record.snapshot.instanceId) !== record) return
    const descriptor = this.#descriptor(record.snapshot)
    const encoded = JSON.stringify(descriptor)
    if (record.restoreCheckpoint === encoded) return
    this.#sidebar.updateInstance(record.snapshot.sessionId, record.snapshot.instanceId, { restoreDescriptor: descriptor })
    record.restoreCheckpoint = encoded
  }

  #notify(record: RecordState): void {
    for (const listener of [...record.listeners]) {
      try { listener() } catch { /* Subscriber exceptions cannot starve later listeners. */ }
    }
  }
}
