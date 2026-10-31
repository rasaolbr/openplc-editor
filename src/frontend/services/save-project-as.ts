/**
 * Give a project a home.
 *
 * This exists because of the state a retrieved project starts in: it lives in a
 * scratch directory, so a user-initiated Save is refused and told to use Save
 * As instead. Without this, that message points nowhere and the project can
 * never be saved at all -- the refusal would be a dead end rather than a
 * redirection.
 *
 * It is not retrieval-specific. Any project can be written somewhere else, and
 * the retrieved case is simply the one where it is not optional.
 *
 * The destination may be an empty folder, or a folder holding an OpenPLC
 * project, which is replaced after the user confirms. A folder holding anything
 * else is refused.
 */

import type { PlatformCapabilities } from '../../middleware/shared/ports/platform-capabilities'
import type { ProjectPort } from '../../middleware/shared/ports/project-port'
import type { OpenPLCStore } from '../store'
import { flushFlowWriteBacks } from '../store/slices/shared/flow-writeback'
import { toast } from '../utils/toast'
import { buildAllProjectFileContents, flushGlobalVariableListDrafts } from './save-actions'
import {
  classifySaveAsDestination,
  computeOverwriteDeletions,
  type ExistingDestination,
  isOpenPlcProjectJson,
  SAVE_AS_SCAN,
} from './save-as-destination'

export interface SaveProjectAsResult {
  success: boolean
  /** Where it went. Absent when the user cancelled or the write failed. */
  projectPath?: string
  /** True when the user closed the picker without choosing. Not a failure. */
  cancelled?: boolean
}

/**
 * Ask for a destination, write the project there, and adopt it as the
 * project's location.
 *
 * The order matters: the destination is only adopted once the write has
 * actually succeeded. Setting the path first and writing second would leave a
 * project pointing at a directory that does not contain it if the write failed
 * -- and, for a retrieved project, would clear the very flag that is protecting
 * it from a save that goes nowhere.
 */
export async function executeSaveProjectAs(
  store: OpenPLCStore,
  projectPort: ProjectPort,
  _capabilities: PlatformCapabilities,
): Promise<SaveProjectAsResult> {
  const destination = await chooseDestination(projectPort)
  if (destination.status === 'unavailable') {
    toast({
      title: 'Save As is not available here',
      description: 'This platform cannot choose a folder to save into.',
      variant: 'fail',
    })
    return { success: false }
  }
  if (destination.status === 'cancelled') {
    // Cancelling is an ordinary outcome and says nothing to the user.
    return { success: false, cancelled: true }
  }
  if (destination.status === 'failed') {
    toast({ title: destination.error.title, description: destination.error.description, variant: 'fail' })
    return { success: false }
  }

  const destinationPath = destination.path
  // `null` existing: the legacy picker only ever answers with an empty folder.
  const existing = destination.existing
  const kind = existing === null ? 'empty' : classifySaveAsDestination(existing.entries)
  if (kind === 'foreign' || (kind === 'project' && !isOpenPlcProjectJson(existing?.files['project.json']))) {
    toast(FOREIGN_FOLDER)
    return { success: false }
  }
  if (kind === 'project' && !(await askToReplaceProject(store, destinationPath))) {
    return { success: false, cancelled: true }
  }

  // Flush pending editor buffers before reading the project, exactly as the
  // ordinary save does. `buildAllProjectFileContents` reads the store as it
  // stands, so without this a graphical edit still inside its debounce window,
  // or a global variable list still in its text buffer, would be written out in
  // its pre-edit state -- and Save As would then adopt the destination and
  // report success for content the user can see is not what they have.
  const staleFlows = flushFlowWriteBacks(store.getState)
  flushGlobalVariableListDrafts(store)

  const state = store.getState()
  const contents = buildAllProjectFileContents(store)

  const files = {
    projectPath: destinationPath,
    projectJson: contents['project.json'] ?? '',
    deviceConfig: contents['devices/configuration.json'],
    pinMapping: contents['devices/pin-mapping.json'],
    libraryManifest: contents['library.json'],
    pouFiles: toEntries(contents, 'pous/'),
    serverFiles: toEntries(contents, 'devices/servers/'),
    remoteDeviceFiles: toEntries(contents, 'devices/remote/'),
    dataTypeFiles: toEntries(contents, 'datatypes/'),
    // Never the old location's pending deletions: they name files of a different folder. A replaced project gets
    // its own list below.
    deletions: [] as string[],
  }

  if (staleFlows.length > 0) {
    // Same rule the ordinary save applies: a flow that failed validation keeps
    // its pre-edit body, so writing it and calling the project saved would be a
    // lie about work the user can see on screen.
    toast({
      title: 'Some diagrams could not be saved',
      description: 'Fix the reported diagram errors, then try Save As again.',
      variant: 'fail',
    })
    return { success: false }
  }

  if (kind === 'project' && existing !== null) {
    // The editor loads every POU, data type and device file it finds, so the replaced project's leftovers go.
    files.deletions = computeOverwriteDeletions(existing, files)
  }

  const written = await projectPort.saveProject(files)
  if (!written.success) {
    toast({
      title: 'Could not save the project there',
      description: written.error ?? 'The files could not be written to that folder.',
      variant: 'fail',
    })
    return { success: false }
  }

  // Adopt the new location only now. A project that has one is no longer
  // ephemeral, so an ordinary Save works from here on.
  state.projectActions.updateMetaPath(destinationPath)
  state.workspaceActions.setIsEphemeralProject(false)
  // And onto the recent list. Opening a project tracks it as a side effect of
  // reading it; this is the one flow that gives a project a location without a
  // read, and it is how a retrieved project — untracked while it sits in
  // scratch — becomes one the user keeps.
  //
  // Best effort, and deliberately not awaited into the success path: the files
  // are already written and the project has already adopted its new location by
  // this point, so a bookkeeping failure must not cost the user the toast that
  // tells them the save worked. Both call sites use `void`, so a rejection here
  // would have been an unhandled one.
  void projectPort.trackRecentProject?.(destinationPath)?.catch(() => {
    // Nothing to tell the user: the save succeeded, and the row reappears the
    // next time they open the project.
  })

  toast({
    title: 'Project saved',
    description: `Saved to ${destinationPath}.`,
    variant: 'default',
  })
  return { success: true, projectPath: destinationPath }
}

const FOREIGN_FOLDER = {
  title: 'Folder is not empty',
  description:
    'The selected folder has files that are not an OpenPLC project. Choose an empty folder or a folder with an OpenPLC project.',
  variant: 'fail',
} as const

type Destination =
  | { status: 'picked'; path: string; existing: (ExistingDestination & { entries: string[] }) | null }
  | { status: 'cancelled' }
  | { status: 'failed'; error: { title: string; description: string } }
  | { status: 'unavailable' }

/** The Save As picker when the platform has one, otherwise the new-project picker, which only accepts empty folders. */
async function chooseDestination(projectPort: ProjectPort): Promise<Destination> {
  if (projectPort.pickSaveAsPath) {
    const picked = await projectPort.pickSaveAsPath(SAVE_AS_SCAN)
    if (picked.success) {
      return {
        status: 'picked',
        path: picked.path,
        existing: { entries: picked.entries, files: picked.files, listed: picked.listed },
      }
    }
    return 'error' in picked ? { status: 'failed', error: picked.error } : { status: 'cancelled' }
  }
  if (!projectPort.pickPath) return { status: 'unavailable' }

  const picked = await projectPort.pickPath()
  if (picked.success && picked.path) return { status: 'picked', path: picked.path, existing: null }
  return picked.error ? { status: 'failed', error: picked.error } : { status: 'cancelled' }
}

/**
 * Ask before replacing a project, and wait for the answer. A close from outside the dialog (another flow closing
 * every modal) counts as a refusal, so the Save As never hangs.
 */
function askToReplaceProject(store: OpenPLCStore, projectPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let unsubscribe = (): void => {}
    const settle = (overwrite: boolean): void => {
      if (settled) return
      settled = true
      unsubscribe()
      resolve(overwrite)
    }
    // Subscribed before opening, so a close in the same tick as the open is still seen.
    unsubscribe = store.subscribe((state) => {
      if (!state.modals['confirm-overwrite-project']?.open) settle(false)
    })
    store.getState().modalActions.openModal('confirm-overwrite-project', { projectPath, onResolve: settle })
  })
}

/** The entries under one directory prefix, as the write shape expects. */
function toEntries(contents: Record<string, string>, prefix: string) {
  return Object.entries(contents)
    .filter(([path]) => path.startsWith(prefix))
    .map(([relativePath, content]) => ({ relativePath, content }))
}
