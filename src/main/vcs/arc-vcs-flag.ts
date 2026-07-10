/**
 * Whether arc VCS support is enabled. Off by default — the entire arc backend
 * lands behind this flag so every milestone is reversible and prod never routes
 * an operation to a half-built arc impl.
 *
 * Two independent enablers, OR'd together:
 * - the `ORCA_ARC_VCS` env var (`1`/`true`/`on`) — the dev-dogfood switch used
 *   during incremental development;
 * - the `arcVcs` GlobalSettings toggle — the in-product opt-in the flag
 *   graduates to (M4.5). Main seeds and updates the snapshot below from the
 *   settings store; it stays `false` until then, so the env var is the only
 *   enabler in contexts without a settings store (tests, early boot).
 *
 * The flag is read synchronously on hot per-op paths (routing/detection), so the
 * settings value is mirrored into a module-level snapshot rather than read from
 * the async store at each call.
 */
let settingEnabled = false

/**
 * Update the cached `arcVcs` settings value. Called by main when the settings
 * store loads and on every change, so {@link isArcVcsEnabled} can consult it
 * synchronously. No-op-safe to call repeatedly.
 */
export function setArcVcsSettingEnabled(enabled: boolean): void {
  settingEnabled = enabled
}

function isArcVcsEnvEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.ORCA_ARC_VCS?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}

export function isArcVcsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isArcVcsEnvEnabled(env) || settingEnabled
}
