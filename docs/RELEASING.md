# Releasing

Heading Numerals follows the same numeric-tag and three-loose-asset convention as the sibling Obsidian plugins.

## Local preflight

1. Set the same stable version in `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`.
2. Run `npm ci` and `npm run release:check` on the intended commit.
3. Run `node scripts/check-release-version.mjs x.y.z`.
4. Complete and record the real Obsidian checks in `docs/ACCEPTANCE.md`.
5. Confirm `git status --short` is clean and the intended commit is on `origin/main`.

## Publication

Push an immutable numeric tag such as `0.2.0`. `.github/workflows/release.yml` then:

- checks that the tag/version and default-branch source agree;
- installs the exact Node/npm/dependency versions;
- reruns the canonical release gate;
- creates a deterministic `heading-numerals-x.y.z.zip` containing the three runtime assets under `heading-numerals/`;
- attests the three loose assets and ZIP;
- publishes the GitHub Release; and
- downloads every published asset to compare bytes and verify provenance.

Public Release assets are exactly `main.js`, `manifest.json`, `styles.css`, and the versioned ZIP. `SHA256SUMS` stays in the short-lived workflow handoff artifact.

Do not move or recreate a published tag. Correct a release problem with a new version.
