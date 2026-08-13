#!/usr/bin/env node
// server.mjs — MCP server `4ai-fbo`. Zero dependency.
//
// Chạy: node mcp/fbo/server.mjs [--hub <đường dẫn hub 4AI>] [--data <nơi ghi index>]
// Transport: stdio, JSON-RPC 2.0 newline-delimited (MCP stdio).
// stdout CHỈ chứa message giao thức. Mọi log đi stderr.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, reply, replyError, toolText, toolError, log, ERR, PROTOCOL_VERSION } from './lib/rpc.mjs';
import { TOOLS, HANDLERS } from './lib/tools.mjs';

const SERVER = { name: '4ai-fbo', version: '1.0.0' };

// Hub mặc định = ../../ so với file này (mcp/fbo/server.mjs → gốc 4AI).
const argHub = process.argv.indexOf('--hub');
const HUB = argHub !== -1 && process.argv[argHub + 1]
  ? path.resolve(process.argv[argHub + 1])
  : path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');

// --data tách nơi ghi index khỏi nơi chứa code. Bỏ trống thì index nằm trong hub như cũ.
const argData = process.argv.indexOf('--data');
if (argData !== -1 && process.argv[argData + 1]) {
  process.env.FBO_DATA_ROOT = path.resolve(process.argv[argData + 1]);
}

let initialized = false;

async function onMessage(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize':
      initialized = true;
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions:
          'Tra cứu chương trình FBO/FBI. Luôn xác định `program` trước (list_programs), ' +
          'index_program một lần, rồi mới tra cứu. File không tồn tại thì báo không tồn tại — ' +
          'không bao giờ tự tạo hay suy đoán nội dung. Trước khi sửa file trong Include\\, ' +
          'dùng list_related kind=used_by để biết bao nhiêu controller dùng chung.',
      });

    case 'notifications/initialized':
      return; // notification, không trả lời

    case 'ping':
      return isRequest ? reply(id, {}) : undefined;

    case 'tools/list':
      return reply(id, { tools: TOOLS });

    case 'tools/call': {
      const name = params?.name;
      const handler = HANDLERS[name];
      if (!handler) return reply(id, toolError(`Không có tool \`${name}\`.`));
      try {
        const result = await handler(HUB, params?.arguments ?? {});
        return reply(id, toolText(result));
      } catch (e) {
        log(`tool ${name} lỗi:`, e?.message ?? String(e));
        return reply(id, toolError(e?.message ?? String(e)));
      }
    }

    // Khai capabilities rỗng nhưng vài client vẫn hỏi — trả danh sách rỗng thay vì lỗi.
    case 'resources/list':
      return reply(id, { resources: [] });
    case 'prompts/list':
      return reply(id, { prompts: [] });

    default:
      if (isRequest) return replyError(id, ERR.methodNotFound, `Method không hỗ trợ: ${method}`);
      return;
  }
}

log(`khởi động · hub=${HUB} · data=${process.env.FBO_DATA_ROOT || HUB} · node=${process.version}`);
serve(onMessage);
