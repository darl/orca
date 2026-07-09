import { beforeEach, describe, expect, it, vi } from 'vitest'

const arcExecJson = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecJson: (...args: unknown[]) => arcExecJson(...args)
  }
})

import { getArcUpstreamStatus } from './arc-status'

beforeEach(() => {
  arcExecJson.mockReset()
})

describe('getArcUpstreamStatus', () => {
  it('reports the tracked remote with inline ahead/behind', async () => {
    arcExecJson.mockResolvedValue({
      status: {},
      branch_info: { remote: { name: 'arcadia/users/darl/x' }, ahead: 2, behind: 3 }
    })
    expect(await getArcUpstreamStatus('/repo')).toEqual({
      hasUpstream: true,
      upstreamName: 'arcadia/users/darl/x',
      ahead: 2,
      behind: 3
    })
    expect(arcExecJson).toHaveBeenCalledWith(['status', '--json', '--branch'], { cwd: '/repo' })
  })

  it('reports no upstream for a local-only branch', async () => {
    arcExecJson.mockResolvedValue({ status: {}, branch_info: {} })
    expect(await getArcUpstreamStatus('/repo')).toEqual({
      hasUpstream: false,
      ahead: 0,
      behind: 0
    })
  })
})
