import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createMcpHttpHandler, DEFAULT_MCP_HTTP_PORT, MCP_HTTP_PATH } from "@zcode/server";
import { createHostMcpToolHandler } from "@zcode/server";
import type { ServiceCollection } from "@zcode/services";

function toWebRequest(request: IncomingMessage): Request {
  const method = request.method ?? "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const url = `http://127.0.0.1:${DEFAULT_MCP_HTTP_PORT}${request.url ?? MCP_HTTP_PATH}`;
  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : (Readable.toWeb(request) as ReadableStream),
    // Node's fetch requires this flag for streaming request bodies.
    ...(method === "GET" || method === "HEAD" ? {} : { duplex: "half" as const }),
  });
}

async function writeWebResponse(response: Response, output: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  output.writeHead(response.status, headers);
  if (!response.body) {
    output.end();
    return;
  }
  await Readable.fromWeb(response.body as never).pipe(output);
}

export function startDesktopMcpHttpListener(
  services: ServiceCollection,
  options: { port?: number; onError?: (error: Error) => void } = {},
): Promise<{ close: () => Promise<void> } | undefined> {
  const port = options.port ?? DEFAULT_MCP_HTTP_PORT;
  const handler = createMcpHttpHandler({
    services,
    toolHandler: createHostMcpToolHandler(services),
  });
  const server = createServer((request, response) => {
    if (request.url && new URL(request.url, "http://127.0.0.1").pathname !== MCP_HTTP_PATH) {
      response.writeHead(404).end("Not found");
      return;
    }
    void handler(toWebRequest(request))
      .then((result) => writeWebResponse(result, response))
      .catch((error: unknown) => {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
        if (!response.headersSent) response.writeHead(503);
        response.end();
      });
  });
  return new Promise((resolve) => {
    const fail = (error: Error) => {
      server.close();
      options.onError?.(error);
      resolve(undefined);
    };
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", fail);
      resolve({
        close: () =>
          new Promise<void>((closeResolve, closeReject) =>
            server.close((error) => (error ? closeReject(error) : closeResolve())),
          ),
      });
    });
  });
}
