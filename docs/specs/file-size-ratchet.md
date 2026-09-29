# 文件大小棘轮（file size ratchet）

## 问题与目标

仓库里「单文件不要过大」曾经只靠 lint 的 `max-lines: error@400` 表达。这条规则在检出的代码上不可执行：`apps/zcode-cli` 有 159 个存量超限文件，`turbo lint` 因此长期常红，真正的失败被噪声淹没；同时主仓有 274 个文件用 `/* eslint-disable max-lines */` 或 `/* oxlint-disable eslint(max-lines) */` 给自己开了豁免，最大的几个（`packages/services/src/bots/botsService.ts`、`packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`、`packages/ui/src/v4/SessionPane.tsx`）都在数千行，任何增长都不会被告警。一行豁免注释就能绕过规则，所以它挡不住增量膨胀。

本规格把约束从「阈值」换成「棘轮」：存量欠账被逐文件冻结为上限，上限只能变短、不能变长。目标是让"往大文件里再塞几十行"这条路径在任何提交上都失败，而不是靠评审者记得住。

lint 侧保留 `max-lines: warn@1000` 作为可见性信号（不阻断），硬约束由本棘轮承担，三处阈值（`.oxlintrc.json`、`architecture-policy.yaml` 的 `maxFileLines`、`scripts/architecture/policy.mjs` 的默认值）与棘轮的 `giant` 值保持一致。

## 唯一所有者与入口

`.file-size-baseline.json` 是行数欠账的唯一事实源，形状为 `{ version, budget, giant, files: { "<相对路径>": <有效行上限> } }`。`scripts/file-size-ratchet.mjs` 是唯一读写它的实现：`check` 只读并报告，`update` 只会下调或删除条目，`report` 输出债务趋势。`freeze` 是建立初始名单的一次性入口，名单已有条目时直接拒绝执行；此后没有任何命令可以新增条目或抬高上限，放宽必然表现为 JSON 里的一行手工改动，评审时可见。

除这两处之外不得再有第二份行数真相：不在 CI 里另写阈值、不在包级 `package.json` 里重复登记。脚本不做写入路径以外的副作用，也不缓存行数。

## 计数口径

有效行 = 去掉空行与纯注释行后的行数（与 `oxlint` 的 `skipBlankLines` + `skipComments` 语义对齐），目的是让补注释、加空行和格式化抖动不会误触门禁，同时鼓励把说明写进注释而非塞进代码。

关键差异：本棘轮**不识别** `eslint-disable` / `oxlint-disable` 的内联豁免。理由见上一节——豁免注释本身就是已被使用的逃逸口；棘轮要衡量的是真实体积，而不是 lint 是否报错。名单条目按同一口径记录，因此工具内部自洽，与 lint 报告的数字可能有小幅出入。

扫描范围取 `git ls-files` 的 `*.ts` / `*.tsx`，排除 `*.d.ts`、`*.test.ts(x)`、`*.spec.ts(x)`、`dist/`、`i18n/locales/` 与 `bundled-skills/`：测试天然堆叠断言、语言包与打包进仓库的技能语料是数据不是职责，沿用 `.oxlintrc.json` 对它们的豁免结论。

## 规则

- R1 未登记文件的有效行 > `budget` → 失败。新增超限文件必须先拆，或在同一提交里手工把条目写进名单并说明理由。
- R2 已登记文件的有效行 > 自己的上限 → 失败。这是「不许继续塞」的主判据，1 行都不放过。
- R3 已登记文件的上限 > `giant`，且本次改动集合触碰了它，则有效行必须严格小于上限 → 否则失败。巨型文件一旦被碰就要净减行，这是防止「每次几十行缓慢膨胀成几千行」的那道闸。
- R4 只提示、不失败：条目已降到 `budget` 及以下（可删除）、名单里的路径已不存在（重命名或删除）、以及存在可收紧空间时提醒运行 `pnpm size:update`。

改动集合的判定复用 `scripts/architecture` 的 `changedFilesFromGit`（`git diff --name-only HEAD` 加未跟踪文件），与 `pnpm architecture:check --changed` 同一口径，避免出现两套"什么算改动"。

## 棘轮语义与时序

冻结后的演进序列是单调不增的：`update` 把上限拉到当前值（只降不升、不新增）→ 触碰巨型文件要求严格更短 → 下一次 `update` 再收紧。因此一个 5000 行的文件被触碰 N 次之后只会越来越短，除非有人手工改 JSON 抬高上限，而那在 diff 里是显眼的。

`update` 的幂等边界：它只在本次变更确实降低了行数时改动名单，删除条目仅当该文件已回到 `budget` 以内。它不会为了让检查通过而放宽任何条目，也不会写入尚未存在的路径。

## 失败语义

失败信息必须给出可执行的下一步，而不是只报数字：指出该文件的上限、当前有效行、超出的行数，并说明「新增的职责应放进新文件；若已拆分，运行 `pnpm size:update` 收紧上限」。R3 的失败信息额外说明「巨型文件本次触碰必须净减行」。手工抬上限不是被支持的修复路径，因此不出现在提示里。

## 门禁接入与验收

`check` 接入 `pnpm verify:pre-push`（与 `lint`、`architecture:check --changed` 同批），并单独提供 `pnpm size:check`、`pnpm size:update`、`pnpm size:report`。`report` 输出欠账总额、超限文件数和头部名单，用于观察债务趋势；`node scripts/file-size-ratchet.mjs budget <file>...` 供改动前查询单个文件的上限与剩余额度，巨型文件会额外标注本次触碰必须净减行。

验收场景：向已登记文件加 1 行 → R2 失败；新建 450 行文件 → R1 失败；向 `giant` 以上的已登记文件加行 → R2/R3 失败；把巨型文件的一部分职责拆到新文件使净行数下降 → 通过，`update` 后上限收紧；把已登记文件删到 `budget` 以下 → `update` 删除条目；名单里的路径被重命名 → R4 提示、不失败；带内联 `eslint-disable max-lines` 的巨型文件增长 → 仍然失败。

不覆盖的范围：本棘轮只管行数，不管职责边界与依赖方向，那些仍由 `architecture:check` 与模块契约负责；也不自动拆分代码，拆分永远是人工或有意的 agent 重构。
