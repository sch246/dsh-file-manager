// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { IFileDrop, FileDropRegion } from '@dsh-external/dsh-file-drop/types'
import { expect, it, vi } from 'vitest'
import { FileManagerDropOverlay, type WatchFileDrop } from '../src/client/FileManagerDropOverlay.tsx'
import { en } from '../src/client/locales.ts'

it('keeps drop optional and attaches, clears, and reattaches the mounted panel as the provider changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('section')
  document.body.append(container)
  const root = createRoot(container)
  const panel = createRef<HTMLElement>()
  Object.defineProperty(panel, 'current', { value: container })
  let update!: (provider: IFileDrop | undefined) => void
  let region!: FileDropRegion
  const stopWatching = vi.fn()
  const watchFileDrop: WatchFileDrop = listener => { update = listener; return stopWatching }
  const unregister = vi.fn(() => { region.onHover({ active: false, accepted: false }) })
  const provider: IFileDrop = { registerRegion: vi.fn(value => { region = value; return unregister }) }
  const manager = { canUpload: vi.fn(() => true), upload: vi.fn(async () => {}), reportDropError: vi.fn() }
  try {
    await act(async () => { root.render(createElement(FileManagerDropOverlay, { manager, instanceId: 'tree', panel, directory: '/current/root', watchFileDrop, t: key => en[key] })) })
    expect(container.querySelector('[role=status]')).toBeNull()
    expect(provider.registerRegion).not.toHaveBeenCalled()
    await act(async () => { update(provider) })
    expect(region.element).toBe(container)
    expect(region.canAccept()).toBe(true)
    manager.canUpload.mockReturnValue(false)
    expect(region.canAccept()).toBe(false)
    await act(async () => { region.onHover({ active: true, accepted: false }) })
    expect(container.textContent).toContain(en.dropUnavailable)
    expect(container.textContent).not.toContain('/current/root')
    await act(async () => { region.onHover({ active: true, accepted: true }) })
    expect(container.textContent).toContain('/current/root')
    expect(container.querySelector('svg')).not.toBeNull()
    const files = [new File(['bytes'], 'file.bin')]
    await region.onDrop(files)
    expect(manager.upload).toHaveBeenCalledWith('tree', files)
    const error = new Error('drop failed')
    region.onError?.(error)
    expect(manager.reportDropError).toHaveBeenCalledWith('tree', error)
    await act(async () => { update(undefined) })
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role=status]')).toBeNull()
    await act(async () => { update(provider) })
    expect(provider.registerRegion).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role=status]')).toBeNull()
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    vi.unstubAllGlobals()
  }
  expect(unregister).toHaveBeenCalledTimes(2)
  expect(stopWatching).toHaveBeenCalledTimes(1)
})
