# arc JSON fixtures (captured 2026-06-29, arc v19368385, from mounted ~/arcadia)

Real outputs for the arc backend parser (T12) and conformance fixtures (D10/T7).
Captured read-only from a live VFS mount. Files: `info.json`, `status-clean.json`
(actually dirty — pre-existing mods), `status-branch.json`, `branch-vv.json`, `log.json`.

## arc info --json
```
{ repository, remote, author, summary, remote_head, user_login,
  branch, mount_id, repository_type:"vfs", date, message, hash }
```
- `branch` = current branch; `remote` = upstream ref name (no `arcadia/` prefix here);
  `hash`/`remote_head` = HEAD / remote HEAD commit. `repository_type:"vfs"` confirms FUSE.
- Drives upstream resolution (TENSION-1 mechanism): branch + remote + hash.

## arc status --json   →  {status:{changed:[{status,type,path}]}}
- entry: `{ status:"modified"|…, type:"file"|…, path:<repo-relative> }`
- Matches `arc-wt` `_parse_status_json` (`status.changed`). NO staged/unstaged split here. ⚠️ see Open #2.

## arc status --json --branch   →  adds `branch_info`
```
branch_info: { local:{name,commit:{id,title,date,author}},
               remote:{name:"arcadia/users/darl/submit-…", commit:{id,…}} }
```
- Remote ref is prefixed **`arcadia/…`** (confirms T13: base/remote is NOT `origin/…`).
- ⚠️ No numeric ahead/behind field when local.commit.id == remote.commit.id (in sync).
  Ahead/behind likely derived by comparing ids, or only emitted when divergent. See Open #1.

## arc branch --json -vv   →  [{local:bool, name, commit:{id,title,date,author}, remote:"arcadia/…"}]
- Per-branch upstream via `remote`. Maps to listLocalBranches + upstream name.

## arc log --json -n N   →  [{commit, parents:[…], author, date, message, branches:{local:[],remote:[],head:bool}}]
- `parents` array → merge detection; `branches` → ref decoration. Maps cleanly to GitHistoryResult.

## Staging areas — RESOLVED (captured from throwaway mount, files status-{untracked,staged,modified,ahead}.json)
`arc status --json` splits into THREE keyed sections that map 1:1 to Orca's GitStagingArea:
```
status.staged[]    → area=staged     (status:"new file" | "modified" | "deleted" | …)
status.changed[]   → area=unstaged   (status:"modified" | …)
status.untracked[] → area=untracked  (status:"untracked", needs -u all)
entry shape everywhere: { status, type:"file"|…, path }
```
So arc has git-like three-area staging; the parser keys directly off these section names. No area
ambiguity. (status-staged.json shows a `new file` under `staged`; status-modified.json shows
`modified` under `changed`; status-untracked.json shows it under `untracked`.)

## Ahead/behind — RESOLVED (mechanism)
`status --json --branch` gives `branch_info.local.commit.id` and (if upstream exists)
`branch_info.remote.commit.id`, but NO numeric counts. A no-remote branch has only `local`.
→ Orca must DERIVE counts via `arc log` ranges (as `arc-wt` does):
ahead = `arc log <remote|trunk>..HEAD`, behind = `arc log HEAD..<remote|trunk>`; remote ref is
`arcadia/<branch>` (fall back to `trunk` when no remote). info/status give the ids; log gives counts.

## Conflicts — RESOLVED (captured: status-conflict.json, status-conflict-branch.json)
`arc status --json` adds an **`unmerged[]`** section:
```
status.unmerged[] = { status:"conflict", path,
  conflict:{ type:"content", our:{change}, their:{change}, base:{change} } }
```
- `our/their/base.change` ∈ modified|none|… → derive GitConflictKind
  (our=modified+their=modified+base=none → both_modified; etc.).
`arc status --json --branch` reports the OPERATION inline in `branch_info`:
```
branch_info: { sequencer:"rebase"|"merge"|"cherry-pick", rebasing:bool, conflicts:bool, detached:bool }
```
→ GitConflictOperation comes from `branch_info.sequencer` — NO `.arc/` marker-file reading
(better than git, which parses `.git/MERGE_HEAD`/`rebase-merge`). conflictStatus = unresolved.

## STILL OPEN
(none blocking) — submodules, force-push-with-lease, Windows: all OUT OF SCOPE.
FUSE watcher scale: ASSUMED SUPPORTED (owner call). Arcanum: separate next plan.
