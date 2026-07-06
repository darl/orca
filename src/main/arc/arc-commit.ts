import { arcCommitArgs, arcExecFileAsync } from './arc-command'

type ArcCommitExec = { signal?: AbortSignal }

/**
 * Read the useful message off whichever channel arc populated. Pre-commit/hook
 * failures land on stderr; "nothing to commit" lands on stdout — mirrors the git
 * commit error surfacing so the renderer shows the same shape of message. Unlike
 * the shared arcErrorText, commit must also consult stdout (that is where the
 * empty-commit message goes).
 */
function readCommitError(error: unknown): string {
  const field = (name: string): string | null => {
    if (typeof error === 'object' && error && name in error) {
      const value = (error as Record<string, unknown>)[name]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }
    return null
  }
  return (
    field('stderr') ?? field('stdout') ?? (error instanceof Error ? error.message : 'Commit failed')
  )
}

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
    await arcExecFileAsync(arcCommitArgs(message), {
      cwd: arcRoot,
      ...(options.signal ? { signal: options.signal } : {})
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: readCommitError(error) }
  }
}
