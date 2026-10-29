---
name: agi-bar
description: 用 AGI Bar 个人密钥代表本人使用 AGI Bar 小程序——浏览活动、日历和菜单，报名与取消报名，付费报名与场地预约（付款由本人在小程序里完成），管理自己主办或协作的活动；在 AGI Bar 店里的网络下，同一把密钥还能调店内模型（token）。
---

# AGI Bar Agent 说明书

你正在代表一位 AGI Bar 用户操作。用户在小程序「我的 → Agent 接入」复制了自己的**个人密钥**（`sk-agibar-` 开头，53 个字符），它代表**这个人本人**：小程序里这个人能做的，你在下面列出的接口里也能做；不能做的，你也做不了。`agib_u_` 和 `sk-agib-` 开头的旧密钥已经作废：请用户在「我的 → Agent 接入」复制新的。

同一把密钥有两种用法，网络要求不一样：

- **AGI Bar 的服务**（第 1–7 节：活动、报名、订单、场地、活动管理）：在哪个网络都能调。
- **店内模型**（第 8 节，`https://token.agi.bar`）：**只能在 AGI Bar 店里的网络下调**，请求必须从连着店内 Wi-Fi 的那台电脑发出。

## 0. 先读这里

- **地址**：`https://ssd.api.moblin.net/agi-bar`（下文路径都接在它后面）。
- **鉴权**：每个请求带 `Authorization: Bearer <个人密钥>`。公开接口（活动列表、详情、日历、菜单、门店）不带也行。
- **还没拿到密钥**：请用户在小程序「我的 → Agent 接入」点「复制密钥」发给你（指令里不带密钥）。页面上如果只有「先绑定 GitHub」，说明还没绑 GitHub：要先绑定（还送一杯酒），绑完才有密钥。拿到后只保存在本地配置或环境变量 `AGIBAR_API_KEY` 里。
- **回包**：统一是 `{ "code": 0, "message": "ok", "data": … }`。出错时 HTTP 状态非 2xx，`code` 是业务码、`message` 是可以直接转述给用户的中文原因。
- **金额**一律是**整数分**（`amountFen: 9900` = ¥99.00）；时间是 ISO 8601，门店业务时间按北京时间理解。
- **先调一次** `GET /api/agent/v1/whoami`：确认密钥可用，拿到限额。
- **个人密钥不能管理门店**：它只代表这个人本人。门店员工要让 Agent 做门店的活，请他在网页工作台「API 密钥」建员工密钥（`agib_` 开头），那套说明在工作台里。
- **密钥只给这个人用**。不要把密钥写进公开的地方、日志或发给第三方；用户说「换钥匙」时，请他在小程序里点「重置」。

### 必须遵守

1. **你从不付钱。** 需要付款时，把服务端给的付款链接 / 二维码交给本人，由本人在微信里打开小程序完成。不要尝试任何余额、钱包、转账、充值操作——这些接口对密钥不开放。
2. **写操作只做用户明确要求的事。** 报名、取消、审核、移除、改活动信息之前，先向用户复述将要做什么，得到确认再调用。取消报名可能触发退款，移除报名者会通知对方。
3. **遇到 409（版本冲突）不要自动重试**：重新读取最新状态，告诉用户发生了什么，再按用户的决定操作。
4. **联系方式拿不到**：任何接口都不会返回手机号、微信号（本人资料里的手机号是打码的）。不要试图收集、推测或导出他人的联系方式。
5. 遇到本说明书没写的接口，返回 403「只开放 Agent 说明书里列出的接口」是正常的——那件事请用户到小程序里做。

### 限额与常见错误

| 情况 | 返回 | 你该怎么做 |
|---|---|---|
| 密钥写错 / 已重置 | 401「个人密钥无效或已重置」 | 请用户在小程序「Agent 接入」复制最新密钥 |
| 旧格式密钥（`agib_u_`、`sk-agib-`） | 401「个人密钥已换成 sk-agibar- 开头的新格式…」 | 请用户在小程序「Agent 接入」复制新的密钥 |
| 没绑 GitHub | 401「先在小程序「我的 → Agent 接入」绑定 GitHub…」 | 请用户先在「Agent 接入」绑定 GitHub |
| 调了门店侧接口（`/api/staff/...`） | 403「个人密钥只代表你本人，不能管理门店…」 | 告诉用户门店的活要用网页工作台建的员工密钥 |
| 90 天没用而休眠 | 401「…休眠…」 | 请用户在小程序「Agent 接入」重新复制一次密钥（复制即恢复） |
| 太频繁 | 429（每分钟 60 次、每天 3000 次） | 等一会儿再试；列表请翻页而不是反复全量拉取 |
| 接口没开放 | 403 | 请用户在小程序里操作 |
| 报名资料不全 | 400，业务码 `4061`，列出缺项 | 请用户在小程序「我的」补全头像、称呼、公司、职务、微信号和手机号 |
| 仅限 AGI Pass 会员 | 400，业务码 `4261` | 告诉用户这场需要有效的 AGI Pass |

## 1. 浏览（公开）

| 做什么 | 接口 | 说明 |
|---|---|---|
| 门店列表 | `GET /api/stores` | 拿 `storeId`（如 `BJ`、`SH`） |
| 活动列表 | `GET /api/activities` | `page`、`size≤50`、`storeId`、`mode=upcoming\|past`、`from`、`to`、`filter=registrable\|free\|paid`、`keyword` |
| 活动详情 | `GET /api/activities/:id` | 报名方式 `registrationMode`（只有 `internal` 能在线报名）、名额、票价 `ticketPriceFen`、报名问题 `registrationQuestions` |
| 活动日历 | `GET /api/activities/calendar/mine`（带密钥）或 `GET /api/activities/calendar`（公开） | 必填 `from`、`to`（1–62 天），可选 `storeId`；闭门活动显示「闭门活动」，本人能进的那场在带密钥的版本里多一个 `unlock` |
| 菜单 / 酒单 | `GET /api/commerce/menu?storeId=BJ` | 当前门店在售的酒水与价格 |

## 2. 我自己

| 做什么 | 接口 | 说明 |
|---|---|---|
| 我是谁 | `GET /api/agent/v1/whoami` | `userId`、说明书地址、限额 |
| 我的资料 | `GET /api/my/profile` | 只读；手机号打码。改资料请用户在小程序里改 |
| 我的报名 | `GET /api/my/events/registrations` | `mode=upcoming\|past`、`status`、`page`、`size≤50`、`cursor` |
| 我在某场的状态 | `GET /api/activities/:id/me` | 报名状态与 `reviewVersion`、票单 `registration.ticketOrder`（`orderNo`、`status`、`expiresAt`）、是否可管理 `canManageEvent` |
| 我的订单 | `GET /api/my/orders`、`GET /api/orders/:orderNo` | `status` 可筛选 |
| 我的场地预约 | `GET /api/my/bookings`、`GET /api/my/bookings/:bookingNo` | |
| AGI Pass | `GET /api/pass/me/summary` | 是否有效、到期日、本年打卡进度 |

入场码、身份码、钱包、转赠、发票申请**不对 Agent 开放**。

## 3. 报名与取消

1. 先读详情，确认 `registrationMode=internal`、还有名额；如果有 `registrationQuestions`，**每一题都必答**，向用户问清答案。
2. `POST /api/activities/:id/register`，body：
   ```json
   { "registrationAnswers": [{ "questionId": "q1", "value": "产品经理" }], "reason": "可选：想来的原因", "expectedRegistrationId": null }
   ```
   选择题可用 `selectedOptionIds`。`expectedRegistrationId`：之前没有报名传 `null`，否则传原报名 ID。
3. 结果：
   - **免费活动**：`status=pending_review`，等主办方审核，审核结果会通知本人。
   - **收费活动**：`status=pending_payment`，并返回 `order.orderNo` → 按「4. 付款」处理。付款成功后自动 `registered`，不再审核。
4. 改报名答案：`PATCH /api/activities/:id/registration`（同上 body，带 `reviewVersion`、`expectedRegistrationId`）。
5. 取消：`POST /api/activities/:id/cancel-registration`，body `{ "reviewVersion": <读到的版本> }`。活动开始后不能取消；已付款的会按剩余可退金额原路退款（响应里 `refund`）。
6. 满员时可以 `POST /api/activities/:id/interest`（我感兴趣），有空位会通知本人。

## 4. 付款（永远由本人在小程序完成）

收费报名、场地预约、活动场地费、扩容补差、活动增项，服务端都会生成一张待付款订单（`orderNo`）。

1. `GET /api/agent/v1/payments/:orderNo` → `state`（`pending | paid | expired | closed | refunded`）、`amountFen`、`expiresAt`、**`payUrl`**（https 链接，在手机上打开直达小程序付款页）、`qrUrl`（同一链接的二维码：`GET /api/agent/v1/payments/:orderNo/qr` 是 PNG；加 `?format=text` 是可以直接打印在终端里的字符二维码）、`next`（下一步该做什么）。
2. 告诉用户金额和付款截止时间，并给出付款方式：用户在手机上就发 `payUrl`；在电脑终端里就把 `?format=text` 的二维码原样打印出来让他用微信扫（扫不出来再给 PNG）。用 CLI 时 `node scripts/agibar.mjs pay <orderNo>` 一次打出全部。
3. 调 `GET /api/agent/v1/payments/:orderNo/wait?timeout=25` 长轮询：付款完成或到时就返回（`timedOut=true` 表示还没付，可以再等）。也可以隔一会儿查一次状态。
4. 看到 `state=paid` 就告诉用户已经办好。本人付完后小程序会提示「已付款，可以回到你的 Agent 了」。

注意：
- 订单有付款时限（一般 15 分钟）。`state=expired` 或 `closed` 时**重新发起**：报名就再报一次，场地预约就重新预约，活动申请就调用 `POST /api/my/events/:id/resubmit`。
- 通过 Agent 提交的申请**不会预先占用场地**，本人打开付款页时才会锁定时段；如果那时已有冲突，付款页会提示。
- 不会自动抵扣余额，也没有其他付款方式。

## 5. 场地预约与活动申请

**只订场地**（不对外办活动）：
1. 看空档：`GET /api/bookings/availability?storeId=BJ&date=2026-10-20`（`occupiedRanges` 是已有活动的时段，可以重叠但要提醒用户「这个时段已有活动，可咨询工作人员」）。
2. 报价：`POST /api/bookings/quote`，body 含 `storeId`、`type=hourly|daily`、`startAt`、`endAt`、`headcount`。
3. 创建：`POST /api/bookings`，在报价字段之外加 `contactName`、`contactPhone`（向用户确认）、`activityName`、可选 `remark`。返回 `bookingNo` 和待付款 `order` → 「4. 付款」。
4. 改活动名 / 备注：`PATCH /api/my/bookings/:bookingNo`；已付款后要取消：`POST /api/my/bookings/:bookingNo/cancel-request`（只是申请，由门店审核）。

**申请办一场活动**（会出现在活动列表，可以开放报名）：
1. `POST /api/events`，body 例：
   ```json
   {
     "storeId": "BJ", "type": "hourly", "eventDate": "2026-10-20", "startTime": "19:00", "endTime": "21:00",
     "capacity": 60, "title": "活动名称", "summary": "50 字内摘要", "ticketPriceFen": 0,
     "introFormat": "markdown", "introMarkdown": "活动介绍", "registrationMode": "internal",
     "registrationQuestions": [], "publicVisible": true
   }
   ```
   多场次用 `sessions: [{ "date", "startTime", "endTime" }]`（最多 14 段）。
2. 返回 `eventId`、报价 `quote`，需要付场地费时带 `order` → 「4. 付款」。付款后进入门店审核，审核结果通知本人。
3. 未付款或被退回的申请：改好后 `POST /api/my/events/:id/resubmit`（完整活动体）。

## 6. 管理我主办或协作的活动

主办方和被加为**协作人员**的人可以管理那场活动；协作人员看不到财务和设置、也不能增减协作人员——和小程序完全一致，越权会返回 403。

| 做什么 | 接口 | 说明 |
|---|---|---|
| 我管理的活动 | `GET /api/my/events` | `status`（`published/billing/pending/expired`）、`keyword`、`page`、`size≤50` |
| 活动详情 | `GET /api/my/events/:id` | 报名概况、协作人员、账单与结算（主办方）、`isEventVolunteer` |
| 修改信息 | `PATCH /api/my/events/:id` | 只改内容：`{ "mode": "content", "introMarkdown": … }`；只换封面：`{ "mode": "cover", "coverUrl": … }`；完整改档按「5」的活动体（发布后不能改门店、时间、名额、票价、报名方式） |
| 调整名额 | `POST /api/my/events/:id/capacity` | `{ "capacity": 80 }`；扩容可能产生补差订单 → 「4. 付款」 |
| 报名名单 | `GET /api/my/events/:id/registrations` | `status`、`keyword`、`page`、`size≤50`、`cursor`；加 `includeAnswers=1` 返回每人的报名表答案。字段：姓名、公司、职务、状态、报名时间、是否签到、是否 AGI Pass。**没有手机号和微信号** |
| 单个报名 | `GET /api/my/events/:id/registrations/:registrationId` | 含报名理由与答案 |
| 审核 | `POST /api/my/events/:id/registrations/:registrationId/approve`、`/api/my/events/:id/registrations/:registrationId/ignore`、`/api/my/events/:id/registrations/:registrationId/remove` | body `{ "reviewVersion": <读到的版本> }`；移除已付款报名会退款 |
| 签到 | `POST /api/my/events/check-in` | `{ "payload": "<扫到的入场码内容>" }` |
| 现场签到码 | `GET /api/my/events/:id/checkin-code` | PNG 图片，参与者扫码自助签到 |
| 协作人员 | `GET/POST /api/my/events/:id/volunteers`、`DELETE /api/my/events/:id/volunteers/:volunteerUserId` | 增减仅主办方 |
| 活动发票 | `GET/POST /api/my/events/:id/invoice`、`POST /api/my/events/:id/invoice/clear` | 查看开票状态、提交或清空抬头（主办方） |
| 合同与文件 | `GET/POST /api/my/events/:id/contract`、`GET /api/my/events/:id/documents` | 主办方 |
| 付增项 | `POST /api/my/events/:id/charges/pay` | 返回订单 → 「4. 付款」 |
| 活动回顾 | `POST /api/my/events/:id/reviews` | 活动结束后，`{ "type": "audio\|video\|link", "url", "title" }` |
| 照片上传开关 | `PATCH /api/my/events/:id/photo-upload` | `{ "allowPhotoUpload": false }` |

**不能通过 Agent 做**：删除或取消活动、导出名单文件、改票价、读取报名者联系方式。这些请用户在小程序里操作。

## 7. 命令行与 MCP（可选）

本仓库的 `scripts/agibar.mjs` 是零依赖 Node 脚本（Node 18+）：

```bash
export AGIBAR_API_KEY=sk-agibar-xxx
node scripts/agibar.mjs GET /api/agent/v1/whoami
node scripts/agibar.mjs GET "/api/activities?storeId=BJ&size=10"
node scripts/agibar.mjs POST /api/activities/<id>/register '{"registrationAnswers":[],"expectedRegistrationId":null}'
node scripts/agibar.mjs pay <orderNo>    # 金额、链接和终端二维码
node scripts/agibar.mjs wait <orderNo>
node scripts/agibar.mjs mcp          # 作为 MCP stdio server 运行
```

MCP 配置示例见仓库 README。

## 8. 店内模型（token，只能在 AGI Bar 店里的网络下）

AGI Bar 给到店的客人免费提供大模型调用。同一把个人密钥就是这个人在店内模型上的 key，不用另外申请。

**先确认网络**：店内模型只在 AGI Bar 店里的网络下可用，请求必须从**连着店内 Wi-Fi 的那台电脑**发出。在云端、远程沙箱或网页里运行的 Agent 调不到；这种情况下直接告诉用户：要在店里、用装在自己电脑上的 Agent 才能用。第 1–7 节的 AGI Bar 接口不受这个限制。

| 项 | 值 |
|---|---|
| 地址 | `https://token.agi.bar`（OpenAI 兼容的 base URL 是 `https://token.agi.bar/v1`） |
| 鉴权 | `Authorization: Bearer <个人密钥>`（和第 0 节同一把） |
| 开放时间 | 跟门店营业时间走，打烊后会拒绝请求 |

1. **先查有哪些模型**（也用来确认网络通不通）：
   ```bash
   curl --fail --silent --show-error \
     --header "Authorization: Bearer $AGIBAR_API_KEY" \
     https://token.agi.bar/v1/models
   ```
   模型名一律以返回结果为准，不要猜。
2. **调用**：按客户端支持的格式选一个，不确定就用 OpenAI Chat Completions。

   | 格式 | 路径 |
   |---|---|
   | OpenAI Chat Completions | `POST /v1/chat/completions` |
   | OpenAI Responses | `POST /v1/responses` |
   | Anthropic Messages | `POST /v1/messages` |
   | Gemini GenerateContent | `POST /v1beta/models/{model}:generateContent`（流式 `:streamGenerateContent`） |

   ```bash
   curl --fail --silent --show-error https://token.agi.bar/v1/chat/completions \
     --header "Authorization: Bearer $AGIBAR_API_KEY" \
     --header 'Content-Type: application/json' \
     --data '{"model":"<上一步拿到的模型名>","messages":[{"role":"user","content":"你好"}]}'
   ```
3. **Minimax H3 是视频模型**，不能当聊天或编程模型用：要生成视频时调 `POST https://token.agi.bar/minimax-h3/head/v1/videos/sync`（multipart 表单，返回视频文件）。
4. **要把店内模型配进用户本机的 AI 客户端**（Claude Code、Codex、Cursor 等）：在店里的网络下读 `https://token.agi.bar/llms.txt`，按里面的步骤做（先备份配置、只新增不改默认模型、H3 的完整参数也在里面）。

| 情况 | 现象 | 你该怎么做 |
|---|---|---|
| 不在店里的网络 | `token.agi.bar` 连不上或超时 | 请用户确认电脑连的是 AGI Bar 店内 Wi-Fi，连上后再试；不要改任何配置 |
| 密钥不对 | 401 / 403 | 请用户在小程序「Agent 接入」重新复制密钥（旧格式 `agib_u_`、`sk-agib-` 和以前的共享 key `sk-agi_bar-static` 都已作废） |
| 打烊了 | 报错说 key 或 team 被封（blocked） | 店内模型跟营业时间走，营业时间内再试 |

## 9. Few Shots：登记你替本人做的事

用户让你在 Few Shots（`github.com/few-shots`）上提题或交 shot 时，事情做完后用同一把个人密钥登记一笔，AGI Bar 就知道这是哪位成员做的。只登记已经真实发生的事：issue 或 PR 已经开出来了再登记。

`POST /api/agent/v1/few-shots/activity`，请求头带 `Idempotency-Key`：

| 场景 | 请求体 | 建议的 `Idempotency-Key` |
|---|---|---|
| 提了一道题（开了 issue） | `{ "kind": "problem", "issue": 12, "url": "https://github.com/few-shots/few-shots/issues/12" }` | `few-shots:problem:12` |
| 交了一个 shot（开了 PR） | `{ "kind": "shot", "problem": "p001", "pr": 42, "url": "https://github.com/few-shots/few-shots/pull/42" }` | `few-shots:shot:p001:42` |

- `kind=problem` 必须带 `issue`；`kind=shot` 必须带 `pr` 和 `problem`（题号）。`url` 只收 `https://github.com/` 开头的链接，`note` 可选（≤500 字）。
- 同一个 `Idempotency-Key` 重发拿回第一笔（`idempotent: true`），可以放心重试；同一个键换了内容会 409。
- 登记失败不影响 issue 或 PR 本身：告诉用户一声，不要为了登记去改 issue 或 PR。
