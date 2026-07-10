import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// One cross-backend suite for the M4.3 capability contract: it enumerates every
// local source-control capability and pins arc's support tier against it, so a
// silently-dropped arc backend or an un-gated unsupported op fails here. Every
// arc module funnels its process calls through arc-command's arcExecJson /
// arcExecFileAsync, so one pair of spies drives all of them; the argv builders
// stay real so the verb-mapping assertions see arc's true argv. arc has no
// binary in CI, so its half runs entirely on the captured fixtures.
const arcExecJson = vi.fn()
const arcExecFileAsync = vi.fn()
vi.mock('../arc/arc-command', async () => {
  const actual = (await vi.importActual('../arc/arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecJson: (...args: unknown[]) => arcExecJson(...args),
    arcExecFileAsync: (...args: unknown[]) => arcExecFileAsync(...args)
  }
})

import { getArcStatus, getArcUpstreamStatus } from '../arc/arc-status'
import { getArcHistory } from '../arc/arc-history'
import { checkoutArcBranch, listArcLocalBranches } from '../arc/arc-branches'
import { abortArcConflict, getArcConflictOperation } from '../arc/arc-conflict'
import { commitArcChanges } from '../arc/arc-commit'
import { discardArcChanges, stageArcFile, unstageArcFile } from '../arc/arc-stage'
import { fastForwardArc, fetchArc, pullArc, pushArc, rebaseArcFromBase } from '../arc/arc-remote'
import { assertLocalArcOpUnsupported } from './local-vcs-router'
import { clearVcsDetectionCache } from './detect-vcs'

const ROOT = '/arc/mount'

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(__dirname, '..', 'arc', '__fixtures__', `${name}.json`), 'utf-8')
  )
}

function firstArcVerb(): string | undefined {
  return (arcExecFileAsync.mock.calls[0]?.[0] as string[] | undefined)?.[0]
}

describe('VCS capability conformance', () => {
  beforeEach(() => {
    arcExecJson.mockReset()
    arcExecFileAsync.mockReset()
    arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
  })

  describe('required read caps translate arc output into a git-shaped result', () => {
    it('status → GitStatusResult', async () => {
      arcExecJson.mockResolvedValue(fixture('status-branch'))
      const result = await getArcStatus(ROOT)
      expect(Array.isArray(result.entries)).toBe(true)
      expect(typeof result.conflictOperation).toBe('string')
      expect(result.upstreamStatus).toMatchObject({ hasUpstream: true })
    })

    it('upstream → GitUpstreamStatus', async () => {
      arcExecJson.mockResolvedValue(fixture('status-branch'))
      expect(await getArcUpstreamStatus(ROOT)).toMatchObject({
        hasUpstream: true,
        ahead: expect.any(Number),
        behind: expect.any(Number)
      })
    })

    it('history → GitHistoryResult', async () => {
      arcExecJson.mockImplementation((argv: string[]) =>
        Promise.resolve(argv[0] === 'info' ? fixture('info') : fixture('log'))
      )
      const result = await getArcHistory(ROOT)
      expect(Array.isArray(result.items)).toBe(true)
      expect(typeof result.hasMore).toBe('boolean')
      expect(typeof result.limit).toBe('number')
    })

    it('branch list → RuntimeGitLocalBranches', async () => {
      arcExecJson.mockResolvedValue(fixture('branch-vv'))
      const result = await listArcLocalBranches(ROOT)
      expect(Array.isArray(result.branches)).toBe(true)
      expect('current' in result).toBe(true)
    })

    it('conflict operation → GitConflictOperation', async () => {
      arcExecJson.mockResolvedValue(fixture('status-conflict-branch'))
      expect(await getArcConflictOperation(ROOT)).toBe('rebase')
    })
  })

  describe('required write/remote caps map to the intended arc verb', () => {
    const cases: { cap: string; verb: string; run: () => Promise<unknown> }[] = [
      { cap: 'commit', verb: 'commit', run: () => commitArcChanges(ROOT, 'msg') },
      { cap: 'stage', verb: 'add', run: () => stageArcFile(ROOT, 'a.txt') },
      { cap: 'unstage', verb: 'reset', run: () => unstageArcFile(ROOT, 'a.txt') },
      { cap: 'discard', verb: 'checkout', run: () => discardArcChanges(ROOT, 'a.txt') },
      { cap: 'checkout', verb: 'checkout', run: () => checkoutArcBranch(ROOT, 'feature') },
      { cap: 'fetch', verb: 'fetch', run: () => fetchArc(ROOT) },
      { cap: 'pull', verb: 'pull', run: () => pullArc(ROOT) },
      { cap: 'fast-forward', verb: 'pull', run: () => fastForwardArc(ROOT) },
      { cap: 'rebase', verb: 'rebase', run: () => rebaseArcFromBase(ROOT, 'trunk') },
      { cap: 'push', verb: 'push', run: () => pushArc(ROOT) }
    ]
    for (const { cap, verb, run } of cases) {
      it(`${cap} → arc ${verb}`, async () => {
        await run()
        expect(firstArcVerb()).toBe(verb)
      })
    }

    it('abort → arc rebase --abort for an in-progress rebase', async () => {
      arcExecJson.mockResolvedValue(fixture('status-conflict-branch'))
      await abortArcConflict(ROOT)
      expect(arcExecFileAsync).toHaveBeenCalledWith(['rebase', '--abort'], expect.anything())
    })
  })

  describe('unsupported caps are gated for arc, never silently run git plumbing', () => {
    let tmpDir: string
    let arcRepo: string

    beforeEach(() => {
      tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-vcs-conformance-')))
      arcRepo = join(tmpDir, 'arcrepo')
      mkdirSync(join(arcRepo, '.arc'), { recursive: true })
      clearVcsDetectionCache()
      process.env.ORCA_ARC_VCS = '1'
    })

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true })
      clearVcsDetectionCache()
      delete process.env.ORCA_ARC_VCS
    })

    // The four local ops that have an SSH fork but no arc backend (M4.0). Each
    // must fail loud with its capability name instead of running git plumbing
    // against the FUSE mount.
    for (const label of [
      'Branch comparison',
      'Commit comparison',
      'Fork sync',
      'Pull request field generation'
    ]) {
      it(`${label} fails loud`, () => {
        expect(() => assertLocalArcOpUnsupported(arcRepo, label)).toThrow(
          `${label} is not supported for arc worktrees yet`
        )
      })
    }

    it('force-push-with-lease is absent: arc upstream never emits the patch-equivalence trigger', async () => {
      // behindCommitsArePatchEquivalent is the only signal that flips the primary
      // action to force-push-with-lease; arc has no --force-with-lease, so its
      // upstream status omits it and a diverged branch routes to Sync instead.
      arcExecJson.mockResolvedValue(fixture('status-diverged'))
      const result = await getArcUpstreamStatus(arcRepo)
      expect(result.behindCommitsArePatchEquivalent).toBeUndefined()
    })
  })
})
