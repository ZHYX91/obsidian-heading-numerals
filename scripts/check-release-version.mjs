import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const releaseTag = process.argv[2];
assert.match(releaseTag ?? "", /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
  "Release tag must use x.y.z without a v prefix");

const [manifest, packageJson, packageLock, versions] = await Promise.all(
  ["manifest.json", "package.json", "package-lock.json", "versions.json"]
    .map(async (name) => JSON.parse(await readFile(name, "utf8"))),
);
assert.equal(releaseTag, manifest.version, "Release tag must match manifest.json");
assert.equal(packageJson.version, manifest.version, "package.json version must match manifest.json");
assert.equal(packageLock.version, manifest.version, "package-lock.json version must match manifest.json");
assert.equal(packageLock.packages?.[""]?.version, manifest.version,
  "package-lock.json root package version must match manifest.json");
assert.equal(versions[manifest.version], manifest.minAppVersion,
  "versions.json must map the release version to minAppVersion");
process.stdout.write(`Release version contract passed for ${releaseTag}.\n`);
