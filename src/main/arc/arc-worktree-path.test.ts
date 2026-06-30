import { describe, expect, it } from 'vitest'
import {
  arcMountAgentCwd,
  arcProjectSubpath,
  arcWorktreeProjectPrefix,
  computeArcWorktreeLayout,
  decodeArcProjectSegment,
  encodeArcProjectSegment
} from './arc-worktree-path'

describe('encode/decode arc project segment', () => {
  it('escapes slashes and percents into a single path segment', () => {
    expect(encodeArcProjectSegment('sdg/simulator/flash')).toBe('sdg%2Fsimulator%2Fflash')
  })

  it('round-trips values containing literal % and / and pre-encoded sequences', () => {
    for (const value of ['sdg/simulator/flash', 'a/b%c', '%2F', '/', '%', '', 'plain']) {
      expect(decodeArcProjectSegment(encodeArcProjectSegment(value))).toBe(value)
    }
  })
})

describe('arcProjectSubpath', () => {
  it('returns the posix relative subtree of the opened path under the arc root', () => {
    expect(
      arcProjectSubpath('/Users/darl/arcadia', '/Users/darl/arcadia/sdg/simulator/flash')
    ).toBe('sdg/simulator/flash')
  })

  it('returns empty string when the opened path is the arc root', () => {
    expect(arcProjectSubpath('/Users/darl/arcadia', '/Users/darl/arcadia')).toBe('')
  })
})

describe('computeArcWorktreeLayout', () => {
  it('maps project + branch to mount path, agent cwd, store, and shared object store', () => {
    const layout = computeArcWorktreeLayout({
      projectSubpath: 'sdg/simulator/flash',
      branch: 'my-feature',
      home: '/Users/darl'
    })
    expect(layout).toEqual({
      mountPath: '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/my-feature',
      agentCwd: '/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash/my-feature/sdg/simulator/flash',
      store: '/Users/darl/.arc/stores/sdg%2Fsimulator%2Fflash__my-feature',
      objectStore: '/Users/darl/.arc/orca-object-store'
    })
  })

  it('keeps a slash-containing branch confined to a single store segment', () => {
    const layout = computeArcWorktreeLayout({
      projectSubpath: 'pkg',
      branch: 'users/darl/feature',
      home: '/home/darl'
    })
    expect(layout.store).toBe('/home/darl/.arc/stores/pkg__users%2Fdarl%2Ffeature')
  })

  it('agent cwd equals the mount path when the project is the arc root', () => {
    const layout = computeArcWorktreeLayout({
      projectSubpath: '',
      branch: 'feat',
      home: '/home/darl'
    })
    expect(layout.agentCwd).toBe(layout.mountPath)
  })
})

describe('arcWorktreeProjectPrefix / arcMountAgentCwd', () => {
  it('builds the per-project mount prefix used to filter arc mount --list', () => {
    expect(
      arcWorktreeProjectPrefix({ projectSubpath: 'sdg/simulator/flash', home: '/Users/darl' })
    ).toBe('/Users/darl/arcadia-wt/sdg%2Fsimulator%2Fflash')
  })

  it('resolves a mount path to the agent cwd via the project subpath', () => {
    expect(arcMountAgentCwd('/Users/darl/arcadia-wt/x/feat', 'sdg/flash')).toBe(
      '/Users/darl/arcadia-wt/x/feat/sdg/flash'
    )
  })
})
