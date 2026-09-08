import type { Context } from '@deepseek-ai/cordis'
import type {} from '@dsh-external/dsh-user-files'
import z from '@deepseek-ai/schemastery'
import trash from 'trash'
import { FileManagerFilesystem } from './filesystem.ts'
import { FileManagerRemote } from './remote.ts'
import { homeTrashPaths } from './trash.ts'

export type * from './types.ts'
export { FileManagerFilesystem, FileManagerFilesystemError } from './filesystem.ts'
export { FileManagerRemote } from './remote.ts'

export const name = 'file-manager'
export const inject = ['userFiles']

/** Host deployment configuration. */
export interface Config {
  /** Delay between non-overlapping refreshes of visible directory listings. */
  directoryPollIntervalMs: number
  /** Initial browser deletion preference, used only when no preference is saved. */
  deleteMode: 'trash' | 'permanent'
  /** GNU mv executable; unsupported platforms fail without copying or deleting the source. */
  moveCommand: string
}

/** Validated deployment tunables. */
export const Config: z<Config> = z.object({
  directoryPollIntervalMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  deleteMode: z.union(['trash', 'permanent'] as const).default('trash'),
  moveCommand: z.string().min(1).default('mv'),
})

/** Mount the authenticated user-filesystem Remote. */
export function apply(ctx: Context, config: Config): void {
  const filesystem = new FileManagerFilesystem(
    ctx.userFiles.filesystem,
    async paths => { await trash([...paths], { glob: false }) },
    config.moveCommand,
    homeTrashPaths,
  )
  new FileManagerRemote(ctx, filesystem, config)
}
