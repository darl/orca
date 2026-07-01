import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { getArcHistory } from './arc-history'

const ARCADIA = join(homedir(), 'arcadia')
const runLive = process.env.ARC_INTEGRATION === '1' && existsSync(join(ARCADIA, '.arc'))

describe.runIf(runLive)('getArcHistory (live)', () => {
  it('reads real history from ~/arcadia into a well-formed GitHistoryResult', async () => {
    const result = await getArcHistory(ARCADIA, { limit: 5 })
    expect(result.limit).toBe(5)
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.length).toBeLessThanOrEqual(5)
    const [first] = result.items
    expect(first.id).toMatch(/^[0-9a-f]{40}$/)
    expect(first.subject.length).toBeGreaterThan(0)
    expect(Array.isArray(first.parentIds)).toBe(true)
    expect(result.currentRef?.revision).toBe(first.id)
    // eslint-disable-next-line no-console
    console.log(
      `[arc-history] head=${first.displayId} "${first.subject}" branch=${result.currentRef?.name} remote=${result.remoteRef?.name ?? '-'} incoming=${result.hasIncomingChanges} outgoing=${result.hasOutgoingChanges} hasMore=${result.hasMore}`
    )
  })
})
