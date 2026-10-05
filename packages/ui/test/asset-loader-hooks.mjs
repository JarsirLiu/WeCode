// 静态资源 loader hooks：将非 JS 文件扩展名 stub 为空导出。
// 与 register-asset-loader.mjs 配合使用。
export function load(url, context, defaultLoad) {
  if (/\.(svg|png|jpe?g|gif|webp|css|woff2?|ttf|eot|otf)$/.test(url)) {
    return {
      format: "module",
      source: "export default ''",
      shortCircuit: true,
    };
  }
  return defaultLoad(url, context, defaultLoad);
}
