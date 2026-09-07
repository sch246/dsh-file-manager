import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from 'react'
import type { FileManagerDeleteMode, FileManagerDirectory, FileManagerEntry } from '../types.ts'
import type { FileManagerLocaleKey } from './locales.ts'
import {
  filterLoadedTree, isInsideTrash, isTrashRecord,
  type FileManagerService, type FileManagerSnapshot,
} from './service.ts'

/** Actions and observable state injected for one tree instance. */
export interface FileManagerPanelInjected {
  readonly manager: FileManagerService
  prompt(message: string, initial?: string): string | null
  confirm(message: string): boolean
  t(key: FileManagerLocaleKey): string
}

/** Right-sidebar owner props combined with the injected feature face. */
export type FileManagerPanelProps = FileManagerPanelInjected & { readonly instanceId: string }

interface FileManagerPanelActions extends FileManagerPanelInjected {
  snapshot(): FileManagerSnapshot
  subscribe(listener: () => void): () => void
  navigate(path: string): void
  refresh(): void
  setShowHidden(show: boolean): void
  setDeleteMode(mode: FileManagerDeleteMode): void
  setFilter(filter: string): void
  setFilterEnabled(enabled: boolean): void
  openTrash(): void
  toggleExpanded(path: string): void
  openFile(entry: FileManagerEntry, preview: boolean): void
  create(name: string, kind: 'file' | 'directory'): void
  move(source: string, destination: string): void
  remove(path: string, mode: FileManagerDeleteMode, confirmed: boolean): void
  restore(path: string): void
  download(path: string): void
  clearError(): void
}

/** Require one ordinary confirmation only for configured permanent deletion. */
export function confirmFileManagerRemoval(
  mode: FileManagerDeleteMode,
  path: string,
  confirm: (message: string) => boolean,
  permanentMessage: string,
): boolean {
  return mode === 'trash' || confirm(`${permanentMessage}\n${path}`)
}

/** Select confirmed permanent deletion throughout home trash. @param preference Browser deletion preference. @param path Visible entry path. @param trashDirectory Host trash files directory. @returns Effective deletion mode. */
export function fileManagerRemovalMode(
  preference: FileManagerDeleteMode,
  path: string,
  trashDirectory: string | undefined,
): FileManagerDeleteMode {
  return isInsideTrash(path, trashDirectory) ? 'permanent' : preference
}

function EntryRows({
  instance, directory, depth, actions, visiblePaths, ancestors = [],
}: {
  readonly instance: FileManagerSnapshot
  readonly directory: FileManagerDirectory
  readonly depth: number
  readonly actions: FileManagerPanelActions
  readonly visiblePaths: ReadonlySet<string> | undefined
  readonly ancestors?: readonly string[]
}) {
  return <>{directory.entries.filter(entry => visiblePaths?.has(entry.path) ?? true).map(entry => (
    <EntryRow key={entry.path} instance={instance} entry={entry} depth={depth} actions={actions} visiblePaths={visiblePaths} ancestors={[...ancestors, directory.path]} />
  ))}</>
}

function EntryRow({
  instance, entry, depth, actions, visiblePaths, ancestors,
}: {
  readonly instance: FileManagerSnapshot
  readonly entry: FileManagerEntry
  readonly depth: number
  readonly actions: FileManagerPanelActions
  readonly visiblePaths: ReadonlySet<string> | undefined
  readonly ancestors: readonly string[]
}) {
  const cyclic = ancestors.includes(entry.canonicalPath)
  const expanded = cyclic ? undefined : instance.expanded[entry.canonicalPath]
  const directory = entry.kind === 'directory'
  const move = (): void => {
    const destination = actions.prompt(actions.t('movePrompt'), entry.path)
    if (destination !== null && destination !== '' && destination !== entry.path) actions.move(entry.path, destination)
  }
  const inTrash = isInsideTrash(entry.path, instance.trashDirectory)
  const restorable = isTrashRecord(entry.path, instance.trashDirectory)
  const mode = fileManagerRemovalMode(instance.deleteMode, entry.path, instance.trashDirectory)
  const remove = (): void => {
    const confirmed = confirmFileManagerRemoval(
      mode, entry.path, actions.confirm, actions.t(inTrash ? 'trashDeletePrompt' : 'permanentDeletePrompt'),
    )
    if (confirmed) actions.remove(entry.path, mode, mode === 'permanent')
  }
  return (
    <>
      <div
        className="dsh-file-manager-entry"
        data-selected={instance.selectedPath === entry.path ? 'true' : undefined}
        style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
      >
        {directory
          ? (
            <button
              type="button"
              className="dsh-file-manager-expand"
              aria-label={actions.t(expanded === undefined ? 'expand' : 'collapse')}
              disabled={cyclic}
              onClick={() => { actions.toggleExpanded(entry.canonicalPath) }}
            >
              {expanded === undefined ? '›' : '⌄'}
            </button>
          )
          : <span className="dsh-file-manager-expand" aria-hidden />}
        <button
          type="button"
          className="dsh-file-manager-name"
          title={entry.path}
          aria-label={actions.t(directory ? 'openDirectory' : 'openFile')}
          disabled={entry.kind === 'missing' || entry.kind === 'other'}
          onClick={() => {
            if (directory) actions.navigate(entry.canonicalPath)
            else if (entry.kind === 'file') actions.openFile(entry, true)
          }}
          onDoubleClick={() => {
            if (entry.kind === 'file') actions.openFile(entry, false)
          }}
        >
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            {directory
              ? <path d="M2.5 5.5h6l2 2h7v8.5h-15z" />
              : <path d="M5 2.5h6l4 4v11H5zM11 2.5v4h4" />}
          </svg>
          <span>{entry.name}</span>
        </button>
        <span className="dsh-file-manager-row-actions">
          {restorable && <button type="button" className="dsh-file-manager-row-action" title={actions.t('restore')} aria-label={actions.t('restore')}
            onClick={() => { actions.restore(entry.path) }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M4 11a6 6 0 1 0 1.8-4.3M4 3v4h4" /></svg>
          </button>}
          <button type="button" className="dsh-file-manager-row-action" title={actions.t('renameMove')} aria-label={actions.t('renameMove')} onClick={move}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="m12 3 5 5-9 9H3v-5zM10 5l5 5" /></svg>
          </button>
          {entry.kind === 'file' && actions.manager.transfersAvailable && <button type="button" className="dsh-file-manager-row-action" title={actions.t('download')} aria-label={actions.t('download')}
            onClick={() => { actions.download(entry.path) }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M10 2v11m-4-4 4 4 4-4M3 13v4h14v-4" /></svg>
          </button>}
          <button type="button" className="dsh-file-manager-row-action is-danger" title={actions.t('delete')} aria-label={actions.t('delete')} onClick={remove}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6" /></svg>
          </button>
        </span>
      </div>
      {expanded !== undefined && <EntryRows instance={instance} directory={expanded} depth={depth + 1} actions={actions} visiblePaths={visiblePaths} ancestors={ancestors} />}
    </>
  )
}

function DirectoryActions({ actions, snapshot, create, upload }: {
  readonly actions: FileManagerPanelActions
  readonly snapshot: FileManagerSnapshot
  readonly create: (kind: 'file' | 'directory') => void
  readonly upload: () => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent): void => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    const first = [...menu.current!.querySelectorAll<HTMLButtonElement>('button')]
      .find(item => getComputedStyle(item).display !== 'none')
    first?.focus()
    return () => { document.removeEventListener('pointerdown', dismiss) }
  }, [open])
  const moveFocus = (event: KeyboardEvent): void => {
    const items = [...menu.current!.querySelectorAll<HTMLButtonElement>('button')]
      .filter(item => getComputedStyle(item).display !== 'none')
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    else if (event.key === 'ArrowDown') items[(index + 1) % items.length]?.focus()
    else if (event.key === 'ArrowUp') items[(index - 1 + items.length) % items.length]?.focus()
    else if (event.key === 'Home') items[0]?.focus()
    else if (event.key === 'End') items.at(-1)?.focus()
    else return
    event.preventDefault()
  }
  const entries = [
    { key: 'newFile' as const, slot: 'file', run: () => create('file'), path: 'M5 2.5h6l4 4v11H5zM11 2.5v4h4M7 12h6M10 9v6' },
    { key: 'newFolder' as const, slot: 'folder', run: () => create('directory'), path: 'M2.5 5.5h6l2 2h7v10h-15zM7 12h6M10 9v6' },
    ...(actions.manager.transfersAvailable ? [{ key: 'upload' as const, slot: 'upload', run: upload, path: 'M10 14V3m-4 4 4-4 4 4M3 13v4h14v-4' }] : []),
    { key: 'refresh' as const, slot: 'refresh', run: actions.refresh, path: 'M16 7a6.5 6.5 0 1 0 .5 5M16 2v5h-5' },
  ]
  return <div ref={container} className="dsh-file-manager-directory-actions" data-open={open || undefined}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    {entries.map(entry => <button key={entry.key} type="button" className={`dsh-file-manager-quick-${entry.slot}`}
      title={actions.t(entry.key)} aria-label={actions.t(entry.key)} onClick={entry.run}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d={entry.path} /></svg>
    </button>)}
    <button ref={trigger} type="button" title={actions.t('more')} aria-label={actions.t('more')} aria-haspopup="menu" aria-expanded={open}
      onClick={() => { setOpen(!open) }}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
    </button>
    {open && <div ref={menu} role="menu" aria-label={actions.t('more')} className="dsh-file-manager-menu" onKeyDown={moveFocus}>
      {entries.map(entry => <button key={entry.key} type="button" role="menuitem" className={`dsh-file-manager-overflow-${entry.slot}`}
        onClick={() => { setOpen(false); entry.run() }}>{actions.t(entry.key)}</button>)}
      <button type="button" role="menuitemcheckbox" aria-checked={snapshot.showHidden} onClick={() => { actions.setShowHidden(!snapshot.showHidden) }}>
        <span aria-hidden>{snapshot.showHidden ? '✓' : ''}</span>{actions.t('showHidden')}
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={snapshot.deleteMode === 'trash'} onClick={() => { actions.setDeleteMode(snapshot.deleteMode === 'trash' ? 'permanent' : 'trash') }}>
        <span aria-hidden>{snapshot.deleteMode === 'trash' ? '✓' : ''}</span>{actions.t('trash')}
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={snapshot.filterEnabled} onClick={() => { actions.setFilterEnabled(!snapshot.filterEnabled) }}>
        <span aria-hidden>{snapshot.filterEnabled ? '✓' : ''}</span>{actions.t('filter')}
      </button>
      <button type="button" role="menuitem" title={actions.t('trashScope')} onClick={() => { setOpen(false); actions.openTrash() }}>{actions.t('openTrash')}</button>
    </div>}
  </div>
}

/** Render an Enter-navigable path and tree with first-row actions and optional filtering. */
export function FileManagerPanel({ manager, instanceId, prompt, confirm, t }: FileManagerPanelProps) {
  const actions: FileManagerPanelActions = {
    manager,
    prompt,
    confirm,
    t,
    snapshot: () => manager.snapshot(instanceId),
    subscribe: listener => manager.subscribe(instanceId, listener),
    navigate: path => { void manager.navigate(instanceId, path) },
    refresh: () => { void manager.refresh(instanceId) },
    setShowHidden: show => { void manager.setShowHidden(instanceId, show) },
    setDeleteMode: mode => { manager.setDeleteMode(mode) },
    setFilter: filter => { manager.setFilter(instanceId, filter) },
    setFilterEnabled: enabled => { manager.setFilterEnabled(enabled) },
    openTrash: () => { void manager.openTrash(instanceId) },
    toggleExpanded: path => { void manager.toggleExpanded(instanceId, path) },
    openFile: (entry, preview) => { void manager.openFile(instanceId, entry, preview) },
    create: (name, kind) => { void manager.create(instanceId, name, kind) },
    move: (source, destination) => { void manager.move(instanceId, source, destination) },
    remove: (path, mode, confirmed) => { void manager.remove(instanceId, path, mode, confirmed) },
    restore: path => { void manager.restoreFromTrash(instanceId, path) },
    download: path => { void manager.download(instanceId, path) },
    clearError: () => { manager.clearError(instanceId) },
  }
  const snapshot = useSyncExternalStore(actions.subscribe, actions.snapshot, actions.snapshot)
  const uploadInput = useRef<HTMLInputElement>(null)
  useEffect(() => manager.registerFileDrop(instanceId), [manager, instanceId])
  const visiblePaths = filterLoadedTree(snapshot)
  const [address, setAddress] = useState(snapshot.address)
  useEffect(() => { setAddress(snapshot.address) }, [snapshot.address])
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (address.trim() !== '') actions.navigate(address)
  }
  const create = (kind: 'file' | 'directory'): void => {
    const name = actions.prompt(actions.t(kind === 'file' ? 'newFilePrompt' : 'newFolderPrompt'))
    if (name !== null && name !== '') actions.create(name, kind)
  }
  return (
    <section className="dsh-file-manager-root">
      <form className="dsh-file-manager-address" onSubmit={submit}>
        <input aria-label={actions.t('address')} value={address} onChange={event => { setAddress(event.currentTarget.value) }} spellCheck={false} />
      </form>
      {snapshot.filterEnabled && <div className="dsh-file-manager-filter">
        <label>
          <span>{actions.t('filter')}</span>
          <input
            value={snapshot.filter}
            onChange={event => { actions.setFilter(event.currentTarget.value) }}
            placeholder={actions.t('filterPlaceholder')}
            spellCheck={false}
          />
        </label>
        {snapshot.filter !== '' && <button type="button" onClick={() => { actions.setFilter('') }}>{actions.t('clearFilter')}</button>}
      </div>}
      {snapshot.error !== undefined && (
        <div className="dsh-file-manager-error" role="alert">
          <span>{snapshot.error}</span>
          <button type="button" onClick={actions.clearError}>{actions.t('clearError')}</button>
        </div>
      )}
      {Object.entries(snapshot.refreshErrors).map(([path, error]) => (
        <div className="dsh-file-manager-error" role="alert" key={path}>
          <span>{actions.t('refreshFailed')}: {path}: {error}</span>
        </div>
      ))}
      {snapshot.status === 'loading' && <div className="dsh-file-manager-state" role="status">{actions.t('loading')}</div>}
      {snapshot.directory !== undefined && isInsideTrash(snapshot.directory.path, snapshot.trashDirectory) && <div className="dsh-file-manager-trash-scope" role="note">{actions.t('trashScope')}</div>}
      {snapshot.directory !== undefined && (
        <div className="dsh-file-manager-tree-area" data-transfers={manager.transfersAvailable || undefined}>
          {manager.transfersAvailable && <input ref={uploadInput} type="file" multiple hidden aria-label={t('upload')}
            onChange={event => {
              const files = [...event.currentTarget.files ?? []]
              event.currentTarget.value = ''
              if (files.length > 0) void manager.upload(instanceId, files)
            }} />}
          <DirectoryActions actions={actions} snapshot={snapshot} create={create} upload={() => { uploadInput.current?.click() }} />
          <div className="dsh-file-manager-tree" role="tree">
            <div className="dsh-file-manager-tree-content">
              {snapshot.directory.parent !== undefined && (
                <button
                  type="button"
                  className="dsh-file-manager-parent"
                  onClick={() => { actions.navigate(snapshot.directory?.parent ?? snapshot.address) }}
                >
                  ..
                </button>
              )}
              <EntryRows instance={snapshot} directory={snapshot.directory} depth={0} actions={actions} visiblePaths={visiblePaths} />
              {snapshot.directory.entries.length === 0 && <div className="dsh-file-manager-state">{actions.t('empty')}</div>}
              {snapshot.filterEnabled && snapshot.filter !== '' && visiblePaths?.size === 0 && <div className="dsh-file-manager-state">{actions.t('noFilterResults')}</div>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
