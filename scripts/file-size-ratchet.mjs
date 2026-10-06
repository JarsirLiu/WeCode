#!/usr/bin/env node
/**
 * 文件大小棘轮门禁。
 *
 * 为什么不是 lint 阈值：`max-lines` 只能报「现在多大」，一行 `eslint-disable max-lines`
 * 或 `oxlint-disable eslint(max-lines)` 就能让任何文件永久免检，所以它挡不住增量继续往
 * 巨型文件里塞代码。本棘轮改为按文件冻结上限：上限只能变短，任何净增长都失败。
 *
 * 因此这里刻意**不识别**内联豁免注释——衡量真实体积，而不是 lint 是否报错。
 *
 * 用法：
 *   node scripts/file-size-ratchet.mjs check     只读校验（默认）
 *   node scripts/file-size-ratchet.mjs update    收紧上限：只降不升、只删不加
 *   node scripts/file-size-ratchet.mjs report    欠账总额与头部名单
 *   node scripts/file-size-ratchet.mjs freeze    仅当名单为空时建立初始名单
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { changedFilesFromGit } from "./architecture/index.mjs";
import { gitFileNames } from "./architecture/git-file-names.mjs";

const root = resolve(import.meta.dirname, "..");
const LEDGER_REL = ".file-size-baseline.json";
const LEDGER_PATH = resolve(root, LEDGER_REL);
const BUDGET = 400;
const GIANT = 1500;
const VERSION = 1;

// 测试天然堆叠断言、语言包与技能语料是数据不是职责，沿用 .oxlintrc.json 对它们的豁免结论。
const EXCLUDED = [/\.(d|test|spec)\.tsx?$/, /(^|\/)dist\//, /(^|\/)i18n\/locales\//];

/**
 * 有效行 = 非空且非纯注释行，对齐 oxlint 的 skipBlankLines + skipComments，
 * 让补注释和格式化抖动不会误触门禁。
 */
function effectiveLines(source) {
  let count = 0;
  let inBlock = false;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    if (line.startsWith("//") || line.startsWith("*")) continue;
    count += 1;
  }
  return count;
}

async function trackedSources() {
  // 必须含未跟踪文件：R1 的目的是拦住"新建一个大文件"，只扫已跟踪内容永远看不到它。
  const names = await gitFileNames(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  return names.filter(
    (file) =>
      existsSync(resolve(root, file)) &&
      /\.tsx?$/.test(file) &&
      !EXCLUDED.some((pattern) => pattern.test(file)),
  );
}

function readLedger() {
  if (!existsSync(LEDGER_PATH))
    return { version: VERSION, budget: BUDGET, giant: GIANT, files: {} };
  const parsed = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
  if (!parsed || typeof parsed.files !== "object" || parsed.files === null)
    throw new Error(`${LEDGER_REL} 缺少 files 字段`);
  return {
    version: parsed.version ?? VERSION,
    budget: parsed.budget ?? BUDGET,
    giant: parsed.giant ?? GIANT,
    files: parsed.files,
  };
}

function writeLedger(ledger) {
  const entries = Object.entries(ledger.files).sort((a, b) => a[0].localeCompare(b[0]));
  const body = {
    version: ledger.version,
    budget: ledger.budget,
    giant: ledger.giant,
    files: Object.fromEntries(entries),
  };
  writeFileSync(LEDGER_PATH, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return entries.length;
}

async function measure() {
  const ledger = readLedger();
  const sources = await trackedSources();
  const counts = new Map();
  for (const file of sources)
    counts.set(file, effectiveLines(readFileSync(resolve(root, file), "utf8")));
  return { ledger, counts };
}

async function check() {
  const { ledger, counts } = await measure();
  const changed = new Set(
    (await changedFilesFromGit(root)).map((file) => file.replaceAll("\\", "/")),
  );
  const failures = [];
  const notes = [];

  for (const [file, lines] of [...counts].sort((a, b) => b[1] - a[1])) {
    if (lines <= ledger.budget) continue;
    const cap = ledger.files[file];
    if (cap === undefined) {
      failures.push(
        `R1 ${file}: ${lines} 有效行，超过预算 ${ledger.budget} 且未登记 — 新增的超限文件必须按职责拆分；确实需要豁免时，只能在本文件手工写入名单条目并在提交里说明理由。`,
      );
      continue;
    }
    if (lines > cap) {
      failures.push(
        `R2 ${file}: ${lines} 有效行，超过已冻结上限 ${cap}（+${lines - cap}）— 把新增职责放进新文件并从本文件导出；若已拆分，运行 pnpm size:update 收紧上限。`,
      );
      continue;
    }
    if (cap > ledger.giant && changed.has(file) && lines >= cap) {
      failures.push(
        `R3 ${file}: 巨型文件（上限 ${cap} > ${ledger.giant}）本次被触碰，但有效行仍是 ${lines} — 碰它就要净减行，把改动的职责下沉到新模块。`,
      );
    }
  }

  for (const file of Object.keys(ledger.files)) {
    const lines = counts.get(file);
    if (lines === undefined) {
      notes.push(`文件 ${file} 已不存在或已重命名，运行 pnpm size:update 清理条目`);
    } else if (lines <= ledger.budget) {
      notes.push(
        `文件 ${file} 已降到 ${lines} 行（预算 ${ledger.budget} 以内），pnpm size:update 会移除该条目`,
      );
    }
  }

  for (const line of notes) console.log(`note  ${line}`);
  if (failures.length > 0) {
    for (const line of failures) console.error(`fail  ${line}`);
    console.error(
      `\n文件大小棘轮：${failures.length} 项失败。欠账名单见 ${LEDGER_REL}，规则见 docs/specs/file-size-ratchet.md`,
    );
    process.exit(1);
  }
  console.log(`文件大小棘轮：OK（登记 ${Object.keys(ledger.files).length} 个超限文件）`);
}

async function update() {
  const { ledger, counts } = await measure();
  const files = {};
  let lowered = 0;
  let removed = 0;
  for (const [file, cap] of Object.entries(ledger.files)) {
    const lines = counts.get(file);
    if (lines === undefined || lines <= ledger.budget) {
      removed += 1;
      continue;
    }
    // 棘轮：只允许收紧。当前行数高于上限说明这次变更本身就该失败，不能靠 update 洗白。
    if (lines > cap) {
      console.error(
        `fail  ${file}: ${lines} 行超过上限 ${cap} — 先拆分再收紧名单，update 不会抬升上限`,
      );
      process.exit(1);
    }
    if (lines < cap) lowered += 1;
    files[file] = Math.min(cap, lines);
  }
  const unregistered = [...counts]
    .filter(([file, lines]) => lines > ledger.budget && ledger.files[file] === undefined)
    .sort((a, b) => b[1] - a[1]);
  for (const [file, lines] of unregistered)
    console.error(
      `fail  ${file}: ${lines} 有效行未登记 — update 不会新增条目，需拆分或手工登记并说明理由`,
    );
  if (unregistered.length > 0) process.exit(1);

  const total = writeLedger({ ...ledger, files });
  console.log(`baseline updated: ${total} 条目（收紧 ${lowered}，移除 ${removed}）`);
}

async function report() {
  const { ledger, counts } = await measure();
  const oversize = [...counts]
    .filter(([, lines]) => lines > ledger.budget)
    .sort((a, b) => b[1] - a[1]);
  const excess = oversize.reduce((sum, [, lines]) => sum + (lines - ledger.budget), 0);
  const giants = oversize.filter(([, lines]) => lines > ledger.giant);
  console.log(`预算 ${ledger.budget} 行，巨型阈值 ${ledger.giant} 行`);
  console.log(`超限文件: ${oversize.length}，欠账总量: ${excess} 行，巨型文件: ${giants.length}`);
  for (const [file, lines] of oversize.slice(0, 20)) {
    const cap = ledger.files[file];
    console.log(`  ${String(lines).padStart(6)} / ${String(cap ?? lines).padEnd(6)} ${file}`);
  }
}

async function freeze() {
  if (Object.keys(readLedger().files).length > 0) {
    console.error("freeze 只用于建立初始名单；已有条目时请用 pnpm size:update，棘轮不提供放宽路径");
    process.exit(1);
  }
  const { ledger, counts } = await measure();
  const files = {};
  for (const [file, lines] of counts) if (lines > ledger.budget) files[file] = lines;
  const total = writeLedger({ ...ledger, files });
  const excess = Object.values(files).reduce((sum, lines) => sum + (lines - ledger.budget), 0);
  console.log(`frozen: ${total} 个超限文件，欠账 ${excess} 行`);
}

async function budget(targets) {
  const { ledger, counts } = await measure();
  if (targets.length === 0) {
    console.error(
      "用法: pnpm size:check -- 或 node scripts/file-size-ratchet.mjs budget <file>...",
    );
    process.exit(1);
  }
  for (const target of targets) {
    const file = target
      .split(/[\\/]/)
      .filter((segment) => segment !== "." && segment !== "")
      .join("/");
    const lines = counts.get(file);
    if (lines === undefined) {
      console.log(`  ${String(0).padStart(6)} / ${"—"} ${file}（不在扫描范围或不存在）`);
      continue;
    }
    const cap = ledger.files[file];
    const headroom = (cap ?? ledger.budget) - lines;
    console.log(
      `  ${String(lines).padStart(6)} / ${String(cap ?? ledger.budget).padEnd(6)} ${file} ` +
        `剩余 ${headroom} 行${cap !== undefined && cap > ledger.giant ? "（巨型：本次触碰必须净减行）" : ""}`,
    );
  }
}

const command = process.argv[2] ?? "check";
if (command === "check") await check();
else if (command === "update") await update();
else if (command === "report") await report();
else if (command === "freeze") await freeze();
else if (command === "budget") await budget(process.argv.slice(3));
else {
  console.error(`未知命令 ${command}（可用：check | update | report | freeze | budget）`);
  process.exit(1);
}
