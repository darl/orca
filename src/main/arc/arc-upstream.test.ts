import { describe, expect, it } from 'vitest'
import { deriveArcUpstreamFold } from './arc-upstream'
import type { ArcParsedStatus } from './arc-status-parser'

function parsed(overrides: Partial<ArcParsedStatus> = {}): ArcParsedStatus {
  return {
    entries: [],
    conflictOperation: 'unknown',
    ahead: 0,
    behind: 0,
    ...overrides
  }
}

describe('deriveArcUpstreamFold', () => {
  it('reports an upstream with counts when the branch tracks a remote', () => {
    expect(
      deriveArcUpstreamFold(parsed({ upstreamName: 'arcadia/feature', ahead: 3, behind: 1 }))
    ).toEqual({ statusSucceeded: true, upstreamName: 'arcadia/feature', ahead: 3, behind: 1 })
  })

  it('reports no upstream name for a local-only branch', () => {
    const fold = deriveArcUpstreamFold(parsed())
    expect(fold.statusSucceeded).toBe(true)
    expect(fold.upstreamName).toBeUndefined()
    expect(fold.ahead).toBe(0)
    expect(fold.behind).toBe(0)
  })
})
