import type * as monacoNs from 'monaco-editor'

import type { EditorZoomDirection } from '../../../../../utils/editor-zoom'

export const EDITOR_ZOOM_ACTION_IDS: Record<EditorZoomDirection, string> = {
  in: 'openplc.editor.zoomIn',
  out: 'openplc.editor.zoomOut',
  reset: 'openplc.editor.zoomReset',
}

export const EDITOR_ZOOM_PRECONDITION = 'editorTextFocus'

export type EditorZoomAction = Pick<
  monacoNs.editor.IActionDescriptor,
  'id' | 'label' | 'keybindings' | 'precondition'
> & {
  run: () => void
}

export type ZoomKeybindingEditor = Pick<monacoNs.editor.IStandaloneCodeEditor, 'onDidDispose'> & {
  addAction: (action: EditorZoomAction) => monacoNs.IDisposable
}

export type ZoomKeyCodeSource = {
  KeyMod: { CtrlCmd: number; Shift: number }
  KeyCode: {
    Equal: monacoNs.KeyCode
    Minus: monacoNs.KeyCode
    Digit0: monacoNs.KeyCode
    NumpadAdd: monacoNs.KeyCode
    NumpadSubtract: monacoNs.KeyCode
    Numpad0: monacoNs.KeyCode
  }
}

/** Ctrl/Cmd with `=`/`+`, `-` and `0`, on both the main row and the numpad. */
export function editorZoomKeybindings(source: ZoomKeyCodeSource): Record<EditorZoomDirection, number[]> {
  const { CtrlCmd, Shift } = source.KeyMod
  const k = source.KeyCode
  return {
    in: [CtrlCmd | k.Equal, CtrlCmd | Shift | k.Equal, CtrlCmd | k.NumpadAdd],
    out: [CtrlCmd | k.Minus, CtrlCmd | k.NumpadSubtract],
    reset: [CtrlCmd | k.Digit0, CtrlCmd | k.Numpad0],
  }
}

const LABELS: Record<EditorZoomDirection, string> = {
  in: 'Editor Font Zoom In',
  out: 'Editor Font Zoom Out',
  reset: 'Editor Font Zoom Reset',
}

const DIRECTIONS: readonly EditorZoomDirection[] = ['in', 'out', 'reset']

/**
 * Binds the zoom chords on this editor only (`addAction`, so the last mounted editor does not
 * capture them for every other one). `onZoom` owns the font size; it is shared by all editors.
 */
export function installEditorZoomKeybindings(
  editor: ZoomKeybindingEditor,
  keybindings: Record<EditorZoomDirection, number[]>,
  onZoom: (direction: EditorZoomDirection) => void,
): void {
  const actions = DIRECTIONS.map((direction) =>
    editor.addAction({
      id: EDITOR_ZOOM_ACTION_IDS[direction],
      label: LABELS[direction],
      keybindings: keybindings[direction],
      precondition: EDITOR_ZOOM_PRECONDITION,
      run: () => onZoom(direction),
    }),
  )
  editor.onDidDispose(() => actions.forEach((action) => action.dispose()))
}
