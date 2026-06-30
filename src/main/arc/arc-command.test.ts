import { describe, expect, it } from 'vitest'
import {
  arcBranchArgs,
  arcCheckoutNewBranchArgs,
  arcInfoArgs,
  arcLogArgs,
  arcMountArgs,
  arcMountListArgs,
  arcRemountArgs,
  arcStatusArgs,
  arcUnmountArgs
} from './arc-command'

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

  it('builds mount args with per-mount store and shared object store', () => {
    expect(
      arcMountArgs({
        mountPath: '/wt/feat',
        store: '/stores/feat',
        objectStore: '/shared/objects',
        repo: 'arcadia'
      })
    ).toEqual([
      'mount',
      '-m',
      '/wt/feat',
      '-S',
      '/stores/feat',
      '--object-store',
      '/shared/objects',
      '-r',
      'arcadia'
    ])
  })

  it('builds remount and mount-list args', () => {
    expect(arcRemountArgs('/wt/feat')).toEqual(['mount', '/wt/feat'])
    expect(arcMountListArgs()).toEqual(['mount', '--list', '--json'])
  })

  it('builds unmount args with optional --forget', () => {
    expect(arcUnmountArgs('/wt/feat')).toEqual(['unmount', '/wt/feat'])
    expect(arcUnmountArgs('/wt/feat', { forget: true })).toEqual([
      'unmount',
      '/wt/feat',
      '--forget'
    ])
  })

  it('builds checkout-new-branch args', () => {
    expect(arcCheckoutNewBranchArgs('my-feature', 'trunk')).toEqual([
      'checkout',
      '-b',
      'my-feature',
      'trunk'
    ])
  })
})
