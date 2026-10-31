/**
 * Giving a project a new home.
 *
 * The ordering is the substance here. A project retrieved from a device refuses
 * a user save and points at Save As, so Save As is the only way out for it --
 * which means a failed one must leave that refusal intact. Adopting the
 * destination before the write succeeds would clear the very marker protecting
 * the project, and leave it pointing at a directory that does not contain it.
 */

import type { PlatformCapabilities } from '../../../middleware/shared/ports/platform-capabilities'
import type { ProjectPort } from '../../../middleware/shared/ports/project-port'
import type { OpenPLCStore } from '../../store'
import { createTestStore } from '../../store/testing'
import { SAVE_AS_SCAN } from '../save-as-destination'
import { executeSaveProjectAs } from '../save-project-as'

const capabilities = { isNativeApplication: true } as PlatformCapabilities

function makePort(overrides: Partial<ProjectPort> = {}): ProjectPort {
  return {
    pickPath: () => Promise.resolve({ success: true, path: '/chosen/place' }),
    saveProject: () => Promise.resolve({ success: true }),
    ...overrides,
  } as unknown as ProjectPort
}

let store: OpenPLCStore

const workspace = () => store.getState().workspace
const projectPath = () => store.getState().project.meta.path

beforeEach(() => {
  store = createTestStore()
  store.getState().workspaceActions.setIsEphemeralProject(true)
  store.getState().projectActions.updateMetaPath('/scratch/original')
})

it('writes the project to the chosen folder and adopts it', async () => {
  let written: { projectPath?: string } | undefined
  const port = makePort({
    saveProject: (files) => {
      written = files
      return Promise.resolve({ success: true })
    },
  })

  const result = await executeSaveProjectAs(store, port, capabilities)

  expect(result.success).toBe(true)
  expect(written?.projectPath).toBe('/chosen/place')
  expect(projectPath()).toBe('/chosen/place')
})

it('clears the ephemeral marker so an ordinary save works from then on', async () => {
  // The whole reason Save As exists for a retrieved project.
  await executeSaveProjectAs(store, makePort(), capabilities)
  expect(workspace().isEphemeralProject).toBe(false)
})

it('leaves everything untouched when the write fails', async () => {
  // Adopting the destination first would point the project at a folder that
  // does not contain it, and would drop the refusal that is protecting it.
  const port = makePort({
    saveProject: () => Promise.resolve({ success: false, error: 'disk full' }),
  })

  const result = await executeSaveProjectAs(store, port, capabilities)

  expect(result.success).toBe(false)
  expect(projectPath()).toBe('/scratch/original')
  expect(workspace().isEphemeralProject).toBe(true)
})

it('treats cancelling as an ordinary outcome, not a failure', async () => {
  const port = makePort({ pickPath: () => Promise.resolve({ success: false }) })

  const result = await executeSaveProjectAs(store, port, capabilities)

  expect(result.cancelled).toBe(true)
  expect(projectPath()).toBe('/scratch/original')
  expect(workspace().isEphemeralProject).toBe(true)
})

it('never carries deletions to the new location', async () => {
  // The destination is fresh. A deletion list from the old location would
  // remove files there that were never copied.
  let written: { deletions?: string[] } | undefined
  const port = makePort({
    saveProject: (files) => {
      written = files
      return Promise.resolve({ success: true })
    },
  })

  await executeSaveProjectAs(store, port, capabilities)

  expect(written?.deletions).toEqual([])
})

it('reports platforms that cannot choose a folder rather than failing silently', async () => {
  const port = makePort({ pickPath: undefined })
  const result = await executeSaveProjectAs(store, port, capabilities)
  expect(result.success).toBe(false)
  expect(workspace().isEphemeralProject).toBe(true)
})

/**
 * The Save As picker that accepts a folder that is not empty. A retrieved project is usually saved over the project
 * the user had open, so a folder holding an OpenPLC project is replaced once the user agrees; anything else is refused.
 */
describe('with the Save As picker', () => {
  const PROJECT_JSON = JSON.stringify({ meta: { name: 'old', type: 'plc-project' }, data: {} })

  type Pick = Awaited<ReturnType<NonNullable<ProjectPort['pickSaveAsPath']>>>

  function pickerAnswering(pick: Pick) {
    const calls: unknown[] = []
    const writes: Array<{ projectPath: string; deletions: string[] }> = []
    const port = makePort({
      pickPath: () => Promise.reject(new Error('the new-project picker must not be used')),
      pickSaveAsPath: (scan) => {
        calls.push(scan)
        return Promise.resolve(pick)
      },
      saveProject: (files) => {
        writes.push({ projectPath: files.projectPath, deletions: files.deletions })
        return Promise.resolve({ success: true })
      },
    })
    return { port, calls, writes }
  }

  /** Answers the replace dialog the moment it opens, the way the dialog itself does. */
  function answerReplaceDialog(answer: boolean | 'closed-from-outside') {
    const unsubscribe = store.subscribe((state) => {
      const modal = state.modals['confirm-overwrite-project']
      if (!modal.open) return
      unsubscribe()
      if (answer === 'closed-from-outside') {
        state.modalActions.closeModal()
        return
      }
      const data = modal.data as { onResolve: (overwrite: boolean) => void }
      data.onResolve(answer)
      state.modalActions.onOpenChange('confirm-overwrite-project', false)
    })
    return unsubscribe
  }

  it('asks the platform for what the replace decision needs', async () => {
    const { port, calls } = pickerAnswering({ success: true, path: '/empty', entries: [], files: {}, listed: [] })
    await executeSaveProjectAs(store, port, capabilities)
    expect(calls).toEqual([SAVE_AS_SCAN])
  })

  it('saves into an empty folder without asking and without deletions', async () => {
    const { port, writes } = pickerAnswering({ success: true, path: '/empty', entries: [], files: {}, listed: [] })

    const result = await executeSaveProjectAs(store, port, capabilities)

    expect(result).toEqual({ success: true, projectPath: '/empty' })
    expect(writes).toEqual([{ projectPath: '/empty', deletions: [] }])
    expect(store.getState().modals['confirm-overwrite-project'].open).toBe(false)
    expect(workspace().isEphemeralProject).toBe(false)
  })

  it('refuses a folder with files that are not an OpenPLC project', async () => {
    const { port, writes } = pickerAnswering({
      success: true,
      path: '/documents',
      entries: ['report.docx'],
      files: {},
      listed: [],
    })

    const result = await executeSaveProjectAs(store, port, capabilities)

    expect(result.success).toBe(false)
    expect(writes).toEqual([])
    expect(projectPath()).toBe('/scratch/original')
    expect(workspace().isEphemeralProject).toBe(true)
  })

  it('refuses a folder whose project.json is not an OpenPLC one', async () => {
    const { port, writes } = pickerAnswering({
      success: true,
      path: '/node-app',
      entries: ['project.json', 'src'],
      files: { 'project.json': JSON.stringify({ name: 'node-app' }) },
      listed: [],
    })

    const result = await executeSaveProjectAs(store, port, capabilities)

    expect(result.success).toBe(false)
    expect(writes).toEqual([])
    expect(store.getState().modals['confirm-overwrite-project'].open).toBe(false)
  })

  it('replaces an OpenPLC project once the user agrees, removing what the new project does not write', async () => {
    const { port, writes } = pickerAnswering({
      success: true,
      path: '/projects/line-1',
      entries: ['project.json', 'pous', 'devices', '.git'],
      files: { 'project.json': PROJECT_JSON },
      listed: ['pous/programs/OldMain.st', 'devices/servers/OldServer.json', 'pous/programs/notes.txt'],
    })
    answerReplaceDialog(true)

    const result = await executeSaveProjectAs(store, port, capabilities)

    expect(result).toEqual({ success: true, projectPath: '/projects/line-1' })
    expect(writes).toHaveLength(1)
    expect(writes[0].projectPath).toBe('/projects/line-1')
    expect(writes[0].deletions.sort()).toEqual(['devices/servers/OldServer.json', 'pous/programs/OldMain.st'])
    expect(projectPath()).toBe('/projects/line-1')
    expect(workspace().isEphemeralProject).toBe(false)
  })

  it('shows the folder in the replace dialog', async () => {
    const { port } = pickerAnswering({
      success: true,
      path: '/projects/line-1',
      entries: ['project.json'],
      files: { 'project.json': PROJECT_JSON },
      listed: [],
    })
    let shownPath: unknown
    const unsubscribe = store.subscribe((state) => {
      const modal = state.modals['confirm-overwrite-project']
      if (!modal.open) return
      unsubscribe()
      shownPath = (modal.data as { projectPath: string }).projectPath
      ;(modal.data as { onResolve: (overwrite: boolean) => void }).onResolve(false)
    })

    await executeSaveProjectAs(store, port, capabilities)

    expect(shownPath).toBe('/projects/line-1')
  })

  it('leaves everything as it was when the user declines', async () => {
    const { port, writes } = pickerAnswering({
      success: true,
      path: '/projects/line-1',
      entries: ['project.json'],
      files: { 'project.json': PROJECT_JSON },
      listed: ['pous/programs/OldMain.st'],
    })
    answerReplaceDialog(false)

    const result = await executeSaveProjectAs(store, port, capabilities)

    expect(result).toEqual({ success: false, cancelled: true })
    expect(writes).toEqual([])
    expect(projectPath()).toBe('/scratch/original')
    expect(workspace().isEphemeralProject).toBe(true)
  })

  it('treats the dialog being closed by another flow as declining, rather than waiting forever', async () => {
    const { port, writes } = pickerAnswering({
      success: true,
      path: '/projects/line-1',
      entries: ['project.json'],
      files: { 'project.json': PROJECT_JSON },
      listed: [],
    })
    answerReplaceDialog('closed-from-outside')

    const result = await executeSaveProjectAs(store, port, capabilities)

    expect(result).toEqual({ success: false, cancelled: true })
    expect(writes).toEqual([])
  })

  it('treats a dismissed picker as cancelled and a picker error as a failure', async () => {
    const cancelled = pickerAnswering({ success: false, cancelled: true })
    expect(await executeSaveProjectAs(store, cancelled.port, capabilities)).toEqual({
      success: false,
      cancelled: true,
    })

    const failed = pickerAnswering({ success: false, error: { title: 'Folder could not be read', description: 'x' } })
    expect(await executeSaveProjectAs(store, failed.port, capabilities)).toEqual({ success: false })
    expect(failed.writes).toEqual([])
    expect(workspace().isEphemeralProject).toBe(true)
  })

  it('keeps the replaced project in place when the write fails', async () => {
    const { port } = pickerAnswering({
      success: true,
      path: '/projects/line-1',
      entries: ['project.json'],
      files: { 'project.json': PROJECT_JSON },
      listed: [],
    })
    const failingPort = { ...port, saveProject: () => Promise.resolve({ success: false, error: 'disk full' }) }
    answerReplaceDialog(true)

    const result = await executeSaveProjectAs(store, failingPort, capabilities)

    expect(result.success).toBe(false)
    expect(projectPath()).toBe('/scratch/original')
    expect(workspace().isEphemeralProject).toBe(true)
  })
})
