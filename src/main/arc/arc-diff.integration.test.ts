import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { arcExecFileAsync } from './arc-command'
import { getArcCommitDiff } from './arc-diff'
import { getArcHistory } from './arc-history'

const ARCADIA = join(homedir(), 'arcadia')
const runLive = process.env.ARC_INTEGRATION === '1' && existsSync(join(ARCADIA, '.arc'))

// `arc show --name-only` prints the commit message (indented) then the changed
// file paths at column 0. Take the trailing block of path-looking lines.
function changedFilesFromShow(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => /^\S/.test(line) && line.includes('/') && /\.\w+$/.test(line))
}

describe.runIf(runLive)('getArcCommitDiff (live)', () => {
  it('diffs a real commit against its parent into differing contents', async () => {
    const history = await getArcHistory(ARCADIA, { limit: 2 })
    const head = history.items[0]
    expect(head?.parentIds.length).toBeGreaterThan(0)

    const { stdout } = await arcExecFileAsync(['show', '--name-only', head.id], { cwd: ARCADIA })
    const files = changedFilesFromShow(stdout)
    expect(files.length).toBeGreaterThan(0)

    const filePath = files[0]
    const result = await getArcCommitDiff(ARCADIA, {
      commitOid: head.id,
      parentOid: head.parentIds[0],
      filePath
    })
    expect(['text', 'binary']).toContain(result.kind)
    if (result.kind === 'text') {
      // A file listed in the commit must differ between parent and commit.
      expect(result.originalContent).not.toBe(result.modifiedContent)
    }
    // eslint-disable-next-line no-console
    console.log(
      `[arc-diff] ${filePath}: kind=${result.kind} leftLen=${result.originalContent.length} rightLen=${result.modifiedContent.length}`
    )
  })
})
