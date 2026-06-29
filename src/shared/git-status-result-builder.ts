import type {
  GitConflictOperation,
  GitStatusEntry,
  GitStatusResult,
  GitUpstreamStatus
} from './git-status-types'

/**
 * The upstream pieces needed to fold an upstream-status block into the result.
 *
 * `statusSucceeded` gates whether any `upstreamStatus` is emitted at all (a
 * failed status read must not assert a false "no upstream" / 0-0 sync state).
 * `effective` is the richer probe result when available; otherwise we synthesize
 * from `upstreamName` + ahead/behind, or report `hasUpstream:false`.
 */
export type GitUpstreamFold = {
  statusSucceeded: boolean
  effective?: GitUpstreamStatus
  upstreamName?: string
  ahead: number
  behind: number
}

/**
 * Everything needed to assemble a {@link GitStatusResult}, independent of how it
 * was gathered. The git porcelain path and the arc `status --json` path both
 * compute these git-shaped pieces and hand them here, so the result object — key
 * presence, ordering, and the conditional upstream/limit/ignored folds — is
 * built in exactly one place.
 */
export type GitStatusResultBuildInput = {
  entries: GitStatusEntry[]
  conflictOperation: GitConflictOperation
  head?: string
  branch?: string
  includeIgnored: boolean
  ignoredPaths: string[]
  didHitLimit: boolean
  statusLength: number
  upstream: GitUpstreamFold
}

function foldUpstreamStatus(upstream: GitUpstreamFold): GitUpstreamStatus | undefined {
  if (!upstream.statusSucceeded) {
    // Why: a failed status read leaves upstream unknown — emit no block rather
    // than a misleading hasUpstream:false / 0-0 "in sync" signal.
    return undefined
  }
  if (upstream.effective) {
    return upstream.effective
  }
  return upstream.upstreamName
    ? {
        hasUpstream: true,
        upstreamName: upstream.upstreamName,
        ahead: upstream.ahead,
        behind: upstream.behind
      }
    : { hasUpstream: false, ahead: 0, behind: 0 }
}

/**
 * Assemble the canonical {@link GitStatusResult}. Key order and conditional
 * presence mirror the historical git porcelain assembly verbatim so existing
 * consumers (and serialized RPC payloads) are byte-identical after the
 * extraction. Optional blocks are spread in only when active:
 * `ignoredPaths` (when ignored were requested), `didHitLimit`/`statusLength`
 * (when the entry cap was hit), `upstreamStatus` (when status succeeded).
 */
export function buildGitStatusResult(input: GitStatusResultBuildInput): GitStatusResult {
  const upstreamStatus = foldUpstreamStatus(input.upstream)
  return {
    entries: input.entries,
    conflictOperation: input.conflictOperation,
    head: input.head,
    branch: input.branch,
    ...(input.includeIgnored ? { ignoredPaths: input.ignoredPaths } : {}),
    ...(input.didHitLimit ? { didHitLimit: true, statusLength: input.statusLength } : {}),
    ...(upstreamStatus ? { upstreamStatus } : {})
  }
}
