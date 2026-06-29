import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { getArcStatus } from './arc-status'

// Real end-to-end check against a live arc mount. Skipped unless ARC_INTEGRATION=1
// AND an arc working copy exists at ~/arcadia — it shells out to the real `arc`
// binary, so it never runs in CI. Run locally with:
//   ARC_INTEGRATION=1 pnpm test src/main/arc/arc-status.integration.test.ts
const ARC_ROOT = join(homedir(), 'arcadia')
const ENABLED = process.env.ARC_INTEGRATION === '1' && existsSync(join(ARC_ROOT, '.arc'))

describe.runIf(ENABLED)('getArcStatus (live ~/arcadia)', () => {
  it('returns a well-formed GitStatusResult from the real arc CLI', async () => {
    const result = await getArcStatus(ARC_ROOT)

    expect(Array.isArray(result.entries)).toBe(true)
    expect(result.conflictOperation).toMatch(/^(merge|rebase|cherry-pick|unknown)$/)
    // ~/arcadia is on a branch with a commit, so head/branch resolve.
    expect(typeof result.head).toBe('string')
    expect(result.branch?.startsWith('refs/heads/')).toBe(true)
    // Every entry must carry a valid staging area and status.
    for (const entry of result.entries) {
      expect(entry.area).toMatch(/^(staged|unstaged|untracked)$/)
      expect(entry.path.length).toBeGreaterThan(0)
    }
    if (result.upstreamStatus?.hasUpstream) {
      expect(result.upstreamStatus.ahead).toBeGreaterThanOrEqual(0)
      expect(result.upstreamStatus.behind).toBeGreaterThanOrEqual(0)
    }
  })
})
