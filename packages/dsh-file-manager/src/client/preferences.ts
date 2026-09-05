import type { FileManagerDeleteMode } from '../types.ts'

/** Browser storage owned by manager preferences, separate from tree restoration. */
export interface FileManagerPreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const deleteModeKey = 'dsh:file-manager:delete-mode:v1'

/** Browser-wide switches independent of navigation restoration. */
export type FileManagerSwitch = 'show-hidden' | 'filter-enabled'

/** Read a switch, defaulting to disabled when storage is absent or inaccessible. @param storage - Browser-owned persistence. @param key - Manager switch. @returns Saved enabled state or false. */
export function readManagerSwitch(storage: FileManagerPreferenceStorage | undefined, key: FileManagerSwitch): boolean {
  try { return storage?.getItem(`dsh:file-manager:${key}:v1`) === 'true' } catch {
    // Denied browser storage keeps the page-local default.
    return false
  }
}

/** Persist a switch without losing its page-local value when storage is denied. @param storage - Browser-owned persistence. @param key - Manager switch. @param enabled - New switch value. */
export function saveManagerSwitch(storage: FileManagerPreferenceStorage | undefined, key: FileManagerSwitch, enabled: boolean): void {
  try { storage?.setItem(`dsh:file-manager:${key}:v1`, String(enabled)) } catch { /* Denied or full storage leaves the page-local preference active. */ }
}

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
