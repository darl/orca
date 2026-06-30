import { rm } from 'fs/promises'
import { relative, sep } from 'path'
import type { GitWorktreeInfo } from '../../shared/types'
import {
  arcCheckoutNewBranchArgs,
  arcExecFileAsync,
  arcExecJson,
  arcInfoArgs,
  arcMountArgs,
  arcMountListArgs,
  arcRemountArgs,
  arcStatusArgs,
  arcUnmountArgs
} from './arc-command'
import { parseArcStatus, type ArcStatusJson } from './arc-status-parser'
import {
  arcMountAgentCwd,
  arcWorktreeProjectPrefix,
  computeArcWorktreeLayout,
  type ArcWorktreeLayout
} from './arc-worktree-path'

export type ArcInfoJson = {
  branch?: string
  hash?: string
  remote?: string
  remote_head?: string
  repository?: string
}

export type ArcMountListEntry = {
  status: 'mounted' | 'unmounted' | string
  mount: string
  store?: string
  'object-store'?: string
  pid?: number
}

export type ArcExec = { signal?: AbortSignal }

export type AddArcWorktreeInput = {
  projectSubpath: string
  branch: string
  base: string
  repo: string
  home: string
} & ArcExec

export type AddArcWorktreeResult = {
  worktree: GitWorktreeInfo
  layout: ArcWorktreeLayout
}

function execOpts(cwd: string, options: ArcExec): { cwd: string; signal?: AbortSignal } {
  return { cwd, ...(options.signal ? { signal: options.signal } : {}) }
}

/** Read the arc repository name (`arcadia`) for the working copy at `cwd`. */
export async function readArcRepositoryName(cwd: string, options: ArcExec = {}): Promise<string> {
  const info = await arcExecJson<ArcInfoJson>(arcInfoArgs(), execOpts(cwd, options))
  return info.repository ?? 'arcadia'
}

function toBranchRef(branch: string | undefined): string {
  if (!branch) {
    return ''
  }
  return branch.startsWith('refs/') ? branch : `refs/heads/${branch}`
}

/**
 * Create an arc worktree: mount the whole repository at a per-project/branch path
 * with a shared object store, then create the new branch off `base`. Returns the
 * worktree in Orca's git-shaped form, with `path` set to the agent cwd (the
 * opened subtree inside the mount), so the rest of Orca treats it like any other
 * worktree.
 */
export async function addArcWorktree(input: AddArcWorktreeInput): Promise<AddArcWorktreeResult> {
  const layout = computeArcWorktreeLayout({
    projectSubpath: input.projectSubpath,
    branch: input.branch,
    home: input.home
  })

  await arcExecFileAsync(
    arcMountArgs({
      mountPath: layout.mountPath,
      store: layout.store,
      objectStore: layout.objectStore,
      repo: input.repo
    }),
    execOpts(input.home, input)
  )
  await arcExecFileAsync(
    arcCheckoutNewBranchArgs(input.branch, input.base),
    execOpts(layout.mountPath, input)
  )

  const info = await arcExecJson<ArcInfoJson>(arcInfoArgs(), execOpts(layout.mountPath, input))
  return {
    layout,
    worktree: {
      path: layout.agentCwd,
      head: info.hash ?? '',
      branch: toBranchRef(info.branch ?? input.branch),
      isBare: false,
      isMainWorktree: false
    }
  }
}

export type ListArcWorktreesInput = {
  projectSubpath: string
  home: string
} & ArcExec

function isUnderPrefix(mount: string, prefix: string): boolean {
  return mount === prefix || mount.startsWith(`${prefix}${sep}`)
}

/**
 * List arc worktrees for one project by filtering `arc mount --list --json` to
 * the project's mount prefix. Branch/head come from `arc info` for mounted
 * entries; unmounted entries fall back to the trailing path segment for the
 * branch and report an empty head until they are remounted.
 */
export async function listArcWorktrees(input: ListArcWorktreesInput): Promise<GitWorktreeInfo[]> {
  const entries = await arcExecJson<ArcMountListEntry[]>(
    arcMountListArgs(),
    execOpts(input.home, input)
  )
  const prefix = arcWorktreeProjectPrefix({
    projectSubpath: input.projectSubpath,
    home: input.home
  })
  const matched = entries.filter((entry) => isUnderPrefix(entry.mount, prefix))

  const worktrees: GitWorktreeInfo[] = []
  for (const entry of matched) {
    const agentCwd = arcMountAgentCwd(entry.mount, input.projectSubpath)
    const pathTailBranch = relative(prefix, entry.mount).split(sep).join('/')
    let branch = pathTailBranch
    let head = ''
    if (entry.status === 'mounted') {
      try {
        const info = await arcExecJson<ArcInfoJson>(arcInfoArgs(), execOpts(entry.mount, input))
        branch = info.branch ?? pathTailBranch
        head = info.hash ?? ''
      } catch {
        // Mounted but info failed (transient FUSE state) — keep the path-derived
        // branch and an empty head rather than dropping the worktree entirely.
      }
    }
    worktrees.push({
      path: agentCwd,
      head,
      branch: toBranchRef(branch),
      isBare: false,
      isMainWorktree: false
    })
  }
  return worktrees
}

async function readArcMainWorktree(repoPath: string, options: ArcExec): Promise<GitWorktreeInfo> {
  try {
    const info = await arcExecJson<ArcInfoJson>(arcInfoArgs(), execOpts(repoPath, options))
    return {
      path: repoPath,
      head: info.hash ?? '',
      branch: toBranchRef(info.branch),
      isBare: false,
      isMainWorktree: true
    }
  } catch {
    return { path: repoPath, head: '', branch: '', isBare: false, isMainWorktree: true }
  }
}

export type ListArcRepoWorktreesInput = {
  repoPath: string
  projectSubpath: string
  home: string
} & ArcExec

/**
 * List every worktree Orca should show for an opened arc subtree: the opened
 * subtree itself (the main mount) plus the arc worktrees created for this project
 * under `~/arcadia-wt`.
 */
export async function listArcRepoWorktrees(
  input: ListArcRepoWorktreesInput
): Promise<GitWorktreeInfo[]> {
  const main = await readArcMainWorktree(input.repoPath, input)
  const linked = await listArcWorktrees({
    projectSubpath: input.projectSubpath,
    home: input.home,
    ...(input.signal ? { signal: input.signal } : {})
  })
  return [main, ...linked.filter((worktree) => worktree.path !== main.path)]
}

export type RemountArcWorktreesResult = {
  remounted: string[]
  failed: { mount: string; error: string }[]
}

/**
 * Remount Orca-created arc worktrees that were left unmounted (e.g. after an app
 * or machine restart). Only touches mounts under `~/arcadia-wt`, so user mounts
 * elsewhere are never disturbed. Best-effort: a failed remount is recorded, not
 * thrown, so one bad mount can't block startup.
 */
export async function remountArcWorktrees(
  input: { home: string } & ArcExec
): Promise<RemountArcWorktreesResult> {
  const worktreesBase = arcWorktreeProjectPrefix({ projectSubpath: '', home: input.home })
  let entries: ArcMountListEntry[]
  try {
    entries = await arcExecJson<ArcMountListEntry[]>(
      arcMountListArgs(),
      execOpts(input.home, input)
    )
  } catch (error) {
    return { remounted: [], failed: [{ mount: worktreesBase, error: String(error) }] }
  }
  const result: RemountArcWorktreesResult = { remounted: [], failed: [] }
  for (const entry of entries) {
    if (entry.status !== 'unmounted' || !isUnderPrefix(entry.mount, worktreesBase)) {
      continue
    }
    try {
      await arcExecFileAsync(arcRemountArgs(entry.mount), execOpts(input.home, input))
      result.remounted.push(entry.mount)
    } catch (error) {
      result.failed.push({ mount: entry.mount, error: String(error) })
    }
  }
  return result
}

export type RemoveArcWorktreeInput = {
  agentCwd: string
  mountPath: string
  home: string
  force?: boolean
} & ArcExec

async function isArcWorktreeDirty(agentCwd: string, options: ArcExec): Promise<boolean> {
  const json = await arcExecJson<ArcStatusJson>(
    arcStatusArgs({ branch: true, untrackedAll: true }),
    execOpts(agentCwd, options)
  )
  return parseArcStatus(json).entries.length > 0
}

async function arcBranchHasUnpushedCommits(agentCwd: string, options: ArcExec): Promise<boolean> {
  let info: ArcInfoJson
  try {
    info = await arcExecJson<ArcInfoJson>(arcInfoArgs(), execOpts(agentCwd, options))
  } catch {
    return false
  }
  const branch = info.branch ?? ''
  if (!branch || branch === 'trunk') {
    return false
  }
  const range = info.remote ? `${info.remote}..HEAD` : 'trunk..HEAD'
  try {
    const { stdout } = await arcExecFileAsync(
      ['log', '--oneline', range],
      execOpts(agentCwd, options)
    )
    return stdout.trim().length > 0
  } catch {
    // No remote ref to compare against yet — fall back to commits beyond trunk so
    // unpushed local work still blocks a non-force removal.
    if (!info.remote) {
      return false
    }
    try {
      const { stdout } = await arcExecFileAsync(
        ['log', '--oneline', 'trunk..HEAD'],
        execOpts(agentCwd, options)
      )
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }
}

export async function assertArcWorktreeRemovable(
  input: Pick<RemoveArcWorktreeInput, 'agentCwd' | 'force'> & ArcExec
): Promise<void> {
  if (input.force) {
    return
  }
  if (await isArcWorktreeDirty(input.agentCwd, input)) {
    throw new Error('Worktree has uncommitted or untracked changes.')
  }
  if (await arcBranchHasUnpushedCommits(input.agentCwd, input)) {
    throw new Error('Worktree branch has commits that are not pushed.')
  }
}

/**
 * Remove an arc worktree: guard against dirty/unpushed state (unless forced),
 * unmount with `--forget` to drop the registration, then delete the mount
 * directory tree. arc's worktree is a FUSE mount, so removal is unmount + rmtree
 * rather than `git worktree remove`.
 */
export async function removeArcWorktree(input: RemoveArcWorktreeInput): Promise<void> {
  await assertArcWorktreeRemovable(input)
  try {
    await arcExecFileAsync(
      arcUnmountArgs(input.mountPath, { forget: true }),
      execOpts(input.home, input)
    )
  } catch (error) {
    console.warn(`[arc/worktree] failed to unmount ${input.mountPath}`, error)
  }
  await rm(input.mountPath, { recursive: true, force: true })
}
