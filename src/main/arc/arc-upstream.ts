import type { GitUpstreamFold } from '../../shared/git-status-result-builder'
import type { ArcParsedStatus } from './arc-status-parser'

/**
 * Map parsed arc status into the upstream fold (hasUpstream + ahead/behind).
 *
 * arc reports ahead/behind numerically inline in `branch_info` (omitted when
 * zero), so no `arc log` range-counting is needed — the parser already surfaced
 * the counts. `hasUpstream` is true exactly when the branch tracks a remote ref
 * (`arcadia/<branch>`); a local-only branch reports no upstream, and its
 * ahead/behind are zero.
 *
 * Pure (no I/O): the I/O happened in the single `arc status` call.
 */
export function deriveArcUpstreamFold(parsed: ArcParsedStatus): GitUpstreamFold {
  return {
    statusSucceeded: true,
    upstreamName: parsed.upstreamName,
    ahead: parsed.ahead,
    behind: parsed.behind
  }
}
