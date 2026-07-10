import { afterEach, describe, expect, it } from 'vitest'
import { isArcVcsEnabled, setArcVcsSettingEnabled } from './arc-vcs-flag'

// The settings snapshot is module-level state; reset it after each case so the
// env-only assertions aren't polluted by a prior case leaving it enabled.
afterEach(() => {
  setArcVcsSettingEnabled(false)
})

describe('isArcVcsEnabled', () => {
  it('is off by default (no env, snapshot off) — the strangler invariant', () => {
    expect(isArcVcsEnabled({})).toBe(false)
  })

  it.each(['1', 'true', 'on', 'TRUE', ' On '])('is on when ORCA_ARC_VCS=%j', (raw) => {
    expect(isArcVcsEnabled({ ORCA_ARC_VCS: raw })).toBe(true)
  })

  it.each(['0', 'false', 'off', '', 'yes'])('stays off for non-enabling ORCA_ARC_VCS=%j', (raw) => {
    expect(isArcVcsEnabled({ ORCA_ARC_VCS: raw })).toBe(false)
  })

  it('is on when the settings snapshot is enabled, even with no env flag', () => {
    setArcVcsSettingEnabled(true)
    expect(isArcVcsEnabled({})).toBe(true)
  })

  it('ORs env and settings: either enabler turns it on', () => {
    setArcVcsSettingEnabled(false)
    expect(isArcVcsEnabled({ ORCA_ARC_VCS: '1' })).toBe(true)
    setArcVcsSettingEnabled(true)
    expect(isArcVcsEnabled({ ORCA_ARC_VCS: 'off' })).toBe(true)
  })

  it('setArcVcsSettingEnabled(false) returns to the env-only reading', () => {
    setArcVcsSettingEnabled(true)
    expect(isArcVcsEnabled({})).toBe(true)
    setArcVcsSettingEnabled(false)
    expect(isArcVcsEnabled({})).toBe(false)
  })
})
