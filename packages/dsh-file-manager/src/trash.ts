/** Home-trash browsing shares the directory resolver and WSL detection used by trash's Linux provider. */
import { join } from 'node:path'
import { isWsl } from 'wsl-utils'
import xdgTrashdir from 'xdg-trashdir'
import { FileManagerFilesystemError } from './filesystem.ts'

/** Provider-owned home trash root and the two subdirectories named by the specification. */
export interface FileManagerTrashPaths {
  readonly root: string
  readonly files: string
  readonly info: string
}

/** Resolve only the Linux provider's home trash locations without creating them or aggregating mounted volumes. @returns Provider-selected root, files and info paths; rejects unsupported platforms and resolver failures. */
export async function homeTrashPaths(): Promise<FileManagerTrashPaths> {
  if (process.platform !== 'linux' || isWsl) {
    throw new FileManagerFilesystemError('trash-unsupported', '', 'Home trash browsing is supported only on Linux outside WSL.')
  }
  try {
    const root = await xdgTrashdir()
    return { root, files: join(root, 'files'), info: join(root, 'info') }
  } catch (error: unknown) {
    throw new FileManagerFilesystemError('unavailable', '', 'The trash provider could not locate the home trash directory.', { cause: error })
  }
}

/** Resolve only the Linux provider's home files directory without creating it or aggregating mounted volumes. @returns Provider-selected files path; rejects unsupported platforms and resolver failures. */
export async function homeTrashDirectory(): Promise<string> {
  return (await homeTrashPaths()).files
}
