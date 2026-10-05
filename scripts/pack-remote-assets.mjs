#!/usr/bin/env node
/* eslint-disable max-lines */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createGzip } from "node:zlib";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import tar from "tar";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const desktopDir = join(rootDir, "packages/desktop");
const mockCdnDir = join(desktopDir, "mock-cdn");
const version = require(join(rootDir, "package.json")).version;

// Platform mapping: mock-cdn platform key -> electron-builder platform-arch
const PLATFORM_MAP = {
  "linux-x64": "linux-x86_64",
  "linux-arm64": "linux-aarch64",
  "darwin-x64": "darwin-x64",
  "darwin-arm64": "darwin-arm64",
  "win32-x64": "win32-x64",
};

const REMOTE_PLATFORMS = Object.keys(PLATFORM_MAP);

// Output directory for GitHub Release assets
const OUTPUT_DIR = join(desktopDir, "dist", "remote-assets");

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function createTarGz(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(outputPath), { recursive: true });
    const gzip = createGzip({ level: 6 });
    const dest = createWriteStream(outputPath);
    tar.c({ gzip: false, cwd: sourceDir }, ["."])
      .pipe(gzip)
      .pipe(dest)
      .on("finish", () => resolve(outputPath))
      .on("error", reject);
  });
}

function normalizePlatformArch(platformKey) {
  return PLATFORM_MAP[platformKey] || platformKey;
}

async function packPlatformAssets(platformKey) {
  const electronPlatformArch = normalizePlatformArch(platformKey);
  const releaseDir = join(mockCdnDir, "releases", version);
  const platformOutputDir = join(OUTPUT_DIR, electronPlatformArch);
  const manifestPath = join(releaseDir, `manifest-${platformKey}.json`);

  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}. Run pnpm prepare:remote-assets first.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const components = manifest.components || [];

  console.log(`\n==> Packaging remote assets for ${electronPlatformArch} (from mock-cdn ${platformKey})`);

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

    // Copy to output dir with simpler name: {id}-{version}.tar.gz
    const outputFileName = `${id}-${compVersion}.tar.gz`;
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
    platformArch: electronPlatformArch,
    components: releaseComponents,
  };

  const releaseManifestPath = join(platformOutputDir, `manifest-${electronPlatformArch}.json`);
  writeFileSync(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
  console.log(`  [ok] manifest-${electronPlatformArch}.json`);

  return { platform: electronPlatformArch, componentCount: releaseComponents.length };
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
  for (const platformKey of REMOTE_PLATFORMS) {
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

const entryHref = process.argv[1] ? fileURLToPath(process.argv[1]) : null;
if (entryHref === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(`\n[FATAL] ${error.message}`);
    process.exit(1);
  });
}

export { packPlatformAssets, PLATFORM_MAP, REMOTE_PLATFORMS };