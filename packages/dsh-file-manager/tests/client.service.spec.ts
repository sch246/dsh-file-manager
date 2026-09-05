import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { describe, expect, it, vi } from 'vitest'
import {
  FileManagerService, parseFileManagerSelection, type FileManagerGateway, type FileManagerViewer,
} from '../src/client/service.ts'
import { FileViewerSourceId } from '@dsh-external/dsh-file-viewer/client'

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

function harness() {
  const gateway: FileManagerGateway = {
    initialLocation: vi.fn(async () => ({ path: root, kind: 'directory' as const })),
    resolve: vi.fn(async (_sessionId, path) => ({
      path,
      kind: path.endsWith('.txt') ? 'file' as const : 'directory' as const,
    })),
    list: vi.fn(async (_sessionId, path, showHidden) => ({
      path,
      parent: path === root ? '/' : root,
      entries: [folder, file, ...(showHidden ? [{ ...file, name: '.secret', path: `${path}/.secret`, canonicalPath: `${path}/.secret`, hidden: true }] : [])],
    })),
    create: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    trash: vi.fn(async () => {}),
  }
  const sidebar = {
    openInstance: vi.fn(),
    activateInstance: vi.fn(),
  } as unknown as RightSidebarService
  const viewer = { open: vi.fn(async () => 'editor-1') } satisfies FileManagerViewer
  const service = new FileManagerService(gateway, sidebar, viewer, FileViewerSourceId('filesystem'), () => 'Files')
  return { gateway, sidebar, viewer, service }
}

describe('FileManagerService', () => {
  it('validates selector input before any workbench side effect', async () => {
    expect(parseFileManagerSelection('/tmp')).toEqual({ path: '/tmp' })
    expect(parseFileManagerSelection({ path: '/tmp' })).toEqual({ path: '/tmp' })
    expect(() => parseFileManagerSelection({ path: 3 })).toThrow('selection must')
    const { service, sidebar } = harness()
    await expect(service.open(sessionId, { path: 3 })).rejects.toThrow('selection must')
    expect(sidebar.openInstance).not.toHaveBeenCalled()
  })

  it('opens cwd once, activates the existing tree, and selects a requested file', async () => {
    const { service, sidebar, gateway } = harness()
    const instanceId = await service.open(sessionId)
    expect(sidebar.openInstance).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      id: instanceId, viewId: 'file-manager-tree', title: 'Files', onClose: expect.any(Function),
    }))
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

  it('lazy-expands, toggles hidden files, and routes files to the filesystem source', async () => {
    const { service, gateway, viewer } = harness()
    const instanceId = await service.open(sessionId)
    await service.toggleExpanded(instanceId, folder.canonicalPath)
    expect(service.snapshot(instanceId).expanded[folder.canonicalPath]).toBeDefined()
    await service.toggleExpanded(instanceId, folder.canonicalPath)
    expect(service.snapshot(instanceId).expanded[folder.canonicalPath]).toBeUndefined()
    await service.setShowHidden(instanceId, true)
    expect(gateway.list).toHaveBeenLastCalledWith(sessionId, root, true, expect.any(AbortSignal))
    await service.openFile(instanceId, file)
    expect(viewer.open).toHaveBeenCalledWith({
      sessionId, sourceId: 'filesystem', resourceId: file.canonicalPath,
    })
    vi.mocked(viewer.open).mockRejectedValueOnce(new Error('viewer unavailable'))
    await service.openFile(instanceId, file)
    expect(service.snapshot(instanceId).error).toBe('viewer unavailable')
  })

  it('runs create, move, and exact-confirmation trash then refreshes', async () => {
    const { service, gateway } = harness()
    const instanceId = await service.open(sessionId)
    await service.create(instanceId, 'new.txt', 'file')
    await service.move(instanceId, file.path, '/workspace/renamed.txt')
    await service.trash(instanceId, folder.path, folder.path)
    expect(gateway.create).toHaveBeenCalledWith(sessionId, root, 'new.txt', 'file', expect.any(AbortSignal))
    expect(gateway.move).toHaveBeenCalledWith(sessionId, file.path, '/workspace/renamed.txt', expect.any(AbortSignal))
    expect(gateway.trash).toHaveBeenCalledWith(sessionId, folder.path, folder.path, expect.any(AbortSignal))
    expect(gateway.list).toHaveBeenCalledTimes(4)
  })

  it('ignores a superseded navigation result and aborts work on close', async () => {
    const { service, gateway } = harness()
    const instanceId = await service.open(sessionId)
    let release: (() => void) | undefined
    vi.mocked(gateway.resolve).mockImplementationOnce(async (_sessionId, path) => {
      await new Promise<void>(resolve => { release = resolve })
      return { path, kind: 'directory' }
    })
    const first = service.navigate(instanceId, '/slow')
    await service.navigate(instanceId, '/fast')
    release?.()
    await first
    expect(service.snapshot(instanceId).address).toBe('/fast')
    const close = vi.mocked((gateway.list)).mock.calls.at(-1)?.[3]
    service.close(instanceId)
    expect(close?.aborted).toBe(true)
    expect(() => service.snapshot(instanceId)).toThrow('unknown tree instance')
  })
})
