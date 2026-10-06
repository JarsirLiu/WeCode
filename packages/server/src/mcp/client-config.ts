/** Stable Streamable HTTP configuration shown to external MCP clients. */
export const WECODE_MCP_SERVER_KEY = "wecode";
export interface WeCodeMcpClientEntry {
  /** Explicit transport discriminator required by clients such as Cherry Studio. */
  type: "streamable_http";
  url: string;
  headers?: Record<string, string>;
}
export interface WeCodeMcpClientConfig { mcpServers: Record<string, WeCodeMcpClientEntry>; }
export function buildWeCodeMcpClientConfig(input: { url: string; headers?: Record<string, string> }): WeCodeMcpClientConfig {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("WeCode MCP URL must use HTTP(S)");
  return {
    mcpServers: {
      [WECODE_MCP_SERVER_KEY]: {
        type: "streamable_http",
        url,
        ...(input.headers && Object.keys(input.headers).length ? { headers: input.headers } : {}),
      },
    },
  };
}
export function createWeCodeMcpClientConfigJson(input: { url: string; headers?: Record<string, string> }): string {
  return `${JSON.stringify(buildWeCodeMcpClientConfig(input), null, 2)}\n`;
}
