import {
  GIT_HISTORY_DEFAULT_LIMIT,
  GIT_HISTORY_MAX_LIMIT,
  type GitHistoryItemRef,
  type GitHistoryOptions,
  type GitHistoryResult
} from '../../shared/git-history-types'
import { shortGitHash } from '../../shared/git-history-log-parser'
import {
  arcExecFileAsync,
  arcExecJson,
  arcInfoArgs,
  arcLogArgs,
  arcMergeBaseArgs
} from './arc-command'
import { parseArcLog, type ArcLogCommit } from './arc-history-parser'
import type { ArcInfoJson } from './arc-worktree'

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return GIT_HISTORY_DEFAULT_LIMIT
  }
  return Math.min(
    GIT_HISTORY_MAX_LIMIT,
    Math.max(1, Math.trunc(limit ?? GIT_HISTORY_DEFAULT_LIMIT))
  )
}

async function resolveArcMergeBase(
  worktreePath: string,
  a: string,
  b: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  try {
    const { stdout } = await arcExecFileAsync(arcMergeBaseArgs(a, b), {
      cwd: worktreePath,
      ...(signal ? { signal } : {})
    })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Read commit history from an arc repo and translate it into Orca's git-shaped
 * {@link GitHistoryResult}. Mirrors the git history loader's semantics (current +
 * upstream ref, merge-base, incoming/outgoing, hasMore) but sources the pieces
 * from arc: identity via `arc info`, ancestry via `arc merge-base`, commits via
 * `arc log --json`.
 */
export async function getArcHistory(
  worktreePath: string,
  options: GitHistoryOptions & { signal?: AbortSignal } = {}
): Promise<GitHistoryResult> {
  const limit = clampLimit(options.limit)
  const execOptions = { cwd: worktreePath, ...(options.signal ? { signal: options.signal } : {}) }
  const info = await arcExecJson<ArcInfoJson>(arcInfoArgs(), execOptions)
  const headOid = info.hash?.trim() ?? ''
  if (!headOid) {
    return {
      items: [],
      hasIncomingChanges: false,
      hasOutgoingChanges: false,
      hasMore: false,
      limit
    }
  }

  const currentRef: GitHistoryItemRef = info.branch
    ? {
        id: `refs/heads/${info.branch}`,
        name: info.branch,
        revision: headOid,
        category: 'branches'
      }
    : { id: headOid, name: shortGitHash(headOid), revision: headOid, category: 'commits' }
  const remoteRef: GitHistoryItemRef | undefined =
    info.remote && info.remote_head
      ? {
          id: `refs/remotes/${info.remote}`,
          name: info.remote,
          revision: info.remote_head,
          category: 'remote branches'
        }
      : undefined

  let mergeBase: string | undefined
  if (remoteRef?.revision && currentRef.revision && remoteRef.revision !== currentRef.revision) {
    mergeBase = await resolveArcMergeBase(
      worktreePath,
      currentRef.revision,
      remoteRef.revision,
      options.signal
    )
  }

  const commits = await arcExecJson<ArcLogCommit[]>(arcLogArgs({ limit: limit + 1 }), execOptions)
  const parsed = parseArcLog(commits)
  const items = parsed.slice(0, limit)

  const hasIncomingChanges =
    Boolean(remoteRef?.revision && mergeBase) && remoteRef?.revision !== mergeBase
  const hasOutgoingChanges =
    Boolean(currentRef.revision && remoteRef?.revision && mergeBase) &&
    currentRef.revision !== mergeBase

  return {
    items,
    currentRef,
    ...(remoteRef ? { remoteRef } : {}),
    ...(mergeBase ? { mergeBase } : {}),
    hasIncomingChanges,
    hasOutgoingChanges,
    hasMore: parsed.length > limit,
    limit
  }
}
