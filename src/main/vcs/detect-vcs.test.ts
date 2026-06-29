import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearVcsDetectionCache, detectVcs } from './detect-vcs'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

describe('detectVcs', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'orca-detect-vcs-')))
    clearVcsDetectionCache()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    clearVcsDetectionCache()
  })

  it('detects a git working copy', () => {
    const repo = path.join(tmpDir, 'gitrepo')
    git(tmpDir, ['init', '--quiet', repo])

    const result = detectVcs(repo)
    expect(result.kind).toBe('git')
    expect(result.root).toBe(git(repo, ['rev-parse', '--show-toplevel']).trim().replace(/\\/g, '/'))
  })

  it('detects an arc working copy via the .arc marker directory', () => {
    const repo = path.join(tmpDir, 'arcrepo')
    mkdirSync(path.join(repo, '.arc'), { recursive: true })

    const result = detectVcs(repo)
    expect(result.kind).toBe('arc')
    expect(result.root).toBe(realpathSync(repo))
  })

  it('resolves the arc root from a nested subdirectory', () => {
    const repo = path.join(tmpDir, 'arcrepo')
    const nested = path.join(repo, 'devtools', 'pkg')
    mkdirSync(path.join(repo, '.arc'), { recursive: true })
    mkdirSync(nested, { recursive: true })

    const result = detectVcs(nested)
    expect(result.kind).toBe('arc')
    expect(result.root).toBe(realpathSync(repo))
  })

  it('returns null kind for a plain directory', () => {
    const plain = path.join(tmpDir, 'plain')
    mkdirSync(plain)

    const result = detectVcs(plain)
    expect(result.kind).toBeNull()
    expect(result.root).toBe(realpathSync(plain))
  })

  it('prefers arc when both .arc and .git are colocated', () => {
    const repo = path.join(tmpDir, 'both')
    git(tmpDir, ['init', '--quiet', repo])
    mkdirSync(path.join(repo, '.arc'), { recursive: true })

    expect(detectVcs(repo).kind).toBe('arc')
  })

  it('treats a .arc file (not directory) as not-arc', () => {
    const repo = path.join(tmpDir, 'arcfile')
    mkdirSync(repo)
    // A bare `.arc` regular file must not be mistaken for an arc working copy.
    execFileSync('touch', [path.join(repo, '.arc')])

    expect(detectVcs(repo).kind).toBeNull()
  })

  it('reports remote/SSH-scoped probes as unknown until the relay wires detection', () => {
    const repo = path.join(tmpDir, 'arcrepo')
    mkdirSync(path.join(repo, '.arc'), { recursive: true })

    const result = detectVcs(repo, { connectionId: 'ssh-host-1' })
    expect(result.kind).toBeNull()
    expect(result.root).toBe(repo)
  })

  it('caches results and re-resolves after clearVcsDetectionCache', () => {
    const repo = path.join(tmpDir, 'arcrepo')
    mkdirSync(path.join(repo, '.arc'), { recursive: true })
    expect(detectVcs(repo).kind).toBe('arc')

    // Remove the marker; cached answer should persist until invalidated.
    rmSync(path.join(repo, '.arc'), { recursive: true, force: true })
    expect(detectVcs(repo).kind).toBe('arc')

    clearVcsDetectionCache(repo)
    expect(detectVcs(repo).kind).toBeNull()
  })
})
