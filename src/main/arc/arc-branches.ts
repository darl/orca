import type { RuntimeGitLocalBranches } from '../../shared/runtime-types'
import { assertValidBranchName } from '../git/checkout'
import { arcBranchArgs, arcCheckoutBranchArgs, arcExecFileAsync, arcExecJson } from './arc-command'

type ArcBranchExec = { signal?: AbortSignal }

// One entry of `arc branch --json -vv`. `local` marks a local branch (vs a
// remote-tracking one); `current` marks the checked-out branch.
export type ArcBranchJson = {
  local?: boolean
  name?: string
  current?: boolean
}

/**
 * Reduce `arc branch --json` to the picker's shape: local branch short-names
 * with the current branch first. Filters to local branches so the list scopes
 * the same way git's `refs/heads/` enumeration does.
 */
export function parseArcBranches(entries: ArcBranchJson[]): RuntimeGitLocalBranches {
  let current: string | null = null
  const branches: string[] = []
  for (const entry of entries) {
    if (entry.local !== true || !entry.name) {
      continue
    }
    if (entry.current === true) {
      current = entry.name
    }
    branches.push(entry.name)
  }
  // Surface the checked-out branch first so the picker reads "you are here" at
  // the top, matching the git branch list ordering.
  branches.sort((a, b) => {
    if (a === current) {
      return -1
    }
    if (b === current) {
      return 1
    }
    return 0
  })
  return { current, branches }
}

export async function listArcLocalBranches(
  arcRoot: string,
  options: ArcBranchExec = {}
): Promise<RuntimeGitLocalBranches> {
  const entries = await arcExecJson<ArcBranchJson[]>(arcBranchArgs(), {
    cwd: arcRoot,
    ...(options.signal ? { signal: options.signal } : {})
  })
  return parseArcBranches(entries)
}

/**
 * Switch the worktree to an existing local branch. arc surfaces its own
 * "changes would be overwritten" error when uncommitted work conflicts, so that
 * message propagates instead of force-switching — the same posture as the git
 * checkout path.
 */
export async function checkoutArcBranch(
  arcRoot: string,
  branch: string,
  options: ArcBranchExec = {}
): Promise<void> {
  assertValidBranchName(branch)
  await arcExecFileAsync(arcCheckoutBranchArgs(branch), {
    cwd: arcRoot,
    ...(options.signal ? { signal: options.signal } : {})
  })
}
