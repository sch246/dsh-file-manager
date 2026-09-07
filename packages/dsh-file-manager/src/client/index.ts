import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@dsh-external/dsh-user-files/remote'
import { openWorkspaceFile } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import fileManagerRemote from '@dsh-external/dsh-file-manager/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { FileManagerPanel, type FileManagerPanelInjected } from './FileManagerPanel.tsx'
import { en, NS, zh } from './locales.ts'
import {
  FileManagerService,
  type FileManagerGateway,
} from './service.ts'
import { FILE_MANAGER_CSS } from './styles.ts'
import { browserFileTransfers } from './transfers.ts'
import { browserPreferenceStorage } from './preferences.ts'

export type {
  FileManagerGateway, FileManagerResourceOpener, FileManagerRestoreDescriptor,
  FileManagerSelection, FileManagerSnapshot,
} from './service.ts'
export {
  FileManagerService, filterLoadedTree, parseFileManagerRestoreDescriptor, parseFileManagerSelection,
} from './service.ts'

/** Required bootstrap service; feature dependencies wait for the generated namespace. */
export const inject = ['remote']

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

async function registerRuntime(ctx: Context): Promise<() => void> {
  const [metadata, nativeAvailable] = await Promise.all([
    ctx.remote.fileManager.metadata().then(valueOf),
    ctx.remote.session.canOpenWorkspacePath().then(valueOf),
  ])
  const remoteGateway: FileManagerGateway = {
    initialLocation: async (sessionId, signal) => valueOf(
      await ctx.remote.fileManager.initialLocation({ sessionId }, signal),
    ),
    trashLocation: async (sessionId, signal) => valueOf(
      await ctx.remote.fileManager.trashLocation({ sessionId }, signal),
    ),
    resolve: async (sessionId, path, signal) => valueOf(
      await ctx.remote.userFiles.resolve({ sessionId, path }, signal),
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
    restore: async (sessionId, path, signal) => {
      valueOf(await ctx.remote.fileManager.restore({ sessionId, path }, signal))
    },
    deleteEntry: async (sessionId, path, mode, confirmed, signal) => {
      valueOf(await ctx.remote.fileManager.deleteEntry({ sessionId, path, mode, confirmed }, signal))
    },
  }
  const sidebar = ctx.rightSidebar as RightSidebarService
  const t = ctx.locale.bind(NS)
  const runtime = new FileManagerService(
    remoteGateway,
    sidebar,
    { open: request => openWorkspaceFile(ctx, request) },
    () => t('title'),
    metadata.directoryPollIntervalMs,
    metadata.deleteMode,
    browserPreferenceStorage,
    metadata.trashDirectory,
    ctx.remote.$host.isLoopback && nativeAvailable ? undefined : browserFileTransfers,
  )

  const offDirectoryOpen = ctx.on('chat/open-workspace-file', async (request, next) => {
    const resolved = valueOf(await ctx.remote.userFiles.resolve({ sessionId: request.sessionId, path: request.path }, request.signal))
    if (resolved.kind !== 'directory') return next()
    await runtime.open(request.sessionId, { path: resolved.path })
  })
  const unregisterLauncher = sidebar.registerLauncher({
    id: 'file-manager',
    label: () => t('launcher'),
    open: async (rawSessionId, selection) => {
      await runtime.open(SessionId(rawSessionId), selection)
    },
  })
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
      confirm: message => window.confirm(message),
      t,
    }),
  }, FileManagerPanel))
  const unregisterRestorer = sidebar.registerRestorer('file-manager-tree', async context => {
    await runtime.restore(SessionId(context.sessionId), context.instanceId, context.descriptor)
    return { onClosed: () => { runtime.close(context.instanceId) } }
  })

  return () => {
    unregisterRestorer()
    offView()
    offPresentation()
    unregisterLauncher()
    offDirectoryOpen()
    runtime.dispose()
  }
}

/** Mount the generated Host descriptor, then register Client behavior after dependencies are ready. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(fileManagerRemote)
  const runtime = ctx.inject(
    ['slots', 'locale', 'rightSidebar', 'remote.userFiles', 'remote.fileManager', 'remote.session', 'sessions'],
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
