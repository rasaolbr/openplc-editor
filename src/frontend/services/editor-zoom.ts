import type { OpenPLCStore } from '../store'
import {
  EDITOR_FONT_SIZE_STORAGE_KEY,
  type EditorZoomDirection,
  nextEditorFontSize,
  parseStoredEditorFontSize,
} from '../utils/editor-zoom'

export type EditorZoomStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): EditorZoomStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** Loads the persisted text-editor font size into the store. */
export function hydrateEditorZoom(
  store: OpenPLCStore,
  storage: EditorZoomStorage | undefined = browserStorage(),
): void {
  if (!storage) return
  let raw: string | null = null
  try {
    raw = storage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY)
  } catch {
    return
  }
  store.getState().workspaceActions.setEditorFontSize(parseStoredEditorFontSize(raw))
}

/** Steps the text-editor font size and persists it; returns the size applied. */
export function changeEditorZoom(
  store: OpenPLCStore,
  direction: EditorZoomDirection,
  storage: EditorZoomStorage | undefined = browserStorage(),
): number {
  const next = nextEditorFontSize(store.getState().workspace.editorFontSize, direction)
  store.getState().workspaceActions.setEditorFontSize(next)
  try {
    storage?.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, String(next))
  } catch {
    // Storage can throw (quota, disabled); the size still applies for this session.
  }
  return next
}
