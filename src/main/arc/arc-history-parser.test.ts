import { describe, expect, it } from 'vitest'
import { parseArcLog, type ArcLogCommit } from './arc-history-parser'

const commit: ArcLogCommit = {
  commit: 'a7819db772eed4b7b5a49b558b22f185464b80a0',
  parents: ['c79064cbea91ca389afe153a347d588452fe50df'],
  author: 'darl',
  date: '2026-06-30T23:53:19+03:00',
  message: 'subject line\n\nbody paragraph',
  branches: {
    local: ['pr-14006699'],
    remote: ['arcadia/users/darl/submit-x'],
    head: true
  }
}

describe('parseArcLog', () => {
  it('maps commit fields into a GitHistoryItem', () => {
    const [item] = parseArcLog([commit])
    expect(item).toEqual({
      id: 'a7819db772eed4b7b5a49b558b22f185464b80a0',
      parentIds: ['c79064cbea91ca389afe153a347d588452fe50df'],
      subject: 'subject line',
      message: 'subject line\n\nbody paragraph',
      author: 'darl',
      displayId: 'a7819db',
      timestamp: Date.parse('2026-06-30T23:53:19+03:00'),
      references: [
        {
          id: 'refs/heads/pr-14006699',
          name: 'pr-14006699',
          revision: 'a7819db772eed4b7b5a49b558b22f185464b80a0',
          category: 'branches'
        },
        {
          id: 'refs/remotes/arcadia/users/darl/submit-x',
          name: 'arcadia/users/darl/submit-x',
          revision: 'a7819db772eed4b7b5a49b558b22f185464b80a0',
          category: 'remote branches'
        }
      ]
    })
  })

  it('handles a root commit with no parents, author, or branches', () => {
    const [item] = parseArcLog([{ commit: 'f'.repeat(40), message: 'root' }])
    expect(item.parentIds).toEqual([])
    expect(item.references).toEqual([])
    expect('author' in item).toBe(false)
  })

  it('falls back to a placeholder subject for an empty message', () => {
    const [item] = parseArcLog([{ commit: 'a'.repeat(40) }])
    expect(item.subject).toBe('(no commit message)')
    expect(item.message).toBe('')
  })

  it('orders local branches before remote branches', () => {
    const [item] = parseArcLog([
      { commit: 'b'.repeat(40), branches: { remote: ['origin/x'], local: ['feat'] } }
    ])
    expect(item.references?.map((r) => r.category)).toEqual(['branches', 'remote branches'])
  })

  it('skips records whose commit id is not a hex hash', () => {
    expect(parseArcLog([{ commit: 'not-a-hash', message: 'x' }])).toEqual([])
  })

  it('omits timestamp when the date is missing or unparseable', () => {
    const [noDate] = parseArcLog([{ commit: 'c'.repeat(40) }])
    expect('timestamp' in noDate).toBe(false)
    const [badDate] = parseArcLog([{ commit: 'd'.repeat(40), date: 'not-a-date' }])
    expect('timestamp' in badDate).toBe(false)
  })
})
