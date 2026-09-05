import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ChatFileOpenRequest } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  FileViewerSourceId,
  type FileViewerDocumentRef,
} from '@dsh-external/dsh-file-viewer/client'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import fileManagerRemote from '@dsh-external/dsh-file-manager/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { FileManagerPanel, type FileManagerPanelInjected } from './FileManagerPanel.tsx'
import { en, NS, zh } from './locales.ts'
import {
  FileManagerService,
  type FileManagerGateway,
} from './service.ts'
import {
  FilesystemFileViewerSource,
  type FilesystemSourceGateway,
} from './source.ts'
import { FILE_MANAGER_CSS } from './styles.ts'
import type { FileManagerResolvedPath } from '../types.ts'

export type {
  FileManagerGateway, FileManagerSelection, FileManagerSnapshot, FileManagerViewer,
} from './service.ts'
export { FileManagerService, parseFileManagerSelection } from './service.ts'
export type { FilesystemSourceGateway } from './source.ts'
export { FilesystemFileViewerSource } from './source.ts'

/** Required bootstrap service; feature dependencies wait for the generated namespace. */
export const inject = ['remote']

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

/** Build the Chat waterfall listener while preserving its terminal native opener. */
export function createFileManagerChatListener(
  mode: 'preview' | 'system' | 'preview-or-system',
  resolvePath: (sessionId: SessionId, path: string) => Promise<FileManagerResolvedPath>,
  open: (ref: FileViewerDocumentRef) => Promise<unknown>,
  openDirectory: (sessionId: SessionId, path: string) => Promise<unknown>,
): (request: ChatFileOpenRequest, next: () => Promise<void>) => Promise<void> {
  return async (request, next) => {
    if (mode === 'system') return await next()
    const preview = async (): Promise<void> => {
      const target = await resolvePath(request.sessionId, request.path)
      if (target.kind === 'directory') {
        await openDirectory(request.sessionId, target.path)
      } else {
        await open({ sessionId: request.sessionId, sourceId: FileViewerSourceId('filesystem'), resourceId: target.path })
      }
    }
    if (mode === 'preview') return await preview()
    try {
      await preview()
    } catch {
      return await next()
    }
  }
}

async function registerRuntime(ctx: Context): Promise<() => void> {
  const metadata = valueOf(await ctx.remote.fileManager.metadata())
  const remoteGateway: FileManagerGateway = {
    initialLocation: async (sessionId, signal) => valueOf(
      await ctx.remote.fileManager.initialLocation({ sessionId }, signal),
    ),
    resolve: async (sessionId, path, signal) => valueOf(
      await ctx.remote.fileManager.resolve({ sessionId, path }, signal),
    ),
    list: async (sessionId, path, showHidden, signal) => valueOf(
      await ctx.remote.fileManager.list({ sessionId, path, showHidden }, signal),
    ),
    create: async (sessionId, path, name, kind, signal) => {
      valueOf(await ctx.remote.fileManager.create({ sessionId, path, name, kind }, signal))
    },
    move: async (sessionId, source, destination, signal) => {
      valueOf(await ctx.remote.fileManager.move({ sessionId, source, destination }, signal))
    },
    trash: async (sessionId, path, confirmation, signal) => {
      valueOf(await ctx.remote.fileManager.trash({ sessionId, path, confirmation }, signal))
    },
  }
  // Native opening is optional; its probe must not gate browser file management.
  const nativeOpen = await ctx.remote.session.canOpenWorkspacePath().then(result => result.ok && result.value, () => false)
  const sourceGateway: FilesystemSourceGateway = {
    readText: async (sessionId, path, signal) => valueOf(
      await ctx.remote.fileManager.readText({ sessionId, path }, signal),
    ),
    saveText: async (sessionId, path, text, version, signal) => valueOf(
      await ctx.remote.fileManager.saveText({ sessionId, path, text, version }, signal),
    ),
    ...(nativeOpen
      ? {
          openExternal: async (_sessionId: SessionId, path: string, signal: AbortSignal): Promise<void> => {
            valueOf(await ctx.remote.session.openWorkspacePath({ path }, signal))
          },
        }
      : {}),
  }
  const source = new FilesystemFileViewerSource(sourceGateway, metadata.pollIntervalMs)
  const viewer = ctx.fileViewer
  const sidebar = ctx.rightSidebar as RightSidebarService
  const t = ctx.locale.bind(NS)
  const runtime = new FileManagerService(remoteGateway, sidebar, viewer, source.id, () => t('title'))

  const unregisterSource = viewer.registerSource(source)
  const unregisterLauncher = sidebar.registerLauncher({
    id: 'file-manager',
    label: () => t('launcher'),
    open: async (rawSessionId, selection) => {
      await runtime.open(SessionId(rawSessionId), selection)
    },
  })
  const offChat = ctx.on(
    'chat/open-workspace-file',
    createFileManagerChatListener(
      metadata.openMode,
      async (sessionId, path) => valueOf(
        await ctx.remote.fileManager.resolve({ sessionId, path }),
      ),
      ref => viewer.open(ref),
      (sessionId, path) => runtime.open(sessionId, { path }),
    ),
  )
  const offPresentation = ctx.effect(() => {
    const offLocale = ctx.locale.register(NS, { zh, en })
    const style = document.createElement('style')
    style.dataset.pluginCss = '@dsh-external/dsh-file-manager'
    style.textContent = FILE_MANAGER_CSS
    document.head.appendChild(style)
    return () => { offLocale(); style.remove() }
  }, 'file-manager: locale and styles')
  const offView = ctx.slots.inject('rightbar.view', () => ctx.slots.register({
    name: 'rightbar.view',
    id: 'file-manager-tree',
    locale: NS,
    inject: (_sessionId): FileManagerPanelInjected => ({
      manager: runtime,
      prompt: (message, initial) => window.prompt(message, initial),
      t,
    }),
  }, FileManagerPanel))

  return () => {
    offView()
    offPresentation()
    offChat()
    unregisterLauncher()
    unregisterSource()
    runtime.dispose()
  }
}

/** Mount the generated Host descriptor, then register Client behavior after dependencies are ready. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(fileManagerRemote)
  const runtime = ctx.inject(
    ['slots', 'locale', 'rightSidebar', 'fileViewer', 'remote.fileManager', 'remote.session'],
    registerRuntime,
  )
  try {
    await runtime
  } catch (error: unknown) {
    await runtime.dispose()
    await disposeRemote()
    throw error
  }
  return async () => { await runtime.dispose(); await disposeRemote() }
}
