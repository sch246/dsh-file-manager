import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import z from '@deepseek-ai/schemastery'
import trash from 'trash'
import { FileManagerFilesystem } from './filesystem.ts'
import { FileManagerRemote } from './remote.ts'

export type * from './types.ts'
export { FileManagerFilesystem, FileManagerFilesystemError } from './filesystem.ts'
export { FileManagerRemote } from './remote.ts'

export const name = 'file-manager'
export const inject = ['sessions', 'sessionPersistence']

/** Host deployment configuration. */
export interface Config {
  /** Inclusive complete-read and encoded-save limit. */
  maxReadBytes: number
  /** Delay between non-overlapping browser source checks while subscribed. */
  pollIntervalMs: number
  /** Chat workspace-file link routing policy. */
  openMode: 'preview' | 'system' | 'preview-or-system'
}

/** Validated deployment tunables. */
export const Config: z<Config> = z.object({
  maxReadBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  pollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  openMode: z.union(['preview', 'system', 'preview-or-system'] as const).default('preview-or-system'),
})

/** Mount the authenticated user-filesystem Remote. */
export function apply(ctx: Context, config: Config): void {
  const filesystem = new FileManagerFilesystem(config.maxReadBytes, async paths => { await trash([...paths]) })
  new FileManagerRemote(ctx, filesystem, config)
}
