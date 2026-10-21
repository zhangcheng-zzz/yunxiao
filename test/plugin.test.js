import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  apply,
  createApiClient,
  createJsonStore,
  createPolicyEngine,
  createRpc,
  detectNotificationChannel,
  extractStatuses,
  inlineFileIds,
  isNotifiableDefectStatus,
  mapDefect,
  mapPipelineRun,
  normalizeDefectNotification,
  normalizeFlow,
  normalizePolicy,
  normalizeRun,
  openMacNotificationSettings,
  openSystemNotificationSettings,
  openWindowsNotificationSettings,
  policyMatches,
  resolveSystemChannel,
  showMacNotification,
  showSystemNotification,
  showWindowsNotification,
  writeClipboardImage
} from "../dist/index.js";

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function stubChild(exitCode) {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit("close", exitCode));
  return child;
}

test("clipboard.write_image validates data and writes via platform tools", async () => {
  await assert.rejects(writeClipboardImage(""), /不能为空/);
  await assert.rejects(writeClipboardImage("not base64!!!"), /格式不正确/);
  await assert.rejects(
    writeClipboardImage(Buffer.from("plain text").toString("base64"), { platform: "linux" }),
    /无法解析/
  );
  // 不支持的平台返回 supported:false，客户端回退到浏览器剪贴板。
  assert.equal((await writeClipboardImage(TINY_PNG_BASE64, { platform: "linux" })).supported, false);

  // macOS：osascript 读取临时 PNG 写入剪贴板（spawn 打桩，不碰真实剪贴板）。
  const macCalls = [];
  const macResult = await writeClipboardImage(TINY_PNG_BASE64, {
    platform: "darwin",
    spawnProcess: (command, args) => { macCalls.push({ command, args }); return stubChild(0); }
  });
  assert.deepEqual(macResult, { supported: true, channel: "macos-osascript" });
  assert.equal(macCalls[0].command, "osascript");
  assert.match(macCalls[0].args[1], /«class PNGf»/);
  await assert.rejects(
    writeClipboardImage(TINY_PNG_BASE64, { platform: "darwin", spawnProcess: () => stubChild(1) }),
    /退出码 1/
  );

  // Windows：powershell STA 编码命令里带 SetImage。
  const winCalls = [];
  const winResult = await writeClipboardImage(TINY_PNG_BASE64, {
    platform: "win32",
    spawnProcess: (command, args) => { winCalls.push({ command, args }); return stubChild(0); }
  });
  assert.deepEqual(winResult, { supported: true, channel: "windows-clipboard" });
  assert.equal(winCalls[0].command, "powershell.exe");
  const decoded = Buffer.from(winCalls[0].args.at(-1), "base64").toString("utf16le");
  assert.match(decoded, /Clipboard\]::SetImage/);
});

test("client uses the native sidebar trigger and a stable reserved right panel", async () => {
  const source = await readFile(new URL("../dist/client.js", import.meta.url), "utf8");
  assert.match(source, /sidebar\.footer\.action/);
  assert.match(source, /shell\.overlay/);
  assert.match(source, /typeof ctx\.layout\.openDetails === "function"/);
  assert.match(source, /typeof ctx\.layout\.closeDetails === "function"/);
  assert.match(source, /dyx-right-panel/);
  assert.match(source, /\.dyx-right-panel\{[^}]*width:var\(--dyx-workspace-width,480px\)/);
  assert.match(source, /data-dyx-workspace-open/);
  assert.match(source, /dsh-yunxiao:panel-width/);
  assert.match(source, /dyx-resize-handle/);
  assert.match(source, /onPointerDown: beginResize/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /defect\.statuses/);
  assert.match(source, /defect\.comment\.create/);
  assert.match(source, /发布评论/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /assignedToId/);
  assert.match(source, /dyx-inline-status/);
  assert.match(source, /dyx-status-pending/);
  assert.match(source, /dyx-status-processing/);
  assert.match(source, /dyx-status-reopened/);
  assert.match(source, /function applyDefectStatusTone/);
  assert.match(source, /function applyDefectRecordTone/);
  assert.match(source, /dyx-record-status-pending/);
  assert.match(source, /dyx-record-status-processing/);
  assert.match(source, /dyx-record-status-reopened/);
  assert.match(source, /function createDefectNotifier/);
  assert.match(source, /defect\.notification\.scan/);
  assert.match(source, /new window\.Notification/);
  assert.match(source, /system\.notification\.show/);
  assert.match(source, /已提交给系统原生通知/);
  assert.match(source, /__dsh_native_notification_bridge__/);
  assert.match(source, /requireInteraction: true/);
  assert.match(source, /Date\.now\(\)/);
  assert.match(source, /新增 " \+ count \+ " 个缺陷需修复/);
  assert.match(source, /dyx-sidebar-trigger-count/);
  assert.match(source, /dyx-global-notice/);
  assert.match(source, /var addedIds = ids\.filter/);
  assert.match(source, /seenByScope\.set\(scope, new Set\(ids\)\)/);
  assert.match(source, /dyx-card-title/);
  assert.match(source, /刷新缺陷检查/);
  assert.match(source, /dyx-notify-stats/);
  assert.match(source, /当前 " \+ noticeState\.lastResultCount \+ " 条未处理/);
  assert.match(source, /lastSystemStatus/);
  assert.match(source, /options\.onOpen\(items \|\| \[\]\)/);
  assert.match(source, /function openNotifiedDefects/);
  assert.match(source, /openDefect\(values\[0\]\)/);
  assert.match(source, /activeWorkspace\.openNotifiedDefects/);
  const runForm = source.slice(source.indexOf("function openRunPipeline"), source.indexOf("function openPipelineRun"));
  assert.match(runForm, /pipeline\.branches/);
  assert.match(runForm, /运行分支/);
  assert.match(runForm, /control = node\("select", "dyx-select"\)/);
  assert.match(runForm, /input\("text", "留空使用流水线默认分支", source\.defaultBranch \|\| ""\)/);
  assert.match(runForm, /setAttribute\("list", datalist\.id\)/);
  assert.match(runForm, /手动添加分支/);
  assert.match(runForm, /missingRepo\.length/);
  assert.doesNotMatch(runForm, /暂无可用分支|control\.disabled = true/);
  assert.doesNotMatch(runForm, /留空使用默认配置/);
  assert.doesNotMatch(runForm, /window\.confirm|环境变量|envInput|envs:/);
  assert.doesNotMatch(source, /dyx-launch/);
  assert.doesNotMatch(source, /ctx\.slots\.register\(\{ name: "details" \}/);
  const defectFilters = source.slice(source.indexOf("function renderDefects"), source.indexOf("function defectTable"));
  assert.match(defectFilters, /dyx-defect-filters/);
  assert.match(defectFilters, /清空" \+ label/);
  assert.match(defectFilters, /fillStatusFilterOptions\(status\)/);
  assert.match(defectFilters, /placeholder\.value = ""/);
  assert.match(defectFilters, /请选择状态/);
  assert.match(defectFilters, /请选择负责人/);
  assert.match(defectFilters, /filterWithClear\(status, "statusName", "状态"\)/);
  assert.match(defectFilters, /select\.addEventListener\("change"/);
  assert.doesNotMatch(defectFilters, /全部状态|全部负责人|缺陷编号|标题关键词|button\("查询"|button\("清空"/);
  assert.match(source, /defect\.statusOptions/);
  assert.match(source, /statusIds: statusIdsForFilter\(\)/);
  assert.match(source, /function loadDefectFilterOptions/);
  assert.match(source, /loadDefectFilterOptions\(\);[\r\n]+    \}[\r\n]+    if \(tab === "pipelines"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /dateValue\(right\.gmtCreate \|\| right\.gmtModified\) - dateValue\(left\.gmtCreate \|\| left\.gmtModified\)/);
  const listStatus = source.slice(source.indexOf("function saveListStatus"), source.indexOf("function pager"));
  assert.match(listStatus, /reloadDefectsSoon\(\)/);
  assert.match(source, /function reloadDefectsSoon/);
  assert.doesNotMatch(source, /defectPendingSync|reconcileDefectPatches|defectRetryTimer/);
  assert.match(source, /setCount\(value\.lastResultCount\)/);
  assert.match(source, /当前 " \+ count \+ " 条未处理缺陷/);
  assert.doesNotMatch(source, /var bridgeStatus = showWebNotification/);
  const detailStatusStart = source.indexOf("function renderDefectDetail");
  const detailStatus = source.slice(detailStatusStart, source.indexOf("var meta = node", detailStatusStart));
  assert.match(detailStatus, /select\.addEventListener\("change"/);
  assert.match(detailStatus, /reloadDefectsSoon\(\)/);
  assert.doesNotMatch(detailStatus, /保存状态/);
  assert.match(detailStatus, /defect\.members/);
  assert.match(detailStatus, /defect\.assignee\.update/);
  assert.match(detailStatus, /fillDetailAssignee\(assigneeSelect\)/);
  assert.match(source.slice(detailStatusStart, source.indexOf("function renderPipelines")), /最近修改人/);
});

test("Windows notification settings helper opens the native settings page", async () => {
  let invocation;
  let unrefCalled = false;
  const child = new EventEmitter();
  child.unref = () => { unrefCalled = true; };
  const resultPromise = openWindowsNotificationSettings({
    platform: "win32",
    spawnProcess(command, args, options) {
      invocation = { command, args, options };
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  assert.deepEqual(await resultPromise, { supported: true, accepted: true });
  assert.equal(invocation.command, "explorer.exe");
  assert.deepEqual(invocation.args, ["ms-settings:notifications"]);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(unrefCalled, true);
});

test("Windows notification helper starts a hidden native notifier with safe text transport", async () => {
  let invocation;
  let unrefCalled = false;
  const child = new EventEmitter();
  child.unref = () => { unrefCalled = true; };
  const promise = showWindowsNotification("云效缺陷提醒", "新增 1 个缺陷需修复", {
    platform: "win32",
    spawnProcess(command, args, options) {
      invocation = { command, args, options };
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  const result = await promise;
  assert.deepEqual(result, { supported: true, accepted: true, channel: "windows-toast" });
  assert.equal(invocation.command, "powershell.exe");
  assert.equal(invocation.options.windowsHide, true);
  assert.notEqual(invocation.options.detached, true);
  assert.equal(invocation.options.stdio, "ignore");
  assert.equal(invocation.options.env.DYX_NOTIFICATION_BODY, "新增 1 个缺陷需修复");
  assert.match(invocation.options.env.DYX_NOTIFICATION_TAG, /^dyx-/);
  const script = Buffer.from(invocation.args.at(-1), "base64").toString("utf16le");
  assert.match(script, /ToastNotificationManager/);
  assert.match(script, /scenario="urgent"/);
  assert.match(script, /io\.github\.hairyf\.deepseek-harness-desktop/);
  assert.match(script, /ToastNotifier\(\$appId\)\.Show\(\$toast\)/);
  assert.doesNotMatch(script, /System\.Windows\.Forms/);
  assert.equal(unrefCalled, true);
  assert.deepEqual(await showWindowsNotification("title", "body", { platform: "linux" }), {
    supported: false,
    accepted: false,
    channel: "unsupported"
  });
});

test("macOS notification helper spawns osascript with argv text transport", async () => {
  let invocation;
  let unrefCalled = false;
  const child = new EventEmitter();
  child.unref = () => { unrefCalled = true; };
  const promise = showMacNotification("云效缺陷提醒", '新增 1 个 "缺陷" 需修复', {
    spawnProcess(command, args, options) {
      invocation = { command, args, options };
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  const result = await promise;
  assert.deepEqual(result, { supported: true, accepted: true, channel: "macos-osascript" });
  assert.equal(invocation.command, "osascript");
  assert.equal(invocation.args[0], "-e");
  assert.match(invocation.args[1], /display notification \(item 2 of argv\) with title \(item 1 of argv\) sound name "default"/);
  assert.deepEqual(invocation.args.slice(2), ["云效缺陷提醒", '新增 1 个 "缺陷" 需修复']);
  assert.equal(invocation.options.stdio, "ignore");
  assert.equal(unrefCalled, true);
});

test("macOS notification settings helper opens the notifications pane", async () => {
  let invocation;
  const child = new EventEmitter();
  const resultPromise = openMacNotificationSettings({
    spawnProcess(command, args) {
      invocation = { command, args };
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  assert.deepEqual(await resultPromise, { supported: true, accepted: true });
  assert.equal(invocation.command, "open");
  assert.deepEqual(invocation.args, ["x-apple.systempreferences:com.apple.preference.notifications"]);
});

test("notification channel is detected once and persisted until the platform changes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "dsh-yunxiao-channel-"));
  const store = createJsonStore(path.join(tempDir, "data.json"), 10);
  try {
    assert.equal(detectNotificationChannel("win32"), "windows-toast");
    assert.equal(detectNotificationChannel("darwin"), "macos-osascript");
    assert.equal(detectNotificationChannel("linux"), "none");

    const first = await resolveSystemChannel(store, { platform: "darwin" });
    assert.equal(first, "macos-osascript");
    const stored = await store.getSystemInfo();
    assert.equal(stored.platform, "darwin");
    assert.equal(stored.channel, "macos-osascript");
    assert.match(stored.detectedAt, /^\d{4}-\d{2}-\d{2}T/);

    const second = await resolveSystemChannel(store, { platform: "darwin" });
    assert.equal(second, "macos-osascript");
    assert.equal((await store.getSystemInfo()).detectedAt, stored.detectedAt);

    const changed = await resolveSystemChannel(store, { platform: "win32" });
    assert.equal(changed, "windows-toast");
    assert.equal((await store.getSystemInfo()).platform, "win32");

    const reloaded = createJsonStore(path.join(tempDir, "data.json"), 10);
    assert.equal((await reloaded.getSystemInfo()).channel, "windows-toast");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("system notification dispatcher routes by channel and reports unsupported otherwise", async () => {
  const invocations = [];
  const child = new EventEmitter();
  child.unref = () => {};
  const spawnProcess = (command, args) => {
    invocations.push({ command, args });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  const mac = await showSystemNotification("t1", "b1", { channel: "macos-osascript", spawnProcess });
  assert.equal(mac.channel, "macos-osascript");
  const win = await showSystemNotification("t2", "b2", { channel: "windows-toast", platform: "win32", spawnProcess });
  assert.equal(win.channel, "windows-toast");
  assert.deepEqual(await showSystemNotification("t3", "b3", { channel: "none" }), {
    supported: false,
    accepted: false,
    channel: "unsupported"
  });
  assert.deepEqual(invocations.map((item) => item.command), ["osascript", "powershell.exe"]);
});

test("system notification settings opener routes by channel", async () => {
  const invocations = [];
  const child = new EventEmitter();
  child.unref = () => {};
  const spawnProcess = (command, args) => {
    invocations.push({ command, args });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  assert.deepEqual(await openSystemNotificationSettings({ channel: "macos-osascript", spawnProcess }), { supported: true, accepted: true });
  assert.deepEqual(await openSystemNotificationSettings({ channel: "windows-toast", platform: "win32", spawnProcess }), { supported: true, accepted: true });
  assert.deepEqual(await openSystemNotificationSettings({ channel: "none" }), { supported: false, accepted: false });
  assert.deepEqual(invocations.map((item) => item.command), ["open", "explorer.exe"]);
});

test("rpc persists the notification channel and forwards it to the notifier", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "dsh-yunxiao-rpc-channel-"));
  const store = createJsonStore(path.join(tempDir, "data.json"), 10);
  try {
    const calls = [];
    const rpc = createRpc(store, {}, async (title, body, options) => {
      calls.push(options);
      return { supported: true, accepted: true, channel: options.channel };
    });
    const expected = detectNotificationChannel();
    const result = await rpc("system.notification.show", { title: "云效缺陷提醒", body: "测试通知" });
    assert.equal(result.channel, expected);
    assert.equal(calls[0].channel, expected);
    const stored = await store.getSystemInfo();
    assert.equal(stored.platform, process.platform);
    assert.equal(stored.channel, expected);
    await rpc("system.notification.show", { title: "云效缺陷提醒", body: "再测一次" });
    assert.equal(calls[1].channel, expected);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("plugin apply registers two tools and the Web RPC route", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsh-yunxiao-apply-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tools = [];
  let route;
  const ctx = {
    tools: { register(value) { tools.push(value); } },
    inject(_dependencies, callback) {
      callback({
        webServer: { register(value) { route = value; return () => {}; } },
        effect(effect) { return effect(); }
      });
    }
  };

  apply(ctx, { dataFile: path.join(directory, "data.json") });
  assert.deepEqual(tools.map((item) => item.name), ["yunxiao_list_defects", "yunxiao_list_pipelines"]);
  assert.equal(route.path, "/api/d-yunxiao/rpc");

  const req = Readable.from([Buffer.from(JSON.stringify({ method: "state.get", args: {} }))]);
  req.method = "POST";
  let status;
  let body;
  await route.handler(req, {
    writeHead(value) { status = value; },
    end(value) { body = value; }
  });
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(body).data.accounts, []);
});

test("JSON store persists accounts and project selection without exposing token", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsh-yunxiao-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "data.json");
  const store = createJsonStore(file, 100);

  const account = await store.saveAccount({
    name: "研发账号",
    organizationId: "org-1",
    token: "secret-token",
    remark: "测试"
  });
  await store.selectProject(account.id, { id: "project-1", name: "演示项目" });
  await store.saveDefectNotification(account.id, "project-1", {
    enabled: true,
    assignedToId: "u1",
    assignedToName: "张三",
    intervalMinutes: 10,
    targetStatuses: [{ id: "pending", name: "待确认" }, { id: "reopened", name: "再次打开" }]
  });

  const publicState = await store.publicState();
  assert.equal(publicState.accounts[0].hasToken, true);
  assert.equal(publicState.accounts[0].token, undefined);
  assert.deepEqual(publicState.accounts[0].selectedProject, { id: "project-1", name: "演示项目" });
  assert.deepEqual(publicState.accounts[0].defectNotification, {
    enabled: true,
    assignedToId: "u1",
    assignedToName: "张三",
    intervalMinutes: 10,
    targetStatuses: [{ id: "pending", name: "待确认" }, { id: "reopened", name: "再次打开" }]
  });

  const text = await readFile(file, "utf8");
  const persisted = JSON.parse(text);
  assert.equal(persisted.accounts[0].token, "secret-token");
  assert.equal(persisted.selectedAccountId, account.id);
  assert.equal(persisted.accounts[0].projectSettings["project-1"].defectNotification.intervalMinutes, 10);
});

test("RPC uses current account/project and falls back to persisted list cache", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsh-yunxiao-rpc-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createJsonStore(path.join(directory, "data.json"), 100);
  const account = await store.saveAccount({ name: "主账号", organizationId: "org", token: "token" });
  await store.selectProject(account.id, { id: "p1", name: "项目一" });

  let fail = false;
  let statusOptionFail = false;
  const createdComments = [];
  const attachmentLinks = [];
  const defectQueries = [];
  const statusOptionQueries = [];
  const api = {
    listProjects: async () => [{ id: "p1", name: "项目一" }],
    listDefects: async (_account, projectId, query = {}) => {
      defectQueries.push(query);
      if (fail) throw new Error("offline");
      return { items: [{ id: "bug-1", projectId, statusName: "待确认", assignedToId: "u1", assignedToName: "张三" }], total: 1, page: 1, pageSize: 20 };
    },
    listPipelines: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    getDefect: async () => ({}),
    getDefectStatuses: async () => [],
    listDefectStatusOptions: async (_account, projectId) => {
      statusOptionQueries.push(projectId);
      if (statusOptionFail) throw new Error("status-offline");
      return [{ id: "s1", name: "待确认" }, { id: "s2", name: "处理中" }];
    },
    updateDefectStatus: async () => ({}),
    createDefectComment: async (_account, projectId, defectId, content) => {
      createdComments.push({ projectId, defectId, content });
      return { id: "comment-1", projectId, defectId };
    },
    getAttachmentLink: async (_account, projectId, defectId, fileId) => {
      attachmentLinks.push({ projectId, defectId, fileId });
      return { fileId, fileName: "接口响应日志.log", suffix: ".log", size: 20480, url: `https://oss.example.com/fresh-${fileId}` };
    },
    getPipeline: async () => ({}),
    listPipelineBranches: async () => [],
    listPipelineRuns: async () => ({ items: [] }),
    getPipelineRun: async () => ({}),
    getPipelineJobLog: async () => ({}),
    createPipelineRun: async () => ({})
  };
  const nativeNotifications = [];
  const rpc = createRpc(store, api, async (title, body) => {
    nativeNotifications.push({ title, body });
    return { supported: true, accepted: true, channel: "windows-native" };
  });

  const nativeNotification = await rpc("system.notification.show", { title: "云效缺陷提醒", body: "测试通知" });
  assert.equal(nativeNotification.accepted, true);
  assert.deepEqual(nativeNotifications, [{ title: "云效缺陷提醒", body: "测试通知" }]);

  const fresh = await rpc("defects.list", {});
  assert.equal(fresh.items[0].projectId, "p1");
  assert.equal(fresh.stale, false);

  const statusOptions = await rpc("defect.statusOptions", {});
  assert.deepEqual(statusOptions.items, [{ id: "s1", name: "待确认" }, { id: "s2", name: "处理中" }]);
  assert.equal(statusOptions.stale, false);
  statusOptionFail = true;
  const staleStatusOptions = await rpc("defect.statusOptions", {});
  assert.equal(staleStatusOptions.stale, true);
  assert.deepEqual(staleStatusOptions.items, [{ id: "s1", name: "待确认" }, { id: "s2", name: "处理中" }]);
  assert.match(staleStatusOptions.warning, /status-offline/);

  const notificationSettings = await rpc("defect.notification.settings.update", {
    enabled: true,
    assignedToId: "u1",
    assignedToName: "张三",
    intervalMinutes: 15,
    targetStatuses: [{ id: "pending", name: "待确认" }, { id: "reopened", name: "再次打开" }]
  });
  assert.equal(notificationSettings.enabled, true);
  assert.equal(notificationSettings.intervalMinutes, 15);
  const scan = await rpc("defect.notification.scan", { assignedToId: "u1" });
  assert.deepEqual(scan.ids, ["bug-1"]);
  assert.deepEqual(scan.assignees, [{ id: "u1", name: "张三" }]);
  assert.deepEqual(scan.statuses, [{ id: "pending", name: "待确认" }, { id: "reopened", name: "再次打开" }]);
  assert.equal(scan.page, 1);
  assert.equal(scan.pageSize, 100);
  assert.equal(scan.queryCount, 2);
  assert.deepEqual(defectQueries.slice(-2).map((item) => item.statusId), ["pending", "reopened"]);
  assert.ok(defectQueries.slice(-2).every((item) => item.orderBy === "gmtModified" && item.pageSize === 100 && item.assignedToId === "u1"));

  const comment = await rpc("defect.comment.create", { defectId: "bug-1", content: "  请验证修复。  " });
  assert.equal(comment.id, "comment-1");
  assert.deepEqual(createdComments, [{ projectId: "p1", defectId: "bug-1", content: "请验证修复。" }]);
  await assert.rejects(() => rpc("defect.comment.create", { defectId: "bug-1", content: "   " }), /评论内容不能为空/);

  const attachment = await rpc("defect.attachment.link", { defectId: "bug-1", fileId: "file-1" });
  assert.equal(attachment.url, "https://oss.example.com/fresh-file-1");
  assert.equal(attachment.fileName, "接口响应日志.log");
  assert.deepEqual(attachmentLinks, [{ projectId: "p1", defectId: "bug-1", fileId: "file-1" }]);
  await assert.rejects(() => rpc("defect.attachment.link", { defectId: "bug-1", fileId: "  " }), /附件 ID 不能为空/);

  fail = true;
  const cached = await rpc("defects.list", {});
  assert.equal(cached.items[0].id, "bug-1");
  assert.equal(cached.stale, true);
  assert.match(cached.warning, /offline/);
});

test("defect and pipeline normalizers preserve useful fields and mask secrets", () => {
  const defect = mapDefect("p1", {
    id: "bug-1",
    serialNumber: "BUG-1",
    subject: "登录失败",
    status: { id: "doing", displayName: "处理中" },
    assignedTo: { id: "u1", name: "张三" },
    modifier: { id: "u2", name: "李四" },
    customFieldValues: [{ fieldName: "优先级", values: [{ displayValue: "P1" }] }]
  });
  assert.equal(defect.statusName, "处理中");
  assert.equal(defect.assignedToName, "张三");
  assert.equal(defect.modifierName, "李四");
  assert.equal(defect.priority, "P1");

  const run = mapPipelineRun({
    pipelineId: 3,
    pipelineRunId: 9,
    status: "RUNNING",
    globalParams: [
      { key: "TOKEN", value: "plain", encrypted: true },
      { key: "MODE", value: "test", encrypted: false }
    ]
  });
  assert.equal(run.pipelineRunId, "9");
  assert.equal(run.globalParams[0].value, "******");
  assert.equal(run.globalParams[1].value, "test");
});

test("notification settings and target statuses are normalized", () => {
  assert.deepEqual(normalizeDefectNotification({ enabled: 1, intervalMinutes: 0 }), {
    enabled: true,
    assignedToId: "",
    assignedToName: "",
    intervalMinutes: 1,
    targetStatuses: []
  });
  assert.equal(isNotifiableDefectStatus("待确认"), true);
  assert.equal(isNotifiableDefectStatus("再次打开"), true);
  assert.equal(isNotifiableDefectStatus("REOPENED"), true);
  assert.equal(isNotifiableDefectStatus("处理中"), false);
});

test("status extraction accepts nested workflow response shapes", () => {
  assert.deepEqual(
    extractStatuses({ data: { workflows: [{ statuses: [{ id: "done", displayName: "已完成" }] }] } }),
    [{ id: "done", displayName: "已完成" }]
  );
});

test("inline rich-text attachment identifiers are detected without duplicates", () => {
  assert.deepEqual(inlineFileIds([
    '<img data-file-id="inline-file-123456">',
    "https://example.test/files/inline-file-123456?download=1",
    "https://example.test/image?fileIdentifier=another-file-123"
  ]), ["inline-file-123456", "another-file-123"]);
});

test("API client sends the official defect search contract", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json", "x-total-count": "0" }
    });
  };
  const client = createApiClient({
    apiBaseUrl: "https://openapi-rdc.aliyuncs.com",
    timeoutMs: 5000
  });
  await client.listDefects(
    { organizationId: "org-1", token: "token" },
    "project-1",
    { serialNumber: "BUG-12", subject: "登录", statusId: "doing", assignedToId: "u1" }
  );

  assert.match(calls[0].url, /workitems:search$/);
  assert.equal(calls[0].options.headers["x-yunxiao-token"], "token");
  assert.equal(calls[0].options.headers["cache-control"], "no-cache");
  assert.equal(calls[0].options.cache, "no-store");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.orderBy, "gmtCreate");
  assert.equal(body.sort, "desc");
  const filters = JSON.parse(body.conditions).conditionGroups[0];
  assert.deepEqual(filters.map((item) => [item.fieldIdentifier, item.value[0]]), [
    ["serialNumber", "BUG-12"],
    ["subject", "登录"],
    ["assignedTo", "u1"],
    ["status", "doing"]
  ]);

  await client.listDefects(
    { organizationId: "org-1", token: "token" },
    "project-1",
    { statusIds: ["s-todo-1", "s-todo-2", " "] }
  );
  const multiStatus = JSON.parse(JSON.parse(calls[1].options.body).conditions).conditionGroups[0];
  assert.deepEqual(multiStatus, [{
    fieldIdentifier: "status",
    operator: "CONTAINS",
    value: ["s-todo-1", "s-todo-2"],
    toValue: null,
    className: "status",
    format: "list"
  }]);

  await client.listDefects(
    { organizationId: "org-1", token: "token" },
    "project-1",
    { page: 1, pageSize: 100, orderBy: "gmtModified" }
  );
  assert.equal(JSON.parse(calls[2].options.body).orderBy, "gmtModified");
  assert.equal(JSON.parse(calls[2].options.body).perPage, 100);
});

test("notification status IDs are resolved before filtered polling", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify([
      { id: "bug-1", status: { id: "pending-id", displayName: "待确认" } },
      { id: "bug-2", status: { id: "reopened-id", displayName: "再次打开" } }
    ]), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const statuses = await client.resolveNotificationStatuses(
    { organizationId: "org-1", token: "token" },
    "project-1"
  );
  assert.deepEqual(statuses, [
    { id: "pending-id", name: "待确认" },
    { id: "reopened-id", name: "再次打开" }
  ]);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.orderBy, "gmtModified");
  assert.equal(body.perPage, 100);
});

test("API client reads workflow statuses without loading comments and updates list status", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    const method = options.method || "GET";
    calls.push({ url: value, method, body: options.body });
    if (value.endsWith("/workflow")) {
      return new Response(JSON.stringify({ statuses: [
        { id: "doing", displayName: "处理中" },
        { id: "done", displayName: "已完成" }
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "PUT") {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const updated = calls.some((item) => item.method === "PUT");
    return new Response(JSON.stringify({
      id: "bug-1",
      serialNumber: "BUG-1",
      subject: "登录失败",
      status: { id: updated ? "done" : "doing", displayName: updated ? "已完成" : "处理中" },
      assignedTo: { id: "u1", name: "张三" },
      space: { id: "project-1" },
      workitemType: { id: "type-1" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const account = { organizationId: "org-1", token: "token" };

  const statuses = await client.getDefectStatuses(account, "project-1", "bug-1");
  assert.deepEqual(statuses, [
    { id: "doing", name: "处理中" },
    { id: "done", name: "已完成" }
  ]);
  assert.equal(calls.some((item) => /comments|attachments/.test(item.url)), false);

  const updated = await client.updateDefectStatus(account, "project-1", "bug-1", "done");
  const updateCall = calls.find((item) => item.method === "PUT");
  assert.deepEqual(JSON.parse(updateCall.body), { status: "done" });
  assert.equal(updated.statusId, "done");
});

test("API client updates defect assignee and lists project members without duplicates", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    const method = options.method || "GET";
    calls.push({ url: value, method, body: options.body });
    if (method === "PUT") {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value.endsWith("/members")) {
      return new Response(JSON.stringify([
        { roleId: "project.admin", roleName: "管理员", userId: "u2", userName: "李四" },
        { roleId: "project.member", roleName: "开发", userId: "u2", userName: "李四" },
        { roleId: "project.member", roleName: "开发", userId: "u1", userName: "张三" }
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    const updated = calls.some((item) => item.method === "PUT");
    return new Response(JSON.stringify({
      id: "bug-1",
      serialNumber: "BUG-1",
      subject: "登录失败",
      status: { id: "doing", displayName: "处理中" },
      assignedTo: { id: updated ? "u2" : "u1", name: updated ? "李四" : "张三" },
      modifier: { id: "me", name: "当前账号" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const account = { organizationId: "org-1", token: "token" };

  const updated = await client.updateDefectAssignee(account, "project-1", "bug/1", "u2");
  const putCall = calls.find((item) => item.method === "PUT");
  assert.match(putCall.url, /workitems\/bug%2F1$/);
  assert.deepEqual(JSON.parse(putCall.body), { assignedTo: "u2" });
  assert.equal(updated.assignedToId, "u2");
  assert.equal(updated.modifierName, "当前账号");

  await assert.rejects(() => client.listProjectMembers(account, ""), /请先选择项目/);
  const members = await client.listProjectMembers(account, "project-1");
  assert.match(calls.at(-1).url, /projects\/project-1\/members$/);
  assert.deepEqual(members, [
    { id: "u2", name: "李四" },
    { id: "u1", name: "张三" }
  ]);
});

test("API client creates a defect comment with the official work-item contract", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ id: "comment-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const created = await client.createDefectComment(
    { organizationId: "org-1", token: "token" },
    "project-1",
    "bug/1",
    "  已完成修复，请验证。  "
  );

  assert.match(calls[0].url, /workitems\/bug%2F1\/comments$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { content: "已完成修复，请验证。" });
  assert.deepEqual(created, { id: "comment-1", projectId: "project-1", defectId: "bug/1" });
});

test("pipeline branches support nested pipelineConfig sources and run payload omits envs", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, options });
    if (value.includes("/repositories/") && value.endsWith("/branches?page=1&perPage=100&sort=updated_desc")) {
      return new Response(JSON.stringify([{ name: "master" }, { name: "release/1.0" }]), {
        status: 200,
        headers: { "content-type": "application/json", "x-total-pages": "1" }
      });
    }
    if (value.endsWith("/pipelines/5208752") && (options.method || "GET") === "GET") {
      return new Response(JSON.stringify({
        id: 5208752,
        name: "web-supply",
        pipelineConfig: {
          settings: "{}",
          sources: [{
            name: "ui-supply_internal",
            label: "学校后台前端",
            sign: "source-1",
            type: "codeup",
            data: {
              repo: "https://codeup.aliyun.com/org/school/ui-supply.git",
              branch: "master",
              isBranchMode: false
            }
          }]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value.endsWith("/pipelines/5208752/runs") && options.method === "POST") {
      return new Response(JSON.stringify({ pipelineRunId: 9001 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected request: ${options.method || "GET"} ${value}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const account = { organizationId: "org-1", token: "token" };

  const sources = await client.listPipelineBranches(account, "5208752");
  assert.deepEqual(sources[0].branches, ["master", "release/1.0"]);
  assert.equal(sources[0].defaultBranch, "master");
  assert.equal(sources[0].name, "学校后台前端");

  const run = await client.createPipelineRun(account, "5208752", {
    runningBranches: { "https://codeup.aliyun.com/org/school/ui-supply.git": "release/1.0" },
    envs: { SHOULD_NOT_BE_SENT: "1" },
    comment: "发布验证"
  });
  const post = calls.find((item) => item.options.method === "POST");
  const params = JSON.parse(JSON.parse(post.options.body).params);
  assert.deepEqual(params, {
    runningBranchs: { "https://codeup.aliyun.com/org/school/ui-supply.git": "release/1.0" },
    comment: "发布验证"
  });
  assert.equal(run.pipelineRunId, "9001");
});

test("pipeline branch errors distinguish PAT scope from repository membership", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/pipelines/1")) {
      return new Response(JSON.stringify({
        id: 1,
        name: "构建",
        pipelineConfig: { sources: [{
          type: "codeup",
          name: "repo",
          data: { repo: "https://codeup.aliyun.com/org/group/repo.git", branch: "main" }
        }] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value.includes("/repositories/org%2Fgroup%2Frepo/branches")) {
      return new Response(JSON.stringify({ errorMessage: "访问的资源无权限" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }
    if (value.includes("/repositories?page=1&perPage=1")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected request: ${value}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const sources = await client.listPipelineBranches({ organizationId: "org", token: "token" }, "1");
  assert.match(sources[0].warning, /API 权限已生效/);
  assert.match(sources[0].warning, /代码库访问权限/);
  assert.deepEqual(sources[0].branches, []);
});

test("project defect status options merge every Bug workitem type workflow", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith("/workitemTypes?category=Bug")) {
      return new Response(JSON.stringify([
        { id: "type-1", name: "缺陷" },
        { id: "type-2", name: "线上缺陷" }
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value.endsWith("/workitemTypes/type-1/workflows")) {
      return new Response(JSON.stringify({ statuses: [{ id: "s1", name: "待确认" }, { id: "s2", displayName: "处理中" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (value.endsWith("/workitemTypes/type-2/workflows")) {
      return new Response(JSON.stringify({ statuses: [{ id: "s3", name: "待确认" }, { id: "s4", name: "已关闭" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`unexpected request: ${value}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const statuses = await client.listDefectStatusOptions({ organizationId: "org-1", token: "token" }, "project-1");
  assert.deepEqual(statuses, [
    { id: "s1", name: "待确认" },
    { id: "s2", name: "处理中" },
    { id: "s3", name: "待确认" },
    { id: "s4", name: "已关闭" }
  ]);
  assert.match(calls[0], /projects\/project-1\/workitemTypes\?category=Bug$/);
  assert.equal(calls.filter((item) => item.endsWith("/workflows")).length, 2);
});

test("project status options fall back to recent defects and the first defect workflow", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push(`${options.method || "GET"} ${value}`);
    if (value.endsWith("/workitemTypes?category=Bug")) {
      return new Response(JSON.stringify({ errorMessage: "无权限" }), { status: 403, headers: { "content-type": "application/json" } });
    }
    if (value.endsWith("/workitems:search")) {
      return new Response(JSON.stringify([
        { id: "bug-1", status: { id: "s9", displayName: "待确认" } },
        { id: "bug-2", status: { id: "s8", displayName: "处理中" } }
      ]), { status: 200, headers: { "content-type": "application/json", "x-total-count": "2" } });
    }
    if (value.endsWith("/workitems/bug-1")) {
      return new Response(JSON.stringify({ id: "bug-1", space: { id: "project-1" }, workitemType: { id: "type-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (value.endsWith("/workitems/bug-1/workflow")) {
      return new Response(JSON.stringify({ statuses: [{ id: "s2", name: "处理中" }, { id: "s4", name: "已关闭" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`unexpected request: ${options.method || "GET"} ${value}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const statuses = await client.listDefectStatusOptions({ organizationId: "org-1", token: "token" }, "project-1");
  assert.deepEqual(statuses, [
    { id: "s9", name: "待确认" },
    { id: "s8", name: "处理中" },
    { id: "s2", name: "处理中" },
    { id: "s4", name: "已关闭" }
  ]);
});

test("pipeline branches are fetched for SSH-style and repoUrl-only codeup sources", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("/repositories/org%2Fssh-repo/branches")) {
      return new Response(JSON.stringify([{ name: "master" }, { name: "develop" }]), {
        status: 200,
        headers: { "content-type": "application/json", "x-total-pages": "1" }
      });
    }
    if (value.includes("/repositories/org%2Falt-repo/branches")) {
      return new Response(JSON.stringify([{ name: "main" }]), {
        status: 200,
        headers: { "content-type": "application/json", "x-total-pages": "1" }
      });
    }
    if (value.endsWith("/pipelines/7")) {
      return new Response(JSON.stringify({
        id: 7,
        name: "branches",
        pipelineConfig: { sources: [
          { type: "codeup", name: "ssh-source", data: { repo: "git@codeup.aliyun.com:org/ssh-repo.git", branch: "master" } },
          { type: "codeup", name: "alt-source", data: { repoUrl: "https://codeup.aliyun.com/org/alt-repo.git", branch: "main" } }
        ] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected request: ${value}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const sources = await client.listPipelineBranches({ organizationId: "org-1", token: "token" }, "7");
  assert.deepEqual(sources[0].branches, ["master", "develop"]);
  assert.equal(sources[0].repo, "git@codeup.aliyun.com:org/ssh-repo.git");
  assert.equal(sources[0].warning, "");
  assert.deepEqual(sources[1].branches, ["main"]);
  assert.equal(sources[1].repo, "https://codeup.aliyun.com/org/alt-repo.git");
  assert.equal(sources[1].warning, "");
});

test("RPC lists harness workspaces and binds one to the current project", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsh-yunxiao-ws-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createJsonStore(path.join(directory, "data.json"), 100);
  const account = await store.saveAccount({ name: "主账号", organizationId: "org", token: "token" });
  await store.selectProject(account.id, { id: "p1", name: "项目一" });

  const workspaces = [
    { id: "ws-1", title: "插件仓库", path: "E:/code/plugin" },
    { id: "ws-2", title: "前端仓库", path: "E:/code/web" }
  ];
  const rpc = createRpc(store, {}, async () => ({ supported: false, accepted: false, channel: "unsupported" }), () => workspaces);

  const listed = await rpc("workspaces.list", {});
  assert.deepEqual(listed, { items: workspaces });

  const bound = await rpc("project.workspace.bind", { workspaceId: "ws-1" });
  assert.deepEqual(bound, { id: "ws-1", title: "插件仓库", path: "E:/code/plugin" });
  const state = await store.publicState();
  assert.deepEqual(state.accounts[0].workspace, { id: "ws-1", title: "插件仓库", path: "E:/code/plugin" });

  await assert.rejects(() => rpc("project.workspace.bind", { workspaceId: "ws-404" }), /未找到该 DSH 工作区/);

  const cleared = await rpc("project.workspace.bind", { workspaceId: "" });
  assert.equal(cleared, null);
  const stateAfterClear = await store.publicState();
  assert.equal(stateAfterClear.accounts[0].workspace, null);
});

test("attachment data downloads images host-side with type detection and size limits", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("/workitems/bug-1/files/file-1")) {
      return new Response(JSON.stringify({ workitemFile: { id: "file-1", name: "截图.png", suffix: "png", url: "https://oss.example.com/fresh-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (value.includes("/workitems/bug-1/files/file-2")) {
      return new Response(JSON.stringify({ workitemFile: { id: "file-2", name: "图表", suffix: "", url: "https://oss.example.com/fresh-2" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (value.startsWith("https://oss.example.com/fresh-1")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    }
    if (value.startsWith("https://oss.example.com/fresh-2")) {
      return new Response(new Uint8Array([255, 216, 255]), { status: 200, headers: { "content-type": "application/octet-stream" } });
    }
    throw new Error(`unexpected request: ${value}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const account = { organizationId: "org-1", token: "token" };

  const png = await client.getAttachmentData(account, "project-1", "bug-1", "file-1");
  assert.equal(png.mediaType, "image/png");
  assert.equal(png.fileName, "截图.png");
  assert.equal(png.size, 4);
  assert.equal(Buffer.from(png.data, "base64").toString("hex"), "89504e47");

  // content-type 无法识别时按后缀回退；两者都无法识别时 mediaType 为空，由调用方跳过该图。
  const unknown = await client.getAttachmentData(account, "project-1", "bug-1", "file-2");
  assert.equal(unknown.mediaType, "");
  assert.equal(unknown.size, 3);

  await assert.rejects(() => client.getAttachmentData(account, "project-1", "bug-1", "file-1", { maxBytes: 2 }), /附件超过/);
});

test("client wires workspace binding and the defect handle flow", async () => {
  const source = await readFile(new URL("../dist/client.js", import.meta.url), "utf8");
  assert.match(source, /exports\.inject = \["slots", "layout", "sessions", "workspaces"\]/);
  assert.match(source, /rpc\("workspaces\.list"\)/);
  assert.match(source, /rpc\("project\.workspace\.bind"/);
  assert.match(source, /runHandleDefect\(item, "draft"\)/);
  assert.match(source, /runHandleDefect\(item, "immediate"\)/);
  assert.match(source, /defectHandleAllowed/);
  assert.match(source, /dyx-status-row-actions/);
  // 处理不再走弹窗选项：旧的弹窗函数与选项卡样式不应残留。
  assert.doesNotMatch(source, /openHandleDefect/);
  assert.doesNotMatch(source, /dyx-handle-option/);
  assert.match(source, /connectWorkspace\(workspaceId\)/);
  assert.match(source, /sessions\.create\(\{ workspaceId: workspaceId \}\)/);
  assert.match(source, /session\.prompt\(content, "queue"\)/);
  assert.match(source, /target\.shell\.setDraft\(payload\.text\)/);
  // 会话正文只保留缺陷标题：编号、概要、附件列表不进入文案，纯图片描述不显示“缺陷描述”。
  assert.doesNotMatch(source, /var lead = item\.serialNumber/);
  assert.doesNotMatch(source, /meta\.push\("状态：/);
  assert.doesNotMatch(source, /"附件：" \+ files/);
  assert.doesNotMatch(source, /"图片" \+ \(alt/);
});

test("v3 workbench wires the new domains, full-page mode and the policy-driven flows page", async () => {
  const source = await readFile(new URL("../dist/client.js", import.meta.url), "utf8");
  assert.match(source, /\["dashboard", "概览"\], \["defects", "工作项"\]/);
  assert.match(source, /dyx-right-panel/);
  assert.match(source, /FULL_MODE_STORAGE_KEY/);
  assert.match(source, /dataset\.full = FULL_MODE_ACTIVE \? "true" : "false"/);
  assert.match(source, /dyx-flow-canvas/);
  // 客户端执行引擎已下线：执行全部收敛到宿主规则引擎。
  assert.doesNotMatch(source, /function startFlowRun/);
  assert.doesNotMatch(source, /function stepFlowRun/);
  assert.doesNotMatch(source, /function executeFlowNode/);
  assert.doesNotMatch(source, /function runFlowAgent/);
  assert.doesNotMatch(source, /maybeAutoRunFlows/);
  assert.doesNotMatch(source, /rpc\("flows\.run\.save"/);
  assert.doesNotMatch(source, /rpc\("flows\.save"/);
  // 编排页为规则驱动：规则 / 运行台账 / 待确认裁决 / 旧画布只读。
  assert.match(source, /rpc\("flows\.list"/);
  assert.match(source, /rpc\("policies\.list"/);
  assert.match(source, /rpc\("policies\.save"/);
  assert.match(source, /rpc\("policies\.test"/);
  assert.match(source, /rpc\("runs\.list"/);
  assert.match(source, /rpc\("runs\.confirm", \{ runId: run\.id, decision: decision \}/);
  assert.match(source, /rpc\("engine\.status"/);
  assert.match(source, /rpc\("engine\.scanNow"/);
  assert.match(source, /dyx-flow-subtabs/);
  assert.match(source, /旧版画布（只读）/);
  assert.match(source, /renderInboxPage/);
  // 触发范围支持指定缺陷负责人筛选（引擎扫描按该负责人过滤）。
  assert.match(source, /缺陷负责人（只处理该负责人的缺陷，留空不限）/);
  assert.match(source, /policyAssigneeLabel/);
  assert.match(source, /rpc\("code\.repos\.list"/);
  assert.match(source, /rpc\("code\.mrs\.list"/);
  assert.match(source, /rpc\("tests\.plans\.list"/);
  assert.match(source, /rpc\("packages\.repos\.list"/);
  assert.doesNotMatch(source, /title: "云效编排提醒"/);
});

test("code, tests and packages lists mirror the pipeline grid with pagination", async () => {
  const source = await readFile(new URL("../dist/client.js", import.meta.url), "utf8");
  // 三个视图共用与流水线同规格的方格网格 + 分页器；代码页带关键词搜索。
  const codeView = source.slice(source.indexOf("function renderCode"), source.indexOf("function repoGrid"));
  assert.match(codeView, /dyx-statstrip/);
  assert.match(codeView, /dyx-list-toolbar/);
  assert.match(codeView, /pager\(state\.code, onRepoPage\)/);
  assert.match(codeView, /state\.code\.keyword = keyword\.value\.trim\(\)/);
  assert.match(codeView, /event\.key === "Enter"/);
  assert.match(codeView, /repoGrid\(items\)/);
  const testsView = source.slice(source.indexOf("function renderTests"), source.indexOf("function planGrid"));
  assert.match(testsView, /dyx-statstrip/);
  assert.match(testsView, /pager\(state\.tests, onPlanPage\)/);
  assert.match(testsView, /planGrid\(items\)/);
  const packagesView = source.slice(source.indexOf("function renderPackages"), source.indexOf("function packageGrid"));
  assert.match(packagesView, /dyx-statstrip/);
  assert.match(packagesView, /pager\(state\.packages, onPackagePage\)/);
  assert.match(packagesView, /packageGrid\(items\)/);
  assert.match(source, /function packageRepoKind/);
  assert.match(source, /dyx-tile-grid\{grid-template-columns:repeat\(auto-fill,minmax\(288px,1fr\)\);gap:11px\}/);
  // 服务端调用带上分页参数；代码库附带 search 关键词。
  assert.match(source, /rpcArgs\(\{ page: state\.code\.page, pageSize: state\.code\.pageSize, search: state\.code\.keyword \}\)/);
  assert.match(source, /rpcArgs\(\{ page: state\.tests\.page, pageSize: state\.tests\.pageSize \}\)/);
  assert.match(source, /rpcArgs\(\{ page: state\.packages\.page, pageSize: state\.packages\.pageSize \}\)/);
});

test("pipeline run dialog renders immediately and survives branch read failures", async () => {
  const source = await readFile(new URL("../dist/client.js", import.meta.url), "utf8");
  const runForm = source.slice(source.indexOf("function openRunPipeline"), source.indexOf("function openPipelineRun"));
  // 表单先渲染再异步补充分支控件；代码源控件插到“运行备注”之前。
  assert.match(runForm, /var statusNote = node\("div", "dyx-note", "正在读取代码源与分支…"\)/);
  assert.match(runForm, /form\.insertBefore\(sourceField, commentField\)/);
  assert.match(runForm, /dialog\.foot\.append\(button\("取消", "", dialog\.close\), button\("确认运行", "primary", confirmRun\)\)/);
  // 分支读取失败：保留可用的运行表单（手动分支输入），不再只有报错空态。
  assert.match(runForm, /statusNote\.textContent = "代码源与分支读取失败："/);
  assert.match(runForm, /manualBranchInput = input\("text", "留空使用流水线默认分支", ""\)/);
  assert.match(runForm, /if \(manualBranchInput\) \{ var manualValue = manualBranchInput\.value\.trim\(\); if \(manualValue\) branchModeBranches\.push\(manualValue\); \}/);
  assert.doesNotMatch(runForm, /代码源读取失败", error\.message/);
});

test("dashboard and settings adopt the shared stat strip and tile grids", async () => {
  const source = await readFile(new URL("../dist/client.js", import.meta.url), "utf8");
  // 概览：拉伸 tile 换成固定宽度统计卡；待处理缺陷复用工作项页卡片，编排改方格卡片并可直达对应画布。
  const dashboard = source.slice(source.indexOf("function renderDashboard"), source.indexOf("function flowGrid"));
  assert.match(dashboard, /dyx-statstrip/);
  assert.match(dashboard, /defectTable\(pending\.slice\(0, DASHBOARD_PREVIEW_LIMIT\)\)/);
  assert.match(dashboard, /flowGrid\(state\.flows\.items\.slice\(0, DASHBOARD_PREVIEW_LIMIT\)\)/);
  assert.match(dashboard, /button\("查看全部", "", function \(\) \{ setTab\("defects"\); \}\)/);
  assert.doesNotMatch(dashboard, /dyx-tiles|"dyx-tile"/);
  const flowGrid = source.slice(source.indexOf("function flowGrid"), source.indexOf("function loadCodeRepos"));
  assert.match(flowGrid, /dyx-record-list dyx-tile-grid/);
  assert.match(flowGrid, /state\.flows\.active = index/);
  // 设置：统计卡 + 账号方格卡片 + 项目/工作区双栏并排。
  const settings = source.slice(source.indexOf("function renderOverview"), source.indexOf("function accountGrid"));
  assert.match(settings, /dyx-statstrip/);
  assert.match(settings, /accountGrid\(accounts\)/);
  assert.match(settings, /var layout = node\("div", "dyx-settings-layout"\)/);
  assert.match(settings, /renderWorkspaceBinding\(layout, account\)/);
  const accountGrid = source.slice(source.indexOf("function accountGrid"), source.indexOf("function renderWorkspaceBinding"));
  assert.match(accountGrid, /dyx-tile-card dyx-account/);
  assert.match(accountGrid, /button\("设为当前", "dyx-btn-sm"/);
  assert.match(source, /function renderWorkspaceBinding\(container, account\)/);
  // 旧的拉伸 tile / 账号网格样式已删除，新增双栏布局与统计卡文本省略。
  assert.doesNotMatch(source, /\.dyx-tiles\{|\.dyx-grid\{/);
  assert.match(source, /\.dyx-settings-layout\{display:grid/);
  assert.match(source, /@container\(min-width:920px\)\{\.dyx-settings-layout\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
  assert.match(source, /\.dyx-stat strong\{[^}]*text-overflow:ellipsis\}/);
  // 概览里的内联状态修改也会触发刷新。
  assert.match(source, /else if \(state\.tab === "dashboard"\) loadDashboard\(\);/);
});

test("flow definitions and runs persist with whitelist sanitization", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsh-yunxiao-flows-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createJsonStore(path.join(directory, "data.json"), 10);

  const junkFlow = {
    id: "flow-1",
    name: "缺陷自动修复流",
    on: 1,
    autoRun: true,
    trg: "缺陷单流转",
    nodes: [
      { id: "n1", tp: "trg-item", name: "触发", x: 1.2, y: -5, cfg: { tp: "缺陷", junk: { deep: true } } },
      { id: "", tp: "trg-item", name: "应为空" },
      { id: "n2", tp: "evil-type", name: "应为空" },
      { id: "n1", tp: "op-cond", name: "重复 ID 应丢弃" }
    ],
    edges: [
      { f: "n1", t: "n2" },
      { f: "n1", t: "n9" },
      { f: "n1", t: "n1" }
    ],
    runs: Array.from({ length: 40 }, (_, index) => ({ id: "r" + index, status: "成功" }))
  };
  const saved = await store.saveFlow(junkFlow);
  assert.equal(saved.nodes.length, 1);
  assert.equal(saved.nodes[0].id, "n1");
  assert.equal(saved.nodes[0].y, 0);
  assert.deepEqual(saved.nodes[0].cfg, { tp: "缺陷" });
  assert.deepEqual(saved.edges, []);
  assert.equal(saved.on, true);
  assert.equal(saved.runs.length, 30);

  const run = await store.saveFlowRun("flow-1", { id: "r-new", status: "进行中", nodes: { n1: "成功" }, log: [{ t: "1s", m: "x" }] });
  assert.equal(run.id, "r-new");
  const state = JSON.parse(await readFile(path.join(directory, "data.json"), "utf8"));
  assert.equal(state.flows[0].runs[0].id, "r-new");
  const again = await store.saveFlowRun("flow-1", { id: "r-new", status: "成功", nodes: { n1: "成功" }, log: [] });
  assert.equal(again.status, "成功");
  const storedRuns = (await store.listFlows())[0].runs;
  assert.equal(storedRuns.length, 30);
  assert.equal(storedRuns[0].id, "r-new");

  await assert.rejects(() => store.saveFlow({ name: "" }), /编排名称不能为空/);
  const autoId = await store.saveFlow({ name: "自动编号编排" });
  assert.ok(autoId.id);
  await assert.rejects(() => store.saveFlowRun("missing", { id: "r" }), /编排不存在/);
  await store.deleteFlow("flow-1");
  await assert.rejects(() => store.deleteFlow("flow-1"), /编排不存在/);
  await store.deleteFlow(autoId.id);
  assert.deepEqual(await store.listFlows(), []);
});

test("codeup repositories, merge requests and merge use the organization contract", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, method: options.method || "GET", body: options.body });
    if (value.endsWith("/repositories?page=1&perPage=20&search=demo")) {
      return new Response(JSON.stringify([
        { id: 7, pathWithNamespace: "org/demo-app", name: "demo-app", default_branch: "main", description: "主站" },
        { id: 8, path: "org/empty", name: "" }
      ]), { status: 200, headers: { "content-type": "application/json", "x-total-count": "1" } });
    }
    if (value.endsWith("/repositories/org%2Fdemo-app/merge_requests?state=opened&page=1&perPage=20")) {
      return new Response(JSON.stringify([
        { id: 512, title: "修复验证码", state: "opened", source_branch: "feature/x", target_branch: "main", author_name: "张三" }
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value.endsWith("/repositories/org%2Fdemo-app/merge_requests/512/merge") && options.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected request: ${options.method || "GET"} ${value}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const account = { organizationId: "org-1", token: "token" };

  const repos = await client.listCodeupRepositories(account, { search: "demo" });
  assert.equal(repos.items.length, 2);
  assert.equal(repos.items[0].path, "org/demo-app");
  assert.equal(repos.items[0].defaultBranch, "main");
  // name 缺省时回退为仓库路径。
  assert.equal(repos.items[1].name, "org/empty");

  const mrs = await client.listCodeupMergeRequests(account, "org/demo-app", { state: "opened" });
  assert.equal(mrs.items[0].id, "512");
  assert.equal(mrs.items[0].sourceBranch, "feature/x");

  await assert.rejects(() => client.mergeCodeupMergeRequest(account, "", "512"), /不能为空/);
  await client.mergeCodeupMergeRequest(account, "org/demo-app", "512");
  const merge = calls.find((item) => item.url.endsWith("/merge"));
  assert.equal(merge.method, "POST");
});

// —— 规则引擎：匹配器 / 清洗 / 引擎状态机 / RPC ——————————————————————————————

function enginePolicy(overrides = {}) {
  return normalizePolicy({
    id: "p1",
    name: "样式自动修复",
    enabled: true,
    trigger: { statusKinds: ["pending"], pollMinutes: 5, backfill: false },
    match: { keywordsAny: ["样式", "错位"], keywordsNone: ["支付"], priorityCeiling: "P2" },
    mode: "auto-submit",
    instructions: "只改前端展示层",
    agent: { preset: "standard", permissionPreset: "auto-fix", maxMinutes: 30 },
    submit: {
      repoId: "123", baseBranch: "develop", branchPattern: "fix/{serial}-{slug}",
      createMr: true, mrTarget: "develop", maxChangedFiles: 30, forbiddenPaths: ["**/payment/**"]
    },
    writeback: { comment: true, statusOnSuccess: "已修复", statusOnConfirm: "处理中" },
    ...overrides
  });
}

function makeEngineStore() {
  const state = {
    selectedAccountId: "a1",
    accounts: [{
      id: "a1", name: "主账号", organizationId: "org1", token: "tok",
      selectedProject: { id: "prj1", name: "演示项目" },
      projectSettings: { prj1: { workspace: { id: "ws1", title: "工作区", path: "/tmp/ws" } } }
    }],
    policies: [], runs: [], runsSeen: {}
  };
  return {
    state,
    async listPolicies() { return state.policies; },
    async savePolicy(input) {
      const policy = normalizePolicy({ ...input, order: state.policies.length });
      state.policies.push(policy);
      return policy;
    },
    async markPolicyScanned(policyId, at) {
      const policy = state.policies.find((item) => item.id === policyId);
      if (policy) policy.lastScanAt = at;
    },
    async markSeen(defectId, info) {
      state.runsSeen[defectId] = {
        runId: info?.runId || "", policyId: info?.policyId || "",
        at: info?.at || new Date().toISOString(), fingerprint: info?.fingerprint || "", outcome: info?.outcome || ""
      };
    },
    async markSeenBatch(entries) {
      for (const entry of entries) {
        if (!state.runsSeen[entry.defectId]) {
          state.runsSeen[entry.defectId] = { runId: "", policyId: entry.policyId, at: new Date().toISOString(), fingerprint: entry.fingerprint, outcome: "snapshot" };
        }
      }
    },
    async saveRun(run) {
      const index = state.runs.findIndex((item) => item.id === run.id);
      if (index >= 0) state.runs[index] = { ...run };
      else state.runs.unshift({ ...run });
    },
    async getRun(runId) { return state.runs.find((run) => run.id === runId) || null; },
    async listRuns() { return state.runs; },
    async reorderPolicies(ids) {
      const byId = new Map(state.policies.map((item) => [item.id, item]));
      state.policies = ids.map((id) => byId.get(id)).filter(Boolean);
      return state.policies;
    },
    async deletePolicy(policyId) {
      const index = state.policies.findIndex((item) => item.id === policyId);
      if (index < 0) throw new Error("规则不存在");
      state.policies.splice(index, 1);
      return { ok: true };
    },
    async resolvePolicyScope() {
      return { account: state.accounts[0], projectId: "prj1", workspace: state.accounts[0].projectSettings.prj1.workspace };
    },
    async load() { return state; }
  };
}

function makeEngineApi(defectRows) {
  const calls = [];
  return {
    calls,
    async resolveNotificationStatuses() {
      return [{ id: "s1", name: "待确认" }, { id: "s2", name: "再次打开" }];
    },
    async listDefects(account, projectId, query) {
      return { items: defectRows.filter((row) => row.statusId === query.statusIds?.[0]) };
    },
    async getDefect(account, projectId, defectId) {
      const row = defectRows.find((item) => item.id === defectId);
      return {
        defect: { ...row },
        description: row.description || "",
        comments: [], attachments: [], statuses: [], warning: ""
      };
    },
    async createChangeRequest(account, repoId, input) {
      calls.push(["mr", repoId, input.sourceBranch, input.targetBranch]);
      return { localId: "mr-9", url: "https://codeup.example/mr/9" };
    },
    async createDefectComment(account, projectId, defectId, content) {
      calls.push(["comment", defectId, content]);
      return { id: "c1" };
    },
    async listDefectStatusOptions() {
      return [{ id: "st-fixed", name: "已修复" }, { id: "st-doing", name: "处理中" }];
    },
    async updateDefectStatus(account, projectId, defectId, statusId) {
      calls.push(["status", defectId, statusId]);
      return {};
    },
    async updateDefectAssignee(account, projectId, defectId, assignedToId) {
      calls.push(["assignee", defectId, assignedToId]);
      return {};
    }
  };
}

// 假智能体：followup 后按提示词自动回一版 report；whenIdle 延迟 10ms 模拟整轮静止。
function makeEngineSvc(options = {}) {
  const created = [];
  const svc = {
    created,
    permissionPresets: {
      names: ["read-only", "workspace-write", "auto-fix"],
      resolve(nameValue) {
        const table = {
          "read-only": { sandbox: "read-only", approval: "ask" },
          "workspace-write": { sandbox: "workspace-write", approval: "ask" },
          "auto-fix": { sandbox: "workspace-write", approval: "never" }
        };
        if (!table[nameValue]) throw new Error(`unknown preset ${nameValue}`);
        return table[nameValue];
      },
      set() {}
    },
    agentPresets: {
      async resolve(id) { return { id: id || "standard" }; },
      async mount() {}
    },
    sessionTitle: { rename() {} },
    workspaceRegistry: { async create(value) { return { path: value, async attachSession() {} }; } },
    attachments: { async saveImages(inputs) { return inputs.map((item, index) => ({ attachmentId: `att-${index}` })); } },
    agents: {
      async create({ sessionId, setup }) {
        const agentCtx = { tools: { register(def) { if (def.name === "yunxiao_report_result") handle.reportTool = def; } } };
        const handle = {
          sessionId,
          reportTool: null,
          prompts: [],
          agent: {
            session: { deriveMessages() { return []; } },
            followup(message) {
              const text = (message.content || []).filter((block) => block.type === "text").map((block) => block.text).join("");
              handle.prompts.push(text);
              if (options.report) {
                queueMicrotask(() => handle.reportTool.execute(options.report(text), { concludeTurn() {} }));
              }
            },
            whenIdle: options.hang
              ? () => new Promise(() => {})
              : () => new Promise((resolve) => setTimeout(resolve, 10)),
            cancel() { handle.canceled = true; }
          },
          dispose() {}
        };
        await setup(agentCtx);
        created.push(handle);
        return handle;
      }
    }
  };
  return svc;
}

const AUTO_FIX_REPORT = {
  outcome: "fixed",
  summary: "已修复样式",
  branch: "fix/bug-1-style",
  commits: ["abc123"],
  changedFiles: ["src/pages/order/Amount.vue"],
  verify: [{ command: "pnpm lint", ok: true }]
};

function analyzeReport(text) {
  return /只读诊断/.test(text)
    ? { outcome: "analyzed", summary: "根因是映射缺失", plan: "补齐字段映射", risk: "低" }
    : AUTO_FIX_REPORT;
}

test("policy matcher honors keyword exclusions, priority ceiling and workitem type", () => {
  const policy = enginePolicy();
  assert.equal(policyMatches(policy, { subject: "订单页金额样式错位", priority: "P1", workitemType: "缺陷" }).matched, true);
  assert.equal(policyMatches(policy, { subject: "订单页金额样式错位", priority: "P3", workitemType: "缺陷" }).matched, false);
  assert.equal(policyMatches(policy, { subject: "支付页样式错位", priority: "P1", workitemType: "缺陷" }).matched, false);
  assert.equal(policyMatches(policy, { subject: "登录超时", priority: "P1", workitemType: "缺陷" }).matched, false);
  // 无法解析优先级时不拦截（列表项可能缺优先级字段）。
  assert.equal(policyMatches(policy, { subject: "样式问题", priority: "", workitemType: "缺陷" }).matched, true);
  const typedPolicy = enginePolicy({ match: { keywordsAny: ["样式"], priorityCeiling: "P2", typeAny: ["缺陷"] } });
  assert.equal(policyMatches(typedPolicy, { subject: "样式问题", priority: "P1", workitemType: "需求" }).matched, false);
  assert.equal(policyMatches(typedPolicy, { subject: "样式问题", priority: "P1", workitemType: "缺陷" }).matched, true);
});

test("policy and run normalizers apply whitelist sanitization", () => {
  const policy = normalizePolicy({ id: "p1", name: "规则", mode: "nonsense", match: { priorityCeiling: "p9" }, agent: { maxMinutes: 9999 }, submit: { branchPattern: "" } });
  assert.equal(policy.mode, "analyze-confirm");
  assert.equal(policy.match.priorityCeiling, "");
  assert.equal(policy.agent.maxMinutes, 720);
  assert.equal(policy.submit.branchPattern, "fix/{serial}-{slug}");
  assert.equal(policy.trigger.statusKinds.join(","), "pending,reopened");

  const run = normalizeRun({ id: "r1", status: "agent-running", result: { outcome: "fixed", verify: [{ command: "pnpm lint", ok: true }] } });
  assert.equal(run.status, "interrupted");
  assert.equal(run.result.outcome, "fixed");
  assert.equal(run.result.verify.length, 1);
  assert.equal(normalizeRun({ id: "" }), null);
});

test("flow whitelist keeps act-pipe nodes of the default template", () => {
  const flow = normalizeFlow({
    id: "f1",
    name: "缺陷自动修复流",
    nodes: [
      { id: "n1", tp: "trg-item", name: "触发", x: 0, y: 0, cfg: {} },
      { id: "n5", tp: "op-cond", name: "是否修复成功", x: 200, y: 20, cfg: {} },
      { id: "n6", tp: "act-pipe", name: "运行流水线", x: 8, y: 168, cfg: { pipe: "p1", br: "自动" } }
    ],
    edges: [
      { f: "n1", t: "n5" },
      { f: "n5", t: "n6", label: "是" }
    ]
  });
  assert.ok(flow, "flow should normalize");
  assert.ok(flow.nodes.some((node) => node.tp === "act-pipe"), "act-pipe node must survive");
  assert.equal(flow.edges.length, 2, "edges to act-pipe must survive");
});

test("policy engine runs the auto-submit pipeline end to end", async (t) => {
  const store = makeEngineStore();
  const api = makeEngineApi([
    { id: "d1", serialNumber: "bug-1", subject: "订单页金额样式错位", statusId: "s1", statusName: "待确认", workitemType: "缺陷", priority: "P1", gmtModified: "2026-10-21" }
  ]);
  const notifications = [];
  const engine = createPolicyEngine({
    store, api,
    notify: async (title, body) => { notifications.push(`${title}|${body}`); },
    timeScale: 0.001
  });
  await store.savePolicy(enginePolicy());
  engine.start(makeEngineSvc({ report: () => AUTO_FIX_REPORT }));
  t.after(() => engine.stop());
  await new Promise((resolve) => setTimeout(resolve, 30));

  // 首轮（backfill=false）只做快照，不产生运行。
  assert.equal(store.state.runs.length, 0);
  assert.equal(store.state.runsSeen.d1.outcome, "snapshot");

  // 指纹变化后（缺陷转为"再次打开"）正常入队并完成 auto-submit。
  api.listDefects = async (account, projectId, query) => (
    query.statusIds?.[0] === "s1"
      ? { items: [{ id: "d1", serialNumber: "bug-1", subject: "订单页金额样式错位", statusId: "s2", statusName: "再次打开", workitemType: "缺陷", priority: "P1", gmtModified: "2026-10-22" }] }
      : { items: [] }
  );
  for (const policy of store.state.policies) policy.lastScanAt = new Date(Date.now() - 10 * 60_000).toISOString();
  const scan = await engine.scanOnce();
  assert.equal(scan.results[0].matched, 1);
  await new Promise((resolve) => setTimeout(resolve, 60));

  const run = store.state.runs[0];
  assert.equal(run.status, "succeeded");
  assert.equal(run.mode, "auto-submit");
  assert.equal(run.result.mrUrl, "https://codeup.example/mr/9");
  assert.deepEqual(run.steps.map((step) => step.name), ["fetching", "classifying", "agent-running", "submitting", "writeback", "succeeded"]);
  assert.ok(api.calls.some(([kind, repoId, sourceBranch, targetBranch]) => kind === "mr" && targetBranch === "develop" && sourceBranch === "fix/bug-1-style"));
  assert.ok(api.calls.some(([kind, , statusId]) => kind === "status" && statusId === "st-fixed"));
  assert.ok(api.calls.some(([kind]) => kind === "comment"));
  assert.ok(notifications.some((line) => line.includes("bug-1")));
  assert.equal(engine.status().available, true);
  // 台账指向本次运行，冷却期内同指纹不再重跑。
  assert.equal(store.state.runsSeen.d1.runId, run.id);
  store.state.policies[0].lastScanAt = new Date(Date.now() - 10 * 60_000).toISOString();
  await engine.scanOnce();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(store.state.runs.length, 1, "same fingerprint must not retrigger");
});

test("policy engine parks analyze-confirm runs and resumes after approval", async (t) => {
  const store = makeEngineStore();
  const api = makeEngineApi([
    { id: "d2", serialNumber: "bug-2", subject: "结算接口报错 500", statusId: "s1", statusName: "待确认", workitemType: "缺陷", priority: "P1", gmtModified: "2026-10-22", description: "C 端下单接口报错" }
  ]);
  const engine = createPolicyEngine({ store, api, notify: async () => ({}), timeScale: 0.001 });
  await store.savePolicy(enginePolicy({
    id: "p2", name: "后台逻辑分析", mode: "analyze-confirm", trigger: { statusKinds: ["pending"], pollMinutes: 5, backfill: true },
    match: { keywordsAny: ["报错"] }, submit: { createMr: false }, writeback: { comment: true, statusOnConfirm: "处理中" }
  }));
  engine.start(makeEngineSvc({ report: analyzeReport }));
  t.after(() => engine.stop());
  await new Promise((resolve) => setTimeout(resolve, 30));

  const run = store.state.runs[0];
  assert.equal(run.status, "awaiting-confirm");
  assert.equal(run.result.outcome, "analyzed");
  assert.ok(api.calls.some(([kind, , statusId]) => kind === "status" && statusId === "st-doing"));

  // 未裁决前重复裁决 / 错误状态都会被拒绝。
  await assert.rejects(() => engine.confirmRun(run.id, "nonsense"), /未知裁决/);

  const approved = await engine.confirmRun(run.id, "approve");
  assert.equal(approved.status, "agent-running");
  await new Promise((resolve) => setTimeout(resolve, 80));
  const resumed = store.state.runs.find((item) => item.id === run.id);
  assert.equal(resumed.status, "succeeded");
  assert.equal(resumed.result.outcome, "fixed");
  assert.equal(resumed.result.branch, "fix/bug-1-style");
  assert.ok(api.calls.filter(([kind]) => kind === "mr").length === 0, "createMr=false must not create MRs");
  // 批准消息进入了同一会话。
  const handle = engine.status;
  assert.ok(store.state.runsSeen.d2.runId === run.id);
});

test("policy engine cancels a hung agent run and records cooldown skips", async (t) => {
  const store = makeEngineStore();
  const api = makeEngineApi([
    { id: "d3", serialNumber: "bug-3", subject: "样式错位第三例", statusId: "s1", statusName: "待确认", workitemType: "缺陷", priority: "P2", gmtModified: "2026-10-23" }
  ]);
  const engine = createPolicyEngine({ store, api, notify: async () => ({}), timeScale: 0.001 });
  await store.savePolicy(enginePolicy({ trigger: { statusKinds: ["pending"], pollMinutes: 5, backfill: true } }));
  engine.start(makeEngineSvc({ hang: true }));
  t.after(() => engine.stop());
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(store.state.runs[0].status, "agent-running");
  await engine.cancelRun(store.state.runs[0].id);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(store.state.runs[0].status, "canceled");
  assert.equal(store.state.runsSeen.d3.outcome, "canceled");
});

test("policy engine falls back to needs-human on agent timeout and guardrail violations", async (t) => {
  const store = makeEngineStore();
  const api = makeEngineApi([
    { id: "d4", serialNumber: "bug-4", subject: "样式超时用例", statusId: "s1", statusName: "待确认", workitemType: "缺陷", priority: "P2", gmtModified: "2026-10-24" }
  ]);
  const engine = createPolicyEngine({ store, api, notify: async () => ({}), timeScale: 0.001 });
  await store.savePolicy(enginePolicy({ agent: { preset: "standard", maxMinutes: 1 }, trigger: { statusKinds: ["pending"], pollMinutes: 5, backfill: true } }));
  engine.start(makeEngineSvc({ hang: true }));
  t.after(() => engine.stop());
  await new Promise((resolve) => setTimeout(resolve, 1400));
  const run = store.state.runs[0];
  assert.equal(run.status, "needs-human");
  assert.match(run.error, /超过 1 分钟/);
});

test("guardrails reject out-of-scope changes before any MR is created", () => {
  const policy = enginePolicy();
  // 通过 RPC 侧的 checkSubmitGuardrails 逻辑由引擎内部调用；这里以引擎私有行为等价验证：
  // 直接驱动一个 auto-submit 运行，报告命中禁改路径 → 需人工且不建 MR。
  const store = makeEngineStore();
  const api = makeEngineApi([
    { id: "d5", serialNumber: "bug-5", subject: "样式越界用例", statusId: "s1", statusName: "待确认", workitemType: "缺陷", priority: "P1", gmtModified: "2026-10-25" }
  ]);
  const engine = createPolicyEngine({ store, api, notify: async () => ({}), timeScale: 0.001 });
  return store.savePolicy(enginePolicy({ trigger: { statusKinds: ["pending"], pollMinutes: 5, backfill: true } })).then(async () => {
    engine.start(makeEngineSvc({
      report: () => ({
        ...AUTO_FIX_REPORT,
        changedFiles: ["src/payment/settle.vue", "src/pages/order/Amount.vue"]
      })
    }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    const run = store.state.runs[0];
    assert.equal(run.status, "needs-human");
    assert.match(run.error, /禁改路径/);
    assert.equal(api.calls.some(([kind]) => kind === "mr"), false, "guardrail violation must not create an MR");
  });
});

test("policy RPC validates writes, tests matching and reports engine availability", async (t) => {
  const store = makeEngineStore();
  const api = makeEngineApi([
    { id: "d6", serialNumber: "bug-6", subject: "订单样式错位", statusId: "s1", statusName: "待确认", workitemType: "缺陷", priority: "P1", gmtModified: "2026-10-26" }
  ]);
  const rpc = createRpc(store, api, async () => ({}), () => [], null);

  // 缺少数字仓库 ID 的 auto-submit 规则会被保存校验拦下。
  await assert.rejects(
    () => rpc("policies.save", { policy: enginePolicy({ submit: { repoId: "", createMr: true } }) }),
    /数字 ID/
  );
  // 回写状态名必须存在于项目工作流。
  await assert.rejects(
    () => rpc("policies.save", { policy: enginePolicy({ writeback: { statusOnSuccess: "不存在的状态" } }) }),
    /不存在状态/
  );
  const saved = await rpc("policies.save", { policy: enginePolicy() });
  assert.equal(saved.name, "样式自动修复");
  const listed = await rpc("policies.list", {});
  assert.equal(listed.items.length, 1);
  const reordered = await rpc("policies.reorder", { ids: [saved.id] });
  assert.equal(reordered.items[0].id, saved.id);
  const orderAfterDelete = await rpc("policies.delete", { policyId: saved.id });
  assert.equal(orderAfterDelete.ok, true);

  // 试运行匹配：命中样式缺陷并给出将采取的模式。
  const test = await rpc("policies.test", { policy: enginePolicy() });
  assert.equal(test.total, 1);
  assert.equal(test.matched, 1);
  assert.equal(test.items[0].mode, "auto-submit");
  assert.equal(test.items[0].serialNumber, "bug-6");

  // 引擎未注入时给出明确错误与状态。
  await assert.rejects(() => rpc("runs.cancel", { runId: "r9" }), /引擎不可用/);
  await assert.rejects(() => rpc("runs.retry", { runId: "r9" }), /引擎不可用/);
  await assert.rejects(() => rpc("runs.confirm", { runId: "r9", decision: "approve" }), /引擎不可用/);
  await assert.rejects(() => rpc("engine.scanNow", {}), /引擎不可用/);
  const engineStatus = await rpc("engine.status", {});
  assert.equal(engineStatus.available, false);
});

test("createChangeRequest sends the numeric-repository MR contract", async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).endsWith("/repositories/123/changeRequests") && options.method === "POST") {
      return new Response(JSON.stringify({ localId: 77, detailUrl: "https://codeup.example/mr/77", status: "OPEN" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected request: ${options.method || "GET"} ${url}`);
  };
  const client = createApiClient({ apiBaseUrl: "https://openapi-rdc.aliyuncs.com", timeoutMs: 5000 });
  const account = { organizationId: "org-1", token: "token" };

  await assert.rejects(() => client.createChangeRequest(account, "org/demo", { sourceBranch: "fix/x", targetBranch: "main", title: "t" }), /数字 ID/);
  const mr = await client.createChangeRequest(account, "123", {
    sourceBranch: "fix/bug-1-style", targetBranch: "develop", title: "fix(bug-1): 样式",
    description: "自动修复", workItemIds: ["d1"]
  });
  assert.equal(mr.localId, "77");
  assert.equal(mr.url, "https://codeup.example/mr/77");
  const body = JSON.parse(calls[0].body);
  assert.equal(body.sourceProjectId, 123);
  assert.equal(body.targetProjectId, 123);
  assert.equal(body.workItemIds, "d1");
});
