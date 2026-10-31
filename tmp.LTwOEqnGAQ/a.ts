import type * as monacoNs from 'monaco-editor'

export const TOGGLE_LINE_COMMENT_ACTION_ID = 'openplc.editor.toggleLineCommentAltKeys'

export const TOGGLE_LINE_COMMENT_PRECONDITION = 'editorTextFocus && !editorReadonly'

export type ToggleLineCommentAction = Pick<
  monacoNs.editor.IActionDescriptor,
  'id' | 'label' | 'keybindings' | 'precondition'
> & {
  run: () => void
}

export type CommentKeybindingEditor = Pick<monacoNs.editor.IStandaloneCodeEditor, 'onDidDispose' | 'trigger'> & {
  addAction: (action: ToggleLineCommentAction) => monacoNs.IDisposable
}

export type CommentKeyCodeSource = {
  KeyMod: { CtrlCmd: number }
  KeyCode: { ABNT_C1: monacoNs.KeyCode; NumpadDivide: monacoNs.KeyCode }
}

/**
 * Extra chords for Monaco's "Toggle Line Comment". Monaco binds only Ctrl/Cmd+Slash (the US `/` key),
 * so the `/` key of ABNT2 keyboards (IntlRo, `ABNT_C1`) and the numpad `/` get their own chords here.
 */
export function lineCommentKeybindings(source: CommentKeyCodeSource): number[] {
  return [source.KeyMod.CtrlCmd | source.KeyCode.ABNT_C1, source.KeyMod.CtrlCmd | source.KeyCode.NumpadDivide]
}

/**
 * Binds the given chords to `editor.action.commentLine` on this editor only.
 *
 * `addAction`, not `addCommand`: an `addCommand` keybinding is shared by every mounted editor and
 * would run on whichever editor mounted last.
 */
export function installLineCommentKeybindings(editor: CommentKeybindingEditor, keybindings: number[]): void {
  const action = editor.addAction({
    id: TOGGLE_LINE_COMMENT_ACTION_ID,
    label: 'Toggle Line Comment',
    keybindings,
    precondition: TOGGLE_LINE_COMMENT_PRECONDITION,
    run: () => {
      editor.trigger('keyboard', 'editor.action.commentLine', {})
    },
  })
  editor.onDidDispose(() => action.dispose())
}
