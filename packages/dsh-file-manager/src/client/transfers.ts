/** Browser binary transfer adapter; downloads remain owned by the browser download manager. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** HTTP transfer operations used by a tree's cancellable foreground work. */
export interface FileManagerTransfers {
  upload(sessionId: SessionId, directory: string, files: readonly File[], signal: AbortSignal): Promise<void>
  download(sessionId: SessionId, path: string, signal: AbortSignal): Promise<void>
}

function transferUrl(sessionId: SessionId, path: string, name?: string): string {
  return `/api/file-manager/transfer?${new URLSearchParams({ sessionId, path, ...(name === undefined ? {} : { name }) })}`
}

async function accepted(response: Response): Promise<void> {
  if (!response.ok) throw new Error(await response.text() || `File transfer failed (${response.status}).`)
}

/** Same-origin cookie-authenticated raw bodies without whole-file JSON or Blob downloads. */
export const browserFileTransfers: FileManagerTransfers = {
  async upload(sessionId, directory, files, signal) {
    for (const file of files) {
      signal.throwIfAborted()
      await accepted(await fetch(transferUrl(sessionId, directory, file.name), {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal,
      }))
    }
  },
  async download(sessionId, path, signal) {
    const url = transferUrl(sessionId, path)
    await accepted(await fetch(url, { method: 'HEAD', credentials: 'same-origin', signal }))
    signal.throwIfAborted()
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = path.split(/[/\\]/u).at(-1)!
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  },
}
