/**
 * The BLIIOT BL-370 target: Runtime v4 plus the on-board I/O its `bliiot_io`
 * runtime plugin drives at fixed addresses.
 *
 * Before the target existed, a BL-370 project compiled for the generic
 * "OpenPLC Runtime v4" refused every located variable on those channels
 * ("Nothing produces %IX on this target") because the plugin is invisible to
 * the editor. These cases pin the shipped hals.json entry to the plugin's
 * default map and check the gate now accepts exactly that map and nothing
 * beside it.
 */

import { applyFixedPins, parseFixedPins } from '@root/middleware/shared/utils/fixed-pins'
import {
  resolveAddressProducerCapabilities,
  resolveTargetCapabilities,
} from '@root/middleware/shared/utils/target-capabilities'
import { classifyBoardRuntime } from '@root/middleware/shared/utils/target-capabilities/runtime-kind'

import halsContent from '../../firmware/hals.json'
import { BoardInfoResolver, type HalsFileContent } from '../../hardware/board-info-resolver'
import type { PLCProjectData, PLCVariable } from '../../types/PLC/open-plc'
import { computeIoImage, IMAGE_AREAS_RUNTIME_V4 } from '../steps/compute-io-image'

const BOARD = 'BLIIOT BL-370'
const hals = halsContent as unknown as HalsFileContent
const entry = hals[BOARD]

const located = (name: string, location: string, value = 'BOOL'): PLCVariable => ({
  name,
  location,
  documentation: '',
  type: { definition: 'base-type', value: value as 'BOOL' },
})

const project = (variables: PLCVariable[]): PLCProjectData => ({
  pous: [
    {
      type: 'program',
      data: { name: 'main', language: 'st', variables, documentation: '', body: { language: 'st', value: '' } },
    },
  ],
  dataTypes: [],
  libraries: [],
  servers: [],
  remoteDevices: [],
  configuration: { resource: { tasks: [], instances: [], globalVariables: [] } },
})

const imageFor = (variables: PLCVariable[]) =>
  computeIoImage({
    projectData: project(variables),
    devicePinMapping: applyFixedPins([], parseFixedPins(entry.fixed_pins) ?? []),
    capabilities: resolveAddressProducerCapabilities(entry),
    serverCapabilities: resolveTargetCapabilities(entry),
    areas: IMAGE_AREAS_RUNTIME_V4,
  })

describe('the BLIIOT BL-370 hals.json entry', () => {
  it('is a Runtime v4 target with the pin table on', () => {
    expect(classifyBoardRuntime(BOARD, entry.compiler).isRuntimeV4).toBe(true)
    const caps = resolveTargetCapabilities(entry)
    expect(caps.pinMapping).toBe(true)
    expect(caps.debuggerTransports).toEqual(['websocket'])
    expect(caps.modbusTcpRemote && caps.ethercat && caps.modbusTcpServer && caps.opcuaServer && caps.s7Server).toBe(
      true,
    )
  })

  it("declares the plugin's default map: bits from .1, analogs from word 17", () => {
    // /etc/openplc/bliiot_io.json defaults: digital byte 0 / first_bit 1,
    // ai_iw_start 17, ao_qw_start 17, four channels each.
    expect(parseFixedPins(entry.fixed_pins)).toEqual([
      { pin: 'DI1', pinType: 'digitalInput', address: '%IX0.1' },
      { pin: 'DI2', pinType: 'digitalInput', address: '%IX0.2' },
      { pin: 'DI3', pinType: 'digitalInput', address: '%IX0.3' },
      { pin: 'DI4', pinType: 'digitalInput', address: '%IX0.4' },
      { pin: 'DO1', pinType: 'digitalOutput', address: '%QX0.1' },
      { pin: 'DO2', pinType: 'digitalOutput', address: '%QX0.2' },
      { pin: 'DO3', pinType: 'digitalOutput', address: '%QX0.3' },
      { pin: 'DO4', pinType: 'digitalOutput', address: '%QX0.4' },
      { pin: 'AI1', pinType: 'analogInput', address: '%IW17' },
      { pin: 'AI2', pinType: 'analogInput', address: '%IW18' },
      { pin: 'AI3', pinType: 'analogInput', address: '%IW19' },
      { pin: 'AI4', pinType: 'analogInput', address: '%IW20' },
      { pin: 'AO1', pinType: 'analogOutput', address: '%QW17' },
      { pin: 'AO2', pinType: 'analogOutput', address: '%QW18' },
      { pin: 'AO3', pinType: 'analogOutput', address: '%QW19' },
      { pin: 'AO4', pinType: 'analogOutput', address: '%QW20' },
    ])
  })

  it('reaches the compile as fixedPins through the board resolver', () => {
    const resolver = new BoardInfoResolver({
      halsContent: hals,
      packageManager: { listInstalled: () => [], getInstalledPackageManifest: () => null },
      resolveHalSourcePath: (source: string) => source,
      resolvePackageRelativePath: (base: string, rel: string) => `${base}/${rel}`,
    } as unknown as ConstructorParameters<typeof BoardInfoResolver>[0])
    expect(resolver.resolve(BOARD).fixedPins).toHaveLength(16)
    expect(resolver.resolve('OpenPLC Runtime v4').fixedPins).toBeUndefined()
  })
})

describe('compiling a BL-370 project', () => {
  it('accepts the homelab project that the generic Runtime v4 target refused', () => {
    const image = imageFor([
      located('DI1', '%IX0.1'),
      located('DI2', '%IX0.2'),
      located('DI3', '%IX0.3'),
      located('DI4', '%IX0.4'),
      located('D01', '%QX0.1'),
      located('DO2', '%QX0.2'),
      located('DO3', '%QX0.3'),
      located('DO4', '%QX0.4'),
      located('AI1', '%IW17', 'INT'),
      located('AO1', '%QW17', 'INT'),
    ])
    expect(image.unbacked).toEqual([])
    expect(image.unsupported).toEqual([])
  })

  it('sizes every area far enough for the plugin to reach its last channel', () => {
    // The plugin indexes bool_output[byte][bit] and int_output[word] directly,
    // so the image has to cover %QX0.4 and %QW20 even if the program only
    // uses the first channel.
    const image = imageFor([located('DI1', '%IX0.1')])
    expect(image.sizes['%IX']).toBe(5)
    expect(image.sizes['%QX']).toBe(5)
    expect(image.sizes['%IW']).toBe(21)
    expect(image.sizes['%QW']).toBe(21)
  })

  it('still refuses the addresses the plugin does not drive', () => {
    const image = imageFor([
      located('a', '%IX0.0'),
      located('b', '%IX0.5'),
      located('c', '%QX0.0'),
      located('d', '%IW16', 'INT'),
      located('e', '%QW21', 'INT'),
    ])
    expect(image.unbacked.map((issue) => issue.location)).toEqual(['%IX0.0', '%IX0.5', '%QX0.0', '%IW16', '%QW21'])
  })
})
