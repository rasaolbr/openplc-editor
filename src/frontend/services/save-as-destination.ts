/**
 * What a Save As destination already holds, and what replacing it means.
 *
 * Pure functions: the platform only lists the folder and reads files, every decision is made here so desktop and
 * web answer the same way.
 */

import { z } from 'zod'

import type { SaveAsScanRequest, WriteProjectFiles } from '../../middleware/shared/ports/project-port'

/** `empty` is written as is, `project` only after the user agrees to replace it, `foreign` is refused. */
export type SaveAsDestinationKind = 'empty' | 'project' | 'foreign'

/** Files an OS drops into any folder it has shown; they do not make a folder "not empty". */
const IGNORED_ENTRIES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

export function classifySaveAsDestination(entries: readonly string[]): SaveAsDestinationKind {
  const relevant = entries.filter((entry) => !IGNORED_ENTRIES.has(entry.toLowerCase()))
  if (relevant.length === 0) return 'empty'
  return relevant.some((entry) => entry.toLowerCase() === 'project.json') ? 'project' : 'foreign'
}

const ProjectJsonMetaSchema = z.object({
  meta: z.object({ type: z.enum(['plc-project', 'plc-library', 'PLC']) }),
})

/** A `project.json` belongs to OpenPLC only when its `meta.type` is one this editor writes. */
export function isOpenPlcProjectJson(content: string | undefined): boolean {
  if (!content) return false
  try {
    return ProjectJsonMetaSchema.safeParse(JSON.parse(content)).success
  } catch {
    return false
  }
}

/** The directories the editor loads project files from when it opens a project. */
const LOADED_DIRECTORIES = [
  'pous/functions',
  'pous/function-blocks',
  'pous/programs',
  'devices/servers',
  'devices/remote',
  'datatypes',
] as const

/** Extensions the loader picks up: `.dt` under `datatypes/`, the POU set everywhere else. */
const LOADED_EXTENSIONS = ['.st', '.il', '.ld', '.fbd', '.py', '.cpp', '.json']

/** What the platform has to report about a Save As destination for the decisions below. */
export const SAVE_AS_SCAN: SaveAsScanRequest = {
  readFiles: ['project.json', 'library.json'],
  listDirectories: [...LOADED_DIRECTORIES],
}

function isLoadedOnOpen(path: string): boolean {
  const lower = path.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const extension = dot === -1 ? '' : lower.slice(dot)
  if (lower.startsWith('datatypes/')) return extension === '.dt'
  return LOADED_DIRECTORIES.some((dir) => lower.startsWith(`${dir}/`)) && LOADED_EXTENSIONS.includes(extension)
}

type IncomingProjectFiles = Pick<
  WriteProjectFiles,
  'pouFiles' | 'serverFiles' | 'remoteDeviceFiles' | 'dataTypeFiles' | 'libraryManifest'
>

/** What is already in the destination, as the platform reported it for `SAVE_AS_SCAN`. */
export interface ExistingDestination {
  listed: readonly string[]
  files: Readonly<Record<string, string>>
}

const toForwardSlashes = (path: string): string => path.replace(/\\/g, '/')

/**
 * Files of the project being replaced that the incoming project does not write.
 *
 * The editor loads every POU, data type and device file it finds on disk, so leaving these behind would merge the
 * old project into the new one on the next open. Files the loader ignores are kept. Compared case-insensitively for
 * Windows and macOS file systems.
 */
export function computeOverwriteDeletions(existing: ExistingDestination, incoming: IncomingProjectFiles): string[] {
  const written = new Set(
    [...incoming.pouFiles, ...incoming.serverFiles, ...incoming.remoteDeviceFiles, ...incoming.dataTypeFiles].map(
      (file) => toForwardSlashes(file.relativePath).toLowerCase(),
    ),
  )

  const deletions: string[] = []
  const seen = new Set<string>()
  for (const listedPath of existing.listed) {
    const path = toForwardSlashes(listedPath)
    const key = path.toLowerCase()
    if (!isLoadedOnOpen(path) || written.has(key) || seen.has(key)) continue
    seen.add(key)
    deletions.push(path)
  }

  if (existing.files['library.json'] !== undefined && incoming.libraryManifest === undefined) {
    deletions.push('library.json')
  }

  return deletions
}
