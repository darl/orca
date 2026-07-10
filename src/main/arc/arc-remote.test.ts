import { beforeEach, describe, expect, it, vi } from 'vitest'

const arcExecFileAsync = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecFileAsync: (...args: unknown[]) => arcExecFileAsync(...args)
  }
})

import { fastForwardArc, fetchArc, pullArc, pushArc, rebaseArcFromBase } from './arc-remote'

function lastArgv(): string[] {
  return arcExecFileAsync.mock.calls.at(-1)?.[0] as string[]
}

beforeEach(() => {
  arcExecFileAsync.mockReset()
  arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
})

describe('arc remote argv', () => {
  it('fetches with `arc fetch`', async () => {
    await fetchArc('/repo')
    expect(lastArgv()).toEqual(['fetch'])
    expect(arcExecFileAsync.mock.calls[0][1]).toMatchObject({ cwd: '/repo' })
  })

  it('pulls with `arc pull`', async () => {
    await pullArc('/repo')
    expect(lastArgv()).toEqual(['pull'])
  })

  it('pushes with `arc push` (no force flag)', async () => {
    await pushArc('/repo')
    expect(lastArgv()).toEqual(['push'])
    expect(arcExecFileAsync.mock.calls[0][1]).toMatchObject({ cwd: '/repo' })
  })

  it('fast-forwards with `arc pull --ff-only`', async () => {
    await fastForwardArc('/repo')
    expect(lastArgv()).toEqual(['pull', '--ff-only'])
  })

  it('rebases onto the given base', async () => {
    await rebaseArcFromBase('/repo', 'trunk')
    expect(lastArgv()).toEqual(['rebase', 'trunk'])
  })

  it('defaults an empty base ref to trunk', async () => {
    await rebaseArcFromBase('/repo', '   ')
    expect(lastArgv()).toEqual(['rebase', 'trunk'])
  })
})

describe('arc remote error surfacing', () => {
  it('rethrows arc stderr text', async () => {
    arcExecFileAsync.mockRejectedValue(
      Object.assign(new Error('exit 1'), { stderr: 'fatal: branches diverged' })
    )
    await expect(pullArc('/repo')).rejects.toThrow('fatal: branches diverged')
  })

  it('falls back to the error message when stderr is empty', async () => {
    arcExecFileAsync.mockRejectedValue(new Error('spawn arc ENOENT'))
    await expect(fetchArc('/repo')).rejects.toThrow('spawn arc ENOENT')
  })
})
