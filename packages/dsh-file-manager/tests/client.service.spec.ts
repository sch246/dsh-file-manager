import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FileManagerService, filterLoadedTree, parseFileManagerRestoreDescriptor, parseFileManagerSelection,
  type FileManagerGateway, type FileManagerResourceOpener,
} from '../src/client/service.ts'
import { ResourceSourceId } from '@dsh-external/dsh-file-viewer/client'
import type { FileManagerPreferenceStorage } from '../src/client/preferences.ts'
import type { FileManagerDeleteMode } from '../src/types.ts'

const sessionId = 'session-1' as SessionId
const root = '/workspace'
const file = {
  name: 'note.txt', path: '/workspace/note.txt', canonicalPath: '/workspace/note.txt',
  kind: 'file' as const, symbolicLink: false, hidden: false,
}
const folder = {
  name: 'src', path: '/workspace/src', canonicalPath: '/workspace/src',
  kind: 'directory' as const, symbolicLink: false, hidden: false,
}

const services: FileManagerService[] = []

afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  vi.useRealTimers()
})

function harness(storage?: FileManagerPreferenceStorage, initial: FileManagerDeleteMode = 'trash') {
  const gateway: FileManagerGateway = {
    initialLocation: vi.fn(async () => ({ path: root, name: 'workspace', kind: 'directory' as const })),
    trashLocation: vi.fn(async () => ({ path: '/provider-trash/files', name: 'files', kind: 'directory' as const })),
    resolve: vi.fn(async (_sessionId, path) => ({
      path,
      name: path.split('/').at(-1) ?? path,
      kind: path.endsWith('.txt') ? 'file' as const : 'directory' as const,
    })),
    list: vi.fn(async (_sessionId, path, showHidden) => ({
      path,
      parent: path === root ? '/' : root,
      entries: [folder, file, ...(showHidden ? [{ ...file, name: '.secret', path: `${path}/.secret`, canonicalPath: `${path}/.secret`, hidden: true }] : [])],
    })),
    create: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    deleteEntry: vi.fn(async () => {}),
  }
  const sidebar = {
    openInstance: vi.fn(),
    activateInstance: vi.fn(),
    updateInstance: vi.fn(),
  } as unknown as RightSidebarService
  const resources = { open: vi.fn(async () => 'resource-1') } satisfies FileManagerResourceOpener
  const service = new FileManagerService(
    gateway, sidebar, resources, ResourceSourceId('filesystem'), () => 'Files', 50, initial, storage,
  )
  services.push(service)
  return { gateway, sidebar, resources, service }
}

describe('FileManagerService', () => {
  it('remembers all menu switches across trees and reloads while disabled filtering keeps its query', async () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const first = harness(storage)
    const id = await first.service.open(sessionId)
    const other = await first.service.open('other' as SessionId)
    await first.service.toggleExpanded(id, folder.path)
    await first.service.openFile(id, file)
    first.service.setFilter(id, 'note')
    expect(filterLoadedTree(first.service.snapshot(id))).toBeUndefined()
    first.service.setFilterEnabled(true)
    expect(filterLoadedTree(first.service.snapshot(id))?.has(file.path)).toBe(true)
    first.service.setFilterEnabled(false)
    expect(filterLoadedTree(first.service.snapshot(id))).toBeUndefined()
    expect(first.service.snapshot(id)).toMatchObject({ filter: 'note', selectedPath: file.path, expanded: { [folder.path]: expect.anything() } })
    first.service.setFilterEnabled(true)
    await first.service.setShowHidden(id, true)
    first.service.setDeleteMode('permanent')
    expect(first.service.snapshot(other)).toMatchObject({ showHidden: true, filterEnabled: true, deleteMode: 'permanent', filter: '' })
    const reloaded = harness(storage)
    await reloaded.service.restore(sessionId, 'restored', { version: 1, address: root, expanded: [], filter: 'note', showHidden: false })
    expect(reloaded.service.snapshot('restored')).toMatchObject({ showHidden: true, filterEnabled: true, deleteMode: 'permanent', filter: 'note' })
    expect(filterLoadedTree(reloaded.service.snapshot('restored'))?.has(file.path)).toBe(true)
  })

  it('uses the provider trash location and retains the directory and polling on lookup failure', async () => {
    vi.useFakeTimers()
    const { service, gateway } = harness()
    const id = await service.open(sessionId)
    vi.mocked(gateway.trashLocation).mockRejectedValueOnce(new Error('trash unsupported'))
    await service.openTrash(id)
    expect(service.snapshot(id)).toMatchObject({ address: root, error: 'trash unsupported' })
    const calls = vi.mocked(gateway.list).mock.calls.length
    await vi.advanceTimersByTimeAsync(50)
    expect(gateway.list).toHaveBeenCalledTimes(calls + 1)
    await service.openTrash(id)
    expect(gateway.resolve).toHaveBeenLastCalledWith(sessionId, '/provider-trash/files', expect.any(AbortSignal))
    expect(service.snapshot(id)).toMatchObject({ address: '/provider-trash/files', trashDirectory: '/provider-trash/files' })
    expect(service.snapshot(id).error).toBeUndefined()
  })

  it('does not let a delayed trash lookup replace a newer navigation', async () => {
    const { service, gateway } = harness()
    const id = await service.open(sessionId)
    let release!: () => void
    const done = new Promise<void>(resolve => { release = resolve })
    vi.mocked(gateway.trashLocation).mockImplementationOnce(async () => {
      await done
      return { path: '/trash', name: 'trash', kind: 'directory' }
    })
    const opening = service.openTrash(id)
    await service.navigate(id, '/newer')
    release()
    await opening
    expect(service.snapshot(id).address).toBe('/newer')
    expect(service.snapshot(id).trashDirectory).toBeUndefined()
  })

  it('applies hidden preference changes while another tree is still loading', async () => {
    const { service, gateway } = harness()
    const id = await service.open(sessionId)
    let started!: () => void
    let release!: () => void
    const loading = new Promise<void>(resolve => { started = resolve })
    const done = new Promise<void>(resolve => { release = resolve })
    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path, showHidden) => {
      if (path === '/loading' && !showHidden) { started(); await done }
      return { path, entries: showHidden ? [{ ...file, name: '.secret', hidden: true }] : [] }
    })
    const opening = service.open('loading' as SessionId, { path: '/loading' })
    await loading
    try {
      await service.setShowHidden(id, true)
      expect(service.snapshot('file-manager-tree:loading')).toMatchObject({
        status: 'ready', showHidden: true, directory: { entries: [expect.objectContaining({ name: '.secret' })] },
      })
    } finally {
      release()
      await opening
    }
    expect(service.snapshot('file-manager-tree:loading').directory?.entries[0]?.name).toBe('.secret')
  })

  it('persists deletion preference across trees and reloads without restoring stale tree values', async () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const first = harness(storage)
    const one = await first.service.open(sessionId)
    const two = await first.service.open('session-2' as SessionId)
    expect(first.service.snapshot(one).deleteMode).toBe('trash')
    first.service.setDeleteMode('permanent')
    expect(first.service.snapshot(one).deleteMode).toBe('permanent')
    expect(first.service.snapshot(two).deleteMode).toBe('permanent')
    const second = harness(storage, 'trash')
    await second.service.restore(sessionId, 'restored', {
      version: 1, address: root, showHidden: false, filter: '', expanded: [], deleteMode: 'trash',
    })
    expect(second.service.snapshot('restored').deleteMode).toBe('permanent')
    second.service.setDeleteMode('trash')
    const third = harness(storage, 'permanent')
    expect(third.service.snapshot(await third.service.open(sessionId)).deleteMode).toBe('trash')
  })

  it('keeps deletion usable when browser preference storage is blocked', async () => {
    const storage = { getItem: () => { throw new Error('storage denied') }, setItem: () => { throw new Error('storage denied') } }
    const { service } = harness(storage, 'permanent')
    const id = await service.open(sessionId)
    expect(service.snapshot(id).deleteMode).toBe('permanent')
    service.setDeleteMode('trash')
    expect(service.snapshot(id).deleteMode).toBe('trash')
  })

  it('retains trash failure without issuing permanent deletion', async () => {
    const { service, gateway } = harness()
    const id = await service.open(sessionId)
    vi.mocked(gateway.deleteEntry).mockRejectedValueOnce(new Error('trash unavailable'))
    await service.remove(id, file.path, 'trash', false)
    expect(gateway.deleteEntry).toHaveBeenCalledExactlyOnceWith(sessionId, file.path, 'trash', false, expect.any(AbortSignal))
    expect(service.snapshot(id).error).toBe('trash unavailable')
  })
  it('validates selector input before any workbench side effect', async () => {
    expect(parseFileManagerSelection('/tmp')).toEqual({ path: '/tmp' })
    expect(parseFileManagerSelection({ path: '/tmp' })).toEqual({ path: '/tmp' })
    expect(() => parseFileManagerSelection({ path: 3 })).toThrow('selection must')
    const { service, sidebar } = harness()
    await expect(service.open(sessionId, { path: 3 })).rejects.toThrow('selection must')
    expect(sidebar.openInstance).not.toHaveBeenCalled()
    expect(() => parseFileManagerRestoreDescriptor({ version: 1, address: root })).toThrow('restore descriptor')
  })

  it('opens cwd once, activates the existing tree, and selects a requested file', async () => {
    const { service, sidebar, gateway } = harness()
    const instanceId = await service.open(sessionId)
    expect(sidebar.openInstance).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      id: instanceId,
      viewId: 'file-manager-tree',
      title: 'Files',
      restoreDescriptor: expect.objectContaining({ version: 2, address: '' }),
      onClosed: expect.any(Function),
    }))
    expect(vi.mocked(sidebar.openInstance).mock.calls[0]?.[1]).not.toHaveProperty('onClose')
    expect(service.snapshot(instanceId)).toMatchObject({ status: 'ready', address: root })

    await service.open(sessionId, { path: '/other/note.txt' })
    expect(sidebar.activateInstance).toHaveBeenCalledWith(sessionId, instanceId)
    expect(gateway.resolve).toHaveBeenCalledWith(sessionId, '/other/note.txt', expect.any(AbortSignal))
    expect(service.snapshot(instanceId)).toMatchObject({
      address: '/other', selectedPath: '/other/note.txt', status: 'ready',
    })
    await service.navigate(instanceId, '/other')
    expect(service.snapshot(instanceId).selectedPath).toBeUndefined()
  })

  it('forgets an instance when sidebar placement rejects', async () => {
    const { service, sidebar } = harness()
    vi.mocked(sidebar.openInstance).mockRejectedValueOnce(new Error('placement unavailable'))
    await expect(service.open(sessionId)).rejects.toThrow('placement unavailable')
    expect(() => service.snapshot(`file-manager-tree:${String(sessionId)}`)).toThrow('unknown tree instance')
  })

  it('cleans up only after committed close and suppresses a late refresh checkpoint', async () => {
    const { service, sidebar, gateway } = harness()
    const instanceId = await service.open(sessionId)
    const input = vi.mocked(sidebar.openInstance).mock.calls[0]?.[1]
    expect(input).not.toHaveProperty('onClose')
    expect(service.snapshot(instanceId).status).toBe('ready')

    let release: (() => void) | undefined
    vi.mocked(gateway.list).mockImplementationOnce(async (_sessionId, path, _showHidden, signal) => {
      await new Promise<void>(resolve => { release = resolve })
      signal.throwIfAborted()
      return { path, parent: '/', entries: [folder, file] }
    })
    const updatesBeforeRefresh = vi.mocked(sidebar.updateInstance).mock.calls.length
    const refresh = service.refresh(instanceId)
    input?.onClosed?.()
    expect(() => service.snapshot(instanceId)).toThrow('unknown tree instance')
    release?.()
    await refresh
    expect(vi.mocked(sidebar.updateInstance)).toHaveBeenCalledTimes(updatesBeforeRefresh)
  })

  it('restores legacy navigation and queries without replacing browser visibility preferences', async () => {
    const { service, gateway, sidebar } = harness()
    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path, showHidden) => ({
      path,
      parent: '/',
      entries: path === root ? [folder, file] : [{ ...file, path: `${path}/note.txt`, canonicalPath: `${path}/note.txt`, hidden: showHidden }],
    }))
    await service.restore(sessionId, 'restored-tree', {
      version: 1,
      address: root,
      showHidden: true,
      filter: 'src/note',
      expanded: [folder.path, folder.path],
      selectedPath: file.path,
    })
    expect(service.snapshot('restored-tree')).toMatchObject({
      address: root,
      showHidden: false,
      filter: 'src/note',
      selectedPath: file.path,
      expanded: { [folder.path]: expect.objectContaining({ path: folder.path }) },
    })
    expect(gateway.list).toHaveBeenCalledWith(sessionId, folder.path, false, expect.any(AbortSignal))
    expect(sidebar.updateInstance).not.toHaveBeenCalled()
    service.setFilter('restored-tree', 'updated')
    const saved = vi.mocked(sidebar.updateInstance).mock.calls.at(-1)?.[2].restoreDescriptor
    expect(saved).toMatchObject({ version: 2, filter: 'updated' })
    expect(saved).not.toHaveProperty('showHidden')
  })

  it('lazy-expands, toggles hidden files, and routes files to the filesystem source', async () => {
    const { service, gateway, resources } = harness()
    const instanceId = await service.open(sessionId)
    await service.toggleExpanded(instanceId, folder.canonicalPath)
    expect(service.snapshot(instanceId).expanded[folder.canonicalPath]).toBeDefined()
    await service.toggleExpanded(instanceId, folder.canonicalPath)
    expect(service.snapshot(instanceId).expanded[folder.canonicalPath]).toBeUndefined()
    await service.setShowHidden(instanceId, true)
    expect(gateway.list).toHaveBeenLastCalledWith(sessionId, root, true, expect.any(AbortSignal))
    await service.openFile(instanceId, file)
    expect(resources.open).toHaveBeenCalledWith(expect.objectContaining({
      ref: { sessionId, sourceId: 'filesystem', resourceId: file.canonicalPath },
      name: 'note.txt',
    }), { target: { fromInstanceId: instanceId, direction: 'right' }, preview: true })
    await service.openFile(instanceId, file, false)
    expect(resources.open).toHaveBeenLastCalledWith(expect.anything(), {
      target: { fromInstanceId: instanceId, direction: 'right' }, preview: false,
    })
    vi.mocked(resources.open).mockRejectedValueOnce(new Error('resource unavailable'))
    await service.openFile(instanceId, file)
    expect(service.snapshot(instanceId).error).toBe('resource unavailable')
  })

  it('lets the final permanent open supersede rapid preview failures', async () => {
    const { service, resources } = harness()
    const instanceId = await service.open(sessionId)
    const rejects: ((error: Error) => void)[] = []
    vi.mocked(resources.open)
      .mockImplementationOnce(async () => await new Promise<string>((_resolve, reject) => { rejects.push(reject) }))
      .mockImplementationOnce(async () => await new Promise<string>((_resolve, reject) => { rejects.push(reject) }))
      .mockResolvedValueOnce('pinned-resource')
    const firstClick = service.openFile(instanceId, file, true)
    const secondClick = service.openFile(instanceId, file, true)
    const doubleClick = service.openFile(instanceId, file, false)
    rejects[0]?.(new Error('preview superseded'))
    rejects[1]?.(new Error('preview instance replaced'))
    await Promise.all([firstClick, secondClick, doubleClick])
    expect(resources.open).toHaveBeenNthCalledWith(3, expect.anything(), {
      target: { fromInstanceId: instanceId, direction: 'right' }, preview: false,
    })
    expect(service.snapshot(instanceId).error).toBeUndefined()
  })

  it('persists the visible file selection through polling and restoration and clears an old open error', async () => {
    vi.useFakeTimers()
    const { service, sidebar, resources } = harness()
    const instanceId = await service.open(sessionId)
    const link = {
      ...file,
      name: 'linked-note.txt',
      path: '/workspace/linked-note.txt',
      canonicalPath: '/real/note.txt',
      symbolicLink: true,
    }
    vi.mocked(resources.open).mockRejectedValueOnce(new Error('first open failed'))
    await service.openFile(instanceId, link, true)
    expect(service.snapshot(instanceId)).toMatchObject({ selectedPath: link.path, error: 'first open failed' })

    vi.mocked(resources.open).mockResolvedValueOnce('opened-resource')
    await service.openFile(instanceId, link, true)
    expect(service.snapshot(instanceId).selectedPath).toBe(link.path)
    expect(service.snapshot(instanceId).error).toBeUndefined()
    expect(resources.open).toHaveBeenLastCalledWith(expect.objectContaining({
      ref: expect.objectContaining({ resourceId: link.canonicalPath }),
    }), expect.anything())

    await vi.advanceTimersByTimeAsync(50)
    expect(service.snapshot(instanceId).selectedPath).toBe(link.path)
    const update = vi.mocked(sidebar.updateInstance).mock.calls.findLast(call => (
      call[2].restoreDescriptor as { selectedPath?: string } | undefined
    )?.selectedPath === link.path)
    expect(update).toBeDefined()
    const descriptor = update?.[2].restoreDescriptor
    service.close(instanceId)
    await service.restore(sessionId, 'restored-tree', descriptor)
    expect(service.snapshot('restored-tree').selectedPath).toBe(link.path)
  })

  it('runs create, move, and configured removal then refreshes', async () => {
    const { service, gateway } = harness()
    const instanceId = await service.open(sessionId)
    await service.create(instanceId, 'new.txt', 'file')
    await service.move(instanceId, file.path, '/workspace/renamed.txt')
    await service.remove(instanceId, folder.path, 'trash', false)
    expect(gateway.create).toHaveBeenCalledWith(sessionId, root, 'new.txt', 'file', expect.any(AbortSignal))
    expect(gateway.move).toHaveBeenCalledWith(sessionId, file.path, '/workspace/renamed.txt', expect.any(AbortSignal))
    expect(gateway.deleteEntry).toHaveBeenCalledWith(sessionId, folder.path, 'trash', false, expect.any(AbortSignal))
    expect(gateway.list).toHaveBeenCalledTimes(4)
  })

  it('filters the loaded tree by relative path and retains matching ancestors', async () => {
    const { service, gateway } = harness()
    const nested = { ...file, name: 'needle.txt', path: '/workspace/src/deep/needle.txt', canonicalPath: '/workspace/src/deep/needle.txt' }
    const deep = { ...folder, name: 'deep', path: '/workspace/src/deep', canonicalPath: '/workspace/src/deep' }
    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path) => ({
      path,
      parent: '/',
      entries: path === root ? [folder] : path === folder.path ? [deep] : [nested],
    }))
    const instanceId = await service.open(sessionId)
    await service.toggleExpanded(instanceId, folder.path)
    await service.toggleExpanded(instanceId, deep.path)
    service.setFilter(instanceId, 'deep/needle')
    service.setFilterEnabled(true)
    expect([...(filterLoadedTree(service.snapshot(instanceId)) ?? [])]).toEqual([
      nested.path, deep.path, folder.path,
    ])
    service.setFilter(instanceId, '')
    expect(filterLoadedTree(service.snapshot(instanceId))).toBeUndefined()
    expect(Object.keys(service.snapshot(instanceId).expanded)).toEqual([folder.path, deep.path])
  })

  it('retains expanded directories, selection, and filtering across refresh', async () => {
    const { service, gateway } = harness()
    const instanceId = await service.open(sessionId, { path: file.path })
    await service.toggleExpanded(instanceId, folder.path)
    service.setFilter(instanceId, 'note')
    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path) => ({
      path,
      parent: '/',
      entries: path === root ? [folder, { ...file, size: 12 }] : [file],
    }))
    await service.refresh(instanceId)
    expect(service.snapshot(instanceId)).toMatchObject({
      selectedPath: file.path,
      filter: 'note',
      expanded: { [folder.path]: expect.objectContaining({ path: folder.path }) },
      directory: { entries: expect.arrayContaining([expect.objectContaining({ path: file.path, size: 12 })]) },
    })
  })

  it('retains a failed expanded listing and exposes its refresh error', async () => {
    const { service, gateway } = harness()
    const instanceId = await service.open(sessionId)
    await service.toggleExpanded(instanceId, folder.path)
    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path) => {
      if (path === folder.path) throw new Error('folder unavailable')
      return { path, parent: '/', entries: [folder, file] }
    })
    await service.refresh(instanceId)
    expect(service.snapshot(instanceId).expanded[folder.path]).toBeDefined()
    expect(service.snapshot(instanceId).refreshErrors[folder.path]).toBe('folder unavailable')
  })

  it('automatically refreshes current and expanded loaded directories without clearing tree state', async () => {
    vi.useFakeTimers()
    const { service, gateway } = harness()
    let childEntries = [file]
    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path) => ({
      path,
      parent: '/',
      entries: path === root ? [folder, file] : childEntries,
    }))
    const instanceId = await service.open(sessionId, { path: file.path })
    await service.toggleExpanded(instanceId, folder.path)
    service.setFilter(instanceId, 'external')
    service.setFilterEnabled(true)
    const external = {
      ...file,
      name: 'external.png',
      path: '/workspace/src/external.png',
      canonicalPath: '/workspace/src/external.png',
      mediaType: 'image/png',
      size: 4,
    }
    childEntries = [external]
    await vi.advanceTimersByTimeAsync(50)
    expect(service.snapshot(instanceId)).toMatchObject({
      selectedPath: file.path,
      filter: 'external',
      expanded: { [folder.path]: { entries: [external] } },
    })
    expect(filterLoadedTree(service.snapshot(instanceId))?.has(folder.path)).toBe(true)

    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path) => {
      if (path === folder.path) throw new Error('automatic listing failed')
      return { path, parent: '/', entries: [folder, file] }
    })
    await vi.advanceTimersByTimeAsync(50)
    expect(service.snapshot(instanceId).expanded[folder.path]?.entries).toEqual([external])
    expect(service.snapshot(instanceId).refreshErrors[folder.path]).toBe('automatic listing failed')
  })

  it('polls loaded directories without overlap and cancels late completion on close', async () => {
    vi.useFakeTimers()
    const { service, gateway } = harness()
    const instanceId = await service.open(sessionId)
    await service.toggleExpanded(instanceId, folder.path)
    service.setFilter(instanceId, 'note')
    let active = 0
    let maximum = 0
    let release: (() => void) | undefined
    vi.mocked(gateway.list).mockImplementation(async (_sessionId, path, _showHidden, signal) => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise<void>(resolve => { release = resolve })
      active -= 1
      signal.throwIfAborted()
      return { path, parent: '/', entries: path === root ? [folder, { ...file, size: 9 }] : [file] }
    })
    const callsBeforePoll = vi.mocked(gateway.list).mock.calls.length
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(500)
    expect(maximum).toBe(1)
    expect(vi.mocked(gateway.list)).toHaveBeenCalledTimes(callsBeforePoll + 1)
    const pollSignal = vi.mocked(gateway.list).mock.calls.at(-1)?.[3]
    service.close(instanceId)
    expect(pollSignal?.aborted).toBe(true)
    release?.()
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(500)
    expect(vi.mocked(gateway.list)).toHaveBeenCalledTimes(callsBeforePoll + 1)
  })

  it('ignores a superseded navigation result and aborts work on close', async () => {
    const { service, gateway } = harness()
    const instanceId = await service.open(sessionId)
    let release: (() => void) | undefined
    let slowSignal: AbortSignal | undefined
    vi.mocked(gateway.resolve).mockImplementationOnce(async (_sessionId, path, signal) => {
      slowSignal = signal
      await new Promise<void>(resolve => { release = resolve })
      return { path, name: path.split('/').at(-1) ?? path, kind: 'directory' }
    })
    const first = service.navigate(instanceId, '/slow')
    await service.navigate(instanceId, '/fast')
    release?.()
    await first
    expect(slowSignal?.aborted).toBe(true)
    expect(service.snapshot(instanceId).address).toBe('/fast')
    service.close(instanceId)
    expect(() => service.snapshot(instanceId)).toThrow('unknown tree instance')
  })
})
