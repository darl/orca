import { beforeEach, describe, expect, it, vi } from 'vitest'

const arcExecFileAsync = vi.fn()
const arcExecJson = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecFileAsync: (...args: unknown[]) => arcExecFileAsync(...args),
    arcExecJson: (...args: unknown[]) => arcExecJson(...args)
  }
})

import { getArcStagedCommitContext } from './arc-commit-context'

function mockDiff(byArgv: (argv: string[]) => { stdout: string } | Error): void {
  arcExecFileAsync.mockImplementation(async (argv: string[]) => {
    const result = byArgv(argv)
    if (result instanceof Error) {
      throw result
    }
    return { stdout: result.stdout, stderr: '' }
  })
}

beforeEach(() => {
  arcExecFileAsync.mockReset()
  arcExecJson.mockReset()
  arcExecJson.mockResolvedValue({ branch: 'pr-1' })
})

describe('getArcStagedCommitContext', () => {
  it('returns the branch, name-status summary, and full patch', async () => {
    mockDiff((argv) =>
      argv.includes('--name-status') ? { stdout: 'M\ta.ts\n' } : { stdout: 'diff --git a/a.ts\n' }
    )
    expect(await getArcStagedCommitContext('/repo')).toEqual({
      branch: 'pr-1',
      stagedSummary: 'M\ta.ts',
      stagedPatch: 'diff --git a/a.ts\n'
    })
  })

  it('returns null when nothing is staged and never reads the patch', async () => {
    mockDiff(() => ({ stdout: '   \n' }))
    expect(await getArcStagedCommitContext('/repo')).toBeNull()
    // Only the name-status probe ran; no patch call.
    expect(arcExecFileAsync).toHaveBeenCalledTimes(1)
  })

  it('degrades to the summary when the patch overflows the buffer', async () => {
    mockDiff((argv) => {
      if (argv.includes('--name-status')) {
        return { stdout: 'M\tbig.bin\n' }
      }
      return Object.assign(new Error('stdout maxBuffer length exceeded'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      })
    })
    const result = await getArcStagedCommitContext('/repo')
    expect(result).toMatchObject({ stagedSummary: 'M\tbig.bin', stagedPatch: '' })
  })

  it('falls back to a null branch when arc info fails', async () => {
    arcExecJson.mockRejectedValue(new Error('arc info failed'))
    mockDiff((argv) =>
      argv.includes('--name-status') ? { stdout: 'A\tnew.ts\n' } : { stdout: 'p' }
    )
    const result = await getArcStagedCommitContext('/repo')
    expect(result?.branch).toBeNull()
  })
})
