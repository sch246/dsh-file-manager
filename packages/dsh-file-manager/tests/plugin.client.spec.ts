// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { openWorkspaceFile } from '@deepseek-ai/dsh-client-ui-chat/client'
import * as client from '../src/client/index.ts'
import type { FileManagerService } from '../src/client/service.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

it('registers the manager without viewer and delegates file clicks once to the common native opener', async () => {
  const ctx = new Context()
  const sessionId = 'manager-only' as SessionId
  const native = vi.fn(async () => ({ ok: true, value: undefined }))
  const unmount = vi.fn(async () => {})
  const file = { name: 'a.txt', path: '/tree/link.txt', canonicalPath: '/tree/a.txt', kind: 'file' as const, symbolicLink: true, hidden: false }
  const directory = { path: '/tree', name: 'tree', kind: 'directory' as const }
  const managerRemote = {
    metadata: async () => ({ ok: true, value: { directoryPollIntervalMs: 60000, deleteMode: 'trash' } }),
    initialLocation: async () => ({ ok: true, value: directory }),
    list: async () => ({ ok: true, value: { path: '/tree', entries: [file] } }),
  }
  const files = { resolve: vi.fn(async ({ path }: { path: string }) => ({ ok: true, value: path.endsWith('.txt') ? { path, name: 'a.txt', kind: 'file' } : directory })) }
  ctx.provide('remote', { $mount: async () => unmount, fileManager: managerRemote, userFiles: files, session: { canOpenWorkspacePath: async () => ({ ok: true, value: true }), openWorkspacePath: native } } as never)
  ctx.provide('remote.session', ctx.remote.session as never)
  ctx.provide('sessions', { list: { getSnapshot: () => ({ byId: { [sessionId]: { cwd: '/tree' } } }) } } as never)
  ctx.provide('remote.fileManager', managerRemote as never)
  ctx.provide('remote.userFiles', files as never)
  let manager!: FileManagerService
  const register = vi.fn((options: { inject: (id: string) => { manager: FileManagerService } }) => { manager = options.inject(sessionId).manager; return () => {} })
  ctx.provide('slots', { inject: (_name: string, run: () => () => void) => run(), register } as never)
  ctx.provide('locale', { bind: () => () => 'Files', register: () => () => {} } as never)
  const sidebar = { registerLauncher: vi.fn(() => () => {}), registerRestorer: () => () => {}, openInstance: vi.fn(), updateInstance: vi.fn(), activateInstance: vi.fn() }
  ctx.provide('rightSidebar', sidebar as never)
  const fiber = ctx.plugin(client)
  try {
    await fiber.await()
    expect(sidebar.registerLauncher).toHaveBeenCalledTimes(1)
    const id = await manager.open(sessionId)
    await manager.openFile(id, file, false)
    expect(manager.snapshot(id).error).toBeUndefined()
    expect(native).toHaveBeenCalledTimes(1)
    expect(manager.snapshot(id).selectedPath).toBe(file.path)
    await openWorkspaceFile(ctx, { sessionId, path: '/tree' })
    expect(native).toHaveBeenCalledTimes(1)
    files.resolve.mockRejectedValueOnce(new Error('metadata unavailable'))
    await expect(openWorkspaceFile(ctx, { sessionId, path: '/tree' })).rejects.toThrow('metadata unavailable')
    expect(native).toHaveBeenCalledTimes(1)
  } finally { await fiber.dispose() }
  expect(unmount).toHaveBeenCalledTimes(1)
})
