import { beforeEach, describe, expect, it, vi } from 'vitest'

const arcExecFileAsync = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecFileAsync: (...args: unknown[]) => arcExecFileAsync(...args)
  }
})

import { commitArcChanges } from './arc-commit'

beforeEach(() => {
  arcExecFileAsync.mockReset()
})

describe('commitArcChanges', () => {
  it('runs `arc commit -m` at the arc root and reports success', async () => {
    arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
    const result = await commitArcChanges('/repo', 'a message')
    expect(result).toEqual({ success: true })
    expect(arcExecFileAsync).toHaveBeenCalledWith(['commit', '-m', 'a message'], {
      cwd: '/repo'
    })
  })

  it('surfaces a hook failure from stderr', async () => {
    const error = Object.assign(new Error('exit 1'), {
      stderr: 'pre-commit hook failed',
      stdout: ''
    })
    arcExecFileAsync.mockRejectedValue(error)
    const result = await commitArcChanges('/repo', 'msg')
    expect(result).toEqual({ success: false, error: 'pre-commit hook failed' })
  })

  it('falls back to stdout when stderr is empty (nothing to commit)', async () => {
    const error = Object.assign(new Error('exit 1'), {
      stderr: '',
      stdout: 'nothing to commit, working directory clean'
    })
    arcExecFileAsync.mockRejectedValue(error)
    const result = await commitArcChanges('/repo', 'msg')
    expect(result).toEqual({
      success: false,
      error: 'nothing to commit, working directory clean'
    })
  })

  it('falls back to the error message when no output channels are set', async () => {
    arcExecFileAsync.mockRejectedValue(new Error('spawn arc ENOENT'))
    const result = await commitArcChanges('/repo', 'msg')
    expect(result).toEqual({ success: false, error: 'spawn arc ENOENT' })
  })
})
