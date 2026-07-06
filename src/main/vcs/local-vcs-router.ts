import { detectVcs } from './detect-vcs'
import { isArcVcsEnabled } from './arc-vcs-flag'
import type { VcsKind } from './detect-vcs'

/**
 * Decide which VCS backend a *local* worktree operation should route to.
 *
 * Returns `'arc'` only when the arc flag is on AND the path is detected as an
 * arc working copy; otherwise `'git'`. With the flag off this is always `'git'`,
 * preserving today's behavior exactly (the strangler invariant — the git path is
 * never diverted until arc support is explicitly enabled).
 *
 * Only for local targets: SSH/relay routing resolves on the host side, and
 * {@link detectVcs} deliberately reports remote-scoped probes as unknown.
 */
export function routeLocalVcsKind(path: string): VcsKind {
  if (isArcVcsEnabled() && detectVcs(path).kind === 'arc') {
    return 'arc'
  }
  return 'git'
}

/**
 * Resolve the arc repository (mount) root a local operation should run against,
 * or `null` when the path is not arc-routed. arc reports and consumes
 * repo-root-relative paths, so every arc source-control op runs at this root
 * regardless of where the agent/worktree cwd sits inside the mount (an Orca arc
 * worktree's path is `mount + projectSubpath`). Same flag/detection gate as
 * {@link routeLocalVcsKind}, so the git path is never diverted when the flag is
 * off.
 */
export function resolveLocalArcRoot(path: string): string | null {
  if (!isArcVcsEnabled()) {
    return null
  }
  const detection = detectVcs(path)
  return detection.kind === 'arc' ? detection.root : null
}
