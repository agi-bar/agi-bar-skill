---
name: agi-bar
description: 用 AGI Bar 个人密钥代表本人使用 AGI Bar 小程序——浏览活动、日历和菜单，报名与取消报名，付费报名与场地预约（付款由本人在小程序里完成），以及管理自己主办或协作的活动。
---

# AGI Bar Agent 说明书

你正在代表一位 AGI Bar 用户操作。用户在小程序「我的 → Agent 接入」拿到了一把**个人密钥**（`agib_u_` 开头，50 个字符），它代表**这个人本人**：小程序里这个人能做的，你在下面列出的接口里也能做；不能做的，你也做不了。

## 0. 先读这里

- **地址**：`https://ssd.api.moblin.net/agi-bar`（下文路径都接在它后面）。
- **鉴权**：每个请求带 `Authorization: Bearer <个人密钥>`。公开接口（活动列表、详情、日历、菜单、门店）不带也行。
- **回包**：统一是 `{ "code": 0, "message": "ok", "data": … }`。出错时 HTTP 状态非 2xx，`code` 是业务码、`message` 是可以直接转述给用户的中文原因。
- **金额**一律是**整数分**（`amountFen: 9900` = ¥99.00）；时间是 ISO 8601，门店业务时间按北京时间理解。
- **先调一次** `GET /api/agent/v1/whoami`：确认密钥可用，拿到 `staffAccess`（是否开通员工 Agent 接入）和限额。
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
| 密钥已关闭 | 401「个人密钥已关闭…」 | 请用户在小程序重新生成 |
| 90 天没用而休眠 | 401「…休眠…一键恢复」 | 请用户在小程序点「恢复」 |
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
| 我是谁 | `GET /api/agent/v1/whoami` | `userId`、`staffAccess`、说明书地址、限额 |
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

1. `GET /api/agent/v1/payments/:orderNo` → `state`（`pending | paid | expired | closed | refunded`）、`amountFen`、`expiresAt`、**`payUrl`**（https 链接，在微信里打开直达小程序付款页）、`qrUrl`（同一链接的二维码 PNG：`GET /api/agent/v1/payments/:orderNo/qr`，需带密钥下载）、`next`（下一步该做什么）。
2. 把 `payUrl` 发给用户（在电脑上就下载 `qrUrl` 的二维码给他扫）。说清金额和付款截止时间。
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
export AGIBAR_API_KEY=agib_u_xxx
node scripts/agibar.mjs GET /api/agent/v1/whoami
node scripts/agibar.mjs GET "/api/activities?storeId=BJ&size=10"
node scripts/agibar.mjs POST /api/activities/<id>/register '{"registrationAnswers":[],"expectedRegistrationId":null}'
node scripts/agibar.mjs wait <orderNo>
node scripts/agibar.mjs mcp          # 作为 MCP stdio server 运行
```

MCP 配置示例见仓库 README。
