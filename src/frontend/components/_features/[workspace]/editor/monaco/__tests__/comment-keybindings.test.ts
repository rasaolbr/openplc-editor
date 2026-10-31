import { describe, expect, it } from '@jest/globals'
import type * as monacoNs from 'monaco-editor'

import {
  type CommentKeybindingEditor,
  installLineCommentKeybindings,
  lineCommentKeybindings,
  TOGGLE_LINE_COMMENT_ACTION_ID,
  TOGGLE_LINE_COMMENT_PRECONDITION,
  type ToggleLineCommentAction,
} from '../comment-keybindings'

const CTRL_CMD = 2048
const ABNT_C1: monacoNs.KeyCode = 115
const NUMPAD_DIVIDE: monacoNs.KeyCode = 113

function makeEditor() {
  const actions: ToggleLineCommentAction[] = []
  const triggers: Array<{ source: string | null | undefined; handlerId: string; payload: unknown }> = []
  const disposeListeners: Array<() => unknown> = []
  let actionsDisposed = 0

  const editor: CommentKeybindingEditor = {
    addAction: (action) => {
      actions.push(action)
      return {
        dispose: () => {
          actionsDisposed += 1
        },
      }
    },
    trigger: (source, handlerId, payload) => {
      triggers.push({ source, handlerId, payload })
    },
    onDidDispose: (listener) => {
      disposeListeners.push(listener)
      return { dispose: () => undefined }
    },
  }

  return {
    editor,
    actions,
    triggers,
    fireDispose: () => disposeListeners.forEach((listener) => listener()),
    actionsDisposed: () => actionsDisposed,
  }
}

describe('lineCommentKeybindings', () => {
  it('maps Ctrl/Cmd plus the ABNT2 slash key and the numpad slash', () => {
    const chords = lineCommentKeybindings({
      KeyMod: { CtrlCmd: CTRL_CMD },
      KeyCode: { ABNT_C1, NumpadDivide: NUMPAD_DIVIDE },
    })

    expect(chords).toEqual([CTRL_CMD | ABNT_C1, CTRL_CMD | NUMPAD_DIVIDE])
  })
})

describe('installLineCommentKeybindings', () => {
  it('registers one editor-scoped action with the given chords', () => {
    const fake = makeEditor()
    const chords = [CTRL_CMD | ABNT_C1, CTRL_CMD | NUMPAD_DIVIDE]
    installLineCommentKeybindings(fake.editor, chords)

    expect(fake.actions).toHaveLength(1)
    expect(fake.actions[0].id).toBe(TOGGLE_LINE_COMMENT_ACTION_ID)
    expect(fake.actions[0].keybindings).toEqual(chords)
    expect(fake.actions[0].precondition).toBe(TOGGLE_LINE_COMMENT_PRECONDITION)
  })

  it('delegates to Monaco toggle line comment, which handles a single line and multi-line selections', () => {
    const fake = makeEditor()
    installLineCommentKeybindings(fake.editor, [CTRL_CMD | ABNT_C1])

    fake.actions[0].run()

    expect(fake.triggers).toEqual([{ source: 'keyboard', handlerId: 'editor.action.commentLine', payload: {} }])
  })

  it('does not fire on a read-only editor', () => {
    expect(TOGGLE_LINE_COMMENT_PRECONDITION).toContain('!editorReadonly')
  })

  it('disposes the action together with the editor', () => {
    const fake = makeEditor()
    installLineCommentKeybindings(fake.editor, [CTRL_CMD | ABNT_C1])

    expect(fake.actionsDisposed()).toBe(0)
    fake.fireDispose()
    expect(fake.actionsDisposed()).toBe(1)
  })
})
