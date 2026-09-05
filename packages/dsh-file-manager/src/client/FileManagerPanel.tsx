import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { FileManagerDirectory, FileManagerEntry } from '../types.ts'
import type { FileManagerLocaleKey } from './locales.ts'
import type { FileManagerService, FileManagerSnapshot } from './service.ts'

/** Actions and observable state injected for one tree instance. */
export interface FileManagerPanelInjected {
  readonly manager: FileManagerService
  prompt(message: string, initial?: string): string | null
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
  toggleExpanded(path: string): void
  openFile(entry: FileManagerEntry): void
  create(name: string, kind: 'file' | 'directory'): void
  move(source: string, destination: string): void
  trash(path: string, confirmation: string): void
  clearError(): void
}

function EntryRows({
  instance, directory, depth, actions, ancestors = [],
}: {
  readonly instance: FileManagerSnapshot
  readonly directory: FileManagerDirectory
  readonly depth: number
  readonly actions: FileManagerPanelActions
  readonly ancestors?: readonly string[]
}) {
  return <>{directory.entries.map(entry => (
    <EntryRow key={entry.path} instance={instance} entry={entry} depth={depth} actions={actions} ancestors={[...ancestors, directory.path]} />
  ))}</>
}

function EntryRow({
  instance, entry, depth, actions, ancestors,
}: {
  readonly instance: FileManagerSnapshot
  readonly entry: FileManagerEntry
  readonly depth: number
  readonly actions: FileManagerPanelActions
  readonly ancestors: readonly string[]
}) {
  const cyclic = ancestors.includes(entry.canonicalPath)
  const expanded = cyclic ? undefined : instance.expanded[entry.canonicalPath]
  const directory = entry.kind === 'directory'
  const move = (): void => {
    const destination = actions.prompt(actions.t('movePrompt'), entry.path)
    if (destination !== null && destination !== '' && destination !== entry.path) actions.move(entry.path, destination)
  }
  const remove = (): void => {
    const confirmation = actions.prompt(`${actions.t('deletePrompt')}\n${entry.path}`)
    if (confirmation === null) return
    if (confirmation !== entry.path) {
      window.alert(actions.t('deleteMismatch'))
      return
    }
    actions.trash(entry.path, confirmation)
  }
  return (
    <>
      <div
        className="dsh-file-manager-entry"
        data-selected={instance.selectedPath === entry.canonicalPath ? 'true' : undefined}
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
            else if (entry.kind === 'file') actions.openFile(entry)
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
          <button type="button" className="dsh-file-manager-row-action" title={actions.t('renameMove')} aria-label={actions.t('renameMove')} onClick={move}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="m12 3 5 5-9 9H3v-5zM10 5l5 5" /></svg>
          </button>
          <button type="button" className="dsh-file-manager-row-action is-danger" title={actions.t('delete')} aria-label={actions.t('delete')} onClick={remove}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6" /></svg>
          </button>
        </span>
      </div>
      {expanded !== undefined && <EntryRows instance={instance} directory={expanded} depth={depth + 1} actions={actions} ancestors={ancestors} />}
    </>
  )
}

/** Render one editable-address tree with lazy folders and explicit mutation actions. */
export function FileManagerPanel({ manager, instanceId, prompt, t }: FileManagerPanelProps) {
  const actions: FileManagerPanelActions = {
    manager,
    prompt,
    t,
    snapshot: () => manager.snapshot(instanceId),
    subscribe: listener => manager.subscribe(instanceId, listener),
    navigate: path => { void manager.navigate(instanceId, path) },
    refresh: () => { void manager.refresh(instanceId) },
    setShowHidden: show => { void manager.setShowHidden(instanceId, show) },
    toggleExpanded: path => { void manager.toggleExpanded(instanceId, path) },
    openFile: entry => { void manager.openFile(instanceId, entry) },
    create: (name, kind) => { void manager.create(instanceId, name, kind) },
    move: (source, destination) => { void manager.move(instanceId, source, destination) },
    trash: (path, confirmation) => { void manager.trash(instanceId, path, confirmation) },
    clearError: () => { manager.clearError(instanceId) },
  }
  const snapshot = useSyncExternalStore(actions.subscribe, actions.snapshot, actions.snapshot)
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
        <label>
          <span>{actions.t('address')}</span>
          <input value={address} onChange={event => { setAddress(event.currentTarget.value) }} spellCheck={false} />
        </label>
        <button type="submit">{actions.t('go')}</button>
      </form>
      <div className="dsh-file-manager-toolbar">
        <button type="button" onClick={actions.refresh}>{actions.t('refresh')}</button>
        <button type="button" onClick={() => { create('file') }}>{actions.t('newFile')}</button>
        <button type="button" onClick={() => { create('directory') }}>{actions.t('newFolder')}</button>
        <label>
          <input
            type="checkbox"
            checked={snapshot.showHidden}
            onChange={event => { actions.setShowHidden(event.currentTarget.checked) }}
          />
          {actions.t(snapshot.showHidden ? 'hideHidden' : 'showHidden')}
        </label>
      </div>
      {snapshot.error !== undefined && (
        <div className="dsh-file-manager-error" role="alert">
          <span>{snapshot.error}</span>
          <button type="button" onClick={actions.clearError}>{actions.t('clearError')}</button>
        </div>
      )}
      {snapshot.status === 'loading' && <div className="dsh-file-manager-state" role="status">{actions.t('loading')}</div>}
      {snapshot.directory !== undefined && snapshot.directory.entries.length === 0 && (
        <div className="dsh-file-manager-state">{actions.t('empty')}</div>
      )}
      {snapshot.directory !== undefined && (
        <div className="dsh-file-manager-tree" role="tree">
          {snapshot.directory.parent !== undefined && (
            <button
              type="button"
              className="dsh-file-manager-parent"
              onClick={() => { actions.navigate(snapshot.directory?.parent ?? snapshot.address) }}
            >
              ..
            </button>
          )}
          <EntryRows instance={snapshot} directory={snapshot.directory} depth={0} actions={actions} />
        </div>
      )}
    </section>
  )
}
