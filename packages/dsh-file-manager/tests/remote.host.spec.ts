import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { FileManagerFilesystem } from '../src/filesystem.ts'
import { FileManagerRemote } from '../src/remote.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

it('reads through the Cordis service receiver used by Remote dispatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-manager-remote-'))
  const ctx = new Context()
  const fiber = ctx.plugin({ apply: (scope: Context) => {
    const filesystem = new FileManagerFilesystem(1024, async () => {}, 'mv')
    new FileManagerRemote(scope, filesystem, { maxReadBytes: 1024, pollIntervalMs: 1000, openMode: 'preview' })
  } })
  try {
    await writeFile(join(root, 'hello.txt'), 'hello\n')
    ctx.provide('sessions', { get: () => ({ header: { cwd: root } }) } as never)
    await fiber.await()
    const remote = ctx.get('fileManager') as FileManagerRemote
    const signal = new AbortController().signal
    const sessionId = 'remote-fixture' as SessionId
    expect(await remote.initialLocation({ sessionId }, signal)).toMatchObject({ path: root, kind: 'directory' })
    expect(await remote.readText({ sessionId, path: 'hello.txt' }, signal)).toMatchObject({ text: 'hello\n' })
  } finally {
    await fiber.dispose()
    await rm(root, { recursive: true })
  }
})
