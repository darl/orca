import { beforeEach, describe, expect, it, vi } from 'vitest'

const arcExecJson = vi.fn()
const arcExecFileAsync = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecJson: (...args: unknown[]) => arcExecJson(...args),
    arcExecFileAsync: (...args: unknown[]) => arcExecFileAsync(...args)
  }
})

import { abortArcConflict, getArcConflictOperation } from './arc-conflict'

// Minimal arc status --branch --json carrying just the sequencer.
function statusWithSequencer(sequencer?: string): unknown {
  return {
    status: {},
    branch_info: sequencer ? { sequencer } : {}
  }
}

function lastArgv(): string[] | undefined {
  return arcExecFileAsync.mock.calls.at(-1)?.[0] as string[] | undefined
}

beforeEach(() => {
  arcExecJson.mockReset()
  arcExecFileAsync.mockReset()
  arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
})

describe('getArcConflictOperation', () => {
  it.each([
    ['rebase', 'rebase'],
    ['merge', 'merge'],
    ['cherry-pick', 'cherry-pick']
  ])('maps sequencer %s to %s', async (sequencer, expected) => {
    arcExecJson.mockResolvedValue(statusWithSequencer(sequencer))
    expect(await getArcConflictOperation('/repo')).toBe(expected)
    expect(arcExecJson).toHaveBeenCalledWith(['status', '--json', '--branch'], { cwd: '/repo' })
  })

  it('reports unknown when no sequencer is active', async () => {
    arcExecJson.mockResolvedValue(statusWithSequencer(undefined))
    expect(await getArcConflictOperation('/repo')).toBe('unknown')
  })
})

describe('abortArcConflict', () => {
  it.each([
    ['rebase', ['rebase', '--abort']],
    ['cherry-pick', ['cherry-pick', '--abort']],
    ['merge', ['up', '--abort']]
  ])('aborts a %s with the matching arc command', async (sequencer, expected) => {
    arcExecJson.mockResolvedValue(statusWithSequencer(sequencer))
    await abortArcConflict('/repo')
    expect(lastArgv()).toEqual(expected)
  })

  it('no-ops when nothing is in progress', async () => {
    arcExecJson.mockResolvedValue(statusWithSequencer(undefined))
    await abortArcConflict('/repo')
    expect(arcExecFileAsync).not.toHaveBeenCalled()
  })
})
