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
  return { version: 1, selectedAccountId: "", accounts: [], cache: {}, system: null };
}

function normalizeSystemInfo(value) {
  const source = value && typeof value === "object" ? value : null;
  if (!source) return null;
  const platform = cleanText(source.platform, 32);
  const channel = cleanText(source.channel, 32);
  if (!platform || !channel) return null;
  return { platform, channel, detectedAt: cleanText(source.detectedAt, 40) };
}

function normalizeState(value) {
  if (!value || typeof value !== "object") return emptyState();
  return {
    version: 1,
    selectedAccountId: cleanText(value.selectedAccountId, 100),
    accounts: Array.isArray(value.accounts) ? value.accounts.filter((item) => item && typeof item === "object") : [],
    cache: value.cache && typeof value.cache === "object" ? value.cache : {},
    system: normalizeSystemInfo(value.system)
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
    saveSystemInfo
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
      codeup: `/oapi/v1/codeup/organizations/${org}`
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

  async function listPipelineBranches(account, pipelineId) {
    const api = paths(account);
    const detail = await getPipeline(account, pipelineId);
    const results = [];
    let codeupApiAuthorized;
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
    createPipelineRun
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

function createRpc(store, api, systemNotifier = showSystemNotification, listWorkspaces = () => []) {
  async function accountAndProject(args) {
    const account = await store.getAccount(args.accountId);
    const projectId = cleanText(args.projectId || account.selectedProject?.id, 128);
    if (!projectId) throw new YunxiaoError("请先选择项目", 422);
    return { account, projectId };
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

  // 读取 Harness 的工作区注册表（workspaceRegistry）供设置页绑定与校验；
  // 服务缺失或未启动时返回空列表，不影响其余功能。
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

  const rpc = createRpc(store, api, showSystemNotification, listHarnessWorkspaces);
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
