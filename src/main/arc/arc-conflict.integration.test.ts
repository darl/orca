import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { getArcConflictOperation } from './arc-conflict'

// Read-only conflict detection against a real arcadia checkout. Gated on
// ARC_INTEGRATION=1; a clean tree has no sequencer in progress.
const ARCADIA = join(homedir(), 'arcadia')
const runLive = process.env.ARC_INTEGRATION === '1' && existsSync(join(ARCADIA, '.arc'))

describe.runIf(runLive)('getArcConflictOperation (live)', () => {
  it('reports unknown for a clean working copy', async () => {
    expect(await getArcConflictOperation(ARCADIA)).toBe('unknown')
  })
})
