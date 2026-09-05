import { describe, expect, it, vi } from 'vitest'
import { confirmFileManagerRemoval } from '../src/client/FileManagerPanel.tsx'

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
