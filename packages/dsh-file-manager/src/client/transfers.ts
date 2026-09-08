import { downloadBrowserFile, type DownloadProgress } from '@dsh-external/dsh-user-files/download'
/** Browser binary transfer adapter; downloads stream to a selected file when supported. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { userFileTransferUrl } from '@dsh-external/dsh-user-files/transfer'

/** HTTP transfer operations used by a tree's cancellable foreground work. */
export interface FileManagerTransfers {
  upload(sessionId: SessionId, directory: string, files: readonly File[], signal: AbortSignal): Promise<void>
  download(sessionId: SessionId, path: string, signal: AbortSignal, onProgress?: (progress: DownloadProgress) => void, nativeOnly?: boolean): Promise<void>
}

async function accepted(response: Response): Promise<void> {
  if (!response.ok) throw new Error(await response.text() || `File transfer failed (${response.status}).`)
}

/** Same-origin cookie-authenticated raw bodies without whole-file JSON or Blob downloads. */
export const browserFileTransfers: FileManagerTransfers = {
  async upload(sessionId, directory, files, signal) {
    for (const file of files) {
      signal.throwIfAborted()
      await accepted(await fetch(userFileTransferUrl({ sessionId, path: directory, name: file.name }), {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal,
      }))
    }
  },
  async download(sessionId, path, signal, onProgress, nativeOnly) {
    await downloadBrowserFile(userFileTransferUrl({ sessionId, path }), path.split(/[/\\]/u).at(-1)!, signal, onProgress, nativeOnly)
  },
}
