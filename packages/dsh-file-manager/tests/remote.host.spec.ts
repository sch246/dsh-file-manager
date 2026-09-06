import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { UserFileFilesystem, UserFileRemote, Config } from '@dsh-external/dsh-user-files'
import { FileManagerFilesystem } from '../src/filesystem.ts'
import { FileManagerRemote } from '../src/remote.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

it('dispatches directory operations using the shared Session resolver and preserves trash failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-manager-remote-'))
  const ctx = new Context()
  const trash = vi.fn(async () => { throw new Error('trash provider failed') })
  const fiber = ctx.plugin({ apply: (scope: Context) => {
    new UserFileRemote(scope, new UserFileFilesystem(1024, 4096), Config({}))
    new FileManagerRemote(scope, new FileManagerFilesystem(scope.userFiles.filesystem, trash, 'mv'), {
      directoryPollIntervalMs: 1000, deleteMode: 'trash',
    })
  } })
  try {
    ctx.provide('sessions', { get: () => ({ header: { cwd: root } }) } as never)
    await fiber.await()
    const remote = ctx.get('fileManager') as FileManagerRemote
    const signal = new AbortController().signal
    const sessionId = 'manager-fixture' as SessionId
    expect(await remote.initialLocation({ sessionId }, signal)).toMatchObject({ path: root, kind: 'directory' })
    await remote.create({ sessionId, path: '.', name: 'hello.txt', kind: 'file' }, signal)
    expect((await remote.list({ sessionId, path: '.', showHidden: false }, signal)).entries).toHaveLength(1)
    const path = join(root, 'hello.txt')
    await writeFile(path, 'keep')
    await expect(remote.deleteEntry({ sessionId, path, mode: 'trash', confirmed: false }, signal))
      .rejects.toMatchObject({ code: 'file-manager/unavailable' })
    expect(trash).toHaveBeenCalledTimes(1)
    expect(await readFile(path, 'utf8')).toBe('keep')
    await expect(remote.deleteEntry({ sessionId, path, mode: 'permanent', confirmed: false }, signal))
      .rejects.toMatchObject({ code: 'file-manager/confirmation-required' })
    await remote.deleteEntry({ sessionId, path, mode: 'permanent', confirmed: true }, signal)
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(Object.hasOwn(FileManagerRemote.prototype, 'readText')).toBe(false)
  } finally {
    await fiber.dispose()
    await rm(root, { recursive: true })
  }
})

it('shares publication ordering with deletion and cancels a queued management mutation before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-mutations-'))
  const shared = new UserFileFilesystem(1024, 4096)
  const manager = new FileManagerFilesystem(shared, async () => {}, 'mv')
  const signal = new AbortController().signal
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const hold = new Promise<void>(resolve => { release = resolve })
  const blocker = shared.mutate(signal, async () => { entered(); await hold })
  try {
    const path = join(root, 'published.txt')
    await writeFile(path, 'base')
    const loaded = await shared.readText(path, signal)
    await started
    const deleted = manager.remove(path, 'permanent', true, signal)
    const publication = shared.saveText(path, 'late save', loaded.version, signal)
    const abort = new AbortController()
    const cancelled = manager.create(root, 'cancelled.txt', 'file', abort.signal)
    abort.abort()
    const outcomes = Promise.allSettled([deleted, publication, cancelled])
    release()
    await blocker
    const results = await outcomes
    expect(results[0]?.status).toBe('fulfilled')
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'not-found' } })
    expect(results[2]).toMatchObject({ status: 'rejected', reason: { name: 'AbortError' } })
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'cancelled.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { release(); await blocker; await rm(root, { recursive: true, force: true }) }
})
