import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseArcStatus, type ArcStatusJson } from './arc-status-parser'

function fixture(name: string): ArcStatusJson {
  return JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf-8'))
}

describe('parseArcStatus', () => {
  it('maps the changed section to the unstaged area', () => {
    const result = parseArcStatus(fixture('status-clean'))
    expect(result.entries).toHaveLength(3)
    expect(result.entries.every((e) => e.area === 'unstaged' && e.status === 'modified')).toBe(true)
    expect(result.entries[0].path).toBe(
      'infra/infractl/controllers/ytpool/clients/ytpool/factory.go'
    )
  })

  it('maps a staged "new file" to area=staged status=added', () => {
    const result = parseArcStatus(fixture('status-staged'))
    expect(result.entries).toEqual([
      { path: '__orca_probe__.txt', status: 'added', area: 'staged' }
    ])
  })

  it('maps the untracked section to area=untracked', () => {
    const result = parseArcStatus(fixture('status-untracked'))
    expect(result.entries).toEqual([
      { path: '__orca_probe__.txt', status: 'untracked', area: 'untracked' }
    ])
  })

  it('maps a modified entry', () => {
    const result = parseArcStatus(fixture('status-modified'))
    expect(result.entries).toEqual([
      { path: '__orca_probe__.txt', status: 'modified', area: 'unstaged' }
    ])
  })

  it('derives branch/head/upstream identity from branch_info', () => {
    const result = parseArcStatus(fixture('status-branch'))
    expect(result.branch).toBe('refs/heads/pr-14006699')
    expect(result.head).toBe('ccc14a7dd92535597290f6de70dc8de39de862c3')
    expect(result.upstreamName).toBe(
      'arcadia/users/darl/submit-8446dfd1-292c793d-5a19b4c9-89d4c1b5'
    )
    expect(result.localCommitId).toBe('ccc14a7dd92535597290f6de70dc8de39de862c3')
    expect(result.remoteCommitId).toBe('ccc14a7dd92535597290f6de70dc8de39de862c3')
  })

  it('handles a branch with no remote (ahead fixture)', () => {
    const result = parseArcStatus(fixture('status-ahead'))
    expect(result.branch).toBe('refs/heads/orca-probe-branch')
    expect(result.upstreamName).toBeUndefined()
    expect(result.remoteCommitId).toBeUndefined()
    expect(result.entries).toHaveLength(0)
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  })

  it('reads inline ahead/behind counts from branch_info when present', () => {
    const result = parseArcStatus({
      branch_info: {
        local: { name: 'feature', commit: { id: 'aaa' } },
        remote: { name: 'arcadia/feature', commit: { id: 'bbb' } },
        ahead: 3,
        behind: 2
      },
      status: {}
    })
    expect(result.ahead).toBe(3)
    expect(result.behind).toBe(2)
  })

  it('defaults ahead/behind to 0 when arc omits them (in sync)', () => {
    const result = parseArcStatus(fixture('status-branch'))
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  })

  it('parses a live diverged-state fixture (inline ahead, remote, empty status)', () => {
    const result = parseArcStatus(fixture('status-diverged'))
    expect(result.branch).toBe('refs/heads/pr-14006699')
    expect(result.upstreamName).toBe(
      'arcadia/users/darl/submit-8446dfd1-292c793d-5a19b4c9-89d4c1b5'
    )
    expect(result.ahead).toBe(1)
    expect(result.behind).toBe(0)
    expect(result.entries).toHaveLength(0)
  })

  it('maps an unmerged content conflict to both_modified', () => {
    const result = parseArcStatus(fixture('status-conflict'))
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      path: 'junk/darl/__orca_conflict_probe__.txt',
      area: 'unstaged',
      conflictKind: 'both_modified',
      conflictStatus: 'unresolved'
    })
  })

  it('reads the conflict operation from branch_info.sequencer', () => {
    expect(parseArcStatus(fixture('status-conflict-branch')).conflictOperation).toBe('rebase')
    // No sequencer present → unknown (matches git detectConflictOperation default).
    expect(parseArcStatus(fixture('status-clean')).conflictOperation).toBe('unknown')
  })

  it('throws loudly on an unknown file-status value (schema drift)', () => {
    expect(() =>
      parseArcStatus({ status: { changed: [{ status: 'teleported', path: 'x' }] } })
    ).toThrow(/unknown unstaged file status/)
  })

  it('throws loudly on an unmapped conflict combination', () => {
    expect(() =>
      parseArcStatus({
        status: {
          unmerged: [
            {
              status: 'conflict',
              path: 'x',
              conflict: { our: { change: 'wat' }, their: { change: 'huh' } }
            }
          ]
        }
      })
    ).toThrow(/unmapped conflict/)
  })

  it('maps every documented conflict combination', () => {
    const cases: [string, string, string][] = [
      ['added', 'added', 'both_added'],
      ['deleted', 'deleted', 'both_deleted'],
      ['added', 'none', 'added_by_us'],
      ['none', 'added', 'added_by_them'],
      ['modified', 'deleted', 'deleted_by_them'],
      ['deleted', 'modified', 'deleted_by_us']
    ]
    for (const [our, their, expected] of cases) {
      const result = parseArcStatus({
        status: {
          unmerged: [
            {
              status: 'conflict',
              path: 'f',
              conflict: { our: { change: our }, their: { change: their } }
            }
          ]
        }
      })
      expect(result.entries[0].conflictKind).toBe(expected)
    }
  })
})
