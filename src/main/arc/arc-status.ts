import type { GitProviderStatusOptions } from '../providers/types'
import type { GitStatusResult, GitUpstreamStatus } from '../../shared/git-status-types'
import { buildGitStatusResult } from '../../shared/git-status-result-builder'
import { arcExecJson, arcStatusArgs } from './arc-command'
import { parseArcStatus, type ArcStatusJson } from './arc-status-parser'
import { deriveArcUpstreamFold } from './arc-upstream'

/**
 * Read working-copy status from an arc repo and translate it into Orca's
 * git-shaped {@link GitStatusResult}.
 *
 * Runs `arc status --json --branch -u all`, parses the staging sections,
 * conflicts, branch identity, and the inline ahead/behind counts, then folds it
 * all through the shared builder so the result is byte-identical in shape to the
 * git path. Reached only when the arc flag is on and the path is an arc working
 * copy.
 *
 * Note: the entry-limit cap (didHitLimit) is not applied here — arc status is
 * not streamed. A future hardening pass can bound very large arc status output.
 */
export async function getArcStatus(
  worktreePath: string,
  options?: GitProviderStatusOptions
): Promise<GitStatusResult> {
  const json = await arcExecJson<ArcStatusJson>(
    arcStatusArgs({ branch: true, untrackedAll: true }),
    { cwd: worktreePath }
  )
  const parsed = parseArcStatus(json)
  const upstream = deriveArcUpstreamFold(parsed)

  return buildGitStatusResult({
    entries: parsed.entries,
    conflictOperation: parsed.conflictOperation,
    head: parsed.head,
    branch: parsed.branch,
    includeIgnored: options?.includeIgnored === true,
    ignoredPaths: [],
    didHitLimit: false,
    statusLength: 0,
    upstream
  })
}

/**
 * Standalone upstream refresh for an arc worktree (the explicit
 * upstream-status RPC, separate from a full status read). arc reports
 * ahead/behind inline in `branch_info`, so this reuses the same
 * status-derived fold as {@link getArcStatus} — `hasUpstream` is true exactly
 * when the branch tracks an `arcadia/<branch>` remote. arc has a single remote,
 * so any `pushTarget` selection is inert and ignored.
 */
export async function getArcUpstreamStatus(worktreePath: string): Promise<GitUpstreamStatus> {
  const json = await arcExecJson<ArcStatusJson>(arcStatusArgs({ branch: true }), {
    cwd: worktreePath
  })
  const fold = deriveArcUpstreamFold(parseArcStatus(json))
  return {
    hasUpstream: fold.upstreamName !== undefined,
    ...(fold.upstreamName ? { upstreamName: fold.upstreamName } : {}),
    ahead: fold.ahead,
    behind: fold.behind
  }
}
