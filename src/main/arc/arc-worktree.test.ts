import { beforeEach, describe, expect, it, vi } from 'vitest'

const rm = vi.fn()
vi.mock('fs/promises', () => ({ rm: (...args: unknown[]) => rm(...args) }))

const arcExecFileAsync = vi.fn()
const arcExecJson = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecFileAsync: (...args: unknown[]) => arcExecFileAsync(...args),
    arcExecJson: (...args: unknown[]) => arcExecJson(...args)
  }
})

import {
  addArcWorktree,
  assertArcWorktreeRemovable,
  listArcWorktrees,
  remountArcWorktrees,
  removeArcWorktree,
  type ArcInfoJson,
  type ArcMountListEntry
} from './arc-worktree'

const HOME = '/Users/darl'
const PROJECT = 'sdg/simulator/flash'

beforeEach(() => {
  arcExecFileAsync.mockReset()
  arcExecJson.mockReset()
  rm.mockReset()
  arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
})

describe('addArcWorktree', () => {
  it('mounts at the computed layout, creates the branch off base, and shapes the result', async () => {
    const info: ArcInfoJson = { branch: 'my-feature', hash: 'deadbeef', repository: 'arcadia' }
    arcExecJson.mockResolvedValue(info)

    const result = await addArcWorktree({
      projectSubpath: PROJECT,
      branch: 'my-feature',
      base: 'trunk',
      repo: 'arcadia',
      home: HOME
    })

    const mountCall = arcExecFileAsync.mock.calls[0][0] as string[]
    expect(mountCall).toEqual([
      'mount',
      '-m',
      '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/my-feature',
      '-S',
      '/Users/darl/.arc/stores/sdg%2Fsimulator%2Fflash__my-feature',
      '--object-store',
      '/Users/darl/.arc/orca-object-store',
      '-r',
      'arcadia'
    ])
    const checkoutCall = arcExecFileAsync.mock.calls[1]
    expect(checkoutCall[0]).toEqual(['checkout', '-b', 'my-feature', 'trunk'])
    expect((checkoutCall[1] as { cwd: string }).cwd).toBe(
      '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/my-feature'
    )

    expect(result.worktree).toEqual({
      path: '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/my-feature/sdg/simulator/flash',
      head: 'deadbeef',
      branch: 'refs/heads/my-feature',
      isBare: false,
      isMainWorktree: false
    })
  })
})

describe('listArcWorktrees', () => {
  it('filters mounts to the project prefix and reads branch/head from arc info', async () => {
    const mounts: ArcMountListEntry[] = [
      {
        status: 'mounted',
        mount: '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/feat-a'
      },
      {
        status: 'mounted',
        mount: '/Users/darl/arcadia-wt/other%2Fproject/feat-b'
      },
      { status: 'mounted', mount: '/Users/darl/arcadia' }
    ]
    arcExecJson.mockImplementation(async (args: string[]) => {
      if (args[0] === 'mount') {
        return mounts
      }
      return { branch: 'feat-a', hash: 'aaa111' } satisfies ArcInfoJson
    })

    const worktrees = await listArcWorktrees({ projectSubpath: PROJECT, home: HOME })
    expect(worktrees).toEqual([
      {
        path: '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/feat-a/sdg/simulator/flash',
        head: 'aaa111',
        branch: 'refs/heads/feat-a',
        isBare: false,
        isMainWorktree: false
      }
    ])
  })

  it('falls back to the path-tail branch and empty head for an unmounted entry', async () => {
    arcExecJson.mockResolvedValue([
      {
        status: 'unmounted',
        mount: '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/parked'
      }
    ] satisfies ArcMountListEntry[])

    const worktrees = await listArcWorktrees({ projectSubpath: PROJECT, home: HOME })
    expect(worktrees).toEqual([
      {
        path: '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/parked/sdg/simulator/flash',
        head: '',
        branch: 'refs/heads/parked',
        isBare: false,
        isMainWorktree: false
      }
    ])
    // No arc info call for an unmounted entry.
    expect(arcExecJson).toHaveBeenCalledTimes(1)
  })
})

describe('assertArcWorktreeRemovable', () => {
  const AGENT_CWD = '/Users/darl/arcadia-wt/x/feat/sub'

  function mockStatus(entries: unknown[]): void {
    arcExecJson.mockImplementation(async (args: string[]) => {
      if (args[0] === 'status') {
        return { status: { staged: [], changed: entries, untracked: [], unmerged: [] } }
      }
      return { branch: 'feat', remote: '' } satisfies ArcInfoJson
    })
  }

  it('passes when clean and nothing is unpushed', async () => {
    mockStatus([])
    arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
    await expect(assertArcWorktreeRemovable({ agentCwd: AGENT_CWD })).resolves.toBeUndefined()
  })

  it('throws when the working tree is dirty', async () => {
    mockStatus([{ path: 'a.ts', status: 'modified' }])
    await expect(assertArcWorktreeRemovable({ agentCwd: AGENT_CWD })).rejects.toThrow(
      /uncommitted or untracked/
    )
  })

  it('throws when the branch has unpushed commits', async () => {
    mockStatus([])
    arcExecFileAsync.mockResolvedValue({ stdout: 'abc123 wip\n', stderr: '' })
    await expect(assertArcWorktreeRemovable({ agentCwd: AGENT_CWD })).rejects.toThrow(/not pushed/)
  })

  it('skips all checks when forced', async () => {
    await expect(
      assertArcWorktreeRemovable({ agentCwd: AGENT_CWD, force: true })
    ).resolves.toBeUndefined()
    expect(arcExecJson).not.toHaveBeenCalled()
  })
})

describe('remountArcWorktrees', () => {
  it('remounts only unmounted entries under ~/arcadia-wt, leaving others alone', async () => {
    arcExecJson.mockResolvedValue([
      { status: 'unmounted', mount: '/Users/darl/arcadia-wt/a/feat' },
      { status: 'mounted', mount: '/Users/darl/arcadia-wt/b/feat' },
      { status: 'unmounted', mount: '/Users/darl/some-other-mount' },
      { status: 'unmounted', mount: '/Users/darl/arcadia-wt/c/feat' }
    ] satisfies ArcMountListEntry[])

    const result = await remountArcWorktrees({ home: HOME })
    expect(result.remounted).toEqual([
      '/Users/darl/arcadia-wt/a/feat',
      '/Users/darl/arcadia-wt/c/feat'
    ])
    expect(result.failed).toEqual([])
    expect(arcExecFileAsync).toHaveBeenCalledWith(
      ['mount', '/Users/darl/arcadia-wt/a/feat'],
      expect.objectContaining({ cwd: HOME })
    )
    expect(arcExecFileAsync).not.toHaveBeenCalledWith(
      ['mount', '/Users/darl/some-other-mount'],
      expect.anything()
    )
  })

  it('records a failed remount instead of throwing', async () => {
    arcExecJson.mockResolvedValue([
      { status: 'unmounted', mount: '/Users/darl/arcadia-wt/a/feat' }
    ] satisfies ArcMountListEntry[])
    arcExecFileAsync.mockRejectedValue(new Error('fuse busy'))

    const result = await remountArcWorktrees({ home: HOME })
    expect(result.remounted).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].mount).toBe('/Users/darl/arcadia-wt/a/feat')
  })
})

describe('removeArcWorktree', () => {
  it('unmounts with --forget and removes the mount directory', async () => {
    await removeArcWorktree({
      agentCwd: '/Users/darl/arcadia-wt/x/feat/sub',
      mountPath: '/Users/darl/arcadia-wt/x/feat',
      home: HOME,
      force: true
    })
    expect(arcExecFileAsync).toHaveBeenCalledWith(
      ['unmount', '/Users/darl/arcadia-wt/x/feat', '--forget'],
      expect.objectContaining({ cwd: HOME })
    )
    expect(rm).toHaveBeenCalledWith('/Users/darl/arcadia-wt/x/feat', {
      recursive: true,
      force: true
    })
  })
})
