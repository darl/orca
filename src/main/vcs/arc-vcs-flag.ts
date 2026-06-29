/**
 * Whether arc VCS support is enabled. Off by default — the entire arc backend
 * lands behind this flag so every milestone is reversible and prod never routes
 * an operation to a half-built arc impl.
 *
 * Backed by the `ORCA_ARC_VCS` env var during incremental development
 * (`1`/`true`/`on` enable it). This is intentionally a dev-dogfood switch; it
 * graduates to a GlobalSettings toggle when the backend is ship-ready (M4.5).
 */
export function isArcVcsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ORCA_ARC_VCS?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}
