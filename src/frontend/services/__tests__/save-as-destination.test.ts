import {
  classifySaveAsDestination,
  computeOverwriteDeletions,
  isOpenPlcProjectJson,
  SAVE_AS_SCAN,
} from '../save-as-destination'

const file = (relativePath: string) => ({ relativePath, content: '' })

const incoming = (overrides: Partial<Parameters<typeof computeOverwriteDeletions>[1]> = {}) => ({
  pouFiles: [],
  serverFiles: [],
  remoteDeviceFiles: [],
  dataTypeFiles: [],
  libraryManifest: undefined,
  ...overrides,
})

describe('classifySaveAsDestination', () => {
  it('reads an empty folder as empty', () => {
    expect(classifySaveAsDestination([])).toBe('empty')
  })

  it('ignores the files an OS drops into folders it has shown', () => {
    expect(classifySaveAsDestination(['.DS_Store', 'Thumbs.db', 'desktop.ini'])).toBe('empty')
  })

  it('reads a folder with project.json as a project, whatever else it holds', () => {
    expect(classifySaveAsDestination(['project.json', 'pous', 'devices', '.git'])).toBe('project')
    expect(classifySaveAsDestination(['PROJECT.JSON'])).toBe('project')
  })

  it('reads any other non-empty folder as foreign', () => {
    expect(classifySaveAsDestination(['notes.txt'])).toBe('foreign')
    expect(classifySaveAsDestination(['pous'])).toBe('foreign')
  })
})

describe('isOpenPlcProjectJson', () => {
  it.each(['plc-project', 'plc-library', 'PLC'])('accepts meta.type %s', (type) => {
    expect(isOpenPlcProjectJson(JSON.stringify({ meta: { name: 'p', type }, data: {} }))).toBe(true)
  })

  it('refuses a project.json written by something else', () => {
    expect(isOpenPlcProjectJson(JSON.stringify({ name: 'my-app', version: '1.0.0' }))).toBe(false)
    expect(isOpenPlcProjectJson(JSON.stringify({ meta: { type: 'other' } }))).toBe(false)
  })

  it('refuses content that is not JSON, or nothing at all', () => {
    expect(isOpenPlcProjectJson('{ not json')).toBe(false)
    expect(isOpenPlcProjectJson('')).toBe(false)
    expect(isOpenPlcProjectJson(undefined)).toBe(false)
  })
})

describe('SAVE_AS_SCAN', () => {
  it('asks for the project index and every directory the loader reads', () => {
    expect(SAVE_AS_SCAN.readFiles).toEqual(expect.arrayContaining(['project.json', 'library.json']))
    expect(SAVE_AS_SCAN.listDirectories).toEqual(
      expect.arrayContaining([
        'pous/programs',
        'pous/functions',
        'pous/function-blocks',
        'devices/servers',
        'devices/remote',
        'datatypes',
      ]),
    )
  })
})

describe('computeOverwriteDeletions', () => {
  it('removes the old project files the new project does not write', () => {
    const deletions = computeOverwriteDeletions(
      {
        listed: [
          'pous/programs/main.st',
          'pous/programs/OldProgram.ld',
          'pous/function-blocks/OldFb.st',
          'datatypes/OldType.dt',
          'devices/servers/OldServer.json',
          'devices/remote/OldRemote.json',
        ],
        files: {},
      },
      incoming({ pouFiles: [file('pous/programs/main.st')] }),
    )

    expect(deletions.sort()).toEqual(
      [
        'datatypes/OldType.dt',
        'devices/remote/OldRemote.json',
        'devices/servers/OldServer.json',
        'pous/function-blocks/OldFb.st',
        'pous/programs/OldProgram.ld',
      ].sort(),
    )
  })

  it('removes a POU whose language changed, so two files never claim the same name', () => {
    const deletions = computeOverwriteDeletions(
      { listed: ['pous/programs/main.ld'], files: {} },
      incoming({ pouFiles: [file('pous/programs/main.st')] }),
    )
    expect(deletions).toEqual(['pous/programs/main.ld'])
  })

  it('keeps every file the new project writes, compared case-insensitively and across separators', () => {
    const deletions = computeOverwriteDeletions(
      { listed: ['pous\\programs\\Main.st', 'datatypes/MyType.dt'], files: {} },
      incoming({ pouFiles: [file('pous/programs/main.st')], dataTypeFiles: [file('datatypes/mytype.dt')] }),
    )
    expect(deletions).toEqual([])
  })

  it('keeps files the loader ignores', () => {
    const deletions = computeOverwriteDeletions(
      { listed: ['pous/programs/notes.txt', 'datatypes/readme.md', 'datatypes/Type.st'], files: {} },
      incoming(),
    )
    expect(deletions).toEqual([])
  })

  it('removes library.json when a library is replaced by a project, and keeps it otherwise', () => {
    const existing = { listed: [], files: { 'project.json': '{}', 'library.json': '{}' } }
    expect(computeOverwriteDeletions(existing, incoming())).toEqual(['library.json'])
    expect(computeOverwriteDeletions(existing, incoming({ libraryManifest: '{}' }))).toEqual([])
    expect(computeOverwriteDeletions({ listed: [], files: {} }, incoming())).toEqual([])
  })

  it('lists each stale file once', () => {
    const deletions = computeOverwriteDeletions(
      { listed: ['pous/programs/Old.st', 'pous/programs/old.st'], files: {} },
      incoming(),
    )
    expect(deletions).toHaveLength(1)
  })
})
