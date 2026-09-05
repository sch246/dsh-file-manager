// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { ResourceSourceId } from '@dsh-external/dsh-file-viewer/client'
import { describe, expect, it, vi } from 'vitest'
import { FileManagerPanel, confirmFileManagerRemoval } from '../src/client/FileManagerPanel.tsx'
import { FileManagerService, type FileManagerGateway } from '../src/client/service.ts'
import { en } from '../src/client/locales.ts'
import type { FileManagerEntry } from '../src/types.ts'

describe('file-manager removal confirmation', () => {
  it('does not confirm trash and confirms permanent deletion exactly once', () => {
    const confirm = vi.fn(() => true)
    expect(confirmFileManagerRemoval('trash', '/workspace/note.txt', confirm, 'Permanent?')).toBe(true)
    expect(confirm).not.toHaveBeenCalled()

    expect(confirmFileManagerRemoval('permanent', '/workspace/note.txt', confirm, 'Permanent?')).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith('Permanent?\n/workspace/note.txt')
  })

  it('does not remove after the one permanent confirmation is declined', () => {
    const confirm = vi.fn(() => false)
    expect(confirmFileManagerRemoval('permanent', '/workspace/folder', confirm, 'Permanent?')).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})

it('exposes compact actions, remembers menu choices, and stops filtering without losing input or the scroll container', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const entries: FileManagerEntry[] = [{ name: 'note.txt', path: '/workspace/note.txt', canonicalPath: '/workspace/note.txt', kind: 'file', symbolicLink: false, hidden: false }]
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const gateway: FileManagerGateway = {
    initialLocation: async () => ({ path: '/workspace', name: 'workspace', kind: 'directory' }),
    trashLocation: vi.fn(async () => ({ path: '/actual-provider/files', name: 'files', kind: 'directory' })),
    resolve: vi.fn(async (_sessionId, path) => ({ path, name: path, kind: 'directory' })),
    list: vi.fn(async (_sessionId, path) => ({ path, parent: '/', entries: [...entries] })),
    create: vi.fn(async (_sessionId, parent, name, kind) => {
      entries.push({ name, path: `${parent}/${name}`, canonicalPath: `${parent}/${name}`, kind, symbolicLink: false, hidden: false })
    }),
    move: vi.fn(),
    deleteEntry: vi.fn(),
  }
  const sidebar = { openInstance: vi.fn(), updateInstance: vi.fn() } as unknown as RightSidebarService
  const manager = new FileManagerService(gateway, sidebar, { open: vi.fn() }, ResourceSourceId('filesystem'), () => 'Files', 60_000, 'trash', storage)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    const instanceId = await manager.open('compact-session' as SessionId)
    const prompt = vi.fn().mockReturnValueOnce('created.txt').mockReturnValueOnce('created-folder')
    await act(async () => { root.render(createElement(FileManagerPanel, { manager, instanceId, prompt, confirm: vi.fn(), t: key => en[key] })) })
    const button = (label: string): HTMLButtonElement => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    const menuChoice = (label: string): HTMLButtonElement => [...container.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find(item => item.textContent?.replace('✓', '') === label)!
    const input = (selector: string, value: string): void => {
      const element = container.querySelector<HTMLInputElement>(selector)!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
    expect(container.querySelector('.dsh-file-manager-toolbar')).toBeNull()
    expect(container.querySelectorAll('form input')).toHaveLength(1)
    expect(container.querySelector('form button')).toBeNull()
    expect(container.querySelector('.dsh-file-manager-filter')).toBeNull()
    expect([...container.querySelectorAll('.dsh-file-manager-directory-actions>button')].map(item => item.getAttribute('aria-label'))).toEqual(['New file', 'New folder', 'Refresh', 'More'])
    const tree = container.querySelector<HTMLElement>('.dsh-file-manager-tree')!
    tree.scrollTop = 43
    expect(tree.querySelector('.dsh-file-manager-parent')?.textContent?.trim()).toBe('..')
    await act(async () => { button('New file').click() })
    await act(async () => { button('New folder').click() })
    expect(tree.textContent).toContain('created.txt')
    expect(tree.textContent).toContain('created-folder')
    expect(gateway.create).toHaveBeenCalledTimes(2)
    const listings = vi.mocked(gateway.list).mock.calls.length
    await act(async () => { button('Refresh').click() })
    expect(gateway.list).toHaveBeenCalledTimes(listings + 1)
    await act(async () => { button('More').click() })
    await act(async () => { menuChoice('Filter').click() })
    await act(async () => { input('.dsh-file-manager-filter input', 'created.txt') })
    expect(tree.textContent).not.toContain('note.txt')
    await act(async () => { button('More').click() })
    if (!container.querySelector('[role="menu"]')) await act(async () => { button('More').click() })
    await act(async () => { menuChoice('Filter').click() })
    expect(container.querySelector('.dsh-file-manager-filter')).toBeNull()
    expect(tree.textContent).toContain('note.txt')
    expect(manager.snapshot(instanceId).filter).toBe('created.txt')
    await act(async () => { menuChoice('Show hidden files').click() })
    expect(menuChoice('Show hidden files').getAttribute('aria-checked')).toBe('true')
    await act(async () => { menuChoice('Filter').click() })
    expect(container.querySelector<HTMLInputElement>('.dsh-file-manager-filter input')!.value).toBe('created.txt')
    expect(container.querySelector('.dsh-file-manager-tree')).toBe(tree)
    expect(tree.scrollTop).toBe(43)
    expect([...values.values()]).toContain('true')

    await act(async () => { container.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })) })
    expect(document.activeElement).toBe(menuChoice('Open trash'))
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(button('More'))
    await act(async () => { button('More').click() })
    await act(async () => { menuChoice('Open trash').click() })
    expect(gateway.trashLocation).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="note"]')?.textContent).toBe(en.trashScope)
    vi.mocked(gateway.trashLocation).mockRejectedValueOnce(new Error('home trash unavailable'))
    await act(async () => { button('More').click() })
    await act(async () => { menuChoice('Open trash').click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('home trash unavailable')
    await act(async () => { input('form input', '/another') })
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(manager.snapshot(instanceId).address).toBe('/another')
    expect(container.querySelector('[role="note"]')).toBeNull()
  } finally {
    await act(async () => { root.unmount() })
    manager.dispose()
    container.remove()
    vi.unstubAllGlobals()
  }
})

it('renders one Delete action and uses the menu preference for trash, permanent confirmation, and cancellation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const file = { name: 'note.txt', path: '/workspace/note.txt', canonicalPath: '/workspace/note.txt', kind: 'file' as const, symbolicLink: false, hidden: false }
  const gateway: FileManagerGateway = {
    initialLocation: async () => ({ path: '/workspace', name: 'workspace', kind: 'directory' }),
    trashLocation: vi.fn(),
    resolve: vi.fn(),
    list: async () => ({ path: '/workspace', entries: [file] }),
    create: vi.fn(),
    move: vi.fn(),
    deleteEntry: vi.fn(async () => {}),
  }
  const sidebar = { openInstance: vi.fn(), updateInstance: vi.fn() } as unknown as RightSidebarService
  const manager = new FileManagerService(gateway, sidebar, { open: vi.fn() }, ResourceSourceId('filesystem'), () => 'Files', 60_000, 'trash')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    const instanceId = await manager.open('panel-session' as SessionId)
    const confirm = vi.fn(() => true)
    await act(async () => { root.render(createElement(FileManagerPanel, { manager, instanceId, prompt: vi.fn(), confirm, t: key => en[key] })) })
    const deletes = (): NodeListOf<HTMLButtonElement> => container.querySelectorAll('button[aria-label="Delete"]')
    expect(deletes()).toHaveLength(1)
    expect(container.querySelectorAll('.dsh-file-manager-row-action.is-danger')).toHaveLength(1)
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="More"]')!.click() })
    const toggles = (): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')]
    expect(toggles().map(button => button.textContent?.replace('✓', ''))).toEqual(['Show hidden files', 'Move to trash when deleting', 'Filter'])
    const toggleTrash = async (): Promise<void> => {
      if (!container.querySelector('[role="menu"]')) await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="More"]')!.click() })
      await act(async () => { toggles()[1]!.click() })
    }
    expect(toggles()[1]!.getAttribute('aria-checked')).toBe('true')
    await act(async () => { deletes()[0]!.click() })
    expect(confirm).not.toHaveBeenCalled()
    expect(gateway.deleteEntry).toHaveBeenLastCalledWith('panel-session', file.path, 'trash', false, expect.any(AbortSignal))
    await toggleTrash()
    expect(toggles()[1]!.getAttribute('aria-checked')).toBe('false')
    expect(deletes()).toHaveLength(1)
    await act(async () => { deletes()[0]!.click() })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(gateway.deleteEntry).toHaveBeenLastCalledWith('panel-session', file.path, 'permanent', true, expect.any(AbortSignal))
    confirm.mockReturnValueOnce(false)
    await act(async () => { deletes()[0]!.click() })
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(gateway.deleteEntry).toHaveBeenCalledTimes(2)
    await toggleTrash()
    vi.mocked(gateway.deleteEntry).mockRejectedValueOnce(new Error('trash failed'))
    await act(async () => { deletes()[0]!.click() })
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(gateway.deleteEntry).toHaveBeenCalledTimes(3)
    expect(gateway.deleteEntry).toHaveBeenLastCalledWith('panel-session', file.path, 'trash', false, expect.any(AbortSignal))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('trash failed')
  } finally {
    await act(async () => { root.unmount() })
    manager.dispose()
    container.remove()
    vi.unstubAllGlobals()
  }
})
