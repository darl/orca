import { join } from 'path'
import type { GitDiffResult } from '../../shared/types'
import { isMaxBufferOverflowError } from '../git/max-buffer-overflow'
import {
  buildDiffResult,
  bufferToBlob,
  readWorkingTreeFile,
  MAX_GIT_SHOW_BYTES,
  type GitBlobReadResult
} from '../git/status'
import { arcExecFileAsyncBuffer, arcShowBlobArgs } from './arc-command'

type ArcDiffExec = { signal?: AbortSignal }

const EMPTY_BLOB: GitBlobReadResult = { content: '', isBinary: false, exists: false }

const EMPTY_TEXT_DIFF: GitDiffResult = {
  kind: 'text',
  originalContent: '',
  modifiedContent: '',
  originalIsBinary: false,
  modifiedIsBinary: false
}

/**
 * Read a blob at `rev:path` from an arc repo. `rev` empty reads the staged index
 * blob (`:path`). Mirrors git's `readGitBlobAtOidPath`: a missing path throws
 * (arc exits non-zero) and degrades to a non-existent empty blob; an oversized
 * blob is reported as binary so the renderer shows the large-file fallback.
 */
async function readArcBlob(
  worktreePath: string,
  rev: string,
  filePath: string,
  options: ArcDiffExec
): Promise<GitBlobReadResult> {
  try {
    const { stdout } = await arcExecFileAsyncBuffer(arcShowBlobArgs(rev, filePath), {
      cwd: worktreePath,
      maxBuffer: MAX_GIT_SHOW_BYTES,
      ...(options.signal ? { signal: options.signal } : {})
    })
    return { ...bufferToBlob(stdout, filePath), exists: true }
  } catch (error) {
    if (isMaxBufferOverflowError(error)) {
      return { content: '', isBinary: true, exists: true }
    }
    return { content: '', isBinary: false, exists: false }
  }
}

async function readArcUnstagedLeftBlob(
  worktreePath: string,
  filePath: string,
  options: ArcDiffExec
): Promise<GitBlobReadResult> {
  const indexBlob = await readArcBlob(worktreePath, '', filePath, options)
  if (indexBlob.exists) {
    return indexBlob
  }
  return readArcBlob(worktreePath, 'HEAD', filePath, options)
}

/**
 * Working-copy diff for a file in an arc worktree. Staged compares HEAD → index;
 * unstaged compares index-or-HEAD → the working-tree file (read from the FUSE
 * mount). Translates into Orca's git-shaped {@link GitDiffResult} via the shared
 * builder so binary/large-diff handling matches the git path exactly.
 */
export async function getArcDiff(
  worktreePath: string,
  filePath: string,
  staged: boolean,
  compareAgainstHead = false,
  options: ArcDiffExec = {}
): Promise<GitDiffResult> {
  let left: GitBlobReadResult = EMPTY_BLOB
  let right: GitBlobReadResult = EMPTY_BLOB

  try {
    // Both sides are independent reads, so fetch them concurrently. Staged
    // compares HEAD → index; otherwise the left is the index-or-HEAD (or HEAD
    // when comparing against HEAD) and the right is the working-tree file.
    if (staged) {
      ;[left, right] = await Promise.all([
        readArcBlob(worktreePath, 'HEAD', filePath, options),
        readArcBlob(worktreePath, '', filePath, options)
      ])
    } else {
      ;[left, right] = await Promise.all([
        compareAgainstHead
          ? readArcBlob(worktreePath, 'HEAD', filePath, options)
          : readArcUnstagedLeftBlob(worktreePath, filePath, options),
        readWorkingTreeFile(join(worktreePath, filePath))
      ])
    }
  } catch {
    // Fall through to whatever was read; buildDiffResult tolerates empties.
  }

  return buildDiffResult(left.content, right.content, left.isBinary, right.isBinary, filePath)
}

/** Diff a file between two commits (merge-base → head) in an arc worktree. */
export async function getArcBranchDiff(
  worktreePath: string,
  args: { mergeBase: string; headOid: string; filePath: string; oldPath?: string },
  options: ArcDiffExec = {}
): Promise<GitDiffResult> {
  try {
    const leftPath = args.oldPath ?? args.filePath
    const [leftBlob, rightBlob] = await Promise.all([
      readArcBlob(worktreePath, args.mergeBase, leftPath, options),
      readArcBlob(worktreePath, args.headOid, args.filePath, options)
    ])
    return buildDiffResult(
      leftBlob.content,
      rightBlob.content,
      leftBlob.isBinary,
      rightBlob.isBinary,
      args.filePath
    )
  } catch {
    return EMPTY_TEXT_DIFF
  }
}

/** Diff a file for a single commit against its parent in an arc worktree. */
export async function getArcCommitDiff(
  worktreePath: string,
  args: { commitOid: string; parentOid?: string | null; filePath: string; oldPath?: string },
  options: ArcDiffExec = {}
): Promise<GitDiffResult> {
  try {
    const leftPath = args.oldPath ?? args.filePath
    const [leftBlob, rightBlob] = await Promise.all([
      args.parentOid
        ? readArcBlob(worktreePath, args.parentOid, leftPath, options)
        : Promise.resolve(EMPTY_BLOB),
      readArcBlob(worktreePath, args.commitOid, args.filePath, options)
    ])
    return buildDiffResult(
      leftBlob.content,
      rightBlob.content,
      leftBlob.isBinary,
      rightBlob.isBinary,
      args.filePath
    )
  } catch {
    return EMPTY_TEXT_DIFF
  }
}
