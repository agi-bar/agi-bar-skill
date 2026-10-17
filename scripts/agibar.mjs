#!/usr/bin/env node
// AGI Bar agent CLI + MCP stdio server. Zero dependencies, Node 18+.
//
//   AGIBAR_API_KEY=agib_u_xxx node scripts/agibar.mjs GET /api/agent/v1/whoami
//   node scripts/agibar.mjs POST /api/activities/<id>/register '{"registrationAnswers":[]}'
//   node scripts/agibar.mjs pay <orderNo>           # amount, deadline, link and a QR code drawn in the terminal
//   node scripts/agibar.mjs wait <orderNo>          # long-poll a payment until it settles
//   node scripts/agibar.mjs qr <orderNo> pay.png    # save the payment QR code
//   node scripts/agibar.mjs mcp                     # run as an MCP stdio server
//
// The key acts as its owner. It never pays: payments are completed by the owner in the
// AGI Bar miniapp (see SKILL.md §4). Contact details (phone / WeChat ID) are never returned.

import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const VERSION = '1.0.0';
const DEFAULT_BASE_URL = 'https://ssd.api.moblin.net/agi-bar';
const SKILL_URL = 'https://github.com/agi-bar/agi-bar-skill';
const KEY_PATTERN = /^agib_u_[A-Za-z0-9_-]{43}$/;

function config() {
  const key = (process.env.AGIBAR_API_KEY || '').trim();
  const baseUrl = (process.env.AGIBAR_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { key, baseUrl };
}

function assertKey(key) {
  if (!key) throw new Error('缺少 AGIBAR_API_KEY：请在 AGI Bar 小程序「我的 → Agent 接入」复制个人密钥');
  if (!KEY_PATTERN.test(key)) throw new Error('AGIBAR_API_KEY 格式不对：个人密钥以 agib_u_ 开头，共 50 个字符');
}

function normalizePath(path) {
  const value = String(path || '').trim();
  if (!value.startsWith('/')) throw new Error(`路径需以 / 开头：${value}`);
  if (/^\/(?:agi-bar\/)?api\/admin\//.test(value)) throw new Error('个人密钥不能调用 /api/admin/* 接口');
  return value.replace(/^\/agi-bar(?=\/)/, '');
}

export async function request(method, path, body, { binary = false, text: asText = false } = {}) {
  const { key, baseUrl } = config();
  assertKey(key);
  const headers = { authorization: `Bearer ${key}`, 'user-agent': `agi-bar-skill/${VERSION}` };
  const init = { method: method.toUpperCase(), headers };
  if (body !== undefined && body !== null && init.method !== 'GET') {
    headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${normalizePath(path)}`, init);
  if (binary && response.ok) return Buffer.from(await response.arrayBuffer());
  if (asText && response.ok) return response.text();
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok || (payload && typeof payload === 'object' && 'code' in payload && payload.code !== 0)) {
    const message = payload && typeof payload === 'object' ? payload.message : text;
    const error = new Error(`${response.status} ${message || response.statusText}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}

/** What to show the owner: amount, deadline, the link, and the QR code as terminal text. */
export async function paymentPrompt(orderNo) {
  const payment = await request('GET', `/api/agent/v1/payments/${encodeURIComponent(orderNo)}`);
  if (payment.state !== 'pending' || !payment.payUrl) return { payment, text: payment.next };
  const qr = await request('GET', `/api/agent/v1/payments/${encodeURIComponent(orderNo)}/qr?format=text`, undefined, { text: true });
  const yuan = (Number(payment.amountFen) / 100).toFixed(2);
  const deadline = payment.expiresAt ? new Date(payment.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '';
  const text = [
    `${payment.title} · ¥${yuan}${deadline ? ` · 请在 ${deadline} 前付款` : ''}`,
    `用微信扫码，或在手机上打开：${payment.payUrl}`,
    qr,
  ].join('\n');
  return { payment, text };
}

export async function waitForPayment(orderNo, maxMinutes = 15) {
  const deadline = Date.now() + maxMinutes * 60_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await request('GET', `/api/agent/v1/payments/${encodeURIComponent(orderNo)}/wait?timeout=25`);
    if (last.state !== 'pending') return last;
  }
  return last;
}

// ---------- MCP (JSON-RPC 2.0 over stdio, newline-delimited) ----------

const TOOLS = [
  {
    name: 'agibar_request',
    description: '以本人身份调用 AGI Bar 接口（只开放 SKILL.md 列出的接口）。路径如 /api/activities?storeId=BJ。写操作前先向用户确认。',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'DELETE'] },
        path: { type: 'string', description: '以 /api/ 开头的路径，可带 query' },
        body: { type: 'object', description: 'JSON 请求体（GET 忽略）' },
      },
      required: ['method', 'path'],
    },
  },
  {
    name: 'agibar_payment',
    description: '查询本人订单的付款状态与付款链接 payUrl（交给本人在微信里打开小程序付款）。',
    inputSchema: { type: 'object', properties: { orderNo: { type: 'string' } }, required: ['orderNo'] },
  },
  {
    name: 'agibar_pay_prompt',
    description: '生成给本人的付款提示：金额、截止时间、付款链接和终端可显示的二维码（原样展示给用户）。',
    inputSchema: { type: 'object', properties: { orderNo: { type: 'string' } }, required: ['orderNo'] },
  },
  {
    name: 'agibar_wait_payment',
    description: '等待本人完成付款：长轮询直到订单不再是 pending（默认最多 15 分钟）。',
    inputSchema: {
      type: 'object',
      properties: { orderNo: { type: 'string' }, maxMinutes: { type: 'number', minimum: 1, maximum: 30 } },
      required: ['orderNo'],
    },
  },
  {
    name: 'agibar_guide',
    description: '返回 AGI Bar Agent 说明书地址与当前密钥身份（whoami）。开始前先调用。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const INSTRUCTIONS = `你在代表一位 AGI Bar 用户使用小程序。先读说明书 ${SKILL_URL}（SKILL.md）。`
  + '规则：你从不付钱（把 payUrl 交给本人）；写操作先向用户确认；409 不自动重试；拿不到任何人的手机号和微信号。';

async function callTool(name, args = {}) {
  switch (name) {
    case 'agibar_request':
      return request(String(args.method || 'GET'), String(args.path || ''), args.body);
    case 'agibar_payment':
      return request('GET', `/api/agent/v1/payments/${encodeURIComponent(String(args.orderNo || ''))}`);
    case 'agibar_pay_prompt':
      return (await paymentPrompt(String(args.orderNo || ''))).text;
    case 'agibar_wait_payment':
      return waitForPayment(String(args.orderNo || ''), Math.min(Math.max(Number(args.maxMinutes) || 15, 1), 30));
    case 'agibar_guide':
      return { skill: SKILL_URL, whoami: await request('GET', '/api/agent/v1/whoami') };
    default:
      throw new Error(`未知工具：${name}`);
  }
}

function runMcp() {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const { id, method, params } = message;
    if (id === undefined || id === null) return; // notifications
    try {
      if (method === 'initialize') {
        send({ jsonrpc: '2.0', id, result: {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'agi-bar', version: VERSION },
          instructions: INSTRUCTIONS,
        } });
      } else if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      } else if (method === 'tools/call') {
        try {
          const result = await callTool(params?.name, params?.arguments || {});
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
        } catch (error) {
          send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(error.message || error) }] } });
        }
      } else if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
      } else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
    } catch (error) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(error.message || error) } });
    }
  });
}

// ---------- CLI ----------

function usage() {
  return [
    `agibar ${VERSION} — AGI Bar 个人密钥 CLI（说明书：${SKILL_URL}）`,
    '',
    '  agibar <GET|POST|PATCH|DELETE> <path> [json-body]',
    '  agibar pay <orderNo>',
    '  agibar wait <orderNo> [maxMinutes]',
    '  agibar qr <orderNo> [out.png]',
    '  agibar mcp',
    '',
    '环境变量：AGIBAR_API_KEY（必填）、AGIBAR_BASE_URL（默认 https://ssd.api.moblin.net/agi-bar）',
  ].join('\n');
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help') {
    console.log(usage());
    return;
  }
  if (command === 'mcp') {
    runMcp();
    return;
  }
  if (command === 'pay') {
    console.log((await paymentPrompt(rest[0])).text);
    return;
  }
  if (command === 'wait') {
    console.log(JSON.stringify(await waitForPayment(rest[0], Number(rest[1]) || 15), null, 2));
    return;
  }
  if (command === 'qr') {
    const png = await request('GET', `/api/agent/v1/payments/${encodeURIComponent(rest[0] || '')}/qr`, undefined, { binary: true });
    const out = rest[1] || `agibar-pay-${rest[0]}.png`;
    writeFileSync(out, png);
    console.log(out);
    return;
  }
  const method = command.toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new Error(usage());
  const body = rest[1] ? JSON.parse(rest[1]) : undefined;
  console.log(JSON.stringify(await request(method, rest[0], body), null, 2));
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
