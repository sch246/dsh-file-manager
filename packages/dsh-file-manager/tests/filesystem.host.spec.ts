import { UserFileFilesystem } from '@dsh-external/dsh-user-files'
import { tmpdir } from 'node:os'
import { basename, join, parse } from 'node:path'
import {
  mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile,
} from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FileManagerFilesystem, type FileManagerTrash,
} from '../src/filesystem.ts'

const fixtures: string[] = []
let root: string
let trashed: string[]
const shared = new UserFileFilesystem(1024, 4096)
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
  filesystem = new FileManagerFilesystem(new UserFileFilesystem(1024, 4096), trash, 'mv')
})

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  await expect(operation).rejects.toEqual(expect.objectContaining({
    code,
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

  it('returns file size and MIME metadata without a content read', async () => {
    const image = join(root, 'pixel.png')
    await writeFile(image, Uint8Array.of(137, 80, 78, 71))
    const listing = await filesystem.list(root, false, new AbortController().signal)
    expect(listing.entries.find(entry => entry.path === image)).toMatchObject({
      name: 'pixel.png', kind: 'file', size: 4, mediaType: 'image/png',
    })
    expect(await shared.resolveExisting(image)).toMatchObject({
      path: image, name: 'pixel.png', kind: 'file', size: 4, mediaType: 'image/png',
    })
  })

  it('creates and moves files and folders without replacing an observed target', async () => {
    await filesystem.create(root, 'first.txt', 'file', new AbortController().signal)
    await filesystem.create(root, 'folder', 'directory', new AbortController().signal)
    await expectCode(filesystem.create(root, 'first.txt', 'file', new AbortController().signal), 'already-exists')
    await writeFile(join(root, 'occupied.txt'), 'keep')
    await expectCode(filesystem.move(join(root, 'first.txt'), join(root, 'occupied.txt'), new AbortController().signal), 'already-exists')
    expect(await readFile(join(root, 'occupied.txt'), 'utf8')).toBe('keep')

    await filesystem.move(join(root, 'first.txt'), join(root, 'renamed.txt'), new AbortController().signal)
    expect(await readFile(join(root, 'renamed.txt'), 'utf8')).toBe('')
    await filesystem.move(join(root, 'folder'), join(root, 'renamed-folder'), new AbortController().signal)
    expect((await shared.resolveExisting(join(root, 'renamed-folder'))).kind).toBe('directory')
  })

  it('competing managers preserve the losing source when moving to the same destination', async () => {
    const other = new FileManagerFilesystem(new UserFileFilesystem(1024, 4096), async () => {}, 'mv')
    const left = join(root, 'left.txt')
    const right = join(root, 'right.txt')
    const target = join(root, 'contended.txt')
    await writeFile(left, 'left')
    await writeFile(right, 'right')
    const results = await Promise.allSettled([filesystem.move(left, target, new AbortController().signal), other.move(right, target, new AbortController().signal)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const winner = await readFile(target, 'utf8')
    expect(['left', 'right']).toContain(winner)
    expect(await readFile(winner === 'left' ? right : left, 'utf8')).toBe(winner === 'left' ? 'right' : 'left')
  })

  it('rejects root and trashes files plus empty and non-empty directories without confirmation', async () => {
    const file = join(root, 'file.txt')
    const empty = join(root, 'empty')
    const full = join(root, 'full')
    await writeFile(file, 'text')
    await mkdir(empty)
    await mkdir(full)
    await writeFile(join(full, 'child.txt'), 'child')

    await expectCode(filesystem.remove(parse(root).root, 'trash', false, new AbortController().signal), 'root-delete')
    await filesystem.remove(file, 'trash', false, new AbortController().signal)
    await filesystem.remove(empty, 'trash', false, new AbortController().signal)
    await filesystem.remove(full, 'trash', false, new AbortController().signal)
    expect(trashed).toHaveLength(3)
    expect(await readFile(join(trashed[2] as string, 'child.txt'), 'utf8')).toBe('child')
  })

  it('does not fall back to permanent deletion when recoverable trash fails', async () => {
    const file = join(root, 'trash-failure.txt')
    await writeFile(file, 'keep')
    const unavailableTrash = new FileManagerFilesystem(new UserFileFilesystem(1024, 4096), async () => {
      throw new Error('trash unavailable')
    }, 'mv')
    await expectCode(unavailableTrash.remove(file, 'trash', false, new AbortController().signal), 'unavailable')
    expect(await readFile(file, 'utf8')).toBe('keep')
  })

  it.skipIf(process.platform === 'win32')('requires permanent confirmation and unlinks a symlink without traversing its target', async () => {
    const target = join(root, 'permanent-target')
    const link = join(root, 'permanent-link')
    const directory = join(root, 'permanent-directory')
    await mkdir(target)
    await mkdir(directory)
    await writeFile(join(target, 'keep.txt'), 'keep')
    await writeFile(join(directory, 'child.txt'), 'child')
    await symlink(target, link)
    await expectCode(filesystem.remove(link, 'permanent', false, new AbortController().signal), 'confirmation-required')
    await filesystem.remove(link, 'permanent', true, new AbortController().signal)
    expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('keep')
    await expectCode(shared.resolveExisting(link), 'not-found')
    await filesystem.remove(directory, 'permanent', true, new AbortController().signal)
    await expectCode(shared.resolveExisting(directory), 'not-found')
  })

})
