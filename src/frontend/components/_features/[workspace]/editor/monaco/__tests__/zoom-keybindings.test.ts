import { describe, expect, it } from '@jest/globals'
import type * as monacoNs from 'monaco-editor'

import type { EditorZoomDirection } from '../../../../../../utils/editor-zoom'
import {
  EDITOR_ZOOM_ACTION_IDS,
  EDITOR_ZOOM_PRECONDITION,
  type EditorZoomAction,
  editorZoomKeybindings,
  installEditorZoomKeybindings,
  type ZoomKeybindingEditor,
} from '../zoom-keybindings'

const CTRL_CMD = 2048
const SHIFT = 1024
const EQUAL: monacoNs.KeyCode = 86
const MINUS: monacoNs.KeyCode = 88
const DIGIT0: monacoNs.KeyCode = 21
const NUMPAD_ADD: monacoNs.KeyCode = 109
const NUMPAD_SUBTRACT: monacoNs.KeyCode = 111
const NUMPAD0: monacoNs.KeyCode = 98

const SOURCE = {
  KeyMod: { CtrlCmd: CTRL_CMD, Shift: SHIFT },
  KeyCode: {
    Equal: EQUAL,
    Minus: MINUS,
    Digit0: DIGIT0,
    NumpadAdd: NUMPAD_ADD,
    NumpadSubtract: NUMPAD_SUBTRACT,
    Numpad0: NUMPAD0,
  },
}

function makeEditor() {
  const actions: EditorZoomAction[] = []
  const disposeListeners: Array<() => unknown> = []
  let actionsDisposed = 0

  const editor: ZoomKeybindingEditor = {
    addAction: (action) => {
      actions.push(action)
      return {
        dispose: () => {
          actionsDisposed += 1
        },
      }
    },
    onDidDispose: (listener) => {
      disposeListeners.push(listener)
      return { dispose: () => undefined }
    },
  }

  return {
    editor,
    actions,
    fireDispose: () => disposeListeners.forEach((listener) => listener()),
    actionsDisposed: () => actionsDisposed,
  }
}

describe('editorZoomKeybindings', () => {
  it('maps Ctrl/Cmd with = and + (main row and numpad) to zoom in', () => {
    expect(editorZoomKeybindings(SOURCE).in).toEqual([
      CTRL_CMD | EQUAL,
      CTRL_CMD | SHIFT | EQUAL,
      CTRL_CMD | NUMPAD_ADD,
    ])
  })

  it('maps Ctrl/Cmd with - (main row and numpad) to zoom out', () => {
    expect(editorZoomKeybindings(SOURCE).out).toEqual([CTRL_CMD | MINUS, CTRL_CMD | NUMPAD_SUBTRACT])
  })

  it('maps Ctrl/Cmd with 0 (main row and numpad) to reset', () => {
    expect(editorZoomKeybindings(SOURCE).reset).toEqual([CTRL_CMD | DIGIT0, CTRL_CMD | NUMPAD0])
  })
})

describe('installEditorZoomKeybindings', () => {
  it('registers one editor-scoped action per direction', () => {
    const fake = makeEditor()
    const chords = editorZoomKeybindings(SOURCE)
    installEditorZoomKeybindings(fake.editor, chords, () => undefined)

    expect(fake.actions.map((a) => a.id)).toEqual([
      EDITOR_ZOOM_ACTION_IDS.in,
      EDITOR_ZOOM_ACTION_IDS.out,
      EDITOR_ZOOM_ACTION_IDS.reset,
    ])
    expect(fake.actions.map((a) => a.keybindings)).toEqual([chords.in, chords.out, chords.reset])
    fake.actions.forEach((a) => expect(a.precondition).toBe(EDITOR_ZOOM_PRECONDITION))
  })

  it('fires only while the text area has focus', () => {
    expect(EDITOR_ZOOM_PRECONDITION).toBe('editorTextFocus')
  })

  it('forwards each action to the zoom handler', () => {
    const fake = makeEditor()
    const calls: EditorZoomDirection[] = []
    installEditorZoomKeybindings(fake.editor, editorZoomKeybindings(SOURCE), (direction) => calls.push(direction))

    fake.actions.forEach((a) => a.run())

    expect(calls).toEqual(['in', 'out', 'reset'])
  })

  it('disposes the actions together with the editor', () => {
    const fake = makeEditor()
    installEditorZoomKeybindings(fake.editor, editorZoomKeybindings(SOURCE), () => undefined)

    fake.fireDispose()
    expect(fake.actionsDisposed()).toBe(3)
  })
})
