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
