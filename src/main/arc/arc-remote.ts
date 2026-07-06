import {
  arcErrorText,
  arcExecFileAsync,
  arcFetchArgs,
  arcPullArgs,
  arcRebaseArgs,
  type ArcExecOptions
} from './arc-command'

type ArcRemoteExec = { signal?: AbortSignal }

function execOptions(arcRoot: string, options: ArcRemoteExec): ArcExecOptions {
  return { cwd: arcRoot, ...(options.signal ? { signal: options.signal } : {}) }
}

// Surface arc's own message (it is descriptive: diverged branch, conflict,
// auth) rather than a synthesized one, so the renderer shows what arc reported.
async function runRemote(argv: string[], arcRoot: string, options: ArcRemoteExec): Promise<void> {
  try {
    await arcExecFileAsync(argv, execOptions(arcRoot, options))
  } catch (error) {
    throw new Error(arcErrorText(error))
  }
}

/** Fetch the current branch's upstream refs. Network read; no working-tree change. */
export async function fetchArc(arcRoot: string, options: ArcRemoteExec = {}): Promise<void> {
  await runRemote(arcFetchArgs(), arcRoot, options)
}

/** Fetch and integrate the current branch with its upstream (arc's default merge). */
export async function pullArc(arcRoot: string, options: ArcRemoteExec = {}): Promise<void> {
  await runRemote(arcPullArgs(), arcRoot, options)
}

/** Integrate only when a fast-forward is possible; abort otherwise. */
export async function fastForwardArc(arcRoot: string, options: ArcRemoteExec = {}): Promise<void> {
  await runRemote(arcPullArgs({ ffOnly: true }), arcRoot, options)
}

/**
 * Rebase the current branch onto `baseRef` (defaults to `trunk`, arc's mainline).
 * The git path pulls-with-rebase from the resolved base; arc reapplies the local
 * commits onto the base ref directly, which is the equivalent sync-onto-base op.
 */
export async function rebaseArcFromBase(
  arcRoot: string,
  baseRef: string,
  options: ArcRemoteExec = {}
): Promise<void> {
  const upstream = baseRef.trim() || 'trunk'
  await runRemote(arcRebaseArgs(upstream), arcRoot, options)
}
