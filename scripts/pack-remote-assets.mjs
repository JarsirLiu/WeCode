#!/usr/bin/env node
/* eslint-disable max-lines */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const desktopDir = join(rootDir, "packages/desktop");
const mockCdnDir = join(desktopDir, "mock-cdn");
const version = require(join(rootDir, "package.json")).version;

// The platform key is a public contract shared with the runtime manifest loader.
const REMOTE_PLATFORMS = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"];

const selectedPlatformKeys = (process.env.ZCODE_REMOTE_ASSET_PLATFORMS?.trim() || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// Output directory for GitHub Release assets
const OUTPUT_DIR = join(desktopDir, "dist", "remote-assets");

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

async function packPlatformAssets(platformKey) {
  const releaseDir = join(mockCdnDir, "releases", version);
  const platformOutputDir = join(OUTPUT_DIR, platformKey);
  const manifestPath = join(releaseDir, `manifest-${platformKey}.json`);

  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}. Run pnpm prepare:remote-assets first.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const components = manifest.components || [];

  console.log(`\n==> Packaging remote assets for ${platformKey}`);

  // Clean output dir
  if (existsSync(platformOutputDir)) {
    rmSync(platformOutputDir, { recursive: true, force: true });
  }
  mkdirSync(platformOutputDir, { recursive: true });

  const releaseComponents = [];

  for (const component of components) {
    const { id, version: compVersion, sha256: expectedSha256, artifactPath, mount } = component;

    // artifactPath is like "components/linux-x64/server-bundle/v1.2.3+abc123.tar.gz"
    const sourceArtifactPath = join(mockCdnDir, ...artifactPath.split("/"));

    if (!existsSync(sourceArtifactPath)) {
      console.warn(`  [warn] Component artifact missing, skipping: ${sourceArtifactPath}`);
      continue;
    }

    // Verify sha256
    const actualSha256 = sha256File(sourceArtifactPath);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `SHA256 mismatch for ${id} (${platformKey}): expected ${expectedSha256}, got ${actualSha256}`
      );
    }

    // GitHub Release assets are a flat namespace; keep the platform in every
    // filename so same-named components from different platforms cannot overwrite each other.
    const outputFileName = `remote-${platformKey}-${id}-${compVersion}.tar.gz`;
    const outputPath = join(platformOutputDir, outputFileName);
    copyFileSync(sourceArtifactPath, outputPath);
    console.log(`  [ok] ${outputFileName} (${(statSync(sourceArtifactPath).size / 1024 / 1024).toFixed(2)} MB)`);

    releaseComponents.push({
      id,
      version: compVersion,
      sha256: expectedSha256,
      artifactPath: outputFileName,
      mount,
    });
  }

  // Write release manifest (simplified for CDN consumption)
  const releaseManifest = {
    schemaVersion: manifest.schemaVersion,
    appVersion: manifest.appVersion,
    platformArch: platformKey,
    components: releaseComponents,
  };

  const releaseManifestPath = join(platformOutputDir, `manifest-${platformKey}.json`);
  writeFileSync(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
  console.log(`  [ok] manifest-${platformKey}.json`);

  return { platform: platformKey, componentCount: releaseComponents.length };
}

async function main() {
  console.log(`==> Packaging remote assets for release version ${version}`);
  console.log(`    Source: ${mockCdnDir}/releases/${version}`);
  console.log(`    Output: ${OUTPUT_DIR}`);

  // Ensure mock-cdn exists
  if (!existsSync(mockCdnDir)) {
    throw new Error(`mock-cdn directory not found: ${mockCdnDir}. Run pnpm prepare:remote-assets first.`);
  }

  const releaseDir = join(mockCdnDir, "releases", version);
  if (!existsSync(releaseDir)) {
    throw new Error(`Release directory not found: ${releaseDir}. Run pnpm prepare:remote-assets first.`);
  }

  // Clean and create output dir
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  const platformsToPack = selectedPlatformKeys.length > 0 ? selectedPlatformKeys : REMOTE_PLATFORMS;
  for (const platformKey of platformsToPack) {
    if (!REMOTE_PLATFORMS.includes(platformKey)) {
      throw new Error(`Unsupported remote asset platform: ${platformKey}`);
    }
    try {
      const result = await packPlatformAssets(platformKey);
      results.push(result);
    } catch (error) {
      console.error(`  [error] Failed to package ${platformKey}: ${error.message}`);
      throw error;
    }
  }

  console.log("\n==> All platforms packaged successfully:");
  for (const { platform, componentCount } of results) {
    console.log(`    ${platform}: ${componentCount} components`);
  }
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(`\n[FATAL] ${error.message}`);
    process.exit(1);
  });
}

export { packPlatformAssets, REMOTE_PLATFORMS };
