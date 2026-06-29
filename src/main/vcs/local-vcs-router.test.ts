import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routeLocalVcsKind } from './local-vcs-router'
import { clearVcsDetectionCache } from './detect-vcs'

describe('routeLocalVcsKind', () => {
  let tmpDir: string
  let arcRepo: string
  let gitRepo: string

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'orca-vcs-router-')))
    arcRepo = path.join(tmpDir, 'arcrepo')
    gitRepo = path.join(tmpDir, 'gitrepo')
    mkdirSync(path.join(arcRepo, '.arc'), { recursive: true })
    execFileSync('git', ['init', '--quiet', gitRepo], { stdio: ['pipe', 'pipe', 'pipe'] })
    clearVcsDetectionCache()
    delete process.env.ORCA_ARC_VCS
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    clearVcsDetectionCache()
    delete process.env.ORCA_ARC_VCS
  })

  it('routes arc repos to git when the flag is off (strangler invariant)', () => {
    expect(routeLocalVcsKind(arcRepo)).toBe('git')
  })

  it('routes arc repos to arc when the flag is on', () => {
    process.env.ORCA_ARC_VCS = '1'
    expect(routeLocalVcsKind(arcRepo)).toBe('arc')
  })

  it('always routes git repos to git, flag on or off', () => {
    expect(routeLocalVcsKind(gitRepo)).toBe('git')
    process.env.ORCA_ARC_VCS = '1'
    expect(routeLocalVcsKind(gitRepo)).toBe('git')
  })
})
