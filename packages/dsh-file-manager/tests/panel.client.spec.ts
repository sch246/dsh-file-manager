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

it('renders one Delete action and uses the toolbar preference for trash, permanent confirmation, and cancellation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const file = { name: 'note.txt', path: '/workspace/note.txt', canonicalPath: '/workspace/note.txt', kind: 'file' as const, symbolicLink: false, hidden: false }
  const gateway: FileManagerGateway = {
    initialLocation: async () => ({ path: '/workspace', name: 'workspace', kind: 'directory' }),
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
    const labels = [...container.querySelectorAll('.dsh-file-manager-toolbar > label')]
    expect(labels.map(label => label.textContent)).toEqual(['Show hidden files', 'Move to trash'])
    const trashToggle = labels[1]!.querySelector('input')!
    expect(trashToggle.checked).toBe(true)
    await act(async () => { deletes()[0]!.click() })
    expect(confirm).not.toHaveBeenCalled()
    expect(gateway.deleteEntry).toHaveBeenLastCalledWith('panel-session', file.path, 'trash', false, expect.any(AbortSignal))
    await act(async () => { trashToggle.click() })
    expect(trashToggle.checked).toBe(false)
    expect(deletes()).toHaveLength(1)
    await act(async () => { deletes()[0]!.click() })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(gateway.deleteEntry).toHaveBeenLastCalledWith('panel-session', file.path, 'permanent', true, expect.any(AbortSignal))
    confirm.mockReturnValueOnce(false)
    await act(async () => { deletes()[0]!.click() })
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(gateway.deleteEntry).toHaveBeenCalledTimes(2)
    await act(async () => { trashToggle.click() })
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
