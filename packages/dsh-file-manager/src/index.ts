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
  /** Inclusive maximum number of metadata paths in one resolveMany request. */
  maxResolveBatchSize: number
  /** Inclusive complete text-read and encoded text-save limit. */
  maxTextReadBytes: number
  /** Inclusive complete byte-read and byte-save limit. */
  maxByteReadBytes: number
  /** Delay between non-overlapping resource-source checks while subscribed. */
  resourcePollIntervalMs: number
  /** Delay between non-overlapping refreshes of visible directory listings. */
  directoryPollIntervalMs: number
  /** Initial browser deletion preference, used only when no preference is saved. */
  deleteMode: 'trash' | 'permanent'
  /** GNU mv executable; unsupported platforms fail without copying or deleting the source. */
  moveCommand: string
}

/** Validated deployment tunables. */
export const Config: z<Config> = z.object({
  maxResolveBatchSize: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(128),
  maxTextReadBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  maxByteReadBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  resourcePollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  directoryPollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  deleteMode: z.union(['trash', 'permanent'] as const).default('trash'),
  moveCommand: z.string().min(1).default('mv'),
})

/** Mount the authenticated user-filesystem Remote. */
export function apply(ctx: Context, config: Config): void {
  const filesystem = new FileManagerFilesystem(
    config.maxTextReadBytes,
    config.maxByteReadBytes,
    async paths => { await trash([...paths]) },
    config.moveCommand,
  )
  new FileManagerRemote(ctx, filesystem, config)
}
