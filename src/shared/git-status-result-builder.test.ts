import { describe, expect, it } from 'vitest'
import { buildGitStatusResult, type GitStatusResultBuildInput } from './git-status-result-builder'
import type { GitStatusEntry } from './git-status-types'

const entry: GitStatusEntry = { path: 'a.ts', status: 'modified', area: 'unstaged' }

function baseInput(overrides: Partial<GitStatusResultBuildInput> = {}): GitStatusResultBuildInput {
  return {
    entries: [entry],
    conflictOperation: 'unknown',
    head: 'abc123',
    branch: 'main',
    includeIgnored: false,
    ignoredPaths: [],
    didHitLimit: false,
    statusLength: 0,
    upstream: { statusSucceeded: true, upstreamName: undefined, ahead: 0, behind: 0 },
    ...overrides
  }
}

describe('buildGitStatusResult', () => {
  it('builds a minimal clean result with no-upstream block when status succeeded', () => {
    expect(buildGitStatusResult(baseInput())).toEqual({
      entries: [entry],
      conflictOperation: 'unknown',
      head: 'abc123',
      branch: 'main',
      upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 }
    })
  })

  it('omits upstreamStatus entirely when status did not succeed', () => {
    const result = buildGitStatusResult(
      baseInput({ upstream: { statusSucceeded: false, ahead: 0, behind: 0 } })
    )
    expect('upstreamStatus' in result).toBe(false)
  })

  it('synthesizes hasUpstream:true from upstreamName + ahead/behind', () => {
    const result = buildGitStatusResult(
      baseInput({
        upstream: { statusSucceeded: true, upstreamName: 'origin/main', ahead: 2, behind: 1 }
      })
    )
    expect(result.upstreamStatus).toEqual({
      hasUpstream: true,
      upstreamName: 'origin/main',
      ahead: 2,
      behind: 1
    })
  })

  it('prefers the effective upstream block over the synthesized one', () => {
    const effective = {
      hasUpstream: true as const,
      upstreamName: 'origin/main',
      ahead: 5,
      behind: 0,
      behindCommitsArePatchEquivalent: true
    }
    const result = buildGitStatusResult(
      baseInput({
        upstream: {
          statusSucceeded: true,
          effective,
          upstreamName: 'origin/main',
          ahead: 2,
          behind: 1
        }
      })
    )
    expect(result.upstreamStatus).toBe(effective)
  })

  it('includes ignoredPaths only when requested', () => {
    expect('ignoredPaths' in buildGitStatusResult(baseInput())).toBe(false)
    const withIgnored = buildGitStatusResult(
      baseInput({ includeIgnored: true, ignoredPaths: ['node_modules/'] })
    )
    expect(withIgnored.ignoredPaths).toEqual(['node_modules/'])
  })

  it('folds in didHitLimit/statusLength only when the cap was hit', () => {
    expect('didHitLimit' in buildGitStatusResult(baseInput())).toBe(false)
    const capped = buildGitStatusResult(baseInput({ didHitLimit: true, statusLength: 5000 }))
    expect(capped.didHitLimit).toBe(true)
    expect(capped.statusLength).toBe(5000)
  })

  it('preserves the historical key order for byte-identical serialization', () => {
    const result = buildGitStatusResult(
      baseInput({
        includeIgnored: true,
        ignoredPaths: ['x'],
        didHitLimit: true,
        statusLength: 9,
        upstream: { statusSucceeded: true, upstreamName: 'origin/main', ahead: 1, behind: 0 }
      })
    )
    expect(Object.keys(result)).toEqual([
      'entries',
      'conflictOperation',
      'head',
      'branch',
      'ignoredPaths',
      'didHitLimit',
      'statusLength',
      'upstreamStatus'
    ])
  })
})
