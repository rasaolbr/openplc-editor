/**
 * Fixed on-board I/O declared by a target.
 *
 * Some Runtime v4 boards carry I/O the runtime drives through its own plugin
 * (the BLIIOT BL-370's `bliiot_io` plugin is the first). The editor has no
 * screen for that hardware, so before this module every located variable on
 * those channels failed the "nothing produces this address" gate: the
 * producers it knows are pins, VPP slots, Modbus points, EtherCAT channels and
 * servers, and the plugin is none of them.
 *
 * A board declares its channels as `fixed_pins` in hals.json. They ride the
 * existing pin-mapping producer, which is already the one producer the address
 * registry keeps PINNED, so nothing downstream needs a new kind: the IEC
 * allocator packs Modbus and EtherCAT around them, the location dropdown
 * offers them, and the compile counts them as producers.
 *
 * What makes them FIXED is that the addresses are the plugin's, not the
 * editor's. The pin table may rename a channel (its alias) but never add,
 * remove, retype or renumber one, and `applyFixedPins` restores the declared
 * set whenever a project, a board switch or an edit would drift from it.
 */

import type { DevicePin, PinType } from '../../ports/types'
import { parseAddress, prefixOf } from '../iec-address/registry/address-space'

/** One channel as hals.json declares it. `alias` is only a suggestion: a
 *  project's own alias for the same address wins. */
export interface FixedPinDeclaration {
  pin: string
  pinType: PinType
  address: string
  alias?: string
}

/** The IEC area each pin type has to live in. A declaration outside it is a
 *  typo in hals.json, and is dropped rather than shipped as a producer for an
 *  area the plugin does not write. */
const PREFIX_FOR_PIN_TYPE: Record<PinType, string> = {
  digitalInput: '%IX',
  digitalOutput: '%QX',
  analogInput: '%IW',
  analogOutput: '%QW',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate a raw `fixed_pins` value.
 *
 * Returns `undefined` when nothing usable is declared, so callers can test
 * the result for presence alone. Invalid entries and duplicate addresses are
 * skipped: hals.json is a file on disk, and one bad line must not turn a board
 * into one with no producers at all.
 */
export function parseFixedPins(raw: unknown): FixedPinDeclaration[] | undefined {
  if (!Array.isArray(raw)) return undefined

  const seen = new Set<string>()
  const pins: FixedPinDeclaration[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const { pin, pinType, address, alias } = entry
    if (typeof pin !== 'string' || pin.trim() === '') continue
    if (typeof pinType !== 'string' || !(pinType in PREFIX_FOR_PIN_TYPE)) continue
    if (typeof address !== 'string') continue

    const parsed = parseAddress(address)
    if (!parsed || prefixOf(parsed.cls) !== PREFIX_FOR_PIN_TYPE[pinType as PinType]) continue
    if (seen.has(address)) continue
    seen.add(address)

    const declaration: FixedPinDeclaration = { pin, pinType: pinType as PinType, address }
    if (typeof alias === 'string' && alias !== '') declaration.alias = alias
    pins.push(declaration)
  }
  return pins.length > 0 ? pins : undefined
}

/**
 * The pin list a fixed-I/O board must carry: exactly the declared channels,
 * in declared order, keeping the alias (and pull, if any) the project already
 * gave each ADDRESS.
 *
 * Matched by address because that is the channel's identity here: the plugin
 * reads and writes addresses, so a stored pin at `%IX0.1` is DI1 whatever its
 * pin name says.
 */
export function applyFixedPins(
  stored: readonly DevicePin[] | undefined,
  fixed: readonly FixedPinDeclaration[],
): DevicePin[] {
  const byAddress = new Map((stored ?? []).map((pin) => [pin.address, pin]))
  return fixed.map((declaration) => {
    const previous = byAddress.get(declaration.address)
    const pin: DevicePin = {
      pin: declaration.pin,
      pinType: declaration.pinType,
      address: declaration.address,
      alias: previous?.alias ?? declaration.alias ?? '',
    }
    if (previous?.pull) pin.pull = previous.pull
    return pin
  })
}

/** Whether `stored` already is what `applyFixedPins` would produce, so callers
 *  can skip a write (and the address recalculation it triggers). */
export function matchesFixedPins(
  stored: readonly DevicePin[] | undefined,
  fixed: readonly FixedPinDeclaration[],
): boolean {
  if (!stored || stored.length !== fixed.length) return false
  return fixed.every((declaration, index) => {
    const pin = stored[index]
    return pin.pin === declaration.pin && pin.pinType === declaration.pinType && pin.address === declaration.address
  })
}
