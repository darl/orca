import {
  arcCommitArgs,
  arcErrorText,
  arcExecFileAsync,
  arcExecOptions,
  type ArcOpExec
} from './arc-command'

type ArcCommitExec = ArcOpExec

/**
 * Commit the staged index in an arc repo. Runs at the arc repository (mount)
 * root and commits whatever is staged — the same contract as the git path
 * ({@link ../git/status.commitChanges}), so the caller's staged-area state maps
 * one-to-one. Returns a result object rather than throwing so the renderer can
 * show hook/empty-commit failures inline.
 */
export async function commitArcChanges(
  arcRoot: string,
  message: string,
  options: ArcCommitExec = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    await arcExecFileAsync(arcCommitArgs(message), arcExecOptions(arcRoot, options))
    return { success: true }
  } catch (error) {
    // arcErrorText reads stderr (hook failures) then stdout ("nothing to commit").
    return { success: false, error: arcErrorText(error) }
  }
}
