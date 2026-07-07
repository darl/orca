import type { GitConflictOperation } from '../../shared/git-status-types'
import {
  arcCherryPickAbortArgs,
  arcExecFileAsync,
  arcExecJson,
  arcRebaseAbortArgs,
  arcStatusArgs,
  arcUpAbortArgs,
  type ArcExecOptions
} from './arc-command'
import { parseArcStatus, type ArcStatusJson } from './arc-status-parser'

type ArcConflictExec = { signal?: AbortSignal }

function execOptions(arcRoot: string, options: ArcConflictExec): ArcExecOptions {
  return { cwd: arcRoot, ...(options.signal ? { signal: options.signal } : {}) }
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
    execOptions(arcRoot, options)
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
  const argv =
    operation === 'rebase'
      ? arcRebaseAbortArgs()
      : operation === 'cherry-pick'
        ? arcCherryPickAbortArgs()
        : operation === 'merge'
          ? arcUpAbortArgs()
          : null
  if (!argv) {
    return
  }
  await arcExecFileAsync(argv, execOptions(arcRoot, options))
}
