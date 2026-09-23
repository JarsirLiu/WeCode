# Agent Notes

[English](README.md) | 中文

这里存放一类设计文档。**Agent Note** 记录影响本代码库的决策或提案：代码和文档无法承载的*为什么*以及*放弃了什么*。本文件规定 Agent Note 存放在哪里、何时需要写一份，以及[文件内格式](#文件格式)。

## 布局与命名

每份 Agent Note 有两个维度，都编码在其**路径**中：`{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`。

- **生命周期**（顶层文件夹）是 Agent Note 的状态，Agent Note 随状态变化在文件夹之间移动：
  - **`proposed/`**：实施前评审的提案；尚未构建（或仅部分构建）。
  - **`implemented/`**：决策已交付。文件记录做了什么决定、否决了什么，并**与实际交付的内容保持同步**：当代码后续移动文件、重命名包或更改键名/默认值时，Agent Note 在同一个变更中同步更新（仅限事实——路径、名称、结构——而非决策本身）。
  - **`rejected/`**：提案经过讨论后被否决。仅当其决策依据仍能避免一种诱人且影响重大的错误时保留；否则删除完整的英文和中文件对。
- **类别**（嵌套文件夹）是决策的*种类*——见下方[分类](#分类)。

文件名中的日期是该主题**首次提出**的时间（以 git 历史为准）。Agent Note 之间的交叉引用使用相对 Markdown 链接（`[topic](../../implemented/architecture/2026-…-….md)`），从不使用纯文字或编号，这样既可机械检查，也能在文件夹间移动时保持有效。

请勿添加集中式 `INDEX.md`；浏览生命周期/类别文件夹，或搜索仓库即可。

<a id="分类"></a>

## 分类

每份 Agent Note 属于 `scripts/docs/agent-note-tree.mjs` 中封闭集合里的一个路径编码类别；分类门禁拒绝其他文件夹。新增类别需要同时更新规范集合与本节。

| 类别             | 覆盖范围                                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| `feature`        | 面向用户或模型的新能力。                                                        |
| `bug-fix`        | 修正缺陷或弥补事故复盘（postmortem）发现的缺口。                                |
| `simplification` | 在不增加能力的前提下移除代码、行为或对外范围。                                  |
| `architecture`   | 关于**交付源码**的结构性决策：包之间的关系、运行时词汇。                        |
| `process`        | 代码**周边**的工具、策略或工作流——门禁、包管理器、vendor 化——不涉及运行时行为。 |
| `testing`        | 测试基础设施与策略。                                                            |

`architecture` 与 `process` 的界线：**architecture** 关乎我们交付的源码；**process** 关乎围绕源码的工具与工作流。（`refactor` 被有意排除：它与 `simplification` 重叠，而后者的判别标准「可观察行为是否改变」已经覆盖了它。）

## 归档与删除

当一份 implemented Agent Note 记录的交付决策已经完整落地，且其决策依据不太可能再指导未来工作时，将其归档。如果其中的备选方案、归属边界、否定性保证、持久化语义或协议语义、安全规则，或者重新引入条件仍有价值，则继续作为活跃记录保留。绝不归档 proposed Agent Note：过时的提案应转为 rejected。仅当 rejected Agent Note 仍能避免一种可能发生的错误时保留；否则一并删除其英文和中文件。请根据校准的判断来决定，不要根据字数、存续时间或目标配额。

归档路径编码为 `archived/{class}/yyyy-mm-dd-topic-title.md`；其中有意省略 `implemented`，因为只有 implemented Agent Note 可以进入归档。归档变更会移动完整的英文和中文件对，保留 `Status: implemented`，在两种语言的文件中紧接该状态行插入相同的 `Archived: YYYY-MM-DD` 行，并修复或删除入站链接。归档时只允许对内容做这些更改。

封存后，每对归档文件都永久冻结。禁止编辑、翻译、重新格式化、更新、移动或删除，也不得将其视为当前行为的权威依据。文档门禁会跳过归档源文件，包括其中的出站链接；当活跃文档有意引用历史时，仍可链接到归档 Agent Note。`verify-agent-note-format` 和 `verify-translation-pairing` 强制执行此处描述的规则。

## 何时需要写一份

每个非平凡变更都必须在同一变更中新增或更新至少一份 Agent Note。如果变更修改了行为、架构、跨文件或跨包约定、流程或工具、测试策略、磁盘存储格式、协议格式（wire format）或配置格式，或者维护者可能合理重新审视的其他决策，就属于非平凡变更。对未来重大工作的提案从 `proposed/` 开始；已经做出的决策从 `implemented/` 开始。选择与决策匹配的类别文件夹（见[分类](#分类)）。

更新已经拥有该决策的 Agent Note 即可满足规则；不要创建重复记录。只有不涉及行为、约定、结构、流程或理由变化的纯机械性或局部编辑才可豁免。Agent Note 永远不会被编辑为一个*不同的决策*：用新 Agent Note 取代旧记录，并让两个记录保持互相链接。编辑 `implemented/` Agent Note 以跟踪其现有决策的所在位置是必需的，而非禁止的。

被完全取代的 implemented Agent Note 可以合并到当前持有该决策的记录中，并删除原文件。删除前，当前记录必须保存所有独有的决策依据、备选方案、影响、必需的验证和明确指出的覆盖缺口；修复所有入站链接；并在同一变更中删除中文对侧文件。仅部分被取代的记录不符合此条件：保留两个记录并让它们互相链接，同时更新所有仍然适用的事实。

## Agent Note 与现有文档的关系

- **`docs/specs/`** 是*当前行为*的唯一权威。Agent Note 记录的是行为*为什么*是这样。
- **`AGENTS.md`** 设定仓库级规则和验证命令。Agent Note 是这些验证输入之一。
- **`architecture-policy.yaml`** 定义模块边界。`architecture` Agent Note 可以解释边界*为什么*存在，但不重新定义边界。
- **`.agents/skills/`** 是工作流指南。`process` Agent Note 可以解释工作流*为什么*存在，但不替代技能。

行为变更时，先更新 spec。当行为的*原因*变更时，写或更新 Agent Note。

<a id="文件格式"></a>

## 文件格式

每份活跃 Agent Note 遵循统一的文件内格式，由 `pnpm docs:check`（[verify-agent-note-format](../../scripts/docs/verify-agent-note-format.mjs)）强制执行。

### 头部块

每份 Agent Note 的前三行严格为：

```markdown
# Agent Note: <title>

Status: <status>
```

后跟一个空行。`Status:` 的值有三种形式，且必须与文件所在的生命周期文件夹一致——门禁会交叉检查：

- `Status: proposed`
- `Status: implemented`
- `Status: rejected — <why, in one line>`

状态行不带日期、不带括号补充说明：文件名记录首次提出日期，git 记录其余一切；「以修订形式接受」之类的说明属于正文内容（在陈述决策的地方说明修订）。拒绝原因是唯一带内容的状态，因为读者查阅被否决的 Agent Note 时，结论正是他们要找的。

### 正文骨架

每份 Agent Note 的正文以 `## Problem` 开头：动机，写法上不依赖解决方案即可独立成文。后续内容取决于生命周期；固定章节使用以下规范名称且仅限这些名称，而真正独特的技术章节在必需章节之间可自由组织。

#### `proposed/`

```markdown
## Problem

## Proposal

…自定义章节…

## Alternatives considered

## Acceptance criteria

## Risks
```

`## Proposal` 描述拟议的变更，可以合理地使用将来时态——计划、迁移步骤和待解决问题在工作尚未完成时属于此处。`## Acceptance criteria` 说明什么可观察状态意味着完成。`## Risks` 涵盖可能出错的事项以及该变更有意放弃的东西。

#### `implemented/`

```markdown
## Problem

## Decision

…自定义章节…

## Alternatives considered

## Consequences
```

`## Decision` 以现在时态描述已交付的现实，整个文件与之保持同步。`## Consequences` 记录权衡的代价**与**收益。提案阶段的标题在此属于规格用语，门禁会拒绝它们：`## Proposal`、`## Plan`、`## Migration plan` 和 `## Acceptance criteria` 不得出现在 implemented Agent Note 中。`## Testing`、`## Deferred` 或 `## Related` 章节在陈述现在时态的事实时是允许的。

#### `rejected/`

被否决的 Agent Note 是冻结的提案：保留提案时的所有章节（包括 `## Acceptance criteria` 或 `## Plan`），结论写在 `Status:` 行上。仅头部块、`## Problem` 开头、`## Proposal` 章节以及下方的「曾考虑的替代方案」强制要求适用。

<a id="类别特定章节"></a>

### 类别特定章节

除了生命周期骨架，每个类别还增加了强制章节，用于固定决策的*种类*。这些章节放在"自定义章节"位置——`## Proposal`/`## Decision` 和 `## Alternatives considered` 之间。门禁对 `proposed/` 和 `implemented/` 强制检查；`rejected/` 豁免。

| 类别             | 必需章节                                         | 记录内容                                                                       |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `feature`        | `## Affected surfaces`                           | 该功能触及哪些 UI、服务、协议、持久化或运行时表面。                            |
| `bug-fix`        | `## Root cause`, `## Fix`                        | 缺陷的根因；为修复它改了什么。                                                 |
| `simplification` | `## What was removed`, `## Reintroduction guard` | 移除了哪些代码/行为/对外范围；在什么条件下可能恢复，以及什么防止意外重新引入。 |
| `architecture`   | `## Module boundary`                             | 哪些模块/包受影响，边界或依赖方向如何变化。                                    |
| `process`        | `## Workflow change`                             | 开发/验证工作流中什么变了，哪些门禁或工具受影响。                              |
| `testing`        | `## Test scope`                                  | 新增或修改了哪些测试，覆盖什么，弥补了什么覆盖缺口。                           |

`proposed/` 的类别特定章节可以使用将来时态。`implemented/` 的类别特定章节陈述现在时态事实。新增类别是有意行为：需同时扩展 `verify-agent-note-format.mjs` 中的 `CLASS_REQUIRED` 映射和本表。

### 曾考虑的替代方案——必需

每份 Agent Note 都必须包含 `## Alternatives considered` 章节：每个真实的替代方案及其落选原因，每个替代方案用一个加粗引导的段落，或对争议较大的替代方案用 `### Why not <X>?` 子节。记录决策时不记录它击败了什么，就是在邀请反复争论——这正是 Agent Note 旨在防止的问题。

### 在生命周期之间移动

将文件在生命周期文件夹之间移动意味着在同一个变更中更新 `Status:` 行并满足目标文件夹的骨架要求——否则门禁会失败。具体而言，`proposed/` → `implemented/` 将 `## Proposal` 改写为现在时态的 `## Decision`，将 `## Acceptance criteria` 和 `## Risks` 折入 `## Consequences`（或折入一个现在时态的 `## Testing`/`## Verification` 章节，用于描述现在锁定该行为的内容），并用实际交付的内容替换计划。`proposed/` → `rejected/` 仅在 `Status:` 行添加原因并冻结文件。

### 中文对侧文件

`.zh.md` 对侧文件逐章节与其英文对侧文件保持相同结构；机器检查的头部标记（`# Agent Note: ` 和 `Status:` 行）保持英文原样不翻译。格式门禁跳过 `.zh.md` 文件；配对门禁检查它们的一致性。

## 验证

在仓库根目录运行 `pnpm docs:check`。这会依次执行：

1. **`agent-note-tree`** — 目录结构：生命周期和类别文件夹封闭集合校验，文件名格式校验。
2. **`verify-agent-note-format`** — 头部块、Status 行、生命周期特定章节、类别特定章节、替代方案、禁用标题。
3. **`verify-translation-pairing`** — 双语配对完整性、H2 结构一致性、语言切换链接。
4. **`verify-md-links`** — 相对链接指向存在的文件；`#fragment` 锚点匹配标题 slug 或显式 `<a id>` 锚点。
5. **`verify-md-wrap`** — 一行一段规范；代码块、表格、列表、HTML 注释豁免。
6. **`verify-doc-budgets`** — 按文档词预算（`scripts/doc-budgets.manifest.json`）；`pnpm docs:budgets` 列出当前计数。
7. **`verify-doc-refs`** — TypeScript 源码中的 `docs/...md` 路径引用存在（链接检查的反向）。
8. **`verify-archived-agent-notes`** — 归档笔记冻结（sha256 manifest）；`--write` 在有意变更后重新密封。
9. **`verify-module-entrypoints`** — `architecture-policy.yaml` 声明的 `publicEntrypoints` 在磁盘上存在（无陈旧策略）。
10. **`verify-module-coverage`** — 源文件数 ≥100 的模块有导向卡片（README/AGENTS/MODULE/CONTRACT）。
11. **`verify-module-index`** — `docs/modules.md` 与生成器输出一致；`pnpm docs:modules` 重新生成。

预提交提醒（不阻断）：`verify-agent-note-reminder` 在源码变更但无 note 时发出警告，但不失败。
