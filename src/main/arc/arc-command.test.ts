import { describe, expect, it } from 'vitest'
import { arcBranchArgs, arcInfoArgs, arcLogArgs, arcStatusArgs } from './arc-command'

describe('arc argv builders', () => {
  it('builds bare status args', () => {
    expect(arcStatusArgs()).toEqual(['status', '--json'])
  })

  it('adds --branch and -u all when requested', () => {
    expect(arcStatusArgs({ branch: true, untrackedAll: true })).toEqual([
      'status',
      '--json',
      '--branch',
      '-u',
      'all'
    ])
  })

  it('builds info args', () => {
    expect(arcInfoArgs()).toEqual(['info', '--json'])
  })

  it('builds log args with and without a limit', () => {
    expect(arcLogArgs()).toEqual(['log', '--json'])
    expect(arcLogArgs({ limit: 20 })).toEqual(['log', '--json', '-n', '20'])
    // A non-positive limit is ignored rather than emitting a bogus -n 0.
    expect(arcLogArgs({ limit: 0 })).toEqual(['log', '--json'])
  })

  it('builds branch args with verbose upstream', () => {
    expect(arcBranchArgs()).toEqual(['branch', '--json', '-vv'])
  })
})
