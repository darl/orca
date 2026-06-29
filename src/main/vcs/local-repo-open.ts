import { isGitRepo, getGitRepoRoot } from '../git/repo'
import { detectVcs } from './detect-vcs'
import { isArcVcsEnabled } from './arc-vcs-flag'

export type LocalRepoOpen = {
  isRepo: boolean
  resolvedPath: string
}

export function detectLocalRepoOpen(path: string): LocalRepoOpen {
  if (isArcVcsEnabled() && detectVcs(path).kind === 'arc') {
    return { isRepo: true, resolvedPath: path }
  }
  if (isGitRepo(path)) {
    return { isRepo: true, resolvedPath: getGitRepoRoot(path) }
  }
  return { isRepo: false, resolvedPath: path }
}
