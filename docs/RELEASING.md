# Releasing

Heading Numerals follows the same numeric-tag and three-loose-asset convention as the sibling Obsidian plugins.

## Local preflight

1. Set the same stable version in `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`.
2. Complete and record the real Obsidian checks in `docs/ACCEPTANCE.md`.
3. Commit the intended source and confirm `git status --short` is clean.
4. Run `npm ci` and `npm run release:check` on that clean commit. The release check rejects untracked files and a reused tag that points elsewhere.
5. Push the verified commit to `origin/main`; run `node scripts/check-release-version.mjs x.y.z` only if an explicit tag argument needs separate verification.

## Publication

Push the new immutable numeric `x.y.z` tag. `.github/workflows/release.yml` then:

- verifies the tag, default-branch ancestry, exact toolchain, dependencies, and canonical gates under read-only permissions;
- creates a deterministic `heading-numerals-x.y.z.zip` containing the three runtime assets under `heading-numerals/`;
- uploads one identified handoff artifact, then downloads and re-verifies that exact artifact in a separate write-enabled job;
- attests the three loose assets and ZIP;
- publishes the GitHub Release; and
- downloads every published asset to compare bytes and verify provenance.

Public Release assets are exactly `main.js`, `manifest.json`, `styles.css`, and the versioned ZIP. `SHA256SUMS` stays in the short-lived workflow handoff artifact.

Do not move or recreate a published tag. Correct a release problem with a new version.
