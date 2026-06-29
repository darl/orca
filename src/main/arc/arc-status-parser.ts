import type {
  GitConflictKind,
  GitConflictOperation,
  GitFileStatus,
  GitStagingArea,
  GitStatusEntry
} from '../../shared/git-status-types'

// ─── arc status --json wire shapes (pinned to arc v19368385) ─────────
// See arc-fixtures/SCHEMA.md. Sections are optional; absence = empty.

type ArcStatusEntry = { status?: string; type?: string; path?: string; oldPath?: string }

type ArcConflictSide = { change?: string }

type ArcUnmergedEntry = {
  status?: string
  path?: string
  conflict?: {
    type?: string
    our?: ArcConflictSide
    their?: ArcConflictSide
    base?: ArcConflictSide
  }
}

type ArcCommit = { id?: string; title?: string; date?: string; author?: string }

type ArcBranchInfo = {
  sequencer?: string
  rebasing?: boolean
  conflicts?: boolean
  detached?: boolean
  // arc emits numeric ahead/behind inline when the branch diverges from its
  // remote; the field is omitted entirely when the count is zero (in sync).
  ahead?: number
  behind?: number
  local?: { name?: string; commit?: ArcCommit }
  remote?: { name?: string; commit?: ArcCommit }
}

export type ArcStatusJson = {
  status?: {
    staged?: ArcStatusEntry[]
    changed?: ArcStatusEntry[]
    untracked?: ArcStatusEntry[]
    unmerged?: ArcUnmergedEntry[]
  }
  branch_info?: ArcBranchInfo
}

/**
 * The git-shaped pieces parsed out of `arc status --json [--branch]`, ready to
 * fold into a GitStatusResult by the arc status backend (M1.5 adds the
 * derived ahead/behind). Pure data — no I/O.
 */
export type ArcParsedStatus = {
  entries: GitStatusEntry[]
  conflictOperation: GitConflictOperation
  /** HEAD commit id (full sha), from branch_info.local.commit.id. */
  head?: string
  /** Full ref form `refs/heads/<name>`, matching git's porcelain parser. */
  branch?: string
  /** Upstream ref name from branch_info.remote.name (e.g. `arcadia/users/...`). */
  upstreamName?: string
  /** Commits ahead/behind the remote, read directly from branch_info (0 when
   * arc omits the field, i.e. in sync). */
  ahead: number
  behind: number
  /** Raw local/remote commit ids — useful for divergence checks. */
  localCommitId?: string
  remoteCommitId?: string
}

// arc `status` string → Orca GitFileStatus, per staging section. arc reports
// "new file" for a freshly-added staged entry; the untracked section reports
// "untracked". Unknown values throw (fixtures are the contract — fail loud on
// schema drift rather than silently mislabel a file).
const FILE_STATUS: Record<string, GitFileStatus> = {
  'new file': 'added',
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
  renamed: 'renamed',
  copied: 'copied',
  untracked: 'untracked'
}

// (our.change + their.change) → GitConflictKind. base.change is "none" for a
// content conflict (the merge base is the reference). Confirmed by fixture:
// modified+modified → both_modified. The remaining combinations follow git's
// unmerged-stage semantics. Unknown combos throw so a real add/delete conflict
// captured during dogfooding extends this table with evidence.
const CONFLICT_KIND: Record<string, GitConflictKind> = {
  'modified+modified': 'both_modified',
  'added+added': 'both_added',
  'deleted+deleted': 'both_deleted',
  'added+none': 'added_by_us',
  'none+added': 'added_by_them',
  'modified+deleted': 'deleted_by_them',
  'deleted+modified': 'deleted_by_us'
}

function mapArcFileStatus(area: GitStagingArea, raw: string | undefined): GitFileStatus {
  const mapped = raw ? FILE_STATUS[raw] : undefined
  if (!mapped) {
    throw new Error(`arc status: unknown ${area} file status "${raw}"`)
  }
  return mapped
}

function mapArcConflictKind(entry: ArcUnmergedEntry): GitConflictKind {
  const our = entry.conflict?.our?.change ?? 'none'
  const their = entry.conflict?.their?.change ?? 'none'
  const kind = CONFLICT_KIND[`${our}+${their}`]
  if (!kind) {
    throw new Error(
      `arc status: unmapped conflict (our="${our}", their="${their}") at ${entry.path}`
    )
  }
  return kind
}

/**
 * The in-progress sequencer operation. arc reports it inline as
 * `branch_info.sequencer` — no `.arc/` marker-file reading needed (cleaner than
 * git, which parses `.git/MERGE_HEAD` etc.). Absent → 'unknown', matching git's
 * detectConflictOperation default.
 */
function mapArcSequencer(branchInfo: ArcBranchInfo | undefined): GitConflictOperation {
  switch (branchInfo?.sequencer) {
    case 'rebase':
      return 'rebase'
    case 'merge':
      return 'merge'
    case 'cherry-pick':
      return 'cherry-pick'
    default:
      return 'unknown'
  }
}

function pushEntries(
  out: GitStatusEntry[],
  section: ArcStatusEntry[] | undefined,
  area: GitStagingArea
): void {
  for (const raw of section ?? []) {
    if (!raw.path) {
      throw new Error(`arc status: ${area} entry missing path`)
    }
    const entry: GitStatusEntry = {
      path: raw.path,
      status: mapArcFileStatus(area, raw.status),
      area
    }
    if (raw.oldPath) {
      entry.oldPath = raw.oldPath
    }
    out.push(entry)
  }
}

/**
 * Parse `arc status --json [--branch] [-u all]` into git-shaped pieces.
 *
 * Maps the three staging sections (staged/changed/untracked) to staging areas,
 * the `unmerged` section to conflict entries (per-file kind + unresolved
 * status), and `branch_info` to branch/head/upstream identity and the conflict
 * operation. Throws on unknown enum values — schema drift must fail loud.
 */
export function parseArcStatus(json: ArcStatusJson): ArcParsedStatus {
  const entries: GitStatusEntry[] = []
  const status = json.status ?? {}

  pushEntries(entries, status.staged, 'staged')
  pushEntries(entries, status.changed, 'unstaged')
  pushEntries(entries, status.untracked, 'untracked')

  for (const raw of status.unmerged ?? []) {
    if (!raw.path) {
      throw new Error('arc status: unmerged entry missing path')
    }
    // Conflicting files surface in the unstaged area with the conflict kind and
    // an unresolved status; the renderer stamps conflictStatusSource.
    entries.push({
      path: raw.path,
      status: 'modified',
      area: 'unstaged',
      conflictKind: mapArcConflictKind(raw),
      conflictStatus: 'unresolved'
    })
  }

  const branchInfo = json.branch_info
  const localName = branchInfo?.local?.name
  const localCommitId = branchInfo?.local?.commit?.id
  const remoteCommitId = branchInfo?.remote?.commit?.id

  return {
    entries,
    conflictOperation: mapArcSequencer(branchInfo),
    head: localCommitId,
    branch: localName ? `refs/heads/${localName}` : undefined,
    upstreamName: branchInfo?.remote?.name,
    ahead: branchInfo?.ahead ?? 0,
    behind: branchInfo?.behind ?? 0,
    localCommitId,
    remoteCommitId
  }
}
