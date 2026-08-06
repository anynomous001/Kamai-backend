# Contributing

## Branches

Three long-lived branches, matching the frontend repo's process:

- **`main`** — production. Deploys to Render (`kamai-backend-6n6v.onrender.com`). Only updated via PR from `stage`.
- **`stage`** — pre-production. Only updated via PR from `development`. See "Staging environment" below — as of 2026-08-07 there is no confirmed dedicated Render service for this branch.
- **`development`** — integration branch. All feature/fix work branches from here and merges back here via PR.

Nothing is committed directly to `main` or `stage`.

## Branch naming

- `feature/xyz` — new functionality
- `fix/xyz` — non-urgent bug fix, branched from `development`
- `hotfix/xyz` — urgent production bug, branched directly from `main` (see below)

## Promotion flow

```
feature/* ,fix/* ──PR──> development ──PR──> stage ──PR──> main
```

`development` and `stage` are expected to drift ahead of `main` between releases; `main` should never contain a commit that didn't pass through `development` and `stage` first — **except** hotfixes.

## Hotfixes

For a bug already live in production:

1. Branch `hotfix/xyz` directly off `main`.
2. Fix, verify, PR into `main`.
3. After merging to `main`, merge the same commit(s) back into both `stage` and `development` so they don't silently miss the fix and reintroduce the bug on the next normal promotion.

## CI

`.github/workflows/ci.yml` already runs lint, type-check, format-check, the full test suite (against real Postgres + Redis service containers), and a build/Docker-build check on every push and PR to `main`/`stage`/`development`. This gates merges into `main` and `stage` in practice even without a branch-protection "required status check" configured — treat a red CI run as blocking.

## Before merging to `main`

- CI must pass.
- Manual smoke test of the affected flow(s) against a real environment, not just a passing build — this backend's endpoints are consumed by two live frontends (baker webapp, wholesale webapp), so a schema/contract change can pass CI and still break a caller that isn't in this repo's test suite.
- PR description states what was verified and how.

## Current gaps (tracked, not yet closed)

- No dedicated staging deployment confirmed for `stage` — needs verifying in the Render dashboard whether a second service exists or would need to be created.
- Cross-repo contract changes (this backend's response/request shapes vs. the frontend repos that consume them) aren't caught by this repo's own CI — a backend branch can be fully green here and still be missing from `main` while a frontend already depends on it live. See the receipt-sharing incident this branch-flow setup was prompted by: `branded-receipt-image` had a correct, tested fix that simply never got merged to `main`.
