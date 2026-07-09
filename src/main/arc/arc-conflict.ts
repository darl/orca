import type { GitConflictOperation } from '../../shared/git-status-types'
import {
  arcCherryPickAbortArgs,
  arcExecFileAsync,
  arcExecJson,
  arcExecOptions,
  arcRebaseAbortArgs,
  arcStatusArgs,
  arcUpAbortArgs,
  type ArcOpExec
} from './arc-command'
import { parseArcStatus, type ArcStatusJson } from './arc-status-parser'

type ArcConflictExec = ArcOpExec

// arc's abort command per in-progress sequencer state (arc has no merge --abort;
// up --abort is its merge-conflict abort). Operations with no abort map to no-op.
const ABORT_ARGS_BY_OPERATION: Partial<Record<GitConflictOperation, () => string[]>> = {
  rebase: arcRebaseAbortArgs,
  'cherry-pick': arcCherryPickAbortArgs,
  merge: arcUpAbortArgs
}

/**
 * Which sequencer operation is in progress. arc reports it inline via
 * `branch_info.sequencer`, so this reuses the M1 status parse instead of probing
 * `.arc/` marker files the way the git path reads `.git/MERGE_HEAD` et al.
 */
export async function getArcConflictOperation(
  arcRoot: string,
  options: ArcConflictExec = {}
): Promise<GitConflictOperation> {
  const json = await arcExecJson<ArcStatusJson>(
    arcStatusArgs({ branch: true }),
    arcExecOptions(arcRoot, options)
  )
  return parseArcStatus(json).conflictOperation
}

/**
 * Abort whatever sequencer is in progress. arc has a dedicated abort per state
 * (`rebase --abort` / `cherry-pick --abort` / `up --abort`) and its inline
 * sequencer reports which, so one self-detecting abort correctly serves both the
 * merge and rebase RPCs — and cherry-pick, which has no dedicated Orca action.
 * No-ops when nothing is in progress rather than firing a destructive command
 * speculatively.
 */
export async function abortArcConflict(
  arcRoot: string,
  options: ArcConflictExec = {}
): Promise<void> {
  const operation = await getArcConflictOperation(arcRoot, options)
  const buildArgs = ABORT_ARGS_BY_OPERATION[operation]
  if (!buildArgs) {
    return
  }
  await arcExecFileAsync(buildArgs(), arcExecOptions(arcRoot, options))
}
