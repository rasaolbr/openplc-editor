/**
 * Retrieve a project from a PLC on the start screen, then keep it with Save As.
 *
 * The start screen offers Open > "Retrieve from PLC…", so no project has to be created or opened first. A retrieved
 * project has no location, and Save As accepts an empty folder or a folder holding an OpenPLC project, which it
 * replaces once the user agrees; a folder holding anything else is refused.
 *
 * Only the edges are stubbed in the main process: LAN discovery, the runtime login, the device download (it answers
 * with a fixture directory, as the real handler answers with the scratch directory it unpacked into) and the native
 * folder dialog. Everything between them is the real app.
 *
 * Running this suite needs a production build plus the preload at the path a NON-packaged app looks for it; see
 * "Electron e2e" in CLAUDE.md. No CI workflow runs Playwright today, so this is a local check.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, expect, test } from '@playwright/test'

const ROOT = join(realpathSync(tmpdir()), 'openplc-e2e-retrieve-save-as')
const USER_DATA = join(ROOT, 'userdata')
/** What the device "sent", already unpacked. */
const RETRIEVED = join(ROOT, 'retrieved')
/** The project the user keeps on disk and wants to replace with the one from the PLC. */
const EXISTING = join(ROOT, 'existing')
/** A folder with files that are not an OpenPLC project. */
const FOREIGN = join(ROOT, 'foreign')
/** A folder with nothing in it. */
const EMPTY = join(ROOT, 'empty')

const DEVICE_IP = '192.168.77.10'
const RETRIEVED_NAME = 'from-plc'
const RETRIEVED_MAIN = 'PROGRAM main\n  VAR\n    fromPlc : BOOL;\n  END_VAR\n\nfromPlc := TRUE;\n\nEND_PROGRAM\n'

function projectJson(name: string): string {
  return JSON.stringify({
    meta: { name, type: 'plc-project' },
    data: {
      dataTypes: [],
      pous: [],
      configuration: {
        resource: {
          tasks: [{ name: 'task0', triggering: 'Cyclic', interval: 'T#20ms', priority: 1 }],
          instances: [{ name: 'instance0', program: 'main', task: 'task0' }],
          globalVariables: [],
        },
      },
      libraries: [],
      debugVariables: { global: [], pous: {} },
    },
  })
}

function writeProject(dir: string, name: string, pous: Record<string, string>): void {
  mkdirSync(join(dir, 'pous', 'programs'), { recursive: true })
  mkdirSync(join(dir, 'devices'), { recursive: true })
  writeFileSync(join(dir, 'project.json'), projectJson(name))
  writeFileSync(
    join(dir, 'devices', 'configuration.json'),
    JSON.stringify({ deviceBoard: 'OpenPLC Runtime v4', communicationPort: '', runtimeIpAddress: DEVICE_IP }),
  )
  writeFileSync(join(dir, 'devices', 'pin-mapping.json'), '{}')
  for (const [file, body] of Object.entries(pous)) writeFileSync(join(dir, 'pous', 'programs', file), body)
}

function writeFixtures(): void {
  rmSync(ROOT, { recursive: true, force: true })

  writeProject(RETRIEVED, RETRIEVED_NAME, { 'main.st': RETRIEVED_MAIN })
  writeProject(EXISTING, 'kept-on-disk', {
    'main.st': 'PROGRAM main\n  VAR\n    old : BOOL;\n  END_VAR\n\nold := TRUE;\n\nEND_PROGRAM\n',
    'OldOnly.st': 'PROGRAM OldOnly\n  VAR\n    x : BOOL;\n  END_VAR\n\nx := x;\n\nEND_PROGRAM\n',
  })
  writeFileSync(join(EXISTING, 'README.md'), 'notes the user keeps beside the project')

  mkdirSync(FOREIGN, { recursive: true })
  writeFileSync(join(FOREIGN, 'report.txt'), 'not a project')
  mkdirSync(EMPTY, { recursive: true })

  const history = join(USER_DATA, 'User', 'History')
  mkdirSync(history, { recursive: true })
  writeFileSync(join(history, 'projects.json'), '[]')
  writeFileSync(join(history, 'libraries.json'), '[]')
  const runtime = join(USER_DATA, 'User', 'Runtime')
  mkdirSync(runtime, { recursive: true })
  writeFileSync(join(runtime, 'arduino-core-control.json'), '[]')
  writeFileSync(join(runtime, 'arduino-library-control.json'), '[]')
}

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(__dirname, '..', 'release', 'app', 'dist', 'main', 'main.js'), `--user-data-dir=${USER_DATA}`],
    // NOT development: `resolveHtmlPath` would point the window at the webpack dev server.
    env: { ...process.env, NODE_ENV: 'production' },
  })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      try {
        if (w.url().includes('index.html')) {
          await w.waitForLoadState('domcontentloaded')
          // Below 1024px wide the layout hides itself; a headless display may open a smaller window.
          await app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('index.html'))
            win?.setSize(1440, 900)
          })
          await w.getByRole('button', { name: /new project/i }).waitFor({ timeout: 30000 })
          await stubDeviceEdges(app)
          return { app, page: w }
        }
      } catch {
        /* window is closing; skip it */
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  await shutdown(app)
  throw new Error('main window never appeared')
}

/** One device on the LAN that accepts any login and hands back the fixture project. */
async function stubDeviceEdges(app: ElectronApplication): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, { ip, retrieved, name }) => {
      ipcMain.removeHandler('runtime:discover-devices')
      ipcMain.handle('runtime:discover-devices', () => ({
        success: true,
        devices: [{ ipAddress: ip, hostname: 'line-plc', projectName: name, projectTimestamp: '' }],
      }))
      ipcMain.removeHandler('runtime:login')
      ipcMain.handle('runtime:login', () => ({ success: true, accessToken: 'e2e-token' }))
      ipcMain.removeHandler('runtime:retrieve-project')
      ipcMain.handle('runtime:retrieve-project', () => ({
        success: true,
        projectPath: retrieved,
        projectName: name,
        libraries: [],
      }))
    },
    { ip: DEVICE_IP, retrieved: RETRIEVED, name: RETRIEVED_NAME },
  )
}

/** The next native folder dialog answers with `folder`. */
const nextFolderDialogPicks = (app: ElectronApplication, folder: string) =>
  app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
  }, folder)

/** Save As is a native menu accelerator, which Playwright's keyboard never reaches. */
const saveAs = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html'))
    win?.webContents.send('project:save-as-accelerator')
  })

/** The quit confirmation holds every quit, so `app.close()` would hang. */
async function shutdown(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  if (proc.exitCode !== null) return
  const exited = new Promise((resolve) => proc.once('exit', resolve))
  proc.kill('SIGKILL')
  await exited
}

const listing = (dir: string) => readdirSync(dir, { recursive: true, encoding: 'utf-8' }).sort()

test.describe.configure({ mode: 'serial' })

test('retrieves from the start screen and saves over an existing OpenPLC project only after confirmation', async () => {
  test.setTimeout(180000)
  writeFixtures()
  const existingBefore = listing(EXISTING)
  const { app, page } = await launch()

  try {
    // 1. Open > Retrieve from PLC…, with no project open.
    await page.getByRole('button', { name: /^open$/i }).click()
    await page.getByRole('menuitem', { name: /retrieve from plc/i }).click()
    await expect(page.getByText('Retrieve Project from PLC')).toBeVisible()

    // 2. Pick the device, sign in, retrieve.
    await page.getByRole('button', { name: new RegExp(RETRIEVED_NAME) }).click({ timeout: 30000 })
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder('Username').fill('admin')
    await page.getByPlaceholder('Password').fill('admin')
    await page.getByRole('button', { name: 'Sign in and retrieve' }).click()

    // The workspace opens on the retrieved project.
    await expect(page.getByText(`Retrieved "${RETRIEVED_NAME}"`).first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('button', { name: /new project/i })).toHaveCount(0)

    // 3. A folder with other files is refused, and nothing is written there.
    await nextFolderDialogPicks(app, FOREIGN)
    await saveAs(app)
    await expect(page.getByText('Folder is not empty').first()).toBeVisible({ timeout: 15000 })
    expect(listing(FOREIGN)).toEqual(['report.txt'])

    // 4. A folder with an OpenPLC project asks first; declining leaves it untouched.
    await nextFolderDialogPicks(app, EXISTING)
    await saveAs(app)
    await expect(page.getByText('Replace the existing project?')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('confirm-overwrite-project-path')).toHaveText(EXISTING)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Replace the existing project?')).toHaveCount(0)
    expect(listing(EXISTING)).toEqual(existingBefore)
    expect(JSON.parse(readFileSync(join(EXISTING, 'project.json'), 'utf-8')).meta.name).toBe('kept-on-disk')

    // 5. Agreeing replaces the project: its files are the retrieved ones, the old-only POU is gone, other files stay.
    await saveAs(app)
    await page.getByRole('button', { name: 'Replace project' }).click({ timeout: 15000 })
    await expect(page.getByText(`Saved to ${EXISTING}.`).first()).toBeVisible({ timeout: 15000 })

    expect(JSON.parse(readFileSync(join(EXISTING, 'project.json'), 'utf-8')).meta.name).toBe(RETRIEVED_NAME)
    expect(readFileSync(join(EXISTING, 'pous', 'programs', 'main.st'), 'utf-8')).toContain('fromPlc')
    expect(existsSync(join(EXISTING, 'pous', 'programs', 'OldOnly.st'))).toBe(false)
    expect(readFileSync(join(EXISTING, 'README.md'), 'utf-8')).toBe('notes the user keeps beside the project')

    // 6. The project now has a location, so a further Save As into an empty folder writes without asking.
    await nextFolderDialogPicks(app, EMPTY)
    await saveAs(app)
    await expect(page.getByText(`Saved to ${EMPTY}.`).first()).toBeVisible({ timeout: 15000 })
    expect(JSON.parse(readFileSync(join(EMPTY, 'project.json'), 'utf-8')).meta.name).toBe(RETRIEVED_NAME)
    await expect(page.getByText('Replace the existing project?')).toHaveCount(0)
  } finally {
    await shutdown(app)
  }
})
