import { rm } from 'fs/promises'
import { join } from 'path'
import { removeSafeUntrackedDiscardTarget } from '../../shared/git-discard-path-safety'
import {
  arcAddArgs,
  arcCheckoutRestoreArgs,
  arcErrorText,
  arcExecFileAsync,
  arcResetPathsArgs,
  type ArcExecOptions
} from './arc-command'

type ArcStageExec = { signal?: AbortSignal }

// Batch size for `arc add` / `arc reset` argv so a "stage all" on a large
// changeset never overflows the process argument limit (E2BIG).
const ARC_BULK_CHUNK_SIZE = 100

/**
 * All arc source-control ops run at the arc repository (mount) root and take
 * repo-root-relative paths — the same paths `arc status` emits. arc resolves
 * pathspecs relative to cwd, so running anywhere but the root would mis-resolve
 * the repo-root-relative paths the renderer echoes back.
 */
function execOptions(arcRoot: string, options: ArcStageExec): ArcExecOptions {
  return { cwd: arcRoot, ...(options.signal ? { signal: options.signal } : {}) }
}

// arc prints this when a checkout target does not exist at the given revision —
// the signal that a discard target is untracked/newly-added and must be deleted
// rather than restored. Distinguished from transient failures so an unexpected
// arc error never silently deletes a working file.
function isArcPathNotInRevError(error: unknown): boolean {
  return /did not match any file/i.test(arcErrorText(error))
}

async function removeArcWorkingPath(arcRoot: string, filePath: string): Promise<void> {
  await rm(join(arcRoot, filePath), { recursive: true, force: true })
}

export async function stageArcFile(
  arcRoot: string,
  filePath: string,
  options: ArcStageExec = {}
): Promise<void> {
  await arcExecFileAsync(arcAddArgs([filePath]), execOptions(arcRoot, options))
}

export async function unstageArcFile(
  arcRoot: string,
  filePath: string,
  options: ArcStageExec = {}
): Promise<void> {
  await arcExecFileAsync(arcResetPathsArgs([filePath]), execOptions(arcRoot, options))
}

export async function bulkStageArcFiles(
  arcRoot: string,
  filePaths: string[],
  options: ArcStageExec = {}
): Promise<void> {
  for (let i = 0; i < filePaths.length; i += ARC_BULK_CHUNK_SIZE) {
    const chunk = filePaths.slice(i, i + ARC_BULK_CHUNK_SIZE)
    await arcExecFileAsync(arcAddArgs(chunk), execOptions(arcRoot, options))
  }
}

export async function bulkUnstageArcFiles(
  arcRoot: string,
  filePaths: string[],
  options: ArcStageExec = {}
): Promise<void> {
  for (let i = 0; i < filePaths.length; i += ARC_BULK_CHUNK_SIZE) {
    const chunk = filePaths.slice(i, i + ARC_BULK_CHUNK_SIZE)
    await arcExecFileAsync(arcResetPathsArgs(chunk), execOptions(arcRoot, options))
  }
}

/**
 * Discard working-tree changes for a file. A tracked file is restored to its
 * HEAD content via `arc checkout HEAD <path>` (which also drops any staged
 * change — arc has no working-tree-only restore). When arc reports the path as
 * unknown at HEAD it is untracked or newly-added: unstage any index entry, then
 * delete the working file through the shared symlink-safe remover.
 */
export async function discardArcChanges(
  arcRoot: string,
  filePath: string,
  options: ArcStageExec = {}
): Promise<void> {
  try {
    await arcExecFileAsync(
      arcCheckoutRestoreArgs('HEAD', [filePath]),
      execOptions(arcRoot, options)
    )
    return
  } catch (error) {
    if (!isArcPathNotInRevError(error)) {
      throw error
    }
  }
  // Best-effort unstage: a newly-added file must leave the index; a purely
  // untracked file makes this a harmless no-op.
  await arcExecFileAsync(arcResetPathsArgs([filePath]), execOptions(arcRoot, options)).catch(
    () => {}
  )
  await removeSafeUntrackedDiscardTarget(arcRoot, filePath, (target) =>
    removeArcWorkingPath(arcRoot, target)
  )
}

/**
 * Discard many paths. Restores are batched for the common all-tracked case; a
 * chunk containing an untracked/newly-added path makes arc reject the whole
 * chunk, so it falls back to per-path {@link discardArcChanges} which deletes
 * untracked targets individually.
 */
export async function bulkDiscardArcChanges(
  arcRoot: string,
  filePaths: string[],
  options: ArcStageExec = {}
): Promise<void> {
  if (filePaths.length === 0) {
    return
  }
  for (let i = 0; i < filePaths.length; i += ARC_BULK_CHUNK_SIZE) {
    const chunk = filePaths.slice(i, i + ARC_BULK_CHUNK_SIZE)
    try {
      await arcExecFileAsync(arcCheckoutRestoreArgs('HEAD', chunk), execOptions(arcRoot, options))
    } catch (error) {
      if (!isArcPathNotInRevError(error)) {
        throw error
      }
      for (const filePath of chunk) {
        await discardArcChanges(arcRoot, filePath, options)
      }
    }
  }
}
