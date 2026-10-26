// Experimental: ask the user a question through MCP elicitation (a native pick-one prompt in the client).
// Elicitation is a request from the server to the client, so the tools/call POST is answered with an
// event stream carrying `elicitation/create`; the client answers in a separate POST, which `resolveElicitation`
// matches up by id. Pending questions live in this isolate's memory, so a reply that lands on another
// isolate times out (and the tool says so). Clients that don't support elicitation answer with an error.

export const ELICIT_TOOL = {
  name: 'ask_to_choose',
  description:
    'Experimental. Ask the user to pick one option through the app’s native prompt (MCP elicitation) and return what they chose. Use it when the user asks to test this, or when a match is ambiguous and you want a tappable choice. Give 2 to 10 short option labels. If it returns an error or no answer, ask in plain text instead.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'What to ask, e.g. "Which white T-shirt did you mean?"' },
      options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10 },
    },
    required: ['question', 'options'],
  },
} as const;

const TIMEOUT_MS = 90_000;
const pending = new Map<string, (reply: Record<string, any>) => void>();

/** A client's answer to a server request; returns true when it belonged to a pending question. */
export function resolveElicitation(msg: Record<string, any>): boolean {
  const resolve = typeof msg.id === 'string' ? pending.get(msg.id) : undefined;
  if (!resolve) return false;
  resolve(msg);
  return true;
}

const sse = (msg: unknown) => `event: message\ndata: ${JSON.stringify(msg)}\n\n`;
const done = (text: string, isError = false) => ({ content: [{ type: 'text', text }], isError });

export function streamElicitation(id: string | number | null, args: Record<string, unknown>): Response {
  const options = Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').slice(0, 10) : [];
  const question = typeof args.question === 'string' ? args.question : '';
  if (!question || options.length < 2) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: done('Give a question and at least two options.', true) }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const { readable, writable } = new TransformStream<string, string>();
  const writer = writable.getWriter();
  const requestId = `elicit-${crypto.randomUUID()}`;
  const reply = new Promise<Record<string, any>>((resolve) => {
    pending.set(requestId, resolve);
    setTimeout(() => resolve({ timeout: true }), TIMEOUT_MS);
  });

  void (async () => {
    try {
      await writer.write(
        sse({
          jsonrpc: '2.0',
          id: requestId,
          method: 'elicitation/create',
          params: {
            message: question,
            requestedSchema: {
              type: 'object',
              properties: { choice: { type: 'string', title: 'Choice', enum: options } },
              required: ['choice'],
            },
          },
        }),
      );
      const answer = await reply;
      let result;
      if (answer.timeout) result = done('No answer came back (timed out). Ask the user in plain text.', true);
      else if (answer.error) result = done(`The app can’t show this prompt: ${answer.error.message ?? 'error'}. Ask the user in plain text.`, true);
      else if (answer.result?.action === 'accept') result = done(`The user chose: ${answer.result.content?.choice}`);
      else result = done(`The user ${answer.result?.action === 'decline' ? 'declined' : 'dismissed the prompt'} without choosing.`);
      await writer.write(sse({ jsonrpc: '2.0', id, result }));
    } catch {
      // the client went away
    } finally {
      pending.delete(requestId);
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable.pipeThrough(new TextEncoderStream()), {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  });
}
