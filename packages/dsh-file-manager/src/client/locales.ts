/** File-manager locale namespace. */
export const NS = 'file-manager'

/** Complete product-copy key set for the file tree. */
export type FileManagerLocaleKey =
  | 'title' | 'launcher' | 'address' | 'refresh' | 'showHidden' | 'more' | 'openTrash' | 'trashScope'
  | 'newFile' | 'newFolder' | 'newFilePrompt' | 'newFolderPrompt' | 'renameMove'
  | 'movePrompt' | 'trash' | 'delete' | 'permanentDeletePrompt' | 'trashDeletePrompt'
  | 'restore' | 'clearError'
  | 'loading' | 'empty' | 'expand' | 'collapse' | 'openDirectory' | 'openFile'
  | 'filter' | 'filterPlaceholder' | 'clearFilter' | 'noFilterResults'
  | 'refreshFailed' | 'upload' | 'download'

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
  more: 'More',
  openTrash: 'Open trash',
  trashScope: 'Home trash directory; stored names may be generated IDs. Deleting here is permanent, and restore returns an entry to the path its own trash record names. Other volumes are not included.',
  refresh: 'Refresh',
  showHidden: 'Show hidden files',
  newFile: 'New file',
  newFolder: 'New folder',
  newFilePrompt: 'Name of the new file',
  newFolderPrompt: 'Name of the new folder',
  renameMove: 'Rename or move',
  movePrompt: 'Enter the complete destination path',
  trash: 'Move to trash when deleting',
  delete: 'Delete',
  permanentDeletePrompt: 'Permanently delete this item? This cannot be undone.',
  trashDeletePrompt: 'This item is already in the trash, so deleting it is permanent. Delete it now? This cannot be undone.',
  restore: 'Restore to the original location',
  clearError: 'Dismiss error',
  loading: 'Loading files…',
  empty: 'This directory is empty.',
  expand: 'Expand folder',
  collapse: 'Collapse folder',
  openDirectory: 'Open folder',
  openFile: 'Open resource',
  filter: 'Filter',
  filterPlaceholder: 'Name or relative path',
  clearFilter: 'Clear filter',
  noFilterResults: 'No loaded items match this filter.',
  refreshFailed: 'Automatic refresh failed',
  upload: 'Upload files',
  download: 'Download',
}

export const zh: Record<FileManagerLocaleKey, string> = {
  title: '文件',
  launcher: '文件',
  address: '路径',
  more: '更多',
  openTrash: '打开回收站',
  trashScope: '本机主目录回收文件夹；存储名称可能是生成的 ID。在此删除即为彻底删除；还原会按回收记录返回原路径。不包含其它卷。',
  refresh: '刷新',
  showHidden: '显示隐藏文件',
  newFile: '新建文件',
  newFolder: '新建文件夹',
  newFilePrompt: '新文件名称',
  newFolderPrompt: '新文件夹名称',
  renameMove: '重命名或移动',
  movePrompt: '请输入完整目标路径',
  trash: '删除时移动到回收站',
  delete: '删除',
  permanentDeletePrompt: '要永久删除此项目吗？此操作无法撤销。',
  trashDeletePrompt: '此项目已在回收站中，删除即为彻底删除。要现在删除吗？此操作无法撤销。',
  restore: '还原到原位置',
  clearError: '关闭错误',
  loading: '正在加载文件…',
  empty: '此文件夹为空。',
  expand: '展开文件夹',
  collapse: '折叠文件夹',
  openDirectory: '打开文件夹',
  openFile: '打开资源',
  filter: '筛选',
  filterPlaceholder: '名称或相对路径',
  clearFilter: '清除筛选',
  noFilterResults: '已加载项目中没有匹配项。',
  refreshFailed: '自动刷新失败',
  upload: '上传文件',
  download: '下载',
}
