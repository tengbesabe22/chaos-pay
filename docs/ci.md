# Continuous integration

The [CI workflow](../.github/workflows/ci.yml) checks proposed changes on GitHub
using the same `pnpm check` command used locally. It does not publish packages or
deploy infrastructure.

## Triggers and permissions

`pull_request` runs on PR creation, reopening, and new commits. GitHub normally
checks out the proposed merge with the base branch, so checks exercise the
combined code. `push` runs after updates to `main`, including merged PRs.
No path filters exclude documentation-only changes.

`permissions: contents: read` limits the workflow's repository token to reading
source. Checkout uses `persist-credentials: false`, so later Git commands do not
retain that credential. No user-provided secrets are required. The workflow uses
`pull_request`, not `pull_request_target`; fork contributions may require a
maintainer to approve the run under the repository's Actions settings.

## Jobs and cancellation

The matrix creates two independent Ubuntu jobs: **Check (Node 22)** and
**Check (Node 24)**. Each receives a fresh runner and executes all steps in order.
These test the two selected major release lines, not every supported patch or
operating system. `fail-fast: false` lets both jobs finish even if one fails.
`timeout-minutes: 15` bounds each job, including installation and tests.

The concurrency group contains the workflow name and PR number (or branch ref
for pushes). A newer run cancels an older run in that group. Different PRs run
independently; the two matrix jobs within a run do not cancel each other.

## Step-by-step

1. **Check out repository:** download the source into the runner's workspace.
2. **Install pinned pnpm:** read `packageManager` from the root `package.json`.
   Dependency installation is deliberately a separate step with its own log.
3. **Set up Node and pnpm cache:** select the matrix's Node version and restore
   pnpm's package store. pnpm must be installed before this action queries its
   store path. The lockfile participates in the cache key. This caches downloaded
   packages, not `node_modules`; installation still runs on a cache hit. A cache
   miss is normal and simply requires downloads.
4. **Install dependencies:** `--frozen-lockfile` prevents resolution from silently
   changing the lockfile. An inconsistent manifest and lockfile fail the job.
5. **Run project checks:** formatting, linting, builds, typechecking, then tests.
   Builds run before typechecking because workspace imports use built package
   declarations. A nonzero exit stops the command chain and fails the job.

Actions use full commit hashes with release comments. This holds their code
constant until a reviewed update. Node major versions still receive newer patch
releases, and Ubuntu runner images can change; the workflow is not a fully
immutable environment.

## Investigate a failed check

Open the PR's **Checks** tab, select a failed Node job, and expand the first failed
step. For a check failure, find the failing command and its diagnostic, then run
`pnpm check` locally. For installation failures, inspect the lockfile and dependency
error before changing application code. Compare both matrix results to identify
version-specific failures. Push the fix to the same PR branch to trigger a new run.

## Required checks

Creating the workflow does not automatically prevent merges. After the checks
have run, a repository administrator can configure a ruleset or branch protection
for `main` requiring **Check (Node 22)** and **Check (Node 24)**. Required-check names
must match the job names, so changes to these names need corresponding settings
updates. Keep any intended bypass permissions explicit. This workflow does not
change repository protection settings.

## References

- [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Node setup and caching](https://github.com/actions/setup-node)
- [pnpm setup](https://github.com/pnpm/action-setup)
