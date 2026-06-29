import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectLocalRepoOpen } from './local-repo-open'
import { clearVcsDetectionCache } from './detect-vcs'

describe('detectLocalRepoOpen', () => {
  let tmpDir: string
  let arcRepo: string
  let gitRepo: string

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'orca-repo-open-')))
    arcRepo = path.join(tmpDir, 'arcadia')
    gitRepo = path.join(tmpDir, 'gitrepo')
    mkdirSync(path.join(arcRepo, '.arc'), { recursive: true })
    mkdirSync(path.join(arcRepo, 'sdg', 'simulator', 'flash'), { recursive: true })
    execFileSync('git', ['init', '--quiet', gitRepo], { stdio: ['pipe', 'pipe', 'pipe'] })
    clearVcsDetectionCache()
    delete process.env.ORCA_ARC_VCS
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    clearVcsDetectionCache()
    delete process.env.ORCA_ARC_VCS
  })

  it('rejects an arc subtree when the flag is off', () => {
    const result = detectLocalRepoOpen(path.join(arcRepo, 'sdg', 'simulator', 'flash'))
    expect(result.isRepo).toBe(false)
  })

  it('accepts an arc subtree and keeps the opened path (model B) when the flag is on', () => {
    process.env.ORCA_ARC_VCS = '1'
    const opened = path.join(arcRepo, 'sdg', 'simulator', 'flash')
    const result = detectLocalRepoOpen(opened)
    expect(result.isRepo).toBe(true)
    // The subtree is its own project — NOT collapsed to the arc monorepo root.
    expect(result.resolvedPath).toBe(opened)
  })

  it('resolves a git subdir up to its worktree root', () => {
    const nested = path.join(gitRepo, 'pkg')
    mkdirSync(nested)
    const result = detectLocalRepoOpen(nested)
    expect(result.isRepo).toBe(true)
    expect(result.resolvedPath).toBe(realpathSync(gitRepo))
  })

  it('returns not-a-repo for a plain folder', () => {
    const plain = path.join(tmpDir, 'plain')
    mkdirSync(plain)
    expect(detectLocalRepoOpen(plain).isRepo).toBe(false)
  })
})
