/**
 * `getPlcopenImportFilePath` / `getPlcopenExportSavePath` — focused tests.
 *
 * Electron's `dialog` is mocked (no real native dialog in Jest); the
 * filesystem is real (per-test temp dir) so read/write failure paths
 * are exercised against actual I/O rather than stubbed error shapes.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'

const showOpenDialogMock = jest.fn()
const showSaveDialogMock = jest.fn()

jest.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {
    showOpenDialog: (...args: unknown[]) => showOpenDialogMock(...args),
    showSaveDialog: (...args: unknown[]) => showSaveDialogMock(...args),
  },
}))

import {
  getPdfExportSavePath,
  getPlcopenExportSavePath,
  getPlcopenImportFilePath,
  getProjectPath,
  getSaveAsProjectPath,
} from '../path-picker'

describe('getPlcopenImportFilePath', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plcopen-import-'))
    jest.clearAllMocks()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads and returns the selected file content', async () => {
    const filePath = join(dir, 'program.xml')
    writeFileSync(filePath, '<project/>')
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [filePath] })

    const result = await getPlcopenImportFilePath({} as never)

    expect(showOpenDialogMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: 'Select a PLCopen XML file to import',
        properties: ['openFile'],
        filters: [{ name: 'PLCopen XML', extensions: ['xml'] }],
      }),
    )
    expect(result).toEqual({ success: true, content: '<project/>' })
  })

  it('returns a canceled error when the user dismisses the dialog', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

    const result = await getPlcopenImportFilePath({} as never)

    expect(result).toEqual({
      success: false,
      error: { title: 'Operation canceled', description: 'Operation canceled by the user.' },
    })
  })

  it('returns a read error when the selected file cannot be read', async () => {
    const missingPath = join(dir, 'missing.xml')
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [missingPath] })

    const result = await getPlcopenImportFilePath({} as never)

    expect(result).toEqual({
      success: false,
      error: { title: 'Error reading file', description: 'Failed to read the selected PLCopen XML file.' },
    })
  })
})

describe('getPlcopenExportSavePath', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plcopen-export-'))
    jest.clearAllMocks()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes the XML content to the chosen path', async () => {
    const filePath = join(dir, 'exported.xml')
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath })

    const result = await getPlcopenExportSavePath({} as never, 'exported.xml', '<project/>')

    expect(showSaveDialogMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: 'Export PLCopen XML',
        defaultPath: 'exported.xml',
        filters: [{ name: 'PLCopen XML', extensions: ['xml'] }],
      }),
    )
    expect(result).toEqual({ success: true })
    expect(readFileSync(filePath, 'utf-8')).toBe('<project/>')
  })

  it('reports a cancel, not an error, when the user dismisses the dialog', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })

    const result = await getPlcopenExportSavePath({} as never, 'exported.xml', '<project/>')

    expect(result).toEqual({ success: false, canceled: true })
  })

  it('returns a write error when the target path cannot be written', async () => {
    const badPath = join(dir, 'nonexistent-subdir', 'exported.xml')
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: badPath })

    const result = await getPlcopenExportSavePath({} as never, 'exported.xml', '<project/>')

    expect(result).toEqual({
      success: false,
      error: { title: 'Error writing file', description: 'Failed to write the PLCopen XML file.' },
    })
  })
})

describe('getPdfExportSavePath', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pdf-export-'))
    jest.clearAllMocks()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes the PDF bytes to the chosen path', async () => {
    const filePath = join(dir, 'exported.pdf')
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath })

    const result = await getPdfExportSavePath({} as never, 'exported.pdf', bytes)

    expect(showSaveDialogMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: 'Export PDF',
        defaultPath: 'exported.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      }),
    )
    expect(result).toEqual({ success: true })
    expect(new Uint8Array(readFileSync(filePath))).toEqual(bytes)
  })

  it('returns a canceled result when the user dismisses the dialog', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })

    const result = await getPdfExportSavePath({} as never, 'exported.pdf', new Uint8Array([1]))

    expect(result).toEqual({ success: false, canceled: true })
  })

  it('returns a write error when the target path cannot be written', async () => {
    const badPath = join(dir, 'nonexistent-subdir', 'exported.pdf')
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: badPath })

    const result = await getPdfExportSavePath({} as never, 'exported.pdf', new Uint8Array([1]))

    expect(result).toEqual({
      success: false,
      error: { title: 'Error writing file', description: 'Failed to write the PDF file.' },
    })
  })
})

describe('getSaveAsProjectPath', () => {
  let dir: string
  const scan = { readFiles: ['project.json', 'library.json'], listDirectories: ['pous/programs', 'datatypes'] }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'save-as-'))
    jest.clearAllMocks()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('accepts an empty folder and reports nothing in it', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [dir] })

    const result = await getSaveAsProjectPath({} as never, scan)

    expect(showOpenDialogMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ properties: ['openDirectory', 'createDirectory'] }),
    )
    expect(result).toEqual({ success: true, path: dir, entries: [], files: {}, listed: [] })
  })

  it('accepts a folder that is not empty and reports what the scan asked for', async () => {
    writeFileSync(join(dir, 'project.json'), '{"meta":{}}')
    mkdirSync(join(dir, 'pous', 'programs', 'nested'), { recursive: true })
    writeFileSync(join(dir, 'pous', 'programs', 'main.st'), '')
    writeFileSync(join(dir, 'pous', 'programs', 'nested', 'deep.ld'), '')
    mkdirSync(join(dir, 'other'))
    writeFileSync(join(dir, 'other', 'ignored.st'), '')

    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [dir] })

    const result = await getSaveAsProjectPath({} as never, scan)

    if (!result.success) throw new Error('expected a pick')
    expect([...result.entries].sort()).toEqual(['other', 'pous', 'project.json'])
    // Only the requested files, and only those that exist.
    expect(result.files).toEqual({ 'project.json': '{"meta":{}}' })
    // Recursive, `/`-separated, and only under the requested directories.
    expect([...result.listed].sort()).toEqual(['pous/programs/main.st', 'pous/programs/nested/deep.ld'])
  })

  it('never reads or lists outside the chosen folder', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'save-as-outside-'))
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [dir] })

    const escape = `../${basename(outside)}`
    const result = await getSaveAsProjectPath({} as never, {
      readFiles: [`${escape}/secret.txt`],
      listDirectories: [escape, '.'],
    })
    rmSync(outside, { recursive: true, force: true })

    if (!result.success) throw new Error('expected a pick')
    expect(result.files).toEqual({})
    expect(result.listed).toEqual([])
  })

  it('reports a dismissed dialog as cancelled, not as an error', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

    const result = await getSaveAsProjectPath({} as never, scan)

    expect(result).toEqual({ success: false, cancelled: true })
  })

  it('returns an error when the folder cannot be read', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [join(dir, 'missing')] })

    const result = await getSaveAsProjectPath({} as never, scan)

    expect(result.success).toBe(false)
    expect('error' in result && result.error.title).toBe('Folder could not be read')
  })
})

describe('getProjectPath', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'new-project-'))
    jest.clearAllMocks()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('still refuses a folder that is not empty for a new project', async () => {
    writeFileSync(join(dir, 'project.json'), '{}')
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [dir] })

    const result = await getProjectPath({} as never)

    expect(result).toEqual(expect.objectContaining({ success: false }))
    expect(result.error?.title).toBe('Directory is not empty')
  })
})
