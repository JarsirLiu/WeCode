// 模块上下文生成：`architecture:context <id>` 的实现。从 index.mjs 拆出以控制文件行数。
import { promises as fs } from "node:fs";
import path from "node:path";

import { discoverFiles, loadPolicy, moduleForFile, posix } from "./policy.mjs";

// 文档卡片文件名：任一存在即视为该模块有手写导向文档。
const MODULE_DOC_NAMES = ["README.md", "README.zh.md", "AGENTS.md", "MODULE.md", "CONTRACT.md"];
// `architecture:context` 目录图子目录列表的换行宽度（字符）。
const DIR_WRAP = 100;
const TEST_DIRS = ["test", "tests", "__tests__"];

/** 在 root 及其父目录向上查找最近的 package.json，返回解析后的 JSON 或 null。 */
async function readNearestPackageJson(root) {
  let dir = root;
  for (let depth = 0; depth < 4 && dir; depth += 1) {
    const target = path.join(dir, "package.json");
    try {
      return JSON.parse(await fs.readFile(target, "utf8"));
    } catch {
      dir = path.dirname(dir);
      if (dir === path.dirname(dir)) break;
    }
  }
  return null;
}

/** 把 package.json 的 exports 字段拍平为路径字符串列表（只取 string 叶子）。 */
function packageExportsToPaths(exports) {
  if (!exports) return [];
  if (typeof exports === "string") return [exports];
  const out = [];
  for (const value of Object.values(exports)) {
    if (typeof value === "string") out.push(value);
    else if (value && typeof value === "object")
      for (const inner of Object.values(value)) if (typeof inner === "string") out.push(inner);
  }
  return out;
}

/** 计算 root 下 depth-1 子目录文件计数与顶层文件列表，供模型快速定位。 */
function directoryMap(root, moduleFiles, cwd) {
  const prefix = `${root}${path.sep}`;
  const rels = moduleFiles
    .filter((file) => file === root || file.startsWith(prefix))
    .map((file) => (file === root ? path.basename(file) : path.relative(root, file)));
  const subdirs = new Map();
  const topFiles = [];
  for (const rel of rels) {
    const parts = rel.split(/[\\/]/);
    if (parts.length > 1) subdirs.set(parts[0], (subdirs.get(parts[0]) ?? 0) + 1);
    else topFiles.push(parts[0]);
  }
  const sortedSubdirs = [...subdirs.entries()].sort(([a], [b]) => a.localeCompare(b));
  const entries = sortedSubdirs.map(([name, count]) => `${name}(${count})`);
  const lines = [];
  const relRoot = posix(path.relative(cwd, root));
  lines.push(
    `${relRoot} — ${rels.length} files, ${subdirs.size} subdirs${topFiles.length > 0 ? `, ${topFiles.length} top-level` : ""}`,
  );
  if (entries.length > 0) {
    let line = "  ";
    for (const entry of entries) {
      if (line.length > 2 && line.length + 1 + entry.length > DIR_WRAP) {
        lines.push(line);
        line = "  ";
      }
      line = line.length > 2 ? `${line} ${entry}` : `${line}${entry}`;
    }
    lines.push(line);
  }
  if (topFiles.length > 0) lines.push(`  top-level: ${topFiles.sort().join(", ")}`);
  return lines.join("\n");
}

/** 列出模块根及其父目录下存在的文档卡片路径（去重、排序）。 */
export async function moduleDocPaths(module, cwd) {
  const found = new Set();
  for (const root of module.roots) {
    for (const base of [root, path.dirname(root)]) {
      for (const name of MODULE_DOC_NAMES) {
        const target = path.join(base, name);
        try {
          await fs.access(target);
          found.add(posix(path.relative(cwd, target)));
        } catch {
          /* absent */
        }
      }
    }
  }
  return [...found].sort();
}

/** 递归收集 dir 下的测试文件（排除 node_modules/dist/out），返回相对 cwd 的 posix 路径。 */
async function collectTestFiles(dir, cwd) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (["node_modules", "dist", "out", "coverage", ".git"].includes(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectTestFiles(target, cwd)));
    else if (entry.isFile() && /\.(?:test|spec)\.[a-z]+$/i.test(entry.name))
      out.push(posix(path.relative(cwd, target)));
  }
  return out;
}

/** 在模块根及其父目录的 test/tests/__tests__ 下查找测试文件（去重、排序）。 */
export async function moduleTestFiles(module, cwd) {
  const found = new Set();
  for (const root of module.roots) {
    for (const base of [root, path.dirname(root)]) {
      for (const dir of TEST_DIRS) {
        const target = path.join(base, dir);
        for (const file of await collectTestFiles(target, cwd)) found.add(file);
      }
    }
  }
  return [...found].sort();
}

/** 解析模块公开入口：策略 publicEntrypoints 优先，为空时回退到 package.json exports/main。 */
export async function entryPointsFor(module) {
  let entrypoints = module.publicEntrypoints.slice();
  let entrypointSource = "architecture-policy.yaml: publicEntrypoints";
  if (entrypoints.length === 0) {
    const pkg = await readNearestPackageJson(module.roots[0]);
    const fromPkg = packageExportsToPaths(pkg?.exports);
    if (fromPkg.length > 0) {
      entrypoints = fromPkg.map((entry) => posix(entry));
      entrypointSource = "package.json: exports";
    } else if (pkg?.main) {
      entrypoints = [pkg.main];
      entrypointSource = "package.json: main";
    }
  }
  return { entrypoints, entrypointSource };
}

export async function generateContext({ cwd = process.cwd(), moduleId }) {
  const policy = await loadPolicy(cwd);
  const module = policy.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error(`未知模块: ${moduleId}`);
  const files = await discoverFiles(policy);
  const moduleFiles = files.filter((file) => moduleForFile(file, policy)?.id === moduleId);
  const manifest = moduleFiles.find((file) => path.basename(file) === "module.ts");
  const contracts = moduleFiles.filter((file) => path.basename(file).startsWith("contract."));

  const { entrypoints, entrypointSource } = await entryPointsFor(module);

  // 目录图、测试文件、文档卡片。
  const dirMaps = module.roots.map((root) => directoryMap(root, moduleFiles, cwd));
  const testFiles = await moduleTestFiles(module, cwd);
  const docs = await moduleDocPaths(module, cwd);

  const dependencyContracts = module.requires.flatMap((dependencyId) => {
    const dependencyFiles = files.filter(
      (file) => moduleForFile(file, policy)?.id === dependencyId,
    );
    return dependencyFiles
      .filter((file) => path.basename(file) === "contract.ts")
      .map((file) => `- ${posix(path.relative(cwd, file))}`);
  });

  return [
    `# Architecture context: ${module.id}`,
    `owner: ${module.owner ?? "unassigned"}`,
    `managed: ${module.managed}`,
    `requires: ${module.requires.join(", ") || "none"}`,
    `roots: ${module.roots.map((root) => posix(path.relative(cwd, root))).join(", ")}`,
    "",
    "## Docs",
    ...(docs.length > 0
      ? docs.map((doc) => `- ${doc}`)
      : ["- none — see docs/modules.md for the index"]),
    "",
    "## Public entrypoints",
    ...(entrypoints.length > 0
      ? entrypoints.map((entry) => `- ${entry}  (${entrypointSource})`)
      : ["- none declared"]),
    "",
    "## Directory map",
    ...dirMaps,
    "",
    "## Tests",
    ...(testFiles.length > 0
      ? [`- ${testFiles.length} test file${testFiles.length > 1 ? "s" : ""}`]
      : ["- none discovered"]),
    "",
    "## Module artifacts",
    ...(manifest
      ? [`- ${posix(path.relative(cwd, manifest))}`]
      : ["- module.ts: not required (unmanaged)"]),
    ...contracts.map((file) => `- ${posix(path.relative(cwd, file))}`),
    "",
    "## Direct dependency contracts",
    ...(dependencyContracts.length > 0 ? dependencyContracts : ["- none discovered"]),
    "",
    "## Boundaries",
    "- Cross-module imports must use declared requirements and public entrypoints.",
    "- Add a contract example before exposing a new capability.",
  ].join("\n");
}
