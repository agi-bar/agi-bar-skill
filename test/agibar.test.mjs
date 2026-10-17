import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/agibar.mjs', import.meta.url));

function mcpSession(lines) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, 'mcp'], { env: { ...process.env, AGIBAR_API_KEY: '' } });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const replies = out.trim().split('\n').filter(Boolean);
      if (replies.length >= lines.filter((line) => line.id !== undefined).length) {
        child.kill();
        resolve(replies.map((line) => JSON.parse(line)));
      }
    });
    child.on('error', reject);
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
  });
}

test('MCP handshake lists the tools and refuses calls without a key', async () => {
  const [init, list, call] = await mcpSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'agibar_guide', arguments: {} } },
  ]);
  assert.equal(init.result.serverInfo.name, 'agi-bar');
  assert.match(init.result.instructions, /从不付钱/);
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ['agibar_request', 'agibar_payment', 'agibar_wait_payment', 'agibar_guide']);
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /AGIBAR_API_KEY/);
});

test('CLI help and admin-path refusal', async () => {
  const run = (args, env = {}) => new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /AGIBAR_API_KEY/);
  const admin = await run(['GET', '/api/admin/orders'], { AGIBAR_API_KEY: `agib_u_${'a'.repeat(43)}` });
  assert.equal(admin.code, 1);
  assert.match(admin.stderr, /\/api\/admin/);
  const badKey = await run(['GET', '/api/agent/v1/whoami'], { AGIBAR_API_KEY: 'agib_short' });
  assert.match(badKey.stderr, /格式不对/);
});
