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

import {
  checkoutArcBranch,
  listArcLocalBranches,
  parseArcBranches,
  type ArcBranchJson
} from './arc-branches'

beforeEach(() => {
  arcExecJson.mockReset()
  arcExecFileAsync.mockReset()
})

describe('parseArcBranches', () => {
  it('lists local branch names with the current branch first', () => {
    const entries: ArcBranchJson[] = [
      { local: true, name: 'feature-a' },
      { local: true, name: 'main', current: true },
      { local: true, name: 'feature-b' }
    ]
    expect(parseArcBranches(entries)).toEqual({
      current: 'main',
      branches: ['main', 'feature-a', 'feature-b']
    })
  })

  it('filters out non-local and nameless entries', () => {
    const entries: ArcBranchJson[] = [
      { local: false, name: 'arcadia/trunk' },
      { local: true, name: 'work', current: true },
      { local: true }
    ]
    expect(parseArcBranches(entries)).toEqual({ current: 'work', branches: ['work'] })
  })

  it('reports a null current when no branch is marked', () => {
    expect(parseArcBranches([{ local: true, name: 'x' }])).toEqual({
      current: null,
      branches: ['x']
    })
  })
})

describe('listArcLocalBranches', () => {
  it('runs `arc branch --json -vv` at the arc root and parses it', async () => {
    arcExecJson.mockResolvedValue([{ local: true, name: 'main', current: true }])
    const result = await listArcLocalBranches('/repo')
    expect(result).toEqual({ current: 'main', branches: ['main'] })
    expect(arcExecJson).toHaveBeenCalledWith(['branch', '--json', '-vv'], { cwd: '/repo' })
  })
})

describe('checkoutArcBranch', () => {
  it('switches with `arc checkout <branch>`', async () => {
    arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
    await checkoutArcBranch('/repo', 'feature-a')
    expect(arcExecFileAsync).toHaveBeenCalledWith(['checkout', 'feature-a'], { cwd: '/repo' })
  })

  it('rejects an option-like branch name before running arc', async () => {
    await expect(checkoutArcBranch('/repo', '--force')).rejects.toThrow('invalid_branch_name')
    expect(arcExecFileAsync).not.toHaveBeenCalled()
  })
})
