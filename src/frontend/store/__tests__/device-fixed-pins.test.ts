/**
 * A board with fixed on-board I/O (hals.json `fixed_pins`, e.g. the BLIIOT
 * BL-370): its pin bucket always carries exactly the declared channels, keeps
 * the project's aliases, and refuses add / remove / retype / rename-pin.
 */

import { createStore } from 'zustand/vanilla'

import type { BoardInfo, DevicePin } from '../../../middleware/shared/ports/types'
import type { FixedPinDeclaration } from '../../../middleware/shared/utils/fixed-pins'
import { createConsoleSlice } from '../slices/console'
import { createDeviceSlice } from '../slices/device'
import { createEditorSlice } from '../slices/editor'
import { createLibrarySlice } from '../slices/library'
import { createProjectSlice } from '../slices/project/slice'
import type { ProjectSliceRoot } from '../slices/project/types'

const FIXED_BOARD = 'BLIIOT BL-370'
const PLAIN_BOARD = 'OpenPLC Runtime v4'

const FIXED: FixedPinDeclaration[] = [
  { pin: 'DI1', pinType: 'digitalInput', address: '%IX0.1' },
  { pin: 'DO1', pinType: 'digitalOutput', address: '%QX0.1' },
  { pin: 'AI1', pinType: 'analogInput', address: '%IW17' },
]

const boards = (): Map<string, BoardInfo> =>
  new Map<string, BoardInfo>([
    [PLAIN_BOARD, { compiler: 'openplc-compiler', core: '', preview: '', specs: {} }],
    [
      FIXED_BOARD,
      {
        compiler: 'openplc-compiler',
        core: '',
        preview: '',
        specs: {},
        capabilities: { pinMapping: true },
        pins: { fixed: FIXED },
      },
    ],
  ])

function makeStore() {
  return createStore<ProjectSliceRoot>()((...args) => ({
    ...createDeviceSlice(...args),
    ...createProjectSlice(...args),
    ...createConsoleSlice(...args),
    ...createEditorSlice(...args),
    ...createLibrarySlice(...args),
  }))
}

const pinsOf = (store: ReturnType<typeof makeStore>, board: string): DevicePin[] | undefined =>
  store.getState().deviceDefinitions.pinMapping.pinsByBoard[board]

const seeded = (alias = ''): DevicePin[] => FIXED.map((declaration) => ({ ...declaration, alias }))

const configurationFor = (deviceBoard: string) => ({
  deviceBoard,
  communicationPort: '',
  selectedPlatformOptions: {},
})

describe('fixed on-board I/O in the device slice', () => {
  it('seeds the declared channels when the board is selected', () => {
    const store = makeStore()
    store.getState().deviceActions.setAvailableOptions({ availableBoards: boards() })
    store.getState().deviceActions.setDeviceBoard(FIXED_BOARD)
    expect(pinsOf(store, FIXED_BOARD)).toEqual(seeded())
  })

  it('leaves a board without fixed pins alone', () => {
    const store = makeStore()
    store.getState().deviceActions.setAvailableOptions({ availableBoards: boards() })
    store.getState().deviceActions.setDeviceBoard(PLAIN_BOARD)
    expect(pinsOf(store, PLAIN_BOARD)).toBeUndefined()
  })

  it('restores the channels on project load, keeping the saved aliases', () => {
    const store = makeStore()
    store.getState().deviceActions.setAvailableOptions({ availableBoards: boards() })
    store.getState().deviceActions.setDeviceDefinitions({
      configuration: configurationFor(FIXED_BOARD),
      pinMapping: {
        [FIXED_BOARD]: [
          { pin: 'x', pinType: 'digitalOutput', address: '%IX0.1', alias: 'Start' },
          { pin: 'y', pinType: 'digitalInput', address: '%IX0.0', alias: 'Stray' },
        ],
      },
    })
    expect(pinsOf(store, FIXED_BOARD)).toEqual([{ ...FIXED[0], alias: 'Start' }, seeded()[1], seeded()[2]])
  })

  it('applies them when the board list lands after the project', () => {
    // The project can open before board discovery returns.
    const store = makeStore()
    store.getState().deviceActions.setDeviceDefinitions({
      configuration: configurationFor(FIXED_BOARD),
      pinMapping: { [FIXED_BOARD]: [] },
    })
    expect(pinsOf(store, FIXED_BOARD)).toEqual([])
    store.getState().deviceActions.setAvailableOptions({ availableBoards: boards() })
    expect(pinsOf(store, FIXED_BOARD)).toEqual(seeded())
  })

  it('refuses to add or remove a channel', () => {
    const store = makeStore()
    store.getState().deviceActions.setAvailableOptions({ availableBoards: boards() })
    store.getState().deviceActions.setDeviceBoard(FIXED_BOARD)
    store.getState().deviceActions.selectPinTableRow(0)
    store.getState().deviceActions.createNewPin()
    store.getState().deviceActions.removePin()
    expect(pinsOf(store, FIXED_BOARD)).toEqual(seeded())
  })

  it('refuses a new pin name or type, but takes a new alias', () => {
    const store = makeStore()
    store.getState().deviceActions.setAvailableOptions({ availableBoards: boards() })
    store.getState().deviceActions.setDeviceBoard(FIXED_BOARD)
    store.getState().deviceActions.selectPinTableRow(0)

    const retype = store.getState().deviceActions.updatePin({ pinType: 'analogOutput' })
    expect(retype.ok).toBe(false)
    expect(retype.title).toBe('Fixed On-board I/O')
    expect(store.getState().deviceActions.updatePin({ pin: 'X9' }).ok).toBe(false)
    expect(pinsOf(store, FIXED_BOARD)).toEqual(seeded())

    expect(store.getState().deviceActions.updatePin({ alias: 'Start' }).ok).toBe(true)
    expect(pinsOf(store, FIXED_BOARD)?.[0]).toEqual({ ...FIXED[0], alias: 'Start' })
  })
})
