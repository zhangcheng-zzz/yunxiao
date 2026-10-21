import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const name = "dsh-yunxiao";
const inject = ["tools"];

const DEFAULTS = Object.freeze({
  dataFile: "./dsh-yunxiao.data.json",
  apiBaseUrl: "https://openapi-rdc.aliyuncs.com",
  timeoutMs: 45_000,
  cacheMaxItems: 100
});

class YunxiaoError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "YunxiaoError";
    this.status = status;
  }
}

function cleanText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeDefectNotification(value) {
  const source = value && typeof value === "object" ? value : {};
  const targetMap = new Map();
  for (const item of Array.isArray(source.targetStatuses) ? source.targetStatuses : []) {
    const status = { id: cleanText(item?.id, 128), name: cleanText(item?.name, 100) };
    const kind = notificationStatusKind(status.name);
    if (status.id && kind && !targetMap.has(kind)) targetMap.set(kind, status);
  }
  const targetStatuses = [targetMap.get("pending"), targetMap.get("reopened")].filter(Boolean);
  return {
    enabled: Boolean(source.enabled),
    assignedToId: cleanText(source.assignedToId, 128),
    assignedToName: cleanText(source.assignedToName, 255),
    intervalMinutes: clampInteger(source.intervalMinutes, 5, 1, 1440),
    targetStatuses
  };
}

function isNotifiableDefectStatus(value) {
  const normalized = cleanText(value, 100).replace(/\s+/g, "").toUpperCase();
  return ["待确认", "未确认", "再次打开", "重新打开", "REOPEN", "REOPENED"].includes(normalized);
}

function notificationStatusKind(value) {
  const normalized = cleanText(value, 100).replace(/\s+/g, "").toUpperCase();
  if (["待确认", "未确认"].includes(normalized)) return "pending";
  if (["再次打开", "重新打开", "REOPEN", "REOPENED"].includes(normalized)) return "reopened";
  return "";
}

const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function mediaTypeFromSuffix(value) {
  const suffix = cleanText(value, 100).replace(/^\./, "").toLowerCase();
  if (suffix === "png") return "image/png";
  if (suffix === "jpg" || suffix === "jpeg") return "image/jpeg";
  if (suffix === "gif") return "image/gif";
  if (suffix === "webp") return "image/webp";
  return "";
}

function normalizeWorkspaceBinding(value) {
  const source = value && typeof value === "object" ? value : null;
  if (!source) return null;
  const id = cleanText(source.id, 100);
  if (!id) return null;
  return { id, title: cleanText(source.title, 255), path: cleanText(source.path, 2000) };
}

function emptyState() {
  return { version: 1, selectedAccountId: "", accounts: [], cache: {}, system: null, flows: [], policies: [], runs: [], runsSeen: {} };
}

function normalizeSystemInfo(value) {
  const source = value && typeof value === "object" ? value : null;
  if (!source) return null;
  const platform = cleanText(source.platform, 32);
  const channel = cleanText(source.channel, 32);
  if (!platform || !channel) return null;
  return { platform, channel, detectedAt: cleanText(source.detectedAt, 40) };
}

// —— 编排流（画布定义 + 运行记录）的持久化结构 ————————————————————————————
// 流程定义由客户端画布产出；宿主只负责白名单式清洗后存入数据文件，
// 保证文件始终是可直接查看和备份的 JSON。
const FLOW_NODE_TYPES = new Set([
  "trg-item", "trg-pipe", "trg-cron", "op-cond", "op-delay",
  "act-agent", "act-item", "act-mr", "act-pipe", "act-scan", "act-test", "act-deploy",
  "ntf-msg", "ntf-comment"
]);
const FLOW_NODE_LIMIT = 64;
const FLOW_EDGE_LIMIT = 128;
const FLOW_RUNS_LIMIT = 30;
const FLOW_LOG_LIMIT = 400;

function normalizeFlowNode(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = cleanText(source.id, 64);
  const type = cleanText(source.tp, 40);
  if (!id || !FLOW_NODE_TYPES.has(type)) return null;
  const cfg = {};
  if (source.cfg && typeof source.cfg === "object" && !Array.isArray(source.cfg)) {
    for (const [key, item] of Object.entries(source.cfg).slice(0, 12)) {
      const cleanKey = cleanText(key, 60);
      // 只保留原始值：对象/数组一律丢弃，避免把垃圾结构存进数据文件。
      if (!cleanKey || item === null || item === undefined || typeof item === "object") continue;
      cfg[cleanKey] = cleanText(item, 2000);
    }
  }
  return {
    id,
    tp: type,
    name: cleanText(source.name, 200) || "节点",
    x: clampInteger(source.x, 0, 0, 20_000),
    y: clampInteger(source.y, 0, 0, 20_000),
    cfg
  };
}

function normalizeFlowEdge(value) {
  const source = value && typeof value === "object" ? value : {};
  const from = cleanText(source.f, 64);
  const to = cleanText(source.t, 64);
  if (!from || !to) return null;
  return { f: from, t: to, label: cleanText(source.label, 12) };
}

function normalizeFlowRun(value) {
  const source = value && typeof value === "object" ? value : {};
  const nodes = {};
  if (source.nodes && typeof source.nodes === "object" && !Array.isArray(source.nodes)) {
    for (const [key, item] of Object.entries(source.nodes).slice(0, FLOW_NODE_LIMIT)) {
      const status = cleanText(item, 20);
      if (cleanText(key, 64) && status) nodes[cleanText(key, 64)] = status;
    }
  }
  return {
    id: cleanText(source.id, 64) || randomUUID(),
    status: cleanText(source.status, 20) || "进行中",
    trg: cleanText(source.trg, 200),
    startedAt: cleanText(source.startedAt, 40),
    endedAt: cleanText(source.endedAt, 40),
    durationMs: clampInteger(source.durationMs, 0, 0, 2_147_483_647),
    nodes,
    log: (Array.isArray(source.log) ? source.log : []).slice(0, FLOW_LOG_LIMIT).map((entry) => ({
      t: cleanText(entry?.t, 40),
      m: cleanText(entry?.m, 500),
      c: cleanText(entry?.c, 20)
    }))
  };
}

function normalizeFlow(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = cleanText(source.id, 64);
  const name = cleanText(source.name, 200);
  if (!id || !name) return null;
  const nodeIds = new Set();
  const nodes = (Array.isArray(source.nodes) ? source.nodes : [])
    .map(normalizeFlowNode)
    .filter((node) => {
      if (!node || nodeIds.has(node.id)) return false;
      nodeIds.add(node.id);
      return true;
    })
    .slice(0, FLOW_NODE_LIMIT);
  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(source.edges) ? source.edges : [])
    .map(normalizeFlowEdge)
    .filter((edge) => edge && edge.f !== edge.t && nodeSet.has(edge.f) && nodeSet.has(edge.t))
    .slice(0, FLOW_EDGE_LIMIT);
  return {
    id,
    name,
    on: Boolean(source.on),
    autoRun: Boolean(source.autoRun),
    trg: cleanText(source.trg, 200),
    nodes,
    edges,
    runs: (Array.isArray(source.runs) ? source.runs : []).map(normalizeFlowRun).slice(0, FLOW_RUNS_LIMIT),
    createdAt: cleanText(source.createdAt, 40),
    updatedAt: cleanText(source.updatedAt, 40)
  };
}

function normalizeFlows(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const item of value) {
    const flow = normalizeFlow(item);
    if (flow && !byId.has(flow.id)) byId.set(flow.id, flow);
  }
  return [...byId.values()];
}

// —— 规则引擎：处理规则（policy）与运行台账（run）———————————————————————
// 规则由客户端表单产出，宿主白名单清洗后持久化；运行台账只由宿主引擎写入。
const POLICY_MODES = new Set(["auto-submit", "analyze-confirm", "notify"]);
const POLICY_STATUS_KINDS = new Set(["pending", "reopened"]);
const POLICY_LIMIT = 50;
const RUN_LIMIT = 200;
const RUN_STEP_LIMIT = 40;
const RUN_LOG_LIMIT = 400;
const RUN_STATUSES = new Set([
  "queued", "fetching", "classifying", "agent-running", "awaiting-confirm", "submitting", "writeback",
  "succeeded", "needs-human", "failed", "skipped", "canceled", "interrupted"
]);
const RUN_ACTIVE_STATUSES = new Set(["queued", "fetching", "classifying", "agent-running", "awaiting-confirm", "submitting", "writeback"]);
const REPORT_OUTCOMES = new Set(["fixed", "analyzed", "needs-human", "not-a-bug", "cannot-reproduce", "blocked"]);

function cleanStringList(value, maxItems, maxLength) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，;；]/) : [];
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const text = cleanText(item, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function booleanOr(value, fallback) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function normalizePolicy(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = cleanText(source.id, 64);
  const name = cleanText(source.name, 200);
  if (!id || !name) return null;
  const pick = (key) => (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) ? source[key] : {});
  const scope = pick("scope");
  const trigger = pick("trigger");
  const match = pick("match");
  const agent = pick("agent");
  const submit = pick("submit");
  const writeback = pick("writeback");
  const mode = cleanText(source.mode, 30);
  const statusKinds = cleanStringList(trigger.statusKinds, 4, 20).filter((kind) => POLICY_STATUS_KINDS.has(kind));
  const priorityCeiling = cleanText(match.priorityCeiling, 4).toUpperCase();
  return {
    id,
    name,
    enabled: Boolean(source.enabled),
    order: clampInteger(source.order, 0, 0, 10_000),
    scope: { accountId: cleanText(scope.accountId, 100), projectId: cleanText(scope.projectId, 128) },
    trigger: {
      statusKinds: statusKinds.length ? statusKinds : ["pending", "reopened"],
      assigneeId: cleanText(trigger.assigneeId, 128),
      pollMinutes: clampInteger(trigger.pollMinutes, 5, 1, 1440),
      backfill: Boolean(trigger.backfill)
    },
    match: {
      keywordsAny: cleanStringList(match.keywordsAny, 50, 100),
      keywordsNone: cleanStringList(match.keywordsNone, 50, 100),
      priorityCeiling: /^P[0-3]$/.test(priorityCeiling) ? priorityCeiling : "",
      typeAny: cleanStringList(match.typeAny, 20, 100),
      labelAny: cleanStringList(match.labelAny, 50, 100)
    },
    mode: POLICY_MODES.has(mode) ? mode : "analyze-confirm",
    instructions: cleanTextPreserve(source.instructions, 8000).trim(),
    agent: {
      preset: cleanText(agent.preset, 100),
      permissionPreset: cleanText(agent.permissionPreset, 100),
      model: cleanText(agent.model, 200),
      maxMinutes: clampInteger(agent.maxMinutes, 30, 1, 720)
    },
    submit: {
      repoId: cleanText(submit.repoId, 64),
      repoPath: cleanText(submit.repoPath, 500),
      baseBranch: cleanText(submit.baseBranch, 255),
      branchPattern: cleanText(submit.branchPattern, 255) || "fix/{serial}-{slug}",
      push: booleanOr(submit.push, true),
      createMr: booleanOr(submit.createMr, true),
      mrTarget: cleanText(submit.mrTarget, 255),
      mrTitle: cleanText(submit.mrTitle, 256) || "fix({serial}): {subject}",
      pipelineId: cleanText(submit.pipelineId, 128),
      verifyCommands: cleanStringList(submit.verifyCommands, 10, 500),
      maxChangedFiles: clampInteger(submit.maxChangedFiles, 30, 1, 1000),
      forbiddenPaths: cleanStringList(submit.forbiddenPaths, 50, 300)
    },
    writeback: {
      comment: booleanOr(writeback.comment, true),
      statusOnSuccess: cleanText(writeback.statusOnSuccess, 100),
      statusOnFailure: cleanText(writeback.statusOnFailure, 100),
      statusOnConfirm: cleanText(writeback.statusOnConfirm, 100),
      assigneeOnFailure: cleanText(writeback.assigneeOnFailure, 128)
    },
    concurrency: clampInteger(source.concurrency, 1, 1, 5),
    lastScanAt: cleanText(source.lastScanAt, 40),
    createdAt: cleanText(source.createdAt, 40),
    updatedAt: cleanText(source.updatedAt, 40)
  };
}

function normalizePolicies(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const item of value) {
    const policy = normalizePolicy(item);
    if (policy && !byId.has(policy.id)) byId.set(policy.id, policy);
    if (byId.size >= POLICY_LIMIT) break;
  }
  return [...byId.values()].sort((left, right) => left.order - right.order);
}

function normalizeRunResult(value) {
  const source = value && typeof value === "object" ? value : {};
  const outcome = cleanText(source.outcome, 30);
  return {
    outcome: REPORT_OUTCOMES.has(outcome) ? outcome : "",
    summary: cleanTextPreserve(source.summary, 4000).trim(),
    rootCause: cleanTextPreserve(source.rootCause, 4000).trim(),
    plan: cleanTextPreserve(source.plan, 4000).trim(),
    risk: cleanTextPreserve(source.risk, 2000).trim(),
    branch: cleanText(source.branch, 255),
    commits: cleanStringList(source.commits, 20, 80),
    changedFiles: cleanStringList(source.changedFiles, 200, 500),
    mrUrl: cleanText(source.mrUrl, 2000),
    mrId: cleanText(source.mrId, 64),
    pipelineRunId: cleanText(source.pipelineRunId, 128),
    verify: (Array.isArray(source.verify) ? source.verify : []).slice(0, 20).map((entry) => ({
      command: cleanText(entry?.command, 500),
      ok: Boolean(entry?.ok),
      output: cleanTextPreserve(entry?.output, 2000).trim()
    })).filter((entry) => entry.command)
  };
}

function normalizeRun(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = cleanText(source.id, 64);
  if (!id) return null;
  const status = cleanText(source.status, 30);
  return {
    id,
    policyId: cleanText(source.policyId, 64),
    policyName: cleanText(source.policyName, 200),
    accountId: cleanText(source.accountId, 100),
    projectId: cleanText(source.projectId, 128),
    workspaceId: cleanText(source.workspaceId, 100),
    defectId: cleanText(source.defectId, 128),
    serial: cleanText(source.serial, 128),
    subject: cleanText(source.subject, 1000),
    mode: POLICY_MODES.has(cleanText(source.mode, 30)) ? cleanText(source.mode, 30) : "analyze-confirm",
    // 宿主重启后仍在进行中的运行无法恢复，读档时标记为“已中断”。
    status: RUN_STATUSES.has(status) ? (RUN_ACTIVE_STATUSES.has(status) ? "interrupted" : status) : "failed",
    sessionId: cleanText(source.sessionId, 128),
    fingerprint: cleanText(source.fingerprint, 200),
    trigger: cleanText(source.trigger, 60) || "scan",
    steps: (Array.isArray(source.steps) ? source.steps : []).slice(0, RUN_STEP_LIMIT).map((step) => ({
      name: cleanText(step?.name, 40),
      status: cleanText(step?.status, 20),
      at: cleanText(step?.at, 40),
      detail: cleanTextPreserve(step?.detail, 2000).trim()
    })).filter((step) => step.name),
    log: (Array.isArray(source.log) ? source.log : []).slice(-RUN_LOG_LIMIT).map((entry) => ({
      t: cleanText(entry?.t, 40),
      m: cleanTextPreserve(entry?.m, 2000).trim(),
      c: cleanText(entry?.c, 20)
    })),
    result: normalizeRunResult(source.result),
    error: cleanTextPreserve(source.error, 2000).trim(),
    startedAt: cleanText(source.startedAt, 40),
    endedAt: cleanText(source.endedAt, 40),
    durationMs: clampInteger(source.durationMs, 0, 0, 2_147_483_647)
  };
}

function normalizeRuns(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const item of value) {
    const run = normalizeRun(item);
    if (run && !byId.has(run.id)) byId.set(run.id, run);
    if (byId.size >= RUN_LIMIT) break;
  }
  return [...byId.values()];
}

function normalizeRunsSeen(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [key, item] of Object.entries(source).slice(0, 5000)) {
    const defectId = cleanText(key, 128);
    if (!defectId || !item || typeof item !== "object") continue;
    result[defectId] = {
      runId: cleanText(item.runId, 64),
      policyId: cleanText(item.policyId, 64),
      at: cleanText(item.at, 40),
      fingerprint: cleanText(item.fingerprint, 200),
      outcome: cleanText(item.outcome, 30)
    };
  }
  return result;
}

function normalizeState(value) {
  if (!value || typeof value !== "object") return emptyState();
  return {
    version: 1,
    selectedAccountId: cleanText(value.selectedAccountId, 100),
    accounts: Array.isArray(value.accounts) ? value.accounts.filter((item) => item && typeof item === "object") : [],
    cache: value.cache && typeof value.cache === "object" ? value.cache : {},
    system: normalizeSystemInfo(value.system),
    flows: normalizeFlows(value.flows),
    policies: normalizePolicies(value.policies),
    runs: normalizeRuns(value.runs),
    runsSeen: normalizeRunsSeen(value.runsSeen)
  };
}

function createJsonStore(fileName, cacheMaxItems) {
  const absolutePath = path.resolve(process.cwd(), fileName);
  let statePromise;
  let mutationQueue = Promise.resolve();

  async function load() {
    if (!statePromise) {
      statePromise = readFile(absolutePath, "utf8")
        .then((text) => normalizeState(JSON.parse(text)))
        .catch((error) => {
          if (error && error.code === "ENOENT") return emptyState();
          throw new Error(`读取云效数据文件失败：${error instanceof Error ? error.message : String(error)}`);
        });
    }
    return statePromise;
  }

  async function persist(state) {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, absolutePath);
  }

  async function update(mutator) {
    const operation = mutationQueue.then(async () => {
      const state = await load();
      const result = await mutator(state);
      await persist(state);
      return result;
    });
    mutationQueue = operation.catch(() => undefined);
    return operation;
  }

  async function getAccount(accountId) {
    const state = await load();
    const wanted = cleanText(accountId, 100) || state.selectedAccountId;
    const account = state.accounts.find((item) => item.id === wanted);
    if (!account) throw new YunxiaoError("请先配置并选择云效账号", 422);
    if (!cleanText(account.organizationId, 128) || !cleanText(account.token)) {
      throw new YunxiaoError("当前账号缺少组织 ID 或个人访问令牌", 422);
    }
    return account;
  }

  function publicAccount(account) {
    const projectId = cleanText(account.selectedProject?.id, 128);
    const projectSettings = account.projectSettings && typeof account.projectSettings === "object"
      ? account.projectSettings[projectId]
      : null;
    return {
      id: account.id,
      name: account.name,
      organizationId: account.organizationId,
      remark: account.remark || "",
      hasToken: Boolean(account.token),
      selectedProject: account.selectedProject || null,
      workspace: normalizeWorkspaceBinding(projectSettings?.workspace),
      defectNotification: normalizeDefectNotification(projectSettings?.defectNotification),
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  }

  async function publicState() {
    const state = await load();
    return {
      selectedAccountId: state.selectedAccountId,
      accounts: state.accounts.map(publicAccount),
      dataFile: absolutePath
    };
  }

  async function saveAccount(input) {
    return update((state) => {
      const id = cleanText(input.id, 100);
      const now = new Date().toISOString();
      let account = id ? state.accounts.find((item) => item.id === id) : null;
      const nameValue = cleanText(input.name, 255);
      const organizationId = cleanText(input.organizationId, 128);
      const token = cleanText(input.token);
      if (!nameValue || !organizationId) throw new YunxiaoError("账号名称和组织 ID 不能为空", 422);
      if (!account && !token) throw new YunxiaoError("新增账号时必须填写个人访问令牌", 422);
      if (state.accounts.some((item) => item.id !== id && item.name === nameValue)) {
        throw new YunxiaoError("已存在同名账号", 409);
      }
      if (account) {
        const organizationChanged = account.organizationId !== organizationId;
        account.name = nameValue;
        account.organizationId = organizationId;
        account.remark = cleanText(input.remark, 2000);
        if (token) account.token = token;
        if (organizationChanged) account.selectedProject = null;
        account.updatedAt = now;
      } else {
        account = {
          id: randomUUID(),
          name: nameValue,
          organizationId,
          token,
          remark: cleanText(input.remark, 2000),
          selectedProject: null,
          createdAt: now,
          updatedAt: now
        };
        state.accounts.unshift(account);
      }
      state.selectedAccountId = account.id;
      return publicAccount(account);
    });
  }

  async function selectAccount(accountId) {
    return update((state) => {
      const account = state.accounts.find((item) => item.id === cleanText(accountId, 100));
      if (!account) throw new YunxiaoError("账号不存在", 404);
      state.selectedAccountId = account.id;
      return publicAccount(account);
    });
  }

  async function deleteAccount(accountId) {
    return update((state) => {
      const id = cleanText(accountId, 100);
      const index = state.accounts.findIndex((item) => item.id === id);
      if (index < 0) throw new YunxiaoError("账号不存在", 404);
      state.accounts.splice(index, 1);
      delete state.cache[id];
      if (state.selectedAccountId === id) state.selectedAccountId = state.accounts[0]?.id || "";
      return { ok: true };
    });
  }

  async function selectProject(accountId, project) {
    return update((state) => {
      const account = state.accounts.find((item) => item.id === cleanText(accountId, 100));
      if (!account) throw new YunxiaoError("账号不存在", 404);
      const selected = { id: cleanText(project.id, 128), name: cleanText(project.name, 255) };
      if (!selected.id || !selected.name) throw new YunxiaoError("项目 ID 和名称不能为空", 422);
      account.selectedProject = selected;
      account.updatedAt = new Date().toISOString();
      state.selectedAccountId = account.id;
      return selected;
    });
  }

  async function saveDefectNotification(accountId, projectId, input) {
    return update((state) => {
      const account = state.accounts.find((item) => item.id === cleanText(accountId, 100));
      if (!account) throw new YunxiaoError("账号不存在", 404);
      const targetProjectId = cleanText(projectId || account.selectedProject?.id, 128);
      if (!targetProjectId) throw new YunxiaoError("请先选择项目", 422);
      const settings = normalizeDefectNotification(input);
      if (!account.projectSettings || typeof account.projectSettings !== "object") account.projectSettings = {};
      const projectSettings = account.projectSettings[targetProjectId] && typeof account.projectSettings[targetProjectId] === "object"
        ? account.projectSettings[targetProjectId]
        : {};
      projectSettings.defectNotification = settings;
      account.projectSettings[targetProjectId] = projectSettings;
      account.updatedAt = new Date().toISOString();
      state.selectedAccountId = account.id;
      return settings;
    });
  }

  async function saveWorkspaceBinding(accountId, projectId, workspace) {
    return update((state) => {
      const account = state.accounts.find((item) => item.id === cleanText(accountId, 100));
      if (!account) throw new YunxiaoError("账号不存在", 404);
      const targetProjectId = cleanText(projectId || account.selectedProject?.id, 128);
      if (!targetProjectId) throw new YunxiaoError("请先选择项目", 422);
      if (!account.projectSettings || typeof account.projectSettings !== "object") account.projectSettings = {};
      const projectSettings = account.projectSettings[targetProjectId] && typeof account.projectSettings[targetProjectId] === "object"
        ? account.projectSettings[targetProjectId]
        : {};
      const binding = normalizeWorkspaceBinding(workspace);
      if (binding) projectSettings.workspace = binding;
      else delete projectSettings.workspace;
      account.projectSettings[targetProjectId] = projectSettings;
      account.updatedAt = new Date().toISOString();
      state.selectedAccountId = account.id;
      return binding;
    });
  }

  async function putCache(accountId, key, value) {
    return update((state) => {
      const accountCache = state.cache[accountId] || {};
      const nextValue = value && typeof value === "object" ? structuredClone(value) : value;
      if (nextValue && Array.isArray(nextValue.items)) nextValue.items = nextValue.items.slice(0, cacheMaxItems);
      accountCache[key] = { savedAt: new Date().toISOString(), value: nextValue };
      state.cache[accountId] = accountCache;
      return accountCache[key];
    });
  }

  async function getCache(accountId, key) {
    const state = await load();
    return state.cache[accountId]?.[key] || null;
  }

  async function getSystemInfo() {
    const state = await load();
    return state.system;
  }

  async function saveSystemInfo(info) {
    return update((state) => {
      state.system = normalizeSystemInfo(info);
      return state.system;
    });
  }

  async function listFlows() {
    const state = await load();
    return state.flows;
  }

  async function saveFlow(input) {
    return update((state) => {
      const now = new Date().toISOString();
      const source = input && typeof input === "object" ? input : {};
      const id = cleanText(source.id, 64);
      const existing = id ? state.flows.find((item) => item.id === id) : null;
      const flow = normalizeFlow({
        ...source,
        id: existing ? existing.id : id || randomUUID(),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      });
      if (!flow) throw new YunxiaoError("编排名称不能为空", 422);
      const index = state.flows.findIndex((item) => item.id === flow.id);
      if (index >= 0) state.flows[index] = flow;
      else state.flows.unshift(flow);
      return flow;
    });
  }

  async function deleteFlow(flowId) {
    return update((state) => {
      const id = cleanText(flowId, 64);
      const index = state.flows.findIndex((item) => item.id === id);
      if (index < 0) throw new YunxiaoError("编排不存在", 404);
      state.flows.splice(index, 1);
      return { ok: true };
    });
  }

  async function saveFlowRun(flowId, runInput) {
    return update((state) => {
      const id = cleanText(flowId, 64);
      const flow = state.flows.find((item) => item.id === id);
      if (!flow) throw new YunxiaoError("编排不存在", 404);
      const run = normalizeFlowRun(runInput);
      const index = flow.runs.findIndex((item) => item.id === run.id);
      if (index >= 0) flow.runs[index] = run;
      else flow.runs.unshift(run);
      flow.runs = flow.runs.slice(0, FLOW_RUNS_LIMIT);
      flow.updatedAt = new Date().toISOString();
      return run;
    });
  }

  // —— 处理规则与运行台账 ——————————————————————————————————————————————
  async function listPolicies() {
    const state = await load();
    return state.policies;
  }

  async function savePolicy(input) {
    return update((state) => {
      const now = new Date().toISOString();
      const source = input && typeof input === "object" ? input : {};
      const id = cleanText(source.id, 64);
      const existing = id ? state.policies.find((item) => item.id === id) : null;
      if (!existing && state.policies.length >= POLICY_LIMIT) throw new YunxiaoError(`规则数量已达上限 ${POLICY_LIMIT}`, 422);
      const policy = normalizePolicy({
        ...source,
        id: existing ? existing.id : id || randomUUID(),
        order: source.order === undefined ? (existing ? existing.order : state.policies.length) : source.order,
        lastScanAt: existing ? existing.lastScanAt : "",
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      });
      if (!policy) throw new YunxiaoError("规则名称不能为空", 422);
      // 触发范围变化后重新快照存量，避免把旧快照之外的历史缺陷当成新增。
      if (existing && JSON.stringify(existing.trigger) !== JSON.stringify(policy.trigger)) policy.lastScanAt = "";
      const index = state.policies.findIndex((item) => item.id === policy.id);
      if (index >= 0) state.policies[index] = policy;
      else state.policies.push(policy);
      state.policies.sort((left, right) => left.order - right.order);
      return policy;
    });
  }

  async function deletePolicy(policyId) {
    return update((state) => {
      const id = cleanText(policyId, 64);
      const index = state.policies.findIndex((item) => item.id === id);
      if (index < 0) throw new YunxiaoError("规则不存在", 404);
      state.policies.splice(index, 1);
      state.policies.forEach((item, position) => { item.order = position; });
      return { ok: true };
    });
  }

  async function reorderPolicies(ids) {
    return update((state) => {
      const wanted = cleanStringList(ids, POLICY_LIMIT, 64);
      const byId = new Map(state.policies.map((item) => [item.id, item]));
      const ordered = wanted.map((id) => byId.get(id)).filter(Boolean);
      for (const item of state.policies) if (!ordered.includes(item)) ordered.push(item);
      ordered.forEach((item, position) => { item.order = position; });
      state.policies = ordered;
      return state.policies;
    });
  }

  async function markPolicyScanned(policyId, at) {
    return update((state) => {
      const policy = state.policies.find((item) => item.id === cleanText(policyId, 64));
      if (policy) policy.lastScanAt = cleanText(at, 40) || new Date().toISOString();
      return policy || null;
    });
  }

  async function listRuns() {
    const state = await load();
    return state.runs;
  }

  async function getRun(runId) {
    const state = await load();
    return state.runs.find((item) => item.id === cleanText(runId, 64)) || null;
  }

  // 引擎每次状态变化都整条覆盖写入；台账按开始时间倒序、全局最多 RUN_LIMIT 条。
  async function saveRun(input) {
    return update((state) => {
      const run = normalizeRun(input);
      if (!run) throw new YunxiaoError("运行记录缺少 ID", 422);
      // normalizeRun 把进行中的状态改写为 interrupted 是为读档设计的；引擎写入时保留原状态。
      const liveStatus = cleanText(input?.status, 30);
      if (RUN_STATUSES.has(liveStatus)) run.status = liveStatus;
      const index = state.runs.findIndex((item) => item.id === run.id);
      if (index >= 0) state.runs[index] = run;
      else state.runs.unshift(run);
      // 超限时从最旧的已结束记录开始淘汰，进行中的保留。
      while (state.runs.length > RUN_LIMIT) {
        let removed = false;
        for (let position = state.runs.length - 1; position >= 0; position -= 1) {
          if (RUN_ACTIVE_STATUSES.has(state.runs[position].status)) continue;
          state.runs.splice(position, 1);
          removed = true;
          break;
        }
        if (!removed) break;
      }
      return run;
    });
  }

  async function markSeen(defectId, info) {
    return update((state) => {
      const id = cleanText(defectId, 128);
      if (!id) return null;
      state.runsSeen[id] = {
        runId: cleanText(info?.runId, 64),
        policyId: cleanText(info?.policyId, 64),
        at: cleanText(info?.at, 40) || new Date().toISOString(),
        fingerprint: cleanText(info?.fingerprint, 200),
        outcome: cleanText(info?.outcome, 30)
      };
      return state.runsSeen[id];
    });
  }

  async function markSeenBatch(entries) {
    return update((state) => {
      const now = new Date().toISOString();
      for (const entry of entries || []) {
        const id = cleanText(entry?.defectId, 128);
        if (!id || state.runsSeen[id]) continue;
        state.runsSeen[id] = {
          runId: "",
          policyId: cleanText(entry?.policyId, 64),
          at: now,
          fingerprint: cleanText(entry?.fingerprint, 200),
          outcome: "snapshot"
        };
      }
      return Object.keys(state.runsSeen).length;
    });
  }

  // 规则的生效范围：scope 为空时跟随当前账号/项目；工作区绑定取项目设置。
  async function resolvePolicyScope(policy) {
    const state = await load();
    const scope = policy?.scope && typeof policy.scope === "object" ? policy.scope : {};
    const wantedAccount = cleanText(scope.accountId, 100) || state.selectedAccountId;
    const account = state.accounts.find((item) => item.id === wantedAccount);
    if (!account) throw new YunxiaoError("规则绑定的云效账号不存在或未配置", 422);
    if (!cleanText(account.organizationId, 128) || !cleanText(account.token)) {
      throw new YunxiaoError("规则绑定的账号缺少组织 ID 或个人访问令牌", 422);
    }
    const projectId = cleanText(scope.projectId, 128) || cleanText(account.selectedProject?.id, 128);
    if (!projectId) throw new YunxiaoError("规则绑定的账号尚未选择项目", 422);
    const projectSettings = account.projectSettings && typeof account.projectSettings === "object"
      ? account.projectSettings[projectId]
      : null;
    return {
      account,
      projectId,
      workspace: normalizeWorkspaceBinding(projectSettings?.workspace)
    };
  }

  return {
    absolutePath,
    load,
    update,
    getAccount,
    publicState,
    saveAccount,
    selectAccount,
    deleteAccount,
    selectProject,
    saveDefectNotification,
    saveWorkspaceBinding,
    putCache,
    getCache,
    getSystemInfo,
    saveSystemInfo,
    listFlows,
    saveFlow,
    deleteFlow,
    saveFlowRun,
    listPolicies,
    savePolicy,
    deletePolicy,
    reorderPolicies,
    markPolicyScanned,
    listRuns,
    getRun,
    saveRun,
    markSeen,
    markSeenBatch,
    resolvePolicyScope
  };
}

// —— 规则引擎：宿主侧常驻执行器 ————————————————————————————————————————————
// 轮询拉取缺陷 → 规则匹配 → 分级自治（auto-submit 全自动修复 / analyze-confirm 分析后确认 / notify 仅通知）。
// 浏览器只做展示与裁决；引擎依赖 agents / agentPresets / permissionPresets / sessionTitle /
// workspaceRegistry / attachments 六个宿主服务，任一缺失（profile 组成不同）时引擎保持停用，
// RPC 返回「引擎不可用」，其余功能不受影响。
const ENGINE_MAX_CONCURRENCY = 2;
const ENGINE_COOLDOWN_MS = 30 * 60_000;
const ENGINE_SCAN_PAGE_SIZE = 100;
const ENGINE_IMAGE_LIMIT = 8;
const ENGINE_PIPELINE_POLL_MS = 15_000;
const ENGINE_PIPELINE_MAX_MS = 10 * 60_000;
// 台账里这些终态在冷却期内不再重跑；snapshot / queued / unmatched 等过程态不拦。
const ENGINE_SEEN_TERMINAL = new Set(["fixed", "needs-human", "not-a-bug", "cannot-reproduce", "blocked"]);

class EngineCancel extends Error {
  constructor(message = "运行已取消") {
    super(message);
    this.name = "EngineCancel";
  }
}

function policyPriorityRank(value) {
  const match = /P([0-3])/i.exec(String(value ?? ""));
  return match ? Number(match[1]) : -1;
}

// 规则匹配：排除关键词 → 包含关键词 → 优先级上限 → 工作项类型，任一步不过即不命中。
// match.labelAny 暂不参与判定（缺陷列表接口不返回标签），UI 中隐藏该输入。
function policyMatches(policy, defect) {
  const match = policy.match || {};
  const haystack = `${defect.subject || ""}\n${defect.description || ""}`.toLowerCase();
  for (const keyword of match.keywordsNone || []) {
    if (haystack.includes(String(keyword).toLowerCase())) {
      return { matched: false, reason: `命中排除关键词「${keyword}」` };
    }
  }
  if ((match.keywordsAny || []).length) {
    const hit = match.keywordsAny.find((keyword) => haystack.includes(String(keyword).toLowerCase()));
    if (!hit) return { matched: false, reason: "未命中任何包含关键词" };
  }
  if (match.priorityCeiling) {
    const ceiling = policyPriorityRank(match.priorityCeiling);
    const actual = policyPriorityRank(defect.priority);
    if (actual >= 0 && actual > ceiling) {
      return { matched: false, reason: `优先级 ${defect.priority} 低于上限 ${match.priorityCeiling}` };
    }
  }
  if ((match.typeAny || []).length && !match.typeAny.includes(defect.workitemType || "")) {
    return { matched: false, reason: `工作项类型「${defect.workitemType || "未知"}」不在范围内` };
  }
  return { matched: true, reason: "命中规则" };
}

function policySlug(text) {
  const ascii = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return ascii || "defect";
}

function renderPolicyTemplate(template, vars) {
  return String(template || "").replace(/\{(\w+)\}/g, (raw, key) => {
    const value = vars[key];
    return value === undefined || value === null ? raw : String(value);
  });
}

// 仅用于 forbiddenPaths 这类"路径是否命中"的判断，支持 ** / * / ?。
function globToRegExp(pattern) {
  const escaped = String(pattern || "").trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function parseAgentOptions(raw) {
  const text = cleanText(raw, 200);
  if (!text) return undefined;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return { model: text };
}

function blankRun(fields = {}) {
  return {
    id: fields.id || randomUUID(),
    policyId: fields.policyId || "",
    policyName: fields.policyName || "",
    accountId: "",
    projectId: "",
    workspaceId: "",
    defectId: fields.defectId || "",
    serial: fields.serial || "",
    subject: fields.subject || "",
    mode: fields.mode && POLICY_MODES.has(fields.mode) ? fields.mode : "analyze-confirm",
    status: fields.status || "queued",
    sessionId: "",
    fingerprint: fields.fingerprint || "",
    trigger: fields.trigger || "scan",
    steps: [],
    log: [],
    result: normalizeRunResult(null),
    error: "",
    startedAt: fields.startedAt || "",
    endedAt: "",
    durationMs: 0
  };
}

function runOutcomeText(outcome) {
  return {
    fixed: "已自动修复",
    analyzed: "已完成分析",
    "needs-human": "需要人工处理",
    "not-a-bug": "判定为非缺陷",
    "cannot-reproduce": "无法复现",
    blocked: "处理受阻"
  }[outcome] || outcome || "—";
}

function buildAgentPrompt(policy, defect, detail, agentMode) {
  const comments = (detail.comments || []).slice(-5)
    .map((item) => `- ${item.userName || "用户"}：${cleanTextPreserve(item.content, 600).replace(/\s+/g, " ")}`)
    .join("\n");
  const attachmentNames = (detail.attachments || []).map((item) => item.fileName).filter(Boolean).join("、");
  const lines = [
    "你在处理云效缺陷。只允许改动与本缺陷直接相关的文件。",
    "",
    "## 缺陷",
    `编号 ${defect.serialNumber || defect.id}｜优先级 ${defect.priority || "未设置"}｜状态 ${defect.statusName || "未知"}｜类型 ${defect.workitemType || "缺陷"}`,
    `标题：${defect.subject || "（无标题）"}`,
    `描述：`,
    cleanTextPreserve(detail.description || "（无描述）", 20_000)
  ];
  if (comments) lines.push("", "## 最近评论", comments);
  if (attachmentNames) lines.push("", `附件：${attachmentNames}`);
  lines.push(
    "",
    `## 处理规则（来自编排规则「${policy.name}」，最高优先级遵守）`,
    cleanTextPreserve(policy.instructions, 8000) || "（无附加规则）",
    "",
    "## 模式要求"
  );
  const submit = policy.submit || {};
  if (agentMode === "analyze") {
    lines.push(
      "本次只读诊断：禁止修改任何文件、禁止执行写入类命令。",
      "产出根因分析、修复方案（含涉及文件清单）与风险影响面。",
      "完成后必须调用 yunxiao_report_result 汇报：outcome 取 analyzed；确认无需修复时取 not-a-bug 或 cannot-reproduce。"
    );
  } else {
    lines.push(
      `在仓库内新建分支实施修复：从 ${submit.baseBranch || "当前默认分支"} 切出，分支名遵循 ${submit.branchPattern || "fix/{serial}-{slug}"}。`,
      "完成修改后逐条运行验证命令，把每条命令与执行结果如实写进 report.verify；任一验证失败都要如实标记。",
      submit.push === false ? "验证通过后本地提交即可，不要推送。" : "验证通过后提交并推送分支。",
      `改动文件数不得超过 ${submit.maxChangedFiles || 30}；超过视为超范围，停止实施并以 needs-human 汇报。`
    );
    if ((submit.forbiddenPaths || []).length) {
      lines.push(`禁止改动这些路径：${submit.forbiddenPaths.join("、")}。`);
    }
    lines.push("无法完成或判断需要人工介入时，以 needs-human 汇报并说明原因，不要强行修复。");
  }
  lines.push(
    "",
    "## 收尾（必须）",
    "最后必须调用 yunxiao_report_result 一次性汇报结果；结论只通过该工具的入参表达，不要用自然语言复述。"
  );
  return lines.join("\n");
}

function buildApprovalPrompt(run) {
  const result = run.result || {};
  return [
    "用户已在云效工作台批准该缺陷的修复方案，请继续实施：",
    result.plan ? `按既定方案执行：${result.plan}` : "按此前分析的方案执行。",
    "实施完成、验证通过后提交并推送分支，然后再次调用 yunxiao_report_result 汇报（outcome 取 fixed 或 needs-human，branch / commits / changedFiles / verify 必须如实填写）。",
    "若实施中发现方案不可行，停止实施并以 needs-human 汇报，不要强行修复。"
  ].join("\n");
}

function buildWritebackComment(run, extra) {
  const result = run.result || {};
  const lines = [
    `### 🤖 云效编排自动处理（规则「${run.policyName}」）`,
    "",
    `- **结果**：${runOutcomeText(result.outcome)}`
  ];
  if (result.summary) lines.push(`- **摘要**：${result.summary}`);
  if (result.rootCause) lines.push(`- **根因**：${result.rootCause}`);
  if (result.plan) lines.push(`- **修复方案**：${result.plan}`);
  if (result.risk) lines.push(`- **风险**：${result.risk}`);
  if (result.branch) lines.push(`- **分支**：\`${result.branch}\``);
  if ((result.commits || []).length) lines.push(`- **提交**：${result.commits.map((item) => `\`${item}\``).join(" ")}`);
  if ((result.changedFiles || []).length) {
    lines.push(`- **改动文件**（${result.changedFiles.length}）：`);
    for (const file of result.changedFiles.slice(0, 30)) lines.push(`  - \`${file}\``);
  }
  if (result.mrUrl) lines.push(`- **合并请求**：${result.mrUrl}`);
  if ((result.verify || []).length) {
    lines.push("- **验证**：");
    for (const item of result.verify) lines.push(`  - ${item.ok ? "✅" : "❌"} \`${item.command}\``);
  }
  if (extra) lines.push(`- **备注**：${extra}`);
  if (run.error) lines.push(`- **失败原因**：${run.error}`);
  lines.push("", "> 由云效工作台规则引擎自动处理，步骤详情见工作台「编排 → 运行记录」。");
  return lines.join("\n");
}

function createPolicyEngine({ store, api, notify, timeScale = 1 } = {}) {
  if (!store || !api) throw new Error("createPolicyEngine 需要 store 与 api");
  const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;

  let svc = null;
  let started = false;
  let timer = null;
  let kickTimer = null;
  let scanning = false;
  let lastScanAt = "";
  let lastScanError = "";
  const queue = [];
  const activeByDefect = new Map();
  const live = new Map();
  const statusCache = new Map();

  function isAvailable() {
    return Boolean(started && svc);
  }

  function start(injected) {
    svc = injected || null;
    started = true;
    schedule();
    // 启动后先扫一轮，不必等第一个周期。
    if (kickTimer) clearTimeout(kickTimer);
    kickTimer = setTimeout(() => {
      kickTimer = null;
      scanOnce().catch(() => {});
    }, 3_000 * scale);
    if (kickTimer.unref) kickTimer.unref();
  }

  function stop() {
    started = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (kickTimer) { clearTimeout(kickTimer); kickTimer = null; }
    for (const [runId, ctx] of [...live]) {
      try { ctx.handle?.agent?.cancel?.({ kind: "disposed" }); } catch {}
      if (RUN_ACTIVE_STATUSES.has(ctx.run.status)) {
        ctx.run.status = "interrupted";
        ctx.run.error = "插件重载，运行中断";
        ctx.run.endedAt = new Date().toISOString();
        store.saveRun(ctx.run).catch(() => {});
      }
      live.delete(runId);
      activeByDefect.delete(ctx.run.defectId);
    }
    queue.length = 0;
  }

  function reschedule() {
    schedule();
  }

  async function schedule() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!isAvailable()) return;
    let minutes = 0;
    try {
      const policies = await store.listPolicies();
      const enabled = policies.filter((item) => item.enabled);
      if (enabled.length) {
        minutes = Math.max(1, Math.min(...enabled.map((item) => clampInteger(item.trigger.pollMinutes, 5, 1, 1440))));
      }
    } catch {}
    if (!minutes) return;
    timer = setInterval(() => {
      scanOnce().catch((error) => {
        lastScanError = error instanceof Error ? error.message : String(error);
      });
    }, Math.max(1_000, minutes * 60_000 * scale));
    if (timer.unref) timer.unref();
  }

  async function projectStatuses(account, projectId) {
    const key = `${account.id}:${projectId}`;
    const cached = statusCache.get(key);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.statuses;
    const resolved = await api.resolveNotificationStatuses(account, projectId);
    const statuses = resolved
      .map((status) => ({ id: status.id, name: status.name, kind: notificationStatusKind(status.name) }))
      .filter((status) => status.kind);
    statusCache.set(key, { at: Date.now(), statuses });
    return statuses;
  }

  async function scanOnce() {
    if (!isAvailable()) return { ok: false, reason: "引擎不可用" };
    if (scanning) return { ok: false, reason: "上一轮扫描尚未结束" };
    scanning = true;
    try {
      const policies = await store.listPolicies();
      const results = [];
      for (const policy of policies) {
        if (!policy.enabled) continue;
        const intervalMs = clampInteger(policy.trigger.pollMinutes, 5, 1, 1440) * 60_000;
        const lastMs = policy.lastScanAt ? Date.parse(policy.lastScanAt) : NaN;
        if (Number.isFinite(lastMs) && Date.now() - lastMs < intervalMs * 0.98) continue;
        try {
          results.push({ policyId: policy.id, name: policy.name, ...(await scanPolicy(policy)) });
        } catch (error) {
          results.push({ policyId: policy.id, name: policy.name, error: error instanceof Error ? error.message : String(error) });
        }
      }
      lastScanAt = new Date().toISOString();
      lastScanError = results.find((item) => item.error)?.error || "";
      drain();
      return { ok: true, at: lastScanAt, results };
    } finally {
      scanning = false;
    }
  }

  async function scanPolicy(policy) {
    const scope = await store.resolvePolicyScope(policy);
    const kinds = new Set(policy.trigger.statusKinds?.length ? policy.trigger.statusKinds : ["pending", "reopened"]);
    const statuses = (await projectStatuses(scope.account, scope.projectId)).filter((status) => kinds.has(status.kind));
    if (!statuses.length) throw new YunxiaoError("未能识别「待确认 / 再次打开」状态 ID，请先在缺陷通知配置里启用一次", 422);
    const results = await Promise.all(statuses.map((status) => api.listDefects(scope.account, scope.projectId, {
      page: 1,
      pageSize: ENGINE_SCAN_PAGE_SIZE,
      assignedToId: policy.trigger.assigneeId,
      statusIds: [status.id],
      orderBy: "gmtModified"
    })));
    const items = [...new Map(results.flatMap((result) => result.items || [])
      .filter((item) => item.id)
      .map((item) => [item.id, item])).values()];
    const state = await store.load();
    const seen = state.runsSeen || {};
    const firstScan = !policy.lastScanAt;
    const snapshot = [];
    let matched = 0;
    for (const item of items) {
      const fingerprint = `${item.statusId || ""}:${item.gmtModified || ""}`;
      // 首轮只做快照（backfill 关闭时），避免把启用规则前的存量缺陷当成新增。
      if (firstScan && !policy.trigger.backfill) {
        snapshot.push({ defectId: item.id, policyId: policy.id, fingerprint });
        continue;
      }
      if (activeByDefect.has(item.id) || queue.some((job) => job.defectId === item.id)) continue;
      const known = seen[item.id];
      if (known && known.fingerprint === fingerprint) continue;
      const lastMs = known?.runId ? Date.parse(known.at) : NaN;
      if (Number.isFinite(lastMs) && Date.now() - lastMs < ENGINE_COOLDOWN_MS && ENGINE_SEEN_TERMINAL.has(known.outcome)) continue;
      if (!policyMatches(policy, item).matched) continue;
      matched += 1;
      queue.push({
        policyId: policy.id,
        defectId: item.id,
        fingerprint,
        serial: item.serialNumber || "",
        subject: item.subject || "",
        mode: policy.mode
      });
      await store.markSeen(item.id, { policyId: policy.id, fingerprint, outcome: "queued" });
    }
    if (snapshot.length) await store.markSeenBatch(snapshot);
    await store.markPolicyScanned(policy.id, new Date().toISOString());
    return { scanned: items.length, matched, snapshotted: snapshot.length };
  }

  function drain() {
    if (!isAvailable()) return;
    while (activeByDefect.size < ENGINE_MAX_CONCURRENCY && queue.length) {
      const job = queue.shift();
      if (activeByDefect.has(job.defectId)) continue;
      runJob(job).catch(() => {});
    }
  }

  async function runJob(job) {
    const policies = await store.listPolicies();
    const policy = policies.find((item) => item.id === job.policyId);
    const startedAt = new Date().toISOString();
    if (!policy || !policy.enabled) {
      await store.markSeen(job.defectId, { policyId: job.policyId, fingerprint: job.fingerprint, at: startedAt, outcome: "skipped" }).catch(() => {});
      return;
    }
    const run = blankRun({
      policyId: policy.id,
      policyName: policy.name,
      defectId: job.defectId,
      serial: job.serial,
      subject: job.subject,
      mode: policy.mode,
      fingerprint: job.fingerprint,
      startedAt
    });
    const ctx = {
      run,
      policy,
      handle: null,
      abort: new AbortController(),
      detail: null,
      defect: null,
      account: null,
      projectId: "",
      workspace: null,
      imageRefs: [],
      report: null,
      holdsLive: false
    };
    activeByDefect.set(job.defectId, run.id);
    live.set(run.id, ctx);
    try {
      await persistRun(ctx, { status: "fetching" }, "拉取缺陷详情");
      const scope = await store.resolvePolicyScope(policy);
      ctx.account = scope.account;
      ctx.projectId = scope.projectId;
      ctx.workspace = scope.workspace;
      run.accountId = scope.account.id;
      run.projectId = scope.projectId;
      run.workspaceId = scope.workspace?.id || "";
      if (policy.mode !== "notify" && !scope.workspace?.path) {
        throw new YunxiaoError("项目未绑定 DSH 工作区，无法自动处理", 422);
      }
      const detail = await api.getDefect(scope.account, scope.projectId, job.defectId);
      ctx.detail = detail;
      ctx.defect = detail.defect;
      run.serial = detail.defect.serialNumber || run.serial;
      run.subject = detail.defect.subject || run.subject;
      await persistRun(ctx, { status: "classifying" }, "按规则匹配");
      const verdict = policyMatches(policy, { ...detail.defect, description: detail.description });
      if (!verdict.matched) {
        await finishRun(ctx, { status: "skipped" }, `未命中匹配条件：${verdict.reason}`);
        return;
      }
      if (policy.mode === "notify") {
        await persistRun(ctx, { status: "writeback" }, "发送通知");
        await writebackNotify(ctx);
        await finishRun(ctx, { status: "succeeded" }, "已发送处理提醒");
        return;
      }
      ctx.imageRefs = await loadImageRefs(ctx);
      await persistRun(ctx, { status: "agent-running" }, policy.mode === "analyze-confirm" ? "智能体只读诊断" : "智能体实施修复");
      await runAgentStage(ctx, policy.mode === "analyze-confirm" ? "analyze" : "implement");
      if (policy.mode === "analyze-confirm") {
        await writebackAnalysis(ctx);
        ctx.holdsLive = true;
        await persistRun(ctx, { status: "awaiting-confirm" }, "分析完成，等待人工确认");
        notifyUser(`云效缺陷 ${run.serial} 待确认`, `「${run.subject}」分析完成，请到工作台「编排 → 待确认」裁决`);
        return;
      }
      await implementAndSubmit(ctx);
    } catch (error) {
      await handleRunError(ctx, error);
    } finally {
      if (!ctx.holdsLive) {
        live.delete(run.id);
        activeByDefect.delete(job.defectId);
        drain();
      }
    }
  }

  async function handleRunError(ctx, error) {
    if (ctx.abort.signal.aborted || error instanceof EngineCancel) {
      await finishRun(ctx, { status: "canceled" }, "已取消");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const status = error?.runStatus === "needs-human" ? "needs-human" : "failed";
    ctx.run.error = cleanTextPreserve(message, 2000).trim();
    const extra = status === "needs-human" ? "" : "该缺陷未被修改；如已产生分支会在下方说明。";
    // 回写失败信息：尽力而为，单步失败不阻塞收尾。
    if (ctx.policy.writeback.comment && ctx.defect) {
      try {
        await api.createDefectComment(ctx.account, ctx.projectId, ctx.defect.id, buildWritebackComment(ctx.run, extra));
      } catch {}
    }
    try {
      if (ctx.policy.writeback.statusOnFailure) await applyStatusByName(ctx, ctx.policy.writeback.statusOnFailure);
    } catch {}
    try {
      if (ctx.policy.writeback.assigneeOnFailure) {
        await api.updateDefectAssignee(ctx.account, ctx.projectId, ctx.defect.id, ctx.policy.writeback.assigneeOnFailure);
      }
    } catch {}
    notifyUser(`云效缺陷 ${ctx.run.serial} 处理${status === "needs-human" ? "需人工" : "失败"}`, `${ctx.run.subject}：${message.slice(0, 200)}`);
    await finishRun(ctx, { status }, cleanTextPreserve(message, 200));
  }

  // auto-submit 与「分析后批准」共用的实施 + 提交 + 回写。
  async function implementAndSubmit(ctx) {
    const report = normalizeRunResult(ctx.report);
    if (!report.outcome) report.outcome = "needs-human";
    ctx.run.result = report;
    if (report.outcome !== "fixed") {
      await persistRun(ctx, { status: "writeback" }, `智能体结论：${runOutcomeText(report.outcome)}`);
      await writebackResult(ctx, report, "");
      const status = ["needs-human", "blocked"].includes(report.outcome) ? "needs-human" : "succeeded";
      await finishRun(ctx, { status }, `智能体结论：${runOutcomeText(report.outcome)}`);
      return;
    }
    const guard = checkSubmitGuardrails(ctx.policy, report);
    if (!guard.ok) {
      report.outcome = "needs-human";
      report.risk = cleanTextPreserve([report.risk, guard.reason].filter(Boolean).join("；"), 2000);
      ctx.run.error = cleanTextPreserve(guard.reason, 2000).trim();
      await persistRun(ctx, { status: "writeback" }, `提交护栏拦截：${guard.reason}`);
      await writebackResult(ctx, report, guard.reason);
      notifyUser(`云效缺陷 ${ctx.run.serial} 需人工确认`, `${ctx.run.subject}：${guard.reason}`);
      await finishRun(ctx, { status: "needs-human" }, guard.reason);
      return;
    }
    await persistRun(ctx, { status: "submitting" }, "创建合并请求");
    let mrNote = "";
    if (ctx.policy.submit.createMr) {
      const mr = await api.createChangeRequest(ctx.account, ctx.policy.submit.repoId, {
        sourceBranch: report.branch,
        targetBranch: ctx.policy.submit.mrTarget || "",
        title: renderPolicyTemplate(ctx.policy.submit.mrTitle || "fix({serial}): {subject}", {
          serial: ctx.run.serial,
          subject: ctx.run.subject,
          slug: policySlug(ctx.run.subject)
        }),
        description: buildWritebackComment(ctx.run, "该合并请求由规则引擎创建，请人工评审后合入。"),
        workItemIds: [ctx.defect.id]
      });
      report.mrId = mr.localId || "";
      report.mrUrl = mr.url || "";
      mrNote = mr.url ? `合并请求：${mr.url}` : "合并请求已创建";
    } else {
      mrNote = "按规则配置未创建合并请求";
    }
    if (ctx.policy.submit.pipelineId) {
      await persistRun(ctx, { status: "submitting" }, "触发流水线并等待结果");
      const pipeline = await runPipelineAndWait(ctx, ctx.policy.submit.pipelineId);
      report.pipelineRunId = pipeline.runId;
      report.verify.push({ command: `pipeline:${ctx.policy.submit.pipelineId}`, ok: pipeline.ok, output: pipeline.detail });
      if (!pipeline.ok) {
        throw Object.assign(new YunxiaoError(`流水线未通过：${pipeline.detail}`, 502), {
          runStatus: "failed",
          branchKept: report.branch
        });
      }
    }
    await persistRun(ctx, { status: "writeback" }, "回写缺陷");
    await writebackResult(ctx, report, mrNote);
    notifyUser(`云效缺陷 ${ctx.run.serial} 已自动修复`, `${ctx.run.subject}${report.mrUrl ? `，${report.mrUrl}` : ""}`);
    await finishRun(ctx, { status: "succeeded" }, "修复完成并通过验证");
  }

  function checkSubmitGuardrails(policy, report) {
    if (!report.branch) return { ok: false, reason: "智能体未报告分支名" };
    if (!(report.commits || []).length) return { ok: false, reason: "智能体未报告任何提交" };
    if (!(report.changedFiles || []).length) return { ok: false, reason: "智能体未报告改动文件" };
    if (report.changedFiles.length > policy.submit.maxChangedFiles) {
      return { ok: false, reason: `改动文件 ${report.changedFiles.length} 个，超过上限 ${policy.submit.maxChangedFiles}` };
    }
    for (const pattern of policy.submit.forbiddenPaths || []) {
      const regexp = globToRegExp(pattern);
      const hit = report.changedFiles.find((file) => regexp.test(file));
      if (hit) return { ok: false, reason: `改动命中禁改路径 ${pattern}（${hit}）` };
    }
    for (const item of report.verify || []) {
      if (!item.ok) return { ok: false, reason: `验证命令未通过：${item.command}` };
    }
    return { ok: true, reason: "" };
  }

  async function runPipelineAndWait(ctx, pipelineId) {
    const created = await api.createPipelineRun(ctx.account, pipelineId, {
      branchModeBranches: [ctx.run.result.branch],
      comment: `云效编排自动触发（缺陷 ${ctx.run.serial}）`
    });
    const deadline = Date.now() + ENGINE_PIPELINE_MAX_MS * scale;
    let latest = null;
    while (Date.now() < deadline) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, ENGINE_PIPELINE_POLL_MS * scale);
        if (timer.unref) timer.unref();
      });
      if (ctx.abort.signal.aborted) throw new EngineCancel();
      try {
        latest = await api.getPipelineRun(ctx.account, pipelineId, created.pipelineRunId);
      } catch {}
      const status = String(latest?.status || "").toUpperCase();
      if (["FINISHED", "SUCCESS", "SUCCEEDED", "CANCELED", "FAILED", "ERROR", "TIMEOUT"].includes(status)) {
        const ok = ["FINISHED", "SUCCESS", "SUCCEEDED"].includes(status);
        return { runId: created.pipelineRunId, ok, detail: `流水线状态 ${status}` };
      }
    }
    return { runId: created.pipelineRunId, ok: false, detail: "流水线等待超时" };
  }

  async function runAgentStage(ctx, agentMode) {
    const preset = await svc.agentPresets.resolve(cleanText(ctx.policy.agent.preset, 100) || undefined);
    const workspace = await svc.workspaceRegistry.create(ctx.workspace.path);
    const sessionId = `yunxiao-${ctx.run.id}`;
    const handle = await svc.agents.create({
      sessionId,
      signal: ctx.abort.signal,
      meta: { cwd: workspace.path, agentPreset: preset.id },
      agentOptions: parseAgentOptions(ctx.policy.agent.model),
      setup: async (agentCtx) => {
        await svc.agentPresets.mount(agentCtx, preset.id);
        registerEngineTools(agentCtx, ctx);
      }
    });
    ctx.handle = handle;
    ctx.run.sessionId = sessionId;
    try {
      await workspace.attachSession(sessionId);
    } catch (error) {
      await disposeQuietly(handle);
      throw error;
    }
    const permissionName = resolvePermissionName(ctx.policy, agentMode);
    if (permissionName) {
      try { svc.permissionPresets.set(handle.agent.session, permissionName); } catch {}
    } else if (agentMode === "implement") {
      pushLog(ctx, "未找到可用的无审批写入权限预设，无人值守可能在审批处停滞（超时转人工）");
    }
    try {
      svc.sessionTitle.rename(handle.agent.session, `[云效] ${ctx.run.serial} ${ctx.run.subject}`.slice(0, 120));
    } catch {}
    handle.agent.followup({
      id: randomUUID(),
      role: "user",
      content: [
        ...ctx.imageRefs.map((ref) => ({ type: "image", attachment: ref })),
        { type: "text", text: buildAgentPrompt(ctx.policy, ctx.defect, ctx.detail, agentMode) }
      ],
      source: {
        kind: "plugin",
        plugin: name,
        form: "notice",
        summary: `云效缺陷 ${ctx.run.serial} 自动处理（${agentMode === "analyze" ? "只读诊断" : "实施修复"}）`
      }
    });
    await waitAgentIdle(ctx, clampInteger(ctx.policy.agent.maxMinutes, 30, 1, 720) * 60_000 * scale);
  }

  function resolvePermissionName(policy, agentMode) {
    if (!svc?.permissionPresets) return "";
    const names = svc.permissionPresets.names || [];
    const specOf = (presetName) => {
      try { return svc.permissionPresets.resolve(presetName); } catch { return null; }
    };
    if (agentMode === "analyze") {
      if (names.includes("read-only")) return "read-only";
      for (const presetName of names) {
        if (specOf(presetName)?.sandbox === "read-only") return presetName;
      }
      return "";
    }
    const wanted = cleanText(policy.agent.permissionPreset, 100);
    if (wanted && names.includes(wanted)) return wanted;
    for (const presetName of names) {
      const spec = specOf(presetName);
      if (spec?.sandbox === "workspace-write" && spec?.approval === "never") return presetName;
    }
    return "";
  }

  function waitAgentIdle(ctx, timeoutMs) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        reject(new EngineCancel());
      };
      if (ctx.abort.signal.aborted) {
        reject(new EngineCancel());
        return;
      }
      ctx.abort.signal.addEventListener("abort", onAbort, { once: true });
      const idle = ctx.handle.agent.whenIdle();
      timer = setTimeout(() => {
        ctx.abort.signal.removeEventListener("abort", onAbort);
        try { ctx.handle?.agent?.cancel({ kind: "user" }); } catch {}
        idle.catch(() => {});
        reject(Object.assign(new YunxiaoError(`智能体处理超过 ${Math.round(timeoutMs / 60_000 / scale)} 分钟，已中止`, 504), { runStatus: "needs-human" }));
      }, Math.max(1_000, timeoutMs));
      if (timer.unref) timer.unref();
      idle.then(() => {
        if (timer) clearTimeout(timer);
        ctx.abort.signal.removeEventListener("abort", onAbort);
        resolve();
      }, (error) => {
        if (timer) clearTimeout(timer);
        ctx.abort.signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  function registerEngineTools(agentCtx, ctx) {
    agentCtx.tools.register({
      name: "yunxiao_defect_context",
      description: "读取当前正在处理的云效缺陷的结构化上下文（标题、状态、负责人、描述、最近评论、附件清单）。",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      isConcurrencySafe: () => true,
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
      },
      execute: async () => ({
        defect: ctx.defect,
        description: ctx.detail?.description || "",
        comments: (ctx.detail?.comments || []).slice(-10),
        attachments: (ctx.detail?.attachments || []).map((item) => ({ fileName: item.fileName, suffix: item.suffix }))
      })
    });
    agentCtx.tools.register({
      name: "yunxiao_progress",
      description: "汇报处理进度（会记录到运行时间线，模型可见的返回值恒为 ok）。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { message: { type: "string", description: "一句话进度说明" } },
        required: ["message"]
      },
      isConcurrencySafe: () => true,
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
      },
      execute: async (args) => {
        const message = cleanTextPreserve(args?.message, 500).trim();
        if (message) {
          pushLog(ctx, message);
          store.saveRun(ctx.run).catch(() => {});
        }
        return { ok: true };
      }
    });
    agentCtx.tools.register({
      name: "yunxiao_report_result",
      description: "汇报缺陷处理结果并结束本轮：处理完成后必须调用一次，结论以入参为准。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          outcome: { type: "string", enum: [...REPORT_OUTCOMES], description: "处理结论" },
          summary: { type: "string", description: "结果摘要（面向缺陷评论）" },
          rootCause: { type: "string", description: "根因分析" },
          plan: { type: "string", description: "修复方案（分析模式必填）" },
          risk: { type: "string", description: "风险与影响面" },
          branch: { type: "string", description: "修复分支名" },
          commits: { type: "array", items: { type: "string" }, description: "提交哈希列表" },
          changedFiles: { type: "array", items: { type: "string" }, description: "改动文件路径列表" },
          verify: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                command: { type: "string" },
                ok: { type: "boolean" },
                output: { type: "string" }
              },
              required: ["command", "ok"]
            },
            description: "验证命令与结果"
          }
        },
        required: ["outcome", "summary"]
      },
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
      },
      execute: async (args, exec) => {
        ctx.report = args && typeof args === "object" ? args : {};
        exec.concludeTurn();
        return { ok: true };
      }
    });
  }

  async function disposeQuietly(handle) {
    try { await handle?.dispose?.(); } catch {}
  }

  async function loadImageRefs(ctx) {
    if (!svc?.attachments) return [];
    const images = (ctx.detail.attachments || [])
      .filter((item) => mediaTypeFromSuffix(item.suffix || item.fileName))
      .slice(0, ENGINE_IMAGE_LIMIT);
    const refs = [];
    for (const image of images) {
      try {
        const data = await api.getAttachmentData(ctx.account, ctx.projectId, ctx.defect.id, image.fileId, { maxBytes: 10_000_000 });
        if (!IMAGE_MEDIA_TYPES.has(data.mediaType)) continue;
        const saved = await svc.attachments.saveImages([{
          data: Buffer.from(data.data, "base64"),
          mediaType: data.mediaType,
          name: image.fileName || image.fileId
        }]);
        refs.push(...saved);
      } catch {
        pushLog(ctx, `附件「${image.fileName || image.fileId}」读取失败，已跳过`);
      }
    }
    return refs;
  }

  async function applyStatusByName(ctx, statusName) {
    const wanted = cleanText(statusName, 100);
    if (!wanted || !ctx.defect) return false;
    const options = await api.listDefectStatusOptions(ctx.account, ctx.projectId);
    const target = options.find((option) => option.name === wanted);
    if (!target) throw new YunxiaoError(`项目工作流中不存在状态「${wanted}」`, 422);
    await api.updateDefectStatus(ctx.account, ctx.projectId, ctx.defect.id, target.id);
    return true;
  }

  async function writebackNotify(ctx) {
    if (ctx.policy.writeback.comment && ctx.defect) {
      try {
        await api.createDefectComment(ctx.account, ctx.projectId, ctx.defect.id,
          buildWritebackComment(ctx.run, "该缺陷命中了仅通知规则，请负责人跟进。"));
      } catch {}
    }
    notifyUser(`云效缺陷 ${ctx.run.serial} 待处理`, `${ctx.run.subject}（规则「${ctx.policy.name}」）`);
  }

  async function writebackAnalysis(ctx) {
    const report = normalizeRunResult(ctx.report);
    if (!report.outcome) report.outcome = "analyzed";
    ctx.run.result = report;
    if (ctx.policy.writeback.comment && ctx.defect) {
      try {
        await api.createDefectComment(ctx.account, ctx.projectId, ctx.defect.id,
          buildWritebackComment(ctx.run, "以下结论待确认后才会实施修复。"));
      } catch {}
    }
    try {
      if (ctx.policy.writeback.statusOnConfirm) await applyStatusByName(ctx, ctx.policy.writeback.statusOnConfirm);
    } catch (error) {
      pushLog(ctx, `状态流转失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function writebackResult(ctx, report, extra) {
    if (ctx.policy.writeback.comment && ctx.defect) {
      try {
        await api.createDefectComment(ctx.account, ctx.projectId, ctx.defect.id, buildWritebackComment(ctx.run, extra));
      } catch {}
    }
    const success = report.outcome === "fixed";
    const statusName = success ? ctx.policy.writeback.statusOnSuccess : ctx.policy.writeback.statusOnFailure;
    try {
      if (statusName) await applyStatusByName(ctx, statusName);
    } catch (error) {
      pushLog(ctx, `状态流转失败：${error instanceof Error ? error.message : String(error)}`);
    }
    if (!success && ctx.policy.writeback.assigneeOnFailure) {
      try {
        await api.updateDefectAssignee(ctx.account, ctx.projectId, ctx.defect.id, ctx.policy.writeback.assigneeOnFailure);
      } catch {}
    }
  }

  function pushStep(ctx, status, detail) {
    ctx.run.steps.push({ name: status, status: "ok", at: new Date().toISOString(), detail: cleanTextPreserve(detail, 2000).trim() });
  }

  function pushLog(ctx, message) {
    ctx.run.log.push({ t: new Date().toISOString(), m: cleanTextPreserve(message, 2000).trim(), c: "" });
  }

  async function persistRun(ctx, patch, stepDetail) {
    Object.assign(ctx.run, patch);
    if (stepDetail) pushStep(ctx, patch.status || ctx.run.status, stepDetail);
    await store.saveRun({ ...ctx.run }).catch(() => {});
  }

  async function finishRun(ctx, patch, detail) {
    Object.assign(ctx.run, patch);
    if (detail) pushStep(ctx, patch.status, detail);
    ctx.run.endedAt = new Date().toISOString();
    const startMs = Date.parse(ctx.run.startedAt || ctx.run.endedAt);
    ctx.run.durationMs = Number.isFinite(startMs) ? Math.max(0, Date.parse(ctx.run.endedAt) - startMs) : 0;
    await store.saveRun({ ...ctx.run }).catch(() => {});
    if (ctx.run.defectId) {
      const outcome = ctx.run.result?.outcome || ctx.run.status;
      await store.markSeen(ctx.run.defectId, {
        runId: ctx.run.id,
        policyId: ctx.run.policyId,
        fingerprint: ctx.run.fingerprint,
        outcome: ["succeeded", "needs-human", "failed", "skipped", "canceled", "interrupted"].includes(ctx.run.status)
          ? (ctx.run.status === "succeeded" ? outcome : ctx.run.status)
          : outcome
      }).catch(() => {});
    }
  }

  function notifyUser(title, body) {
    if (!notify) return;
    notify(title, body, { tag: `dyx-run-${Date.now()}` }).catch(() => {});
  }

  // —— 待确认裁决 / 取消 / 重试 ————————————————————————————————————————————
  async function confirmRun(runId, decision) {
    const run = await store.getRun(runId);
    if (!run) throw new YunxiaoError("运行记录不存在", 404);
    if (run.status !== "awaiting-confirm") {
      throw new YunxiaoError(`运行当前状态为「${run.status}」，无法裁决`, 409);
    }
    const ctx = live.get(runId);
    if (!ctx || !ctx.handle) {
      throw new YunxiaoError("该运行已随宿主重启中断，无法在同会话继续；请对缺陷重试", 410);
    }
    if (decision === "approve") {
      const permissionName = resolvePermissionName(ctx.policy, "implement");
      if (permissionName) {
        try { svc.permissionPresets.set(ctx.handle.agent.session, permissionName); } catch {}
      }
      await persistRun(ctx, { status: "agent-running" }, "已批准，继续实施修复");
      ctx.handle.agent.followup({
        id: randomUUID(),
        role: "user",
        content: [{ type: "text", text: buildApprovalPrompt(ctx.run) }],
        source: {
          kind: "plugin",
          plugin: name,
          form: "notice",
          summary: `云效缺陷 ${ctx.run.serial} 修复方案已批准`
        }
      });
      // 异步续跑：RPC 立即返回，实施进度经 runs.list 轮询展示。
      continueApproved(ctx).catch(() => {});
      return { ok: true, status: "agent-running" };
    }
    if (decision === "handoff") {
      try {
        if (ctx.policy.writeback.assigneeOnFailure && ctx.defect) {
          await api.updateDefectAssignee(ctx.account, ctx.projectId, ctx.defect.id, ctx.policy.writeback.assigneeOnFailure);
        }
      } catch {}
      run.result = normalizeRunResult({ ...run.result, outcome: "needs-human" });
      ctx.run.result = run.result;
      notifyUser(`云效缺陷 ${run.serial} 已转人工`, run.subject);
      await finishRun(ctx, { status: "needs-human" }, "人工裁决：转人工处理");
      releaseLive(ctx);
      return { ok: true, status: "needs-human" };
    }
    if (decision === "reject") {
      await finishRun(ctx, { status: "canceled" }, "人工裁决：忽略");
      releaseLive(ctx);
      return { ok: true, status: "canceled" };
    }
    throw new YunxiaoError(`未知裁决：${cleanText(decision, 30)}`, 422);
  }

  async function continueApproved(ctx) {
    try {
      await waitAgentIdle(ctx, clampInteger(ctx.policy.agent.maxMinutes, 30, 1, 720) * 60_000 * scale);
      await implementAndSubmit(ctx);
    } catch (error) {
      await handleRunError(ctx, error);
    } finally {
      releaseLive(ctx);
      drain();
    }
  }

  function releaseLive(ctx) {
    ctx.holdsLive = false;
    live.delete(ctx.run.id);
    activeByDefect.delete(ctx.run.defectId);
  }

  async function cancelRun(runId) {
    const ctx = live.get(runId);
    if (!ctx) {
      const run = await store.getRun(runId);
      if (run && RUN_ACTIVE_STATUSES.has(run.status)) {
        run.status = "canceled";
        run.endedAt = run.endedAt || new Date().toISOString();
        await store.saveRun(run);
        return { ok: true, marked: true };
      }
      throw new YunxiaoError("运行未在进行中，无法取消", 409);
    }
    ctx.abort.abort();
    try { ctx.handle?.agent?.cancel({ kind: "user" }); } catch {}
    return { ok: true };
  }

  async function retryRun(run) {
    if (!run?.defectId) throw new YunxiaoError("运行记录缺少缺陷 ID", 422);
    if (activeByDefect.has(run.defectId)) throw new YunxiaoError("该缺陷已有进行中的运行", 409);
    const fingerprint = run.fingerprint || `retry:${run.id}`;
    queue.push({
      policyId: run.policyId,
      defectId: run.defectId,
      fingerprint,
      serial: run.serial || "",
      subject: run.subject || "",
      mode: run.mode || "analyze-confirm",
      trigger: "retry"
    });
    await store.markSeen(run.defectId, { runId: "", policyId: run.policyId, fingerprint, outcome: "queued" });
    drain();
    return { ok: true, queued: true };
  }

  function status() {
    return {
      available: isAvailable(),
      scanning,
      queued: queue.length,
      lastScanAt,
      lastScanError,
      active: [...activeByDefect].map(([defectId, runId]) => {
        const ctx = live.get(runId);
        return {
          runId,
          defectId,
          serial: ctx?.run?.serial || "",
          subject: ctx?.run?.subject || "",
          policyName: ctx?.run?.policyName || "",
          status: ctx?.run?.status || ""
        };
      })
    };
  }

  return {
    start,
    stop,
    reschedule,
    scanOnce,
    isAvailable,
    confirmRun,
    cancelRun,
    retryRun,
    status
  };
}

function createApiClient(config) {
  const baseUrl = config.apiBaseUrl.replace(/\/+$/, "");

  async function request(account, pathname, options = {}) {
    const url = new URL(`${baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== "" && value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-yunxiao-token": account.token
    };
    let response;
    try {
      response = await fetch(url, {
        method: options.method || "GET",
        cache: "no-store",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal || AbortSignal.timeout(config.timeoutMs)
      });
    } catch (error) {
      throw new YunxiaoError(`连接云效 OpenAPI 失败：${error instanceof Error ? error.message : String(error)}`);
    }
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const detail = typeof payload === "string"
        ? payload.slice(0, 500)
        : cleanText(payload?.message || payload?.errorMessage || payload?.code || JSON.stringify(payload), 500);
      throw new YunxiaoError(`云效 OpenAPI 返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`, response.status);
    }
    return { payload, headers: response.headers };
  }

  function paths(account) {
    const org = encodeURIComponent(account.organizationId);
    const root = `/oapi/v1/projex/organizations/${org}`;
    return {
      projex: root,
      projects: `${root}/projects:search`,
      workitems: `${root}/workitems`,
      workitemSearch: `${root}/workitems:search`,
      pipelines: `/oapi/v1/flow/organizations/${org}/pipelines`,
      codeup: `/oapi/v1/codeup/organizations/${org}`,
      testhub: `/oapi/v1/testhub/organizations/${org}`,
      packages: `/oapi/v1/packages/organizations/${org}`
    };
  }

  function totalFrom(headers, page, pageSize, count) {
    const exact = headers.get("x-total") || headers.get("x-total-count") || headers.get("x-content-total");
    if (exact && Number.isFinite(Number(exact))) return Number(exact);
    const pages = Number(headers.get("x-total-pages") || 0);
    return pages ? (pages - 1) * pageSize + count : (page - 1) * pageSize + count;
  }

  async function listProjects(account) {
    const api = paths(account);
    const items = [];
    for (let page = 1; page <= 1000; page += 1) {
      const response = await request(account, api.projects, {
        method: "POST",
        body: {
          conditions: JSON.stringify({ conditionGroups: [[]] }),
          extraConditions: "",
          orderBy: "name",
          page,
          perPage: 200,
          sort: "asc"
        }
      });
      if (!Array.isArray(response.payload)) throw new YunxiaoError("云效项目接口返回格式异常");
      const pageItems = response.payload.filter((item) => item && typeof item === "object");
      items.push(...pageItems);
      const pages = Number(response.headers.get("x-total-pages") || 0);
      if ((pages && page >= pages) || (!pages && pageItems.length < 200)) break;
      if (page === 1000) throw new YunxiaoError("云效项目分页超过安全上限");
    }
    return items
      .map((item) => ({ id: cleanText(item.id || item.identifier, 128), name: cleanText(item.name, 255) }))
      .filter((item) => item.id && item.name);
  }

  async function listDefects(account, projectId, query = {}) {
    const api = paths(account);
    const page = clampInteger(query.page, 1, 1, 10_000);
    const pageSize = clampInteger(query.pageSize, 20, 1, 100);
    const orderBy = cleanText(query.orderBy, 30) === "gmtModified" ? "gmtModified" : "gmtCreate";
    // 状态筛选支持多值：不同缺陷工作项类型下同名状态的 ID 不同，需一起下发
    const statusIds = (Array.isArray(query.statusIds) ? query.statusIds : [])
      .map((item) => cleanText(item, 128))
      .filter(Boolean)
      .slice(0, 50);
    const legacyStatusId = cleanText(query.statusId, 255);
    const statusValues = statusIds.length ? statusIds : legacyStatusId ? [legacyStatusId] : [];
    const filters = [];
    for (const [fieldIdentifier, key, className, format] of [
      ["serialNumber", "serialNumber", "string", "input"],
      ["subject", "subject", "string", "input"],
      ["assignedTo", "assignedToId", "user", "list"]
    ]) {
      const value = cleanText(query[key], 255);
      if (value) filters.push({ fieldIdentifier, operator: "CONTAINS", value: [value], toValue: null, className, format });
    }
    if (statusValues.length) {
      filters.push({ fieldIdentifier: "status", operator: "CONTAINS", value: statusValues, toValue: null, className: "status", format: "list" });
    }
    const response = await request(account, api.workitemSearch, {
      method: "POST",
      body: {
        category: "Bug",
        conditions: JSON.stringify({ conditionGroups: filters.length ? [filters] : [] }),
        orderBy,
        page,
        perPage: pageSize,
        sort: "desc",
        spaceId: projectId,
        spaceType: "Project"
      }
    });
    if (!Array.isArray(response.payload)) throw new YunxiaoError("云效缺陷接口返回格式异常");
    const items = response.payload.filter((item) => item && typeof item === "object").map((item) => mapDefect(projectId, item));
    return { items, total: totalFrom(response.headers, page, pageSize, items.length), page, pageSize };
  }

  async function getDefect(account, projectId, defectId) {
    const api = paths(account);
    const encoded = encodeURIComponent(defectId);
    const itemPath = `${api.workitems}/${encoded}`;
    const [itemResponse, workflowResponse, commentsResponse, attachmentsResponse] = await Promise.all([
      request(account, itemPath),
      requestOptional(account, `${itemPath}/workflow`),
      requestOptional(account, `${itemPath}/comments`),
      requestOptional(account, `${itemPath}/attachments`)
    ]);
    if (!itemResponse.payload || typeof itemResponse.payload !== "object" || Array.isArray(itemResponse.payload)) {
      throw new YunxiaoError("云效缺陷详情接口返回格式异常");
    }
    const warnings = [];
    const statuses = await resolveDefectStatuses(account, api, itemPath, itemResponse.payload, workflowResponse);
    if (!statuses.length) warnings.push("未能读取可选状态");
    if (!commentsResponse.ok) warnings.push("评论读取失败");
    if (!attachmentsResponse.ok) warnings.push("附件读取失败");
    const rawComments = Array.isArray(commentsResponse.payload) ? commentsResponse.payload : [];
    const rawAttachments = Array.isArray(attachmentsResponse.payload) ? attachmentsResponse.payload.slice() : [];
    const knownFileIds = new Set(rawAttachments.map((item) => cleanText(item?.fileId || item?.id, 128)).filter(Boolean));
    const missingFileIds = inlineFileIds([
      cleanTextPreserve(itemResponse.payload.description, 500_000),
      ...rawComments.map((item) => cleanTextPreserve(item?.content, 300_000))
    ]).filter((fileId) => !knownFileIds.has(fileId)).slice(0, 30);
    const inlineFiles = await mapLimit(missingFileIds, 6, async (fileId) => {
      const result = await requestOptional(account, `${itemPath}/files/${encodeURIComponent(fileId)}`);
      if (!result.ok || !result.payload || typeof result.payload !== "object") return null;
      return { fileId, ...result.payload };
    });
    rawAttachments.push(...inlineFiles.filter(Boolean));
    return {
      defect: mapDefect(projectId, itemResponse.payload),
      description: cleanTextPreserve(itemResponse.payload.description, 500_000),
      descriptionFormat: cleanText(itemResponse.payload.formatType || "RICHTEXT", 30),
      statuses,
      comments: rawComments.map(mapComment),
      attachments: rawAttachments.map(mapAttachment).filter((item) => item.url),
      warning: warnings.join("；")
    };
  }

  async function resolveDefectStatuses(account, api, itemPath, item, workflowResponse) {
    let statuses = extractStatuses(workflowResponse.payload);
    if (!statuses.length) {
      const remoteProjectId = cleanText(item.space?.id || item.spaceId || item.projectId, 128);
      const workitemTypeId = cleanText(item.workitemType?.id || item.workitemTypeId, 128);
      if (remoteProjectId && workitemTypeId) {
        const fallback = await requestOptional(
          account,
          `${api.projex}/projects/${encodeURIComponent(remoteProjectId)}/workitemTypes/${encodeURIComponent(workitemTypeId)}/workflows`
        );
        statuses = extractStatuses(fallback.payload);
      }
    }
    return statuses.map((status) => ({ id: cleanText(status.id, 128), name: displayName(status) })).filter((status) => status.id && status.name);
  }

  async function getDefectStatuses(account, projectId, defectId) {
    const api = paths(account);
    const itemPath = `${api.workitems}/${encodeURIComponent(defectId)}`;
    const [itemResponse, workflowResponse] = await Promise.all([
      request(account, itemPath),
      requestOptional(account, `${itemPath}/workflow`)
    ]);
    if (!itemResponse.payload || typeof itemResponse.payload !== "object" || Array.isArray(itemResponse.payload)) {
      throw new YunxiaoError("云效缺陷详情接口返回格式异常");
    }
    const statuses = await resolveDefectStatuses(account, api, itemPath, itemResponse.payload, workflowResponse);
    if (!statuses.length) throw new YunxiaoError("当前缺陷没有可用的工作流状态");
    return statuses;
  }

  async function listProjectWorkitemTypes(account, projectId, category) {
    const api = paths(account);
    const response = await request(
      account,
      `${api.projex}/projects/${encodeURIComponent(projectId)}/workitemTypes`,
      { query: { category } }
    );
    if (!Array.isArray(response.payload)) throw new YunxiaoError("云效工作项类型接口返回格式异常");
    return response.payload
      .filter((item) => item && typeof item === "object" && cleanText(item?.id, 128))
      .map((item) => ({ id: cleanText(item.id, 128), name: displayName(item) }));
  }

  async function listDefectStatusOptions(account, projectId) {
    const api = paths(account);
    const projectPath = `${api.projex}/projects/${encodeURIComponent(projectId)}`;
    let typeError = null;
    let types = [];
    try {
      types = await listProjectWorkitemTypes(account, projectId, "Bug");
    } catch (error) {
      typeError = error;
    }
    const workflowGroups = await mapLimit(types, 4, async (type) => {
      const result = await requestOptional(account, `${projectPath}/workitemTypes/${encodeURIComponent(type.id)}/workflows`);
      return result.ok ? extractStatuses(result.payload) : [];
    });
    const byId = new Map();
    for (const group of workflowGroups) {
      for (const status of group) {
        const id = cleanText(status?.id, 128);
        const name = displayName(status);
        if (id && name && !byId.has(id)) byId.set(id, { id, name });
      }
    }
    if (byId.size) return [...byId.values()];
    // 回退：工作项类型或工作流接口不可用时，从最近缺陷和首个缺陷的工作流收集状态
    const fallback = new Map();
    try {
      const recent = await listDefects(account, projectId, { page: 1, pageSize: 100 });
      for (const item of recent.items || []) {
        if (item.statusId && item.statusName) fallback.set(item.statusId, { id: item.statusId, name: item.statusName });
      }
      const firstId = recent.items?.[0]?.id;
      if (firstId) {
        for (const status of await getDefectStatuses(account, projectId, firstId)) {
          if (status.id && status.name) fallback.set(status.id, status);
        }
      }
    } catch (error) {
      throw typeError || error;
    }
    if (fallback.size) return [...fallback.values()];
    throw typeError || new YunxiaoError("未能读取项目的缺陷状态列表", 502);
  }

  async function resolveNotificationStatuses(account, projectId) {
    const recent = await listDefects(account, projectId, { page: 1, pageSize: 100, orderBy: "gmtModified" });
    const candidates = (recent.items || [])
      .filter((item) => item.statusId && notificationStatusKind(item.statusName))
      .map((item) => ({ id: item.statusId, name: item.statusName }));
    if (recent.items?.[0]?.id && new Set(candidates.map((item) => notificationStatusKind(item.name))).size < 2) {
      try {
        candidates.push(...await getDefectStatuses(account, projectId, recent.items[0].id));
      } catch (error) {}
    }
    const byKind = new Map();
    for (const status of candidates) {
      const kind = notificationStatusKind(status.name);
      if (kind && !byKind.has(kind)) byKind.set(kind, { id: cleanText(status.id, 128), name: cleanText(status.name, 100) });
    }
    const statuses = [byKind.get("pending"), byKind.get("reopened")].filter(Boolean);
    if (statuses.length < 2) throw new YunxiaoError("未能识别“待确认”和“再次打开”的状态 ID，请先在缺陷列表中确认这两个状态可用", 422);
    return statuses;
  }

  async function requestOptional(account, pathname, options) {
    try {
      const result = await request(account, pathname, options);
      return { ...result, ok: true };
    } catch (error) {
      return { payload: null, headers: new Headers(), ok: false, error };
    }
  }

  async function updateDefectStatus(account, projectId, defectId, statusId) {
    const api = paths(account);
    const itemPath = `${api.workitems}/${encodeURIComponent(defectId)}`;
    await request(account, itemPath, { method: "PUT", body: { status: statusId } });
    const latest = await request(account, itemPath);
    if (!latest.payload || typeof latest.payload !== "object") throw new YunxiaoError("状态已提交，但读取最新缺陷失败");
    return mapDefect(projectId, latest.payload);
  }

  async function updateDefectAssignee(account, projectId, defectId, assignedToId) {
    const api = paths(account);
    const itemPath = `${api.workitems}/${encodeURIComponent(defectId)}`;
    await request(account, itemPath, { method: "PUT", body: { assignedTo: assignedToId } });
    const latest = await request(account, itemPath);
    if (!latest.payload || typeof latest.payload !== "object") throw new YunxiaoError("负责人已提交，但读取最新缺陷失败");
    return mapDefect(projectId, latest.payload);
  }

  async function listProjectMembers(account, projectId) {
    if (!cleanText(projectId, 128)) throw new YunxiaoError("请先选择项目", 422);
    const api = paths(account);
    const membersPath = `${api.projex}/projects/${encodeURIComponent(projectId)}/members`;
    const response = await request(account, membersPath);
    if (!Array.isArray(response.payload)) throw new YunxiaoError("云效项目成员接口返回格式异常");
    const byId = new Map();
    for (const member of response.payload.filter((item) => item && typeof item === "object")) {
      const idValue = cleanText(member.userId || member.id, 128);
      if (!idValue || byId.has(idValue)) continue;
      byId.set(idValue, { id: idValue, name: cleanText(member.userName || member.name || member.displayName, 255) || idValue });
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }

  async function createDefectComment(account, projectId, defectId, content) {
    const api = paths(account);
    const value = cleanTextPreserve(content, 10_000).trim();
    if (!value) throw new YunxiaoError("评论内容不能为空", 422);
    const response = await request(account, `${api.workitems}/${encodeURIComponent(defectId)}/comments`, {
      method: "POST",
      body: { content: value }
    });
    const id = cleanText(response.payload?.id, 128);
    if (!id) throw new YunxiaoError("评论已提交，但云效接口未返回评论 ID");
    return { id, projectId, defectId };
  }

  // 云效附件列表返回的 url 是临时下载地址，有时效性；
  // 此处用 GetWorkitemFile 按 fileId 实时换取新的下载地址。
  async function getAttachmentLink(account, projectId, defectId, fileId) {
    const api = paths(account);
    const response = await request(account, `${api.workitems}/${encodeURIComponent(defectId)}/files/${encodeURIComponent(fileId)}`);
    const payload = response.payload && typeof response.payload === "object" && !Array.isArray(response.payload) ? response.payload : {};
    const file = payload.workitemFile && typeof payload.workitemFile === "object" ? payload.workitemFile : payload;
    const url = cleanTextPreserve(file.url, 4000);
    if (!url) throw new YunxiaoError("云效未返回附件下载地址", 502);
    return {
      fileId: cleanText(file.id || fileId, 128),
      fileName: cleanText(file.name || file.fileName, 500),
      suffix: cleanText(file.suffix, 30),
      size: Number(file.size || 0),
      url
    };
  }

  // 缺陷“处理”到会话时需要把图片转成 base64；云效 OSS 直链不允许浏览器跨域读取，
  // 因此在宿主侧下载后再返回，供会话消息和输入框草稿直接使用。
  async function getAttachmentData(account, projectId, defectId, fileId, options = {}) {
    const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : 10_000_000;
    const link = await getAttachmentLink(account, projectId, defectId, fileId);
    let response;
    try {
      response = await fetch(link.url, { cache: "no-store", signal: AbortSignal.timeout(config.timeoutMs) });
    } catch (error) {
      throw new YunxiaoError(`下载附件失败：${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new YunxiaoError(`下载附件失败：HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength) throw new YunxiaoError("附件内容为空", 502);
    if (buffer.byteLength > maxBytes) throw new YunxiaoError(`附件超过 ${Math.round(maxBytes / 1024 / 1024)}MB 限制`, 413);
    const headerType = cleanText(response.headers.get("content-type"), 100).split(";")[0].trim().toLowerCase();
    const mediaType = IMAGE_MEDIA_TYPES.has(headerType) ? headerType : mediaTypeFromSuffix(link.suffix || link.fileName);
    return {
      fileId: link.fileId,
      fileName: link.fileName,
      size: buffer.byteLength,
      mediaType,
      data: buffer.toString("base64")
    };
  }

  async function listPipelines(account, query = {}) {
    const api = paths(account);
    const page = clampInteger(query.page, 1, 1, 10_000);
    const pageSize = clampInteger(query.pageSize, 20, 1, 30);
    const response = await request(account, api.pipelines, {
      query: { page, perPage: pageSize, pipelineName: cleanText(query.keyword, 255), statusList: cleanText(query.statuses, 200) }
    });
    if (!Array.isArray(response.payload)) throw new YunxiaoError("云效流水线列表接口返回格式异常");
    const rawItems = response.payload.filter((item) => item && typeof item === "object");
    const latest = await mapLimit(rawItems, 6, async (item) => {
      const id = cleanText(item.pipelineId || item.id, 128);
      if (!id) return null;
      const result = await requestOptional(account, `${api.pipelines}/${encodeURIComponent(id)}/runs/latestPipelineRun`);
      return result.payload && typeof result.payload === "object" ? result.payload : null;
    });
    const items = rawItems.map((item, index) => mapPipeline({ ...item, latestRun: latest[index] || item.latestRun }));
    return { items, total: totalFrom(response.headers, page, pageSize, items.length), page, pageSize, scope: "organization" };
  }

  async function getPipeline(account, pipelineId) {
    const api = paths(account);
    const response = await request(account, `${api.pipelines}/${encodeURIComponent(pipelineId)}`);
    const item = response.payload;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new YunxiaoError("云效流水线详情接口返回格式异常");
    let pipelineConfig = item.pipelineConfig;
    if (typeof pipelineConfig === "string") {
      try { pipelineConfig = JSON.parse(pipelineConfig); } catch { pipelineConfig = {}; }
    }
    if (!pipelineConfig || typeof pipelineConfig !== "object" || Array.isArray(pipelineConfig)) pipelineConfig = {};
    let sourceValue = Array.isArray(item.sources) ? item.sources : pipelineConfig.sources;
    if (typeof sourceValue === "string") {
      try { sourceValue = JSON.parse(sourceValue); } catch { sourceValue = []; }
    }
    const sources = Array.isArray(sourceValue) ? sourceValue.filter((source) => source && typeof source === "object") : [];
    return {
      pipeline: mapPipeline(item),
      envId: Number.isInteger(item.envId) ? item.envId : null,
      envName: cleanText(item.envName, 255),
      groupId: cleanText(item.groupId, 128),
      pipelineType: cleanText(item.type || item.pipelineType, 100),
      sources: sources.map(mapPipelineSource),
      settings: cleanTextPreserve(pipelineConfig.settings, 200_000)
    };
  }

  // 分页读取一个 Codeup 仓库的全部分支；403 时区分“令牌无 Codeup API 权限”与
  // “令牌用户不在代码库成员里”，两者在界面上给出不同的修复提示。
  async function listRepositoryBranches(account, repositoryPath) {
    const api = paths(account);
    const result = { branches: [], warning: "" };
    let codeupApiAuthorized;
    for (let page = 1; page <= 100; page += 1) {
      const response = await requestOptional(
        account,
        `${api.codeup}/repositories/${encodeURIComponent(repositoryPath)}/branches`,
        { query: { page, perPage: 100, sort: "updated_desc" } }
      );
      if (!response.ok || !Array.isArray(response.payload)) {
        if (response.error?.status === 403) {
          if (codeupApiAuthorized === undefined) {
            const probe = await requestOptional(account, `${api.codeup}/repositories`, { query: { page: 1, perPage: 1 } });
            codeupApiAuthorized = probe.ok && Array.isArray(probe.payload);
          }
          result.warning = codeupApiAuthorized
            ? "令牌的代码管理 API 权限已生效，但令牌所属用户无此代码库访问权限；请将该用户加入代码库成员"
            : "当前令牌没有 Codeup 分支读取权限；请检查“代码管理 → 分支 → 只读”权限";
        } else result.warning = "分支读取失败，可稍后重试";
        break;
      }
      const pageBranches = response.payload.map((item) => cleanText(item?.name, 500)).filter(Boolean);
      result.branches.push(...pageBranches);
      const pages = Number(response.headers.get("x-total-pages") || 0);
      if ((pages && page >= pages) || (!pages && pageBranches.length < 100)) break;
      if (page === 100) result.warning = "分支超过读取上限，仅展示前 10000 条";
    }
    result.branches = [...new Set(result.branches)];
    return result;
  }

  async function listPipelineBranches(account, pipelineId) {
    const api = paths(account);
    const detail = await getPipeline(account, pipelineId);
    const results = [];
    for (const source of detail.sources) {
      const result = { ...source, branches: [], warning: "" };
      const repositoryPath = codeupRepositoryPath(source.repo);
      const isCodeupLike = ["codeup", "aliyungit"].includes(source.type.toLowerCase());
      if (!isCodeupLike || !repositoryPath) {
        result.warning = isCodeupLike
          ? "未识别到 Codeup 仓库地址，请手动填写分支"
          : "非 Codeup 代码源，可手动填写分支";
        results.push(result);
        continue;
      }
      const read = await listRepositoryBranches(account, repositoryPath);
      result.branches = read.branches;
      result.warning = read.warning;
      results.push(result);
    }
    return results;
  }

  async function listPipelineRuns(account, pipelineId, query = {}) {
    const api = paths(account);
    const page = clampInteger(query.page, 1, 1, 10_000);
    const pageSize = clampInteger(query.pageSize, 10, 1, 30);
    const base = `${api.pipelines}/${encodeURIComponent(pipelineId)}/runs`;
    const response = await request(account, base, { query: { page, perPage: pageSize, status: cleanText(query.status, 30) } });
    if (!Array.isArray(response.payload)) throw new YunxiaoError("流水线运行记录接口返回格式异常");
    const rawItems = response.payload.filter((item) => item && typeof item === "object");
    const details = await mapLimit(rawItems, 6, async (item) => {
      const id = cleanText(item.pipelineRunId || item.id, 128);
      if (!id) return null;
      const result = await requestOptional(account, `${base}/${encodeURIComponent(id)}`);
      return result.payload && typeof result.payload === "object" ? result.payload : null;
    });
    const items = rawItems.map((item, index) => mapPipelineRun({ ...item, ...(details[index] || {}) }));
    return { items, total: totalFrom(response.headers, page, pageSize, items.length), page, pageSize };
  }

  async function getPipelineRun(account, pipelineId, pipelineRunId) {
    const api = paths(account);
    const response = await request(account, `${api.pipelines}/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(pipelineRunId)}`);
    if (!response.payload || typeof response.payload !== "object") throw new YunxiaoError("流水线运行详情接口返回格式异常");
    return mapPipelineRun(response.payload);
  }

  async function getPipelineJobLog(account, pipelineId, pipelineRunId, jobId) {
    const api = paths(account);
    const response = await request(
      account,
      `${api.pipelines}/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(pipelineRunId)}/job/${encodeURIComponent(jobId)}/log`
    );
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    return { content: cleanTextPreserve(payload.content, 1_000_000), last: Number(payload.last || 0), more: Boolean(payload.more) };
  }

  async function createPipelineRun(account, pipelineId, input = {}) {
    const api = paths(account);
    const params = {};
    const branchMode = Array.isArray(input.branchModeBranches) ? input.branchModeBranches.map((item) => cleanText(item, 500)).filter(Boolean) : [];
    const running = cleanMapping(input.runningBranches, 20, 500);
    const comment = cleanText(input.comment, 1000);
    if (branchMode.length) params.branchModeBranchs = [...new Set(branchMode)].slice(0, 100);
    if (Object.keys(running).length) params.runningBranchs = running;
    if (comment) params.comment = comment;
    const response = await request(account, `${api.pipelines}/${encodeURIComponent(pipelineId)}/runs`, {
      method: "POST",
      body: { params: JSON.stringify(params) }
    });
    const id = typeof response.payload === "string" || typeof response.payload === "number"
      ? String(response.payload)
      : cleanText(response.payload?.pipelineRunId || response.payload?.id, 128);
    if (!id) throw new YunxiaoError("云效运行流水线接口未返回运行实例 ID");
    return { pipelineId, pipelineRunId: id };
  }

  // —— 代码 Codeup：仓库 / 合并请求 ——————————————————————————————————————
  // Codeup 组织级 API 对仓库使用 pathWithNamespace 形式的编码路径（org/repo），
  // 与分支读取一致；字段命名在不同版本里存在 camelCase / snake_case 差异，读取时两者兼容。
  async function listCodeupRepositories(account, query = {}) {
    const api = paths(account);
    const page = clampInteger(query.page, 1, 1, 10_000);
    const pageSize = clampInteger(query.pageSize, 20, 1, 100);
    const response = await request(account, `${api.codeup}/repositories`, {
      query: { page, perPage: pageSize, search: cleanText(query.search, 255) }
    });
    if (!Array.isArray(response.payload)) throw new YunxiaoError("云效代码库列表接口返回格式异常");
    const items = response.payload
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: cleanText(item.id, 64),
        path: cleanText(item.pathWithNamespace || item.path, 500),
        name: cleanText(item.name || item.path, 500),
        description: cleanText(item.description, 500),
        defaultBranch: cleanText(item.default_branch || item.defaultBranch, 500),
        visibility: cleanText(item.visibility_level || item.visibility, 60),
        lastActivityAt: item.last_activity_at || item.lastActivityAt || item.updatedAt || null
      }))
      .filter((item) => item.id && item.path);
    return { items, total: totalFrom(response.headers, page, pageSize, items.length), page, pageSize };
  }

  async function listCodeupMergeRequests(account, repositoryPath, query = {}) {
    const api = paths(account);
    const page = clampInteger(query.page, 1, 1, 10_000);
    const pageSize = clampInteger(query.pageSize, 20, 1, 100);
    const state = cleanText(query.state, 20) || "opened";
    const response = await request(account, `${api.codeup}/repositories/${encodeURIComponent(repositoryPath)}/merge_requests`, {
      query: { state, page, perPage: pageSize }
    });
    if (!Array.isArray(response.payload)) throw new YunxiaoError("云效合并请求接口返回格式异常");
    const pick = (item, ...keys) => {
      for (const key of keys) {
        const value = item?.[key];
        if (value !== undefined && value !== null && value !== "") return value;
      }
      return null;
    };
    const items = response.payload
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: cleanText(pick(item, "id", "iid", "mergeRequestId"), 64),
        title: cleanText(pick(item, "title", "name"), 1000),
        state: cleanText(pick(item, "state", "status"), 40),
        sourceBranch: cleanText(pick(item, "source_branch", "sourceBranch", "sourceBranchName"), 500),
        targetBranch: cleanText(pick(item, "target_branch", "targetBranch", "targetBranchName"), 500),
        authorName: cleanText(pick(item, "author_name", "authorName") || displayName(pick(item, "author", "creator")), 255),
        createdAt: pick(item, "created_at", "createdAt", "gmtCreate"),
        updatedAt: pick(item, "updated_at", "updatedAt", "gmtModified")
      }))
      .filter((item) => item.id);
    return { items, total: totalFrom(response.headers, page, pageSize, items.length), page, pageSize, state };
  }

  // 合并属于写操作：接口不存在或无权限时直接报错，由界面提示改走云效页面。
  async function mergeCodeupMergeRequest(account, repositoryPath, mergeRequestId) {
    const api = paths(account);
    if (!cleanText(repositoryPath, 500) || !cleanText(mergeRequestId, 64)) {
      throw new YunxiaoError("仓库与合并请求 ID 不能为空", 422);
    }
    await request(
      account,
      `${api.codeup}/repositories/${encodeURIComponent(repositoryPath)}/merge_requests/${encodeURIComponent(mergeRequestId)}/merge`,
      { method: "POST", body: {} }
    );
    return { ok: true };
  }

  // 创建合并请求（CreateChangeRequest）：源库与目标库同为本仓库，仓库需使用数字 ID；
  // workItemIds 把 MR 关联到触发它的缺陷。
  async function createChangeRequest(account, repositoryId, input = {}) {
    const api = paths(account);
    const repoId = cleanText(repositoryId, 64);
    const sourceBranch = cleanText(input.sourceBranch, 255);
    const targetBranch = cleanText(input.targetBranch, 255);
    const title = cleanText(input.title, 256);
    if (!repoId || !sourceBranch || !targetBranch || !title) {
      throw new YunxiaoError("创建合并请求需要仓库 ID、源分支、目标分支与标题", 422);
    }
    if (!/^\d+$/.test(repoId)) throw new YunxiaoError("创建合并请求需要 Codeup 仓库的数字 ID", 422);
    const body = {
      sourceBranch,
      targetBranch,
      title,
      description: cleanTextPreserve(input.description, 10_000),
      sourceProjectId: Number(repoId),
      targetProjectId: Number(repoId)
    };
    const workItemIds = cleanStringList(input.workItemIds, 20, 128);
    if (workItemIds.length) body.workItemIds = workItemIds.join(",");
    const response = await request(account, `${api.codeup}/repositories/${encodeURIComponent(repoId)}/changeRequests`, {
      method: "POST",
      body
    });
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    return {
      localId: cleanText(payload.localId ?? payload.iid ?? payload.id, 64),
      url: cleanTextPreserve(payload.detailUrl || payload.webUrl || payload.web_url, 4000),
      status: cleanText(payload.status || payload.state, 40),
      sourceBranch,
      targetBranch,
      title
    };
  }

  // —— 测试管理 / 制品仓库 ————————————————————————————————————————————————
  // 测试计划列表使用官方 projex 域接口（POST testPlan/list）；
  // testhub 域下没有 testplans 端点（会 404），列表接口也不返回用例统计，
  // 用例通过率需按计划再调 GetTestResultList，这里先展示计划基本信息。
  async function listTestPlans(account, query = {}) {
    const api = paths(account);
    const page = clampInteger(query.page, 1, 1, 10_000);
    const pageSize = clampInteger(query.pageSize, 20, 1, 100);
    const response = await request(account, `${api.projex}/testPlan/list`, {
      method: "POST",
      query: { page, perPage: pageSize },
      body: {}
    });
    const payload = Array.isArray(response.payload)
      ? response.payload
      : Array.isArray(response.payload?.items || response.payload?.list) ? response.payload.items || response.payload.list : null;
    if (!Array.isArray(payload)) throw new YunxiaoError("云效测试计划接口返回格式异常");
    const pick = (item, ...keys) => {
      for (const key of keys) {
        const value = item?.[key];
        if (value !== undefined && value !== null && value !== "") return value;
      }
      return null;
    };
    const items = payload
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: cleanText(pick(item, "testPlanIdentifier", "id", "testplanId", "planId"), 64),
        name: cleanText(pick(item, "name", "title", "subject"), 500) || "未命名测试计划",
        status: cleanText(pick(item, "status", "statusName", "state"), 60),
        caseTotal: clampInteger(pick(item, "caseTotal", "total", "caseCount"), 0, 0, 1_000_000),
        casePassed: clampInteger(pick(item, "casePassed", "passed", "passCount"), 0, 0, 1_000_000),
        caseFailed: clampInteger(pick(item, "caseFailed", "failed", "failCount"), 0, 0, 1_000_000),
        ownerName: Array.isArray(item?.managers) && item.managers.length
          ? cleanText(String(item.managers[0]), 255)
          : cleanText(pick(item, "ownerName", "owner", "creatorName"), 255),
        gmtModified: pick(item, "gmtCreate", "gmtModified", "updatedAt", "modifiedAt"),
        spaceIdentifier: cleanText(pick(item, "spaceIdentifier"), 64),
        sprintIdentifier: cleanText(pick(item, "sprintIdentifier"), 64),
        startDate: pick(item, "startDate"),
        endDate: pick(item, "endDate")
      }))
      .filter((item) => item.id);
    return { items, total: totalFrom(response.headers, page, pageSize, items.length), page, pageSize };
  }

  async function listPackageRepositories(account, query = {}) {
    const api = paths(account);
    const page = clampInteger(query.page, 1, 1, 10_000);
    const pageSize = clampInteger(query.pageSize, 20, 1, 100);
    const response = await request(account, `${api.packages}/repositories`, { query: { page, perPage: pageSize } });
    const payload = Array.isArray(response.payload)
      ? response.payload
      : Array.isArray(response.payload?.items || response.payload?.list) ? response.payload.items || response.payload.list : null;
    if (!Array.isArray(payload)) throw new YunxiaoError("云效制品仓库接口返回格式异常");
    const pick = (item, ...keys) => {
      for (const key of keys) {
        const value = item?.[key];
        if (value !== undefined && value !== null && value !== "") return value;
      }
      return null;
    };
    const items = payload
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: cleanText(pick(item, "id", "repositoryId", "repoId"), 64),
        name: cleanText(pick(item, "name", "repositoryName", "repoName"), 500),
        type: cleanText(pick(item, "type", "repositoryType", "packageType"), 100),
        description: cleanText(pick(item, "description", "remark"), 500),
        createdAt: pick(item, "createdAt", "gmtCreate", "created_at")
      }))
      .filter((item) => item.id && item.name);
    return { items, total: totalFrom(response.headers, page, pageSize, items.length), page, pageSize };
  }

  return {
    listProjects,
    listDefects,
    getDefect,
    getAttachmentLink,
    getAttachmentData,
    getDefectStatuses,
    listDefectStatusOptions,
    resolveNotificationStatuses,
    updateDefectStatus,
    updateDefectAssignee,
    listProjectMembers,
    createDefectComment,
    listPipelines,
    getPipeline,
    listPipelineBranches,
    listPipelineRuns,
    getPipelineRun,
    getPipelineJobLog,
    createPipelineRun,
    listCodeupRepositories,
    listRepositoryBranches,
    listCodeupMergeRequests,
    mergeCodeupMergeRequest,
    createChangeRequest,
    listTestPlans,
    listPackageRepositories
  };
}

function cleanTextPreserve(value, max) {
  return String(value ?? "").slice(0, max);
}

function inlineFileIds(contents) {
  const result = new Set();
  const patterns = [
    /\/files\/([A-Za-z0-9_-]{8,128})(?:[/?#]|$)/gi,
    /(?:fileIdentifier|fileId|file_id)=([A-Za-z0-9_-]{8,128})(?:[&#"']|$)/gi,
    /(?:data-file-id|data-fileid|file-id|fileid)=["']([A-Za-z0-9_-]{8,128})["']/gi
  ];
  for (const content of contents) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) result.add(match[1]);
    }
  }
  return [...result];
}

function displayName(value) {
  return value && typeof value === "object" ? cleanText(value.displayName || value.name, 255) : "";
}

function customDisplay(item, keywords) {
  for (const field of Array.isArray(item.customFieldValues) ? item.customFieldValues : []) {
    const nameValue = cleanText(field?.fieldName || field?.fieldId, 255).toLowerCase();
    if (!keywords.some((keyword) => nameValue.includes(keyword.toLowerCase()))) continue;
    if (Array.isArray(field.values)) {
      return field.values.map((value) => cleanText(value?.displayValue || value?.name, 255)).filter(Boolean).join("、");
    }
    return cleanText(field.values, 255);
  }
  return "";
}

function mapDefect(projectId, item) {
  return {
    projectId,
    id: cleanText(item.id || item.identifier, 128),
    serialNumber: cleanText(item.serialNumber || item.serialNo, 128),
    subject: cleanText(item.subject || item.title, 1000),
    statusId: cleanText(item.status?.id, 128),
    statusName: displayName(item.status),
    workitemType: displayName(item.workitemType) || "缺陷",
    assignedToId: cleanText(item.assignedTo?.id, 128),
    assignedToName: displayName(item.assignedTo),
    modifierName: displayName(item.modifier),
    creatorName: displayName(item.creator),
    sprintName: displayName(item.sprint),
    priority: customDisplay(item, ["priority", "优先级"]),
    severity: customDisplay(item, ["severity", "严重程度", "严重级别"]),
    gmtCreate: item.gmtCreate || null,
    gmtModified: item.gmtModified || null
  };
}

function extractStatuses(value) {
  if (Array.isArray(value)) {
    const direct = value.filter((item) => item && typeof item === "object" && item.id && (item.displayName || item.name));
    if (direct.length) return direct;
    for (const item of value) {
      const found = extractStatuses(item);
      if (found.length) return found;
    }
  } else if (value && typeof value === "object") {
    if (Array.isArray(value.statuses)) return value.statuses.filter((item) => item && typeof item === "object");
    for (const key of ["workflows", "data", "result"]) {
      const found = extractStatuses(value[key]);
      if (found.length) return found;
    }
  }
  return [];
}

function mapComment(item) {
  return {
    id: cleanText(item?.id, 128),
    parentId: cleanText(item?.parentId, 128),
    userName: displayName(item?.user),
    content: cleanTextPreserve(item?.content, 300_000),
    contentFormat: cleanText(item?.contentFormat || "RICHTEXT", 30),
    gmtCreate: item?.gmtCreate || null,
    gmtModified: item?.gmtModified || null,
    top: Boolean(item?.top)
  };
}

function mapAttachment(item) {
  return {
    fileId: cleanText(item?.fileId || item?.id, 128),
    fileName: cleanText(item?.fileName || item?.name || "附件", 500),
    suffix: cleanText(item?.suffix, 30),
    size: Number(item?.size || 0),
    url: cleanTextPreserve(item?.url, 4000),
    creatorName: displayName(item?.creator),
    gmtCreate: item?.gmtCreate || null
  };
}

function mapPipeline(item) {
  const latest = item.latestRun && typeof item.latestRun === "object" ? item.latestRun : {};
  return {
    id: cleanText(item.pipelineId || item.id, 128),
    name: cleanText(item.pipelineName || item.name || "未命名流水线", 500),
    status: cleanText(item.status || latest.status, 50),
    createAccountId: cleanText(item.createAccountId || item.creatorAccountId, 128),
    createTime: item.createTime || null,
    updateTime: item.updateTime || latest.updateTime || null,
    latestRunId: cleanText(item.pipelineRunId || latest.pipelineRunId, 128)
  };
}

function mapPipelineSource(item) {
  const data = item.data && typeof item.data === "object" ? item.data : {};
  const repo = cleanText(data.repo || data.repoUrl || data.repositoryUrl || item.repo || item.repoUrl, 2000);
  return {
    sourceId: cleanText(item.sign || item.name || repo, 500),
    name: cleanText(item.label || data.label || item.name || repo || "代码源", 500),
    type: cleanText(item.type, 100),
    repo,
    defaultBranch: cleanText(data.branch, 500),
    isBranchMode: Boolean(data.isBranchMode)
  };
}

function mapPipelineRun(item) {
  let stages = Array.isArray(item.stages) ? item.stages : item.stageGroup;
  if (!Array.isArray(stages)) stages = [];
  const globalParams = (Array.isArray(item.globalParams) ? item.globalParams : []).filter((entry) => entry && typeof entry === "object").map((entry) => ({
    ...entry,
    value: entry.encrypted ? "******" : entry.value
  }));
  return {
    pipelineId: cleanText(item.pipelineId, 128),
    pipelineRunId: cleanText(item.pipelineRunId || item.id, 128),
    status: cleanText(item.status, 50),
    creatorAccountId: cleanText(item.creatorAccountId, 128),
    triggerMode: Number.isInteger(item.triggerMode) ? item.triggerMode : null,
    startTime: item.startTime || item.createTime || null,
    endTime: item.endTime || null,
    stages,
    sources: Array.isArray(item.sources) ? item.sources : [],
    globalParams
  };
}

function cleanMapping(value, maxItems, maxLength) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value).slice(0, maxItems)) {
    const cleanKey = cleanText(key, 500);
    const cleanValue = cleanText(item, maxLength);
    if (cleanKey && cleanValue) result[cleanKey] = cleanValue;
  }
  return result;
}

function codeupRepositoryPath(repo) {
  const text = String(repo ?? "").trim();
  if (!text) return "";
  // SSH 形式（git@codeup.aliyun.com:org/repo.git）无法被 URL 解析，单独识别
  const scpLike = text.match(/^(?:ssh:\/\/)?git@([^/:]+)[:/](.+)$/i);
  if (scpLike) {
    if (!scpLike[1].toLowerCase().includes("codeup")) return "";
    return scpLike[2].replace(/^\/+/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  }
  try {
    const url = new URL(text);
    if (!url.hostname.toLowerCase().includes("codeup")) return "";
    return url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  } catch {
    return "";
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new YunxiaoError("请求内容过大", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    throw new YunxiaoError("请求 JSON 格式错误", 400);
  }
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(payload));
}

// 各平台的原生通知渠道。识别结果写入数据文件的 system 字段，
// 后续通知直接复用，只在进程平台与记录不一致（如数据文件被搬迁）时重新识别。
const SYSTEM_NOTIFICATION_CHANNELS = {
  win32: "windows-toast",
  darwin: "macos-osascript"
};

function detectNotificationChannel(platform = process.platform) {
  return SYSTEM_NOTIFICATION_CHANNELS[platform] || "none";
}

async function resolveSystemChannel(store, options = {}) {
  const platform = options.platform || process.platform;
  const stored = await store.getSystemInfo();
  if (stored && stored.platform === platform && stored.channel) return stored.channel;
  const channel = detectNotificationChannel(platform);
  await store.saveSystemInfo({ platform, channel, detectedAt: new Date().toISOString() });
  return channel;
}

async function showWindowsNotification(title, body, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== "win32") return { supported: false, accepted: false, channel: "unsupported" };
  const spawnProcess = options.spawnProcess || spawn;
  const safeTitle = cleanText(title, 100) || "云效缺陷提醒";
  const safeBody = cleanText(body, 500) || "有新的缺陷需要处理";
  const safeTag = cleanText(options.tag, 64) || `dyx-${Date.now()}`;
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$title = [Environment]::GetEnvironmentVariable('DYX_NOTIFICATION_TITLE')
$body = [Environment]::GetEnvironmentVariable('DYX_NOTIFICATION_BODY')
$tag = [Environment]::GetEnvironmentVariable('DYX_NOTIFICATION_TAG')
$logPath = [Environment]::GetEnvironmentVariable('DYX_NOTIFICATION_LOG')
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml('<toast scenario="urgent" duration="long"><visual><binding template="ToastGeneric"><text></text><text></text></binding></visual></toast>')
  $texts = $xml.GetElementsByTagName('text')
  $null = $texts.Item(0).AppendChild($xml.CreateTextNode($title))
  $null = $texts.Item(1).AppendChild($xml.CreateTextNode($body))
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  $toast.Tag = $tag
  $appId = ''
  try {
    $apps = Get-StartApps
    $app = $apps | Where-Object { $_.AppID -eq 'io.github.hairyf.deepseek-harness-desktop' } | Select-Object -First 1
    if (-not $app) { $app = $apps | Where-Object { $_.Name -match 'DeepSeek|Harness' } | Select-Object -First 1 }
    if ($app -and $app.AppID) { $appId = [string]$app.AppID }
  } catch {}
  if (-not $appId) { $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe' }
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  if ($logPath) { ('toast: ' + $_.Exception.Message) | Add-Content -LiteralPath $logPath -Encoding UTF8 }
}`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const child = spawnProcess("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Sta",
    "-WindowStyle",
    "Hidden",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encoded
  ], {
    // detached: true 会让 powershell.exe 以 DETACHED_PROCESS 启动后立即退出，
    // 脚本完全不会执行（Toast 与窗口都不会出现），因此这里必须保持默认。
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      DYX_NOTIFICATION_TITLE: safeTitle,
      DYX_NOTIFICATION_BODY: safeBody,
      DYX_NOTIFICATION_TAG: safeTag,
      DYX_NOTIFICATION_LOG: path.resolve(process.cwd(), "dsh-yunxiao-notification.log")
    }
  });
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new YunxiaoError(`Windows 原生通知启动失败：${error.message}`, 500)));
    child.once("spawn", () => {
      if (typeof child.unref === "function") child.unref();
      resolve({ supported: true, accepted: true, channel: "windows-toast" });
    });
  });
}

async function openWindowsNotificationSettings(options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== "win32") return { supported: false, accepted: false };
  const spawnProcess = options.spawnProcess || spawn;
  const child = spawnProcess("explorer.exe", ["ms-settings:notifications"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new YunxiaoError(`Windows 通知设置打开失败：${error.message}`, 500)));
    child.once("spawn", () => {
      if (typeof child.unref === "function") child.unref();
      resolve({ supported: true, accepted: true });
    });
  });
}

async function showMacNotification(title, body, options = {}) {
  const spawnProcess = options.spawnProcess || spawn;
  const safeTitle = cleanText(title, 100) || "云效缺陷提醒";
  const safeBody = cleanText(body, 500) || "有新的缺陷需要处理";
  // 标题与正文经 argv 传入 run 处理器，避免拼进 AppleScript 源码带来转义问题。
  // sound name "default" 播放系统默认通知音（跟随 系统设置→声音→提示音 的选择）；
  // 也可改为 /System/Library/Sounds/ 下的具体音效名，如 Glass、Ping、Hero。
  const script = "on run argv\n\ndisplay notification (item 2 of argv) with title (item 1 of argv) sound name \"default\"\n\nend run";
  const child = spawnProcess("osascript", ["-e", script, safeTitle, safeBody], {
    stdio: "ignore"
  });
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new YunxiaoError(`macOS 原生通知启动失败：${error.message}`, 500)));
    child.once("spawn", () => {
      if (typeof child.unref === "function") child.unref();
      resolve({ supported: true, accepted: true, channel: "macos-osascript" });
    });
  });
}

async function openMacNotificationSettings(options = {}) {
  const spawnProcess = options.spawnProcess || spawn;
  const child = spawnProcess("open", ["x-apple.systempreferences:com.apple.preference.notifications"], {
    detached: true,
    stdio: "ignore"
  });
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new YunxiaoError(`macOS 通知设置打开失败：${error.message}`, 500)));
    child.once("spawn", () => {
      if (typeof child.unref === "function") child.unref();
      resolve({ supported: true, accepted: true });
    });
  });
}

function systemNotifierFor(channel) {
  if (channel === "windows-toast") return showWindowsNotification;
  if (channel === "macos-osascript") return showMacNotification;
  return null;
}

// 系统通知统一入口：渠道已明确时直接分发，否则按数据文件记录（无记录时即时探测）。
async function showSystemNotification(title, body, options = {}) {
  const channel = options.channel
    || (options.store ? await resolveSystemChannel(options.store, { platform: options.platform }) : detectNotificationChannel(options.platform));
  const notifier = systemNotifierFor(channel);
  if (!notifier) return { supported: false, accepted: false, channel: "unsupported" };
  return notifier(title, body, options);
}

async function openSystemNotificationSettings(options = {}) {
  const channel = options.channel
    || (options.store ? await resolveSystemChannel(options.store, { platform: options.platform }) : detectNotificationChannel(options.platform));
  if (channel === "windows-toast") return openWindowsNotificationSettings(options);
  if (channel === "macos-osascript") return openMacNotificationSettings(options);
  return { supported: false, accepted: false };
}

// —— 剪贴板图片写入 ——————————————————————————————————————————————————
// 插件进程里拿不到 Electron API（desktop-host 把 Electron 二进制当 Node 跑），
// 渲染进程的异步剪贴板又可能被权限/焦点拒绝，所以借系统工具写剪贴板：
// macOS 用 osascript 读 PNG 进剪贴板（与原生通知同一通道），Windows 用
// PowerShell Forms（与原生通知同一 STA 模式）。其余平台返回 supported:false，
// 客户端回退到 navigator.clipboard。
const CLIPBOARD_IMAGE_MAX_BASE64 = 30_000_000;

function runClipboardChild(spawnProcess, command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: "ignore", windowsHide: true, env: { ...process.env, ...env } });
    const timer = setTimeout(() => reject(new YunxiaoError("剪贴板命令执行超时", 504)), 10_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new YunxiaoError(`剪贴板命令启动失败：${error instanceof Error ? error.message : String(error)}`, 500));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new YunxiaoError(`剪贴板命令执行失败（退出码 ${code}）`, 500));
    });
  });
}

async function writeMacClipboardImage(buffer, spawnProcess) {
  const file = path.join(tmpdir(), `dsh-yunxiao-clipboard-${process.pid}-${Date.now()}.png`);
  await writeFile(file, buffer);
  try {
    // «class PNGf» 把 PNG 数据原样放进剪贴板，粘贴端拿到的就是图片。
    await runClipboardChild(spawnProcess, "osascript", ["-e", `set the clipboard to (read (POSIX file "${file}") as «class PNGf»)`]);
  } finally {
    await rm(file, { force: true });
  }
}

async function writeWindowsClipboardImage(buffer, spawnProcess) {
  const file = path.join(tmpdir(), `dsh-yunxiao-clipboard-${process.pid}-${Date.now()}.png`);
  await writeFile(file, buffer);
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($env:DYX_CLIPBOARD_FILE)
[System.Windows.Forms.Clipboard]::SetImage($image)
`;
  try {
    await runClipboardChild(spawnProcess, "powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Sta", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
      "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")
    ], { DYX_CLIPBOARD_FILE: file });
  } finally {
    await rm(file, { force: true });
  }
}

async function writeClipboardImage(data, options = {}) {
  const base64 = String(data ?? "").replace(/^data:image\/[a-z.+]+;base64,/i, "").replace(/\s+/g, "");
  if (!base64) throw new YunxiaoError("剪贴板图片数据不能为空", 422);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > CLIPBOARD_IMAGE_MAX_BASE64) {
    throw new YunxiaoError("剪贴板图片数据格式不正确", 422);
  }
  const buffer = Buffer.from(base64, "base64");
  // 客户端统一发 PNG；校验魔数，避免把解析失败的垃圾数据写进剪贴板。
  if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    throw new YunxiaoError("剪贴板图片数据无法解析", 422);
  }
  const platform = options.platform || process.platform;
  const spawnProcess = options.spawnProcess || spawn;
  if (platform === "darwin") {
    await writeMacClipboardImage(buffer, spawnProcess);
    return { supported: true, channel: "macos-osascript" };
  }
  if (platform === "win32") {
    await writeWindowsClipboardImage(buffer, spawnProcess);
    return { supported: true, channel: "windows-clipboard" };
  }
  return { supported: false, reason: "当前平台不支持宿主侧写剪贴板" };
}

async function clipboardStatus() {
  return {
    platform: process.platform,
    supported: process.platform === "darwin" || process.platform === "win32"
  };
}

function createRpc(store, api, systemNotifier = showSystemNotification, listWorkspaces = () => [], engine = null) {
  async function accountAndProject(args) {
    const account = await store.getAccount(args.accountId);
    const projectId = cleanText(args.projectId || account.selectedProject?.id, 128);
    if (!projectId) throw new YunxiaoError("请先选择项目", 422);
    return { account, projectId };
  }

  // 保存规则时的静态校验：MR 创建必须有数字仓库 ID；配置了回写状态名时校验工作流里存在同名状态。
  // 状态列表读取失败（离线/权限）不阻塞保存，由引擎运行时降级处理。
  async function validatePolicy(policy) {
    if (policy.mode === "auto-submit" && policy.submit.createMr && !/^\d+$/.test(policy.submit.repoId)) {
      throw new YunxiaoError("「自动提交」并创建合并请求需要在提交设置里填写 Codeup 仓库的数字 ID", 422);
    }
    const statusNames = [
      policy.writeback.statusOnSuccess,
      policy.writeback.statusOnConfirm,
      policy.writeback.statusOnFailure
    ].filter(Boolean);
    if (!statusNames.length) return policy;
    let options = [];
    try {
      const scope = await store.resolvePolicyScope(policy);
      options = await api.listDefectStatusOptions(scope.account, scope.projectId);
    } catch {
      return policy;
    }
    if (!options.length) return policy;
    const known = new Set(options.map((option) => option.name));
    for (const statusName of statusNames) {
      if (!known.has(statusName)) {
        throw new YunxiaoError(`项目工作流中不存在状态「${statusName}」，可选：${options.map((option) => option.name).join("、")}`, 422);
      }
    }
    return policy;
  }

  // 试运行匹配：对触发状态下的最近缺陷跑一次规则匹配，返回命中明细（不创建运行）。
  async function testPolicy(input) {
    const draft = normalizePolicy({
      ...(input && typeof input === "object" ? input : {}),
      id: "draft",
      name: cleanText(input?.name, 200) || "试运行规则"
    });
    if (!draft) throw new YunxiaoError("规则内容不完整", 422);
    const scope = await store.resolvePolicyScope(draft);
    const kinds = new Set(draft.trigger.statusKinds?.length ? draft.trigger.statusKinds : ["pending", "reopened"]);
    const statuses = (await api.resolveNotificationStatuses(scope.account, scope.projectId))
      .map((status) => ({ ...status, kind: notificationStatusKind(status.name) }))
      .filter((status) => status.kind && kinds.has(status.kind));
    const results = await Promise.all((statuses.length ? statuses : [{ id: "" }]).map((status) => api.listDefects(
      scope.account,
      scope.projectId,
      { page: 1, pageSize: 50, assignedToId: draft.trigger.assigneeId, statusIds: status.id ? [status.id] : [], orderBy: "gmtModified" }
    )));
    const items = [...new Map(results.flatMap((result) => result.items || [])
      .map((item) => [item.id, item])).values()]
      .slice(0, 100)
      .map((item) => {
        const verdict = policyMatches(draft, item);
        return {
          id: item.id,
          serialNumber: item.serialNumber,
          subject: item.subject,
          statusName: item.statusName,
          priority: item.priority,
          assignedToName: item.assignedToName,
          matched: verdict.matched,
          reason: verdict.reason,
          mode: draft.mode
        };
      });
    return {
      items,
      matched: items.filter((item) => item.matched).length,
      total: items.length
    };
  }

  async function cached(accountId, key, loader) {
    try {
      const value = await loader();
      await store.putCache(accountId, key, value);
      return { ...value, stale: false, cachedAt: new Date().toISOString() };
    } catch (error) {
      const cachedValue = await store.getCache(accountId, key);
      if (!cachedValue) throw error;
      const value = cachedValue.value;
      return value && typeof value === "object"
        ? { ...value, stale: true, cachedAt: cachedValue.savedAt, warning: error instanceof Error ? error.message : String(error) }
        : value;
    }
  }

  return async function rpc(method, args = {}) {
    switch (method) {
      case "state.get":
        return store.publicState();
      case "system.notification.show": {
        const channel = await resolveSystemChannel(store);
        return systemNotifier(args.title, args.body, { tag: args.tag, channel });
      }
      case "clipboard.write_image":
        return writeClipboardImage(args.data);
      case "clipboard.status":
        return clipboardStatus();
      case "system.notification.settings.open":
        return openSystemNotificationSettings({ channel: await resolveSystemChannel(store) });
      case "account.save":
        return store.saveAccount(args);
      case "account.select":
        return store.selectAccount(args.accountId);
      case "account.delete":
        return store.deleteAccount(args.accountId);
      case "workspaces.list":
        return { items: listWorkspaces() };
      case "projects.list": {
        const account = await store.getAccount(args.accountId);
        const result = await cached(account.id, "projects", async () => ({ items: await api.listProjects(account) }));
        const selectedId = account.selectedProject?.id || "";
        return { ...result, items: (result.items || []).map((item) => ({ ...item, selected: item.id === selectedId })) };
      }
      case "project.select":
        return store.selectProject(args.accountId, args.project || {});
      case "project.workspace.bind": {
        const { account, projectId } = await accountAndProject(args);
        const workspaceId = cleanText(args.workspaceId, 100);
        if (!workspaceId) return store.saveWorkspaceBinding(account.id, projectId, null);
        const workspace = listWorkspaces().find((item) => item.id === workspaceId);
        if (!workspace) throw new YunxiaoError("未找到该 DSH 工作区，可能已被移除，请刷新列表后重试", 404);
        return store.saveWorkspaceBinding(account.id, projectId, workspace);
      }
      case "defect.notification.settings.update": {
        const { account, projectId } = await accountAndProject(args);
        const settings = normalizeDefectNotification(args);
        if (settings.enabled && settings.targetStatuses.length < 2) {
          settings.targetStatuses = await api.resolveNotificationStatuses(account, projectId);
        }
        return store.saveDefectNotification(account.id, projectId, settings);
      }
      case "defect.notification.scan": {
        const { account, projectId } = await accountAndProject(args);
        const stored = normalizeDefectNotification(account.projectSettings?.[projectId]?.defectNotification);
        if (stored.targetStatuses.length < 2) {
          stored.targetStatuses = await api.resolveNotificationStatuses(account, projectId);
          await store.saveDefectNotification(account.id, projectId, stored);
        }
        const assignedToId = cleanText(args.assignedToId, 128);
        const results = await Promise.all(stored.targetStatuses.map((status) => api.listDefects(account, projectId, {
          page: 1,
          pageSize: 100,
          assignedToId,
          statusId: status.id,
          orderBy: "gmtModified"
        })));
        const items = Array.from(new Map(results.flatMap((result) => result.items || [])
          .filter((item) => item.id)
          .map((item) => [item.id, item])).values());
        const assignees = Array.from(new Map(items
          .filter((item) => item.assignedToId && item.assignedToName)
          .map((item) => [item.assignedToId, { id: item.assignedToId, name: item.assignedToName }])).values());
        return {
          items,
          ids: items.map((item) => item.id).filter(Boolean),
          assignees,
          statuses: stored.targetStatuses,
          checkedAt: new Date().toISOString(),
          page: 1,
          pageSize: 100,
          queryCount: stored.targetStatuses.length
        };
      }
      case "defect.notification.assignees": {
        const { account, projectId } = await accountAndProject(args);
        const result = await api.listDefects(account, projectId, { page: 1, pageSize: 100 });
        return Array.from(new Map((result.items || [])
          .filter((item) => item.assignedToId && item.assignedToName)
          .map((item) => [item.assignedToId, { id: item.assignedToId, name: item.assignedToName }])).values());
      }
      case "defects.list": {
        const { account, projectId } = await accountAndProject(args);
        const cacheQuery = {
          page: clampInteger(args.page, 1, 1, 10_000),
          pageSize: clampInteger(args.pageSize, 20, 1, 100),
          serialNumber: cleanText(args.serialNumber, 255),
          subject: cleanText(args.subject, 255),
          statusId: cleanText(args.statusId, 128),
          statusIds: Array.isArray(args.statusIds)
            ? args.statusIds.map((item) => cleanText(item, 128)).filter(Boolean).slice(0, 50)
            : [],
          assignedToId: cleanText(args.assignedToId, 128)
        };
        const key = `defects:${projectId}:${JSON.stringify(cacheQuery)}`;
        return cached(account.id, key, () => api.listDefects(account, projectId, args));
      }
      case "defect.get": {
        const { account, projectId } = await accountAndProject(args);
        const defectId = cleanText(args.defectId, 128);
        if (!defectId) throw new YunxiaoError("缺陷 ID 不能为空", 422);
        return api.getDefect(account, projectId, defectId);
      }
      case "defect.statuses": {
        const { account, projectId } = await accountAndProject(args);
        const defectId = cleanText(args.defectId, 128);
        if (!defectId) throw new YunxiaoError("缺陷 ID 不能为空", 422);
        return api.getDefectStatuses(account, projectId, defectId);
      }
      case "defect.statusOptions": {
        const { account, projectId } = await accountAndProject(args);
        return cached(account.id, `defect-statuses:${projectId}`, async () => ({
          items: await api.listDefectStatusOptions(account, projectId)
        }));
      }
      case "defect.status.update": {
        const { account, projectId } = await accountAndProject(args);
        const defectId = cleanText(args.defectId, 128);
        const statusId = cleanText(args.statusId, 128);
        if (!defectId || !statusId) throw new YunxiaoError("缺陷 ID 和状态 ID 不能为空", 422);
        return api.updateDefectStatus(account, projectId, defectId, statusId);
      }
      case "defect.assignee.update": {
        const { account, projectId } = await accountAndProject(args);
        const defectId = cleanText(args.defectId, 128);
        const assignedToId = cleanText(args.assignedToId, 128);
        if (!defectId || !assignedToId) throw new YunxiaoError("缺陷 ID 和负责人 ID 不能为空", 422);
        return api.updateDefectAssignee(account, projectId, defectId, assignedToId);
      }
      case "defect.members": {
        const { account, projectId } = await accountAndProject(args);
        return api.listProjectMembers(account, projectId);
      }
      case "defect.comment.create": {
        const { account, projectId } = await accountAndProject(args);
        const defectId = cleanText(args.defectId, 128);
        const content = cleanTextPreserve(args.content, 10_000).trim();
        if (!defectId) throw new YunxiaoError("缺陷 ID 不能为空", 422);
        if (!content) throw new YunxiaoError("评论内容不能为空", 422);
        return api.createDefectComment(account, projectId, defectId, content);
      }
      case "defect.attachment.link": {
        const { account, projectId } = await accountAndProject(args);
        const defectId = cleanText(args.defectId, 128);
        const fileId = cleanText(args.fileId, 128);
        if (!defectId || !fileId) throw new YunxiaoError("缺陷 ID 和附件 ID 不能为空", 422);
        return api.getAttachmentLink(account, projectId, defectId, fileId);
      }
      case "defect.attachment.data": {
        const { account, projectId } = await accountAndProject(args);
        const defectId = cleanText(args.defectId, 128);
        const fileId = cleanText(args.fileId, 128);
        if (!defectId || !fileId) throw new YunxiaoError("缺陷 ID 和附件 ID 不能为空", 422);
        return api.getAttachmentData(account, projectId, defectId, fileId);
      }
      case "pipelines.list": {
        const { account } = await accountAndProject(args);
        return cached(account.id, "pipelines", () => api.listPipelines(account, args));
      }
      case "pipeline.get": {
        const { account } = await accountAndProject(args);
        return api.getPipeline(account, cleanText(args.pipelineId, 128));
      }
      case "pipeline.branches": {
        const { account } = await accountAndProject(args);
        return api.listPipelineBranches(account, cleanText(args.pipelineId, 128));
      }
      case "pipeline.runs": {
        const { account } = await accountAndProject(args);
        return api.listPipelineRuns(account, cleanText(args.pipelineId, 128), args);
      }
      case "pipeline.run.get": {
        const { account } = await accountAndProject(args);
        return api.getPipelineRun(account, cleanText(args.pipelineId, 128), cleanText(args.pipelineRunId, 128));
      }
      case "pipeline.log": {
        const { account } = await accountAndProject(args);
        return api.getPipelineJobLog(
          account,
          cleanText(args.pipelineId, 128),
          cleanText(args.pipelineRunId, 128),
          cleanText(args.jobId, 128)
        );
      }
      case "pipeline.run.create": {
        const { account } = await accountAndProject(args);
        return api.createPipelineRun(account, cleanText(args.pipelineId, 128), args);
      }
      case "code.repos.list": {
        const { account } = await accountAndProject(args);
        return cached(account.id, "codeup-repos", () => api.listCodeupRepositories(account, args));
      }
      case "code.branches.list": {
        const { account } = await accountAndProject(args);
        const repositoryPath = cleanText(args.repositoryId, 500);
        if (!repositoryPath) throw new YunxiaoError("仓库 ID 不能为空", 422);
        const result = await api.listRepositoryBranches(account, repositoryPath);
        return { items: result.branches, warning: result.warning };
      }
      case "code.mrs.list": {
        const { account } = await accountAndProject(args);
        const repositoryPath = cleanText(args.repositoryId, 500);
        if (!repositoryPath) throw new YunxiaoError("仓库 ID 不能为空", 422);
        return cached(account.id, `codeup-mrs:${repositoryPath}`, () => api.listCodeupMergeRequests(account, repositoryPath, args));
      }
      case "code.mr.merge": {
        const { account } = await accountAndProject(args);
        const repositoryPath = cleanText(args.repositoryId, 500);
        const mergeRequestId = cleanText(args.mergeRequestId, 64);
        return api.mergeCodeupMergeRequest(account, repositoryPath, mergeRequestId);
      }
      case "tests.plans.list": {
        const { account } = await accountAndProject(args);
        return cached(account.id, "test-plans", () => api.listTestPlans(account, args));
      }
      case "packages.repos.list": {
        const { account } = await accountAndProject(args);
        return cached(account.id, "package-repos", () => api.listPackageRepositories(account, args));
      }
      case "flows.list":
        return { items: await store.listFlows() };
      case "flows.save":
        return store.saveFlow(args.flow);
      case "flows.delete":
        return store.deleteFlow(args.flowId);
      case "flows.run.save":
        return store.saveFlowRun(cleanText(args.flowId, 64), args.run);
      case "policies.list":
        return { items: await store.listPolicies() };
      case "policies.save": {
        // 先对归一化草稿做校验（数字仓库 ID / 回写状态名），再落库，避免非法规则被持久化。
        const source = args.policy && typeof args.policy === "object" ? args.policy : {};
        const draft = normalizePolicy({ ...source, id: cleanText(source.id, 64) || "draft", name: cleanText(source.name, 200) || "draft" });
        if (!draft) throw new YunxiaoError("规则名称不能为空", 422);
        await validatePolicy(draft);
        const saved = await store.savePolicy(source);
        engine?.reschedule();
        return saved;
      }
      case "policies.delete": {
        const removed = await store.deletePolicy(args.policyId);
        engine?.reschedule();
        return removed;
      }
      case "policies.reorder": {
        const ordered = await store.reorderPolicies(args.ids);
        engine?.reschedule();
        return { items: ordered };
      }
      case "policies.test":
        return testPolicy(args.policy);
      case "runs.list": {
        const items = (await store.listRuns()).filter((run) => {
          if (cleanText(args.policyId, 64) && run.policyId !== cleanText(args.policyId, 64)) return false;
          if (cleanText(args.status, 30) && run.status !== cleanText(args.status, 30)) return false;
          if (cleanText(args.defectId, 128) && run.defectId !== cleanText(args.defectId, 128)) return false;
          return true;
        });
        return { items };
      }
      case "runs.get": {
        const run = await store.getRun(args.runId);
        if (!run) throw new YunxiaoError("运行记录不存在", 404);
        return run;
      }
      case "runs.cancel": {
        if (!engine?.isAvailable()) throw new YunxiaoError("规则引擎不可用，无法取消运行", 503);
        return engine.cancelRun(cleanText(args.runId, 64));
      }
      case "runs.retry": {
        if (!engine?.isAvailable()) throw new YunxiaoError("规则引擎不可用，无法重试", 503);
        const run = await store.getRun(args.runId);
        if (!run) throw new YunxiaoError("运行记录不存在", 404);
        return engine.retryRun(run);
      }
      case "runs.confirm": {
        if (!engine?.isAvailable()) throw new YunxiaoError("规则引擎不可用，无法裁决", 503);
        return engine.confirmRun(cleanText(args.runId, 64), cleanText(args.decision, 30));
      }
      case "engine.status":
        return engine
          ? engine.status()
          : { available: false, scanning: false, queued: 0, lastScanAt: "", lastScanError: "引擎服务未注入", active: [] };
      case "engine.scanNow": {
        if (!engine?.isAvailable()) throw new YunxiaoError("规则引擎不可用", 503);
        return engine.scanOnce();
      }
      default:
        throw new YunxiaoError(`未知操作：${cleanText(method, 100)}`, 404);
    }
  };
}

function registerTools(ctx, rpc, timeoutMs) {
  ctx.tools.register({
    name: "yunxiao_list_defects",
    description: "读取当前已配置云效账号和项目的缺陷列表，可按编号或标题筛选。账号和项目默认使用插件工作台中的当前选择。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        serialNumber: { type: "string", description: "缺陷编号关键词" },
        subject: { type: "string", description: "缺陷标题关键词" },
        page: { type: "number", description: "页码，默认 1" },
        pageSize: { type: "number", description: "每页数量，默认 20，最多 100" }
      }
    },
    timeoutMs: timeoutMs + 5000,
    isConcurrencySafe: () => true,
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
    },
    execute: async (args) => rpc("defects.list", args)
  });

  ctx.tools.register({
    name: "yunxiao_list_pipelines",
    description: "读取当前云效组织中可访问的流水线列表。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: { type: "string", description: "流水线名称关键词" },
        page: { type: "number", description: "页码，默认 1" },
        pageSize: { type: "number", description: "每页数量，默认 20，最多 30" }
      }
    },
    timeoutMs: timeoutMs + 5000,
    isConcurrencySafe: () => true,
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
    },
    execute: async (args) => rpc("pipelines.list", args)
  });
}

function apply(ctx, suppliedConfig = {}) {
  const config = {
    dataFile: cleanText(suppliedConfig.dataFile || DEFAULTS.dataFile, 2000),
    apiBaseUrl: cleanText(suppliedConfig.apiBaseUrl || DEFAULTS.apiBaseUrl, 2000),
    timeoutMs: clampInteger(suppliedConfig.timeoutMs, DEFAULTS.timeoutMs, 5000, 120_000),
    cacheMaxItems: clampInteger(suppliedConfig.cacheMaxItems, DEFAULTS.cacheMaxItems, 10, 500)
  };
  if (!config.dataFile) throw new Error("dsh-yunxiao dataFile 不能为空");
  if (!/^https:\/\//i.test(config.apiBaseUrl)) throw new Error("dsh-yunxiao apiBaseUrl 必须使用 https://");

  const store = createJsonStore(config.dataFile, config.cacheMaxItems);
  const api = createApiClient(config);

  // 规则引擎：通知与系统渠道共用一套实现；引擎自身等 agents 等服务注入后再启动。
  const engine = createPolicyEngine({
    store,
    api,
    notify: (title, body, options) => showSystemNotification(title, body, { ...options, store })
  });

  function listHarnessWorkspaces() {
    const reflect = ctx.reflect;
    if (!reflect || typeof reflect.get !== "function") return [];
    try {
      const registry = reflect.get("workspaceRegistry");
      if (!registry || typeof registry.list !== "function") return [];
      return registry.list()
        .map((entity) => ({
          id: cleanText(entity.id, 100),
          title: cleanText(entity.title, 255),
          path: cleanText(entity.path, 2000)
        }))
        .filter((item) => item.id);
    } catch {
      return [];
    }
  }

  const rpc = createRpc(store, api, showSystemNotification, listHarnessWorkspaces, engine);
  registerTools(ctx, rpc, config.timeoutMs);

  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: "exact",
      path: "/api/d-yunxiao/rpc",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          writeJson(res, 405, { ok: false, message: "仅支持 POST" });
          return;
        }
        try {
          // clipboard.write_image 携带 base64 图片（最大约 22MB 二进制），放宽请求体上限。
          const body = await readJsonBody(req, 40_000_000);
          const data = await rpc(cleanText(body.method, 100), body.args || {});
          writeJson(res, 200, { ok: true, data });
        } catch (error) {
          const status = error instanceof YunxiaoError ? error.status : 500;
          const message = error instanceof Error ? error.message : String(error);
          writeJson(res, status >= 400 && status < 600 ? status : 500, { ok: false, message });
        }
      }
    }), "dsh-yunxiao: rpc route");
  });

  // 规则引擎按需启动：六个服务任一缺失（profile 组成不同）回调不触发，引擎保持停用。
  ctx.inject(["agents", "agentPresets", "permissionPresets", "sessionTitle", "workspaceRegistry", "attachments"], (svcCtx) => {
    svcCtx.effect(() => {
      engine.start(svcCtx);
      return async () => engine.stop();
    }, "dsh-yunxiao: policy engine");
  });
}

export {
  DEFAULTS,
  YunxiaoError,
  apply,
  cleanMapping,
  createApiClient,
  createJsonStore,
  createRpc,
  detectNotificationChannel,
  extractStatuses,
  inlineFileIds,
  inject,
  mapDefect,
  mapPipeline,
  mapPipelineRun,
  normalizeFlow,
  normalizeFlows,
  createPolicyEngine,
  policyMatches,
  normalizePolicy,
  normalizeRun,
  normalizeRunResult,
  isNotifiableDefectStatus,
  normalizeDefectNotification,
  normalizeSystemInfo,
  openMacNotificationSettings,
  openSystemNotificationSettings,
  openWindowsNotificationSettings,
  resolveSystemChannel,
  showMacNotification,
  showSystemNotification,
  showWindowsNotification,
  writeClipboardImage,
  name
};
