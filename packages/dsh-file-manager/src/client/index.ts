import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
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
  FilesystemResourceSource,
  type FilesystemSourceGateway,
} from './source.ts'
import { FILE_MANAGER_CSS } from './styles.ts'
import { browserPreferenceStorage } from './preferences.ts'

export type {
  FileManagerGateway, FileManagerResourceOpener, FileManagerRestoreDescriptor,
  FileManagerSelection, FileManagerSnapshot,
} from './service.ts'
export {
  FileManagerService, filterLoadedTree, parseFileManagerRestoreDescriptor, parseFileManagerSelection,
} from './service.ts'
export type { FilesystemSourceGateway } from './source.ts'
export { FilesystemResourceSource } from './source.ts'

/** Required bootstrap service; feature dependencies wait for the generated namespace. */
export const inject = ['remote']

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

async function registerRuntime(ctx: Context): Promise<() => void> {
  const metadata = valueOf(await ctx.remote.fileManager.metadata())
  const remoteGateway: FileManagerGateway = {
    initialLocation: async (sessionId, signal) => valueOf(
      await ctx.remote.fileManager.initialLocation({ sessionId }, signal),
    ),
    trashLocation: async (sessionId, signal) => valueOf(
      await ctx.remote.fileManager.trashLocation({ sessionId }, signal),
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
    deleteEntry: async (sessionId, path, mode, confirmed, signal) => {
      valueOf(await ctx.remote.fileManager.deleteEntry({ sessionId, path, mode, confirmed }, signal))
    },
  }
  // Native opening is optional; its probe must not gate browser file management.
  const nativeOpen = await ctx.remote.session.canOpenWorkspacePath().then(result => result.ok && result.value, () => false)
  const sourceGateway: FilesystemSourceGateway = {
    readText: async (sessionId, path, signal) => valueOf(
      await ctx.remote.fileManager.readText({ sessionId, path }, signal),
    ),
    readBytes: async (sessionId, path, signal) => valueOf(
      await ctx.remote.fileManager.readBytes({ sessionId, path }, signal),
    ),
    saveText: async (sessionId, path, text, version, signal) => valueOf(
      await ctx.remote.fileManager.saveText({ sessionId, path, text, version }, signal),
    ),
    saveBytes: async (sessionId, path, dataBase64, version, signal) => valueOf(
      await ctx.remote.fileManager.saveBytes({ sessionId, path, dataBase64, version }, signal),
    ),
    ...(nativeOpen
      ? {
          openExternal: async (_sessionId: SessionId, path: string, signal: AbortSignal): Promise<void> => {
            valueOf(await ctx.remote.session.openWorkspacePath({ path }, signal))
          },
        }
      : {}),
  }
  const source = new FilesystemResourceSource(sourceGateway, metadata.resourcePollIntervalMs)
  const resources = ctx.resourceWorkbench
  const sidebar = ctx.rightSidebar as RightSidebarService
  const t = ctx.locale.bind(NS)
  const runtime = new FileManagerService(
    remoteGateway,
    sidebar,
    resources,
    source.id,
    () => t('title'),
    metadata.directoryPollIntervalMs,
    metadata.deleteMode,
    browserPreferenceStorage,
  )

  const unregisterSource = resources.registerSource(source)
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
    unregisterSource()
    runtime.dispose()
  }
}

/** Mount the generated Host descriptor, then register Client behavior after dependencies are ready. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(fileManagerRemote)
  const runtime = ctx.inject(
    ['slots', 'locale', 'rightSidebar', 'resourceWorkbench', 'remote.fileManager', 'remote.session'],
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
