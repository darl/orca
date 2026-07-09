import { execFile } from 'child_process'
import { promisify } from 'util'
import { DEFAULT_GIT_MAX_BUFFER, extractExecError } from '../git/runner'

const execFileAsync = promisify(execFile)

/**
 * Options for a single arc invocation. Mirrors the subset of git runner options
 * arc actually needs — arc is macOS/Linux only (its working copy is a FUSE
 * mount), so the WSL/Windows routing that the git runner carries does not apply.
 */
export type ArcExecOptions = {
  cwd: string
  signal?: AbortSignal
  timeout?: number
  maxBuffer?: number
  env?: NodeJS.ProcessEnv
}

/** Per-call knobs an arc op forwards from the runtime (just cancellation today). */
export type ArcOpExec = { signal?: AbortSignal }

/**
 * Build {@link ArcExecOptions} for an arc op running at `cwd` (always the arc
 * repository/mount root). Single source for the `{ cwd, signal? }` shape every
 * arc module needs, so cancellation is threaded uniformly.
 */
export function arcExecOptions(cwd: string, options: ArcOpExec = {}): ArcExecOptions {
  return { cwd, ...(options.signal ? { signal: options.signal } : {}) }
}

/**
 * Force arc to be non-interactive so a credential/confirmation prompt fails fast
 * instead of hanging the runtime — the same hazard the git runner guards against
 * (issue #5308). `GIT_TERMINAL_PROMPT=0` also covers arc's embedded git plumbing.
 */
function nonInteractiveArcEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    ARC_PROGRESS: 'none'
  }
}

/**
 * Async arc command execution. The arc analogue of `gitExecFileAsync`: fixed
 * binary + argv (never a shell string), bounded output buffer, non-interactive.
 */
export async function arcExecFileAsync(
  args: string[],
  options: ArcExecOptions
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('arc', args, {
    cwd: options.cwd,
    encoding: 'utf-8',
    maxBuffer: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
    env: nonInteractiveArcEnv(options.env),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeout ? { timeout: options.timeout } : {})
  })
  return { stdout, stderr }
}

/**
 * Buffer-returning arc execution for reading blob contents (`arc show`). Keeps
 * raw bytes so binary detection and base64 previews work — the string-decoding
 * `arcExecFileAsync` would corrupt non-UTF-8 blobs.
 */
export async function arcExecFileAsyncBuffer(
  args: string[],
  options: ArcExecOptions
): Promise<{ stdout: Buffer; stderr: Buffer }> {
  const { stdout, stderr } = await execFileAsync('arc', args, {
    cwd: options.cwd,
    encoding: 'buffer',
    maxBuffer: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
    env: nonInteractiveArcEnv(options.env),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeout ? { timeout: options.timeout } : {})
  })
  return { stdout: stdout as Buffer, stderr: stderr as Buffer }
}

/**
 * Run an arc command that emits JSON on stdout and parse it. Throws a labeled
 * error on non-JSON output so a schema/version drift fails loud (the parser
 * contract is pinned to the captured arc fixtures) rather than silently
 * yielding `undefined`.
 */
export async function arcExecJson<T>(args: string[], options: ArcExecOptions): Promise<T> {
  const { stdout } = await arcExecFileAsync(args, options)
  try {
    return JSON.parse(stdout) as T
  } catch (error) {
    const preview = stdout.slice(0, 200)
    throw new Error(
      `arc ${args.join(' ')} did not return valid JSON: ${(error as Error).message}\n${preview}`
    )
  }
}

/**
 * Best available human-readable text from a failed arc invocation. Delegates to
 * the shared {@link extractExecError}, which decodes both string and Buffer
 * stderr channels (arc's blob/patch reads reject with Buffer output) and falls
 * back to the thrown message.
 */
export function arcErrorText(error: unknown): string {
  const { stderr, stdout } = extractExecError(error)
  return stderr || stdout
}

// ─── argv builders ──────────────────────────────────────────────────
// Centralized so every call site shares one spelling of each arc command and
// the read surface stays auditable. Mirrors the captured arc-fixtures shapes.

/**
 * `arc status --json` argv. `branch` adds `branch_info` (current branch,
 * upstream identity, and the conflict sequencer). `untrackedAll` includes
 * untracked files via `-u all` so the untracked staging area is populated.
 */
export function arcStatusArgs(
  options: { branch?: boolean; untrackedAll?: boolean } = {}
): string[] {
  const args = ['status', '--json']
  if (options.branch) {
    args.push('--branch')
  }
  if (options.untrackedAll) {
    args.push('-u', 'all')
  }
  return args
}

/** `arc info --json` — current branch, remote ref, HEAD/remote commit ids. */
export function arcInfoArgs(): string[] {
  return ['info', '--json']
}

/** `arc log --json -n <limit>` — commit graph with parents + ref decoration. */
export function arcLogArgs(options: { limit?: number } = {}): string[] {
  const args = ['log', '--json']
  if (typeof options.limit === 'number' && options.limit > 0) {
    args.push('-n', String(options.limit))
  }
  return args
}

/** `arc branch --json -vv` — local branches with per-branch upstream ref. */
export function arcBranchArgs(): string[] {
  return ['branch', '--json', '-vv']
}

/** `arc merge-base <a> <b>` — best common ancestor commit of two refs. */
export function arcMergeBaseArgs(a: string, b: string): string[] {
  return ['merge-base', a, b]
}

/**
 * `arc show <rev>:<path>` — raw blob content at a revision (git-compatible).
 * `rev` may be HEAD, a commit id, or empty for the staged index blob (`:path`).
 * arc has no `--end-of-options`; the single `rev:path` positional is safe since
 * the path is always prefixed by `rev:`.
 */
export function arcShowBlobArgs(rev: string, filePath: string): string[] {
  return ['show', `${rev}:${filePath.replace(/\\/g, '/')}`]
}

/**
 * `arc mount -m <path> -S <store> --object-store <shared> -r <repo>` argv. arc's
 * worktree is a FUSE mount of the whole repository; a per-mount overlay `store`
 * keeps mount-local state while a shared `objectStore` lets every Orca-created
 * mount reuse one blob store so disk stays bounded.
 */
export function arcMountArgs(options: {
  mountPath: string
  store: string
  objectStore: string
  repo: string
}): string[] {
  return [
    'mount',
    '-m',
    options.mountPath,
    '-S',
    options.store,
    '--object-store',
    options.objectStore,
    '-r',
    options.repo
  ]
}

/** `arc mount <path>` — remount an existing, currently-unmounted worktree. */
export function arcRemountArgs(mountPath: string): string[] {
  return ['mount', mountPath]
}

/** `arc mount --list --json` — every known mount with status/store paths. */
export function arcMountListArgs(): string[] {
  return ['mount', '--list', '--json']
}

/** `arc unmount <path> [--forget]` — `--forget` also drops the mount registration. */
export function arcUnmountArgs(mountPath: string, options: { forget?: boolean } = {}): string[] {
  const args = ['unmount', mountPath]
  if (options.forget) {
    args.push('--forget')
  }
  return args
}

/** `arc checkout -b <branch> <base>` — create and switch to a new branch off base. */
export function arcCheckoutNewBranchArgs(branch: string, base: string): string[] {
  return ['checkout', '-b', branch, base]
}

/**
 * `arc checkout <branch>` — switch the worktree to an existing local branch. No
 * trailing `--`: arc rejects the separator, and the branch name is validated for
 * a leading `-` by the caller so it is never parsed as an option.
 */
export function arcCheckoutBranchArgs(branch: string): string[] {
  return ['checkout', branch]
}

/**
 * `arc add <path>...` — stage file contents into the index. Paths are literal
 * (arc does not expand globs in a pathspec) and repo-root-relative, so no
 * `:(literal)` magic is needed — and arc rejects git's `--` separator.
 */
export function arcAddArgs(paths: string[]): string[] {
  return ['add', ...paths]
}

/**
 * `arc reset HEAD <path>...` — unstage paths back to HEAD. arc has no `restore`;
 * the explicit `HEAD` fills the leading `[BRANCH]` positional so a path is never
 * misparsed as a branch.
 */
export function arcResetPathsArgs(paths: string[]): string[] {
  return ['reset', 'HEAD', ...paths]
}

/** `arc commit -m <message>` — record the staged index as a new commit. */
export function arcCommitArgs(message: string): string[] {
  return ['commit', '-m', message]
}

/** `arc diff --cached --name-status` — staged file list with change kinds. */
export function arcDiffCachedNameStatusArgs(): string[] {
  return ['diff', '--cached', '--name-status']
}

/** `arc diff --cached --no-color` — staged patch (arc emits a patch by default). */
export function arcDiffCachedPatchArgs(): string[] {
  return ['diff', '--cached', '--no-color']
}

/** `arc fetch` — download refs for the current branch's upstream from arcadia. */
export function arcFetchArgs(): string[] {
  return ['fetch']
}

/**
 * `arc pull [--ff-only] [--rebase]` — fetch and integrate the current branch
 * with its upstream. arc resolves the single arcadia remote and the branch's
 * upstream itself, so no remote/branch positional is needed.
 */
export function arcPullArgs(options: { ffOnly?: boolean; rebase?: boolean } = {}): string[] {
  const args = ['pull']
  if (options.ffOnly) {
    args.push('--ff-only')
  }
  if (options.rebase) {
    args.push('--rebase')
  }
  return args
}

/** `arc rebase <upstream>` — reapply the current branch's commits onto `upstream`. */
export function arcRebaseArgs(upstream: string): string[] {
  return ['rebase', upstream]
}

/** `arc rebase --abort` — abort an in-progress rebase, restoring the original branch. */
export function arcRebaseAbortArgs(): string[] {
  return ['rebase', '--abort']
}

/** `arc cherry-pick --abort` — abort an in-progress cherry-pick sequence. */
export function arcCherryPickAbortArgs(): string[] {
  return ['cherry-pick', '--abort']
}

/**
 * `arc up --abort` — abort an in-progress `arc up` conflict resolution (arc's
 * merge-with-trunk flow), reconstructing the pre-up state. arc has no
 * `merge --abort`; `up --abort` is its documented merge-conflict abort.
 */
export function arcUpAbortArgs(): string[] {
  return ['up', '--abort']
}

/**
 * `arc checkout <rev> <path>...` — restore working-tree (and index) paths to
 * their content at `rev`. arc rejects `--`, so paths are bare positionals; that
 * is safe because arc never glob-expands them. Errors when a path is unknown at
 * `rev` (e.g. an untracked or newly-added file), which the caller uses to route
 * discard to a working-tree delete instead.
 */
export function arcCheckoutRestoreArgs(rev: string, paths: string[]): string[] {
  return ['checkout', rev, ...paths]
}
