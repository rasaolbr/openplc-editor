import { describe, expect, it } from '@jest/globals'

import { createTestStore } from '../../store/testing'
import { EDITOR_FONT_SIZE_DEFAULT, EDITOR_FONT_SIZE_MAX, EDITOR_FONT_SIZE_STORAGE_KEY } from '../../utils/editor-zoom'
import { changeEditorZoom, type EditorZoomStorage, hydrateEditorZoom } from '../editor-zoom'

function memoryStorage(initial: Record<string, string> = {}): EditorZoomStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

function throwingStorage(): EditorZoomStorage {
  return {
    getItem: () => {
      throw new Error('disabled')
    },
    setItem: () => {
      throw new Error('quota')
    },
  }
}

describe('editor zoom service', () => {
  it('starts at the default font size', () => {
    const store = createTestStore()
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_DEFAULT)
  })

  it('zooms in and out, updating the store and the persisted value', () => {
    const store = createTestStore()
    const storage = memoryStorage()

    expect(changeEditorZoom(store, 'in', storage)).toBe(EDITOR_FONT_SIZE_DEFAULT + 1)
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_DEFAULT + 1)
    expect(storage.data.get(EDITOR_FONT_SIZE_STORAGE_KEY)).toBe(String(EDITOR_FONT_SIZE_DEFAULT + 1))

    changeEditorZoom(store, 'out', storage)
    changeEditorZoom(store, 'out', storage)
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_DEFAULT - 1)
  })

  it('resets to the default size', () => {
    const store = createTestStore()
    const storage = memoryStorage()
    changeEditorZoom(store, 'in', storage)
    changeEditorZoom(store, 'reset', storage)
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_DEFAULT)
  })

  it('restores the persisted size, clamped', () => {
    const store = createTestStore()
    hydrateEditorZoom(store, memoryStorage({ [EDITOR_FONT_SIZE_STORAGE_KEY]: '18' }))
    expect(store.getState().workspace.editorFontSize).toBe(18)

    hydrateEditorZoom(store, memoryStorage({ [EDITOR_FONT_SIZE_STORAGE_KEY]: '999' }))
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_MAX)
  })

  it('keeps working when storage is unavailable or throws', () => {
    const store = createTestStore()
    hydrateEditorZoom(store, undefined)
    hydrateEditorZoom(store, throwingStorage())
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_DEFAULT)

    expect(changeEditorZoom(store, 'in', throwingStorage())).toBe(EDITOR_FONT_SIZE_DEFAULT + 1)
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_DEFAULT + 1)
  })

  it('survives closing the project', () => {
    const store = createTestStore()
    changeEditorZoom(store, 'in', memoryStorage())
    store.getState().workspaceActions.clearWorkspace()
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_DEFAULT + 1)
  })

  it('clamps values set directly through the slice action', () => {
    const store = createTestStore()
    store.getState().workspaceActions.setEditorFontSize(1000)
    expect(store.getState().workspace.editorFontSize).toBe(EDITOR_FONT_SIZE_MAX)
  })
})
