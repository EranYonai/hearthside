# Releases

Hearthside uses [semantic versioning](https://semver.org). The version lives in the root
`package.json` and is shown in the app.

1. While working, add a line under `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md) for each
   user-facing change (Added, Changed, Fixed, Removed, Security), with the PR number.
2. To cut a release, run `pnpm release patch` (or `minor`, `major`, or an exact `x.y.z`) in a PR.
   This bumps the version and moves the Unreleased notes under the new version with today's date.
3. When the PR merges, the Release workflow tags `v<version>` and publishes a GitHub release.
