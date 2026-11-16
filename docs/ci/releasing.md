# Releasing

`main` is the stable branch. A release is a `vX.Y.Z` tag on a commit of `main`; there
is no separate development or release branch. Pushing the tag makes GitHub Actions
create the GitHub Release. Nothing is deployed and no image or package is published.

## Versions

The version lives in `package.json` and follows [Semantic Versioning](https://semver.org).
While the version is `0.x`, a minor bump may include breaking changes; say so in the
changelog. Bump:

- **patch** for fixes and dependency updates,
- **minor** for new features, new migrations, or anything an operator must act on,
- **major** (from 1.0.0 on) for breaking changes.

## Changelog

Every pull request that users or operators would notice adds a line under
`## [Unreleased]` in [`CHANGELOG.md`](../../CHANGELOG.md), in a
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) group (Added, Changed,
Fixed, Removed, Security). That section becomes the release notes.

## Cut a release

The first release, `v0.1.0`, is already prepared: `package.json` says `0.1.0` and
the changelog has a dated `0.1.0` section. If you tag on a later day, change that
date in a pull request first, then continue at step 2.

1. Open a pull request that:
   - sets `version` in `package.json` to the new `X.Y.Z`;
   - renames `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today's date) and adds
     a new empty `## [Unreleased]` above it;
   - updates the link definitions at the bottom of the changelog.
2. Check the notes locally. This prints exactly what the release will say, or fails
   with the reason:

   ```sh
   .github/scripts/release-notes.sh vX.Y.Z
   ```

3. Merge the pull request once the required checks pass.
4. Tag the merge commit on `main` and push the tag:

   ```sh
   git switch main && git pull --ff-only
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. Watch the `Release` workflow (`gh run watch`), then read the published release.

The workflow (`.github/workflows/release.yml`) refuses to publish unless:

- the tagged commit is on `main`;
- the tag is exactly `v` + the `package.json` version;
- `CHANGELOG.md` has a dated, non-empty section for that version.

## If something goes wrong

- **The workflow failed before creating the release.** Fix the cause on `main` through
  a pull request. Delete the tag (`git push origin :refs/tags/vX.Y.Z`, then
  `git tag -d vX.Y.Z`), tag the fixed commit and push again.
- **A release is wrong after publishing.** Do not move a published tag. Fix forward
  with a new patch release, and edit the bad release's notes on GitHub to point at it.

## Deployments

Releasing does not deploy. Deploying a release to Railway is a separate, deliberate
step described in [Operations](../../deploy/OPERATIONS.md#updates).
