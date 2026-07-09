import type { CommitMessageDraftContext } from '../../shared/commit-message-generation'
import {
  describeMaxBufferOverflowError,
  isMaxBufferOverflowError
} from '../git/max-buffer-overflow'
import { MAX_GIT_SHOW_BYTES } from '../git/status'
import {
  arcDiffCachedNameStatusArgs,
  arcDiffCachedPatchArgs,
  arcExecFileAsync,
  arcExecJson,
  arcInfoArgs
} from './arc-command'

async function readArcCurrentBranch(arcRoot: string): Promise<string | null> {
  try {
    const info = await arcExecJson<{ branch?: string }>(arcInfoArgs(), { cwd: arcRoot })
    return info.branch ?? null
  } catch {
    // Branch is best-effort context for the prompt — degrade to null, matching
    // the git path's tolerance of a failed `branch --show-current`.
    return null
  }
}

/**
 * Staged-change context for AI commit-message generation from an arc worktree.
 * Mirrors the git {@link ../git/status.getStagedCommitContext}: the name-status
 * summary gates generation (null when nothing is staged), and the full staged
 * patch is optional context that degrades to the summary alone if it overflows
 * the buffer. arc emits a patch by default, so `arc diff --cached` needs no
 * explicit `--patch` flag.
 */
export async function getArcStagedCommitContext(
  arcRoot: string
): Promise<CommitMessageDraftContext | null> {
  const [summaryResult, branch] = await Promise.all([
    arcExecFileAsync(arcDiffCachedNameStatusArgs(), {
      cwd: arcRoot,
      maxBuffer: MAX_GIT_SHOW_BYTES
    }),
    readArcCurrentBranch(arcRoot)
  ])

  const stagedSummary = summaryResult.stdout.trim()
  if (!stagedSummary) {
    return null
  }

  let stagedPatch = ''
  try {
    const patchResult = await arcExecFileAsync(arcDiffCachedPatchArgs(), {
      cwd: arcRoot,
      maxBuffer: MAX_GIT_SHOW_BYTES
    })
    stagedPatch = patchResult.stdout
  } catch (error) {
    if (!isMaxBufferOverflowError(error)) {
      throw error
    }
    console.warn(
      '[arc] Staged patch too large to read; using file summary only:',
      describeMaxBufferOverflowError(error)
    )
  }

  return { branch, stagedSummary, stagedPatch }
}
