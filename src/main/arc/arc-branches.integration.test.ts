import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { arcExecFileAsync } from './arc-command'
import { listArcLocalBranches } from './arc-branches'

// Read-only branch listing against a real arcadia checkout. Gated on
// ARC_INTEGRATION=1; performs no writes.
const ARCADIA = join(homedir(), 'arcadia')
const runLive = process.env.ARC_INTEGRATION === '1' && existsSync(join(ARCADIA, '.arc'))

describe.runIf(runLive)('listArcLocalBranches (live)', () => {
  it('lists local branches with the current branch first', async () => {
    const { stdout } = await arcExecFileAsync(['info', '--json'], { cwd: ARCADIA })
    const currentBranch = (JSON.parse(stdout) as { branch: string }).branch

    const result = await listArcLocalBranches(ARCADIA)

    expect(result.current).toBe(currentBranch)
    expect(result.branches[0]).toBe(currentBranch)
    expect(result.branches).toContain(currentBranch)
    // eslint-disable-next-line no-console
    console.log(`[arc-branches] current=${result.current} count=${result.branches.length}`)
  })
})
