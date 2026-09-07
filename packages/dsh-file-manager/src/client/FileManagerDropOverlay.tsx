/** Optional native-file region and manager-owned upload invitation. */
import { useEffect, useState, type RefObject } from 'react'
import type { IFileDrop, FileDropHoverState } from '@dsh-external/dsh-file-drop/types'
import type { FileManagerLocaleKey } from './locales.ts'
import type { FileManagerService } from './service.ts'

/** Subscribe to an optional plugin without delaying manager activation. */
export type WatchFileDrop = (listener: (provider: IFileDrop | undefined) => void) => () => void

/** Register the panel content and display its upload destination during an owned drag. @param props Manager operations, panel element, optional-service subscription and localized copy. @returns A decoration layer only for the hovered region. */
export function FileManagerDropOverlay({ manager, instanceId, panel, directory, watchFileDrop, t }: {
  readonly manager: Pick<FileManagerService, 'canUpload' | 'upload' | 'reportDropError'>
  readonly instanceId: string
  readonly panel: RefObject<HTMLElement>
  readonly directory: string | undefined
  readonly watchFileDrop: WatchFileDrop
  readonly t: (key: FileManagerLocaleKey) => string
}) {
  const [provider, setProvider] = useState<IFileDrop>()
  const [hover, setHover] = useState<FileDropHoverState>({ active: false, accepted: false })
  useEffect(() => watchFileDrop(value => { setProvider(value) }), [watchFileDrop])
  useEffect(() => {
    if (provider === undefined) return
    return provider.registerRegion({
      element: panel.current!,
      canAccept: () => manager.canUpload(instanceId),
      onHover: setHover,
      onDrop: files => manager.upload(instanceId, files),
      onError: error => { manager.reportDropError(instanceId, error) },
    })
  }, [provider, manager, instanceId, panel])
  if (provider === undefined || !hover.active) return null
  return <div className="dsh-file-manager-drop-overlay" data-accepted={hover.accepted} role="status">
    <div className="dsh-file-manager-drop-message">
      <svg className="dsh-file-manager-drop-illustration" width="120" height="88" viewBox="0 0 120 88" fill="none" aria-hidden="true">
        <g transform="rotate(-14 32 32)">
          <rect x="11" y="10" width="37" height="47" rx="8" fill="#9CE5ED" />
          <path d="M21 24h17M21 32h17M21 40h10" stroke="white" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g transform="rotate(12 85 33)">
          <path d="M68 9h22l14 14v34a6 6 0 0 1-6 6H68a6 6 0 0 1-6-6V15a6 6 0 0 1 6-6Z" fill="#679EFE" />
          <path d="M89 10v14h14M73 35h19M73 44h14" stroke="white" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </g>
        <path d="M32 39a7 7 0 0 1 7-7h16l8 8h23a7 7 0 0 1 7 7v29a7 7 0 0 1-7 7H39a7 7 0 0 1-7-7Z" fill={hover.accepted ? '#3964FE' : '#979DA6'} />
        {hover.accepted
          ? <path d="M62 71V49m-9 9 9-9 9 9" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          : <g stroke="white" strokeWidth="3.5" strokeLinecap="round"><circle cx="62" cy="61" r="12" /><path d="m54 53 16 16" /></g>}
      </svg>
      <div className="dsh-file-manager-drop-title">{t(hover.accepted ? 'dropUpload' : 'dropUnavailable')}</div>
      {hover.accepted && directory !== undefined && <div className="dsh-file-manager-drop-destination">
        <span>{t('dropDestination')}</span><span>{directory}</span>
      </div>}
    </div>
  </div>
}
