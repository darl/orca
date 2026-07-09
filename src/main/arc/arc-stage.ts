import { rm } from 'fs/promises'
import { join } from 'path'
import { removeSafeUntrackedDiscardTarget } from '../../shared/git-discard-path-safety'
import { BULK_CHUNK_SIZE } from '../git/status'
import {
  arcAddArgs,
  arcCheckoutRestoreArgs,
  arcErrorText,
  arcExecFileAsync,
  arcExecOptions,
  arcResetPathsArgs,
  type ArcOpExec
} from './arc-command'

type ArcStageExec = ArcOpExec

// All arc source-control ops run at the arc repository (mount) root and take
// repo-root-relative paths — the same paths `arc status` emits. arc resolves
// pathspecs relative to cwd, so running anywhere but the root would mis-resolve
// the repo-root-relative paths the renderer echoes back. execOptions is the
// shared arcExecOptions; the chunk size is git's shared E2BIG batch bound.
const execOptions = arcExecOptions

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

// Run one arc index command over many paths in argv-bounded chunks (E2BIG
// guard). Chunks run serially — they mutate the same index and arc locks it.
async function bulkArcIndexOp(
  arcRoot: string,
  filePaths: string[],
  buildArgs: (paths: string[]) => string[],
  options: ArcStageExec
): Promise<void> {
  for (let i = 0; i < filePaths.length; i += BULK_CHUNK_SIZE) {
    const chunk = filePaths.slice(i, i + BULK_CHUNK_SIZE)
    await arcExecFileAsync(buildArgs(chunk), execOptions(arcRoot, options))
  }
}

export async function bulkStageArcFiles(
  arcRoot: string,
  filePaths: string[],
  options: ArcStageExec = {}
): Promise<void> {
  await bulkArcIndexOp(arcRoot, filePaths, arcAddArgs, options)
}

export async function bulkUnstageArcFiles(
  arcRoot: string,
  filePaths: string[],
  options: ArcStageExec = {}
): Promise<void> {
  await bulkArcIndexOp(arcRoot, filePaths, arcResetPathsArgs, options)
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
  for (let i = 0; i < filePaths.length; i += BULK_CHUNK_SIZE) {
    const chunk = filePaths.slice(i, i + BULK_CHUNK_SIZE)
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
