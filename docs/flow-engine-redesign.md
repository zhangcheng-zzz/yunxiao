# 流程编排优化设计：规则驱动的缺陷自动处理引擎

> 状态：设计稿（待评审） · 2026-10-20
> 范围：d_yunxiao 插件的「编排」能力重构，从"客户端驱动的画布 DAG"升级为"宿主侧规则引擎 + 分级自治的缺陷自动修复闭环"。

---

## 0. 一句话方案

用户在编排页配置**处理规则**（触发范围 → 匹配条件 → 处理方式）；宿主侧引擎自动轮询拉取缺陷、按规则分级分流：

- **样式 / 缺字段类** → 全自动：智能体在绑定工作区改代码 → 自验 → 建分支提交推送 → 创建 MR → 评论回写缺陷 + 更新状态；
- **C 端后台逻辑类** → 先分析后确认：智能体只读诊断，产出根因与修复方案回写到缺陷，进入工作台「待确认」队列；用户点「批准」后**同一会话**继续实施修复并提交；
- **其余** → 仅通知负责人。

全程运行记录（步骤时间线、日志、结果、会话入口）持久化在数据文件中，浏览器关闭不影响执行。

---

## 1. 现状问题清单（基于代码核对）

现有实现：客户端画布 + 客户端执行引擎（`dist/client.js`），宿主只做白名单持久化（`dist/index.js`）。核心问题：

| # | 问题 | 代码位置 | 影响 |
| --- | --- | --- | --- |
| P1 | **执行引擎在浏览器里**：运行状态挂在 `createWorkspace` 的 `state` 上，面板关闭/刷新即丢；`stepFlowRun` 要求"当前选中编排 == 运行中编排"，切页签/切编排即停摆 | client.js:3400-3477, 3459-3460 | 自动化不可靠 |
| P2 | **自动触发只在面板打开时生效**：`maybeAutoRunFlows` 由工作台 `mount()` 里的 notifier 订阅驱动，面板不开就没有自动化 | client.js:3744-3761, 3794-3801 | "自动拉取缺陷"名不副实 |
| P3 | **`act-agent` 是"发了就算"**：`sendHandleImmediate` 调 `session.prompt` 后立即 resolve，下游节点（MR/检测/流水线/改状态）在智能体尚未开始工作时就执行；没有任何结果回传 | client.js:1758-1776, 3658-3679 | 修复闭环断裂，"已修复"不可信 |
| P4 | **宿主节点白名单漏了 `act-pipe`**：默认模板"缺陷自动修复流"保存后"运行流水线"节点被丢弃、连线断裂（已用 `normalizeFlow` 实测复现：n6 被丢、n5→n6→n7 两条边被丢） | index.js:99-103（对照 client.js:56-58） | 默认模板存一次即残废 |
| P5 | **一次只能跑一个运行**：`startFlowRun` 全局单飞；`maybeAutoRunFlows` 只取第一条新增缺陷 | client.js:3401, 3749 | 批量缺陷只处理 1 条 |
| P6 | **去重/幂等缺失**：`seenByScope` 在浏览器内存，刷新即丢，重启后同一缺陷可能重复触发 | client.js:533, 689-716 | 重复跑、重复修复 |
| P7 | **条件分支共享全局变量** `flowConditionResult`：两个条件节点并行时互相覆盖；"根因定位"恒为 true；`op-delay` 硬编码 2 秒 | client.js:3479-3495, 3547-3568, 3580-3586 | 分支语义不可靠 |
| P8 | **触发器只是装饰**：`trg-item.ev`、`trg-pipe`、`trg-cron` 在运行时无任何语义，真实触发只看 `autoRun` 开关 | client.js:3570-3654, 3754-3757 | 规则表达力与实现脱节 |
| P9 | **规则表达力弱**：条件只有 优先级 ≤/= 与恒真的"根因定位"；用户"处理规则"（关键词/模块/类型/自由文本）没有落点；没有分级自治 | client.js:41-43 | 满足不了"按规则处理"的诉求 |
| P10 | **没有提交闭环**：MR/检测/测试/部署全是人工检查点，没有真实的 分支→提交→推送→MR→回写 动作 | client.js:53-67 | "自动修复提交"缺失 |
| P11 | 运行日志每条 500 字上限、无会话链接、无结果结构 | index.js:141-164 | 排障困难 |

---

## 2. 关键调研结论：宿主侧完全具备"自动修复"能力

已核对本地 Harness 安装（`~/.dsh/profiles/node_modules/@deepseek-ai/*`，版本 0.1.5-rc.3）与 web profile 组合配置：

1. **宿主可以创建会话并驱动智能体**。`dsh-webhook` 的 `createWebhookSession` 给出了完整范式（其 `static inject = ["agents","agentDefaultModel","agentPresets","permissionPresets","sessionTitle","workspaceRegistry"]`）：
   - `ctx.workspaceRegistry.create(path)` → `ctx.agents.create({ sessionId, meta:{cwd, agentPreset}, agentOptions, setup })` → `workspace.attachSession(sessionId)` → `ctx.permissionPresets.set(session, preset)` → `ctx.sessionTitle.rename(session, title)` → `agent.followup(用户消息)`。web profile 中这些服务**全部已加载**（`agent / agent-default-model / agent-presets / permission / session-title / workspace`），只有 `webhookRuntime` 本身未加载——我们直接用底层服务即可。
2. **可以等待智能体跑完并拿结果**：`agent.whenIdle()`（`dsh-agent` runtime-types）在整轮活动静止后 resolve；`agent.session.deriveMessages()` 可读完整对话。结构化结果用 **agent 作用域工具**最稳：`setup` 里 `agentCtx.tools.register({ name: "yunxiao_report_result", ... })`，工具体内 `exec.concludeTurn()` 结束本轮——结果就是工具入参，无需解析自然语言。参考现有 `ctx.tools.register` 形态（index.js:1947-1990）。
3. **图片附件**：`ctx.attachments.saveImages([{data, mediaType, name}])` → `ImageAttachmentRef`，放入 `{type:"image", attachment: ref}` 内容块；宿主已有 base64 拉取能力（`defect.attachment.data`，index.js:1862-1868）。`attachment-local` 在 web profile 已加载。
4. **权限预设现值**：web profile 只有 `read-only / workspace-write / danger-full-access`，后两者 `approval: ask|never`。**无人值守的自动提交需要一个不弹审批的受限预设**（见 §8 安全）。预设表可在 profile `cordis.patch.yml` 覆盖 `dsh-permission-presets` 配置来新增（如 `auto-fix`）。
5. **插件不能直接 `import "@deepseek-ai/dsh-llm"`**（已实测从插件目录解析失败：`ERR_MODULE_NOT_FOUND`）。规避：用户消息手工构造即可，与 `createUserMessage` 等价——`Object.freeze({ id: randomUUID(), role: "user", content, source: { kind: "plugin", plugin: "dsh-yunxiao", form: "notice", summary } })`。
6. **会话句柄不要 dispose**（成功路径）：`AgentHandle.dispose()` 会注销智能体；webhook 范式是成功后由 ctx 接管生命周期，会话像普通会话一样留在工作区可打开。引擎只在取消/重载时清理。
7. **MR 创建接口**（官方文档核实）：`POST /oapi/v1/codeup/organizations/{organizationId}/repositories/{repositoryId}/changeRequests`，body 含 `sourceBranch / targetBranch / title / description`，`repositoryId` 可传代码库 ID 或 URL 编码全路径——与现有 `mergeCodeupMergeRequest`（index.js:1102-1113）同域，风格一致。

Sources: [CreateChangeRequest - 创建合并请求](https://help.aliyun.com/zh/yunxiao/developer-reference/createchangerequest-create-merge-request)、[ListChangeRequests](https://help.aliyun.com/zh/yunxiao/developer-reference/listchangerequests-query-the-list-of-merge-requests)、[MergeChangeRequest](https://help.aliyun.com/zh/yunxiao/developer-reference/mergechangerequest-merge-merge-request)

---

## 3. 目标架构

```
┌────────────────────────────── Harness Host（index.js，常驻） ─────────────────────────────┐
│                                                                                          │
│  规则轮询器（setInterval，ctx.effect 管理）                                                │
│    └─ 每 5 分钟：按启用规则调 defect.notification.scan（复用现有扫描，index.js:1756）          │
│        → 与持久化 ledger 去重 → 命中规则的缺陷入队（带 ruleId + defectId + 指纹）             │
│                                                                                          │
│  执行引擎（并发 N=2，单缺陷同时至多 1 个运行）                                                │
│    fetch → classify → agent → verify → submit → writeback                                  │
│                │(analyze-confirm)                                          │              │
│                └→ 回写分析结论 → await-confirm → [用户批准] → 同会话 followup ↗             │
│                                                                                          │
│  智能体编排：ctx.agents.create（webhook 同款）+ agent 作用域工具：                           │
│    yunxiao_defect_context / yunxiao_progress / yunxiao_report_result(concludeTurn)         │
│  云效回写：defect.comment.create / defect.status.update / defect.assignee.update（现有 RPC） │
│  提交动作：POST .../changeRequests（新增 api.createChangeRequest）                          │
│  持久化：createJsonStore 增加 policies + runs（原子写，复用现有）                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
              ▲ RPC（/api/d-yunxiao/rpc，现有通道）                    ▲
┌─────────────┴──────────────────────────────────────────────────────┴──────────────────────┐
│  Client（client.js，纯 UI）                                                                │
│  编排页重构：规则卡片列表 + 规则编辑抽屉（含"试运行匹配"）+ 运行记录表 + 运行详情抽屉            │
│  + 待确认 Inbox（批准/转人工）+ 顶部统计条；旧画布降级为只读流程图（Phase 2 移除）              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**核心决策**：执行模型从"自由 DAG"换成**固定流水线 + 规则参数**。理由：用户的真实心智是"输入处理规则"而非"搭画布"（本次需求原话），固定流水线让每一步都有确定语义（P7/P8/P9 一次性消解），引擎可持久化可恢复。画布保留价值仅在可视化，Phase 2 转为只读流程图。

---

## 4. 数据模型（追加到 `dsh-yunxiao.data.json`）

现有 `state.flows` 原样保留（向后兼容），新增 `policies` 与 `runs`：

```jsonc
{
  "policies": [{
    "id": "p1", "name": "样式/缺字段自动修复", "enabled": true, "order": 1,
    "scope": { "accountId": "a1", "projectId": "prj1" },        // 空 = 当前账号/项目
    "trigger": {
      "statusKinds": ["pending", "reopened"],                    // 复用 notificationStatusKind
      "assigneeId": "", "pollMinutes": 5, "backfill": false      // backfill=存量也处理
    },
    "match": {                                                    // AND 组合，可空
      "keywordsAny": ["样式","错位","字体","颜色","字段缺失","未显示","文案"],
      "keywordsNone": ["支付","结算"],
      "priorityCeiling": "P2",                                    // P0<P1<P2<P3
      "typeAny": ["缺陷"], "labelAny": []
    },
    "mode": "auto-submit",                                        // auto-submit | analyze-confirm | notify
    "instructions": "只改前端展示与字段映射层…",                    // 用户自由文本，注入提示词
    "agent": { "preset": "standard", "permissionPreset": "auto-fix", "model": "", "maxMinutes": 30 },
    "submit": {
      "baseBranch": "develop", "branchPattern": "fix/{serial}-{slug}",
      "push": true, "createMr": true, "mrTarget": "develop",
      "mrTitle": "fix({serial}): {subject}", "pipelineId": "",
      "verifyCommands": ["pnpm lint", "pnpm typecheck"],
      "maxChangedFiles": 30, "forbiddenPaths": ["**/payment/**", ".github/**"]
    },
    "writeback": {
      "comment": true, "statusOnSuccess": "已修复", "statusOnFailure": "",
      "statusOnConfirm": "处理中", "assigneeOnFailure": ""
    },
    "concurrency": 2,
    "createdAt": "", "updatedAt": ""
  }],
  "runs": [{                       // 独立顶层数组（现 runs 埋在 flow 里，改为统一台账）
    "id": "r1", "policyId": "p1", "policyName": "样式/缺字段自动修复",
    "defectId": "d1", "serial": "bug-1024", "subject": "订单页金额样式错位",
    "mode": "auto-submit", "status": "succeeded",
    // queued → fetching → classifying → agent-running → awaiting-confirm
    //        → submitting → writeback → succeeded | failed | skipped | canceled | interrupted
    "sessionId": "yunxiao-…", "fingerprint": "statusId:gmtModified",
    "steps": [{ "name": "classify", "status": "ok", "at": "", "detail": "关键词命中：样式" }],
    "result": {
      "outcome": "fixed",            // fixed | needs-human | not-a-bug | cannot-reproduce | blocked
      "summary": "…", "rootCause": "…", "plan": "…", "risk": "…",
      "branch": "fix/bug-1024-amount-style", "commits": ["abc123"],
      "changedFiles": ["src/pages/order/Amount.vue"], "mrUrl": "", "mrId": "",
      "verify": [{ "command": "pnpm lint", "ok": true }]
    },
    "error": "", "startedAt": "", "endedAt": "", "durationMs": 0
  }],
  "runsSeen": { "d1": { "runId": "r1", "at": "", "fingerprint": "…", "outcome": "fixed" } }  // 去重台账
}
```

宿主侧配套改动：

- `normalizeFlowNode` 的 cfg 只存扁平字符串（index.js:114-121），新结构走独立的 `normalizePolicy / normalizeRun` 白名单清洗（沿用同一套 `cleanText/clampInteger` 纪律），`runs` 全局上限 200 条、每 policy 最近 30 条展示。
- index.js:99-103 `FLOW_NODE_TYPES` **立即补上 `"act-pipe"`**（P4 一行修复），并在测试里锁住「默认模板保存不丢节点」。

---

## 5. 执行引擎（宿主）

### 5.1 轮询与去重

- 轮询器 `setInterval(min(pollMinutes))`，挂在 `ctx.effect()` 下随插件卸载清理；每轮对每个启用 policy 调 `defect.notification.scan`（现状按目标状态拉 100 条，index.js:1756-1787），按 `trigger.assigneeId` 过滤。
- 去重：`runsSeen[defectId]`（含 `fingerprint = statusId + gmtModified`）。同一缺陷：已有活跃运行 → 跳过；指纹未变 → 跳过；`backfill=false` 时首轮快照只登记不触发（等价现有 client.js:701-703 语义，但持久化在宿主）。
- 入队：`{ policyId, defectId }`，全局并发 `min(各 policy.concurrency, 2)` 起步；同一 defect 活跃运行唯一。

### 5.2 阶段语义

| 阶段 | 行为 | 失败处理 |
| --- | --- | --- |
| `fetch` | `defect.get` + 附件图片（复用 `getAttachmentData`），图片经 `ctx.attachments.saveImages` 转 ref（≤8 张，单张失败跳过——同现有 buildHandlePayload 语义，client.js:1715-1730） | failed |
| `classify` | 1) 纯规则匹配 `match`（关键词/优先级/类型/标签）；2)（Phase 2，可选）LLM 分诊：短只读会话 + `yunxiao_classify` 工具输出 `{category, confidence}`；置信度低于阈值或无法判断 → 一律落 `analyze-confirm`（安全默认） | 未命中任何 policy → skipped，记录原因 |
| `agent` | 见 §5.3；`analyze-confirm` 阶段用 `read-only` 预设只出诊断；`auto-submit` 直接进入实施 | 超时（maxMinutes）→ needs-human + 通知 |
| `verify` | 包含在智能体指令内（跑 `verifyCommands` 并把结果写进 `yunxiao_report_result.verify`）；任一失败 → 不允许 submit 阶段创建 MR | needs-human |
| `submit` | 宿主动作：校验分支名/`forbiddenPaths`/`maxChangedFiles` → `api.createChangeRequest`（§2.7）→（可选）`pipeline.run.create` + `pipeline.run.get` 轮询结果（现成 RPC，index.js:1006,1023） | failed；已推送的分支保留，注释写清 |
| `writeback` | 评论（markdown 模板：结果/根因/改动文件/分支/MR/验证/会话入口）→ 状态流转（先 `defect.statuses` 校验目标状态存在，同 client.js:3614-3616 的做法）→ 失败时改负责人 → 系统通知 | 降级：评论失败不阻塞运行结束，记 warn |

### 5.3 智能体编排（关键代码形态）

```js
// index.js 新增 createFlowEngine(ctx2, { store, api, notify })；ctx2 为注入了可选服务的子上下文：
ctx.inject(["agents", "agentPresets", "permissionPresets", "sessionTitle",
            "workspaceRegistry", "attachments"], (svc) => { engine.start(svc); });
// 任一服务缺失（如 desktop profile 组成不同）→ 引擎不启动，RPC 返回"引擎不可用"，其余功能不受影响。

async function runAgentStage(run, policy, defect, imageRefs, mode) {
  const workspace = svc.workspaceRegistry.get(binding.id)
    ?? await svc.workspaceRegistry.resolveByPath(binding.path);        // 与设置页绑定同一来源
  const preset = await svc.agentPresets.resolve(policy.agent.preset || undefined);
  const sessionId = "yunxiao-" + run.id;                                // SessionId 运行时即字符串
  let report = null;
  const handle = await svc.agents.create({
    sessionId,
    meta: { cwd: workspace.path, agentPreset: preset.id },
    agentOptions: policy.agent.model ? JSON.parse(policy.agent.model) : undefined,
    setup: async (agentCtx) => {
      await svc.agentPresets.mount(agentCtx, preset.id);
      agentCtx.tools.register({ name: "yunxiao_defect_context",  /* 只读，返回缺陷全量 JSON */ ... });
      agentCtx.tools.register({ name: "yunxiao_progress",        /* 追加步骤日志到 run */ ... });
      agentCtx.tools.register({ name: "yunxiao_report_result",   /* 见 §6 提示词契约 */
        execute: async (args, exec) => { report = args; exec.concludeTurn(); return { ok: true }; } });
    }
  });
  await workspace.attachSession(sessionId);
  svc.permissionPresets.set(handle.agent.session,
    mode === "analyze-confirm" ? "read-only" : policy.agent.permissionPreset);
  svc.sessionTitle.rename(handle.agent.session, `[云效] ${defect.serialNumber} ${defect.subject}`);
  handle.agent.followup({
    id: randomUUID(), role: "user",                                     // 手工构造 = createUserMessage
    content: [...imageRefs.map((ref) => ({ type: "image", attachment: ref })),
              { type: "text", text: buildAgentPrompt(policy, defect, mode) }],
    source: { kind: "plugin", plugin: "dsh-yunxiao", form: "notice",
              summary: `云效缺陷 ${defect.serialNumber} 自动处理` }
  });
  await raceWithTimeout(handle.agent.whenIdle(), policy.agent.maxMinutes * 60_000);
  return { report, sessionId };   // report 为空时从 handle.agent.session.deriveMessages() 取最后一条 assistant 兜底
}
```

要点：成功后**不 dispose** 句柄（会话留在工作区，用户可从运行详情"打开会话"——客户端 `services.sessions.open(sessionId)`，同现有 `sendHandleImmediate` 的用法）；取消走 `agent.cancel("user")` + `flows.run.cancel` RPC；插件重载时 `ctx.effect` 清理把活跃运行标成 `interrupted`（Phase 2 可用 `agents.resume` 续跑）。

---

## 6. 提示词契约（用户"处理规则"的注入点）

```
你在处理云效缺陷。只允许改动与本缺陷直接相关的文件。
## 缺陷
编号 {serial}｜优先级 {priority}｜状态 {status}
标题：{subject}
描述：{description}
图片：见随附附件
## 处理规则（来自编排规则「{policyName}」，最高优先级遵守）
{policy.instructions}          ← 用户自由文本规则，原样注入
## 模式要求
{auto-submit: 在仓库内新建分支 {branchPattern}（从 {baseBranch} 切出），实施修复；
 逐条运行验证命令并在结果里如实回报；禁止 push --force、禁止改动 {forbiddenPaths}；
 改动文件数超过 {maxChangedFiles} 视为超范围，停下报告 needs-human。}
{analyze-confirm: 本次只读诊断，禁止任何文件修改。产出根因、修复方案、风险、涉及文件清单。}
## 收尾（必须）
最后必须调用 yunxiao_report_result 汇报：outcome(fixed|needs-human|not-a-bug|cannot-reproduce|blocked)、
summary、rootCause、plan、risk、branch、changedFiles、verify[{command,ok,output}]。
```

`yunxiao_report_result` 的 `parameters` 用 JSON Schema 固定枚举，`output.schema` 为 `{ ok: true }`——结构化结果天然可入库、可展示。

---

## 7. RPC 增量（POST /api/d-yunxiao/rpc）

| method | 说明 |
| --- | --- |
| `policies.list / policies.save / policies.delete / policies.reorder` | 规则 CRUD；`policies.save` 内做状态名/预设名校验 |
| `policies.test` | 试运行匹配：对最近 N=50 条缺陷跑 `match`，返回命中列表与各自将采取的 mode |
| `runs.list / runs.get` | 台账查询（按 policy/状态/时间过滤） |
| `runs.cancel / runs.retry` | 取消（agent.cancel + 状态置 canceled）/ 重试（同缺陷新运行，绕过去重） |
| `runs.confirm` | 待确认队列裁决：`approve`（提升权限预设为 `workspace-write` 级 → 同会话 `followup("已批准，按方案实施并提交")` → 继续 submit/writeback）、`handoff`（改负责人 + 通知）、`reject` |
| `engine.status / engine.scanNow` | 轮询器状态、手动立即扫一轮 |

现有 `flows.*` 四个方法保留（index.js:1933-1940），旧数据仍可查看。

---

## 8. 安全与护栏

1. **权限分级**：`analyze-confirm` 固定 `read-only`；`auto-submit` 默认要求 profile 里新增无审批受限预设（profile `cordis.patch.yml` 覆盖 `dsh-permission-presets`：`auto-fix: { sandbox: workspace-write, approval: never }`）。未配置时引擎回退 `workspace-write` 并在规则编辑页提示"无人值守可能在审批处停滞（超时转人工）"。
2. **改动护栏**：分支必须从基分支切出、禁 force push、禁改动 `forbiddenPaths`、超 `maxChangedFiles` 判定越界（needs-human）；验证命令失败不建 MR。
3. **不自动合并**：MR 一律人工合入（与现有"检测无阻塞才可合入"的人工边界一致，README 中 Codeup MR 合入仍是显式操作）。
4. **幂等**：去重台账（§4 `runsSeen`）+ 指纹 + 冷却（同一缺陷 30 分钟内不重复运行，可配置）；重试必须显式。
5. **令牌**：沿用现状——宿主持有、不下发浏览器（docs/README.md 已有安全章节）。

---

## 9. 客户端 UI（编排页重构）

保持现有设计语言（统计条 `dyx-statstrip` + 方格卡片 `dyx-tile-grid` + 抽屉 `dyx-modal`）：

```
编排
├─ 统计条：启用规则｜运行中｜今日处理｜待确认(角标)｜最近失败
├─ 子页签：[规则] [运行记录] [待确认]
│
├─ 规则：卡片（名称、模式徽章、匹配摘要、最近运行、启用开关、试运行、编辑、删除；拖拽排序）
│   └─ 编辑抽屉：§4 policy 全字段，分 5 组（触发/匹配/处理方式/提交与回写/安全），
│      底部 [试运行匹配] → 弹出命中预览列表（编号、标题、将采取的模式）
│   └─ 首次进入：两个一键模板（对应 §10 规则 A/B）+ 空白
│
├─ 运行记录：表格（状态徽章、缺陷编号、规则、模式、耗时、MR 链接、会话入口），状态筛选
│   └─ 详情抽屉：步骤时间线（fetch→classify→agent→…，对齐现有节点状态配色）
│      + 结果卡（摘要/根因/改动文件/分支/MR/验证结果）+ [打开会话] [重试] [取消]
│
├─ 待确认：分析结论卡片（根因/方案/风险/涉及文件 + [打开会话]）
│   └─ 操作：✓ 批准并修复｜✍ 转人工｜✕ 忽略（= runs.confirm 三分支）
│
└─ 旧画布：降级为"旧版画布（只读）"折叠入口；Phase 2 移除，flows 数据转只读展示
```

客户端不再承担任何执行职责：删除 `startFlowRun/stepFlowRun/executeFlowNode/runFlowAgent/maybeAutoRunFlows`（client.js:3400-3761）及 `flows.run.save` 的客户端驱动调用；`ntf-msg` 通知、`ntf-comment` 评论改由 `writeback` 阶段承接。

---

## 10. 规则样例（对应本次需求的两类缺陷）

**规则 A「样式 / 缺字段 → 自动修复提交」**
- 匹配：keywordsAny `["样式","错位","字体","颜色","间距","字段缺失","缺少字段","未显示","不展示","文案"]`；keywordsNone `["支付","结算","退款"]`；priorityCeiling `P2`
- 模式 `auto-submit`；instructions：*"只改前端展示与字段映射层，不改接口契约；缺失字段优先从现有接口返回/DTO 中取，取不到则按 needs-human 报告；样式遵循项目 UI 规范；修复说明附修改前后对照。"*
- 提交：base `develop`，branch `fix/{serial}-{slug}`，push+MR；verify `["pnpm lint","pnpm typecheck"]`
- 回写：评论 + 状态 → 「已修复」（工作流中不存在该状态名时保存前校验会拦住，改为选实际目标状态）

**规则 B「C 端后台逻辑 → 分析后确认」**
- 匹配：keywordsAny `["接口","数据不对","报错","500","逻辑","状态流转","计算","超时"]`；typeAny `["缺陷"]`
- 模式 `analyze-confirm`（read-only）；回写：分析结论评论 + 状态 → 「处理中」
- 批准后：同会话 followup，权限切 `auto-fix` 预设，实施修复并走 A 同款提交与回写

**规则 C（兜底）「其余 → 仅通知」**：match 为空，mode `notify`，评论可选。

匹配顺序 = 规则 order（首个命中生效），UI 拖拽排序。

---

## 11. 分阶段落地

| 阶段 | 内容 | 涉及 |
| --- | --- | --- |
| **P0 立即修（半天）** | ① index.js:99-103 白名单补 `act-pipe` + 回归测试锁默认模板；② `flowConditionResult` 改为按节点存结果（消除并行覆盖）；③ `maybeAutoRunFlows` 遍历全部新增缺陷并排队而非只取 first；④ op-delay 至少按配置分钟数等待（前端可见倒计时） | index.js:99-103；client.js:3479-3568, 3744-3761, 3580-3586 |
| **P1 引擎与闭环（主体，3-5 天）** | §4 数据模型 + §5 宿主引擎（classify 纯规则版）+ §6 提示词契约与三工具 + §7 RPC + MR 创建 API + §9 UI（规则/运行/待确认）+ 客户端执行引擎下线；`analyze-confirm` 全流程、`auto-submit` 到"提交+MR" | index.js、client.js |
| **P2 增强** | LLM 分诊（置信阈值）、`agents.resume` 断点续跑、MR 后流水线等待与结果回写、轮询器指标、旧画布移除 | 同上 |

依赖确认（见 §13）不阻塞 P0/P1 主体。

## 12. 测试计划（沿用 node --test + 源码断言 + preview 截图）

- 宿主单测：`normalizePolicy/normalizeRun` 白名单清洗；规则匹配器（关键词/优先级/短路顺序）；引擎状态机（mock `ctx.agents.create` 返回假 agent：`followup` 记录 prompt、`whenIdle` 可控 resolve、工具注册表捕获 `yunxiao_report_result` 入参）覆盖 auto-submit 成功/失败、analyze-confirm→批准→续跑、超时、取消、去重、并发上限；`createChangeRequest` 契约（fetch mock，参照现有 test/plugin.test.js:1240 风格）；`act-pipe` 白名单回归。
- 客户端源码断言：规则编辑抽屉分组齐全、`runs.confirm` 三分支、旧执行函数确已删除（参照现有 test/plugin.test.js:1096 的断言风格）。
- preview.html：mock policies/runs/inbox 数据，截图验证三张页面 + 批准流；`node --check` 两份 dist + `npm test` + `npm pack --dry-run`。

## 13. 待确认问题

1. **画布去留**：建议降级只读 → Phase 2 删除（本设计的核心取舍）；若必须保留可视化编辑，可把画布改为"规则步骤的图形化编辑器"（受限 DAG：只允许固定槽位），成本另计。
2. **自动提交预设**：接受新增 `auto-fix`（workspace-write + 无审批）还是直接用 `danger-full-access`？前者更小爆炸半径，推荐前者，但需要用户在 profile patch 里加一次配置。
3. **回写状态名**：各项目工作流不同（「已修复」未必存在）——规则保存时校验，编辑器只允许从 `defect.statusOptions` 里选，是否接受？
4. **存量缺陷**：`backfill` 默认关（只处理规则启用后的新增），首轮存量是否要提供一次性"全量试运行"？
5. **Desktop profile**：web 已核实具备全部所需服务；desktop 组合若不同，`ctx.inject` 可选注入可兜底，但需在桌面环境实测一次。
6. **多账号/多项目**：规则绑定 账号+项目（scope 为空跟随当前选择），同一缺陷只被 order 最靠前的命中规则处理——是否符合预期？
