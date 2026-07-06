import { existsSync } from 'fs'
import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const arcExecFileAsync = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecFileAsync: (...args: unknown[]) => arcExecFileAsync(...args)
  }
})

import {
  bulkDiscardArcChanges,
  bulkStageArcFiles,
  bulkUnstageArcFiles,
  discardArcChanges,
  stageArcFile,
  unstageArcFile
} from './arc-stage'

// Every recorded arc invocation's argv, for asserting the exact command shape.
function calls(): string[][] {
  return arcExecFileAsync.mock.calls.map((call) => call[0] as string[])
}

function arcNotInRevError(): Error {
  const error = new Error('checkout failed') as Error & { stderr: string }
  error.stderr = "error: path 'x' did not match any file(s) known to arc."
  return error
}

beforeEach(() => {
  arcExecFileAsync.mockReset()
  arcExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
})

describe('stage/unstage argv', () => {
  it('stages a single file with `arc add`', async () => {
    await stageArcFile('/repo', 'a/b.ts')
    expect(calls()).toEqual([['add', 'a/b.ts']])
    expect(arcExecFileAsync.mock.calls[0][1]).toMatchObject({ cwd: '/repo' })
  })

  it('unstages a single file with `arc reset HEAD`', async () => {
    await unstageArcFile('/repo', 'a/b.ts')
    expect(calls()).toEqual([['reset', 'HEAD', 'a/b.ts']])
  })

  it('chunks bulk stage into batches of 100', async () => {
    const paths = Array.from({ length: 250 }, (_, i) => `f${i}.ts`)
    await bulkStageArcFiles('/repo', paths)
    const c = calls()
    expect(c).toHaveLength(3)
    expect(c[0][0]).toBe('add')
    expect(c[0]).toHaveLength(101) // 'add' + 100 paths
    expect(c[2]).toHaveLength(51) // 'add' + 50 paths
  })

  it('chunks bulk unstage with `arc reset HEAD`', async () => {
    await bulkUnstageArcFiles('/repo', ['a.ts', 'b.ts'])
    expect(calls()).toEqual([['reset', 'HEAD', 'a.ts', 'b.ts']])
  })

  it('is a no-op for empty bulk inputs', async () => {
    await bulkStageArcFiles('/repo', [])
    await bulkUnstageArcFiles('/repo', [])
    await bulkDiscardArcChanges('/repo', [])
    expect(arcExecFileAsync).not.toHaveBeenCalled()
  })
})

describe('discardArcChanges (tracked)', () => {
  it('restores a tracked file to HEAD and never deletes', async () => {
    await discardArcChanges('/repo', 'a/b.ts')
    expect(calls()).toEqual([['checkout', 'HEAD', 'a/b.ts']])
  })

  it('rethrows an unexpected checkout error without deleting', async () => {
    arcExecFileAsync.mockRejectedValueOnce(new Error('arc mount is offline'))
    await expect(discardArcChanges('/repo', 'a/b.ts')).rejects.toThrow('offline')
    // Only the failed checkout ran — no reset, no delete fallback.
    expect(calls()).toEqual([['checkout', 'HEAD', 'a/b.ts']])
  })
})

describe('discardArcChanges (untracked, real fs)', () => {
  let repo: string

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'arc-stage-'))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('unstages then deletes a file arc reports as unknown at HEAD', async () => {
    await mkdir(join(repo, 'sub'), { recursive: true })
    const rel = 'sub/new.txt'
    await writeFile(join(repo, rel), 'brand new\n')

    arcExecFileAsync.mockImplementation(async (argv: string[]) => {
      if (argv[0] === 'checkout') {
        throw arcNotInRevError()
      }
      return { stdout: '', stderr: '' }
    })

    await discardArcChanges(repo, rel)

    // checkout (fails) → reset HEAD (unstage) → then fs delete.
    expect(calls()).toEqual([
      ['checkout', 'HEAD', rel],
      ['reset', 'HEAD', rel]
    ])
    expect(existsSync(join(repo, rel))).toBe(false)
  })
})

describe('bulkDiscardArcChanges', () => {
  it('restores an all-tracked chunk in one checkout', async () => {
    await bulkDiscardArcChanges('/repo', ['a.ts', 'b.ts'])
    expect(calls()).toEqual([['checkout', 'HEAD', 'a.ts', 'b.ts']])
  })

  it('falls back to per-path discard when a chunk contains an unknown path', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'arc-stage-bulk-'))
    await writeFile(join(repo, 'untracked.txt'), 'x\n')

    let batchAttempted = false
    arcExecFileAsync.mockImplementation(async (argv: string[]) => {
      if (argv[0] === 'checkout' && argv.length > 3 && !batchAttempted) {
        batchAttempted = true
        throw arcNotInRevError() // batch of 2 rejected
      }
      if (argv[0] === 'checkout' && argv[2] === 'untracked.txt') {
        throw arcNotInRevError() // per-path: untracked one still unknown
      }
      return { stdout: '', stderr: '' }
    })

    await bulkDiscardArcChanges(repo, ['tracked.ts', 'untracked.txt'])

    const c = calls()
    expect(c[0]).toEqual(['checkout', 'HEAD', 'tracked.ts', 'untracked.txt']) // batch
    expect(c).toContainEqual(['checkout', 'HEAD', 'tracked.ts']) // per-path restore
    expect(c).toContainEqual(['reset', 'HEAD', 'untracked.txt']) // per-path unstage
    expect(existsSync(join(repo, 'untracked.txt'))).toBe(false) // deleted
  })
})
