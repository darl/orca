import { join, relative, sep } from 'path'

export const ARC_WORKTREES_DIRNAME = 'arcadia-wt'
export const ARC_STORES_RELDIR = join('.arc', 'stores')
export const ARC_SHARED_OBJECT_STORE_RELDIR = join('.arc', 'orca-object-store')

export type ArcWorktreeLayout = {
  mountPath: string
  agentCwd: string
  store: string
  objectStore: string
}

export type ArcWorktreeLayoutInput = {
  projectSubpath: string
  branch: string
  home: string
}

function encode(value: string): string {
  return value.replace(/%/g, '%25').replace(/\//g, '%2F')
}

function decode(value: string): string {
  return value.replace(/%2F/g, '/').replace(/%25/g, '%')
}

export function encodeArcProjectSegment(projectSubpath: string): string {
  return encode(projectSubpath)
}

export function decodeArcProjectSegment(segment: string): string {
  return decode(segment)
}

export function arcProjectSubpath(arcRoot: string, openedPath: string): string {
  const rel = relative(arcRoot, openedPath)
  return rel === '' || rel === '.' ? '' : rel.split('\\').join('/')
}

export function arcWorktreeProjectPrefix(input: { projectSubpath: string; home: string }): string {
  return join(input.home, ARC_WORKTREES_DIRNAME, encode(input.projectSubpath))
}

export function arcMountAgentCwd(mountPath: string, projectSubpath: string): string {
  return projectSubpath ? join(mountPath, projectSubpath) : mountPath
}

export function arcMountPathFromAgentCwd(agentCwd: string, projectSubpath: string): string {
  if (!projectSubpath) {
    return agentCwd
  }
  const suffix = `${sep}${projectSubpath.split('/').join(sep)}`
  return agentCwd.endsWith(suffix) ? agentCwd.slice(0, -suffix.length) : agentCwd
}

export function computeArcWorktreeLayout(input: ArcWorktreeLayoutInput): ArcWorktreeLayout {
  const projectSegment = encode(input.projectSubpath)
  const mountPath = join(input.home, ARC_WORKTREES_DIRNAME, projectSegment, input.branch)
  return {
    mountPath,
    agentCwd: arcMountAgentCwd(mountPath, input.projectSubpath),
    store: join(input.home, ARC_STORES_RELDIR, `${projectSegment}__${encode(input.branch)}`),
    objectStore: join(input.home, ARC_SHARED_OBJECT_STORE_RELDIR)
  }
}
