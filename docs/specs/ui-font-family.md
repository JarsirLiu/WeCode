# UI 字体规范

## 行为

- 共享 UI 的 `font-sans` 和 `body` 使用同一套系统无衬线字体栈。
- 字体顺序优先匹配 `PingFang SC` / `苹方-简`，随后回退到 `Segoe UI Variable`、`Noto Sans SC`、`Microsoft YaHei UI`、`Microsoft YaHei`、`Segoe UI` 和平台默认无衬线字体。
- `font-mono`、代码预览、Diff 和终端内容继续使用独立的等宽字体配置，不受 UI 字体栈替换影响。

## 所有者与边界

- `packages/ui/src/styles.css` 是共享 UI 字体栈的唯一所有者；组件只使用 `font-sans`，不自行声明平台字体。
- Desktop、Web 和系统主题只选择可用字体，不下载或打包字体文件，因此不引入网络依赖或许可资产。

## 验收场景

1. macOS 安装苹方时，普通 UI 文本使用 `PingFang SC` 或 `苹方-简`。
2. Windows/Linux 没有苹方时，UI 继续使用后续可用的中文无衬线字体，不出现衬线字体回退。
3. 代码、Diff、终端和路径文本仍使用 `font-mono`。
