# UI 字体规范

## 行为

- 共享 UI 的 `font-sans` 和 `body` 使用同一套系统无衬线字体栈。
- 字体顺序优先匹配 `PingFang SC` / `苹方-简`，随后回退到 `Segoe UI Variable`、`Noto Sans SC`、`Microsoft YaHei UI`、`Microsoft YaHei`、`Segoe UI` 和平台默认无衬线字体。
- 设置页的“界面字体”提供有限的预置字体族：系统默认（苹方优先）、苹方、微软雅黑、Noto Sans SC 和 Segoe UI。用户选择保存字体族 ID，不保存任意 CSS 字符串。
- 选择的字体族通过同一套回退栈应用到所有 `font-sans` UI 文本；字体未安装时由浏览器自动使用后续回退字体。
- `font-mono`、代码预览、Diff 和终端内容继续使用独立的等宽字体配置，不受 UI 字体栈替换影响。

## 所有者与边界

- `packages/ui/src/styles.css` 定义共享 UI 字体栈的默认值；组件只使用 `font-sans`，不自行声明平台字体。
- `packages/ui/src/lib/uiFontFamily.ts` 负责字体族 ID、预置选项、持久化和 CSS 变量运行时覆盖；Zustand store 是设置状态的唯一 UI 所有者。
- 字体选择通过现有 `state:uiFontFamily` 广播同步到其他窗口，接收方复用同一个 setter，保证持久化和 DOM 应用路径一致。
- Desktop、Web 和系统主题只选择可用字体，不下载或打包字体文件，因此不引入网络依赖或许可资产。

## 验收场景

1. macOS 安装苹方时，普通 UI 文本使用 `PingFang SC` 或 `苹方-简`。
2. Windows/Linux 没有苹方时，UI 继续使用后续可用的中文无衬线字体，不出现衬线字体回退。
3. 在设置页切换任一预置字体后，当前窗口立即更新，重新启动后仍保留选择，其他窗口同步更新。
4. 代码、Diff、终端和路径文本仍使用 `font-mono`。
