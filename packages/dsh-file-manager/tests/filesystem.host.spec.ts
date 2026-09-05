import { tmpdir } from 'node:os'
import { basename, join, parse } from 'node:path'
import {
  mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile,
} from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FileManagerFilesystem, FileManagerFilesystemError, type FileManagerTrash,
} from '../src/filesystem.ts'

const fixtures: string[] = []
let root: string
let trashed: string[]
let filesystem: FileManagerFilesystem

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-file-manager-test-'))
  fixtures.push(root)
  trashed = []
  const trash: FileManagerTrash = async paths => {
    const trashDirectory = join(root, '.fixture-trash')
    await mkdir(trashDirectory, { recursive: true })
    for (const path of paths) {
      const destination = join(trashDirectory, `${String(trashed.length)}-${basename(path)}`)
      await rename(path, destination)
      trashed.push(destination)
    }
  }
  filesystem = new FileManagerFilesystem(1024, trash)
})

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  await expect(operation).rejects.toEqual(expect.objectContaining({
    name: 'FileManagerFilesystemError', code,
  }))
}

describe('FileManagerFilesystem', () => {
  // Windows CI cannot create symbolic links without host policy that this plugin does not own.
  it.skipIf(process.platform === 'win32')('lists lazily navigable canonical symlink identities and filters hidden entries', async () => {
    await mkdir(join(root, 'target'))
    await writeFile(join(root, 'target', 'note.txt'), 'text')
    await writeFile(join(root, '.hidden'), 'secret')
    await symlink(join(root, 'target'), join(root, 'linked'))

    const visible = await filesystem.list(root, false, new AbortController().signal)
    expect(visible.entries.map(entry => entry.name)).toEqual(['linked', 'target'])
    expect(visible.entries.find(entry => entry.name === 'linked')).toMatchObject({
      path: join(root, 'linked'),
      canonicalPath: join(root, 'target'),
      kind: 'directory',
      symbolicLink: true,
    })

    const hidden = await filesystem.list(root, true, new AbortController().signal)
    expect(hidden.entries.map(entry => entry.name)).toContain('.hidden')
  })

  it('creates and moves files and folders without replacing an observed target', async () => {
    await filesystem.create(root, 'first.txt', 'file')
    await filesystem.create(root, 'folder', 'directory')
    await expectCode(filesystem.create(root, 'first.txt', 'file'), 'already-exists')
    await writeFile(join(root, 'occupied.txt'), 'keep')
    await expectCode(filesystem.move(join(root, 'first.txt'), join(root, 'occupied.txt')), 'already-exists')
    expect(await readFile(join(root, 'occupied.txt'), 'utf8')).toBe('keep')

    await filesystem.move(join(root, 'first.txt'), join(root, 'renamed.txt'))
    expect(await readFile(join(root, 'renamed.txt'), 'utf8')).toBe('')
  })

  it('requires exact confirmation, rejects root, and trashes file plus empty and non-empty directories', async () => {
    const file = join(root, 'file.txt')
    const empty = join(root, 'empty')
    const full = join(root, 'full')
    await writeFile(file, 'text')
    await mkdir(empty)
    await mkdir(full)
    await writeFile(join(full, 'child.txt'), 'child')

    await expectCode(filesystem.moveToTrash(file, `${file}-wrong`), 'confirmation-mismatch')
    await expectCode(filesystem.moveToTrash(parse(root).root, parse(root).root), 'root-delete')
    await filesystem.moveToTrash(file, file)
    await filesystem.moveToTrash(empty, empty)
    await filesystem.moveToTrash(full, full)
    expect(trashed).toHaveLength(3)
    expect(await readFile(join(trashed[2] as string, 'child.txt'), 'utf8')).toBe('child')
  })

  it('canonicalizes EOLs and restores CRLF, mixed EOL, and terminal newline on save', async () => {
    const crlf = join(root, 'crlf.txt')
    await writeFile(crlf, 'one\r\ntwo\r\n')
    const loaded = await filesystem.readText(crlf, new AbortController().signal)
    expect(loaded.text).toBe('one\ntwo\n')
    await filesystem.saveText(crlf, loaded.text, loaded.version, new AbortController().signal)
    expect(await readFile(crlf, 'utf8')).toBe('one\r\ntwo\r\n')

    const mixed = join(root, 'mixed.txt')
    await writeFile(mixed, 'a\r\nb\rc\n')
    const mixedLoaded = await filesystem.readText(mixed, new AbortController().signal)
    await filesystem.saveText(mixed, mixedLoaded.text, mixedLoaded.version, new AbortController().signal)
    expect(await readFile(mixed, 'utf8')).toBe('a\r\nb\rc\n')

    const none = join(root, 'none.txt')
    await writeFile(none, 'no newline')
    const noneLoaded = await filesystem.readText(none, new AbortController().signal)
    await filesystem.saveText(none, noneLoaded.text, noneLoaded.version, new AbortController().signal)
    expect(await readFile(none, 'utf8')).toBe('no newline')
  })

  it('rejects malformed UTF-8, NUL, oversized and non-regular reads', async () => {
    const invalid = join(root, 'invalid.txt')
    const nul = join(root, 'nul.txt')
    const large = join(root, 'large.txt')
    await writeFile(invalid, Uint8Array.of(0xc3, 0x28))
    await writeFile(nul, Uint8Array.of(97, 0, 98))
    await writeFile(large, 'x'.repeat(1025))
    await expectCode(filesystem.readText(invalid, new AbortController().signal), 'not-text')
    await expectCode(filesystem.readText(nul, new AbortController().signal), 'not-text')
    await expectCode(filesystem.readText(large, new AbortController().signal), 'too-large')
    await expectCode(filesystem.readText(root, new AbortController().signal), 'not-file')
  })

  it('detects an external mutation and never clobbers its content', async () => {
    const path = join(root, 'concurrent.txt')
    await writeFile(path, 'original')
    const loaded = await filesystem.readText(path, new AbortController().signal)
    await writeFile(path, 'external')
    await expectCode(
      filesystem.saveText(path, 'mine', loaded.version, new AbortController().signal),
      'stale-version',
    )
    expect(await readFile(path, 'utf8')).toBe('external')
  })

  it('rejects a malformed opaque revision before publication', async () => {
    const path = join(root, 'revision.txt')
    await writeFile(path, 'original')
    const loaded = await filesystem.readText(path, new AbortController().signal)
    const payload = JSON.parse(Buffer.from(loaded.version, 'base64url').toString('utf8')) as Record<string, unknown>
    payload.sha256 = 'not-a-content-hash'
    const malformed = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') as typeof loaded.version

    await expectCode(filesystem.saveText(path, 'mine', malformed, new AbortController().signal), 'stale-version')
    expect(await readFile(path, 'utf8')).toBe('original')
  })

  it('serializes own writes so two saves from one revision cannot both publish', async () => {
    const path = join(root, 'serialized.txt')
    await writeFile(path, 'base')
    const loaded = await filesystem.readText(path, new AbortController().signal)
    const results = await Promise.allSettled([
      filesystem.saveText(path, 'first', loaded.version, new AbortController().signal),
      filesystem.saveText(path, 'second', loaded.version, new AbortController().signal),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason).toBeInstanceOf(FileManagerFilesystemError)
    expect(failure.reason).toMatchObject({ code: 'stale-version' })
    expect(['first', 'second']).toContain(await readFile(path, 'utf8'))
  })

  // Windows CI cannot create symbolic links without host policy that this plugin does not own.
  it.skipIf(process.platform === 'win32')('follows a file symlink for stable read and save identity', async () => {
    const target = join(root, 'target.txt')
    const link = join(root, 'link.txt')
    await writeFile(target, 'before')
    await symlink(target, link)
    const loaded = await filesystem.readText(link, new AbortController().signal)
    expect(loaded.path).toBe(target)
    await filesystem.saveText(loaded.path, 'after', loaded.version, new AbortController().signal)
    expect(await readFile(target, 'utf8')).toBe('after')
  })
})
