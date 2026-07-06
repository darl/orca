import { existsSync } from 'fs'
import { mkdir, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { arcExecFileAsync } from './arc-command'
import { bulkDiscardArcChanges, discardArcChanges, stageArcFile, unstageArcFile } from './arc-stage'

// Live stage/unstage/discard against the real arc binary. Gated on
// ARC_INTEGRATION=1 and a real arcadia checkout; mutates only a scratch dir
// under the user-authorized junk/darl subtree and cleans up after itself.
const ARCADIA = join(homedir(), 'arcadia')
const runLive = process.env.ARC_INTEGRATION === '1' && existsSync(join(ARCADIA, '.arc'))

const SCRATCH_REL = 'junk/darl/orca-m2-stage-it'
const SCRATCH_ABS = join(ARCADIA, SCRATCH_REL)

async function statusPaths(): Promise<string> {
  const { stdout } = await arcExecFileAsync(['status', SCRATCH_REL], { cwd: ARCADIA })
  return stdout
}

describe.runIf(runLive)('arc stage/unstage/discard (live)', () => {
  afterAll(async () => {
    await rm(SCRATCH_ABS, { recursive: true, force: true })
  })

  it('stages, unstages, and discards an untracked file', async () => {
    await mkdir(SCRATCH_ABS, { recursive: true })
    const rel = `${SCRATCH_REL}/staged.txt`
    await writeFile(join(ARCADIA, rel), 'stage me\n')

    await stageArcFile(ARCADIA, rel)
    expect(await statusPaths()).toMatch(/new file:.*staged\.txt/)

    await unstageArcFile(ARCADIA, rel)
    expect(await statusPaths()).toMatch(/staged\.txt|Untracked/)

    await discardArcChanges(ARCADIA, rel)
    expect(existsSync(join(ARCADIA, rel))).toBe(false)
  })

  it('restores a tracked file modified in the working tree', async () => {
    // .arcignore is a committed file in junk/darl; dirty it, then discard.
    const rel = 'junk/darl/.arcignore'
    const abs = join(ARCADIA, rel)
    if (!existsSync(abs)) {
      return
    }
    const { stdout: original } = await arcExecFileAsync(['show', `HEAD:${rel}`], { cwd: ARCADIA })
    await writeFile(abs, `${original}\nMODIFIED BY INTEGRATION TEST\n`)

    await discardArcChanges(ARCADIA, rel)

    const { stdout: restored } = await arcExecFileAsync(['show', `HEAD:${rel}`], { cwd: ARCADIA })
    const { stdout: onDisk } = await arcExecFileAsync(['status', rel], { cwd: ARCADIA })
    expect(restored).toBe(original)
    expect(onDisk).toMatch(/clean|nothing to commit/)
  })

  it('bulk-discards a mix of tracked-added and untracked files', async () => {
    await mkdir(SCRATCH_ABS, { recursive: true })
    const added = `${SCRATCH_REL}/added.txt`
    const untracked = `${SCRATCH_REL}/loose.txt`
    await writeFile(join(ARCADIA, added), 'added\n')
    await writeFile(join(ARCADIA, untracked), 'loose\n')
    await stageArcFile(ARCADIA, added)

    await bulkDiscardArcChanges(ARCADIA, [added, untracked])

    expect(existsSync(join(ARCADIA, added))).toBe(false)
    expect(existsSync(join(ARCADIA, untracked))).toBe(false)
  })
})
