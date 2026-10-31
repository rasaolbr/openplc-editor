import { describe, expect, it } from '@jest/globals'

import {
  clampEditorFontSize,
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  nextEditorFontSize,
  parseStoredEditorFontSize,
} from '../editor-zoom'

describe('clampEditorFontSize', () => {
  it('keeps the size inside the supported range', () => {
    expect(clampEditorFontSize(EDITOR_FONT_SIZE_MIN - 5)).toBe(EDITOR_FONT_SIZE_MIN)
    expect(clampEditorFontSize(EDITOR_FONT_SIZE_MAX + 5)).toBe(EDITOR_FONT_SIZE_MAX)
    expect(clampEditorFontSize(14)).toBe(14)
  })

  it('rounds to whole pixels and rejects non-finite values', () => {
    expect(clampEditorFontSize(13.6)).toBe(14)
    expect(clampEditorFontSize(Number.NaN)).toBe(EDITOR_FONT_SIZE_DEFAULT)
    expect(clampEditorFontSize(Number.POSITIVE_INFINITY)).toBe(EDITOR_FONT_SIZE_DEFAULT)
  })
})

describe('nextEditorFontSize', () => {
  it('steps up and down by one pixel', () => {
    expect(nextEditorFontSize(12, 'in')).toBe(13)
    expect(nextEditorFontSize(12, 'out')).toBe(11)
  })

  it('stops at the limits', () => {
    expect(nextEditorFontSize(EDITOR_FONT_SIZE_MAX, 'in')).toBe(EDITOR_FONT_SIZE_MAX)
    expect(nextEditorFontSize(EDITOR_FONT_SIZE_MIN, 'out')).toBe(EDITOR_FONT_SIZE_MIN)
  })

  it('resets to the default', () => {
    expect(nextEditorFontSize(20, 'reset')).toBe(EDITOR_FONT_SIZE_DEFAULT)
  })
})

describe('parseStoredEditorFontSize', () => {
  it('reads a valid persisted size', () => {
    expect(parseStoredEditorFontSize('16')).toBe(16)
  })

  it('falls back to the default when missing or malformed', () => {
    expect(parseStoredEditorFontSize(null)).toBe(EDITOR_FONT_SIZE_DEFAULT)
    expect(parseStoredEditorFontSize('')).toBe(EDITOR_FONT_SIZE_DEFAULT)
    expect(parseStoredEditorFontSize('abc')).toBe(EDITOR_FONT_SIZE_DEFAULT)
  })

  it('clamps an out-of-range persisted size', () => {
    expect(parseStoredEditorFontSize('200')).toBe(EDITOR_FONT_SIZE_MAX)
  })
})
