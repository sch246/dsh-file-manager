// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { expect, it, vi } from 'vitest'
import { FileManagerPanel } from '../src/client/FileManagerPanel.tsx'
import { FileManagerService, type FileManagerGateway } from '../src/client/service.ts'
import { en } from '../src/client/locales.ts'
import type { FileManagerDirectory } from '../src/types.ts'

function fixture() {
  const gateway: FileManagerGateway = {
    initialLocation: vi.fn(async () => ({ path: '/a', name: 'a', kind: 'directory' })),
    trashLocation: vi.fn(async () => ({ path: '/trash/files', name: 'files', kind: 'directory' })),
    resolve: vi.fn(async (_session, path) => ({ path, name: path, kind: 'directory' })),
    list: vi.fn(async (_session, path) => ({ path, parent: '/', entries: [] })),
    create: vi.fn(), move: vi.fn(), restore: vi.fn(), deleteEntry: vi.fn(),
  }
  const sidebar = { openInstance: vi.fn(), activateInstance: vi.fn(), updateInstance: vi.fn() } as unknown as RightSidebarService
  const manager = new FileManagerService(gateway, sidebar, { open: vi.fn() }, () => 'Files', 60_000, 'trash')
  return { gateway, manager, sidebar }
}

it('keeps successful per-tree history, retains failed positions, and truncates forward only on a new directory', async () => {
  const { gateway, manager, sidebar } = fixture()
  try {
    const id = await manager.open('one' as SessionId)
    const other = await manager.open('two' as SessionId)
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id).address).toBe('/a')
    await manager.navigate(id, '/b')
    await manager.navigate(id, '/c')
    vi.mocked(gateway.list).mockRejectedValueOnce(new Error('directory removed'))
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id)).toMatchObject({ address: '/c', error: 'directory removed' })
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id).address).toBe('/b')
    vi.mocked(gateway.resolve).mockRejectedValueOnce(new Error('permission denied'))
    await manager.navigate(id, '/blocked')
    expect(manager.snapshot(id).address).toBe('/b')
    await manager.navigateHistory(id, 1)
    expect(manager.snapshot(id).address).toBe('/c')
    await manager.navigateHistory(id, -1)
    await manager.navigate(id, '/b')
    await manager.refresh(id)
    await manager.navigateHistory(id, 1)
    expect(manager.snapshot(id).address).toBe('/c')
    await manager.navigateHistory(id, -1)
    await manager.open('one' as SessionId, '/d')
    await manager.navigateHistory(id, 1)
    expect(manager.snapshot(id).address).toBe('/d')
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id).address).toBe('/b')
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id).address).toBe('/a')
    await manager.navigateHistory(other, 1)
    expect(manager.snapshot(other).address).toBe('/a')
    await manager.openTrash(id)
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id).address).toBe('/a')
    const descriptor = vi.mocked(sidebar.updateInstance).mock.calls.at(-1)![2].restoreDescriptor
    manager.close(id)
    await manager.restore('one' as SessionId, id, descriptor)
    await manager.navigateHistory(id, 1)
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id).address).toBe('/a')
  } finally { manager.dispose() }
})

it('ignores superseded history reads and preserves a history step when hidden visibility restarts its load', async () => {
  const { gateway, manager } = fixture()
  const pending = Promise.withResolvers<FileManagerDirectory>()
  try {
    const id = await manager.open('one' as SessionId)
    await manager.navigate(id, '/b')
    await manager.navigate(id, '/c')
    const entered = Promise.withResolvers<void>()
    vi.mocked(gateway.list).mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const back = manager.navigateHistory(id, -1)
    await entered.promise
    await manager.setShowHidden(id, true)
    expect(manager.snapshot(id).address).toBe('/b')
    pending.resolve({ path: '/stale', entries: [] })
    await back
    await manager.navigateHistory(id, 1)
    expect(manager.snapshot(id).address).toBe('/c')
    await manager.navigateHistory(id, -1)
    expect(manager.snapshot(id).address).toBe('/b')
  } finally {
    pending.resolve({ path: '/stale', entries: [] })
    manager.dispose()
  }
})

it('routes side buttons and Alt arrows within the target tree, leaving input editing and other panels alone', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const { manager } = fixture()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    const id = await manager.open('one' as SessionId)
    const other = await manager.open('two' as SessionId)
    await manager.navigate(id, '/b')
    await manager.navigate(id, '/c')
    await manager.navigate(other, '/other')
    await act(async () => { root.render(createElement('div', {},
      createElement(FileManagerPanel, { manager, instanceId: id, prompt: vi.fn(), confirm: vi.fn(), t: key => en[key] }),
      createElement(FileManagerPanel, { manager, instanceId: other, prompt: vi.fn(), confirm: vi.fn(), t: key => en[key] }),
      createElement('textarea', { 'data-chat': true }),
      createElement('div', { 'data-editor': true, contentEditable: true }),
    )) })
    const panels = container.querySelectorAll<HTMLElement>('.dsh-file-manager-root')
    const panel = panels[0]!
    const key = async (target: Element, init: KeyboardEventInit): Promise<boolean> => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, altKey: true, key: 'ArrowLeft', ...init })
      await act(async () => { target.dispatchEvent(event) })
      return event.defaultPrevented
    }
    const mouse = async (target: Element, button: number): Promise<boolean[]> => {
      const prevented: boolean[] = []
      for (const type of ['mousedown', 'mouseup', 'auxclick']) {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button })
        await act(async () => { target.dispatchEvent(event) })
        prevented.push(event.defaultPrevented)
      }
      return prevented
    }
    expect(await mouse(panel, 3)).toEqual([true, true, true])
    expect(manager.snapshot(id).address).toBe('/b')
    expect(manager.snapshot(other).address).toBe('/other')
    expect(await mouse(panel, 4)).toEqual([true, true, true])
    expect(manager.snapshot(id).address).toBe('/c')
    panel.focus()
    expect(await key(panel, {})).toBe(true)
    expect(manager.snapshot(id).address).toBe('/b')
    expect(await key(panel, { key: 'ArrowRight' })).toBe(true)
    expect(manager.snapshot(id).address).toBe('/c')
    expect(await key(panel.querySelector('input')!, {})).toBe(false)
    expect(await key(panel, { ctrlKey: true })).toBe(false)
    expect(await key(panel, { repeat: true })).toBe(true)
    expect(manager.snapshot(id).address).toBe('/c')
    for (const selector of ['[data-chat]', '[data-editor]']) {
      const element = container.querySelector(selector)!
      expect(await key(element, {})).toBe(false)
      expect(await mouse(element, 3)).toEqual([false, false, false])
    }
    expect(await mouse(panels[1]!, 3)).toEqual([true, true, true])
    expect(manager.snapshot(other).address).toBe('/a')
    expect(manager.snapshot(id).address).toBe('/c')
    expect(await mouse(panel, 1)).toEqual([false, false, false])
    await act(async () => { panel.querySelector('.dsh-file-manager-tree-content')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })) })
    expect(document.activeElement).toBe(panel)
  } finally {
    await act(async () => { root.unmount() })
    manager.dispose()
    container.remove()
    vi.unstubAllGlobals()
  }
})
