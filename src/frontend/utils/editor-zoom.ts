export const EDITOR_FONT_SIZE_DEFAULT = 12
export const EDITOR_FONT_SIZE_MIN = 8
export const EDITOR_FONT_SIZE_MAX = 32
export const EDITOR_FONT_SIZE_STEP = 1
export const EDITOR_FONT_SIZE_STORAGE_KEY = 'editor-font-size-v1'

export type EditorZoomDirection = 'in' | 'out' | 'reset'

/** Rounds to a whole pixel and keeps the size inside the supported range. */
export function clampEditorFontSize(size: number): number {
  if (!Number.isFinite(size)) return EDITOR_FONT_SIZE_DEFAULT
  return Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, Math.round(size)))
}

export function nextEditorFontSize(current: number, direction: EditorZoomDirection): number {
  switch (direction) {
    case 'in':
      return clampEditorFontSize(current + EDITOR_FONT_SIZE_STEP)
    case 'out':
      return clampEditorFontSize(current - EDITOR_FONT_SIZE_STEP)
    case 'reset':
      return EDITOR_FONT_SIZE_DEFAULT
    default: {
      const exhaustive: never = direction
      return exhaustive
    }
  }
}

/** Parses a persisted size; anything missing or malformed falls back to the default. */
export function parseStoredEditorFontSize(raw: string | null): number {
  if (raw === null || raw.trim() === '') return EDITOR_FONT_SIZE_DEFAULT
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? clampEditorFontSize(parsed) : EDITOR_FONT_SIZE_DEFAULT
}
