import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'
import type { FileManagerRemote } from '../src/remote.ts'
import { homeTrashDirectory } from '../src/trash.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const provider = vi.hoisted(() => ({ wsl: false, directory: vi.fn<() => Promise<string>>(), remove: vi.fn(async () => {}) }))
vi.mock('xdg-trashdir', () => ({ default: provider.directory }))
vi.mock('wsl-utils', () => ({ get isWsl() { return provider.wsl } }))
vi.mock('trash', () => ({ default: provider.remove }))

it('rejects unknown platforms and WSL without guessing a trash path', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
    await expect(homeTrashDirectory()).rejects.toMatchObject({ code: 'trash-unsupported' })
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' })
    provider.wsl = true
    await expect(homeTrashDirectory()).rejects.toMatchObject({ code: 'trash-unsupported' })
    expect(provider.directory).not.toHaveBeenCalled()
  } finally {
    provider.wsl = false
    Object.defineProperty(process, 'platform', platform)
  }
})

it.skipIf(process.platform !== 'linux')('mounts the Host with provider-owned trash lookup, no browse mkdir, and literal deletion paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-manager-trash-'))
  const ctx = new Context()
  const fiber = ctx.plugin({ apply: (scope: Context) => {
    apply(scope, { maxResolveBatchSize: 8, maxTextReadBytes: 1024, maxByteReadBytes: 4096, resourcePollIntervalMs: 1000, directoryPollIntervalMs: 1000, deleteMode: 'trash', moveCommand: 'mv' })
  } })
  try {
    ctx.provide('sessions', { get: () => ({ header: { cwd: root } }) } as never)
    await fiber.await()
    const remote = ctx.get('fileManager') as FileManagerRemote
    const signal = new AbortController().signal
    const request = { sessionId: 'trash-fixture' as SessionId }
    const trashRoot = join(root, 'provider-chosen-trash')
    provider.directory.mockResolvedValue(trashRoot)
    await expect(remote.trashLocation(request, signal)).rejects.toMatchObject({ code: 'file-manager/not-found', message: expect.stringContaining('has not been created') })
    expect(await readdir(root)).toEqual([])
    await mkdir(trashRoot)
    await writeFile(join(trashRoot, 'files'), 'not a directory')
    await expect(remote.trashLocation(request, signal)).rejects.toMatchObject({ code: 'file-manager/not-directory' })
    await rm(join(trashRoot, 'files'))
    await mkdir(join(trashRoot, 'files'))
    await writeFile(join(trashRoot, 'files', 'provider-generated-id'), 'recoverable bytes')
    expect(await remote.trashLocation(request, signal)).toMatchObject({ path: join(trashRoot, 'files'), kind: 'directory' })
    const directory = await remote.list({ ...request, path: join(trashRoot, 'files'), showHidden: false }, signal)
    expect(directory.entries.map(entry => entry.name)).toEqual(['provider-generated-id'])
    provider.directory.mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(remote.trashLocation(request, signal)).rejects.toMatchObject({ code: 'file-manager/unavailable' })
    await expect(remote.trashLocation(request, AbortSignal.abort())).rejects.toMatchObject({ code: 'gateway/cancelled' })

    const literal = join(root, '[ab].txt')
    await writeFile(literal, 'literal')
    await writeFile(join(root, 'a.txt'), 'untouched')
    await remote.deleteEntry({ ...request, path: literal, mode: 'trash', confirmed: false }, signal)
    expect(provider.remove).toHaveBeenCalledExactlyOnceWith([literal], { glob: false })
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('untouched')
  } finally {
    await fiber.dispose()
    await rm(root, { recursive: true })
  }
})
