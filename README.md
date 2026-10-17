# AGI Bar Agent Skill

让你的 AI Agent 代你使用 [AGI Bar](https://agi.bar) 小程序：浏览活动、日历和酒单，报名与取消报名，付费报名与订场地（付款回到小程序由你本人完成），管理你主办或协作的活动。

## 开始

1. 在微信打开 AGI Bar 小程序 →「我的」→「Agent 接入」，点「复制参与指令」，发给你的 Agent：

   > 阅读 https://github.com/agi-bar/agi-bar-skill ，按说明用我的 AGI Bar 个人密钥（我会单独发给你）连接 AGI Bar，代我浏览活动、报名和预约场地。

2. 再点「复制密钥」，把个人密钥（`agib_u_` 开头）单独发给它。

Agent 读 [`SKILL.md`](SKILL.md) 就知道能做什么、怎么调用。

## 安全边界

- 密钥代表**你本人**：你在小程序里能做的，Agent 才能做；改角色或重置密钥立即生效。
- Agent **不能付钱**：需要付款时它会给你一个链接 / 二维码，你在微信里打开小程序自己付。
- 任何接口都**不返回手机号和微信号**；每把密钥每分钟 60 次、每天 3000 次；90 天不用自动休眠。
- 不要把密钥公开或发给别人。泄露了就在小程序里点「重置」。

## 命令行与 MCP（可选）

[`scripts/agibar.mjs`](scripts/agibar.mjs) 是零依赖的 Node 18+ 脚本：

```bash
export AGIBAR_API_KEY=agib_u_xxx
node scripts/agibar.mjs GET /api/agent/v1/whoami
node scripts/agibar.mjs GET "/api/activities?storeId=BJ&size=10"
node scripts/agibar.mjs pay <orderNo>     # 金额、链接和终端二维码
node scripts/agibar.mjs wait <orderNo>
node scripts/agibar.mjs qr <orderNo> pay.png
```

作为 MCP server（Claude Desktop / Claude Code / Cursor 等）：

```json
{
  "mcpServers": {
    "agi-bar": {
      "command": "node",
      "args": ["/path/to/agi-bar-skill/scripts/agibar.mjs", "mcp"],
      "env": { "AGIBAR_API_KEY": "agib_u_xxx" }
    }
  }
}
```

工具：`agibar_guide`、`agibar_request`、`agibar_payment`、`agibar_pay_prompt`、`agibar_wait_payment`。

## 维护

`SKILL.md` 与 AGI Bar 服务端接口一一对应；服务端仓库保存它的同步副本并在 CI 里校验一致。修改接口说明请改这里，再同步到服务端。
