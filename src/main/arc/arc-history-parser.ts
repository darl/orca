import type { GitHistoryItem, GitHistoryItemRef } from '../../shared/git-history-types'
import {
  compareGitHistoryItemRefsByCategory,
  shortGitHash
} from '../../shared/git-history-log-parser'

export type ArcLogCommit = {
  commit: string
  parents?: string[]
  author?: string
  date?: string
  message?: string
  branches?: {
    local?: string[]
    remote?: string[]
    head?: boolean
  }
}

function subjectOf(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim()
  return firstLine || '(no commit message)'
}

function referencesOf(commit: ArcLogCommit): GitHistoryItemRef[] {
  const refs: GitHistoryItemRef[] = []
  for (const name of commit.branches?.local ?? []) {
    refs.push({ id: `refs/heads/${name}`, name, revision: commit.commit, category: 'branches' })
  }
  for (const name of commit.branches?.remote ?? []) {
    refs.push({
      id: `refs/remotes/${name}`,
      name,
      revision: commit.commit,
      category: 'remote branches'
    })
  }
  return refs.sort(compareGitHistoryItemRefsByCategory)
}

/**
 * Translate `arc log --json` output into Orca's git-shaped {@link GitHistoryItem}
 * list. arc emits a well-typed commit array (commit/parents/author/date/message
 * + inline branch decoration), so this maps fields directly — no format string
 * to parse. arc `date` is ISO-8601 with a timezone, already millisecond-precise
 * once parsed, unlike git's `%at` epoch-seconds.
 */
export function parseArcLog(commits: ArcLogCommit[]): GitHistoryItem[] {
  const items: GitHistoryItem[] = []
  for (const commit of commits) {
    const hash = commit.commit?.trim() ?? ''
    if (!/^[0-9a-fA-F]{7,64}$/.test(hash)) {
      continue
    }
    const message = commit.message ?? ''
    const timestamp = commit.date ? Date.parse(commit.date) : Number.NaN
    items.push({
      id: hash,
      parentIds: commit.parents ?? [],
      subject: subjectOf(message),
      message,
      ...(commit.author ? { author: commit.author } : {}),
      displayId: shortGitHash(hash),
      ...(Number.isFinite(timestamp) ? { timestamp } : {}),
      references: referencesOf(commit)
    })
  }
  return items
}
