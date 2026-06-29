# TODOS

## Arcanum as a ForgeProvider (review/PR layer)

**What:** Add Yandex arcanum to the existing `ForgeProvider` system (`src/main/source-control/forge-provider.ts`, alongside github/gitlab/bitbucket/azure-devops/gitea) for code-review / PR operations. Independent of the arc-VCS backend work.

**Why:** The arc-as-VCS eng review (2026-06-29) split ref-semantics (VCS layer) from URL/review (forge layer). Arcanum slots into the mature `ForgeProvider` abstraction the same way GitLab did, and delivers most of the perceived value for Yandex users while the arc-VCS discovery phase runs.

**Pros:** Contained to the forge layer; reuses a proven 5-backend plugin system; can ship in parallel to (and independent of) the arc-VCS effort; low blast radius.

**Cons / context:** Review creation currently depends on git branch/upstream/remote identity. Arcanum needs its own **change-identity model** — trunk target + current revision/bookmark + review-object linkage + provider-specific publish semantics — rather than mapping to a git remote branch. That model is the real design work; the ForgeProvider wiring is mechanical.

**Where to start:** New `src/main/arcanum/` mirroring `src/main/gitlab/` (client + mappers + repository-ref), add `'arcanum'` to `ForgeProviderId` / `HostedReviewProvider`, register in the provider array + detection (`.arc` dir, `a.yandex-team.ru` remote), add the change-identity mapper to `forge-review-mappers.ts`.

**Depends on:** Nothing. Can start immediately, parallel to the arc-VCS semantics spike.
