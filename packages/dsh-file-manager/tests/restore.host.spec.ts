import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserFileFilesystem } from '@dsh-external/dsh-user-files'
import { FileManagerFilesystem, FileManagerFilesystemError } from '../src/filesystem.ts'

let root: string
let locations: { root: string; files: string; info: string }
let manager: FileManagerFilesystem
let shared: UserFileFilesystem
const signal = new AbortController().signal
const trash = vi.fn(async () => {})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-trash-restore-'))
  locations = { root: join(root, 'Trash'), files: join(root, 'Trash/files'), info: join(root, 'Trash/info') }
  await mkdir(locations.files, { recursive: true })
  await mkdir(locations.info)
  shared = new UserFileFilesystem(1024, 4096)
  manager = new FileManagerFilesystem(shared, trash, 'mv', async () => locations)
  trash.mockClear()
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function held(name = 'generated-id', original = join(root, 'original %.txt')) {
  const path = join(locations.files, name)
  const record = join(locations.info, `${name}.trashinfo`)
  await writeFile(path, 'recoverable')
  await writeFile(record, `[Trash Info]\nPath=${encodeURI(original)}\nDeletionDate=2026-09-07T09:00:00\n`)
  return { path, record, original }
}

describe.skipIf(process.platform !== 'linux')('home trash restoration and terminal deletion', () => {
  it('restores percent-encoded original names and removes the matching record', async () => {
    const item = await held()
    expect(await manager.restore(item.path, signal)).toEqual({ path: item.original })
    expect(await readFile(item.original, 'utf8')).toBe('recoverable')
    await expect(lstat(item.path)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(item.record)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves both trashed data and record for occupied destinations, including dangling links', async () => {
    const item = await held()
    await symlink(join(root, 'absent'), item.original)
    await expect(manager.restore(item.path, signal)).rejects.toMatchObject({ code: 'already-exists', path: item.original })
    expect((await lstat(item.original)).isSymbolicLink()).toBe(true)
    expect(await readFile(item.path, 'utf8')).toBe('recoverable')
    expect(await readFile(item.record, 'utf8')).toContain('[Trash Info]')
  })

  it.each([false, true])('preserves a late occupied destination when mv zero-on-skip is %s', async zeroOnSkip => {
    const item = await held()
    const command = join(root, 'late-mv')
    await writeFile(command, `#!/bin/sh\nprintf late > "$7"\n${zeroOnSkip ? '' : 'exec '}/usr/bin/mv "$@"\n${zeroOnSkip ? 'exit 0\n' : ''}`, { mode: 0o700 })
    const late = new FileManagerFilesystem(shared, trash, command, async () => locations)
    await expect(late.restore(item.path, signal)).rejects.toMatchObject({ code: 'already-exists', path: item.original })
    expect(await readFile(item.original, 'utf8')).toBe('late')
    expect(await readFile(item.path, 'utf8')).toBe('recoverable')
    expect(await readFile(item.record, 'utf8')).toContain('[Trash Info]')
  })

  it('preserves data and record when the configured move command is unavailable', async () => {
    const item = await held()
    const missing = new FileManagerFilesystem(shared, trash, join(root, 'no-command'), async () => locations)
    await expect(missing.restore(item.path, signal)).rejects.toMatchObject({ code: 'unavailable', message: expect.stringContaining('move command') })
    expect(await readFile(item.path, 'utf8')).toBe('recoverable')
    expect(await readFile(item.record, 'utf8')).toContain('[Trash Info]')
  })

  it('restores a trashed symbolic link itself and a directory with its children', async () => {
    const item = await held()
    await rm(item.path)
    await symlink(join(root, 'missing-target'), item.path)
    await manager.restore(item.path, signal)
    expect((await lstat(item.original)).isSymbolicLink()).toBe(true)
    const folder = await held('folder', join(root, 'original-folder'))
    await rm(folder.path)
    await mkdir(folder.path)
    await writeFile(join(folder.path, 'child'), 'child')
    await manager.restore(folder.path, signal)
    expect(await readFile(join(folder.original, 'child'), 'utf8')).toBe('child')
  })

  it.each(['Path=/tmp/outside\n', '[Trash Info]\nPath=relative/path\n', '[Trash Info]\nPath=%Q0\n', '[Trash Info]\nPath=/tmp/%00\n', '[Trash Info]\nPath=/one\nPath=/two\n'])('refuses malformed record %j without changing either file', async content => {
    const item = await held()
    await writeFile(item.record, content)
    await expect(manager.restore(item.path, signal)).rejects.toMatchObject({ code: 'invalid-path' })
    expect(await readFile(item.path, 'utf8')).toBe('recoverable')
    expect(await readFile(item.record, 'utf8')).toBe(content)
  })

  it('rejects missing, linked, non-file, nested, and trash-targeted records', async () => {
    const item = await held()
    await rm(item.record)
    await expect(manager.restore(item.path, signal)).rejects.toMatchObject({ code: 'not-found', path: item.record })
    await symlink(item.path, item.record)
    await expect(manager.restore(item.path, signal)).rejects.toMatchObject({ code: 'unavailable' })
    await rm(item.record)
    await mkdir(item.record)
    await expect(manager.restore(item.path, signal)).rejects.toMatchObject({ code: 'not-file' })
    await rm(item.record, { recursive: true })
    await writeFile(item.record, `[Trash Info]\nPath=${join(locations.root, 'another')}\n`)
    await expect(manager.restore(item.path, signal)).rejects.toMatchObject({ code: 'invalid-path' })
    await mkdir(join(locations.files, 'folder'))
    await writeFile(join(locations.files, 'folder/child'), 'child')
    await expect(manager.restore(join(locations.files, 'folder/child'), signal)).rejects.toMatchObject({ code: 'invalid-path' })
    expect(await readFile(item.path, 'utf8')).toBe('recoverable')
  })

  it('protects root/files/info and requires permanent confirmation throughout trash, including parent aliases', async () => {
    const alias = join(root, 'alias')
    await symlink(locations.root, alias)
    for (const path of [locations.root, locations.files, locations.info, join(alias, 'files')]) {
      await expect(manager.remove(path, 'permanent', true, signal)).rejects.toMatchObject({ code: 'invalid-path' })
    }
    const item = await held()
    await expect(manager.remove(join(alias, 'files/generated-id'), 'trash', false, signal)).rejects.toMatchObject({ code: 'confirmation-required' })
    await expect(manager.remove(item.record, 'trash', false, signal)).rejects.toMatchObject({ code: 'confirmation-required' })
    await expect(manager.remove(item.path, 'permanent', false, signal)).rejects.toMatchObject({ code: 'confirmation-required' })
    await mkdir(join(locations.files, 'nested'))
    const nested = join(locations.files, 'nested/child')
    await writeFile(nested, 'nested')
    await expect(manager.remove(nested, 'trash', false, signal)).rejects.toMatchObject({ code: 'confirmation-required' })
    await manager.remove(nested, 'permanent', true, signal)
    await expect(lstat(nested)).rejects.toMatchObject({ code: 'ENOENT' })
    await manager.remove(item.path, 'permanent', true, signal)
    await expect(lstat(item.record)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(trash).not.toHaveBeenCalled()
  })

  it('fails closed on provider failure and allows ordinary deletion on an unsupported platform', async () => {
    const item = await held()
    const failed = new FileManagerFilesystem(shared, trash, 'mv', async () => { throw new Error('resolver failed') })
    await expect(failed.remove(item.path, 'permanent', true, signal)).rejects.toMatchObject({ code: 'unavailable' })
    expect(await readFile(item.path, 'utf8')).toBe('recoverable')
    const unsupported = new FileManagerFilesystem(shared, trash, 'mv', async () => { throw new FileManagerFilesystemError('trash-unsupported', '', 'unsupported') })
    await expect(unsupported.restore(item.path, signal)).rejects.toMatchObject({ code: 'trash-unsupported' })
    await unsupported.remove(item.path, 'permanent', true, signal)
  })

  it('reports record-cleanup failure after a completed permanent deletion', async () => {
    const item = await held()
    await rm(item.record)
    await mkdir(item.record)
    await expect(manager.remove(item.path, 'permanent', true, signal)).rejects.toMatchObject({ code: 'unavailable', message: expect.stringContaining('permanently deleted') })
    await expect(lstat(item.path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await lstat(item.record)).isDirectory()).toBe(true)
  })

  it('queues restoration behind shared writes and leaves a cancelled queued restore untouched', async () => {
    const item = await held()
    let release!: () => void
    const hold = new Promise<void>(resolve => { release = resolve })
    const blocker = shared.mutate(signal, async () => { await hold })
    const abort = new AbortController()
    const result = manager.restore(item.path, abort.signal)
    const outcome = Promise.allSettled([result])
    abort.abort()
    try {
      expect(await readFile(item.path, 'utf8')).toBe('recoverable')
      release()
      await blocker
      expect(await outcome).toMatchObject([{ status: 'rejected', reason: { name: 'AbortError' } }])
      expect(await readFile(item.path, 'utf8')).toBe('recoverable')
      expect(await readFile(item.record, 'utf8')).toContain('[Trash Info]')
    } finally { release(); await blocker; await outcome }
  })
})
