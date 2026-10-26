// Minimal MCP server (Streamable HTTP, stateless, JSON responses only) so Claude
// can read the wardrobe and log wears. Cloudflare Access can't sign Claude in,
// so this path is bypassed in Access and guarded by its own secret instead.

import { callTool, TOOLS, type ToolContext } from './mcpTools';
import { MCP_APP_MIME, PHOTOS_HTML, PHOTOS_URI } from './photosView';

export interface McpEnv {
  /** Secret that guards /mcp. Unset = endpoint disabled (fails closed). */
  MCP_TOKEN?: string;
}

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/** Constant-time comparison (hashing first so lengths don't leak). */
async function tokenMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * The token comes as `Authorization: Bearer <token>` (Claude Code and other
 * clients with headers) or as the path `/mcp/<token>` (the Claude app's custom
 * connectors take only a URL).
 */
export async function mcpAuthorized(request: Request, pathname: string, env: McpEnv): Promise<'ok' | 'unconfigured' | 'denied'> {
  if (!env.MCP_TOKEN || env.MCP_TOKEN.length < 24) return 'unconfigured';
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  const fromPath = pathname.startsWith('/mcp/') ? decodeURIComponent(pathname.slice('/mcp/'.length)) : undefined;
  for (const given of [bearer, fromPath]) {
    if (given && (await tokenMatches(given, env.MCP_TOKEN))) return 'ok';
  }
  return 'denied';
}

export async function handleMcp(request: Request, ctx: ToolContext): Promise<Response> {
  if (request.method !== 'POST') {
    // No server-initiated stream: tell clients to use POST only.
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }

  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleMessage(m as RpcRequest, ctx)))).filter((r) => r !== null);
  if (replies.length === 0) return new Response(null, { status: 202 });
  return jsonResponse(Array.isArray(body) ? replies : replies[0]);
}

async function handleMessage(msg: RpcRequest, ctx: ToolContext): Promise<unknown | null> {
  if (typeof msg !== 'object' || msg === null || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpc(null, undefined, { code: -32600, message: 'Invalid request' });
  }
  const isNotification = msg.id === undefined;
  const id = msg.id ?? null;
  if (isNotification) return null; // e.g. notifications/initialized

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return rpc(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked as string) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'life', version: '0.1.0' },
        instructions:
          'Life tracks a personal wardrobe. To log what the user wore: find_items / list_outfits to get ids, confirm any ambiguous match, then log_wear with a YYYY-MM-DD date. Whenever it is unclear which item the user means, or they ask to see something, call show_photos so they can see the items in the chat. Only add tags (add_tags) when the user themselves describes the style, mood or occasion of what they wore.',
      });
    }
    case 'ping':
      return rpc(id, {});
    case 'resources/list':
      return rpc(id, {
        resources: [{ uri: PHOTOS_URI, name: 'Life photos', description: 'Photo gallery shown in the chat by show_photos.', mimeType: MCP_APP_MIME }],
      });
    case 'resources/read': {
      if (msg.params?.uri !== PHOTOS_URI) return rpc(id, undefined, { code: -32002, message: 'Resource not found' });
      return rpc(id, {
        contents: [{ uri: PHOTOS_URI, mimeType: MCP_APP_MIME, text: PHOTOS_HTML, _meta: { ui: { prefersBorder: false } } }],
      });
    }
    case 'tools/list':
      return rpc(id, { tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string') return rpc(id, undefined, { code: -32602, message: 'Missing tool name' });
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args, ctx);
        const content = [
          { type: 'text', text: result.text },
          // A caption before each photo tells Claude (and the user) which item it is.
          ...(result.images ?? []).flatMap((img) => [
            { type: 'text', text: img.caption },
            { type: 'image', data: img.data, mimeType: img.mimeType },
          ]),
        ];
        return rpc(id, { content, isError: result.isError ?? false });
      } catch (e) {
        console.error('mcp tool failed', name, e);
        return rpc(id, { content: [{ type: 'text', text: 'Something went wrong on the server.' }], isError: true });
      }
    }
    default:
      return rpc(id, undefined, { code: -32601, message: `Method not found: ${msg.method}` });
  }
}

function rpc(id: string | number | null, result?: unknown, error?: { code: number; message: string }) {
  return error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result };
}

function rpcError(id: null, code: number, message: string): Response {
  return jsonResponse(rpc(id, undefined, { code, message }));
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
