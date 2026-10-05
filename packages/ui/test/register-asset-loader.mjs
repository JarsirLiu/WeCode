// 注册静态资源 loader：让 tsx 能处理 .svg/.png/.css 等非 JS 导入。
// UI 组件传递引用静态资源（如 provider-icons/*.svg），无 bundler 时 Node 无法加载。
// 此 loader 将这些导入 stub 为空字符串，使纯逻辑测试可以运行。
import { register } from "node:module";

register("./asset-loader-hooks.mjs", import.meta.url);
