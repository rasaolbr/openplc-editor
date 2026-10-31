import type { DevicePin } from '../../../ports/types'
import { applyFixedPins, type FixedPinDeclaration, matchesFixedPins, parseFixedPins } from '..'

const DI1: FixedPinDeclaration = { pin: 'DI1', pinType: 'digitalInput', address: '%IX0.1' }
const AO1: FixedPinDeclaration = { pin: 'AO1', pinType: 'analogOutput', address: '%QW17' }

describe('parseFixedPins', () => {
  it('returns undefined when nothing is declared', () => {
    expect(parseFixedPins(undefined)).toBeUndefined()
    expect(parseFixedPins('DI1')).toBeUndefined()
    expect(parseFixedPins([])).toBeUndefined()
  })

  it('keeps well-formed channels in declared order, with an optional alias', () => {
    expect(parseFixedPins([DI1, { ...AO1, alias: 'Valve' }])).toEqual([DI1, { ...AO1, alias: 'Valve' }])
  })

  it('drops an entry whose address sits outside the area its type lives in', () => {
    // A digital input at %QX is a typo in hals.json, not a producer for %QX.
    expect(parseFixedPins([{ pin: 'DI1', pinType: 'digitalInput', address: '%QX0.1' }, AO1])).toEqual([AO1])
    expect(parseFixedPins([{ pin: 'AI1', pinType: 'analogInput', address: '%IX0.1' }])).toBeUndefined()
  })

  it('drops malformed entries and duplicate addresses without losing the rest', () => {
    expect(
      parseFixedPins([
        null,
        'DI1',
        { pin: '', pinType: 'digitalInput', address: '%IX0.2' },
        { pin: 'X', pinType: 'relay', address: '%IX0.3' },
        { pin: 'Y', pinType: 'digitalInput', address: 'IX0.4' },
        { pin: 'Z', pinType: 'digitalInput', address: 7 },
        DI1,
        { ...DI1, pin: 'DI1-again' },
        { ...AO1, alias: '' },
      ]),
    ).toEqual([DI1, AO1])
  })
})

describe('applyFixedPins', () => {
  it('seeds the declared channels when the project carries none', () => {
    expect(applyFixedPins(undefined, [DI1, AO1])).toEqual([
      { ...DI1, alias: '' },
      { ...AO1, alias: '' },
    ])
  })

  it('uses the declared alias only when the project has none for that address', () => {
    expect(applyFixedPins([], [{ ...DI1, alias: 'Start' }])).toEqual([{ ...DI1, alias: 'Start' }])
  })

  it("keeps the project's alias and pull for each address and drops everything else", () => {
    const stored: DevicePin[] = [
      { pin: '7', pinType: 'digitalOutput', address: '%IX0.1', alias: 'Start', pull: 'up' },
      { pin: '8', pinType: 'digitalInput', address: '%IX0.0', alias: 'Stray' },
    ]
    expect(applyFixedPins(stored, [{ ...DI1, alias: 'Ignored' }, AO1])).toEqual([
      { ...DI1, alias: 'Start', pull: 'up' },
      { ...AO1, alias: '' },
    ])
  })
})

describe('matchesFixedPins', () => {
  it('is true only for the declared channels in the declared order', () => {
    const applied = applyFixedPins([], [DI1, AO1])
    expect(matchesFixedPins(applied, [DI1, AO1])).toBe(true)
    expect(matchesFixedPins([{ ...applied[0], alias: 'renamed' }, applied[1]], [DI1, AO1])).toBe(true)
    expect(matchesFixedPins([...applied].reverse(), [DI1, AO1])).toBe(false)
    expect(matchesFixedPins(applied.slice(0, 1), [DI1, AO1])).toBe(false)
    expect(matchesFixedPins(undefined, [DI1])).toBe(false)
    expect(matchesFixedPins([{ ...applied[0], pinType: 'digitalOutput' }], [DI1])).toBe(false)
  })
})
