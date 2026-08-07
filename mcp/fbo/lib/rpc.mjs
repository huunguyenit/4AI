// rpc.mjs — JSON-RPC 2.0 trên stdio theo đúng MCP stdio transport.
//
// Transport: mỗi message là MỘT dòng JSON, phân tách bằng '\n'. Không Content-Length
// header (đó là LSP, không phải MCP stdio). stdout CHỈ chứa message — mọi log đi stderr.
// Tự viết thay vì dùng SDK để giữ hard rule zero-dependency của hub.

export const PROTOCOL_VERSION = '2024-11-05';

export function log(...args) {
  process.stderr.write(`[4ai-fbo] ${args.join(' ')}\n`);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

export function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

export function replyError(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

export const ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
};

/**
 * Vòng lặp đọc stdin theo dòng.
 * @param {(msg: object) => Promise<void>} onMessage
 */
export function serve(onMessage) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line === '') continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (e) {
        replyError(null, ERR.parse, `JSON không parse được: ${e.message}`);
        continue;
      }
      // Xử lý tuần tự: tool đều đồng bộ hoặc ngắn, không cần pipeline.
      Promise.resolve(onMessage(msg)).catch((e) => {
        log('lỗi không bắt được:', e?.stack ?? String(e));
        if (msg?.id !== undefined) replyError(msg.id, ERR.internal, String(e?.message ?? e));
      });
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

/** Kết quả tool: MCP muốn content[] gồm các block. Ta trả JSON đã format cho model đọc. */
export function toolText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function toolError(message) {
  return { content: [{ type: 'text', text: `LỖI: ${message}` }], isError: true };
}
