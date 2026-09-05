/** File-manager locale namespace. */
export const NS = 'file-manager'

/** Complete product-copy key set for the file tree. */
export type FileManagerLocaleKey =
  | 'title' | 'launcher' | 'address' | 'go' | 'refresh' | 'showHidden' | 'hideHidden'
  | 'newFile' | 'newFolder' | 'newFilePrompt' | 'newFolderPrompt' | 'renameMove'
  | 'movePrompt' | 'delete' | 'deletePrompt' | 'deleteMismatch' | 'clearError'
  | 'loading' | 'empty' | 'expand' | 'collapse' | 'openDirectory' | 'openFile'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Product copy owned by the filesystem tree. */
    'file-manager': FileManagerLocaleKey
  }
}

export const en: Record<FileManagerLocaleKey, string> = {
  title: 'Files',
  launcher: 'Files',
  address: 'Path',
  go: 'Go',
  refresh: 'Refresh',
  showHidden: 'Show hidden files',
  hideHidden: 'Hide hidden files',
  newFile: 'New file',
  newFolder: 'New folder',
  newFilePrompt: 'Name of the new file',
  newFolderPrompt: 'Name of the new folder',
  renameMove: 'Rename or move',
  movePrompt: 'Enter the complete destination path',
  delete: 'Move to trash',
  deletePrompt: 'Type this exact path to move it to recoverable trash:',
  deleteMismatch: 'The typed path did not match. Nothing was removed.',
  clearError: 'Dismiss error',
  loading: 'Loading files…',
  empty: 'This directory is empty.',
  expand: 'Expand folder',
  collapse: 'Collapse folder',
  openDirectory: 'Open folder',
  openFile: 'Open text file',
}

export const zh: Record<FileManagerLocaleKey, string> = {
  title: '文件',
  launcher: '文件',
  address: '路径',
  go: '前往',
  refresh: '刷新',
  showHidden: '显示隐藏文件',
  hideHidden: '隐藏隐藏文件',
  newFile: '新建文件',
  newFolder: '新建文件夹',
  newFilePrompt: '新文件名称',
  newFolderPrompt: '新文件夹名称',
  renameMove: '重命名或移动',
  movePrompt: '请输入完整目标路径',
  delete: '移到回收站',
  deletePrompt: '输入以下完整路径以移到可恢复的回收站：',
  deleteMismatch: '输入路径不匹配，未删除任何内容。',
  clearError: '关闭错误',
  loading: '正在加载文件…',
  empty: '此文件夹为空。',
  expand: '展开文件夹',
  collapse: '折叠文件夹',
  openDirectory: '打开文件夹',
  openFile: '打开文本文件',
}
