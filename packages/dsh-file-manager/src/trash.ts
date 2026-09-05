/** Home-trash browsing shares the directory resolver and WSL detection used by trash's Linux provider. */
import { join } from 'node:path'
import { isWsl } from 'wsl-utils'
import xdgTrashdir from 'xdg-trashdir'
import { FileManagerFilesystemError } from './filesystem.ts'

/** Resolve only the Linux provider's home files directory without creating it or aggregating mounted volumes. @returns Provider-selected files path; rejects unsupported platforms and resolver failures. */
export async function homeTrashDirectory(): Promise<string> {
  if (process.platform !== 'linux' || isWsl) {
    throw new FileManagerFilesystemError('trash-unsupported', '', 'Home trash browsing is supported only on Linux outside WSL.')
  }
  try {
    return join(await xdgTrashdir(), 'files')
  } catch (error: unknown) {
    throw new FileManagerFilesystemError('unavailable', '', 'The trash provider could not locate the home trash directory.', { cause: error })
  }
}
