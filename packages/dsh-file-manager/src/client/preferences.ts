import type { FileManagerDeleteMode } from '../types.ts'

/** Browser storage owned by manager preferences, separate from tree restoration. */
export interface FileManagerPreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const deleteModeKey = 'dsh:file-manager:delete-mode:v1'

/** Read the saved deletion preference; inaccessible storage keeps the Host initial value. */
export function readDeleteMode(storage: FileManagerPreferenceStorage, initial: FileManagerDeleteMode): FileManagerDeleteMode {
  let saved: string | null
  try { saved = storage.getItem(deleteModeKey) } catch {
    // Browser storage access can be denied; the current page retains the initial preference.
    return initial
  }
  if (saved === 'trash' || saved === 'permanent') return saved
  saveDeleteMode(storage, initial)
  return initial
}

/** Persist the preference when browser storage permits writes. */
export function saveDeleteMode(storage: FileManagerPreferenceStorage, mode: FileManagerDeleteMode): void {
  try { storage.setItem(deleteModeKey, mode) } catch { /* Denied or full browser storage leaves the in-memory preference active. */ }
}

/** Browser adapter defers localStorage access so disabled storage cannot prevent startup. */
export const browserPreferenceStorage: FileManagerPreferenceStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => { window.localStorage.setItem(key, value) },
}
