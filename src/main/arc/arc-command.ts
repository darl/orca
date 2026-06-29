import { execFile } from 'child_process'
import { promisify } from 'util'
import { DEFAULT_GIT_MAX_BUFFER } from '../git/runner'

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
