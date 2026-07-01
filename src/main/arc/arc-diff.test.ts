import { beforeEach, describe, expect, it, vi } from 'vitest'

const arcExecFileAsyncBuffer = vi.fn()
vi.mock('./arc-command', async () => {
  const actual = (await vi.importActual('./arc-command')) as Record<string, unknown>
  return {
    ...actual,
    arcExecFileAsyncBuffer: (...args: unknown[]) => arcExecFileAsyncBuffer(...args)
  }
})

import { getArcBranchDiff, getArcCommitDiff, getArcDiff } from './arc-diff'

// Resolve `arc show <rev>:<path>` from a rev->content map; unknown revs throw
// (arc exits non-zero for a missing path), mirroring a file absent at that rev.
function mockBlobs(byRev: Record<string, string>): void {
  arcExecFileAsyncBuffer.mockImplementation(async (args: string[]) => {
    const spec = args[1] ?? ''
    const rev = spec.slice(0, spec.indexOf(':'))
    if (!(rev in byRev)) {
      throw new Error(`no path '${spec}'`)
    }
    return { stdout: Buffer.from(byRev[rev], 'utf-8'), stderr: Buffer.alloc(0) }
  })
}

beforeEach(() => {
  arcExecFileAsyncBuffer.mockReset()
})

describe('getArcBranchDiff', () => {
  it('diffs merge-base blob against head blob', async () => {
    mockBlobs({ mb: 'old\n', head: 'new\n' })
    const result = await getArcBranchDiff('/wt', {
      mergeBase: 'mb',
      headOid: 'head',
      filePath: 'a.ts'
    })
    expect(result).toEqual({
      kind: 'text',
      originalContent: 'old\n',
      modifiedContent: 'new\n',
      originalIsBinary: false,
      modifiedIsBinary: false
    })
  })

  it('uses oldPath for the left (renamed file)', async () => {
    const seen: string[] = []
    arcExecFileAsyncBuffer.mockImplementation(async (args: string[]) => {
      seen.push(args[1])
      return { stdout: Buffer.from('x'), stderr: Buffer.alloc(0) }
    })
    await getArcBranchDiff('/wt', {
      mergeBase: 'mb',
      headOid: 'head',
      filePath: 'new.ts',
      oldPath: 'old.ts'
    })
    expect(seen).toContain('mb:old.ts')
    expect(seen).toContain('head:new.ts')
  })
})

describe('getArcCommitDiff', () => {
  it('diffs parent blob against commit blob', async () => {
    mockBlobs({ p: 'a\n', c: 'b\n' })
    const result = await getArcCommitDiff('/wt', {
      commitOid: 'c',
      parentOid: 'p',
      filePath: 'a.ts'
    })
    expect(result).toMatchObject({ originalContent: 'a\n', modifiedContent: 'b\n' })
  })

  it('treats a missing parent (added file) as an empty left side', async () => {
    mockBlobs({ c: 'added\n' })
    const result = await getArcCommitDiff('/wt', {
      commitOid: 'c',
      parentOid: null,
      filePath: 'a.ts'
    })
    expect(result).toMatchObject({ originalContent: '', modifiedContent: 'added\n' })
    // No arc call for the (null) parent side.
    expect(arcExecFileAsyncBuffer).toHaveBeenCalledTimes(1)
  })

  it('treats a blob missing at the commit (deleted file) as an empty right side', async () => {
    mockBlobs({ p: 'gone\n' })
    const result = await getArcCommitDiff('/wt', {
      commitOid: 'c',
      parentOid: 'p',
      filePath: 'a.ts'
    })
    expect(result).toMatchObject({ originalContent: 'gone\n', modifiedContent: '' })
  })
})

describe('getArcDiff (staged)', () => {
  it('diffs HEAD blob against the staged index blob', async () => {
    // rev '' is the index (`arc show :path`); 'HEAD' is the committed blob.
    mockBlobs({ HEAD: 'committed\n', '': 'staged\n' })
    const result = await getArcDiff('/wt', 'a.ts', true)
    expect(result).toMatchObject({ originalContent: 'committed\n', modifiedContent: 'staged\n' })
  })
})
