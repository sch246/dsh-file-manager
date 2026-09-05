import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileManagerChatListener } from '../src/client/index.ts'
import { FilesystemFileViewerSource, type FilesystemSourceGateway } from '../src/client/source.ts'

const sessionId = 'session-1' as SessionId
const ref = { sessionId, sourceId: 'filesystem' as never, resourceId: '/tmp/file.txt' }

afterEach(() => { vi.useRealTimers() })

describe('filesystem viewer source', () => {
  it('loads location metadata, saves conditionally, and polls without overlap until disposed', async () => {
    vi.useFakeTimers()
    let version = 'v1'
    let active = 0
    let maximum = 0
    let release: (() => void) | undefined
    const gateway: FilesystemSourceGateway = {
      readText: vi.fn(async (_sessionId, path, signal) => {
        signal.throwIfAborted()
        active += 1
        maximum = Math.max(maximum, active)
        if (release !== undefined) await new Promise<void>(resolve => { release = resolve })
        active -= 1
        return { path, text: `text-${version}`, version }
      }),
      saveText: vi.fn(async () => ({ version: 'v2' })),
    }
    const source = new FilesystemFileViewerSource(gateway, 50)
    const loaded = await source.load(ref, new AbortController().signal)
    expect(loaded).toMatchObject({
      text: 'text-v1', version: 'v1', title: 'file.txt',
      location: { selectorId: 'file-manager', segments: expect.any(Array) },
    })
    await expect(source.save(ref, 'next', 'v1', new AbortController().signal)).resolves.toEqual({ version: 'v2' })

    version = 'v3'
    release = () => {}
    const events: unknown[] = []
    const dispose = source.watch(ref, event => { events.push(event) })
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(500)
    expect(maximum).toBe(1)
    expect(vi.mocked(gateway.readText)).toHaveBeenCalledTimes(2)
    const complete = release
    release = undefined
    complete?.()
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(50)
    expect(events).toEqual([expect.objectContaining({ kind: 'snapshot' })])
    const lastSignal = vi.mocked(gateway.readText).mock.calls.at(-1)?.[2]
    dispose()
    expect(lastSignal?.aborted).toBe(true)
    const calls = vi.mocked(gateway.readText).mock.calls.length
    await vi.advanceTimersByTimeAsync(500)
    expect(vi.mocked(gateway.readText)).toHaveBeenCalledTimes(calls)
  })

  it('exposes external opening only when the gateway supplies it', async () => {
    const base: FilesystemSourceGateway = {
      readText: async (_sessionId, path) => ({ path, text: '', version: 'v1' }),
      saveText: async () => ({ version: 'v2' }),
    }
    expect(new FilesystemFileViewerSource(base, 10).openExternal).toBeUndefined()
    const openExternal = vi.fn(async () => {})
    const source = new FilesystemFileViewerSource({ ...base, openExternal }, 10)
    await source.openExternal?.(ref, new AbortController().signal)
    expect(openExternal).toHaveBeenCalledWith(sessionId, ref.resourceId, expect.any(AbortSignal))
  })
})

describe('Chat file routing', () => {
  it('handles preview, delegates system, and falls back only after preview failure', async () => {
    const request = { sessionId, path: 'relative.txt' }
    const resolvePath = vi.fn(async () => ({ path: '/workspace/relative.txt', kind: 'file' as const }))
    const open = vi.fn(async () => 'editor-1')
    const openDirectory = vi.fn(async () => 'tree-1')
    const next = vi.fn(async () => {})
    await createFileManagerChatListener('preview', resolvePath, open, openDirectory)(request, next)
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ resourceId: '/workspace/relative.txt' }))
    expect(next).not.toHaveBeenCalled()

    await createFileManagerChatListener('system', resolvePath, open, openDirectory)(request, next)
    expect(next).toHaveBeenCalledTimes(1)

    open.mockRejectedValueOnce(new Error('preview failed'))
    await createFileManagerChatListener('preview-or-system', resolvePath, open, openDirectory)(request, next)
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('opens a directory link in the selector without creating an editor', async () => {
    const open = vi.fn()
    const openDirectory = vi.fn(async () => 'tree-1')
    const next = vi.fn()
    await createFileManagerChatListener('preview', async () => ({ path: '/workspace', kind: 'directory' }), open, openDirectory)(
      { sessionId, path: '/workspace' }, next,
    )
    expect(openDirectory).toHaveBeenCalledWith(sessionId, '/workspace')
    expect(open).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })
})
