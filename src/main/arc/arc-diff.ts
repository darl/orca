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
  let originalContent = ''
  let modifiedContent = ''
  let originalIsBinary = false
  let modifiedIsBinary = false

  try {
    const leftBlob =
      staged || compareAgainstHead
        ? await readArcBlob(worktreePath, 'HEAD', filePath, options)
        : await readArcUnstagedLeftBlob(worktreePath, filePath, options)
    originalContent = leftBlob.content
    originalIsBinary = leftBlob.isBinary

    if (staged) {
      const rightBlob = await readArcBlob(worktreePath, '', filePath, options)
      modifiedContent = rightBlob.content
      modifiedIsBinary = rightBlob.isBinary
    } else {
      const workingTreeBlob = await readWorkingTreeFile(join(worktreePath, filePath))
      modifiedContent = workingTreeBlob.content
      modifiedIsBinary = workingTreeBlob.isBinary
    }
  } catch {
    // Fall through to whatever was read; buildDiffResult tolerates empties.
  }

  return buildDiffResult(
    originalContent,
    modifiedContent,
    originalIsBinary,
    modifiedIsBinary,
    filePath
  )
}

/** Diff a file between two commits (merge-base → head) in an arc worktree. */
export async function getArcBranchDiff(
  worktreePath: string,
  args: { mergeBase: string; headOid: string; filePath: string; oldPath?: string },
  options: ArcDiffExec = {}
): Promise<GitDiffResult> {
  try {
    const leftPath = args.oldPath ?? args.filePath
    const leftBlob = await readArcBlob(worktreePath, args.mergeBase, leftPath, options)
    const rightBlob = await readArcBlob(worktreePath, args.headOid, args.filePath, options)
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
    const leftBlob = args.parentOid
      ? await readArcBlob(worktreePath, args.parentOid, leftPath, options)
      : EMPTY_BLOB
    const rightBlob = await readArcBlob(worktreePath, args.commitOid, args.filePath, options)
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
