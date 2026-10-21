// dsh-yunxiao — 无框架、无构建步骤的轻量 Web 工作台。
window.__ModuleLoader__.load({ id: "dsh-yunxiao", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
var ReactRuntime = null;
try { ReactRuntime = require("react"); } catch (error) {}

var STYLE_ID = "dsh-yunxiao-style";
var ROOT_ID = "dsh-yunxiao-root";
var PAGE_SIZE = 5;
// 概览页每个聚合卡最多展示的条数（方格网格两行左右），完整列表到对应页签查看。
var DASHBOARD_PREVIEW_LIMIT = 8;
var PANEL_WIDTH_STORAGE_KEY = "dsh-yunxiao:panel-width";
var FULL_MODE_STORAGE_KEY = "dsh-yunxiao:full-mode";
var DEFAULT_PANEL_WIDTH = 480;
var MIN_PANEL_WIDTH = 380;
var MAX_PANEL_WIDTH = 1080;
// 全页模式：内容区占满除聊天列以外的宽度；340px 为聊天区保留宽度。
var FULL_MODE_RESERVE = 16;
// 宿主左侧导航轨的实测宽度；widenWorkspaceFrame 打开面板时从宿主网格读取后更新。
var HOST_SIDEBAR_TRACK = 280;
var DEFAULT_NOTIFICATION_INTERVAL = 5;
var NOTIFICATION_MINUTE_MS = Math.max(100, Number(window.__DYX_NOTIFICATION_MINUTE_MS__) || 60 * 1000);
// 全页模式开关：默认全页铺满（覆盖中间聊天区）；手动切回侧栏后记住选择（存 "0"）。
var FULL_MODE_ACTIVE = true;

// —— 编排节点类型注册表（客户端画布与运行引擎共用） ————————————————
// act-agent / act-item / ntf-* 调用真实能力（DSH 会话、工作项更新、系统通知、评论）；
// act-pipe 调真实流水线运行；act-mr / act-scan / act-test / act-deploy 作为人工检查点
// （云效对应的写接口能力因组织而异，先以“等待人工确认”推进，避免误操作）。
var FLOW_NODE_TYPES = {
  "trg-item": { glyph: "⚡", color: "#a56207", group: "触发器", name: "工作项事件", checkpoint: false,
    fields: [{ k: "tp", l: "类型", o: ["缺陷", "需求", "任务"] }, { k: "ev", l: "事件", o: ["待确认 / 再次打开", "任意状态变更"] }],
    sub: function (n) { return (n.cfg.tp || "缺陷") + " · " + (n.cfg.ev || ""); } },
  "trg-pipe": { glyph: "⇄", color: "#a56207", group: "触发器", name: "流水线事件", checkpoint: false,
    fields: [{ k: "pipe", l: "流水线", o: [] }, { k: "ev", l: "事件", o: ["失败", "成功"] }],
    sub: function (n) { return (n.cfg.pipe || "") + " · " + (n.cfg.ev || ""); } },
  "trg-cron": { glyph: "⏱", color: "#a56207", group: "触发器", name: "定时触发", checkpoint: false,
    fields: [{ k: "d", l: "频率", o: ["每小时", "每天 02:00", "工作日 10:00"] }],
    sub: function (n) { return n.cfg.d || ""; } },
  "op-cond": { glyph: "⑂", color: "#68758c", group: "控制", name: "条件分支", checkpoint: false,
    fields: [{ k: "f", l: "条件字段", o: ["优先级", "根因定位"] }, { k: "op", l: "比较", o: ["≤", "="] }, { k: "v", l: "值", o: ["P1", "P2", "成功"] }],
    sub: function (n) { return (n.cfg.f || "") + " " + (n.cfg.op || "") + " " + (n.cfg.v || ""); } },
  "op-delay": { glyph: "⏳", color: "#68758c", group: "控制", name: "延时等待", checkpoint: false,
    fields: [{ k: "d", l: "时长", o: ["1 分钟", "5 分钟", "30 分钟"] }],
    sub: function (n) { return "等待 " + (n.cfg.d || ""); } },
  "act-agent": { glyph: "🤖", color: "#7048d8", group: "DSH 智能体", name: "DSH 智能处理", checkpoint: false,
    fields: [{ k: "task", l: "任务", o: ["缺陷修复", "日志诊断", "任务拆解"] }, { k: "mode", l: "方式", o: ["直接发送", "生成草稿"] }],
    sub: function (n) { return (n.cfg.task || "") + " · " + (n.cfg.mode || "直接发送"); } },
  "act-item": { glyph: "✔", color: "#3565e0", group: "云效动作", name: "更新工作项", checkpoint: false,
    fields: [{ k: "st", l: "目标状态名", o: [] }, { k: "cmt", l: "评论回写", o: ["开", "关"] }],
    sub: function (n) { return "状态 → " + (n.cfg.st || "") + (n.cfg.cmt === "开" ? " · 评论回写" : ""); } },
  "act-mr": { glyph: "⎇", color: "#3565e0", group: "云效动作", name: "创建合并请求", checkpoint: true,
    fields: [{ k: "note", l: "检查点说明", o: [] }],
    sub: function (n) { return n.cfg.note || "人工确认 MR 已创建"; } },
  "act-pipe": { glyph: "▶", color: "#3565e0", group: "云效动作", name: "运行流水线", checkpoint: false,
    fields: [{ k: "pipe", l: "流水线", o: [] }, { k: "br", l: "分支", o: ["自动", "develop", "master"] }],
    sub: function (n) { return (n.cfg.pipe || "默认流水线") + " · " + (n.cfg.br || "自动") + " 分支"; } },
  "act-scan": { glyph: "🛡", color: "#3565e0", group: "云效动作", name: "代码检测卡点", checkpoint: true,
    fields: [{ k: "gate", l: "卡点", o: ["0 个严重问题", "无阻塞"] }],
    sub: function (n) { return "卡点：" + (n.cfg.gate || "0 个严重问题"); } },
  "act-test": { glyph: "⚗", color: "#3565e0", group: "云效动作", name: "执行测试计划", checkpoint: true,
    fields: [{ k: "plan", l: "测试计划", o: [] }, { k: "gate", l: "通过率卡点", o: ["90%", "70%", "100%"] }],
    sub: function (n) { return (n.cfg.plan || "测试计划") + " · " + (n.cfg.gate || "90%"); } },
  "act-deploy": { glyph: "🚀", color: "#3565e0", group: "云效动作", name: "部署检查点", checkpoint: true,
    fields: [{ k: "env", l: "环境", o: ["日常", "预发", "生产"] }],
    sub: function (n) { return "环境：" + (n.cfg.env || "日常"); } },
  "ntf-msg": { glyph: "🔔", color: "#17754c", group: "通知", name: "系统通知", checkpoint: false,
    fields: [{ k: "tpl", l: "内容模板", o: ["验收提醒", "人工处理提醒", "任务提醒"] }],
    sub: function (n) { return n.cfg.tpl || "验收提醒"; } },
  "ntf-comment": { glyph: "💬", color: "#17754c", group: "通知", name: "评论回写", checkpoint: false,
    fields: [{ k: "tpl", l: "内容模板", o: ["处理摘要", "诊断结论"] }],
    sub: function (n) { return "回写：" + (n.cfg.tpl || "处理摘要"); } }
};
function flowNodeSub(node) {
  var type = FLOW_NODE_TYPES[node.tp];
  return type ? String(type.sub(node) || type.name) : "";
}

function clampFlowNode(value) {
  var source = value && typeof value === "object" ? value : {};
  var type = FLOW_NODE_TYPES[source.tp] ? source.tp : "";
  if (!type || !source.id) return null;
  var cfg = {};
  var rawCfg = source.cfg && typeof source.cfg === "object" && !Array.isArray(source.cfg) ? source.cfg : {};
  Object.keys(rawCfg).slice(0, 12).forEach(function (key) {
    if (key) cfg[String(key).slice(0, 60)] = String(rawCfg[key] === undefined || rawCfg[key] === null ? "" : rawCfg[key]).slice(0, 2000);
  });
  return {
    id: String(source.id).slice(0, 64),
    tp: type,
    name: String(source.name || FLOW_NODE_TYPES[type].name).slice(0, 200),
    x: Math.max(0, Math.min(20000, Math.round(Number(source.x) || 0))),
    y: Math.max(0, Math.min(20000, Math.round(Number(source.y) || 0))),
    cfg: cfg
  };
}

// 从服务端流程定义重建一份展示副本（含缺省字段），避免直接改到持久化对象。
function hydrateFlow(serverFlow) {
  var source = serverFlow && typeof serverFlow === "object" ? serverFlow : {};
  var nodes = (Array.isArray(source.nodes) ? source.nodes : []).map(clampFlowNode).filter(Boolean);
  var ids = new Set(nodes.map(function (node) { return node.id; }));
  var edges = (Array.isArray(source.edges) ? source.edges : [])
    .map(function (edge) {
      var value = edge && typeof edge === "object" ? edge : {};
      var from = String(value.f || "").slice(0, 64);
      var to = String(value.t || "").slice(0, 64);
      return from && to && from !== to && ids.has(from) && ids.has(to)
        ? { f: from, t: to, label: String(value.label || "").slice(0, 12) }
        : null;
    })
    .filter(Boolean);
  return {
    id: String(source.id || "").slice(0, 64),
    name: String(source.name || "未命名编排").slice(0, 200),
    on: Boolean(source.on),
    autoRun: Boolean(source.autoRun),
    trg: String(source.trg || "").slice(0, 200),
    nodes: nodes,
    edges: edges,
    runs: (Array.isArray(source.runs) ? source.runs : []).slice(0, 30)
  };
}

var CSS = [
  // 设计变量：浅色为默认，深色跟随系统。整体走“柔和分层”：不用硬描边，
  // 层级靠底色深浅与柔和投影表达；分隔仅保留极浅发丝线（表格、弹窗头尾）。
  ":root{color-scheme:light;--dyx-bg:#f2f4f8;--dyx-panel:#ffffff;--dyx-panel2:#f4f6f9;--dyx-field:#f2f4f8;--dyx-hover:#e9edf3;--dyx-tag:#eef1f6;--dyx-text:#202836;--dyx-muted:#68758c;--dyx-line:#edf0f5;--dyx-line-strong:#dde2ea;--dyx-brand:#3565e0;--dyx-brand-solid:#3565e0;--dyx-brand-weak:rgba(53,101,224,.1);--dyx-danger:#d6453f;--dyx-danger-weak:rgba(217,73,63,.09);--dyx-ok:#17754c;--dyx-ok-weak:rgba(46,166,109,.12);--dyx-warn:#a56207;--dyx-warn-weak:rgba(235,164,74,.16);--dyx-status-pending:#96660e;--dyx-status-pending-bg:rgba(236,164,60,.16);--dyx-status-pending-line:transparent;--dyx-status-processing:#3a67d6;--dyx-status-processing-bg:rgba(58,116,222,.09);--dyx-status-processing-line:transparent;--dyx-status-reopened:#a3567f;--dyx-status-reopened-bg:rgba(210,96,150,.11);--dyx-status-reopened-line:transparent;--dyx-shadow:0 24px 60px rgba(15,23,42,.16),0 4px 14px rgba(15,23,42,.06);--dyx-shadow-sm:0 1px 2px rgba(16,24,40,.04),0 6px 16px rgba(16,24,40,.05)}",
  "@media(prefers-color-scheme:dark){:root{color-scheme:dark;--dyx-bg:#12161d;--dyx-panel:#1a1f28;--dyx-panel2:#20262f;--dyx-field:#1d232c;--dyx-hover:#272e39;--dyx-tag:#242b35;--dyx-text:#e8ecf3;--dyx-muted:#8b98ad;--dyx-line:#262d37;--dyx-line-strong:#333c49;--dyx-brand:#8aabff;--dyx-brand-solid:#3b6ce0;--dyx-brand-weak:rgba(138,171,255,.14);--dyx-danger:#ef8377;--dyx-danger-weak:rgba(242,121,107,.11);--dyx-ok:#53c896;--dyx-ok-weak:rgba(83,200,150,.13);--dyx-warn:#e5ab52;--dyx-warn-weak:rgba(232,163,61,.14);--dyx-status-pending:#e3b968;--dyx-status-pending-bg:rgba(229,178,93,.12);--dyx-status-pending-line:transparent;--dyx-status-processing:#96b3f2;--dyx-status-processing-bg:rgba(143,181,255,.12);--dyx-status-processing-line:transparent;--dyx-status-reopened:#e89ec0;--dyx-status-reopened-bg:rgba(239,154,189,.12);--dyx-status-reopened-line:transparent;--dyx-shadow:0 24px 64px rgba(0,0,0,.5),0 4px 16px rgba(0,0,0,.3);--dyx-shadow-sm:0 1px 2px rgba(0,0,0,.2),0 6px 16px rgba(0,0,0,.2)}}",
  ".dyx-root,.dyx-root *{box-sizing:border-box}",
  ".dyx-slot-host{width:100%;height:100%;min-height:0}",
  ".dyx-right-panel{position:absolute;inset:0 0 0 auto;width:var(--dyx-workspace-width,480px);min-width:0;overflow:hidden;pointer-events:auto;background:var(--dyx-bg);box-shadow:-12px 0 32px rgba(15,23,42,.08)}",
  // 全页模式：面板改为 fixed 悬浮，从左侧导航轨右侧一直铺到窗口右缘——
  // 不依赖宿主网格是否可改写，聊天区被整面盖住。
  ".dyx-right-panel.dyx-panel-full{position:fixed!important;inset:0 0 0 var(--dyx-full-left,280px)!important;width:auto!important;box-shadow:none}",
  "[data-dyx-workspace-open='true']{grid-template-columns:var(--dyx-sidebar-track,280px) minmax(0,1fr) var(--dyx-workspace-width,480px)!important}[data-dyx-workspace-open='true'] [data-side='details']{left:calc(100% - var(--dyx-workspace-width,480px))!important}",
  ".dyx-resize-handle{position:absolute;z-index:50;inset:0 auto 0 0;width:8px;cursor:col-resize;touch-action:none;outline:0}.dyx-resize-handle::after{content:'';position:absolute;inset:0 auto 0 0;width:2px;background:transparent;transition:background .15s}.dyx-resize-handle:hover::after,.dyx-resize-handle:focus-visible::after,.dyx-resize-handle.active::after{background:var(--dyx-brand)}.dyx-resizing,.dyx-resizing *{cursor:col-resize!important;user-select:none!important}",
  ".dyx-preview-host{position:fixed;inset:12px 12px 12px auto;width:min(520px,calc(100vw - 24px));z-index:2147482500;overflow:hidden;border-radius:12px;box-shadow:var(--dyx-shadow)}",
  ".dyx-root{position:relative;width:100%;height:100%;min-height:0;container-type:inline-size;font:13.5px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:var(--dyx-text);pointer-events:auto}",
  ".dyx-root button:focus-visible,.dyx-root [tabindex]:focus-visible{outline:2px solid var(--dyx-brand);outline-offset:1px}",
  ".dyx-sidebar-trigger{position:relative;width:100%;min-height:34px;padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:8px;color:inherit;background:transparent;cursor:pointer;font:inherit;font-size:13px}.dyx-sidebar-trigger:hover{color:var(--dyx-brand);background:var(--dyx-brand-weak)}.dyx-sidebar-trigger[data-wide='true']{justify-content:flex-start}.dyx-sidebar-trigger-mark{width:20px;height:20px;flex:none;display:grid;place-items:center;border-radius:6px;color:#fff;background:linear-gradient(135deg,#4c8dff,#2f6bed);font-size:11px;font-weight:700}.dyx-sidebar-trigger-count{min-width:17px;height:17px;padding:0 5px;display:grid;place-items:center;border-radius:999px;color:#fff;background:#e5484d;font-size:10px;font-weight:700}.dyx-sidebar-trigger:not([data-wide='true']) .dyx-sidebar-trigger-count{position:absolute;right:2px;top:1px}",
  ".dyx-shell{position:absolute;inset:0;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;background:var(--dyx-bg)}",
  ".dyx-hidden{display:none!important}",
  ".dyx-head{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px 10px 18px;background:transparent}",
  ".dyx-logo{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:11px;color:#fff;background:linear-gradient(135deg,#5b8dff,#2f6bed);font-size:15px;font-weight:700;box-shadow:0 4px 12px rgba(47,107,237,.28)}",
  ".dyx-head-copy{min-width:0;flex:1}.dyx-head-copy strong{display:block;font-size:14.5px;font-weight:650;line-height:1.35}.dyx-head-copy span{display:block;color:var(--dyx-muted);font-size:12px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dyx-body{min-height:0;display:grid;grid-template-rows:minmax(0,1fr)}",
  // 页签：顶栏内的胶囊组，无外框；选中项为品牌色弱衬底胶囊。
  ".dyx-nav{display:flex;flex:none;gap:4px;padding:0;border:0;background:transparent}",
  ".dyx-nav button{min-height:32px;padding:6px 14px;display:flex;align-items:center;justify-content:center;border:0;border-radius:999px;color:var(--dyx-muted);background:transparent;cursor:pointer;text-align:center;font:inherit;font-size:13px;font-weight:500;transition:color .15s,background .15s}",
  ".dyx-nav button:hover{color:var(--dyx-text);background:var(--dyx-tag)}.dyx-nav button.active{color:var(--dyx-brand);background:var(--dyx-brand-weak);font-weight:600}",
  ".dyx-main{min-width:0;overflow:auto;padding:14px 18px 26px;scrollbar-width:thin;scrollbar-color:var(--dyx-line-strong) transparent}",
  ".dyx-section{max-width:100%;margin:0 auto}.dyx-title{margin:2px 0 14px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dyx-title h2{margin:0;font-size:16.5px;font-weight:650;letter-spacing:.2px}.dyx-title p{margin:4px 0 0;color:var(--dyx-muted);font-size:12px}",
  // 卡片：无描边，靠白底 + 双层柔影从背景上浮起。
  ".dyx-card{padding:16px 18px 18px;border:0;border-radius:16px;background:var(--dyx-panel);box-shadow:var(--dyx-shadow-sm)}.dyx-card+.dyx-card{margin-top:14px}",
  ".dyx-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.dyx-card-head h3{margin:0;font-size:14px;font-weight:600}.dyx-card-head small{color:var(--dyx-muted);font-size:12px}.dyx-card-title{display:flex;align-items:center;gap:7px;min-width:0}",
  ".dyx-account-top{display:flex;gap:10px;align-items:center;cursor:pointer}.dyx-avatar{width:36px;height:36px;display:grid;place-items:center;flex:none;border-radius:11px;color:#fff;background:linear-gradient(135deg,#5b8dff,#2f6bed);font-size:14px;font-weight:700;box-shadow:0 4px 10px rgba(47,107,237,.24)}.dyx-grow{min-width:0;flex:1}.dyx-grow strong,.dyx-grow small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dyx-grow strong{font-size:13.5px;font-weight:600}.dyx-grow small{color:var(--dyx-muted);font-size:12px}",
  ".dyx-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.dyx-account-top .dyx-actions{flex:none}",
  // 按钮：默认为浅底填充的无边框样式，主按钮为品牌实底。
  ".dyx-btn{min-height:31px;padding:5px 13px;border:0;border-radius:10px;color:var(--dyx-text);background:var(--dyx-tag);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap;transition:background .15s,color .15s}.dyx-btn:hover{background:var(--dyx-hover)}.dyx-btn.primary{color:#fff;background:var(--dyx-brand-solid);box-shadow:0 3px 10px color-mix(in srgb,var(--dyx-brand-solid) 30%,transparent)}.dyx-btn.primary:hover{background:color-mix(in srgb,var(--dyx-brand-solid) 88%,#000)}.dyx-btn.danger{color:var(--dyx-danger)}.dyx-btn.danger:hover{background:var(--dyx-danger-weak)}.dyx-btn:disabled{opacity:.5;cursor:not-allowed}",
  ".dyx-btn-sm{min-height:27px;padding:3px 10px;font-size:12px;border-radius:8px}",
  // 关闭按钮与 .dyx-btn 组合使用，必须排在其后才能覆盖背景与内边距。
  ".dyx-close{width:32px;height:32px;min-height:32px;padding:0;border:0;border-radius:10px;color:var(--dyx-muted);background:transparent;cursor:pointer;font-size:17px;line-height:1}.dyx-close:hover{color:var(--dyx-text);background:var(--dyx-hover)}",
  ".dyx-icon-btn{width:30px;min-height:30px;padding:0;border:0;border-radius:9px;color:var(--dyx-muted);background:transparent;cursor:pointer;font:inherit;font-size:14px;line-height:1}.dyx-icon-btn:hover{color:var(--dyx-brand);background:var(--dyx-brand-weak)}.dyx-icon-btn:disabled{opacity:.45;cursor:not-allowed}",
  ".dyx-field{display:grid;gap:5px}.dyx-field label{color:var(--dyx-muted);font-size:12px}.dyx-input,.dyx-select,.dyx-textarea{width:100%;min-height:34px;padding:6px 11px;border:1.5px solid transparent;border-radius:10px;color:var(--dyx-text);background:var(--dyx-field);outline:0;font:inherit;font-size:13px;transition:border-color .15s,background .15s,box-shadow .15s}.dyx-input:focus,.dyx-select:focus,.dyx-textarea:focus{border-color:color-mix(in srgb,var(--dyx-brand) 45%,transparent);background:var(--dyx-panel);box-shadow:0 0 0 3px var(--dyx-brand-weak)}.dyx-input::placeholder,.dyx-textarea::placeholder{color:color-mix(in srgb,var(--dyx-muted) 72%,transparent)}.dyx-textarea{min-height:84px;resize:vertical;line-height:1.6}.dyx-select[multiple]{min-height:112px;padding:5px}.dyx-select[multiple] option{padding:6px 8px;border-radius:6px}",
  ".dyx-project-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.dyx-current{margin-top:12px;padding:10px 13px;border-radius:11px;color:var(--dyx-muted);background:var(--dyx-panel2);font-size:12.5px}.dyx-current strong{color:var(--dyx-text);font-weight:600}",
  ".dyx-notify-stats{margin:-2px 0 12px;color:var(--dyx-muted);font-size:12px}.dyx-notify-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(128px,.62fr);gap:10px}.dyx-notify-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border:0;border-radius:12px;background:var(--dyx-panel2);cursor:pointer}.dyx-notify-toggle strong{font-size:13px;font-weight:600}.dyx-notify-toggle input{width:16px;height:16px;flex:none;margin:0;accent-color:var(--dyx-brand-solid);cursor:pointer}",
  ".dyx-list-toolbar{margin-bottom:12px;display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.dyx-list-toolbar>.dyx-page{margin-top:0}.dyx-defect-filters{display:flex;gap:8px;min-width:0}.dyx-defect-filters .dyx-field{width:164px}.dyx-pipeline-filters{display:flex;align-items:end;gap:8px;min-width:0}.dyx-pipeline-filters .dyx-field{width:190px}.dyx-filter-control{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:5px}.dyx-filter-clear{width:30px;min-height:32px;padding:0;border:0;border-radius:9px;color:var(--dyx-muted);background:transparent;cursor:pointer;font-family:inherit;font-size:16px;line-height:1}.dyx-filter-clear:hover{color:var(--dyx-danger);background:var(--dyx-danger-weak)}.dyx-filter-clear[hidden]{visibility:hidden;display:block}",
  // 表格：外框去掉，圆角裁切 + 行间发丝线；表头融入面板底色。
  ".dyx-table-wrap{overflow:auto;border:0;border-radius:14px;background:var(--dyx-panel);box-shadow:var(--dyx-shadow-sm);scrollbar-width:thin;scrollbar-color:var(--dyx-line-strong) transparent}.dyx-table{width:100%;border-collapse:collapse;min-width:720px}.dyx-table th,.dyx-table td{padding:10px 14px;border-bottom:1px solid var(--dyx-line);text-align:left;vertical-align:middle}.dyx-table th{position:sticky;top:0;z-index:1;color:var(--dyx-muted);background:var(--dyx-panel);font-size:12px;font-weight:600;white-space:nowrap}.dyx-table tr:last-child td{border-bottom:0}.dyx-table tbody tr:hover{background:var(--dyx-panel2)}",
  ".dyx-link{padding:0;border:0;color:var(--dyx-brand);background:transparent;cursor:pointer;font:inherit;text-align:left}.dyx-link:hover{text-decoration:underline;text-underline-offset:3px}.dyx-subject{max-width:480px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dyx-muted{color:var(--dyx-muted)}",
  ".dyx-badge{display:inline-flex;align-items:center;padding:2.5px 9px;border-radius:999px;color:var(--dyx-muted);background:var(--dyx-tag);font-size:12px;font-weight:500;line-height:1.6;white-space:nowrap}.dyx-badge.ok{color:var(--dyx-ok);background:var(--dyx-ok-weak)}.dyx-badge.run{color:var(--dyx-warn);background:var(--dyx-warn-weak)}.dyx-badge.fail{color:var(--dyx-danger);background:var(--dyx-danger-weak)}",
  ".dyx-page{margin-top:12px;display:flex;justify-content:flex-end;align-items:center;gap:8px;color:var(--dyx-muted);font-size:12px}.dyx-page span{white-space:nowrap}",
  ".dyx-empty{padding:40px 16px;text-align:center;color:var(--dyx-muted);font-size:13px}.dyx-empty strong{display:block;margin-bottom:4px;color:var(--dyx-text);font-size:14px;font-weight:600}",
  ".dyx-attachments{display:grid;gap:7px}.dyx-attachment{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;border:0;border-radius:11px;background:var(--dyx-panel2)}.dyx-attachment-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dyx-attachment-size{flex:none;color:var(--dyx-muted);font-size:12px}.dyx-attachment .dyx-btn{flex:none}",
  ".dyx-drawer{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.45);animation:dyx-fade-in .16s ease-out}@keyframes dyx-fade-in{from{opacity:0}to{opacity:1}}",
  ".dyx-modal{width:min(560px,100%);max-height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;border-radius:16px;background:var(--dyx-panel);box-shadow:var(--dyx-shadow);animation:dyx-pop-in .18s ease-out}.dyx-modal.wide{width:min(760px,100%)}@keyframes dyx-pop-in{from{transform:translateY(10px) scale(.98);opacity:.5}to{transform:none;opacity:1}}",
  ".dyx-modal-head,.dyx-modal-foot{padding:13px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}.dyx-modal-head{border-bottom:1px solid var(--dyx-line)}.dyx-modal-head h3{margin:0;font-size:15px;font-weight:650}.dyx-modal-foot{border-top:1px solid var(--dyx-line);justify-content:flex-end}.dyx-modal-body{padding:18px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--dyx-line-strong) transparent}.dyx-form{display:grid;gap:13px}.dyx-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
  ".dyx-detail-title{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}.dyx-detail-title h2{margin:0;font-size:16px;font-weight:650;line-height:1.45}.dyx-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px;margin:12px 0}.dyx-meta div{padding:9px 12px;border-radius:11px;background:var(--dyx-panel2);font-size:13px}.dyx-meta small{display:block;margin-bottom:1px;color:var(--dyx-muted);font-size:11.5px}",
  ".dyx-rich{line-height:1.75;overflow-wrap:anywhere;font-size:13.5px}.dyx-rich img{max-width:100%;height:auto;border-radius:10px}.dyx-rich pre,.dyx-log{overflow:auto;padding:13px;border:0;border-radius:12px;color:#c9d8f0;background:#0d1424;font:12px/1.65 Consolas,Menlo,Monaco,monospace;white-space:pre-wrap;scrollbar-width:thin;scrollbar-color:#3c4859 transparent}.dyx-rich table{border-collapse:collapse}.dyx-rich td,.dyx-rich th{border:1px solid var(--dyx-line-strong);padding:5px 8px}",
  ".dyx-comment-compose{margin-bottom:12px;padding:13px;border:0;border-radius:13px;background:var(--dyx-panel2)}.dyx-comment-compose .dyx-textarea{min-height:92px;background:var(--dyx-field)}.dyx-comment-compose-actions{margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px}.dyx-comment-compose-actions span{color:var(--dyx-muted);font-size:11.5px}.dyx-comments{display:grid;gap:9px}.dyx-comment{padding:11px 14px;border:0;border-radius:13px;background:var(--dyx-panel2)}.dyx-comment-head{display:flex;justify-content:space-between;margin-bottom:6px;color:var(--dyx-muted);font-size:12px}.dyx-comment-head strong{color:var(--dyx-text);font-weight:600}",
  ".dyx-status-row{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.dyx-status-row .dyx-field{width:150px;flex:none}.dyx-status-row .dyx-actions{flex:none}.dyx-note{padding:10px 13px;border-radius:11px;color:var(--dyx-warn);background:var(--dyx-warn-weak);font-size:12.5px}",
  ".dyx-stage{margin:6px 0;padding:9px 13px;display:grid;grid-template-columns:10px 1fr auto;align-items:center;gap:10px;border:0;border-radius:11px;background:var(--dyx-panel2)}.dyx-dot{width:8px;height:8px;border-radius:50%;background:#98a4b5}.dyx-dot.SUCCESS{background:#2eb17c}.dyx-dot.RUNNING{background:#eaa63f}.dyx-dot.FAIL,.dyx-dot.FAILED{background:#e05a52}",
  // 记录卡：彩色描边换成同色调弱衬底，状态用底色传达。
  ".dyx-record-list{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.dyx-record{padding:12px 15px;border:0;border-radius:13px;background:var(--dyx-panel2)}.dyx-record.dyx-record-status-pending{background:color-mix(in srgb,var(--dyx-status-pending) 8%,var(--dyx-panel2))}.dyx-record.dyx-record-status-processing{background:color-mix(in srgb,var(--dyx-status-processing) 8%,var(--dyx-panel2))}.dyx-record.dyx-record-status-reopened{background:color-mix(in srgb,var(--dyx-status-reopened) 8%,var(--dyx-panel2))}.dyx-record-clickable{cursor:pointer;transition:box-shadow .15s,transform .15s}.dyx-record-clickable:hover{box-shadow:var(--dyx-shadow-sm)}.dyx-record-clickable:active{transform:scale(.995)}.dyx-record-head,.dyx-record-foot{display:flex;align-items:center;justify-content:space-between;gap:9px}.dyx-record-title{margin:8px 0;color:var(--dyx-text);font-size:13.5px;font-weight:600;line-height:1.5}.dyx-record-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--dyx-muted);font-size:12px}.dyx-record-foot{margin-top:10px;padding-top:10px;border-top:1px solid var(--dyx-line)}",
  ".dyx-defect-row{display:flex;flex-direction:column;gap:6px}.dyx-defect-row-meta{display:flex;align-items:center;gap:8px;min-width:0}.dyx-defect-row-meta .dyx-actions{margin-left:auto;flex:none}.dyx-defect-row-title{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;color:var(--dyx-text);text-align:left}.dyx-defect-row-title:hover{text-decoration:none}.dyx-defect-row-title:hover .dyx-defect-row-subject{color:var(--dyx-brand)}.dyx-defect-row-serial{flex:none;color:var(--dyx-muted);font-size:12.5px;font-weight:600}.dyx-defect-row-subject{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dyx-defect-row-assignee{flex:0 1 auto;min-width:0;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dyx-muted);font-size:12px}.dyx-defect-row-time{flex:none;color:var(--dyx-muted);font-size:12px;white-space:nowrap}.dyx-defect-row .dyx-inline-status{width:96px;flex:none}",
  ".dyx-inline-status{width:150px;min-height:29px;padding:3px 26px 3px 10px;border:1.5px solid transparent;border-radius:9px;font-size:12px;transition:border-color .15s,background .15s}.dyx-inline-status:focus{border-color:color-mix(in srgb,var(--dyx-brand) 45%,transparent);box-shadow:0 0 0 3px var(--dyx-brand-weak)}.dyx-status-pending{color:var(--dyx-status-pending);background:var(--dyx-status-pending-bg)}.dyx-status-processing{color:var(--dyx-status-processing);background:var(--dyx-status-processing-bg)}.dyx-status-reopened{color:var(--dyx-status-reopened);background:var(--dyx-status-reopened-bg)}",
  // 提示条不拦截点击（pointer-events:none），并放在左下角，避免盖住弹窗右上角的 × 和底部“关闭”按钮。
  ".dyx-toast-wrap{position:absolute;z-index:60;left:14px;bottom:14px;display:grid;gap:8px;pointer-events:none}.dyx-toast{max-width:340px;padding:10px 14px;border:0;border-radius:12px;background:var(--dyx-panel);box-shadow:var(--dyx-shadow);font-size:13px}.dyx-toast.error{color:var(--dyx-danger)}",
  ".dyx-global-notice{position:fixed;z-index:2147483000;right:22px;top:22px;width:min(380px,calc(100vw - 44px));padding:14px 16px;border:0;border-radius:14px;color:var(--dyx-text);background:var(--dyx-panel);box-shadow:var(--dyx-shadow);font:13.5px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;animation:dyx-slide-in .18s ease-out}.dyx-global-notice strong{display:block;margin-bottom:2px;font-size:14px;font-weight:650}.dyx-global-notice span{display:block;color:var(--dyx-muted);font-size:12.5px}.dyx-global-notice-actions{margin-top:10px;display:flex;justify-content:flex-end;gap:8px}.dyx-global-notice-actions button{min-height:29px;padding:4px 12px;border:0;border-radius:9px;color:var(--dyx-text);background:var(--dyx-tag);cursor:pointer;font:inherit;font-size:12.5px}.dyx-global-notice-actions button:hover{background:var(--dyx-hover)}.dyx-global-notice-actions button.primary{color:#fff;background:var(--dyx-brand-solid)}",
  ".dyx-loading{opacity:.6;pointer-events:none}.dyx-stale{margin-bottom:10px;padding:9px 12px;border-radius:11px;color:var(--dyx-warn);background:var(--dyx-warn-weak);font-size:12.5px}",
  // 缺陷图片：点击全屏预览（暗色遮罩层），右键自定义菜单（预览/复制/下载）。
  ".dyx-rich img{cursor:zoom-in}",
  ".dyx-lightbox{position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;background:rgba(9,12,20,.88);animation:dyx-fade-in .16s ease-out}",
  ".dyx-lightbox-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;flex:none}",
  ".dyx-lightbox-bar strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#eef2f9;font-size:13px;font-weight:600}",
  ".dyx-lightbox-actions{display:flex;flex:none;gap:8px}",
  ".dyx-lightbox .dyx-btn{color:#fff;background:rgba(255,255,255,.14)}.dyx-lightbox .dyx-btn:hover{background:rgba(255,255,255,.24)}",
  ".dyx-lightbox-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto;padding:0 16px 16px}",
  ".dyx-lightbox-stage img{max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 10px 48px rgba(0,0,0,.5);cursor:zoom-out}",
  ".dyx-lightbox-stage.dyx-zoom img{max-width:none;max-height:none;cursor:zoom-in}",
  ".dyx-ctxmenu{position:fixed;z-index:2147483700;min-width:124px;padding:5px;border-radius:11px;background:var(--dyx-panel);box-shadow:var(--dyx-shadow)}",
  ".dyx-ctxmenu button{display:block;width:100%;min-height:29px;padding:5px 11px;border:0;border-radius:8px;background:transparent;color:var(--dyx-text);cursor:pointer;text-align:left;font:inherit;font-size:12.5px}",
  ".dyx-ctxmenu button:hover{background:var(--dyx-hover)}",
  "@keyframes dyx-fade-in{from{opacity:0}to{opacity:1}}",
  // —— v4：缺陷/流水线页增强（全页宽布局）———————————————————————————————
  // 统计卡条：方格小卡，固定宽度轨按容器自动换行，任何宽度下都不拉伸。
  ".dyx-statstrip{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,168px));gap:10px;margin-bottom:14px}",
  ".dyx-stat{position:relative;padding:11px 14px 12px;border:0;border-radius:14px;background:var(--dyx-panel);box-shadow:var(--dyx-shadow-sm);text-align:left;font:inherit;color:var(--dyx-text);overflow:hidden}",
  ".dyx-stat small{position:relative;display:flex;align-items:center;gap:6px;color:var(--dyx-muted);font-size:12px}",
  ".dyx-stat strong{position:relative;display:block;margin-top:4px;font-size:21px;font-weight:650;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".dyx-stat>span{position:relative;display:block;margin-top:2px;color:var(--dyx-muted);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".dyx-stat::after{content:'';position:absolute;right:-14px;top:-14px;width:52px;height:52px;border-radius:50%;background:var(--dyx-brand-weak);opacity:.6}",
  ".dyx-stat.tone-ok strong{color:var(--dyx-ok)}.dyx-stat.tone-ok::after{background:var(--dyx-ok-weak)}.dyx-dot.tone-ok{background:#2eb17c}",
  ".dyx-stat.tone-run strong{color:var(--dyx-warn)}.dyx-stat.tone-run::after{background:var(--dyx-warn-weak)}.dyx-dot.tone-run{background:#eaa63f}",
  ".dyx-stat.tone-fail strong{color:var(--dyx-danger)}.dyx-stat.tone-fail::after{background:var(--dyx-danger-weak)}.dyx-dot.tone-fail{background:#e05a52}",
  ".dyx-stat.tone-pending strong{color:var(--dyx-status-pending)}.dyx-stat.tone-pending::after{background:var(--dyx-status-pending-bg)}.dyx-dot.tone-pending{background:var(--dyx-status-pending)}",
  ".dyx-stat.tone-processing strong{color:var(--dyx-status-processing)}.dyx-stat.tone-processing::after{background:var(--dyx-status-processing-bg)}.dyx-dot.tone-processing{background:var(--dyx-status-processing)}",
  ".dyx-stat.tone-reopened strong{color:var(--dyx-status-reopened)}.dyx-stat.tone-reopened::after{background:var(--dyx-status-reopened-bg)}.dyx-dot.tone-reopened{background:var(--dyx-status-reopened)}",
  "button.dyx-stat{cursor:pointer;transition:box-shadow .15s,transform .15s}button.dyx-stat:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--dyx-brand) 26%,transparent)}button.dyx-stat:active{transform:scale(.98)}",
  "button.dyx-stat.active{box-shadow:0 0 0 2px color-mix(in srgb,var(--dyx-brand) 55%,transparent)}",
  // 负责人徽章与属性小标签（优先级/严重度/迭代）。
  ".dyx-person{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:170px;color:var(--dyx-muted);font-size:12px}",
  ".dyx-person-avatar{width:18px;height:18px;flex:none;display:grid;place-items:center;border-radius:50%;color:#fff;font-size:10px;font-weight:600;box-shadow:0 2px 5px rgba(15,23,42,.18)}",
  ".dyx-person-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dyx-chip{flex:none;display:inline-flex;align-items:center;padding:1.5px 8px;border-radius:999px;color:var(--dyx-muted);background:var(--dyx-tag);font-size:11.5px;font-weight:500;line-height:1.6;white-space:nowrap}",
  ".dyx-chip.hot{color:var(--dyx-danger);background:var(--dyx-danger-weak)}.dyx-chip.warm{color:var(--dyx-warn);background:var(--dyx-warn-weak)}",
  // 缺陷页双栏：宽容器时通知配置移到右侧栏，窄容器自动回落到列表下方。
  ".dyx-defects-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}",
  ".dyx-defects-side{min-width:0}",
  "@container(min-width:920px){.dyx-defects-layout{grid-template-columns:minmax(0,1fr) 300px}}",
  // 流水线卡片：自适应多列网格 + 最近一次运行状态的同色左轨。
  ".dyx-pipeline-grid{grid-template-columns:repeat(auto-fill,minmax(288px,1fr));gap:11px}",
  ".dyx-pipeline-card{position:relative;overflow:hidden;padding-left:18px}",
  ".dyx-pipeline-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--dyx-line-strong)}",
  ".dyx-pipeline-card.tone-ok::before{background:#2eb17c}.dyx-pipeline-card.tone-run::before{background:#eaa63f}.dyx-pipeline-card.tone-fail::before{background:#e05a52}",
  // 代码/测试/制品共用方格卡片：与流水线网格同规格，左轨按各自状态着色（无状态时保持默认轨）。
  ".dyx-tile-grid{grid-template-columns:repeat(auto-fill,minmax(288px,1fr));gap:11px}",
  ".dyx-tile-card{position:relative;overflow:hidden;padding-left:18px}",
  ".dyx-tile-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--dyx-line-strong)}",
  ".dyx-tile-card.tone-ok::before{background:#2eb17c}.dyx-tile-card.tone-run::before{background:#eaa63f}.dyx-tile-card.tone-fail::before{background:#e05a52}",
  // 设置页账号卡片：当前账号带品牌色描边（放在 record-clickable 之后，悬停时描边不被覆盖）。
  ".dyx-account{transition:box-shadow .15s,background .15s}.dyx-account .dyx-account-top{margin:10px 0 2px;cursor:inherit}",
  ".dyx-account.active,.dyx-account.active:hover{background:color-mix(in srgb,var(--dyx-brand) 7%,var(--dyx-panel2));box-shadow:0 0 0 2px color-mix(in srgb,var(--dyx-brand) 32%,transparent)}",
  // 设置页“当前项目 / DSH 工作区绑定”双栏：宽容器左右并排，窄容器回落为上下排列。
  ".dyx-settings-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start;margin-top:14px}.dyx-settings-layout>.dyx-card{margin-top:0}",
  "@container(min-width:920px){.dyx-settings-layout{grid-template-columns:repeat(2,minmax(0,1fr))}}",
  // 缺陷行：标签可能较多，允许换行；序号用等宽字体强化“编号”感。
  ".dyx-defect-row-meta{flex-wrap:wrap}",
  ".dyx-defect-row-serial{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.2px}",
  // 缺陷列表方格卡片：宽容器多列，窄容器自然单列；标题最多两行。
  ".dyx-defect-grid{grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:11px}",
  ".dyx-defect-card .dyx-defect-row-subject{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.45}",
  // 详情页图片：描述/评论中的图片与图片附件统一为小缩略图，横向并排、过多自动换行。
  ".dyx-imgstrip{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}",
  ".dyx-imgstrip img{flex:none;width:132px;height:92px;object-fit:cover;border-radius:10px;background:var(--dyx-panel2);cursor:zoom-in}",
  ".dyx-attachment-strip{display:flex;flex-wrap:wrap;gap:10px}",
  ".dyx-attachment-thumb{display:flex;flex-direction:column;gap:4px;width:132px;min-width:0}",
  ".dyx-attachment-thumb img{width:132px;height:92px;object-fit:cover;border-radius:10px;background:var(--dyx-panel2);cursor:zoom-in}",
  ".dyx-attachment-thumb-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dyx-muted);font-size:11.5px}",
  "@container(max-width:640px){.dyx-head{flex-wrap:wrap;gap:8px;padding:8px 10px 8px 14px}.dyx-head-copy{flex:1 1 auto}.dyx-nav{order:3;width:100%}.dyx-nav button{flex:1 1 auto;min-height:30px;padding:5px 9px;font-size:12px}}",
  "@container(max-width:430px){.dyx-main{padding:12px 14px 20px}.dyx-drawer{padding:12px}.dyx-notify-grid,.dyx-project-row{grid-template-columns:1fr}.dyx-defect-filters .dyx-field{width:140px}.dyx-pipeline-filters .dyx-field{width:150px}.dyx-defect-row .dyx-inline-status{width:88px}.dyx-defect-row-assignee{max-width:96px}.dyx-title{display:block}.dyx-title>.dyx-btn,.dyx-title>.dyx-actions{margin-top:8px}.dyx-modal-body{padding:12px}.dyx-status-row{align-items:stretch;flex-direction:column}.dyx-status-row .dyx-field{min-width:0;width:auto}}",
  "@media(max-width:760px){.dyx-preview-host{inset:0;width:100%;border-radius:0}}",
  // —— v3：多页工作台 / 全页模式 / 编排画布 ——————————————————————————————
  ".dyx-nav{flex:0 1 auto;min-width:0;flex-wrap:wrap}",
  ".dyx-expand{width:30px;min-height:30px;padding:0;border:0;border-radius:9px;color:var(--dyx-muted);background:transparent;cursor:pointer;font:inherit;font-size:14px;line-height:1}.dyx-expand:hover{color:var(--dyx-brand);background:var(--dyx-brand-weak)}",
  // 全页模式：面板宽度由 applyPanelWidth 动态计算（100vw - 聊天保留宽），禁用拖拽手柄。
  ".dyx-root[data-full='true'] .dyx-resize-handle{display:none}",
  // 编排画布：旧画布只读展示（节点面板已随客户端执行引擎移除）。
  ".dyx-flow-shell{border-radius:16px;background:var(--dyx-panel);box-shadow:var(--dyx-shadow-sm);overflow:hidden}",
  ".dyx-flow-readonly-note{margin:0;padding:10px 14px;border-bottom:1px solid var(--dyx-line);border-radius:0}",
  // 编排子页签（规则 / 运行记录 / 待确认 / 旧版画布），复用导航按钮的观感但更轻量。
  ".dyx-flow-subtabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.dyx-flow-subtabs button{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 14px;border:0;border-radius:999px;background:var(--dyx-tag);cursor:pointer;font:inherit;font-size:12.5px;color:var(--dyx-muted)}.dyx-flow-subtabs button:hover{background:var(--dyx-hover)}.dyx-flow-subtabs button.active{background:var(--dyx-brand-weak);color:var(--dyx-brand);font-weight:600}",
  // 规则编辑抽屉：fieldset 分组（触发 / 匹配 / 处理方式 / 提交与回写）。
  ".dyx-policy-form{display:flex;flex-direction:column;gap:14px}",
  ".dyx-policy-group{margin:0;padding:12px 14px 14px;border:1px solid var(--dyx-line);border-radius:14px;background:var(--dyx-panel2)}",
  ".dyx-policy-group legend{padding:0 6px;color:var(--dyx-muted);font-size:11.5px;font-weight:600}",
  ".dyx-policy-group .dyx-field{margin-top:10px}.dyx-policy-group .dyx-notify-toggle{margin-right:10px}",
  ".dyx-flow-glyph{width:24px;height:24px;flex:none;display:grid;place-items:center;border-radius:8px;color:#fff;font-size:13px}",
  ".dyx-flow-canvas{position:relative;height:640px;overflow:auto;background:radial-gradient(circle,var(--dyx-line) 1px,transparent 1px);background-size:18px 18px;scrollbar-width:thin;touch-action:none}",
  ".dyx-flow-stage{position:relative;min-width:640px;min-height:600px;height:100%}",
  ".dyx-flow-edges{position:absolute;inset:0;pointer-events:none}.dyx-flow-edges path{fill:none;stroke:var(--dyx-muted);stroke-width:1.6}.dyx-flow-edges path.danger{stroke:var(--dyx-danger)}.dyx-flow-edges path.ok{stroke:var(--dyx-ok)}",
  ".dyx-flow-edges .dyx-flow-elabel{font-size:10px;fill:var(--dyx-muted)}",
  ".dyx-flow-node{position:absolute;display:flex;align-items:center;gap:8px;width:172px;min-height:50px;padding:8px 10px;border-radius:12px;background:var(--dyx-panel);box-shadow:0 2px 8px rgba(15,23,42,.08);cursor:grab;user-select:none;touch-action:none;border:1.5px solid transparent}.dyx-flow-node:hover{box-shadow:var(--dyx-shadow-sm)}.dyx-flow-node.selected{border-color:var(--dyx-brand)}",
  ".dyx-flow-node.run{border-color:var(--dyx-warn);box-shadow:0 0 0 3px var(--dyx-warn-weak)}.dyx-flow-node.ok{border-color:var(--dyx-ok)}.dyx-flow-node.fail{border-color:var(--dyx-danger);box-shadow:0 0 0 3px var(--dyx-danger-weak)}.dyx-flow-node.wait{border-color:var(--dyx-brand)}.dyx-flow-node.skip{opacity:.5}",
  ".dyx-flow-node-glyph{width:26px;height:26px;flex:none;display:grid;place-items:center;border-radius:9px;color:#fff;font-size:13px}",
  ".dyx-flow-node-text{min-width:0;flex:1}.dyx-flow-node-text b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.dyx-flow-node-text span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dyx-muted);font-size:10.5px;margin-top:2px}",
  ".dyx-flow-node-state{position:absolute;top:-8px;right:-8px;min-width:18px;height:18px;display:none;place-items:center;padding:0 4px;border-radius:999px;color:#fff;background:var(--dyx-muted);font-size:10px;font-weight:700}.dyx-flow-node.run .dyx-flow-node-state{display:grid;background:var(--dyx-warn)}.dyx-flow-node.ok .dyx-flow-node-state{display:grid;background:var(--dyx-ok)}.dyx-flow-node.fail .dyx-flow-node-state{display:grid;background:var(--dyx-danger)}.dyx-flow-node.skip .dyx-flow-node-state{display:grid}.dyx-flow-node.wait .dyx-flow-node-state{display:grid;background:var(--dyx-brand)}",
  ".dyx-flow-port{position:absolute;top:calc(50% - 7px);width:14px;height:14px;padding:0;border:2px solid var(--dyx-muted);border-radius:50%;background:var(--dyx-panel);cursor:crosshair}.dyx-flow-port:hover{border-color:var(--dyx-brand)}.dyx-flow-port[data-side='out']{right:-8px}.dyx-flow-port[data-side='in']{left:-8px}",
  ".dyx-flow-node-actions{position:absolute;left:0;right:0;bottom:-15px;display:flex;justify-content:center;gap:6px}",
  ".dyx-flow-node-actions .dyx-btn{min-height:20px;padding:1px 9px;font-size:11px;border-radius:999px;box-shadow:var(--dyx-shadow-sm)}",
  ".dyx-flow-note{padding:9px 12px;border-radius:11px;color:var(--dyx-muted);background:var(--dyx-panel2);font-size:12px}",
  ".dyx-flow-checks{display:flex;gap:6px;flex-wrap:wrap}",
  ".dyx-full-note{margin:0 0 10px}"
].join("");

function node(tag, className, text) {
  var element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function button(text, className, handler) {
  var value = node("button", "dyx-btn" + (className ? " " + className : ""), text);
  value.type = "button";
  if (handler) value.addEventListener("click", handler);
  return value;
}

function field(label, control) {
  var wrap = node("div", "dyx-field");
  wrap.append(node("label", "", label), control);
  return wrap;
}

function input(type, placeholder, value) {
  var element = node(type === "textarea" ? "textarea" : "input", type === "textarea" ? "dyx-textarea" : "dyx-input");
  if (type !== "textarea") element.type = type || "text";
  if (placeholder) element.placeholder = placeholder;
  if (value !== undefined && value !== null) element.value = value;
  return element;
}

function setBusy(element, busy) {
  if (!element) return;
  element.classList.toggle("dyx-loading", Boolean(busy));
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") return "-";
  var date = typeof value === "number" || /^\d{13}$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function shortDateTime(value) {
  if (value === null || value === undefined || value === "") return "-";
  var date = typeof value === "number" || /^\d{13}$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  var pad = function (part) { return (part < 10 ? "0" : "") + part; };
  return pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function dateValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  var date = typeof value === "number" || /^\d{13}$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

// 状态归类：统计条、记录底色与内联状态下拉共用同一套口径。
function defectStatusKind(statusName) {
  var normalized = String(statusName || "").trim();
  if (["待确认", "未确认"].indexOf(normalized) >= 0) return "pending";
  if (normalized === "处理中") return "processing";
  if (["再次打开", "重新打开", "REOPEN", "REOPENED"].indexOf(normalized.toUpperCase()) >= 0) return "reopened";
  return "";
}

function applyDefectStatusTone(select, statusName) {
  select.classList.remove("dyx-status-pending", "dyx-status-processing", "dyx-status-reopened");
  var kind = defectStatusKind(statusName);
  if (kind) select.classList.add("dyx-status-" + kind);
}

function applyDefectRecordTone(card, statusName) {
  card.classList.remove("dyx-record-status-pending", "dyx-record-status-processing", "dyx-record-status-reopened");
  var kind = defectStatusKind(statusName);
  if (kind) card.classList.add("dyx-record-status-" + kind);
}

// 仅“待确认”“再次打开”（含同义命名）的缺陷提供“草稿/处理”两个直达按钮。
function defectHandleAllowed(statusName) {
  var normalized = String(statusName || "").trim();
  if (["待确认", "未确认"].indexOf(normalized) >= 0) return true;
  return ["再次打开", "重新打开", "REOPEN", "REOPENED"].indexOf(normalized.toUpperCase()) >= 0;
}

function selectedOptionText(select) {
  var option = select.options && select.options[select.selectedIndex];
  return option ? option.textContent : "";
}

function readPanelWidth() {
  try {
    var value = Number(window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_PANEL_WIDTH;
  } catch (error) {
    return DEFAULT_PANEL_WIDTH;
  }
}

function savePanelWidth(value) {
  try { window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(Math.round(value))); } catch (error) {}
}

function clampPanelWidth(value) {
  var viewport = document.documentElement.clientWidth || window.innerWidth || 1440;
  // 全页模式：吃满除宿主左侧导航轨以外的整页宽度（覆盖中间聊天区），忽略常规上限与拖拽持久化。
  if (FULL_MODE_ACTIVE) return Math.max(720, viewport - HOST_SIDEBAR_TRACK - FULL_MODE_RESERVE);
  var responsiveMax = Math.max(MIN_PANEL_WIDTH, viewport - 640);
  return Math.round(Math.min(MAX_PANEL_WIDTH, responsiveMax, Math.max(MIN_PANEL_WIDTH, Number(value) || DEFAULT_PANEL_WIDTH)));
}

// 多个插件的工作台面板都注入 shell.overlay，可同时打开并叠放；
// 激活时从共用自增序号取下一个 z-index，让后激活（或再次点击）的面板
// 盖到先激活的面板上面。只提升 overlay 之内的元素，避免影响宿主其他层级。
var WORKSPACE_PANEL_Z_KEY = "__dshWorkspacePanelZ";
function raiseWorkspacePanel(panel) {
  if (!panel) return;
  var next = Number(window[WORKSPACE_PANEL_Z_KEY] || 10) + 1;
  window[WORKSPACE_PANEL_Z_KEY] = next;
  var overlay = document.querySelector("[data-shell-overlay]");
  if (!overlay) { panel.style.zIndex = String(next); return; }
  var cursor = panel;
  while (cursor && cursor !== overlay) {
    cursor.style.zIndex = String(next);
    cursor = cursor.parentElement;
  }
}

function statusClass(status) {
  var normalized = String(status || "").toUpperCase();
  if (["SUCCESS", "DONE", "FINISHED", "已完成"].indexOf(normalized) >= 0) return "ok";
  if (["RUNNING", "QUEUED", "WAITING", "处理中"].indexOf(normalized) >= 0) return "run";
  if (["FAIL", "FAILED", "ERROR", "CANCELLED"].indexOf(normalized) >= 0) return "fail";
  return "";
}

// 统计卡：小标题 + 大数字 + 弱色角标圆；带 onClick 时渲染为按钮并作为筛选入口。
function statTile(options) {
  options = options || {};
  var tile = node(options.onClick ? "button" : "div", "dyx-stat" + (options.tone ? " tone-" + options.tone : ""));
  if (options.onClick) {
    tile.type = "button";
    tile.addEventListener("click", options.onClick);
    if (options.active) tile.classList.add("active");
  }
  var head = node("small");
  if (options.tone) head.append(node("span", "dyx-dot tone-" + options.tone));
  head.append(node("span", "", options.label || ""));
  tile.append(head, node("strong", "", String(options.value === undefined || options.value === null ? 0 : options.value)), node("span", "", options.hint || ""));
  return tile;
}

// 属性小标签：优先级/严重度按档位给出热/暖色调。
function defectChip(text, tone) {
  return node("span", "dyx-chip" + (tone ? " " + tone : ""), text);
}

function defectChipTone(value) {
  var normalized = String(value || "").trim().toUpperCase();
  if (["P0", "P1", "最高", "严重", "BLOCKER", "CRITICAL", "MAJOR"].indexOf(normalized) >= 0) return "hot";
  if (["P2", "中", "一般", "NORMAL", "MINOR"].indexOf(normalized) >= 0) return "warm";
  return "";
}

// 负责人徽章：按姓名哈希取色，同一个人在各处颜色一致；未分配显示灰色占位。
function personBadge(name) {
  var wrap = node("span", "dyx-person");
  var text = String(name || "").trim();
  var avatar = node("span", "dyx-person-avatar", text ? text.slice(0, 1) : "无");
  if (text) {
    var hue = 0;
    for (var index = 0; index < text.length; index++) hue = (hue * 31 + text.charCodeAt(index)) % 360;
    avatar.style.background = "hsl(" + hue + " 52% 50%)";
  } else {
    avatar.style.background = "#98a4b5";
  }
  wrap.append(avatar, node("span", "dyx-person-name", text || "未分配"));
  wrap.title = "负责人 " + (text || "未分配");
  return wrap;
}

function rpc(method, args) {
  return fetch("/api/d-yunxiao/rpc", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
    body: JSON.stringify({ method: method, args: args || {} })
  }).then(function (response) {
    return response.text().then(function (text) {
      var payload = {};
      try { payload = JSON.parse(text); } catch (error) {}
      if (!response.ok || !payload.ok) throw new Error(payload.message || ("请求失败（HTTP " + response.status + "）"));
      return payload.data;
    });
  });
}

function defaultDefectNotification() {
  return { enabled: false, assignedToId: "", assignedToName: "", intervalMinutes: DEFAULT_NOTIFICATION_INTERVAL };
}

function createDefectNotifier(options) {
  options = options || {};
  var timer = null;
  var disposed = false;
  var polling = null;
  var assigneeLoading = null;
  var seenByScope = new Map();
  var listeners = new Set();
  var snapshot = {
    accountId: "",
    projectId: "",
    projectName: "",
    settings: defaultDefectNotification(),
    assignees: [],
    unreadCount: 0,
    lastCheckedAt: "",
    lastError: "",
    lastResultCount: 0,
    lastAddedCount: 0,
    lastQueryCount: 0,
    lastSystemStatus: "尚未触发",
    lastAddedItems: []
  };

  function copySnapshot() {
    return Object.assign({}, snapshot, {
      settings: Object.assign({}, snapshot.settings),
      assignees: snapshot.assignees.slice(),
      lastAddedItems: snapshot.lastAddedItems.slice()
    });
  }

  function emit() {
    var value = copySnapshot();
    listeners.forEach(function (listener) { listener(value); });
  }

  function mergeAssignees(items) {
    var values = new Map(snapshot.assignees.map(function (item) { return [item.id, item]; }));
    (items || []).forEach(function (item) { if (item && item.id && item.name) values.set(item.id, item); });
    snapshot.assignees = Array.from(values.values()).sort(function (left, right) { return left.name.localeCompare(right.name, "zh-CN"); });
  }

  function applyServerState(server) {
    var account = (server.accounts || []).find(function (item) { return item.id === server.selectedAccountId; }) || null;
    var project = account && account.selectedProject || null;
    snapshot.accountId = account && account.id || "";
    snapshot.projectId = project && project.id || "";
    snapshot.projectName = project && project.name || "";
    snapshot.settings = Object.assign(defaultDefectNotification(), account && account.defectNotification || {});
    snapshot.settings.intervalMinutes = Math.min(1440, Math.max(1, Number(snapshot.settings.intervalMinutes) || DEFAULT_NOTIFICATION_INTERVAL));
    if (!snapshot.settings.enabled && snapshot.accountId && snapshot.projectId) {
      seenByScope.delete([snapshot.accountId, snapshot.projectId, snapshot.settings.assignedToId || "*"].join(":"));
    }
    if (snapshot.settings.assignedToId && snapshot.settings.assignedToName) {
      mergeAssignees([{ id: snapshot.settings.assignedToId, name: snapshot.settings.assignedToName }]);
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (disposed || !snapshot.settings.enabled || !snapshot.accountId || !snapshot.projectId) return;
    timer = setTimeout(runPoll, snapshot.settings.intervalMinutes * NOTIFICATION_MINUTE_MS);
  }

  function showWebNotification(count, items, notificationTag) {
    if (!("Notification" in window)) return "Web 通知不支持";
    if (window.Notification.permission !== "granted") return "Web 通知未授权";
    try {
      var notification = new window.Notification("云效缺陷提醒", {
        body: "新增 " + count + " 个缺陷需修复",
        tag: notificationTag || "dsh-yunxiao-defects-" + snapshot.accountId + "-" + snapshot.projectId + "-" + Date.now(),
        renotify: true,
        requireInteraction: true
      });
      notification.onclick = function () {
        try { window.focus(); } catch (error) {}
        if (typeof options.onOpen === "function") options.onOpen(items || []);
        notification.close();
      };
      return window.__dsh_native_notification_bridge__
        ? "已提交到 Harness；是否显示横幅由系统设置决定"
        : "已提交给 Web 通知";
    } catch (error) {
      return "Web 通知调用失败";
    }
  }

  function showSystemNotification(count, items) {
    snapshot.lastSystemStatus = "正在提交";
    emit();
    var tag = "dyx-defect-" + Date.now();
    if (window.__dsh_native_notification_bridge__) {
      // 桌面端只提交一条原生通知；再发 Web Notification 会让系统多弹一条重复横幅
      return rpc("system.notification.show", {
        title: "云效缺陷提醒",
        body: "新增 " + count + " 个缺陷需修复",
        tag: tag
      }).then(function (result) {
        snapshot.lastSystemStatus = result && result.accepted
          ? "Harness 桌面提醒已提交"
          : "Harness 桌面提醒不可用";
      }).catch(function (error) {
        snapshot.lastSystemStatus = "Harness 桌面提醒失败（" + (error instanceof Error ? error.message : String(error)) + "）";
      }).then(function () {
        emit();
        return copySnapshot();
      });
    }
    return rpc("system.notification.show", {
      title: "云效缺陷提醒",
      body: "新增 " + count + " 个缺陷需修复",
      tag: tag
    }).then(function (result) {
      snapshot.lastSystemStatus = result && result.accepted
        ? "已提交给系统原生通知"
        : showWebNotification(count, items);
    }).catch(function (error) {
      var fallback = showWebNotification(count, items);
      snapshot.lastSystemStatus = "原生通知失败；" + fallback + "（" + (error instanceof Error ? error.message : String(error)) + "）";
    }).then(function () {
      emit();
      return copySnapshot();
    });
  }

  function clearInAppNotification() {
    var existing = document.querySelector(".dyx-global-notice");
    if (existing) existing.remove();
  }

  function showInAppNotification(count, items) {
    clearInAppNotification();
    var notice = node("div", "dyx-global-notice");
    notice.setAttribute("role", "alert");
    notice.append(
      node("strong", "", "新增 " + count + " 个缺陷需修复"),
      node("span", "", "状态为待确认或再次打开，请及时处理。")
    );
    var actions = node("div", "dyx-global-notice-actions");
    var close = node("button", "", "关闭");
    close.type = "button";
    close.addEventListener("click", clearInAppNotification);
    actions.append(close);
    var view = node("button", "primary", "查看缺陷");
    view.type = "button";
    view.addEventListener("click", function () {
      clearInAppNotification();
      if (typeof options.onOpen === "function") options.onOpen(items || []);
    });
    actions.append(view);
    notice.append(actions);
    document.body.append(notice);
  }

  function runPoll() {
    if (disposed) return Promise.resolve(copySnapshot());
    if (polling) return polling;
    polling = rpc("state.get").then(function (server) {
      applyServerState(server);
      if (!snapshot.settings.enabled || !snapshot.accountId || !snapshot.projectId) return null;
      var scope = [snapshot.accountId, snapshot.projectId, snapshot.settings.assignedToId || "*"].join(":");
      return rpc("defect.notification.scan", {
        accountId: snapshot.accountId,
        projectId: snapshot.projectId,
        assignedToId: snapshot.settings.assignedToId || ""
      }).then(function (result) {
        mergeAssignees(result.assignees || []);
        var ids = (result.ids || []).filter(Boolean);
        var seen = seenByScope.get(scope);
        snapshot.lastResultCount = ids.length;
        snapshot.lastQueryCount = Number(result.queryCount || 0);
        snapshot.lastAddedCount = 0;
        if (!seen) {
          seen = new Set(ids);
          seenByScope.set(scope, seen);
        } else {
          var addedIds = ids.filter(function (id) { return !seen.has(id); });
          seenByScope.set(scope, new Set(ids));
          var addedSet = new Set(addedIds);
          var addedItems = (result.items || []).filter(function (item) { return item && addedSet.has(item.id); });
          snapshot.lastAddedItems = addedItems.slice(0, 5);
          if (addedItems.length) {
            snapshot.lastAddedCount = addedItems.length;
            snapshot.unreadCount += addedItems.length;
            showInAppNotification(addedItems.length, addedItems);
            showSystemNotification(addedItems.length, addedItems);
          }
        }
        snapshot.lastCheckedAt = result.checkedAt || new Date().toISOString();
        snapshot.lastError = "";
      });
    }).catch(function (error) {
      snapshot.lastError = error instanceof Error ? error.message : String(error);
    }).then(function () {
      emit();
      return copySnapshot();
    }).finally(function () {
      polling = null;
      schedule();
    });
    return polling;
  }

  function refresh() {
    if (timer) clearTimeout(timer);
    timer = null;
    return runPoll();
  }

  function loadAssignees() {
    if (assigneeLoading) return assigneeLoading;
    var prepare = snapshot.accountId && snapshot.projectId
      ? Promise.resolve()
      : rpc("state.get").then(applyServerState);
    assigneeLoading = prepare.then(function () {
      if (!snapshot.accountId || !snapshot.projectId) return [];
      return rpc("defect.notification.assignees", {
        accountId: snapshot.accountId,
        projectId: snapshot.projectId
      });
    }).then(function (items) {
      mergeAssignees(items || []);
      emit();
      return copySnapshot();
    }).catch(function (error) {
      snapshot.lastError = error instanceof Error ? error.message : String(error);
      emit();
      return copySnapshot();
    }).finally(function () { assigneeLoading = null; });
    return assigneeLoading;
  }

  function markRead() {
    if (!snapshot.unreadCount) return;
    snapshot.unreadCount = 0;
    clearInAppNotification();
    emit();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }

  function dispose() {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    listeners.clear();
  }

  return {
    start: refresh,
    refresh: refresh,
    loadAssignees: loadAssignees,
    markRead: markRead,
    subscribe: subscribe,
    snapshot: copySnapshot,
    dispose: dispose
  };
}

function toast(message, error) {
  var workspaceRoot = document.getElementById(ROOT_ID);
  var wrap = workspaceRoot && workspaceRoot.querySelector(".dyx-toast-wrap");
  if (!wrap) {
    wrap = node("div", "dyx-toast-wrap");
    (workspaceRoot || document.body).append(wrap);
  }
  var item = node("div", "dyx-toast" + (error ? " error" : ""), message);
  wrap.append(item);
  setTimeout(function () { item.remove(); if (!wrap.childNodes.length) wrap.remove(); }, error ? 5000 : 2600);
}

function empty(title, detail) {
  var wrap = node("div", "dyx-empty");
  wrap.append(node("strong", "", title), node("div", "", detail || ""));
  return wrap;
}

function modal(title, wide) {
  var workspaceRoot = document.getElementById(ROOT_ID);
  if (!workspaceRoot) throw new Error("云效工作台尚未挂载");
  var drawer = node("div", "dyx-drawer");
  var box = node("div", "dyx-modal" + (wide ? " wide" : ""));
  var head = node("div", "dyx-modal-head");
  var body = node("div", "dyx-modal-body");
  var foot = node("div", "dyx-modal-foot");
  var closed = false;
  function closeDrawer() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    drawer.remove();
  }
  function onKeyDown(event) { if (event.key === "Escape") closeDrawer(); }
  drawer.addEventListener("mousedown", function (event) { if (event.target === drawer) closeDrawer(); });
  var close = button("×", "dyx-close", closeDrawer);
  close.setAttribute("aria-label", "关闭" + title);
  head.append(node("h3", "", title), close);
  box.append(head, body, foot);
  drawer.append(box);
  workspaceRoot.append(drawer);
  document.addEventListener("keydown", onKeyDown);
  return { overlay: drawer, box: box, body: body, foot: foot, close: closeDrawer };
}

function createWorkspace(onRequestClose, notifier, services) {
  var state = {
    server: { accounts: [], selectedAccountId: "" },
    tab: "dashboard",
    projects: [],
    workspaces: [],
    workspacesError: "",
    workspacesLoaded: false,
    defects: { items: [], total: 0, page: 1, pageSize: PAGE_SIZE },
    defectFilters: { statusName: "", assignedToId: "" },
    defectStatusOptions: [],
    defectAssigneeOptions: [],
    defectStatuses: {},
    defectStatusLoading: {},
    defectStatusSaving: {},
    defectMembers: [],
    defectMembersScope: "@:",
    defectMembersLoading: false,
    pipelines: { items: [], total: 0, page: 1, pageSize: PAGE_SIZE },
    pipelineKeyword: "",
    dashboard: { loaded: false },
    code: { repos: [], total: 0, page: 1, pageSize: PAGE_SIZE, keyword: "", loaded: false, detail: null },
    tests: { plans: [], total: 0, page: 1, pageSize: PAGE_SIZE, loaded: false },
    packages: { repos: [], total: 0, page: 1, pageSize: PAGE_SIZE, loaded: false },
    flows: { items: [], loaded: false, active: 0, sel: "", sub: "rules" },
    policies: { items: [], loaded: false },
    runs: { items: [], loaded: false, status: "" },
    engine: { status: null },
    open: false
  };
  var root;
  var shell;
  var main;
  var subtitle;
  var navButtons = {};
  var defectStatusFilterControl;
  var defectAssigneeFilterControl;
  var defectLoadRevision = 0;
  var defectFilterOptionsScope = "";
  var defectFilterOptionsLoading = false;
  var branchDatalistSeq = 0;
  var notificationAssigneesScope = "";
  var unsubscribeNotifier = null;
  var defectResizeTimer = null;
  var onViewportResize = null;

  function selectedAccount() {
    return state.server.accounts.find(function (item) { return item.id === state.server.selectedAccountId; }) || null;
  }

  function selectedProject() {
    return selectedAccount() && selectedAccount().selectedProject || null;
  }

  function rpcArgs(extra) {
    var account = selectedAccount();
    var project = selectedProject();
    return Object.assign({
      accountId: account && account.id || "",
      projectId: project && project.id || ""
    }, extra || {});
  }

  // 顶层工具（图片预览/复制等）拿不到闭包里的 rpcArgs，由这里桥接当前账号与项目。
  function callRpc(method, args) {
    return rpc(method, rpcArgs(args));
  }

  function projectScope() {
    var account = selectedAccount();
    var project = selectedProject();
    return (account && account.id || "") + ":" + (project && project.id || "");
  }

  function updateSubtitle() {
    var account = selectedAccount();
    var project = selectedProject();
    subtitle.textContent = account ? account.name + (project ? " · " + project.name : " · 未选择项目") : "尚未配置账号";
  }

  function loadState() {
    return rpc("state.get").then(function (value) {
      state.server = value;
      updateSubtitle();
      return value;
    });
  }

  function setTab(tab) {
    state.tab = tab;
    if (tab === "defects" && notifier) notifier.markRead();
    Object.keys(navButtons).forEach(function (key) { navButtons[key].classList.toggle("active", key === tab); });
    render();
    if (tab === "defects" && selectedProject()) {
      loadDefects();
      loadDefectFilterOptions();
    }
    if (tab === "pipelines" && selectedProject()) loadPipelines();
    if (tab === "overview" && !state.workspacesLoaded) {
      state.workspacesLoaded = true;
      loadWorkspaces();
    }
    if (tab === "dashboard") loadDashboard();
    if (tab === "code" && !state.code.loaded) loadCodeRepos();
    if (tab === "tests" && !state.tests.loaded) loadTestPlans();
    if (tab === "packages" && !state.packages.loaded) loadPackageRepos();
    if (tab === "flows") {
      if (!state.flows.loaded) loadFlows();
      if (!state.policies.loaded) loadPolicies();
      loadRuns();
      loadEngineStatus();
      startFlowsPolling();
    } else {
      stopFlowsPolling();
    }
  }

  function loadWorkspaces() {
    return rpc("workspaces.list").then(function (result) {
      state.workspaces = (result && result.items) || [];
      state.workspacesError = "";
      if (state.tab === "overview") render();
    }).catch(function (error) {
      state.workspacesError = error instanceof Error ? error.message : String(error);
      if (state.tab === "overview") render();
    });
  }

  function render() {
    main.textContent = "";
    if (state.tab === "dashboard") renderDashboard();
    if (state.tab === "overview") renderOverview();
    if (state.tab === "defects") renderDefects();
    if (state.tab === "pipelines") renderPipelines();
    if (state.tab === "code") renderCode();
    if (state.tab === "tests") renderTests();
    if (state.tab === "packages") renderPackages();
    if (state.tab === "flows") renderFlows();
  }

  function renderOverview() {
    var section = node("section", "dyx-section");
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "设置"), node("p", "", "维护云效账号与当前项目；所有数据保存在一个 JSON 文本文件中。"));
    title.append(copy, button("新增账号", "primary", function () { openAccountForm(null); }));
    section.append(title);

    var account = selectedAccount();
    var project = account && account.selectedProject || null;
    var workspace = account && account.workspace || null;
    var notification = account && account.defectNotification || null;
    var accounts = state.server.accounts;
    var tokenReady = accounts.filter(function (item) { return item.hasToken; }).length;
    // 统计条：账号 / 令牌 / 项目 / 工作区 / 通知的配置状态一览，与各列表页同款方格小卡。
    var strip = node("div", "dyx-statstrip");
    strip.append(
      statTile({ label: "云效账号", value: accounts.length, hint: account ? "当前 " + account.name : "尚未选择账号" }),
      statTile({ label: "令牌已配置", tone: !accounts.length ? "" : tokenReady === accounts.length ? "ok" : "fail", value: tokenReady, hint: accounts.length ? "共 " + accounts.length + " 个账号" : "新增账号后填写令牌" }),
      statTile({ label: "当前项目", tone: project ? "ok" : "", value: project ? "已选择" : "未选择", hint: project ? project.name : "在下方选择项目" }),
      statTile({ label: "DSH 工作区", tone: workspace ? "ok" : "", value: workspace ? "已绑定" : "未绑定", hint: workspace ? (workspace.title || workspace.id) : "绑定后可一键处理缺陷" }),
      statTile({ label: "缺陷通知", tone: notification && notification.enabled ? "ok" : "", value: notification && notification.enabled ? "已开启" : "未开启", hint: notification && notification.enabled ? "每 " + (notification.intervalMinutes || DEFAULT_NOTIFICATION_INTERVAL) + " 分钟检查" : "在“工作项”页配置", onClick: function () { setTab("defects"); } })
    );
    section.append(strip);

    var accountsCard = node("div", "dyx-card");
    var accountsHead = node("div", "dyx-card-head");
    accountsHead.append(node("h3", "", "云效账号"), node("small", "", accounts.length ? accounts.length + " 个 · 点击卡片切换当前账号" : "0 个"));
    accountsCard.append(accountsHead);
    if (!accounts.length) accountsCard.append(empty("还没有云效账号", "新增账号后即可读取项目、缺陷和流水线。"));
    else accountsCard.append(accountGrid(accounts));
    section.append(accountsCard);

    // 项目选择与工作区绑定：宽容器左右并排，窄容器自动上下排列。
    var layout = node("div", "dyx-settings-layout");
    var projectCard = node("div", "dyx-card");
    var projectHead = node("div", "dyx-card-head");
    projectHead.append(node("h3", "", "当前项目"), button("从云效刷新", "", loadProjects));
    projectCard.append(projectHead);
    if (!account) {
      projectCard.append(empty("请先选择账号", "项目按账号和组织分别读取。"));
    } else {
      var row = node("div", "dyx-project-row");
      var select = node("select", "dyx-select");
      var placeholder = node("option", "", state.projects.length ? "选择一个项目" : "点击右侧按钮读取项目");
      placeholder.value = "";
      select.append(placeholder);
      state.projects.forEach(function (item) {
        var option = node("option", "", item.name);
        option.value = item.id;
        if (project && project.id === item.id) option.selected = true;
        select.append(option);
      });
      row.append(select, button("设为当前项目", "primary", function () {
        var chosen = state.projects.find(function (item) { return item.id === select.value; });
        if (!chosen) return toast("请选择项目", true);
        setBusy(projectCard, true);
        rpc("project.select", { accountId: account.id, project: chosen })
          .then(loadState)
          .then(function () { return notifier ? notifier.refresh() : null; })
          .then(function () { notificationAssigneesScope = ""; toast("已切换到“" + chosen.name + "”"); render(); })
          .catch(function (error) { toast(error.message, true); })
          .finally(function () { setBusy(projectCard, false); });
      }));
      projectCard.append(row);
      var current = node("div", "dyx-current");
      if (project) current.append(node("span", "", "当前："), node("strong", "", project.name), node("span", "", "  ·  " + project.id));
      else current.textContent = "尚未选择项目。选择后，缺陷与流水线页面会自动使用该项目上下文。";
      projectCard.append(current);
    }
    layout.append(projectCard);
    renderWorkspaceBinding(layout, account);
    section.append(layout);
    main.append(section);
  }

  // 账号方格卡片：令牌状态着左轨，当前账号带品牌色描边；整卡点击切换，按钮区域不冒泡。
  function accountGrid(accounts) {
    var wrap = node("div", "dyx-record-list dyx-tile-grid");
    accounts.forEach(function (account) {
      var active = account.id === state.server.selectedAccountId;
      var card = node("article", "dyx-record dyx-record-clickable dyx-tile-card dyx-account" + (active ? " active" : "") + (account.hasToken ? " tone-ok" : " tone-fail"));
      card.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        if (!active) chooseAccount(account.id);
      });
      var head = node("div", "dyx-record-head");
      var badges = node("div", "dyx-actions");
      badges.append(node("span", "dyx-badge " + (account.hasToken ? "ok" : "fail"), account.hasToken ? "令牌已配置" : "缺少令牌"));
      if (active) badges.append(node("span", "dyx-badge", "当前账号"));
      head.append(badges);
      var top = node("div", "dyx-account-top");
      var avatar = node("div", "dyx-avatar", (account.name || "云").slice(0, 1));
      var grow = node("div", "dyx-grow");
      grow.append(node("strong", "", account.name), node("small", "", account.organizationId));
      top.append(avatar, grow);
      var foot = node("div", "dyx-record-foot");
      var current = node("span", "dyx-muted", account.selectedProject ? "项目 " + account.selectedProject.name : "未选择项目");
      current.title = account.selectedProject ? account.selectedProject.name + " · " + account.selectedProject.id : "";
      var actions = node("div", "dyx-actions");
      if (!active) actions.append(button("设为当前", "dyx-btn-sm", function () { chooseAccount(account.id); }));
      actions.append(
        button("编辑", "dyx-btn-sm", function () { openAccountForm(account); }),
        button("删除", "dyx-btn-sm danger", function () { removeAccount(account); })
      );
      foot.append(current, actions);
      card.append(head, top, foot);
      wrap.append(card);
    });
    return wrap;
  }

  // DSH 工作区绑定：按账号+项目保存；绑定后缺陷列表可一键处理到该工作区的会话。
  function renderWorkspaceBinding(container, account) {
    var project = account && account.selectedProject || null;
    var workspace = account && account.workspace || null;
    var card = node("div", "dyx-card");
    var head = node("div", "dyx-card-head");
    head.append(node("h3", "", "DSH 工作区绑定"), node("span", "dyx-badge " + (workspace ? "ok" : ""), workspace ? "已绑定" : "未绑定"));
    card.append(head);
    if (!account || !project) {
      card.append(empty(!account ? "请先选择账号" : "请先选择项目", "工作区绑定按账号和项目分别保存。"));
      container.append(card);
      return;
    }
    var row = node("div", "dyx-project-row");
    var select = node("select", "dyx-select");
    select.setAttribute("aria-label", "选择要绑定的 DSH 工作区");
    var placeholder = node("option", "", state.workspaces.length ? (workspace ? "重新选择工作区" : "选择要绑定的 DSH 工作区") : "尚未读取工作区列表");
    placeholder.value = "";
    select.append(placeholder);
    state.workspaces.forEach(function (item) {
      var option = node("option", "", item.title || item.id);
      option.value = item.id;
      if (workspace && workspace.id === item.id) option.selected = true;
      select.append(option);
    });
    var actions = node("div", "dyx-actions");
    var refresh = node("button", "dyx-icon-btn", "↻");
    refresh.type = "button";
    refresh.setAttribute("aria-label", "刷新工作区列表");
    refresh.title = "刷新工作区列表";
    refresh.addEventListener("click", function () { loadWorkspaces(); });
    actions.append(refresh, button(workspace ? "保存绑定" : "绑定工作区", "primary", function () {
      if (!select.value) return toast("请选择要绑定的 DSH 工作区", true);
      saveWorkspaceBinding(select.value, "已绑定 DSH 工作区");
    }));
    if (workspace) actions.append(button("解除绑定", "danger", function () { saveWorkspaceBinding("", "已解除工作区绑定"); }));
    row.append(select, actions);
    card.append(row);
    var current = node("div", "dyx-current");
    if (workspace) {
      current.append(node("span", "", "已绑定："), node("strong", "", workspace.title || workspace.id), node("span", "", workspace.path ? "  ·  " + workspace.path : ""));
    } else if (state.workspacesError) {
      current.textContent = "工作区列表读取失败：" + state.workspacesError;
    } else {
      current.textContent = "未绑定。绑定后可在缺陷列表或详情点击“草稿”“处理”，把缺陷转为该工作区新会话的草稿，或直接发送。";
    }
    card.append(current);
    container.append(card);
  }

  function saveWorkspaceBinding(workspaceId, successText) {
    var account = selectedAccount();
    if (!account || !account.selectedProject) return toast("请先选择项目", true);
    setBusy(main, true);
    rpc("project.workspace.bind", rpcArgs({ workspaceId: workspaceId })).then(loadState).then(function () {
      render();
      toast(successText);
    }).catch(function (error) { toast(error.message, true); }).finally(function () { setBusy(main, false); });
  }

  function renderDefectNotification(section, account) {
    var project = account && account.selectedProject || null;
    var settings = Object.assign(defaultDefectNotification(), account && account.defectNotification || {});
    var noticeState = notifier ? notifier.snapshot() : { assignees: [], unreadCount: 0, lastCheckedAt: "", lastError: "" };
    var card = node("div", "dyx-card");
    var head = node("div", "dyx-card-head");
    var headTitle = node("div", "dyx-card-title");
    var refreshCheck = node("button", "dyx-icon-btn", "↻");
    refreshCheck.type = "button";
    refreshCheck.setAttribute("aria-label", "刷新缺陷检查");
    refreshCheck.title = "立即刷新一次缺陷检查";
    headTitle.append(node("h3", "", "缺陷通知"), refreshCheck);
    head.append(headTitle, node("span", "dyx-badge " + (settings.enabled ? "ok" : ""), settings.enabled ? "已开启" : "未开启"));
    card.append(head);
    if (!account || !project) {
      card.append(empty(!account ? "请先选择账号" : "请先选择项目", "通知配置按账号和项目分别保存。"));
      section.append(card);
      return;
    }
    if (settings.enabled) {
      var scoped = notifier && noticeState.accountId === account.id && noticeState.projectId === project.id;
      var stats = [];
      if (scoped && noticeState.lastCheckedAt) {
        stats.push("当前 " + noticeState.lastResultCount + " 条未处理", "更新时间 " + formatDate(noticeState.lastCheckedAt));
        if (noticeState.lastError) stats.push("检查失败：" + noticeState.lastError);
      } else {
        stats.push(scoped && noticeState.lastError ? "检查失败：" + noticeState.lastError : "尚未检查，可点击标题旁按钮刷新");
      }
      card.append(node("div", "dyx-notify-stats", stats.join(" · ")));
    }

    var toggle = input("checkbox");
    toggle.checked = Boolean(settings.enabled);
    toggle.setAttribute("aria-label", "开启缺陷通知");
    var toggleWrap = node("label", "dyx-notify-toggle");
    var toggleCopy = node("span");
    toggleCopy.append(node("strong", "", "系统原生通知"), node("div", "dyx-muted", "有新增缺陷时显示系统提醒（Windows Toast / macOS 通知中心）"));
    toggleWrap.append(toggleCopy, toggle);

    var assignee = node("select", "dyx-select");
    assignee.setAttribute("aria-label", "缺陷通知负责人");
    var emptyAssignee = node("option", "", "不选择负责人");
    emptyAssignee.value = "";
    assignee.append(emptyAssignee);
    var assignees = noticeState.accountId === account.id && noticeState.projectId === project.id ? noticeState.assignees : [];
    if (settings.assignedToId && !assignees.some(function (item) { return item.id === settings.assignedToId; })) {
      assignees = [{ id: settings.assignedToId, name: settings.assignedToName || settings.assignedToId }].concat(assignees);
    }
    assignees.forEach(function (item) { var option = node("option", "", item.name); option.value = item.id; assignee.append(option); });
    assignee.value = settings.assignedToId || "";

    var interval = node("select", "dyx-select");
    interval.setAttribute("aria-label", "缺陷通知查询间隔");
    [1, 5, 10, 15, 30, 60].forEach(function (minutes) {
      var option = node("option", "", minutes + " 分钟");
      option.value = String(minutes);
      interval.append(option);
    });
    if (!Array.from(interval.options).some(function (item) { return item.value === String(settings.intervalMinutes); })) {
      var custom = node("option", "", settings.intervalMinutes + " 分钟");
      custom.value = String(settings.intervalMinutes);
      interval.append(custom);
    }
    interval.value = String(settings.intervalMinutes);

    function saveNotification(next) {
      setBusy(card, true);
      rpc("defect.notification.settings.update", rpcArgs(Object.assign({}, settings, next))).then(loadState).then(function () {
        return notifier ? notifier.refresh() : null;
      }).then(function () {
        render();
        toast(next.enabled === true ? "缺陷通知已开启" : next.enabled === false ? "缺陷通知已关闭" : "缺陷通知设置已更新");
      }).catch(function (error) {
        toggle.checked = Boolean(settings.enabled);
        toast(error.message, true);
      }).finally(function () { setBusy(card, false); });
    }

    toggle.addEventListener("change", function () {
      if (!toggle.checked) { saveNotification({ enabled: false }); return; }
      saveNotification({ enabled: true });
    });
    assignee.addEventListener("change", function () {
      var option = assignee.options[assignee.selectedIndex];
      saveNotification({ assignedToId: assignee.value, assignedToName: assignee.value && option ? option.textContent : "" });
    });
    interval.addEventListener("change", function () { saveNotification({ intervalMinutes: Number(interval.value) }); });

    var grid = node("div", "dyx-notify-grid");
    grid.append(field("负责人（不选择则不限制）", assignee), field("查询间隔", interval));
    card.append(toggleWrap, grid);
    refreshCheck.disabled = !settings.enabled || !notifier;
    refreshCheck.addEventListener("click", function () {
      if (!notifier) return;
      refreshCheck.disabled = true;
      Promise.resolve(notifier.refresh()).catch(function (error) { toast(error.message, true); })
        .finally(function () { refreshCheck.disabled = false; });
    });
    section.append(card);

    var scope = account.id + ":" + project.id;
    if (notifier && notificationAssigneesScope !== scope) {
      notificationAssigneesScope = scope;
      Promise.resolve().then(function () { return notifier.loadAssignees(); });
    }
  }

  function openAccountForm(account) {
    var dialog = modal(account ? "编辑云效账号" : "新增云效账号");
    var form = node("div", "dyx-form");
    var nameInput = input("text", "例如：研发账号", account && account.name || "");
    var orgInput = input("text", "云效组织 ID", account && account.organizationId || "");
    var tokenInput = input("password", account ? "留空表示不修改" : "个人访问令牌");
    var remarkInput = input("textarea", "用途或备注", account && account.remark || "");
    form.append(field("账号名称 *", nameInput), field("组织 ID *", orgInput), field(account ? "个人访问令牌（留空不修改）" : "个人访问令牌 *", tokenInput), field("备注", remarkInput));
    dialog.body.append(form);
    dialog.foot.append(button("取消", "", dialog.close), button("保存", "primary", function (event) {
      var submit = event.currentTarget;
      submit.disabled = true;
      rpc("account.save", {
        id: account && account.id || "",
        name: nameInput.value,
        organizationId: orgInput.value,
        token: tokenInput.value,
        remark: remarkInput.value
      }).then(function () {
        dialog.close();
        state.projects = [];
        return loadState();
      }).then(function () { return notifier ? notifier.refresh() : null; })
        .then(function () { notificationAssigneesScope = ""; render(); toast("账号已保存"); })
        .catch(function (error) { toast(error.message, true); })
        .finally(function () { submit.disabled = false; });
    }));
  }

  function chooseAccount(id) {
    if (id === state.server.selectedAccountId) return;
    rpc("account.select", { accountId: id }).then(function () {
      state.projects = [];
      return loadState();
    }).then(function () { return notifier ? notifier.refresh() : null; })
      .then(function () { notificationAssigneesScope = ""; render(); }).catch(function (error) { toast(error.message, true); });
  }

  function removeAccount(account) {
    if (!window.confirm("删除账号“" + account.name + "”及其本地文本缓存？")) return;
    rpc("account.delete", { accountId: account.id }).then(function () {
      state.projects = [];
      return loadState();
    }).then(function () { return notifier ? notifier.refresh() : null; })
      .then(function () { notificationAssigneesScope = ""; render(); toast("账号已删除"); }).catch(function (error) { toast(error.message, true); });
  }

  function loadProjects() {
    var account = selectedAccount();
    if (!account) return toast("请先配置账号", true);
    setBusy(main, true);
    rpc("projects.list", { accountId: account.id }).then(function (result) {
      state.projects = result.items || [];
      render();
      if (result.stale) toast("云效连接失败，正在展示 " + formatDate(result.cachedAt) + " 的缓存", true);
      else toast("已读取 " + state.projects.length + " 个项目");
    }).catch(function (error) { toast(error.message, true); }).finally(function () { setBusy(main, false); });
  }

  function renderRequirement(section, kind) {
    var account = selectedAccount();
    var project = selectedProject();
    if (!account || !project) {
      var card = node("div", "dyx-card");
      card.append(empty(!account ? "请先配置云效账号" : "请先选择项目", "请到“设置”完成配置。"));
      card.append(button("前往设置", "primary", function () { setTab("overview"); }));
      section.append(card);
      return false;
    }
    return true;
  }

  function renderDefects() {
    var section = node("section", "dyx-section");
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "缺陷"), node("p", "", "实时读取云效工作项，按创建时间从新到旧排列；点击顶部统计卡可按状态快速筛选。"));
    title.append(copy, button("刷新", "", loadDefects));
    section.append(title);
    if (!renderRequirement(section)) { main.append(section); return; }
    var items = state.defects.items || [];
    var activeStatus = state.defectFilters.statusName || "";
    // 统计卡点击即切换状态筛选：再次点击已选中的卡取消筛选，“全部”用于清空。
    function setDefectStatusFilter(name) {
      state.defectFilters.statusName = name || "";
      if (defectStatusFilterControl) {
        defectStatusFilterControl.value = name || "";
        var wrap = defectStatusFilterControl.closest(".dyx-filter-control");
        var clear = wrap ? wrap.querySelector(".dyx-filter-clear") : null;
        if (clear) clear.hidden = !name;
      }
      state.defects.page = 1;
      loadDefects();
    }
    function kindCount(kind) {
      return items.filter(function (item) { return defectStatusKind(item.statusName) === kind; }).length;
    }
    // 统计条：“全部”取服务端总数，状态计数来自当前页。
    var strip = node("div", "dyx-statstrip");
    var specialCount = kindCount("pending") + kindCount("processing") + kindCount("reopened");
    strip.append(
      statTile({ label: "全部缺陷", value: state.defects.total || items.length, hint: "本页 " + items.length + " 条", active: !activeStatus, onClick: function () { if (activeStatus) setDefectStatusFilter(""); } }),
      statTile({ label: "待确认", tone: "pending", value: kindCount("pending"), hint: "本页计数", active: activeStatus === "待确认", onClick: function () { setDefectStatusFilter(activeStatus === "待确认" ? "" : "待确认"); } }),
      statTile({ label: "处理中", tone: "processing", value: kindCount("processing"), hint: "本页计数", active: activeStatus === "处理中", onClick: function () { setDefectStatusFilter(activeStatus === "处理中" ? "" : "处理中"); } }),
      statTile({ label: "再次打开", tone: "reopened", value: kindCount("reopened"), hint: "本页计数", active: activeStatus === "再次打开", onClick: function () { setDefectStatusFilter(activeStatus === "再次打开" ? "" : "再次打开"); } }),
      statTile({ label: "其他状态", value: Math.max(0, items.length - specialCount), hint: "本页计数" })
    );
    var card = node("div", "dyx-card");
    var tools = node("div", "dyx-defect-filters");
    var status = node("select", "dyx-select");
    status.setAttribute("aria-label", "按状态筛选");
    fillStatusFilterOptions(status);
    var assignee = node("select", "dyx-select");
    assignee.setAttribute("aria-label", "按负责人筛选");
    var assigneePlaceholder = node("option", "", "请选择负责人");
    assigneePlaceholder.value = "";
    assignee.append(assigneePlaceholder);
    state.defectAssigneeOptions.forEach(function (item) { var option = node("option", "", item.name); option.value = item.id; assignee.append(option); });
    var wantedAssignee = state.defectFilters.assignedToId || "";
    var hasWantedAssignee = Array.from(assignee.options).some(function (option) { return option.value === wantedAssignee; });
    if (!hasWantedAssignee) state.defectFilters.assignedToId = "";
    assignee.value = hasWantedAssignee ? wantedAssignee : "";
    defectStatusFilterControl = status;
    defectAssigneeFilterControl = assignee;
    function autoQuery() {
      state.defects.page = 1;
      loadDefects();
    }
    function filterWithClear(select, key, label) {
      var wrap = node("div", "dyx-filter-control");
      var clear = node("button", "dyx-filter-clear", "×");
      clear.type = "button";
      clear.setAttribute("aria-label", "清空" + label);
      clear.hidden = !select.value;
      select.addEventListener("change", function () {
        state.defectFilters[key] = select.value;
        clear.hidden = !select.value;
        autoQuery();
      });
      clear.addEventListener("click", function () {
        if (!select.value) return;
        select.value = "";
        state.defectFilters[key] = "";
        clear.hidden = true;
        autoQuery();
      });
      wrap.append(select, clear);
      return wrap;
    }
    tools.append(field("状态", filterWithClear(status, "statusName", "状态")), field("负责人", filterWithClear(assignee, "assignedToId", "负责人")));
    function onPage(next) { state.defects.page = next; loadDefects(); }
    var toolbar = node("div", "dyx-list-toolbar");
    toolbar.append(tools, pager(state.defects, onPage));
    card.append(toolbar);
    if (state.defects.stale) card.append(node("div", "dyx-stale", "云效暂时不可用，当前为 " + formatDate(state.defects.cachedAt) + " 的缓存。"));
    if (!items.length) card.append(empty("暂无缺陷", "可调整筛选条件后重新查询。"));
    else card.append(defectTable(items));
    card.append(pager(state.defects, onPage));
    // 双栏布局：列表在左，缺陷通知配置在右（宽容器并排，窄容器回落到下方）。
    var layout = node("div", "dyx-defects-layout");
    var column = node("div", "dyx-defects-main");
    var side = node("div", "dyx-defects-side");
    column.append(strip, card);
    layout.append(column, side);
    section.append(layout);
    renderDefectNotification(side, selectedAccount());
    main.append(section);
  }

  // 不同缺陷工作项类型下同名状态的 ID 不同，筛选下拉按状态名称去重，
  // 查询时通过 statusIds 携带同名状态的各个 ID。
  function fillStatusFilterOptions(select) {
    var byName = new Map();
    state.defectStatusOptions.forEach(function (item) {
      if (!byName.has(item.name)) byName.set(item.name, []);
      byName.get(item.name).push(item.id);
    });
    select.textContent = "";
    var placeholder = node("option", "", "请选择状态");
    placeholder.value = "";
    select.append(placeholder);
    byName.forEach(function (ids, name) {
      var option = node("option", "", name);
      option.value = name;
      select.append(option);
    });
    var wanted = state.defectFilters.statusName || "";
    var hasWanted = Array.from(select.options).some(function (option) { return option.value === wanted; });
    if (!hasWanted) state.defectFilters.statusName = "";
    select.value = hasWanted ? wanted : "";
    return byName;
  }

  function statusIdsForFilter() {
    var name = state.defectFilters.statusName;
    if (!name) return [];
    var ids = [];
    state.defectStatusOptions.forEach(function (item) {
      if (item.name === name && ids.indexOf(item.id) < 0) ids.push(item.id);
    });
    return ids;
  }

  // 行尾按钮组：待确认/再次打开才有“草稿/处理”（处理即原“立即处理”），处理紧挨“详情”左侧。
  function fillDefectRowActions(actions, item) {
    actions.textContent = "";
    if (defectHandleAllowed(item.statusName)) {
      actions.append(button("草稿", "dyx-btn-sm", function () { runHandleDefect(item, "draft"); }));
      actions.append(button("处理", "dyx-btn-sm", function () { runHandleDefect(item, "immediate"); }));
    }
    actions.append(button("详情", "dyx-btn-sm", function () { openDefect(item); }));
  }

  // 列表为方格卡片网格：标题（最多两行）、可选缩略图、负责人/状态下拉与标签、操作按钮。
  function defectTable(items) {
    var wrap = node("div", "dyx-record-list dyx-defect-grid");
    items.forEach(function (item) {
      var row = node("article", "dyx-record dyx-defect-row dyx-defect-card");
      applyDefectRecordTone(row, item.statusName);
      var statusSelect = node("select", "dyx-select dyx-inline-status");
      statusSelect.setAttribute("aria-label", "修改 " + (item.serialNumber || "缺陷") + " 状态");
      fillListStatusSelect(statusSelect, item);
      statusSelect.addEventListener("pointerdown", function () { loadListStatuses(item, statusSelect); });
      statusSelect.addEventListener("focus", function () { loadListStatuses(item, statusSelect); });
      statusSelect.addEventListener("change", function () {
        var statusName = selectedOptionText(statusSelect);
        applyDefectStatusTone(statusSelect, statusName);
        applyDefectRecordTone(row, statusName);
        saveListStatus(item, statusSelect, row);
      });
      var titleText = (item.serialNumber ? item.serialNumber + " " : "") + (item.subject || "未命名缺陷");
      var title = node("button", "dyx-link dyx-defect-row-title");
      title.type = "button";
      title.title = titleText;
      title.append(node("span", "dyx-defect-row-serial", item.serialNumber || "缺陷"), node("span", "dyx-defect-row-subject", item.subject || "未命名缺陷"));
      title.addEventListener("click", function () { openDefect(item); });
      var assignee = personBadge(item.assignedToName);
      var time = node("span", "dyx-defect-row-time", shortDateTime(item.gmtCreate || item.gmtModified));
      time.title = "创建 " + formatDate(item.gmtCreate || item.gmtModified);
      var meta = node("div", "dyx-defect-row-meta");
      var actions = node("div", "dyx-actions");
      fillDefectRowActions(actions, item);
      meta.append(assignee, statusSelect);
      // 优先级/严重度按档位着色，迭代与创建人仅在存在时展示，避免空标签。
      var priority = String(item.priority || "").trim();
      if (priority) meta.append(defectChip("优先级 " + priority, defectChipTone(priority)));
      var severity = String(item.severity || "").trim();
      if (severity) meta.append(defectChip(severity, defectChipTone(severity)));
      var sprint = String(item.sprintName || "").trim();
      if (sprint) meta.append(defectChip(sprint));
      meta.append(time, actions);
      row.append(title, meta);
      wrap.append(row);
    });
    return wrap;
  }

  function mergeDefectOptions(items, statuses, members) {
    var statusMap = new Map(state.defectStatusOptions.map(function (item) { return [item.id, item]; }));
    var assigneeMap = new Map(state.defectAssigneeOptions.map(function (item) { return [item.id, item]; }));
    (items || []).forEach(function (item) {
      if (item.statusId && item.statusName) statusMap.set(item.statusId, { id: item.statusId, name: item.statusName });
      if (item.assignedToId && item.assignedToName) assigneeMap.set(item.assignedToId, { id: item.assignedToId, name: item.assignedToName });
    });
    (Array.isArray(statuses) ? statuses : []).forEach(function (item) { if (item.id && item.name) statusMap.set(item.id, item); });
    (Array.isArray(members) ? members : []).forEach(function (item) { if (item.id && item.name) assigneeMap.set(item.id, item); });
    state.defectStatusOptions = Array.from(statusMap.values());
    state.defectAssigneeOptions = Array.from(assigneeMap.values());
    if (defectStatusFilterControl && defectStatusFilterControl.isConnected) {
      fillStatusFilterOptions(defectStatusFilterControl);
    }
    if (defectAssigneeFilterControl && defectAssigneeFilterControl.isConnected) {
      var selectedAssignee = defectAssigneeFilterControl.value;
      defectAssigneeFilterControl.textContent = "";
      var assigneePlaceholder = node("option", "", "请选择负责人");
      assigneePlaceholder.value = "";
      defectAssigneeFilterControl.append(assigneePlaceholder);
      state.defectAssigneeOptions.forEach(function (item) { var option = node("option", "", item.name); option.value = item.id; defectAssigneeFilterControl.append(option); });
      var hasAssignee = Array.from(defectAssigneeFilterControl.options).some(function (option) { return option.value === selectedAssignee; });
      if (!hasAssignee) {
        selectedAssignee = "";
        state.defectFilters.assignedToId = "";
      }
      defectAssigneeFilterControl.value = selectedAssignee;
    }
  }

  function fillListStatusSelect(select, item) {
    var statuses = state.defectStatuses[item.id] || [];
    if (!statuses.length && item.statusId) statuses = [{ id: item.statusId, name: item.statusName || "当前状态" }];
    select.textContent = "";
    statuses.forEach(function (status) { var option = node("option", "", status.name); option.value = status.id; select.append(option); });
    if (!statuses.length) { var emptyOption = node("option", "", item.statusName || "未知状态"); emptyOption.value = item.statusId || ""; select.append(emptyOption); }
    select.value = item.statusId || "";
    applyDefectStatusTone(select, item.statusName);
    select.disabled = Boolean(state.defectStatusSaving[item.id]);
  }

  function loadListStatuses(item, select) {
    if (state.defectStatuses[item.id] || state.defectStatusLoading[item.id]) return;
    state.defectStatusLoading[item.id] = true;
    rpc("defect.statuses", rpcArgs({ defectId: item.id })).then(function (statuses) {
      state.defectStatuses[item.id] = statuses || [];
      mergeDefectOptions([], statuses);
      fillListStatusSelect(select, item);
    }).catch(function (error) { toast(error.message, true); }).finally(function () {
      delete state.defectStatusLoading[item.id];
      select.disabled = Boolean(state.defectStatusSaving[item.id]);
    });
  }

  function saveListStatus(item, select, card) {
    var statusId = select.value;
    if (!statusId || statusId === item.statusId || state.defectStatusSaving[item.id]) return;
    var previousStatusId = item.statusId;
    state.defectStatusSaving[item.id] = true;
    select.disabled = true;
    rpc("defect.status.update", rpcArgs({ defectId: item.id, statusId: statusId })).then(function (updated) {
      Object.assign(item, updated);
      applyDefectRecordTone(card, updated.statusName);
      mergeDefectOptions([updated], state.defectStatuses[item.id]);
      fillListStatusSelect(select, item);
      var rowActions = card.querySelector(".dyx-defect-row-meta .dyx-actions");
      if (rowActions) fillDefectRowActions(rowActions, item);
      toast("缺陷状态已更新");
      reloadDefectsSoon();
    }).catch(function (error) {
      select.value = previousStatusId || "";
      applyDefectStatusTone(select, item.statusName);
      applyDefectRecordTone(card, item.statusName);
      toast(error.message, true);
    }).finally(function () {
      delete state.defectStatusSaving[item.id];
      select.disabled = false;
    });
  }

  function pager(pageData, onPage) {
    var wrap = node("div", "dyx-page");
    var pages = Math.max(1, Math.ceil((pageData.total || 0) / (pageData.pageSize || PAGE_SIZE)));
    var prev = button("上一页", "", function () { onPage(Math.max(1, pageData.page - 1)); });
    var next = button("下一页", "", function () { onPage(Math.min(pages, pageData.page + 1)); });
    prev.disabled = pageData.page <= 1; next.disabled = pageData.page >= pages;
    wrap.append(prev, node("span", "", "第 " + pageData.page + " / " + pages + " 页 · 共 " + (pageData.total || 0) + " 条"), next);
    return wrap;
  }

  // 云效 workitems:search 是搜索索引，修改后立即查询可能返回旧值；
  // 修改成功返回后等半秒再刷新，避开索引延迟。概览页复用同一套缺陷卡片，也在这里刷新。
  function reloadDefectsSoon() {
    setTimeout(function () {
      if (!selectedProject()) return;
      if (state.tab === "defects") loadDefects();
      else if (state.tab === "dashboard") loadDashboard();
    }, 500);
  }

  // 项目级状态/成员选项：进入缺陷页时拉取一次（按项目缓存），
  // 避免筛选下拉只包含当前页缺陷里出现过的状态。
  function loadDefectFilterOptions() {
    if (!selectedProject()) return;
    var scope = projectScope();
    if (defectFilterOptionsLoading || defectFilterOptionsScope === scope) return;
    defectFilterOptionsLoading = true;
    rpc("defect.members", rpcArgs({})).then(function (members) {
      if (projectScope() !== scope) return;
      if (state.defectMembersScope !== projectScope()) {
        state.defectMembers = Array.isArray(members) ? members : [];
        state.defectMembersScope = projectScope();
      }
      mergeDefectOptions([], [], Array.isArray(members) ? members : []);
    }).catch(function () {});
    rpc("defect.statusOptions", rpcArgs({})).then(function (result) {
      if (projectScope() !== scope) return;
      mergeDefectOptions([], result.items || []);
    }).catch(function (error) { toast("状态选项读取失败：" + error.message, true); })
      .finally(function () {
        defectFilterOptionsLoading = false;
        defectFilterOptionsScope = scope;
      });
  }

  // 自适应分页：按工作台当前可用宽高估算方格卡片的“列数 × 行数”作为每页条数。
  // 列宽按卡片最小 330px + 11px 间距估算；行高按卡片约 130px + 11px 间距估算；
  // 高度预留页头/统计条/筛选栏/分页条；结果钳制在 4–100（服务端上限 100）。
  function computeDefectPageSize() {
    var containerWidth = (main && main.clientWidth) || 1200;
    var viewportHeight = window.innerHeight || 900;
    var listWidth = containerWidth >= 920 ? containerWidth - 314 : containerWidth; // 双栏时右侧通知栏占 300 + 14 间距
    var columns = Math.max(1, Math.floor((listWidth + 11) / 341));
    var availableHeight = Math.max(300, viewportHeight - 330);
    var rows = Math.max(1, Math.floor(availableHeight / 141));
    return Math.min(100, Math.max(4, columns * rows));
  }

  function loadDefects() {
    if (!selectedProject()) return render();
    // 宽高变化后每页条数随之调整；变化时回到第一页重新查询。
    var desiredPageSize = computeDefectPageSize();
    if (desiredPageSize !== state.defects.pageSize) {
      state.defects.pageSize = desiredPageSize;
      state.defects.page = 1;
    }
    var revision = ++defectLoadRevision;
    setBusy(main, true);
    rpc("defects.list", rpcArgs({
      page: state.defects.page,
      pageSize: state.defects.pageSize,
      statusIds: statusIdsForFilter(),
      assignedToId: state.defectFilters.assignedToId
    })).then(function (result) {
      if (revision !== defectLoadRevision) return;
      result.items = (result.items || []).slice().sort(function (left, right) {
        return dateValue(right.gmtCreate || right.gmtModified) - dateValue(left.gmtCreate || left.gmtModified);
      });
      state.defects = result;
      mergeDefectOptions(result.items);
      render();
    }).catch(function (error) { if (revision === defectLoadRevision) toast(error.message, true); }).finally(function () { if (revision === defectLoadRevision) setBusy(main, false); });
  }

  function openDefect(item) {
    var dialog = modal("缺陷详情", true);
    dialog.body.append(empty("正在读取", item.serialNumber || item.id));
    rpc("defect.get", rpcArgs({ defectId: item.id })).then(function (detail) {
      renderDefectDetail(dialog, detail);
    }).catch(function (error) { dialog.body.textContent = ""; dialog.body.append(empty("读取失败", error.message)); });
  }

  function handleConversation() {
    if (!services || !services.workspaces || !services.sessions) return null;
    var reflect = services.reflect;
    var conversation = reflect && typeof reflect.get === "function" ? reflect.get("conversation") : null;
    return conversation && conversation.input ? conversation : null;
  }

  // 绑定保存的是宿主工作区注册表的 ID；客户端工作区基线可能尚未同步，
  // 这里先刷新一次并确认可见，避免 connectWorkspace 因列表未就绪而失败。
  function ensureWorkspaceVisible(workspaceId) {
    var workspaces = services.workspaces;
    var known = function () {
      return (workspaces.list.getSnapshot().items || []).some(function (item) { return item.workspaceId === workspaceId; });
    };
    if (known()) return Promise.resolve();
    return Promise.resolve(workspaces.refresh()).catch(function () {}).then(function () {
      if (!known()) throw new Error("绑定的工作区不存在或尚未同步，请刷新页面后重试");
    });
  }

  function runHandleDefect(item, mode) {
    var account = selectedAccount();
    var binding = account && account.workspace || null;
    if (!binding || !binding.id) return toast("当前项目尚未绑定 DSH 工作区，请先到设置页绑定", true);
    var conversation = handleConversation();
    if (!conversation) return toast("会话服务尚未就绪，请重启页面后重试", true);
    setBusy(main, true);
    ensureWorkspaceVisible(binding.id)
      .then(function () { return rpc("defect.get", rpcArgs({ defectId: item.id })); })
      .then(function (detail) { return buildHandlePayload(detail); })
      .then(function (payload) {
        return mode === "draft"
          ? sendHandleDraft(conversation, binding.id, payload)
          : sendHandleImmediate(conversation, binding.id, payload);
      })
      .then(function () {
        toast(mode === "draft" ? "草稿已填入绑定工作区的新会话，确认后手动发送" : "缺陷已发送到绑定工作区的新会话");
      })
      .catch(function (error) { toast(error instanceof Error ? error.message : String(error), true); })
      .finally(function () { setBusy(main, false); });
  }

  // 拉取缺陷详情里的图片（宿主侧转 base64），单张失败只跳过不阻塞整体。
  function buildHandlePayload(detail) {
    var item = detail && detail.defect || {};
    var text = buildHandleText(detail);
    var candidates = imageCandidates(detail && detail.attachments);
    if (!candidates.length) return Promise.resolve({ text: text, images: [] });
    return Promise.all(candidates.map(function (file) {
      return rpc("defect.attachment.data", rpcArgs({ defectId: item.id, fileId: file.fileId }))
        .then(function (result) {
          if (!result || !result.data || !result.mediaType) return null;
          return { name: result.fileName || file.fileName || "图片", mediaType: result.mediaType, data: result.data };
        })
        .catch(function () { return null; });
    })).then(function (images) {
      return { text: text, images: images.filter(Boolean) };
    });
  }

  // 草稿：复用工作区当前空白会话（无空白会话时新建），把文本与图片放进输入框，不发送。
  function sendHandleDraft(conversation, workspaceId, payload) {
    var sessions = services.sessions;
    var workspaces = services.workspaces;
    return workspaces.connectWorkspace(workspaceId).then(function (sessionId) {
      var target = { sessionId: sessionId, shell: conversation.input.shell(sessionId) };
      var summary = sessions.list.getSnapshot();
      var isBlank = Boolean(summary.byId[sessionId] && summary.byId[sessionId].blank);
      if (target.shell.snapshot.draft.trim() !== "" || !isBlank) {
        return sessions.create({ workspaceId: workspaceId }).then(function (freshId) {
          return { sessionId: freshId, shell: conversation.input.shell(freshId) };
        });
      }
      return target;
    }).then(function (target) {
      var files = payload.images.map(base64ToFile);
      var registered = files.length ? conversation.createDraftImages(files) : [];
      if (registered.length && !target.shell.addImages(registered.map(function (draft) { return draft.id; }))) {
        conversation.releaseDraftImages(registered);
      }
      target.shell.setDraft(payload.text);
      sessions.open(target.sessionId);
    });
  }

  // 立即处理：新建会话并直接发送（文本 + base64 图片），随后切换到该会话。
  function sendHandleImmediate(conversation, workspaceId, payload) {
    var sessions = services.sessions;
    return sessions.create({ workspaceId: workspaceId }).then(function (sessionId) {
      var binding = sessions.binding(sessionId);
      var session = binding && binding.session;
      if (!session) throw new Error("新会话尚未就绪，请重试");
      var content = payload.images.map(function (image) {
        return { type: "image", mediaType: image.mediaType, data: image.data, name: image.name };
      });
      content.push({ type: "text", text: payload.text });
      return session.prompt(content, "queue").then(function (result) {
        if (!result || !result.ok) {
          var detail = result && result.error ? result.error.code + ": " + result.error.message : "未知错误";
          throw new Error("发送失败：" + detail);
        }
        sessions.open(sessionId);
      });
    });
  }

  function openNotifiedDefects(items) {
    var values = (items || []).filter(function (item) { return item && item.id; });
    return loadState().then(function () {
      setTab("defects");
      if (!values.length) return;
      openDefect(values[0]);
      if (values.length > 1) toast("本次新增 " + values.length + " 个缺陷，当前打开第一条");
    }).catch(function (error) {
      toast(error instanceof Error ? error.message : String(error), true);
    });
  }

  function renderDefectDetail(dialog, detail) {
    dialog.body.textContent = "";
    var item = detail.defect;
    var title = node("div", "dyx-detail-title");
    title.append(node("span", "dyx-badge", item.serialNumber || "缺陷"), node("h2", "", item.subject || "未命名缺陷"));
    dialog.body.append(title);
    var statusRow = node("div", "dyx-status-row");
    var select = node("select", "dyx-select");
    (detail.statuses || []).forEach(function (status) {
      var option = node("option", "", status.name); option.value = status.id; option.selected = status.id === item.statusId; select.append(option);
    });
    if (!detail.statuses || !detail.statuses.length) { var current = node("option", "", item.statusName || "未知状态"); current.value = item.statusId || ""; select.append(current); select.disabled = true; }
    applyDefectStatusTone(select, item.statusName);
    select.addEventListener("change", function () {
      var statusId = select.value;
      if (!statusId || statusId === item.statusId) return;
      var previousStatusId = item.statusId;
      applyDefectStatusTone(select, selectedOptionText(select));
      select.disabled = true;
      rpc("defect.status.update", rpcArgs({ defectId: item.id, statusId: statusId })).then(function (updated) {
        detail.defect = updated; item = updated;
        applyDefectStatusTone(select, updated.statusName);
        syncDetailActions();
        var listed = state.defects.items.find(function (entry) { return entry.id === updated.id; });
        if (listed) Object.assign(listed, updated);
        toast("缺陷状态已更新");
        reloadDefectsSoon();
      }).catch(function (error) {
        select.value = previousStatusId || "";
        applyDefectStatusTone(select, item.statusName);
        toast(error.message, true);
      }).finally(function () {
        select.disabled = !detail.statuses || !detail.statuses.length;
      });
    });
    function fillDetailAssignee(assigneeSelect) {
      var entries = state.defectMembers.slice();
      if (item.assignedToId && !entries.some(function (entry) { return entry.id === item.assignedToId; })) {
        entries.unshift({ id: item.assignedToId, name: item.assignedToName || item.assignedToId });
      }
      assigneeSelect.textContent = "";
      if (!entries.length) {
        var none = node("option", "", "未分配");
        none.value = "";
        assigneeSelect.append(none);
      } else {
        entries.forEach(function (entry) { var option = node("option", "", entry.name); option.value = entry.id; assigneeSelect.append(option); });
      }
      if (!item.assignedToId) {
        var unassigned = node("option", "", "未分配");
        unassigned.value = "";
        assigneeSelect.insertBefore(unassigned, assigneeSelect.firstChild);
      }
      assigneeSelect.value = item.assignedToId || "";
    }
    function loadDetailMembers(assigneeSelect) {
      if (state.defectMembersLoading) return;
      if (state.defectMembersScope === projectScope() && state.defectMembers.length) return;
      state.defectMembersLoading = true;
      rpc("defect.members", rpcArgs({})).then(function (members) {
        state.defectMembers = members || [];
        state.defectMembersScope = projectScope();
        mergeDefectOptions([], [], state.defectMembers);
        fillDetailAssignee(assigneeSelect);
      }).catch(function (error) { toast(error.message, true); }).finally(function () {
        state.defectMembersLoading = false;
      });
    }
    var assigneeSelect = node("select", "dyx-select");
    assigneeSelect.setAttribute("aria-label", "修改 " + (item.serialNumber || "缺陷") + " 负责人");
    fillDetailAssignee(assigneeSelect);
    assigneeSelect.addEventListener("pointerdown", function () { loadDetailMembers(assigneeSelect); });
    assigneeSelect.addEventListener("focus", function () { loadDetailMembers(assigneeSelect); });
    assigneeSelect.addEventListener("change", function () {
      var assignedToId = assigneeSelect.value;
      if (!assignedToId || assignedToId === item.assignedToId || state.defectMembersLoading) return;
      assigneeSelect.disabled = true;
      rpc("defect.assignee.update", rpcArgs({ defectId: item.id, assignedToId: assignedToId })).then(function (updated) {
        detail.defect = updated; item = updated;
        mergeDefectOptions([updated], []);
        fillDetailAssignee(assigneeSelect);
        syncMetaValues();
        var listed = state.defects.items.find(function (entry) { return entry.id === updated.id; });
        if (listed) Object.assign(listed, updated);
        toast("负责人已更新为" + (updated.assignedToName || updated.assignedToId));
        reloadDefectsSoon();
      }).catch(function (error) {
        fillDetailAssignee(assigneeSelect);
        toast(error.message, true);
      }).finally(function () { assigneeSelect.disabled = false; });
    });
    // 详情行内直达处理：与列表一致，仅待确认/再次打开显示，随状态下拉修改同步显隐；
    // 点击后关闭详情再执行，与原弹窗流程一致。
    var detailActions = node("div", "dyx-actions dyx-status-row-actions");
    var detailDraft = button("草稿", "", function () { dialog.close(); runHandleDefect(item, "draft"); });
    var detailHandle = button("处理", "primary", function () { dialog.close(); runHandleDefect(item, "immediate"); });
    detailActions.append(detailDraft, detailHandle);
    function syncDetailActions() {
      var allowed = defectHandleAllowed(item.statusName);
      detailDraft.classList.toggle("dyx-hidden", !allowed);
      detailHandle.classList.toggle("dyx-hidden", !allowed);
    }
    syncDetailActions();
    statusRow.append(field("状态", select), field("负责人", assigneeSelect), detailActions);
    dialog.body.append(statusRow);
    var meta = node("div", "dyx-meta");
    var metaSpans = {};
    [["创建人", item.creatorName], ["最近修改人", item.modifierName], ["迭代", item.sprintName], ["优先级", item.priority || item.severity], ["更新时间", formatDate(item.gmtModified)]].forEach(function (pair) {
      var box = node("div");
      var valueSpan = node("span", "", pair[1] || "-");
      box.append(node("small", "", pair[0]), valueSpan);
      meta.append(box);
      metaSpans[pair[0]] = valueSpan;
    });
    function syncMetaValues() {
      metaSpans["创建人"].textContent = item.creatorName || "-";
      metaSpans["最近修改人"].textContent = item.modifierName || "-";
      metaSpans["迭代"].textContent = item.sprintName || "-";
      metaSpans["优先级"].textContent = item.priority || item.severity || "-";
      metaSpans["更新时间"].textContent = formatDate(item.gmtModified);
    }
    dialog.body.append(meta);
    if (detail.warning) dialog.body.append(node("div", "dyx-note", detail.warning));
    dialog.body.append(node("h3", "", "描述"));
    var rich = node("div", "dyx-rich"); renderRich(rich, detail.description || "", detail.descriptionFormat || "RICHTEXT", detail.attachments || [], item.id, callRpc); dialog.body.append(rich);
    if (detail.attachments && detail.attachments.length) {
      dialog.body.append(node("h3", "", "附件"));
      // 图片附件以小缩略图横向排列（过多自动换行），其余文件保持行式列表。
      var imageFiles = detail.attachments.filter(function (file) { return fileImageMediaType(file); });
      var otherFiles = detail.attachments.filter(function (file) { return !fileImageMediaType(file); });
      if (imageFiles.length) {
        var thumbStrip = node("div", "dyx-attachment-strip");
        imageFiles.forEach(function (file) { thumbStrip.append(attachmentThumb(item, file)); });
        dialog.body.append(thumbStrip);
      }
      if (otherFiles.length) {
        var files = node("div", "dyx-attachments");
        otherFiles.forEach(function (file) { files.append(attachmentRow(item, file)); });
        dialog.body.append(files);
      }
    }
    var commentCount = detail.comments && detail.comments.length || 0;
    dialog.body.append(node("h3", "", "评论（" + commentCount + "）"));
    var compose = node("div", "dyx-comment-compose");
    var commentInput = input("textarea", "输入评论内容，Ctrl/Command + Enter 快速提交", "");
    commentInput.maxLength = 10000;
    var publish = button("发布评论", "primary");
    function submitComment() {
      var content = commentInput.value.trim();
      if (!content) return toast("请输入评论内容", true);
      commentInput.disabled = true;
      publish.disabled = true;
      publish.textContent = "发布中…";
      rpc("defect.comment.create", rpcArgs({ defectId: item.id, content: content })).then(function () {
        commentInput.value = "";
        toast("评论已发布");
        return rpc("defect.get", rpcArgs({ defectId: item.id })).then(function (refreshed) {
          renderDefectDetail(dialog, refreshed);
        }).catch(function () {
          toast("评论已发布，但列表刷新失败，请重新打开缺陷详情", true);
        });
      }).catch(function (error) {
        toast(error.message, true);
      }).finally(function () {
        commentInput.disabled = false;
        publish.disabled = false;
        publish.textContent = "发布评论";
      });
    }
    publish.addEventListener("click", submitComment);
    commentInput.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitComment();
      }
    });
    var composeActions = node("div", "dyx-comment-compose-actions");
    composeActions.append(node("span", "", "将以当前云效账号身份发布 · 最多 10000 字"), publish);
    compose.append(commentInput, composeActions);
    dialog.body.append(compose);
    if (commentCount) {
      var comments = node("div", "dyx-comments");
      detail.comments.forEach(function (comment) {
        var card = node("div", "dyx-comment");
        var head = node("div", "dyx-comment-head"); head.append(node("strong", "", comment.userName || "匿名"), node("span", "", formatDate(comment.gmtCreate)));
        var content = node("div", "dyx-rich"); renderRich(content, comment.content || "", comment.contentFormat || "RICHTEXT", detail.attachments || [], item.id, callRpc);
        card.append(head, content); comments.append(card);
      });
      dialog.body.append(comments);
    } else dialog.body.append(empty("暂无评论", "发布第一条评论。"));
    dialog.foot.textContent = ""; dialog.foot.append(button("关闭", "", dialog.close));
  }

  // 图片附件缩略图：小尺寸横向排列，点击进入全屏预览；
  // 直链过期时加载失败自动换取新地址重试一次。
  function attachmentThumb(defect, file) {
    var tile = node("div", "dyx-attachment-thumb");
    var img = node("img");
    var snapshotUrl = safeUrl(file.url, true);
    if (snapshotUrl) img.src = snapshotUrl;
    img.alt = file.fileName || "图片";
    img.loading = "lazy";
    img.addEventListener("click", function () { previewDefectAttachment(defect, file); });
    img.addEventListener("error", function () {
      if (!defect.id || !file.fileId || tile.dataset.refreshed) return;
      tile.dataset.refreshed = "1";
      callRpc("defect.attachment.link", { defectId: defect.id, fileId: file.fileId }).then(function (result) {
        var url = safeUrl(result && result.url, true);
        if (url) img.src = url;
      }).catch(function () {});
    });
    var size = formatBytes(file.size);
    var name = node("span", "dyx-attachment-thumb-name", file.fileName || "图片");
    name.title = (file.fileName || "图片") + (size ? "（" + size + "）" : "");
    tile.append(img, name);
    return tile;
  }

  // 云效附件直链具有时效性：点击时实时换取新地址，失败再退回详情里的快照地址。
  function attachmentRow(defect, file) {
    var row = node("div", "dyx-attachment");
    var size = formatBytes(file.size);
    var label = node("span", "dyx-attachment-name", file.fileName || "附件");
    label.title = (file.fileName || "附件") + (size ? "（" + size + "）" : "");
    row.append(label);
    if (size) row.append(node("span", "dyx-attachment-size", size));
    if (fileImageMediaType(file)) row.append(button("预览", "dyx-btn-sm", function () { previewDefectAttachment(defect, file); }));
    row.append(button("打开", "dyx-btn-sm", function () { openAttachment(defect, file, "open"); }));
    row.append(button("下载", "dyx-btn-sm", function () { openAttachment(defect, file, "download"); }));
    return row;
  }

  function openAttachment(defect, file, mode) {
    var fallback = safeUrl(file.url);
    function use(url) {
      if (mode === "download") downloadFile(url, file.fileName);
      else window.open(url, "_blank", "noopener");
    }
    if (!file.fileId) {
      if (fallback) use(fallback);
      else toast("该附件缺少下载地址", true);
      return;
    }
    rpc("defect.attachment.link", rpcArgs({ defectId: defect.id, fileId: file.fileId })).then(function (result) {
      var url = safeUrl(result && result.url);
      if (!url) throw new Error("云效未返回可用的附件下载地址");
      use(url);
    }).catch(function (error) {
      if (fallback) { use(fallback); return; }
      toast(error instanceof Error ? error.message : String(error), true);
    });
  }

  // 图片附件在插件内预览（不依赖外部浏览器）；预览层自带过期重试。
  function previewDefectAttachment(defect, file) {
    var fallback = safeUrl(file.url, true);
    function use(url) {
      openImagePreview({ url: url, name: file.fileName || "图片", defectId: defect.id, fileId: file.fileId, callRpc: callRpc });
    }
    if (!file.fileId) {
      if (fallback) use(fallback);
      else toast("该附件缺少下载地址", true);
      return;
    }
    rpc("defect.attachment.link", rpcArgs({ defectId: defect.id, fileId: file.fileId })).then(function (result) {
      var url = safeUrl(result && result.url, true);
      if (!url) throw new Error("云效未返回可用的附件下载地址");
      use(url);
    }).catch(function (error) {
      if (fallback) { use(fallback); return; }
      toast(error instanceof Error ? error.message : String(error), true);
    });
  }

  function renderPipelines() {
    var section = node("section", "dyx-section");
    var title = node("div", "dyx-title");
    var copy = node("div"); copy.append(node("h2", "", "流水线"), node("p", "", "组织级列表，可查看代码源、运行记录和任务日志，并手动触发运行。"));
    title.append(copy, button("刷新", "", loadPipelines)); section.append(title);
    if (!renderRequirement(section)) { main.append(section); return; }
    var items = state.pipelines.items || [];
    // 统计条：总数取服务端，运行状态计数来自当前页。
    var counts = { ok: 0, run: 0, fail: 0, other: 0 };
    items.forEach(function (item) {
      var kind = statusClass(item.status);
      if (kind === "ok") counts.ok++;
      else if (kind === "run") counts.run++;
      else if (kind === "fail") counts.fail++;
      else counts.other++;
    });
    var strip = node("div", "dyx-statstrip");
    strip.append(
      statTile({ label: "全部流水线", value: state.pipelines.total || items.length, hint: "本页 " + items.length + " 条" }),
      statTile({ label: "最近成功", tone: "ok", value: counts.ok, hint: "本页计数" }),
      statTile({ label: "运行中", tone: "run", value: counts.run, hint: "本页计数" }),
      statTile({ label: "最近失败", tone: "fail", value: counts.fail, hint: "本页计数" }),
      statTile({ label: "暂无运行", value: counts.other, hint: "本页计数" })
    );
    var card = node("div", "dyx-card");
    var keyword = input("text", "流水线名称", state.pipelineKeyword);
    // 输入框内直接回车即查询，不必点击“查询”。
    keyword.setAttribute("aria-label", "按名称搜索流水线");
    keyword.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { state.pipelineKeyword = keyword.value.trim(); state.pipelines.page = 1; loadPipelines(); }
    });
    function onPage(next) { state.pipelines.page = next; loadPipelines(); }
    var filters = node("div", "dyx-pipeline-filters");
    filters.append(field("关键词", keyword), button("查询", "primary", function () { state.pipelineKeyword = keyword.value.trim(); state.pipelines.page = 1; loadPipelines(); }), button("清空", "", function () { if (!state.pipelineKeyword && !keyword.value) return; state.pipelineKeyword = ""; keyword.value = ""; state.pipelines.page = 1; loadPipelines(); }));
    var toolbar = node("div", "dyx-list-toolbar");
    toolbar.append(filters, pager(state.pipelines, onPage));
    card.append(toolbar);
    if (state.pipelines.stale) card.append(node("div", "dyx-stale", "云效暂时不可用，当前为 " + formatDate(state.pipelines.cachedAt) + " 的缓存。"));
    if (!items.length) card.append(empty("暂无流水线", "当前账号在该组织中可能没有流水线权限。"));
    else card.append(pipelineTable(items));
    card.append(pager(state.pipelines, onPage));
    section.append(strip, card); main.append(section);
  }

  function pipelineTable(items) {
    var wrap = node("div", "dyx-record-list dyx-pipeline-grid");
    items.forEach(function (item) {
      var kind = statusClass(item.status);
      var card = node("article", "dyx-record dyx-record-clickable dyx-pipeline-card" + (kind ? " tone-" + kind : ""));
      // 整卡点击进入详情；按钮区域（详情/运行）保持自身行为，不冒泡重复触发。
      card.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        openPipeline(item);
      });
      var head = node("div", "dyx-record-head");
      head.append(node("span", "dyx-badge", "#" + item.id), node("span", "dyx-badge " + kind, item.status || "暂无运行"));
      var title = node("button", "dyx-link dyx-record-title", item.name || "未命名流水线");
      title.type = "button";
      title.title = item.name || "未命名流水线";
      title.addEventListener("click", function () { openPipeline(item); });
      var foot = node("div", "dyx-record-foot");
      var updated = node("span", "dyx-muted", "更新 " + shortDateTime(item.updateTime));
      updated.title = "更新 " + formatDate(item.updateTime);
      var actions = node("div", "dyx-actions");
      actions.append(button("详情", "", function () { openPipeline(item); }), button("运行", "primary", function () { openRunPipeline(item); }));
      foot.append(updated, actions);
      card.append(head, title, foot);
      wrap.append(card);
    });
    return wrap;
  }

  function loadPipelines() {
    if (!selectedProject()) return render();
    setBusy(main, true);
    rpc("pipelines.list", rpcArgs({ page: state.pipelines.page, pageSize: state.pipelines.pageSize, keyword: state.pipelineKeyword })).then(function (result) {
      state.pipelines = result; render();
    }).catch(function (error) { toast(error.message, true); }).finally(function () { setBusy(main, false); });
  }

  function openPipeline(item) {
    var dialog = modal("流水线详情", true); dialog.body.append(empty("正在读取", item.name));
    Promise.all([
      rpc("pipeline.get", rpcArgs({ pipelineId: item.id })),
      rpc("pipeline.runs", rpcArgs({ pipelineId: item.id, page: 1, pageSize: 10 }))
    ]).then(function (values) { renderPipelineDetail(dialog, values[0], values[1]); })
      .catch(function (error) { dialog.body.textContent = ""; dialog.body.append(empty("读取失败", error.message)); });
  }

  function renderPipelineDetail(dialog, detail, runs) {
    dialog.body.textContent = "";
    var p = detail.pipeline;
    var heading = node("div", "dyx-title"); var copy = node("div"); copy.append(node("h2", "", p.name), node("p", "", "ID " + p.id + (detail.envName ? " · " + detail.envName : "")));
    heading.append(copy, button("运行流水线", "primary", function () { openRunPipeline(p); })); dialog.body.append(heading);
    if (detail.sources && detail.sources.length) {
      dialog.body.append(node("h3", "", "代码源"));
      var sources = node("div", "dyx-meta"); detail.sources.forEach(function (source) { var box = node("div"); box.append(node("small", "", source.type || "代码源"), node("strong", "", source.name), node("div", "dyx-muted", source.defaultBranch || source.repo || "-")); sources.append(box); }); dialog.body.append(sources);
    }
    dialog.body.append(node("h3", "", "最近运行"));
    if (!runs.items || !runs.items.length) dialog.body.append(empty("暂无运行记录", ""));
    else {
      var runList = node("div", "dyx-record-list");
      runs.items.forEach(function (run) {
        var card = node("article", "dyx-record");
        var head = node("div", "dyx-record-head");
        head.append(node("strong", "", "运行 #" + run.pipelineRunId), node("span", "dyx-badge " + statusClass(run.status), run.status || "-"));
        var meta = node("div", "dyx-record-meta");
        meta.append(node("span", "", "开始 " + formatDate(run.startTime)), node("span", "", "结束 " + formatDate(run.endTime)));
        var foot = node("div", "dyx-record-foot");
        foot.append(node("span", "dyx-muted", triggerLabel(run.triggerMode)), button("查看运行", "", function () { openPipelineRun(p, run); }));
        card.append(head, meta, foot); runList.append(card);
      });
      dialog.body.append(runList);
    }
    dialog.foot.textContent = ""; dialog.foot.append(button("关闭", "", dialog.close));
  }

  // 运行弹窗立即渲染：先给出备注与“确认运行”，分支读取成功后补充代码源控件，
  // 读取失败也不阻塞——可直接用流水线默认配置运行，或手动填写分支。
  function openRunPipeline(pipeline) {
    var dialog = modal("运行流水线：" + pipeline.name, true);
    var form = node("div", "dyx-form");
    var statusNote = node("div", "dyx-note", "正在读取代码源与分支…");
    var sourceFields = [];
    var manualBranchInput = null;
    var commentInput = input("textarea", "可选，填写本次运行备注");
    var commentField = field("运行备注", commentInput);
    form.append(commentField);
    dialog.body.append(statusNote, form);
    function confirmRun(event) {
      var runningBranches = {}; var branchModeBranches = []; var missingRepo = [];
      sourceFields.forEach(function (entry) {
        if (entry.source.isBranchMode) {
          if (entry.control.multiple) {
            Array.from(entry.control.selectedOptions).forEach(function (option) { var value = option.value.trim(); if (value) branchModeBranches.push(value); });
          } else {
            var manual = entry.control.value.trim();
            if (manual) branchModeBranches.push(manual);
          }
          return;
        }
        var value = entry.control.value.trim();
        if (!value) return;
        if (entry.source.repo) runningBranches[entry.source.repo] = value;
        else missingRepo.push(entry.source.name || "代码源");
      });
      if (manualBranchInput) { var manualValue = manualBranchInput.value.trim(); if (manualValue) branchModeBranches.push(manualValue); }
      if (missingRepo.length) toast("这些代码源未识别到仓库地址，本次运行将使用流水线默认分支：" + missingRepo.join("、"), true);
      var submit = event.currentTarget; submit.disabled = true;
      rpc("pipeline.run.create", rpcArgs({ pipelineId: pipeline.id, branchModeBranches: branchModeBranches, runningBranches: runningBranches, comment: commentInput.value })).then(function (result) {
        dialog.close(); toast("流水线已开始运行，实例 #" + result.pipelineRunId); loadPipelines();
      }).catch(function (error) { toast(error.message, true); }).finally(function () { submit.disabled = false; });
    }
    dialog.foot.textContent = ""; dialog.foot.append(button("取消", "", dialog.close), button("确认运行", "primary", confirmRun));
    rpc("pipeline.branches", rpcArgs({ pipelineId: pipeline.id })).then(function (sources) {
      statusNote.remove();
      (sources || []).forEach(function (source) {
        var branches = Array.from(new Set([source.defaultBranch].concat(source.branches || []).filter(Boolean)));
        var datalist = node("datalist");
        datalist.id = "dyx-branch-list-" + (++branchDatalistSeq);
        branches.forEach(function (branch) { var option = node("option", "", branch); option.value = branch; datalist.append(option); });
        form.insertBefore(datalist, commentField);
        var control;
        var sourceField;
        if (source.isBranchMode && branches.length) {
          control = node("select", "dyx-select");
          control.multiple = true;
          control.size = Math.min(5, Math.max(3, branches.length));
          branches.forEach(function (branch) { var option = node("option", "", branch); option.value = branch; option.selected = branch === source.defaultBranch; control.append(option); });
          control.setAttribute("aria-label", source.name + "运行分支");
          sourceField = field(source.name + " · 运行分支（可多选）", control);
          form.insertBefore(sourceField, commentField);
          var customInput = input("text", "列表里没有？手动输入分支名称", "");
          customInput.setAttribute("list", datalist.id);
          var addButton = button("添加分支", "", function () {
            var name = customInput.value.trim();
            if (!name) return;
            var option = Array.from(control.options).find(function (item) { return item.value === name; });
            if (!option) { option = node("option", "", name); option.value = name; control.append(option); }
            option.selected = true;
            customInput.value = "";
          });
          var customRow = node("div", "dyx-status-row");
          customRow.append(field("手动添加分支", customInput), addButton);
          form.insertBefore(customRow, commentField);
        } else {
          control = input("text", "留空使用流水线默认分支", source.defaultBranch || "");
          control.setAttribute("list", datalist.id);
          control.setAttribute("aria-label", source.name + "运行分支");
          sourceField = field(source.name + (source.isBranchMode ? " · 运行分支（手动输入）" : " · 运行分支"), control);
          form.insertBefore(sourceField, commentField);
        }
        if (source.warning) form.insertBefore(node("div", "dyx-note", source.warning), commentField);
        sourceFields.push({ source: source, control: control });
      });
      if (!sourceFields.length) form.insertBefore(empty("没有可配置的代码源", "将使用流水线默认配置运行。"), commentField);
    }).catch(function (error) {
      statusNote.textContent = "代码源与分支读取失败：" + error.message + "。可直接用流水线默认配置运行，或在下方手动填写分支。";
      manualBranchInput = input("text", "留空使用流水线默认分支", "");
      form.insertBefore(field("运行分支（手动输入，可选）", manualBranchInput), commentField);
    });
  }

  function openPipelineRun(pipeline, run) {
    var dialog = modal("运行 #" + run.pipelineRunId, true); dialog.body.append(empty("正在读取运行详情", pipeline.name));
    rpc("pipeline.run.get", rpcArgs({ pipelineId: pipeline.id, pipelineRunId: run.pipelineRunId })).then(function (detail) {
      dialog.body.textContent = "";
      var title = node("div", "dyx-detail-title"); title.append(node("span", "dyx-badge " + statusClass(detail.status), detail.status || "未知"), node("h2", "", pipeline.name + " · #" + detail.pipelineRunId)); dialog.body.append(title);
      var meta = node("div", "dyx-meta"); [["开始", formatDate(detail.startTime)], ["结束", formatDate(detail.endTime)], ["触发方式", triggerLabel(detail.triggerMode)]].forEach(function (pair) { var box = node("div"); box.append(node("small", "", pair[0]), node("span", "", pair[1])); meta.append(box); }); dialog.body.append(meta);
      dialog.body.append(node("h3", "", "阶段与任务"));
      var stages = flattenStages(detail.stages || []);
      if (!stages.length) dialog.body.append(empty("未返回阶段信息", ""));
      stages.forEach(function (stage) {
        var row = node("div", "dyx-stage"); row.append(node("span", "dyx-dot " + String(stage.status || "").toUpperCase()), node("span", "", (stage.level ? "  ".repeat(stage.level) : "") + (stage.name || "未命名任务")));
        var action = node("div", "dyx-actions"); action.append(node("span", "dyx-badge " + statusClass(stage.status), stage.status || "-"));
        if (stage.jobId) action.append(button("日志", "", function () { openJobLog(pipeline.id, detail.pipelineRunId, stage.jobId, stage.name); })); row.append(action); dialog.body.append(row);
      });
      if (detail.globalParams && detail.globalParams.length) {
        dialog.body.append(node("h3", "", "运行参数")); var pre = node("pre", "dyx-log", JSON.stringify(detail.globalParams, null, 2)); dialog.body.append(pre);
      }
      dialog.foot.textContent = ""; dialog.foot.append(button("关闭", "", dialog.close));
    }).catch(function (error) { dialog.body.textContent = ""; dialog.body.append(empty("读取失败", error.message)); });
  }

  function openJobLog(pipelineId, runId, jobId, title) {
    var dialog = modal((title || "任务") + " · 日志", true); var pre = node("pre", "dyx-log", "正在读取…"); dialog.body.append(pre);
    rpc("pipeline.log", rpcArgs({ pipelineId: pipelineId, pipelineRunId: runId, jobId: jobId })).then(function (value) { pre.textContent = value.content || "日志为空"; }).catch(function (error) { pre.textContent = error.message; });
    dialog.foot.append(button("关闭", "", dialog.close));
  }

  function triggerLabel(mode) {
    return ({ 1: "手动", 2: "定时", 3: "代码提交", 5: "流水线", 6: "Webhook" })[mode] || "-";
  }

  function flattenStages(stages) {
    var result = [];
    function visit(item, level) {
      if (!item || typeof item !== "object") return;
      var isJob = Boolean(item.jobId) || String(item.type || item.nodeType || "").toUpperCase() === "JOB";
      var jobId = item.jobId || (isJob ? item.id : "");
      result.push({ name: item.name || item.stageName || item.jobName || item.displayName, status: item.status, jobId: jobId, level: level });
      ["jobs", "children", "stages", "stageGroup"].forEach(function (key) { if (Array.isArray(item[key])) item[key].forEach(function (child) { visit(child, level + 1); }); });
    }
    stages.forEach(function (item) { visit(item, 0); }); return result;
  }

  // —— 概览：聚合待办与各域状态，作为打开工作台的默认落点 ——————————————————
  function loadDashboard() {
    if (!selectedProject()) { state.dashboard.loaded = true; render(); return; }
    var refresh = Promise.all([
      rpc("defect.notification.scan", rpcArgs({})).catch(function () { return null; }),
      rpc("pipelines.list", rpcArgs({ page: 1, pageSize: 20 })).catch(function () { return null; }),
      loadFlows().catch(function () { return null; }),
      rpc("policies.list", {}).then(function (result) {
        state.policies.items = result.items || [];
        state.policies.loaded = true;
        return state.policies.items;
      }).catch(function () { return null; })
    ]).then(function (values) {
      state.dashboard = { loaded: true, scan: values[0], pipelines: values[1] };
      render();
    });
    return refresh;
  }

  function renderDashboard() {
    var section = node("section", "dyx-section");
    var account = selectedAccount();
    var project = selectedProject();
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "概览"), node("p", "", account && project ? account.name + " · " + project.name : "配置账号与项目后，这里会聚合待办与各域状态。"));
    title.append(copy, button("刷新", "", loadDashboard));
    section.append(title);

    var pending = state.dashboard.scan && Array.isArray(state.dashboard.scan.items) ? state.dashboard.scan.items : [];
    var pipelineItems = state.dashboard.pipelines && state.dashboard.pipelines.items || [];
    var pipelineTotal = state.dashboard.pipelines && state.dashboard.pipelines.total || pipelineItems.length;
    var failedPipelines = pipelineItems.filter(function (item) { return statusClass(item.status) === "fail"; }).length;
    var runningPipelines = pipelineItems.filter(function (item) { return statusClass(item.status) === "run"; }).length;
    var flowsEnabled = state.flows.items.filter(function (item) { return item.on; }).length;
    var policiesEnabled = state.policies.items.filter(function (item) { return item.enabled; }).length;
    var binding = account && account.workspace || null;
    // 统计条：与各列表页同款固定宽度方格小卡，点击直达对应页签。
    var strip = node("div", "dyx-statstrip");
    strip.append(
      statTile({ label: "待处理缺陷", tone: pending.length ? "pending" : "", value: pending.length, hint: pending.length ? "待确认 / 再次打开" : "通知未开启或读取失败", onClick: function () { setTab("defects"); } }),
      statTile({ label: "全部流水线", value: pipelineTotal, hint: "读取 " + pipelineItems.length + " 条", onClick: function () { setTab("pipelines"); } }),
      statTile({ label: "运行中", tone: "run", value: runningPipelines, hint: "流水线", onClick: function () { setTab("pipelines"); } }),
      statTile({ label: "最近失败", tone: failedPipelines ? "fail" : "", value: failedPipelines, hint: failedPipelines ? "可交给自愈编排" : "暂无失败运行", onClick: function () { setTab("pipelines"); } }),
      statTile({ label: "启用的编排规则", tone: policiesEnabled ? "ok" : "", value: policiesEnabled, hint: state.policies.loaded ? "规则驱动缺陷自动处理" : "编排页可查看", onClick: function () { setTab("flows"); } }),
      statTile({ label: "DSH 工作区", tone: binding ? "ok" : "", value: binding ? "已绑定" : "未绑定", hint: binding ? (binding.title || binding.id) : "绑定后可一键处理缺陷", onClick: function () { setTab("overview"); } })
    );
    section.append(strip);

    if (pending.length) {
      var card = node("div", "dyx-card");
      var head = node("div", "dyx-card-head");
      var headCopy = node("div", "dyx-card-title");
      headCopy.append(node("h3", "", "待处理缺陷"), node("small", "", "来自缺陷通知的最新检查 · 共 " + pending.length + " 条"));
      head.append(headCopy, button("查看全部", "", function () { setTab("defects"); }));
      card.append(head);
      // 直接复用工作项页的方格卡片（状态下拉、负责人、标签与草稿/处理按钮），两页观感一致。
      card.append(defectTable(pending.slice(0, DASHBOARD_PREVIEW_LIMIT)));
      section.append(card);
    }

    var flowCard = node("div", "dyx-card");
    var flowHead = node("div", "dyx-card-head");
    var flowCopy = node("div", "dyx-card-title");
    flowCopy.append(node("h3", "", "流程编排"), node("small", "", state.flows.items.length ? "旧版画布 " + state.flows.items.length + " 条（只读） · 规则 " + policiesEnabled + " 条已启用" : "在编排页配置处理规则"));
    flowHead.append(flowCopy, button("管理规则", "primary", function () { setTab("flows"); }));
    flowCard.append(flowHead);
    if (!state.flows.items.length) flowCard.append(empty("没有旧版画布编排", "在「编排」页用规则驱动缺陷自动处理。"));
    else flowCard.append(flowGrid(state.flows.items.slice(0, DASHBOARD_PREVIEW_LIMIT)));
    section.append(flowCard);
    main.append(section);
  }

  // 概览里的编排卡片：启用状态着左轨，最近一次运行结果作徽章；点击直接打开该编排的画布。
  function flowGrid(items) {
    var wrap = node("div", "dyx-record-list dyx-tile-grid");
    items.forEach(function (flow) {
      var lastRun = flow.runs && flow.runs[0];
      var runKind = !lastRun ? "" : lastRun.status === "成功" ? "ok" : lastRun.status === "失败" ? "fail" : "run";
      var card = node("article", "dyx-record dyx-record-clickable dyx-tile-card" + (flow.on ? " tone-ok" : ""));
      function openFlow() {
        var index = state.flows.items.indexOf(flow);
        if (index >= 0) { state.flows.active = index; state.flows.sel = ""; state.flows.selEdge = -1; }
        state.flows.sub = "canvas";
        setTab("flows");
      }
      card.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        openFlow();
      });
      var head = node("div", "dyx-record-head");
      head.append(node("span", "dyx-badge " + (flow.on ? "ok" : ""), flow.on ? "已启用" : "未启用"), node("span", "dyx-badge " + runKind, lastRun ? lastRun.status : "未运行过"));
      var title = node("button", "dyx-link dyx-record-title", flow.name || "未命名编排");
      title.type = "button";
      title.title = flow.name || "未命名编排";
      title.addEventListener("click", openFlow);
      var meta = node("div", "dyx-record-meta");
      meta.append(node("span", "", (flow.nodes || []).length + " 个节点"));
      if (flow.trg) meta.append(node("span", "", "触发：" + flow.trg));
      if (flow.autoRun) meta.append(node("span", "", "缺陷自动触发"));
      var foot = node("div", "dyx-record-foot");
      var when = node("span", "dyx-muted", lastRun ? "最近运行 " + shortDateTime(lastRun.startedAt) : "尚未运行");
      if (lastRun) when.title = formatDate(lastRun.startedAt);
      var actions = node("div", "dyx-actions");
      actions.append(button("打开", "", openFlow));
      foot.append(when, actions);
      card.append(head, title, meta, foot);
      wrap.append(card);
    });
    return wrap;
  }

  // —— 代码 Codeup：仓库列表 + 分支 / 合并请求 ————————————————————————————
  function loadCodeRepos() {
    if (!selectedProject()) { state.code.loaded = true; render(); return; }
    return rpc("code.repos.list", rpcArgs({ page: state.code.page, pageSize: state.code.pageSize, search: state.code.keyword })).then(function (result) {
      state.code.repos = result.items || [];
      state.code.total = result.total || state.code.repos.length;
      state.code.page = result.page || state.code.page;
      state.code.pageSize = result.pageSize || state.code.pageSize;
      state.code.loaded = true;
      state.code.stale = Boolean(result.stale);
      state.code.cachedAt = result.cachedAt;
      render();
      if (result.stale) toast("代码库读取失败，展示缓存：" + (result.warning || ""), true);
    }).catch(function (error) {
      state.code.repos = [];
      state.code.loaded = true;
      state.code.error = error.message;
      render();
    });
  }

  function renderCode() {
    var section = node("section", "dyx-section");
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "代码"), node("p", "", "组织内的 Codeup 仓库；分支与合并请求按仓库查看，检测有严重问题的 MR 建议先修复再合入。"));
    title.append(copy, button("刷新", "", function () { state.code.loaded = false; loadCodeRepos(); }));
    section.append(title);
    if (!renderRequirement(section)) { main.append(section); return; }
    var items = state.code.repos || [];
    // 统计条：总数取服务端，活跃度计数来自当前页（按最近一次活动时间分段）。
    var weekMs = 7 * 24 * 3600 * 1000, monthMs = 30 * 24 * 3600 * 1000, now = Date.now();
    var activeWeek = 0, activeMonth = 0, idle = 0;
    items.forEach(function (repo) {
      var ts = dateValue(repo.lastActivityAt);
      if (!ts) idle++;
      else if (now - ts <= weekMs) activeWeek++;
      else if (now - ts <= monthMs) activeMonth++;
      else idle++;
    });
    var strip = node("div", "dyx-statstrip");
    strip.append(
      statTile({ label: "全部代码库", value: state.code.total || items.length, hint: "本页 " + items.length + " 条" }),
      statTile({ label: "7 天内活跃", tone: "ok", value: activeWeek, hint: "本页计数" }),
      statTile({ label: "30 天内活跃", value: activeMonth, hint: "本页计数" }),
      statTile({ label: "长期未活跃", tone: "fail", value: idle, hint: "本页计数" })
    );
    var card = node("div", "dyx-card");
    if (!state.code.loaded) card.append(empty("正在读取代码库", ""));
    else if (state.code.error) card.append(empty("代码库读取失败", state.code.error + "。请确认令牌具有“代码管理 → 只读”权限。"));
    else {
      var keyword = input("text", "仓库名称或路径", state.code.keyword);
      // 输入框内直接回车即查询，与流水线页一致。
      keyword.setAttribute("aria-label", "按名称搜索代码库");
      keyword.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { state.code.keyword = keyword.value.trim(); state.code.page = 1; loadCodeRepos(); }
      });
      function onRepoPage(next) { state.code.page = next; loadCodeRepos(); }
      function searchRepos() { state.code.keyword = keyword.value.trim(); state.code.page = 1; loadCodeRepos(); }
      function clearRepos() {
        if (!state.code.keyword && !keyword.value) return;
        state.code.keyword = ""; keyword.value = ""; state.code.page = 1; loadCodeRepos();
      }
      var filters = node("div", "dyx-pipeline-filters");
      filters.append(field("关键词", keyword), button("查询", "primary", searchRepos), button("清空", "", clearRepos));
      var toolbar = node("div", "dyx-list-toolbar");
      toolbar.append(filters, pager(state.code, onRepoPage));
      card.append(toolbar);
      if (state.code.stale) card.append(node("div", "dyx-stale", "云效暂时不可用，当前为 " + formatDate(state.code.cachedAt) + " 的缓存。"));
      if (!items.length) card.append(empty("暂无代码库", "当前令牌可见的组织内 Codeup 仓库会显示在这里。"));
      else card.append(repoGrid(items));
      card.append(pager(state.code, onRepoPage));
    }
    section.append(strip, card);
    main.append(section);
  }

  function repoGrid(items) {
    var wrap = node("div", "dyx-record-list dyx-tile-grid");
    items.forEach(function (repo) {
      var card = node("article", "dyx-record dyx-record-clickable dyx-tile-card");
      // 整卡点击打开仓库详情；按钮区域保持自身行为，不冒泡重复触发。
      card.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        openRepoDetail(repo);
      });
      var head = node("div", "dyx-record-head");
      head.append(node("span", "dyx-badge", repo.defaultBranch || "默认分支 -"));
      var title = node("button", "dyx-link dyx-record-title", repo.name || repo.path);
      title.type = "button";
      title.title = repo.name || repo.path;
      title.addEventListener("click", function () { openRepoDetail(repo); });
      var meta = node("div", "dyx-record-meta");
      meta.append(node("span", "", repo.path || repo.id));
      if (repo.description) meta.append(node("span", "", repo.description));
      var foot = node("div", "dyx-record-foot");
      var updated = node("span", "dyx-muted", "活跃 " + shortDateTime(repo.lastActivityAt));
      updated.title = "活跃 " + formatDate(repo.lastActivityAt);
      var actions = node("div", "dyx-actions");
      actions.append(button("打开", "", function () { openRepoDetail(repo); }));
      foot.append(updated, actions);
      card.append(head, title, foot);
      wrap.append(card);
    });
    return wrap;
  }

  function openRepoDetail(repo) {
    var dialog = modal("代码库：" + (repo.name || repo.path), true);
    dialog.body.append(empty("正在读取", "分支与合并请求"));
    var tabs = node("div", "dyx-nav");
    var body = node("div");
    var current = "mr";
    function renderTab(name) {
      current = name;
      Array.from(tabs.children).forEach(function (buttonEl) { buttonEl.classList.toggle("active", buttonEl.dataset.tab === name); });
      body.textContent = "";
      if (name === "branches") renderRepoBranches(dialog, repo, body);
      else renderRepoMrs(dialog, repo, body);
    }
    var mrTab = node("button", "active", "合并请求"); mrTab.type = "button"; mrTab.dataset.tab = "mr";
    var brTab = node("button", "", "分支"); brTab.type = "button"; brTab.dataset.tab = "branches";
    mrTab.addEventListener("click", function () { renderTab("mr"); });
    brTab.addEventListener("click", function () { renderTab("branches"); });
    tabs.append(mrTab, brTab);
    dialog.body.append(tabs, body);
    renderTab("mr");
    dialog.foot.textContent = "";
    dialog.foot.append(button("关闭", "", dialog.close));
  }

  function renderRepoBranches(dialog, repo, body) {
    body.textContent = "";
    body.append(empty("正在读取分支", ""));
    rpc("code.branches.list", rpcArgs({ repositoryId: repo.path || repo.id })).then(function (result) {
      body.textContent = "";
      if (result.warning) body.append(node("div", "dyx-note", result.warning));
      var branches = result.items || [];
      if (!branches.length) { body.append(empty("暂无分支", "")); return; }
      var list = node("div", "dyx-record-list");
      branches.slice(0, 100).forEach(function (name) {
        var row = node("article", "dyx-record");
        var head = node("div", "dyx-record-head");
        head.append(node("strong", "", name));
        if (name === repo.defaultBranch) head.append(node("span", "dyx-badge ok", "默认"));
        list.append(row.append(head));
      });
      body.append(list);
    }).catch(function (error) {
      body.textContent = "";
      body.append(empty("分支读取失败", error.message));
    });
  }

  function renderRepoMrs(dialog, repo, body) {
    body.textContent = "";
    body.append(empty("正在读取合并请求", ""));
    rpc("code.mrs.list", rpcArgs({ repositoryId: repo.path || repo.id, state: "opened" })).then(function (result) {
      body.textContent = "";
      if (result.stale) body.append(node("div", "dyx-stale", "合并请求读取失败，展示 " + formatDate(result.cachedAt) + " 的缓存。"));
      var items = result.items || [];
      if (!items.length) { body.append(empty("没有进行中的合并请求", "")); return; }
      var list = node("div", "dyx-record-list");
      items.forEach(function (mr) {
        var row = node("article", "dyx-record");
        var head = node("div", "dyx-record-head");
        head.append(node("strong", "", "!" + mr.id + " " + mr.title), node("span", "dyx-badge " + (mr.state === "opened" ? "run" : ""), mr.state || "-"));
        var meta = node("div", "dyx-record-meta");
        meta.append(node("span", "", (mr.sourceBranch || "?") + " → " + (mr.targetBranch || "?")));
        if (mr.authorName) meta.append(node("span", "", mr.authorName));
        var foot = node("div", "dyx-record-foot");
        var actions = node("div", "dyx-actions");
        actions.append(button("在云效中打开", "dyx-btn-sm", function () { toast("请在云效代码库页面处理该合并请求"); }));
        if (mr.state === "opened") {
          actions.append(button("合入 " + (mr.targetBranch || ""), "dyx-btn-sm primary", function () {
            if (!window.confirm("确认将 \"" + mr.title + "\" 合入 " + (mr.targetBranch || "目标分支") + "？")) return;
            setBusy(dialog.body, true);
            rpc("code.mr.merge", rpcArgs({ repositoryId: repo.path || repo.id, mergeRequestId: mr.id })).then(function () {
              toast("合并请求 !" + mr.id + " 已合入");
              dialog.close();
            }).catch(function (error) {
              toast(error.message + "。可到云效页面手动合入。", true);
            }).finally(function () { setBusy(dialog.body, false); });
          }));
        }
        foot.append(node("span", "dyx-muted", formatDate(mr.createdAt || mr.updatedAt)), actions);
        row.append(head, meta, foot);
        list.append(row);
      });
      body.append(list);
    }).catch(function (error) {
      body.textContent = "";
      body.append(empty("合并请求读取失败", error.message + "。当前组织的 Codeup 接口可能未开放该能力。"));
    });
  }

  // —— 测试管理 / 制品仓库 ————————————————————————————————————————————
  function loadTestPlans() {
    if (!selectedProject()) { state.tests.loaded = true; render(); return; }
    return rpc("tests.plans.list", rpcArgs({ page: state.tests.page, pageSize: state.tests.pageSize })).then(function (result) {
      state.tests.plans = result.items || [];
      state.tests.total = result.total || state.tests.plans.length;
      state.tests.page = result.page || state.tests.page;
      state.tests.pageSize = result.pageSize || state.tests.pageSize;
      state.tests.loaded = true;
      state.tests.stale = Boolean(result.stale);
      state.tests.cachedAt = result.cachedAt;
      render();
    }).catch(function (error) {
      state.tests.plans = [];
      state.tests.loaded = true;
      state.tests.error = error.message;
      render();
    });
  }

  function renderTests() {
    var section = node("section", "dyx-section");
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "测试"), node("p", "", "组织内可见的测试计划与用例通过情况；编排里的测试卡点可按通过率决定是否继续。"));
    title.append(copy, button("刷新", "", function () { state.tests.loaded = false; loadTestPlans(); }));
    section.append(title);
    if (!renderRequirement(section)) { main.append(section); return; }
    var items = state.tests.plans || [];
    // 统计条：总数取服务端，状态计数来自当前页。
    var running = 0, done = 0, other = 0;
    items.forEach(function (plan) {
      var normalized = String(plan.status || "").trim();
      if (normalized === "进行中") running++;
      else if (normalized && normalized !== "-") done++;
      else other++;
    });
    var strip = node("div", "dyx-statstrip");
    strip.append(
      statTile({ label: "全部计划", value: state.tests.total || items.length, hint: "本页 " + items.length + " 条" }),
      statTile({ label: "进行中", tone: "run", value: running, hint: "本页计数" }),
      statTile({ label: "已完成", tone: "ok", value: done, hint: "本页计数" }),
      statTile({ label: "其他状态", value: other, hint: "本页计数" })
    );
    var card = node("div", "dyx-card");
    if (!state.tests.loaded) card.append(empty("正在读取测试计划", ""));
    else if (state.tests.error) card.append(empty("测试计划读取失败", state.tests.error + "。请检查个人访问令牌是否勾选「测试管理」读权限后重试。"));
    else {
      function onPlanPage(next) { state.tests.page = next; loadTestPlans(); }
      var toolbar = node("div", "dyx-list-toolbar");
      toolbar.append(node("div"), pager(state.tests, onPlanPage));
      card.append(toolbar);
      if (state.tests.stale) card.append(node("div", "dyx-stale", "云效暂时不可用，当前为 " + formatDate(state.tests.cachedAt) + " 的缓存。"));
      if (!items.length) card.append(empty("暂无测试计划", ""));
      else card.append(planGrid(items));
      card.append(pager(state.tests, onPlanPage));
    }
    section.append(strip, card);
    main.append(section);
  }

  // 测试计划方格卡片：进行中/已完成用左轨着色，通过率进度条占满卡片底部。
  function planGrid(items) {
    var wrap = node("div", "dyx-record-list dyx-tile-grid");
    items.forEach(function (plan) {
      var kind = String(plan.status || "").trim() === "进行中" ? "run" : "ok";
      var card = node("article", "dyx-record dyx-tile-card tone-" + kind);
      var head = node("div", "dyx-record-head");
      head.append(node("span", "dyx-badge", plan.id ? "#" + plan.id : "测试计划"), node("span", "dyx-badge " + kind, plan.status || "-"));
      var title = node("div", "dyx-record-title", plan.name || "未命名测试计划");
      title.title = plan.name || "未命名测试计划";
      var total = plan.caseTotal || 0;
      var passed = plan.casePassed || 0;
      var rate = total ? Math.round((passed / total) * 100) : null;
      var meta = node("div", "dyx-record-meta");
      meta.append(node("span", "", total ? passed + "/" + total + " 用例通过" : "用例数未知"));
      if (plan.caseFailed) meta.append(node("span", "", "失败 " + plan.caseFailed));
      if (plan.ownerName) meta.append(node("span", "", plan.ownerName));
      var progress = node("div", "dyx-pbar");
      var fill = node("i");
      fill.style.width = (rate === null ? 0 : rate) + "%";
      fill.style.background = rate !== null && rate < 90 ? "var(--dyx-warn)" : "var(--dyx-ok)";
      progress.append(fill);
      var foot = node("div", "dyx-record-foot");
      foot.append(progress, node("span", "dyx-muted", rate === null ? "通过率 -" : "通过率 " + rate + "% · 卡点 90%"));
      card.append(head, title, meta, foot);
      wrap.append(card);
    });
    return wrap;
  }

  function loadPackageRepos() {
    if (!selectedProject()) { state.packages.loaded = true; render(); return; }
    return rpc("packages.repos.list", rpcArgs({ page: state.packages.page, pageSize: state.packages.pageSize })).then(function (result) {
      state.packages.repos = result.items || [];
      state.packages.total = result.total || state.packages.repos.length;
      state.packages.page = result.page || state.packages.page;
      state.packages.pageSize = result.pageSize || state.packages.pageSize;
      state.packages.loaded = true;
      state.packages.stale = Boolean(result.stale);
      state.packages.cachedAt = result.cachedAt;
      render();
    }).catch(function (error) {
      state.packages.repos = [];
      state.packages.loaded = true;
      state.packages.error = error.message;
      render();
    });
  }

  // 制品库类型粗分：语言包 / 镜像与 Charts / 其他，用于统计条计数。
  function packageRepoKind(type) {
    var normalized = String(type || "").trim().toUpperCase();
    if (["MAVEN", "NPM", "PYPI", "NUGET", "COMPOSER", "GO", "GOLANG", "CARGO", "CONAN", "GEM", "HEX", "COCOAPODS"].indexOf(normalized) >= 0) return "lang";
    if (["DOCKER", "OCI", "HELM", "CHART", "IMAGE"].indexOf(normalized) >= 0) return "image";
    return "other";
  }

  function renderPackages() {
    var section = node("section", "dyx-section");
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "制品"), node("p", "", "组织内的制品仓库；制品版本仍以云效页面为准，这里的列表用于快速确认仓库可用性。"));
    title.append(copy, button("刷新", "", function () { state.packages.loaded = false; loadPackageRepos(); }));
    section.append(title);
    if (!renderRequirement(section)) { main.append(section); return; }
    var items = state.packages.repos || [];
    // 统计条：总数取服务端，类型计数来自当前页。
    var lang = 0, image = 0, other = 0;
    items.forEach(function (repo) {
      var kind = packageRepoKind(repo.type);
      if (kind === "lang") lang++;
      else if (kind === "image") image++;
      else other++;
    });
    var strip = node("div", "dyx-statstrip");
    strip.append(
      statTile({ label: "全部制品库", value: state.packages.total || items.length, hint: "本页 " + items.length + " 条" }),
      statTile({ label: "语言包", tone: "ok", value: lang, hint: "本页计数" }),
      statTile({ label: "镜像与 Charts", tone: "run", value: image, hint: "本页计数" }),
      statTile({ label: "其他类型", value: other, hint: "本页计数" })
    );
    var card = node("div", "dyx-card");
    if (!state.packages.loaded) card.append(empty("正在读取制品仓库", ""));
    else if (state.packages.error) card.append(empty("制品仓库读取失败", state.packages.error + "。当前组织的制品 OpenAPI 可能未开放。"));
    else {
      function onPackagePage(next) { state.packages.page = next; loadPackageRepos(); }
      var toolbar = node("div", "dyx-list-toolbar");
      toolbar.append(node("div"), pager(state.packages, onPackagePage));
      card.append(toolbar);
      if (state.packages.stale) card.append(node("div", "dyx-stale", "云效暂时不可用，当前为 " + formatDate(state.packages.cachedAt) + " 的缓存。"));
      if (!items.length) card.append(empty("暂无制品仓库", ""));
      else card.append(packageGrid(items));
      card.append(pager(state.packages, onPackagePage));
    }
    section.append(strip, card);
    main.append(section);
  }

  function packageGrid(items) {
    var wrap = node("div", "dyx-record-list dyx-tile-grid");
    items.forEach(function (repo) {
      var kind = packageRepoKind(repo.type);
      var tone = kind === "lang" ? " tone-ok" : kind === "image" ? " tone-run" : "";
      var card = node("article", "dyx-record dyx-tile-card" + tone);
      var head = node("div", "dyx-record-head");
      head.append(node("span", "dyx-badge", repo.type || "制品库"));
      var title = node("div", "dyx-record-title", repo.name || "未命名制品库");
      title.title = repo.name || "未命名制品库";
      var meta = node("div", "dyx-record-meta");
      if (repo.description) meta.append(node("span", "", repo.description));
      var foot = node("div", "dyx-record-foot");
      foot.append(node("span", "dyx-muted", repo.createdAt ? "创建于 " + formatDate(repo.createdAt) : ""));
      card.append(head, title, meta, foot);
      wrap.append(card);
    });
    return wrap;
  }

  // —— 流程编排：画布 + 客户端运行引擎 ——————————————————————————————————
  // 画布定义持久化在数据文件（flows.*）；运行由客户端驱动，动作直接复用
  // 已有能力：DSH 会话、工作项更新、评论、系统通知、流水线运行。
  // MR / 代码检测 / 测试计划 / 部署暂作为人工检查点（等待确认后继续）。
  function activeFlow() {
    return state.flows.items[state.flows.active] || null;
  }

  function loadFlows() {
    return rpc("flows.list", {}).then(function (result) {
      state.flows.items = (result.items || []).map(hydrateFlow);
      state.flows.loaded = true;
      if (state.flows.active >= state.flows.items.length) state.flows.active = 0;
      if (state.tab === "flows" || state.tab === "dashboard") render();
      return state.flows.items;
    });
  }

  // —— 编排：处理规则 / 运行台账 / 引擎状态（宿主引擎驱动，客户端只做展示与裁决）——
  function loadPolicies() {
    return rpc("policies.list", {}).then(function (result) {
      state.policies.items = result.items || [];
      state.policies.loaded = true;
      if (state.tab === "flows") render();
      return state.policies.items;
    }).catch(function (error) {
      toast("规则读取失败：" + error.message, true);
    });
  }

  function loadRuns() {
    return rpc("runs.list", rpcArgs({ status: state.runs.status })).then(function (result) {
      state.runs.items = result.items || [];
      state.runs.loaded = true;
      if (state.tab === "flows") render();
      return state.runs.items;
    }).catch(function (error) {
      toast("运行记录读取失败：" + error.message, true);
    });
  }

  function loadEngineStatus() {
    return rpc("engine.status", {}).then(function (status) {
      state.engine.status = status;
      if (state.tab === "flows") render();
      return status;
    }).catch(function () {
      state.engine.status = null;
      return null;
    });
  }

  var flowsPollTimer = null;
  function startFlowsPolling() {
    if (flowsPollTimer) return;
    // 编排页可见时轮询引擎状态，让"运行中/待确认"计数与运行状态自动刷新。
    flowsPollTimer = setInterval(function () {
      if (!root || state.tab !== "flows") return;
      Promise.all([loadEngineStatus(), rpc("runs.list", rpcArgs({ status: state.runs.status }))]).then(function (values) {
        state.runs.items = values[1].items || [];
        render();
      }).catch(function () {});
    }, 15000);
  }

  function stopFlowsPolling() {
    if (flowsPollTimer) { clearInterval(flowsPollTimer); flowsPollTimer = null; }
  }

  function setFlowsSub(sub) {
    state.flows.sub = sub;
    render();
    if (sub === "runs") loadRuns();
    if (sub === "rules" && !state.policies.loaded) loadPolicies();
  }

  // —— 编排页：规则驱动的缺陷自动处理 ————————————————————————————————————————
  // 执行全部在宿主引擎；客户端只负责规则编辑、运行台账展示与"待确认"裁决。
  var POLICY_MODE_META = {
    "auto-submit": { label: "全自动修复", tone: "ok", hint: "智能体在绑定工作区修复、验证并提交 MR" },
    "analyze-confirm": { label: "先析后确认", tone: "run", hint: "只读诊断出根因与方案，批准后同一会话实施" },
    "notify": { label: "仅通知", tone: "", hint: "只提醒负责人，不做任何自动处理" }
  };
  var RUN_STATUS_META = {
    queued: ["排队中", "run"], fetching: ["读取缺陷", "run"], classifying: ["规则匹配", "run"],
    "agent-running": ["智能体处理中", "run"], "awaiting-confirm": ["待确认", "wait"],
    submitting: ["提交中", "run"], writeback: ["回写中", "run"],
    succeeded: ["成功", "ok"], "needs-human": ["需人工", "fail"], failed: ["失败", "fail"],
    skipped: ["已跳过", "skip"], canceled: ["已取消", "skip"], interrupted: ["已中断", "fail"]
  };
  var OUTCOME_META = { fixed: "已修复", analyzed: "已分析", "needs-human": "需人工", "not-a-bug": "非缺陷", "cannot-reproduce": "无法复现", blocked: "受阻" };
  var POLICY_TEMPLATES = [
    {
      name: "样式 / 缺字段自动修复",
      mode: "auto-submit",
      match: { keywordsAny: ["样式", "错位", "字体", "颜色", "间距", "字段缺失", "缺少字段", "未显示", "不展示", "文案"], keywordsNone: ["支付", "结算", "退款"], priorityCeiling: "P2", typeAny: [] },
      instructions: "只改前端展示与字段映射层，不改接口契约；缺失字段优先从现有接口返回/DTO 中取，取不到则以 needs-human 报告；样式遵循项目现有 UI 规范；修复说明附修改前后对照。",
      submit: { baseBranch: "", branchPattern: "fix/{serial}-{slug}", push: true, createMr: true, mrTarget: "", mrTitle: "fix({serial}): {subject}", verifyCommands: [], maxChangedFiles: 30, forbiddenPaths: [] },
      writeback: { comment: true, statusOnSuccess: "", statusOnConfirm: "", statusOnFailure: "", assigneeOnFailure: "" }
    },
    {
      name: "C 端后台逻辑分析确认",
      mode: "analyze-confirm",
      match: { keywordsAny: ["接口", "数据不对", "报错", "500", "逻辑", "状态流转", "计算", "超时"], keywordsNone: [], priorityCeiling: "", typeAny: ["缺陷"] },
      instructions: "本次只读诊断：定位根因、给出修复方案（含涉及文件清单）与风险影响面，不改任何代码；结论需包含验证思路。",
      submit: { baseBranch: "", branchPattern: "fix/{serial}-{slug}", push: true, createMr: true, mrTarget: "", mrTitle: "fix({serial}): {subject}", verifyCommands: [], maxChangedFiles: 30, forbiddenPaths: [] },
      writeback: { comment: true, statusOnSuccess: "", statusOnConfirm: "", statusOnFailure: "", assigneeOnFailure: "" }
    }
  ];

  function policyModeBadge(mode) {
    var meta = POLICY_MODE_META[mode] || POLICY_MODE_META["analyze-confirm"];
    return node("span", "dyx-badge " + meta.tone, meta.label);
  }

  function runBadge(status) {
    var meta = RUN_STATUS_META[status] || [status || "未知", ""];
    return node("span", "dyx-badge " + meta[1], meta[0]);
  }

  function policyScopeLabel(policy) {
    var scope = policy.scope || {};
    if (!scope.accountId && !scope.projectId) return "跟随当前账号与项目";
    var account = (state.server.accounts || []).find(function (item) { return item.id === scope.accountId; });
    var project = account && account.selectedProject;
    return (account ? account.name : "指定账号") + " · " + (scope.projectId ? (project && project.id === scope.projectId ? project.name : scope.projectId) : "当前项目");
  }

  function policyMatchSummary(policy) {
    var match = policy.match || {};
    var parts = [];
    if ((match.keywordsAny || []).length) parts.push("含：" + match.keywordsAny.slice(0, 4).join("、") + (match.keywordsAny.length > 4 ? " 等" : ""));
    if ((match.keywordsNone || []).length) parts.push("排除：" + match.keywordsNone.slice(0, 3).join("、") + (match.keywordsNone.length > 3 ? " 等" : ""));
    if (match.priorityCeiling) parts.push("优先级 ≤ " + match.priorityCeiling);
    if ((match.typeAny || []).length) parts.push("类型：" + match.typeAny.join("、"));
    return parts.join(" · ");
  }

  function renderFlows() {
    var section = node("section", "dyx-section dyx-flow-section");
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "编排"), node("p", "", "输入处理规则后由宿主引擎自动执行：命中规则的缺陷按模式分级处理——样式/缺字段全自动修复提交，后台逻辑先析后确认，其余仅通知；结果与 MR 自动回写缺陷。"));
    title.append(copy);
    section.append(title);
    if (!renderRequirement(section)) { main.append(section); return; }
    var sub = state.flows.sub || "rules";
    var runsAll = state.runs.items;
    var inboxCount = runsAll.filter(function (run) { return run.status === "awaiting-confirm"; }).length;
    var engineStatus = state.engine.status;
    var activeCount = engineStatus ? engineStatus.active.length + (engineStatus.queued || 0) : 0;
    var todayKey = new Date().toDateString();
    var todayCount = runsAll.filter(function (run) {
      return ["succeeded", "needs-human", "failed"].indexOf(run.status) >= 0 && run.endedAt && new Date(run.endedAt).toDateString() === todayKey;
    }).length;
    var openCount = runsAll.filter(function (run) { return run.status === "failed" || run.status === "needs-human"; }).length;
    var enabledCount = state.policies.items.filter(function (item) { return item.enabled; }).length;
    var strip = node("div", "dyx-statstrip");
    strip.append(
      statTile({ label: "启用规则", tone: enabledCount ? "ok" : "", value: enabledCount, hint: "共 " + state.policies.items.length + " 条规则", onClick: function () { setFlowsSub("rules"); } }),
      statTile({ label: "运行中", tone: activeCount ? "run" : "", value: activeCount, hint: engineStatus && engineStatus.available ? "宿主引擎" : "引擎不可用", onClick: function () { setFlowsSub("runs"); } }),
      statTile({ label: "待确认", tone: inboxCount ? "pending" : "", value: inboxCount, hint: "分析完成待裁决", onClick: function () { setFlowsSub("inbox"); } }),
      statTile({ label: "今日完成", value: todayCount, hint: "成功 / 需人工 / 失败", onClick: function () { setFlowsSub("runs"); } }),
      statTile({ label: "需处理", tone: openCount ? "fail" : "", value: openCount, hint: "失败与需人工，可重试", onClick: function () { setFlowsSub("runs"); } })
    );
    section.append(strip);
    var tabs = node("div", "dyx-flow-subtabs");
    [["rules", "规则"], ["runs", "运行记录"], ["inbox", "待确认" + (inboxCount ? "（" + inboxCount + "）" : "")], ["canvas", "旧版画布"]].forEach(function (item) {
      var tab = node("button", item[0] === sub ? "active" : "");
      tab.type = "button";
      tab.append(node("span", "", item[1]));
      tab.addEventListener("click", function () { setFlowsSub(item[0]); });
      tabs.append(tab);
    });
    section.append(tabs);
    if (sub === "rules") renderPoliciesPage(section);
    else if (sub === "runs") renderRunsPage(section);
    else if (sub === "inbox") renderInboxPage(section);
    else renderLegacyCanvasPage(section);
    main.append(section);
    // 连线绘制依赖 DOM 尺寸，必须在挂载后执行。
    if (sub === "canvas") drawFlowEdges();
  }

  function renderPoliciesPage(section) {
    var actions = node("div", "dyx-actions");
    actions.append(button("刷新", "", function () { loadPolicies(); }));
    POLICY_TEMPLATES.forEach(function (template) {
      actions.append(button("模板：" + template.name, "", function () { openPolicyDrawer(null, template); }));
    });
    actions.append(button("新建空白规则", "primary", function () { openPolicyDrawer(null, null); }));
    section.append(actions);
    if (!state.policies.items.length) {
      var starter = node("div", "dyx-card");
      starter.append(empty("还没有处理规则", "从上面的模板开始；规则保存后引擎按周期自动扫描命中缺陷。命中的先后顺序即列表顺序（上移/下移调整）。"));
      section.append(starter);
      return;
    }
    var grid = node("div", "dyx-record-list dyx-tile-grid");
    state.policies.items.forEach(function (policy, index) { grid.append(policyCard(policy, index)); });
    section.append(grid);
  }

  function policyCard(policy, index) {
    var card = node("article", "dyx-record dyx-record-clickable dyx-tile-card" + (policy.enabled ? " tone-ok" : ""));
    var head = node("div", "dyx-record-head");
    head.append(policyModeBadge(policy.mode), node("span", "dyx-badge", policy.enabled ? "已启用" : "已停用"));
    var title = node("button", "dyx-link dyx-record-title", policy.name);
    title.type = "button";
    title.title = policy.name;
    title.addEventListener("click", function () { openPolicyDrawer(policy, null); });
    var meta = node("div", "dyx-record-meta");
    meta.append(node("span", "", policyScopeLabel(policy) + " · 每 " + policy.trigger.pollMinutes + " 分钟"));
    var matchText = policyMatchSummary(policy);
    if (matchText) meta.append(node("span", "", matchText));
    if (policy.instructions) meta.append(node("span", "", String(policy.instructions).slice(0, 60) + (String(policy.instructions).length > 60 ? "…" : "")));
    var lastRun = state.runs.items.find(function (run) { return run.policyId === policy.id; });
    var foot = node("div", "dyx-record-foot");
    foot.append(node("span", "dyx-muted", lastRun
      ? "最近 " + runBadge(lastRun.status).textContent + " · " + shortDateTime(lastRun.startedAt) + " · " + (lastRun.serial || "")
      : "暂无运行"));
    var actions = node("div", "dyx-actions");
    var toggle = input("checkbox");
    toggle.checked = Boolean(policy.enabled);
    toggle.setAttribute("aria-label", "启用规则");
    var toggleWrap = node("label", "dyx-notify-toggle");
    toggleWrap.append(node("span", "", "启用"), toggle);
    toggle.addEventListener("change", function () {
      var next = toggle.checked;
      setBusy(card, true);
      rpc("policies.save", { policy: Object.assign({}, policy, { enabled: next }) }).then(function () {
        toast(next ? "规则已启用，引擎将按周期扫描" : "规则已停用");
        loadPolicies();
      }).catch(function (error) {
        toast("保存失败：" + error.message, true);
      }).then(function () { setBusy(card, false); });
    });
    actions.append(toggleWrap);
    actions.append(button("试运行", "", function () { testPolicyMatches(policy); }));
    actions.append(button("编辑", "", function () { openPolicyDrawer(policy, null); }));
    if (index > 0) actions.append(button("↑", "", function () { movePolicy(index, index - 1); }));
    if (index < state.policies.items.length - 1) actions.append(button("↓", "", function () { movePolicy(index, index + 1); }));
    actions.append(button("删除", "danger", function () {
      if (!window.confirm("删除规则「" + policy.name + "」？历史运行记录保留。")) return;
      rpc("policies.delete", { policyId: policy.id }).then(function () {
        toast("规则已删除");
        loadPolicies();
      }).catch(function (error) { toast("删除失败：" + error.message, true); });
    }));
    foot.append(actions);
    card.append(head, title, meta, foot);
    return card;
  }

  function movePolicy(from, to) {
    var ids = state.policies.items.map(function (item) { return item.id; });
    var moved = ids.splice(from, 1)[0];
    ids.splice(to, 0, moved);
    rpc("policies.reorder", { ids: ids }).then(function () { loadPolicies(); }).catch(function (error) {
      toast("排序失败：" + error.message, true);
    });
  }

  // 规则编辑抽屉：分"触发 / 匹配 / 处理方式 / 提交与回写"四组；保存前宿主会校验
  // MR 仓库 ID 与回写状态名。scope 跟随当前账号/项目时存空值。
  function openPolicyDrawer(policy, template) {
    var isDraft = !policy;
    var base = policy ? JSON.parse(JSON.stringify(policy)) : JSON.parse(JSON.stringify(Object.assign({
      id: "",
      name: "",
      enabled: true,
      scope: { accountId: "", projectId: "" },
      trigger: { statusKinds: ["pending", "reopened"], assigneeId: "", pollMinutes: 5, backfill: false },
      match: { keywordsAny: [], keywordsNone: [], priorityCeiling: "", typeAny: [] },
      mode: "analyze-confirm",
      instructions: "",
      agent: { preset: "", permissionPreset: "", model: "", maxMinutes: 30 },
      submit: { repoId: "", repoPath: "", baseBranch: "", branchPattern: "fix/{serial}-{slug}", push: true, createMr: true, mrTarget: "", mrTitle: "fix({serial}): {subject}", pipelineId: "", verifyCommands: [], maxChangedFiles: 30, forbiddenPaths: [] },
      writeback: { comment: true, statusOnSuccess: "", statusOnConfirm: "", statusOnFailure: "", assigneeOnFailure: "" },
      concurrency: 2
    }, template || {})));
    var dialog = modal(isDraft ? "新建处理规则" : "编辑规则：" + policy.name, true);
    var followScope = !base.scope.accountId && !base.scope.projectId;

    function group(titleText) {
      var box = node("fieldset", "dyx-policy-group");
      box.append(node("legend", "", titleText));
      return box;
    }
    function textField(labelText, value, placeholder, onChange) {
      var control = input("text", placeholder || "", value || "");
      control.addEventListener("change", function () { onChange(control.value.trim()); });
      return field(labelText, control);
    }
    function numberField(labelText, value, min, max, onChange) {
      var control = input("number", "", String(value == null ? "" : value));
      control.min = String(min);
      control.max = String(max);
      control.addEventListener("change", function () { onChange(clampNumber(control.value, min, max)); });
      return field(labelText, control);
    }
    function areaField(labelText, value, placeholder, onChange) {
      var control = input("textarea", placeholder || "", (value || []).join("，"));
      control.rows = 2;
      control.addEventListener("change", function () {
        onChange(control.value.split(/[\n,，;；]/).map(function (item) { return item.trim(); }).filter(Boolean));
      });
      return field(labelText, control);
    }
    function checkField(labelText, checked, onChange) {
      var control = input("checkbox");
      control.checked = Boolean(checked);
      control.addEventListener("change", function () { onChange(control.checked); });
      var wrap = node("label", "dyx-notify-toggle");
      wrap.append(node("span", "", labelText), control);
      return wrap;
    }
    function selectField(labelText, options, value, onChange) {
      var control = node("select", "dyx-select");
      options.forEach(function (option) {
        var element = node("option", "", option.label);
        element.value = option.value;
        if (option.value === value) element.selected = true;
        control.append(element);
      });
      control.addEventListener("change", function () { onChange(control.value); });
      return field(labelText, control);
    }
    function statusNameOptions() {
      return [{ value: "", label: "（不流转）" }].concat((state.defectStatusOptions || []).map(function (item) {
        return { value: item.name, label: item.name };
      }));
    }
    function memberOptions() {
      return [{ value: "", label: "（不变更）" }].concat((state.defectMembers || []).map(function (item) {
        return { value: item.id, label: item.name };
      }));
    }

    var head1 = group("触发范围");
    var followToggle = checkField("跟随当前账号与项目", followScope, function (checked) {
      followScope = checked;
      scopeRows.forEach(function (row) { row.style.display = checked ? "none" : ""; });
    });
    var accountOptions = [{ value: "", label: "（选择账号）" }].concat((state.server.accounts || []).map(function (account) {
      return { value: account.id, label: account.name };
    }));
    var projectRow = textField("项目 ID（留空取该账号当前项目）", base.scope.projectId, "", function (value) { base.scope.projectId = value; });
    var accountRow = selectField("云效账号", accountOptions, base.scope.accountId, function (value) { base.scope.accountId = value; });
    var scopeRows = [accountRow, projectRow];
    scopeRows.forEach(function (row) { row.style.display = followScope ? "none" : ""; });
    head1.append(followToggle, accountRow, projectRow);
    var kindRow = node("div", "dyx-field");
    kindRow.append(node("label", "", "触发状态"));
    var kindWrap = node("div", "dyx-actions");
    [["pending", "待确认"], ["reopened", "再次打开"]].forEach(function (item) {
      kindWrap.append(checkField(item[1], (base.trigger.statusKinds || []).indexOf(item[0]) >= 0, function (checked) {
        var kinds = base.trigger.statusKinds || [];
        if (checked && kinds.indexOf(item[0]) < 0) kinds.push(item[0]);
        if (!checked) base.trigger.statusKinds = kinds.filter(function (kind) { return kind !== item[0]; });
      }));
    });
    kindRow.append(kindWrap);
    head1.append(kindRow);
    head1.append(numberField("轮询间隔（分钟）", base.trigger.pollMinutes, 1, 1440, function (value) { base.trigger.pollMinutes = value; }));
    head1.append(checkField("处理存量缺陷（启用规则时已存在的也处理）", base.trigger.backfill, function (checked) { base.trigger.backfill = checked; }));

    var head2 = group("匹配条件（全部满足才命中）");
    head2.append(areaField("标题/描述包含关键词（任一）", base.match.keywordsAny, "样式，字段缺失，未显示", function (value) { base.match.keywordsAny = value; }));
    head2.append(areaField("排除关键词（命中则不处理）", base.match.keywordsNone, "支付，结算", function (value) { base.match.keywordsNone = value; }));
    head2.append(selectField("优先级上限", [
      { value: "", label: "（不限）" },
      { value: "P0", label: "P0" }, { value: "P1", label: "P0-P1" },
      { value: "P2", label: "P0-P2" }, { value: "P3", label: "P0-P3" }
    ], base.match.priorityCeiling, function (value) { base.match.priorityCeiling = value; }));
    head2.append(areaField("工作项类型（留空不限）", base.match.typeAny, "缺陷", function (value) { base.match.typeAny = value; }));

    var head3 = group("处理方式");
    var modeRow = node("div", "dyx-field");
    modeRow.append(node("label", "", "模式"));
    var modeWrap = node("div", "dyx-actions");
    Object.keys(POLICY_MODE_META).forEach(function (mode) {
      modeWrap.append(checkField(POLICY_MODE_META[mode].label, base.mode === mode, function (checked) {
        if (checked) {
          base.mode = mode;
          Array.from(modeWrap.querySelectorAll("input")).forEach(function (control) { control.checked = control.parentNode.textContent.indexOf(POLICY_MODE_META[mode].label) >= 0; });
        }
      }));
    });
    modeRow.append(modeWrap);
    head3.append(modeRow, node("div", "dyx-note", POLICY_MODE_META[base.mode] ? POLICY_MODE_META[base.mode].hint : ""));
    var instructions = input("textarea", "写给智能体的自由文本规则，会原样注入并最高优先级遵守", base.instructions);
    instructions.rows = 4;
    instructions.addEventListener("change", function () { base.instructions = instructions.value; });
    head3.append(field("处理规则（注入智能体提示词）", instructions));
    head3.append(numberField("智能体超时（分钟）", base.agent.maxMinutes, 1, 720, function (value) { base.agent.maxMinutes = value; }));
    head3.append(textField("权限预设（留空自动选择无审批写入预设）", base.agent.permissionPreset, "auto-fix", function (value) { base.agent.permissionPreset = value; }));

    var head4 = group("提交与回写");
    head4.append(textField("Codeup 仓库数字 ID（创建 MR 必填）", base.submit.repoId, "创建合并请求接口要求数字 ID", function (value) { base.submit.repoId = value; }));
    head4.append(textField("基分支（留空用仓库默认分支）", base.submit.baseBranch, "develop", function (value) { base.submit.baseBranch = value; }));
    head4.append(textField("分支名模板", base.submit.branchPattern, "fix/{serial}-{slug}", function (value) { base.submit.branchPattern = value; }));
    head4.append(textField("MR 目标分支（留空用仓库默认分支）", base.submit.mrTarget, "develop", function (value) { base.submit.mrTarget = value; }));
    head4.append(textField("MR 标题模板", base.submit.mrTitle, "fix({serial}): {subject}", function (value) { base.submit.mrTitle = value; }));
    head4.append(areaField("验证命令（逐条执行，失败不建 MR）", base.submit.verifyCommands, "pnpm lint，pnpm typecheck", function (value) { base.submit.verifyCommands = value; }));
    head4.append(numberField("改动文件数上限", base.submit.maxChangedFiles, 1, 1000, function (value) { base.submit.maxChangedFiles = value; }));
    head4.append(areaField("禁改路径（glob，命中即转人工）", base.submit.forbiddenPaths, "**/payment/**，.github/**", function (value) { base.submit.forbiddenPaths = value; }));
    head4.append(checkField("结果评论回写到缺陷", base.writeback.comment, function (checked) { base.writeback.comment = checked; }));
    head4.append(selectField("成功后状态流转到", statusNameOptions(), base.writeback.statusOnSuccess, function (value) { base.writeback.statusOnSuccess = value; }));
    head4.append(selectField("分析完成后状态流转到（先析后确认）", statusNameOptions(), base.writeback.statusOnConfirm, function (value) { base.writeback.statusOnConfirm = value; }));
    head4.append(selectField("失败后状态流转到", statusNameOptions(), base.writeback.statusOnFailure, function (value) { base.writeback.statusOnFailure = value; }));
    head4.append(selectField("失败后改负责人为", memberOptions(), base.writeback.assigneeOnFailure, function (value) { base.writeback.assigneeOnFailure = value; }));

    var form = node("div", "dyx-policy-form");
    var nameControl = input("text", "规则名称", base.name);
    nameControl.addEventListener("change", function () { base.name = nameControl.value.trim(); });
    form.append(field("规则名称", nameControl), head1, head2, head3, head4);
    dialog.body.append(node("div", "dyx-note", "匹配顺序 = 规则列表顺序，首个命中的规则生效；保存时宿主会校验 MR 仓库 ID 与回写状态名。"), form);

    dialog.foot.append(button("试运行匹配", "", function () { testPolicyMatches(base); }));
    dialog.foot.append(button("取消", "", dialog.close));
    dialog.foot.append(button("保存规则", "primary", function () {
      if (!base.name) { toast("请填写规则名称", true); return; }
      if (followScope) { base.scope = { accountId: "", projectId: "" }; }
      if (!(base.trigger.statusKinds || []).length) { toast("至少选择一个触发状态", true); return; }
      setBusy(dialog.foot, true);
      rpc("policies.save", { policy: base }).then(function () {
        dialog.close();
        toast("规则已保存");
        loadPolicies();
      }).catch(function (error) {
        toast("保存失败：" + error.message, true);
      }).then(function () { setBusy(dialog.foot, false); });
    }));

    // 状态名与负责人选项跟随规则绑定的项目；读取失败不阻塞编辑。
    var scopeProjectId = base.scope.projectId || (selectedProject() && selectedProject().id) || "";
    if (scopeProjectId) {
      rpc("defect.statusOptions", rpcArgs({ projectId: scopeProjectId })).then(function (result) {
        state.defectStatusOptions = result.items || [];
        render();
        if (!dialog.box.isConnected) return;
        dialog.body.textContent = "";
        dialog.body.append(node("div", "dyx-note", "匹配顺序 = 规则列表顺序，首个命中的规则生效；保存时宿主会校验 MR 仓库 ID 与回写状态名。"), form);
      }).catch(function () {});
      rpc("defect.members", rpcArgs({ projectId: scopeProjectId })).then(function (result) {
        state.defectMembers = result.items || [];
      }).catch(function () {});
    }
  }

  function clampNumber(value, min, max) {
    var parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return min;
    return Math.min(max, Math.max(min, parsed));
  }

  function testPolicyMatches(policyLike) {
    var dialog = modal("试运行匹配", true);
    dialog.body.append(empty("正在匹配", "读取最近缺陷并按规则匹配（不创建运行）"));
    rpc("policies.test", { policy: policyLike }).then(function (result) {
      dialog.body.textContent = "";
      dialog.body.append(node("div", "dyx-note", "最近 " + result.total + " 条缺陷，命中 " + result.matched + " 条。命中缺陷将按「" + (POLICY_MODE_META[policyLike.mode] || {}).label + "」处理。"));
      if (!result.items.length) { dialog.body.append(empty("没有可匹配的缺陷", "触发状态下暂无缺陷")); return; }
      var list = node("div", "dyx-record-list");
      result.items.forEach(function (item) {
        var row = node("article", "dyx-record");
        var head = node("div", "dyx-record-head");
        head.append(
          node("span", "dyx-badge " + (item.matched ? "ok" : ""), item.matched ? "命中" : "不命中"),
          node("strong", "", (item.serialNumber || item.id) + " " + item.subject)
        );
        var meta = node("div", "dyx-record-meta");
        meta.append(node("span", "", item.reason));
        meta.append(node("span", "", [item.statusName, item.priority, item.assignedToName].filter(Boolean).join(" · ")));
        row.append(head, meta);
        list.append(row);
      });
      dialog.body.append(list);
    }).catch(function (error) {
      dialog.body.textContent = "";
      dialog.body.append(empty("试运行失败", error.message));
    });
    dialog.foot.append(button("关闭", "", dialog.close));
  }

  function renderRunsPage(section) {
    var engineStatus = state.engine.status;
    var head = node("div", "dyx-card");
    var line = node("div", "dyx-actions");
    var engineChip = node("span", "dyx-badge " + (engineStatus && engineStatus.available ? "ok" : "fail"),
      engineStatus ? (engineStatus.available ? "引擎已启用" : "引擎不可用") : "引擎状态未知");
    engineChip.title = engineStatus && engineStatus.lastScanAt ? "上轮扫描 " + shortDateTime(engineStatus.lastScanAt) : "";
    line.append(engineChip);
    if (engineStatus && engineStatus.lastScanError) line.append(node("span", "dyx-muted", "扫描异常：" + engineStatus.lastScanError));
    var filter = node("select", "dyx-select");
    filter.setAttribute("aria-label", "按状态筛选运行记录");
    [["", "全部状态"]].concat(Object.keys(RUN_STATUS_META).map(function (key) { return [key, RUN_STATUS_META[key][0]]; })).forEach(function (item) {
      var option = node("option", "", item[1]);
      option.value = item[0];
      if (item[0] === state.runs.status) option.selected = true;
      filter.append(option);
    });
    filter.addEventListener("change", function () {
      state.runs.status = filter.value;
      loadRuns();
    });
    line.append(filter);
    line.append(button("刷新", "", function () { loadRuns(); loadEngineStatus(); }));
    line.append(button("立即扫描", "primary", function () {
      setBusy(line, true);
      rpc("engine.scanNow", {}).then(function (result) {
        if (result && result.ok) toast("扫描完成" + (result.results && result.results.length ? "：" + result.results.map(function (item) { return item.name + " 命中 " + (item.matched || 0); }).join("，") : "：暂无启用的到期规则"));
        loadRuns();
      }).catch(function (error) { toast("扫描失败：" + error.message, true); }).then(function () { setBusy(line, false); });
    }));
    head.append(line);
    section.append(head);
    if (!state.runs.items.length) {
      section.append(node("div", "dyx-card", empty("暂无运行记录", "规则命中缺陷后会在这里生成运行台账")));
      return;
    }
    var list = node("div", "dyx-record-list");
    state.runs.items.forEach(function (run) {
      var row = node("article", "dyx-record dyx-record-clickable dyx-tile-card" + (run.status === "failed" || run.status === "needs-human" ? " tone-fail" : run.status === "succeeded" ? " tone-ok" : run.status === "awaiting-confirm" ? " tone-run" : ""));
      row.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        openRunDetail(run.id);
      });
      var headRow = node("div", "dyx-record-head");
      headRow.append(runBadge(run.status), node("strong", "", (run.serial || run.defectId) + " " + (run.subject || "")));
      var meta = node("div", "dyx-record-meta");
      meta.append(node("span", "", "规则：" + (run.policyName || run.policyId)));
      meta.append(node("span", "", (POLICY_MODE_META[run.mode] || {}).label || run.mode));
      if (run.result && run.result.outcome) meta.append(node("span", "", "结论：" + (OUTCOME_META[run.result.outcome] || run.result.outcome)));
      if (run.result && run.result.mrUrl) {
        var link = node("a", "dyx-link", "MR " + (run.result.mrId || ""));
        link.href = run.result.mrUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        meta.append(link);
      }
      var foot = node("div", "dyx-record-foot");
      foot.append(node("span", "dyx-muted", shortDateTime(run.startedAt) + (run.durationMs ? " · " + Math.round(run.durationMs / 1000) + " 秒" : "")));
      var actions = node("div", "dyx-actions");
      actions.append(button("详情", "", function () { openRunDetail(run.id); }));
      if (run.status === "awaiting-confirm") {
        actions.append(button("批准", "primary", function () { confirmRun(run, "approve"); }));
      }
      foot.append(actions);
      row.append(headRow, meta, foot);
      list.append(row);
    });
    section.append(list);
  }

  function confirmRun(run, decision) {
    var labels = { approve: "批准并继续实施", handoff: "转人工", reject: "忽略" };
    if (decision !== "approve" && !window.confirm("确认对缺陷 " + (run.serial || run.defectId) + " 执行「" + labels[decision] + "」？")) return;
    rpc("runs.confirm", { runId: run.id, decision: decision }).then(function (result) {
      toast(decision === "approve" ? "已批准，智能体继续实施" : decision === "handoff" ? "已转人工" : "已忽略");
      loadRuns();
      return result;
    }).catch(function (error) { toast("操作失败：" + error.message, true); });
  }

  function openRunDetail(runId) {
    var dialog = modal("运行详情", true);
    dialog.body.append(empty("正在读取", runId));
    rpc("runs.get", { runId: runId }).then(function (run) {
      dialog.body.textContent = "";
      var head = node("div", "dyx-record-head");
      head.append(runBadge(run.status), node("strong", "", (run.serial || run.defectId) + " " + (run.subject || "")));
      var meta = node("div", "dyx-record-meta");
      meta.append(node("span", "", "规则：" + (run.policyName || run.policyId)));
      meta.append(node("span", "", (POLICY_MODE_META[run.mode] || {}).label || run.mode));
      meta.append(node("span", "", shortDateTime(run.startedAt) + (run.endedAt ? " → " + shortDateTime(run.endedAt) : "") + (run.durationMs ? " · " + Math.round(run.durationMs / 1000) + " 秒" : "")));
      dialog.body.append(head, meta);
      if (run.error) dialog.body.append(node("div", "dyx-note", "失败原因：" + run.error));

      var steps = node("div", "dyx-record-list");
      (run.steps || []).forEach(function (step) {
        var row = node("article", "dyx-record");
        var stepHead = node("div", "dyx-record-head");
        stepHead.append(node("span", "dyx-badge ok", "✓"), node("strong", "", RUN_STATUS_META[step.name] ? RUN_STATUS_META[step.name][0] : step.name));
        row.append(stepHead);
        if (step.detail) {
          var stepMeta = node("div", "dyx-record-meta");
          stepMeta.append(node("span", "", step.detail));
          row.append(stepMeta);
        }
        if (step.at) {
          var stepFoot = node("div", "dyx-record-foot");
          stepFoot.append(node("span", "dyx-muted", shortDateTime(step.at)));
          row.append(stepFoot);
        }
        steps.append(row);
      });
      if ((run.steps || []).length) dialog.body.append(node("h4", "", "步骤"), steps);

      var result = run.result || {};
      if (result.summary || result.rootCause || result.plan) {
        var card = node("div", "dyx-card");
        if (result.outcome) card.append(node("p", "", "结论：" + (OUTCOME_META[result.outcome] || result.outcome)));
        if (result.summary) card.append(node("p", "", "摘要：" + result.summary));
        if (result.rootCause) card.append(node("p", "", "根因：" + result.rootCause));
        if (result.plan) card.append(node("p", "", "方案：" + result.plan));
        if (result.risk) card.append(node("p", "", "风险：" + result.risk));
        if (result.branch) card.append(node("p", "", "分支：" + result.branch));
        if ((result.commits || []).length) card.append(node("p", "", "提交：" + result.commits.join(" ")));
        if ((result.changedFiles || []).length) {
          var files = node("ul", "");
          result.changedFiles.forEach(function (file) { files.append(node("li", "", file)); });
          card.append(node("p", "", "改动文件（" + result.changedFiles.length + "）："), files);
        }
        (result.verify || []).forEach(function (item) {
          card.append(node("p", "", (item.ok ? "✅" : "❌") + " " + item.command));
        });
        if (result.mrUrl) {
          var mrLink = node("a", "dyx-link", result.mrUrl);
          mrLink.href = result.mrUrl;
          mrLink.target = "_blank";
          mrLink.rel = "noreferrer";
          card.append(node("p", "", "合并请求："), mrLink);
        }
        dialog.body.append(node("h4", "", "结果"), card);
      }
      if ((run.log || []).length) {
        var logList = node("div", "dyx-record-list");
        run.log.slice(-30).forEach(function (entry) {
          var row = node("article", "dyx-record");
          var logMeta = node("div", "dyx-record-meta");
          logMeta.append(node("span", "", (entry.t ? entry.t + " " : "") + (entry.m || "")));
          row.append(logMeta);
          logList.append(row);
        });
        dialog.body.append(node("h4", "", "日志（最近 " + Math.min(30, run.log.length) + " 条）"), logList);
      }

      dialog.foot.textContent = "";
      if (run.sessionId) {
        dialog.foot.append(button("打开会话", "", function () { openRunSession(run); }));
      }
      if (run.status === "awaiting-confirm") {
        dialog.foot.append(button("✓ 批准并修复", "primary", function () { confirmRun(run, "approve"); }));
        dialog.foot.append(button("✍ 转人工", "", function () { confirmRun(run, "handoff"); }));
        dialog.foot.append(button("✕ 忽略", "danger", function () { confirmRun(run, "reject"); }));
      }
      if (["queued", "fetching", "classifying", "agent-running", "submitting", "writeback"].indexOf(run.status) >= 0) {
        dialog.foot.append(button("取消", "danger", function () {
          rpc("runs.cancel", { runId: run.id }).then(function () { toast("已请求取消"); loadRuns(); }).catch(function (error) { toast("取消失败：" + error.message, true); });
        }));
      }
      if (["needs-human", "failed", "canceled", "interrupted"].indexOf(run.status) >= 0) {
        dialog.foot.append(button("重试", "", function () {
          rpc("runs.retry", { runId: run.id }).then(function () { toast("已重新入队"); dialog.close(); loadRuns(); }).catch(function (error) { toast("重试失败：" + error.message, true); });
        }));
      }
      dialog.foot.append(button("关闭", "", dialog.close));
    }).catch(function (error) {
      dialog.body.textContent = "";
      dialog.body.append(empty("读取失败", error.message));
      dialog.foot.textContent = "";
      dialog.foot.append(button("关闭", "", dialog.close));
    });
  }

  // 运行详情 → 打开该次运行的智能体会话（会话留在工作区内，可继续人工接手）。
  function openRunSession(run) {
    var sessions = services && services.sessions;
    if (!sessions) { toast("会话服务尚未就绪，请重启页面后重试", true); return; }
    var open = function () {
      try {
        sessions.open(run.sessionId);
        toast("已打开运行会话");
      } catch (error) {
        toast("打开会话失败：" + (error instanceof Error ? error.message : String(error)), true);
      }
    };
    if (run.workspaceId && services.workspaces) {
      ensureWorkspaceVisible(run.workspaceId).then(open, function (error) {
        toast(error instanceof Error ? error.message : String(error), true);
      });
    } else {
      open();
    }
  }

  function renderInboxPage(section) {
    var inbox = state.runs.items.filter(function (run) { return run.status === "awaiting-confirm"; });
    var actions = node("div", "dyx-actions");
    actions.append(button("刷新", "", function () { loadRuns(); }));
    section.append(actions);
    if (!inbox.length) {
      section.append(node("div", "dyx-card", empty("没有待确认的分析", "「先析后确认」规则的分析结论会出现在这里，裁决后智能体才会实施修复")));
      return;
    }
    var list = node("div", "dyx-record-list");
    inbox.forEach(function (run) {
      var card = node("article", "dyx-record dyx-tile-card tone-run");
      var head = node("div", "dyx-record-head");
      head.append(runBadge(run.status), node("strong", "", (run.serial || run.defectId) + " " + (run.subject || "")));
      var meta = node("div", "dyx-record-meta");
      meta.append(node("span", "", "规则：" + (run.policyName || run.policyId)));
      var result = run.result || {};
      if (result.rootCause) meta.append(node("span", "", "根因：" + result.rootCause));
      if (result.plan) meta.append(node("span", "", "方案：" + result.plan));
      if (result.risk) meta.append(node("span", "", "风险：" + result.risk));
      if ((result.changedFiles || []).length) meta.append(node("span", "", "涉及：" + result.changedFiles.slice(0, 6).join("、") + (result.changedFiles.length > 6 ? " 等" : "")));
      var foot = node("div", "dyx-record-foot");
      foot.append(node("span", "dyx-muted", shortDateTime(run.startedAt)));
      var actions2 = node("div", "dyx-actions");
      if (run.sessionId) actions2.append(button("打开会话", "", function () { openRunSession(run); }));
      actions2.append(button("✓ 批准并修复", "primary", function () { confirmRun(run, "approve"); }));
      actions2.append(button("✍ 转人工", "", function () { confirmRun(run, "handoff"); }));
      actions2.append(button("✕ 忽略", "danger", function () { confirmRun(run, "reject"); }));
      foot.append(actions2);
      card.append(head, meta, foot);
      list.append(card);
    });
    section.append(list);
  }

  // 旧画布只读：仅展示历史流程定义；执行已全部收编到规则引擎。
  function renderLegacyCanvasPage(section) {
    var flow = activeFlow();
    var actions = node("div", "dyx-actions");
    var selector = node("select", "dyx-select");
    selector.setAttribute("aria-label", "选择旧编排");
    if (!state.flows.items.length) selector.append(node("option", "", "暂无旧编排"));
    state.flows.items.forEach(function (item, index) {
      var option = node("option", "", item.name);
      option.value = String(index);
      if (index === state.flows.active) option.selected = true;
      selector.append(option);
    });
    selector.addEventListener("change", function () {
      state.flows.active = Number(selector.value) || 0;
      render();
    });
    actions.append(selector, node("span", "dyx-muted", "只读展示；这些流程的执行已由规则引擎接管，可在 Phase 2 归档删除。"));
    section.append(actions);
    if (!flow) {
      section.append(node("div", "dyx-card", empty("没有旧版画布编排", "")));
      return;
    }
    section.append(renderFlowShell(flow));
  }

  function flowNodeEl(node, selected) {
    var type = FLOW_NODE_TYPES[node.tp];
    var element = node2("div", "dyx-flow-node" + (selected ? " selected" : ""));
    element.dataset.nid = node.id;
    element.style.left = node.x + "px";
    element.style.top = node.y + "px";
    var glyph = node2("span", "dyx-flow-node-glyph", type.glyph);
    glyph.style.background = type.color;
    var text = node2("div", "dyx-flow-node-text");
    text.append(node2("b", "", node.name), node2("span", "", flowNodeSub(node)));
    var badge = node2("span", "dyx-flow-node-state");
    var inPort = node2("button", "dyx-flow-port", "");
    inPort.type = "button";
    inPort.dataset.side = "in";
    inPort.dataset.nid = node.id;
    inPort.setAttribute("aria-label", node.name + " 入口");
    var outPort = node2("button", "dyx-flow-port", "");
    outPort.type = "button";
    outPort.dataset.side = "out";
    outPort.dataset.nid = node.id;
    outPort.setAttribute("aria-label", node.name + " 出口");
    element.append(glyph, text, badge, inPort, outPort);
    return element;
  }

  // 别名：避免与外层 node() 工厂混淆。
  function node2(tag, className, text) { return node(tag, className, text); }

  function renderFlowShell(flow) {
    var shell = node("div", "dyx-flow-shell");
    shell.append(node("div", "dyx-note dyx-flow-readonly-note", "旧版画布（只读）：仅展示历史流程定义，节点与连线不可编辑；执行已由规则引擎接管。"));
    var canvas = node2("div", "dyx-flow-canvas");
    canvas.setAttribute("aria-label", "旧版编排画布（只读）");
    var stage = node2("div", "dyx-flow-stage");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "dyx-flow-edges");
    stage.append(svg);
    flow.nodes.forEach(function (item) { stage.append(flowNodeEl(item, false)); });
    canvas.append(stage);
    shell.append(canvas);
    return shell;
  }

  function flowStage() { return main.querySelector(".dyx-flow-stage"); }

  function flowSvg() { return main.querySelector(".dyx-flow-edges"); }

  function flowPorts(node, side) {
    return side === "out" ? { x: node.x + 172, y: node.y + 25 } : { x: node.x, y: node.y + 25 };
  }

  function flowEdgePath(a, b) {
    var dx = b.x - a.x;
    var sign = dx < 0 ? -1 : 1;
    var distance = Math.max(34, Math.min(110, Math.abs(dx) * 0.5));
    var cx1, cy1, cx2, cy2;
    if (Math.abs(dx) < 40) {
      var dy = b.y - a.y;
      var vertical = Math.max(28, Math.min(90, Math.abs(dy) * 0.5)) * (dy < 0 ? -1 : 1);
      cx1 = a.x; cy1 = a.y + vertical; cx2 = b.x; cy2 = b.y - vertical;
    } else {
      cx1 = a.x + sign * distance; cy1 = a.y; cx2 = b.x - sign * distance; cy2 = b.y;
    }
    return "M" + a.x + "," + a.y + " C" + cx1 + "," + cy1 + " " + cx2 + "," + cy2 + " " + b.x + "," + b.y;
  }

  function drawFlowEdges() {
    var svg = flowSvg();
    var flow = activeFlow();
    if (!svg || !flow) return;
    var stage = flowStage();
    svg.setAttribute("width", Math.max(640, stage ? stage.offsetWidth : 640));
    svg.setAttribute("height", Math.max(600, stage ? stage.offsetHeight : 600));
    var parts = [];
    flow.edges.forEach(function (edge) {
      var from = flow.nodes.find(function (node) { return node.id === edge.f; });
      var to = flow.nodes.find(function (node) { return node.id === edge.t; });
      if (!from || !to) return;
      parts.push({ path: flowEdgePath(flowPorts(from, "out"), flowPorts(to, "in")), label: edge.label || "", mid: flowPorts(from, "out"), end: flowPorts(to, "in") });
    });
    svg.textContent = "";
    parts.forEach(function (item) {
      var base = document.createElementNS("http://www.w3.org/2000/svg", "path");
      base.setAttribute("d", item.path);
      if (item.cls) base.setAttribute("class", item.cls);
      svg.append(base);
      if (item.label) {
        var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("class", "dyx-flow-elabel");
        label.setAttribute("x", Math.round((item.mid.x + item.end.x) / 2));
        label.setAttribute("y", Math.round((item.mid.y + item.end.y) / 2) - 8);
        label.setAttribute("text-anchor", "middle");
        label.textContent = item.label;
        svg.append(label);
      }
    });
  }

  function renderFlowStates() {
    // 旧画布只读：执行状态已迁移到规则引擎的运行台账，这里保留空实现以兼容绘制入口。
  }

  function mount(container) {
    root = node("div", "dyx-root"); root.id = ROOT_ID;
    shell = node("div", "dyx-shell");
    var head = node("header", "dyx-head"); var logo = node("div", "dyx-logo", "云"); var copy = node("div", "dyx-head-copy"); copy.append(node("strong", "", "云效工作台")); subtitle = node("span", "", "正在读取配置…"); copy.append(subtitle);
    var closeButton = button("×", "dyx-close", close); closeButton.setAttribute("aria-label", "关闭云效工作台");
    head.append(logo, copy);
    var body = node("div", "dyx-body"); var nav = node("nav", "dyx-nav");
    // 页签按使用频率排序：概览聚合待办，缺陷/流水线为核心工作区，代码/测试/制品
    // 接入云效其他域，编排承载自动化流程，账号/项目等配置收敛到设置页。
    [["dashboard", "概览"], ["defects", "工作项"], ["pipelines", "流水线"], ["code", "代码"], ["tests", "测试"], ["packages", "制品"], ["flows", "编排"], ["overview", "设置"]].forEach(function (item) {
      var tab = node("button", item[0] === state.tab ? "active" : ""); tab.type = "button"; tab.append(node("span", "", item[1])); tab.addEventListener("click", function () { setTab(item[0]); }); navButtons[item[0]] = tab; nav.append(tab);
    });
    // 全页模式：面板吃满除聊天列以外的宽度；侧栏模式恢复上次拖拽宽度。
    var expandButton = button("⤢", "dyx-expand", function () {
      setFullMode(!FULL_MODE_ACTIVE);
    });
    expandButton.setAttribute("aria-label", "切换全页模式");
    expandButton.title = "全页 / 侧栏切换";
    function setFullMode(active) {
      FULL_MODE_ACTIVE = Boolean(active);
      try { window.localStorage.setItem(FULL_MODE_STORAGE_KEY, FULL_MODE_ACTIVE ? "1" : ""); } catch (error) {}
      if (root) root.dataset.full = FULL_MODE_ACTIVE ? "true" : "false";
      expandButton.textContent = FULL_MODE_ACTIVE ? "⤡" : "⤢";
      expandButton.setAttribute("aria-label", FULL_MODE_ACTIVE ? "收起为侧栏" : "全页展开");
      // apply 层监听 resize 并按 clampPanelWidth 重算面板宽度。
      window.dispatchEvent(new Event("resize"));
    }
    // 默认全页铺满；只有用户显式切回侧栏（localStorage 记 "0"）才以侧栏打开。
    try { setFullMode(window.localStorage.getItem(FULL_MODE_STORAGE_KEY) !== "0"); } catch (error) { setFullMode(true); }
    // 布局：页签收进顶栏，与标题同一行，主体区整栏留给内容。
    main = node("main", "dyx-main"); head.append(nav, expandButton, closeButton); body.append(main); shell.append(head, body); root.append(shell); (container || document.body).append(root);
    if (notifier) unsubscribeNotifier = notifier.subscribe(function () {
      if (root && state.tab === "defects") render();
    });
    render();
    loadState().then(function () {
      render();
      if (state.tab === "defects" && selectedProject()) { loadDefects(); loadDefectFilterOptions(); }
      else if (state.tab === "pipelines" && selectedProject()) loadPipelines();
      else if (state.tab === "dashboard") loadDashboard();
      if (state.tab === "flows") {
        loadFlows();
        loadPolicies();
        loadRuns();
        loadEngineStatus();
        startFlowsPolling();
      }
    }).catch(function (error) { toast(error.message, true); });
    // 视口尺寸变化：缺陷页每页条数按新宽高重算（防抖 350ms），变化时重新加载列表。
    onViewportResize = function () {
      if (state.tab !== "defects" || !selectedProject()) return;
      window.clearTimeout(defectResizeTimer);
      defectResizeTimer = window.setTimeout(function () {
        if (state.tab === "defects" && selectedProject() && computeDefectPageSize() !== state.defects.pageSize) loadDefects();
      }, 350);
    };
    window.addEventListener("resize", onViewportResize);
  }

  function close() {
    if (typeof onRequestClose === "function") onRequestClose();
    else dispose();
  }

  function dispose() {
    if (root) root.querySelectorAll(".dyx-drawer .dyx-close").forEach(function (item) { item.click(); });
    var value = document.getElementById(ROOT_ID); if (value) value.remove();
    if (unsubscribeNotifier) unsubscribeNotifier();
    unsubscribeNotifier = null;
    if (onViewportResize) window.removeEventListener("resize", onViewportResize);
    onViewportResize = null;
    if (defectResizeTimer) { clearTimeout(defectResizeTimer); defectResizeTimer = null; }
    if (stopFlowsPolling) stopFlowsPolling();
    root = null;
  }

  return { mount: mount, dispose: dispose, openNotifiedDefects: openNotifiedDefects };
}

var ALLOWED_TAGS = new Set(["A", "BLOCKQUOTE", "BR", "CODE", "DEL", "DIV", "EM", "FIGCAPTION", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRONG", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "U", "UL"]);
var SHARED_ATTRS = new Set(["title"]);
var TAG_ATTRS = { A: new Set(["href"]), IMG: new Set(["src", "alt", "width", "height"]), TD: new Set(["colspan", "rowspan"]), TH: new Set(["colspan", "rowspan"]) };

function safeUrl(value, image) {
  var text = String(value || "").trim();
  if (!text) return "";
  if (image && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(text)) return text;
  try { var parsed = new URL(text, window.location.origin); return ["http:", "https:"].indexOf(parsed.protocol) >= 0 ? parsed.href : ""; } catch (error) { return ""; }
}

function formatBytes(value) {
  var size = Number(value) || 0;
  if (size <= 0) return "";
  var units = ["B", "KB", "MB", "GB"];
  var index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return (index ? size.toFixed(1) : String(Math.round(size))) + " " + units[index];
}

// 优先 blob 保存（可指定文件名）；云效 OSS 直链不允许跨域请求时退回新窗口由浏览器处理。
function downloadFile(url, fileName) {
  fetch(url, { cache: "no-store" }).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.blob();
  }).then(function (blob) {
    var objectUrl = URL.createObjectURL(blob);
    var link = node("a");
    link.href = objectUrl;
    link.download = fileName || "附件";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 4000);
  }).catch(function () {
    window.open(url, "_blank", "noopener");
  });
}

// —— 缺陷图片预览与右键复制 ————————————————————————————————————————————
// 桌面端宿主没有统一的图片右键菜单/预览能力（Mac 上右键无反应），由插件自己实现：
// 点击富文本图片 → 全屏预览层；右键 → 预览/复制图片/下载菜单。
// 复制优先走宿主 RPC 换取 base64（无跨域限制），退回直接 fetch，统一转 PNG 后写剪贴板。

function base64ToBlob(data, mediaType) {
  var binary = atob(String(data || ""));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mediaType || "image/png" });
}

function blobToPngBlob(blob) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(blob);
    var image = new Image();
    image.onload = function () {
      try {
        var canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        if (!canvas.width || !canvas.height) throw new Error("图片尺寸异常");
        canvas.getContext("2d").drawImage(image, 0, 0);
        canvas.toBlob(function (png) {
          URL.revokeObjectURL(url);
          if (png) resolve(png); else reject(new Error("图片转码 PNG 失败"));
        }, "image/png");
      } catch (error) { URL.revokeObjectURL(url); reject(error instanceof Error ? error : new Error(String(error))); }
    };
    image.onerror = function () { URL.revokeObjectURL(url); reject(new Error("图片解码失败")); };
    image.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      var index = text.indexOf(",");
      resolve(index >= 0 ? text.slice(index + 1) : text);
    };
    reader.onerror = function () { reject(new Error("图片数据读取失败")); };
    reader.readAsDataURL(blob);
  });
}

// 最后的兜底：把图片放进离屏可编辑区并选中，走 execCommand("copy") 旧式复制。
// 该路径不经过异步剪贴板的权限检查，只要文档持有用户手势即可。
function copyImageViaSelection(dataUrl) {
  return new Promise(function (resolve, reject) {
    var holder = document.createElement("div");
    holder.contentEditable = "true";
    holder.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0";
    var image = new Image();
    image.onload = function () {
      holder.append(image);
      document.body.append(holder);
      var range = document.createRange();
      range.selectNodeContents(holder);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      var copied = false;
      try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
      selection.removeAllRanges();
      holder.remove();
      if (copied) resolve();
      else reject(new Error("当前环境不支持写入图片剪贴板，请改用下载"));
    };
    image.onerror = function () { reject(new Error("当前环境不支持写入图片剪贴板，请改用下载")); };
    image.src = dataUrl;
  });
}

// PNG blob 写入剪贴板，三级回退：
// 1) 桌面端宿主用系统工具写剪贴板（macOS osascript / Windows PowerShell），与渲染进程权限无关；
// 2) navigator.clipboard（web profile、普通浏览器）；
// 3) execCommand 选中图片复制。
// callRpc 由调用方传入（闭包内桥接 rpcArgs）；仅浏览器环境（web profile）下可为空。
function writeImageToClipboard(pngBlob, callRpc) {
  return blobToBase64(pngBlob).then(function (base64) {
    var hostTask = callRpc
      ? callRpc("clipboard.write_image", { data: base64 }).then(function (result) {
          return Boolean(result && result.supported);
        }, function () { return false; })
      : Promise.resolve(false);
    return hostTask.then(function (hostWritten) {
      if (hostWritten) return;
      var dataUrl = "data:image/png;base64," + base64;
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        return navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]).catch(function () {
          return copyImageViaSelection(dataUrl);
        });
      }
      return copyImageViaSelection(dataUrl);
    });
  });
}

// info: { url, name, defectId, fileId, callRpc }；fileId 缺失或宿主取图失败时退回直接 fetch。
function copyImageToClipboard(info) {
  var viaFetch = function () {
    return fetch(info.url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("下载图片失败（HTTP " + response.status + "）");
      return response.blob();
    }).then(blobToPngBlob);
  };
  var task = info.defectId && info.fileId && info.callRpc
    ? info.callRpc("defect.attachment.data", { defectId: info.defectId, fileId: info.fileId }).then(function (result) {
        if (!result || !result.data) throw new Error("宿主未返回图片数据");
        return blobToPngBlob(base64ToBlob(result.data, result.mediaType));
      }).catch(viaFetch)
    : viaFetch();
  return task.then(function (pngBlob) { return writeImageToClipboard(pngBlob, info.callRpc); });
}

function copyDefectImage(getInfo) {
  toast("正在复制图片…");
  copyImageToClipboard(getInfo()).then(function () {
    toast("图片已复制到剪贴板");
  }).catch(function (error) {
    toast(error instanceof Error ? error.message : String(error), true);
  });
}

var lightboxState = null;

function closeImagePreview() {
  if (!lightboxState) return;
  document.removeEventListener("keydown", lightboxState.onKeydown, true);
  lightboxState.overlay.remove();
  lightboxState = null;
}

function openImagePreview(info) {
  closeImagePreview();
  closeImageMenu();
  var overlay = node("div", "dyx-lightbox");
  var stage = node("div", "dyx-lightbox-stage");
  var image = new Image();
  image.alt = info.name || "图片预览";
  image.src = info.url;
  // 直链时效性：预览图加载失败且有附件 ID 时，实时换取 base64 重试一次。
  image.addEventListener("error", function () {
    if (!info.defectId || !info.fileId || !info.callRpc || image.dataset.refreshed) return;
    image.dataset.refreshed = "1";
    info.callRpc("defect.attachment.data", { defectId: info.defectId, fileId: info.fileId }).then(function (result) {
      if (result && result.data) image.src = "data:" + (result.mediaType || "image/png") + ";base64," + result.data;
    }).catch(function () {});
  });
  // 点击图片在“适应窗口 / 原始大小”间切换。
  image.addEventListener("click", function (event) { event.stopPropagation(); stage.classList.toggle("dyx-zoom"); });
  image.addEventListener("contextmenu", function (event) {
    event.preventDefault(); event.stopPropagation();
    openImageContextMenu(event, function () { return { url: image.src, name: info.name, defectId: info.defectId, fileId: info.fileId, callRpc: info.callRpc }; });
  });
  var copyInfo = function () { return { url: image.src, name: info.name, defectId: info.defectId, fileId: info.fileId, callRpc: info.callRpc }; };
  var actions = node("div", "dyx-lightbox-actions");
  var copyBtn = button("复制图片", "", function () { copyDefectImage(copyInfo); });
  var downloadBtn = button("下载", "", function () { downloadFile(image.src, info.name); });
  var closeBtn = button("关闭", "", closeImagePreview);
  actions.append(copyBtn, downloadBtn, closeBtn);
  var bar = node("div", "dyx-lightbox-bar");
  bar.append(node("strong", "", info.name || "图片预览"), actions);
  stage.append(image);
  overlay.append(bar, stage);
  overlay.addEventListener("click", function (event) {
    if (event.target === overlay || event.target === stage) closeImagePreview();
  });
  var onKeydown = function (event) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    closeImagePreview();
  };
  document.addEventListener("keydown", onKeydown, true);
  document.body.append(overlay);
  lightboxState = { overlay: overlay, onKeydown: onKeydown };
}

var imageMenuEl = null;

function closeImageMenu() {
  if (!imageMenuEl) return;
  imageMenuEl.remove();
  imageMenuEl = null;
  document.removeEventListener("click", closeImageMenu, true);
  document.removeEventListener("contextmenu", closeImageMenu, true);
  window.removeEventListener("blur", closeImageMenu);
  window.removeEventListener("resize", closeImageMenu);
}

function openImageContextMenu(event, getInfo) {
  closeImageMenu();
  var menu = node("div", "dyx-ctxmenu");
  [
    ["预览图片", function () { openImagePreview(getInfo()); }],
    ["复制图片", function () { copyDefectImage(getInfo); }],
    ["下载图片", function () { var info = getInfo(); downloadFile(info.url, info.name); }]
  ].forEach(function (item) {
    var entry = node("button", "", item[0]);
    entry.addEventListener("click", function () { closeImageMenu(); item[1](); });
    menu.append(entry);
  });
  document.body.append(menu);
  var rect = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8)) + "px";
  imageMenuEl = menu;
  setTimeout(function () {
    if (!imageMenuEl) return;
    document.addEventListener("click", closeImageMenu, true);
    document.addEventListener("contextmenu", closeImageMenu, true);
    window.addEventListener("blur", closeImageMenu);
    window.addEventListener("resize", closeImageMenu);
  }, 0);
}

// 详情/评论里的图片统一接入：左键预览、右键菜单。src 可能在加载失败后被刷新，
// 因此复制/下载时实时读取当前 src。callRpc 用于宿主侧取图/写剪贴板。
function wireDefectImage(element, defectId, fileId, name, callRpc) {
  var getInfo = function () { return { url: element.src, name: name, defectId: defectId, fileId: fileId, callRpc: callRpc }; };
  element.addEventListener("click", function (event) { event.preventDefault(); openImagePreview(getInfo()); });
  element.addEventListener("contextmenu", function (event) {
    event.preventDefault(); event.stopPropagation();
    openImageContextMenu(event, getInfo);
  });
}

function appendJsonMl(parent, value) {
  if (value === null || value === undefined || value === false) return;
  if (typeof value === "string" || typeof value === "number") { parent.append(document.createTextNode(String(value))); return; }
  if (!Array.isArray(value) || !value.length || typeof value[0] !== "string") return;
  var tag = value[0].toLowerCase(); var hasAttrs = value[1] && typeof value[1] === "object" && !Array.isArray(value[1]); var offset = hasAttrs ? 2 : 1;
  if (tag === "root" || !ALLOWED_TAGS.has(tag.toUpperCase())) { value.slice(offset).forEach(function (child) { appendJsonMl(parent, child); }); return; }
  var element = document.createElement(tag); var attrs = hasAttrs ? value[1] : {};
  Object.keys(attrs).forEach(function (key) { var item = attrs[key]; if (typeof item === "string" || typeof item === "number") element.setAttribute(key, String(item)); });
  value.slice(offset).forEach(function (child) { appendJsonMl(element, child); }); parent.append(element);
}

function richSource(content, format) {
  var text = String(content || "");
  if (String(format || "").toUpperCase() === "MARKDOWN") { var pre = node("pre", "", text); return pre.outerHTML; }
  var trimmed = text.trim();
  if (trimmed.charAt(0) !== "{" && trimmed.charAt(0) !== "[") return text;
  try {
    var parsed = JSON.parse(trimmed); var template = document.createElement("template");
    if (Array.isArray(parsed)) appendJsonMl(template.content, parsed);
    else if (parsed && typeof parsed === "object") { if (typeof parsed.htmlValue === "string" && parsed.htmlValue.trim()) return parsed.htmlValue; if (parsed.jsonMLValue) appendJsonMl(template.content, parsed.jsonMLValue); }
    return template.innerHTML || text;
  } catch (error) { return text; }
}

function renderRich(container, content, format, attachments, defectId, callRpc) {
  if (!String(content || "").trim()) { container.append(node("div", "dyx-muted", "暂无内容")); return; }
  var template = document.createElement("template"); template.innerHTML = richSource(content, format);
  Array.from(template.content.querySelectorAll("*")).forEach(function (element) {
    if (!ALLOWED_TAGS.has(element.tagName)) { element.replaceWith.apply(element, Array.from(element.childNodes)); return; }
    if (element.tagName === "IMG") {
      var allValues = Array.from(element.attributes).map(function (attr) { return attr.value; }).join(" ");
      var attachment = (attachments || []).find(function (item) { return item.fileId && allValues.indexOf(item.fileId) >= 0; });
      if (attachment) {
        element.setAttribute("src", attachment.url);
        // 云效文件直链有时效性，加载失败时实时换取新的下载地址重试一次。
        element.addEventListener("error", function () {
          if (!defectId || !attachment.fileId || !callRpc || element.dataset.refreshed) return;
          element.dataset.refreshed = "1";
          callRpc("defect.attachment.link", { defectId: defectId, fileId: attachment.fileId }).then(function (result) {
            var url = safeUrl(result && result.url);
            if (url) element.setAttribute("src", url);
          }).catch(function () {});
        });
      }
    }
    var allowed = TAG_ATTRS[element.tagName] || new Set();
    Array.from(element.attributes).forEach(function (attr) { if (!SHARED_ATTRS.has(attr.name) && !allowed.has(attr.name)) element.removeAttribute(attr.name); });
    if (element.tagName === "IMG") { var src = safeUrl(element.getAttribute("src"), true); if (!src) { element.remove(); return; } element.src = src; element.loading = "lazy"; wireDefectImage(element, defectId || "", (attachment && attachment.fileId) || "", (attachment && attachment.fileName) || element.getAttribute("alt") || "图片", callRpc); }
    if (element.tagName === "A") { var href = safeUrl(element.getAttribute("href")); if (!href) element.removeAttribute("href"); else { element.href = href; element.target = "_blank"; element.rel = "noopener noreferrer"; } }
  });
  container.append(template.content);
  // 图片统一收进横向缩略图条：避免描述里的大图逐张占满整页；
  // 缩略图横向并排、过多自动换到下一排，点击全屏预览与右键菜单（wireDefectImage）保留。
  // 注意：fragment append 后子节点已移入 container，须从 container 里查找。
  var richImages = Array.from(container.querySelectorAll("img"));
  if (richImages.length) {
    var strip = node("div", "dyx-imgstrip");
    richImages.forEach(function (img) { strip.append(img); });
    container.append(strip);
  }
}

// —— 缺陷“处理”到 DSH 工作区会话 ————————————————————————————————————————
// 处理弹窗把缺陷详情转成一段纯文本（标题 + 概要 + 描述）和若干张图片：
// 草稿模式写入新会话输入框（不发送），立即处理模式直接 prompt 发送。
var IMAGE_MEDIA_TYPE_BY_SUFFIX = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
var HANDLE_IMAGE_LIMIT = 8;

function fileImageMediaType(file) {
  if (!file) return "";
  var suffix = String(file.suffix || "").replace(/^\./, "").toLowerCase();
  var matched = /\.([a-z0-9]+)$/i.exec(String(file.fileName || ""));
  return IMAGE_MEDIA_TYPE_BY_SUFFIX[suffix] || (matched && IMAGE_MEDIA_TYPE_BY_SUFFIX[matched[1].toLowerCase()]) || "";
}

function imageCandidates(attachments) {
  var result = [];
  (Array.isArray(attachments) ? attachments : []).forEach(function (file) {
    if (!file || !file.fileId) return;
    var mediaType = fileImageMediaType(file);
    if (!mediaType) return;
    result.push({ fileId: file.fileId, fileName: String(file.fileName || "") || "图片", mediaType: mediaType });
  });
  return result.slice(0, HANDLE_IMAGE_LIMIT);
}

function htmlToText(value) {
  var template = document.createElement("template");
  template.innerHTML = String(value || "");
  var text = "";
  var BLOCK = /^(?:P|DIV|H[1-6]|LI|TR|BLOCKQUOTE|PRE|TABLE|FIGURE|FIGCAPTION|HR|UL|OL|SECTION|ARTICLE)$/;
  function walk(current) {
    for (var child = current.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) { text += child.nodeValue; continue; }
      if (child.nodeType !== 1) continue;
      var tag = child.tagName;
      if (tag === "BR") { text += "\n"; continue; }
      // 图片已经作为会话附件单独上传，正文里不再保留占位文字。
      if (tag === "IMG") continue;
      var block = BLOCK.test(tag);
      if (block) text += "\n";
      walk(child);
      if (block) text += "\n";
    }
  }
  walk(template.content);
  return text.replace(/[\u00a0\t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function plainDescription(detail) {
  var value = String((detail && detail.description) || "");
  if (!value.trim()) return "";
  var format = String((detail && detail.descriptionFormat) || "RICHTEXT").toUpperCase();
  var text = format === "MARKDOWN"
    ? value.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    : htmlToText(richSource(value, format));
  if (text.length > 6000) text = text.slice(0, 6000) + "\n……（描述过长已截断）";
  return text.trim();
}

// 会话内容只保留缺陷标题；描述仅在含文字时附在后面（纯图片描述不显示“缺陷描述”）。
// 编号、状态、负责人、附件列表和评论都不带入。
function buildHandleText(detail) {
  var item = detail && detail.defect || {};
  var lines = [String(item.subject || "").trim() || "未命名缺陷"];
  var description = plainDescription(detail);
  if (description) lines.push("", "缺陷描述：", description);
  return lines.join("\n").slice(0, 8000);
}

function base64ToFile(image) {
  var binary = atob(image.data);
  var bytes = new Uint8Array(binary.length);
  for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  var extension = String(image.mediaType || "").split("/")[1] || "png";
  return new File([bytes], image.name || "缺陷图片." + extension, { type: image.mediaType || "image/png" });
}

function apply(ctx) {
  var existingStyle = document.getElementById(STYLE_ID);
  var style = existingStyle || node("style");
  if (!existingStyle) { style.id = STYLE_ID; style.textContent = CSS; document.head.append(style); }

  var hasNativeSurface = Boolean(
    ReactRuntime && typeof ReactRuntime.createElement === "function" &&
    ctx.slots && ctx.layout
  );
  if (!hasNativeSurface) {
    var previewWorkspace = null;
    var previewNotifier = createDefectNotifier({
      onOpen: function (items) { if (previewWorkspace) previewWorkspace.openNotifiedDefects(items); }
    });
    var previewHost = node("div", "dyx-preview-host");
    document.body.append(previewHost);
    previewWorkspace = createWorkspace(function () { previewHost.remove(); }, previewNotifier, ctx);
    previewWorkspace.mount(previewHost);
    previewNotifier.start();
    ctx.effect(function () { return function () { previewNotifier.dispose(); previewWorkspace.dispose(); previewHost.remove(); if (!existingStyle) style.remove(); }; }, "dsh-yunxiao: standalone preview");
    return;
  }

  var panelOpen = false;
  var panelListeners = new Set();
  var workspaceFrame = null;
  var preferredPanelWidth = readPanelWidth();
  var panelWidth = clampPanelWidth(preferredPanelWidth);
  function applyPanelWidth(value, persist) {
    panelWidth = clampPanelWidth(value);
    if (workspaceFrame) workspaceFrame.style.setProperty("--dyx-workspace-width", panelWidth + "px");
    // 兜底：即使没找到宿主网格 frame，也把变量写在面板自身上，保证拖拽始终生效。
    if (activePanelElement) {
      activePanelElement.style.setProperty("--dyx-workspace-width", panelWidth + "px");
      // 全页模式下面板改为 fixed 悬浮（覆盖中间聊天区），左侧从宿主导航轨右缘开始。
      activePanelElement.classList.toggle("dyx-panel-full", FULL_MODE_ACTIVE);
      activePanelElement.style.setProperty("--dyx-full-left", HOST_SIDEBAR_TRACK + "px");
    }
    if (persist) {
      preferredPanelWidth = panelWidth;
      savePanelWidth(panelWidth);
    }
    return panelWidth;
  }
  function widenWorkspaceFrame() {
    requestAnimationFrame(function () {
      var overlay = document.querySelector("[data-shell-overlay]");
      var frame = overlay && overlay.parentElement;
      if (!frame) {
        // 兜底：overlay 缺失时，从面板自身的祖先里找带内联网格的宿主框架。
        var panel = document.querySelector(".dyx-right-panel");
        frame = panel ? panel.closest("[style*='grid-template-columns']") : null;
      }
      if (!frame) return;
      var match = String(frame.style.gridTemplateColumns || "").match(/^([\d.]+px)/);
      // 记录宿主左侧导航轨宽度：全页模式下面板 fixed 左偏移 = 导航轨宽度，
      // 这样中间聊天列会被整面盖住，工作台占满整页。
      if (match) HOST_SIDEBAR_TRACK = Math.max(0, Math.round(parseFloat(match[1])));
      frame.style.setProperty("--dyx-sidebar-track", match ? match[1] : HOST_SIDEBAR_TRACK + "px");
      frame.style.setProperty("--dyx-workspace-width", panelWidth + "px");
      frame.setAttribute("data-dyx-workspace-open", "true");
      workspaceFrame = frame;
      if (FULL_MODE_ACTIVE && activePanelElement) applyPanelWidth(panelWidth, false);
    });
  }
  function restoreWorkspaceFrame() {
    if (!workspaceFrame) return;
    workspaceFrame.removeAttribute("data-dyx-workspace-open");
    workspaceFrame.style.removeProperty("--dyx-sidebar-track");
    workspaceFrame.style.removeProperty("--dyx-workspace-width");
    workspaceFrame = null;
  }
  // 新版宿主布局（rightbar 轨道模型）已移除 openDetails/closeDetails，
  // 这里只做特性探测：老宿主仍让位 details 面板，新宿主靠 grid 覆盖直接停靠。
  function openHostDetails() {
    if (typeof ctx.layout.openDetails === "function") ctx.layout.openDetails();
  }
  function closeHostDetails() {
    if (typeof ctx.layout.closeDetails === "function") ctx.layout.closeDetails();
  }
  function setPanelOpen(open) {
    var next = Boolean(open);
    if (panelOpen !== next) {
      panelOpen = next;
      panelListeners.forEach(function (listener) { listener(panelOpen); });
    }
    if (panelOpen) { openHostDetails(); widenWorkspaceFrame(); }
    else { restoreWorkspaceFrame(); closeHostDetails(); }
  }
  var activeWorkspace = null;
  var activePanelElement = null;
  var pendingNoticeItems = [];
  function openNotifiedItems(items) {
    pendingNoticeItems = (items || []).slice();
    setPanelOpen(true);
    if (activeWorkspace) {
      var nextItems = pendingNoticeItems;
      pendingNoticeItems = [];
      activeWorkspace.openNotifiedDefects(nextItems);
    }
  }
  var notifier = createDefectNotifier({ onOpen: openNotifiedItems });
  notifier.start();

  function RightWorkspace() {
    var openState = ReactRuntime.useState(panelOpen);
    var open = openState[0];
    var setOpen = openState[1];
    var hostRef = ReactRuntime.useRef(null);
    var panelRef = ReactRuntime.useRef(null);
    ReactRuntime.useEffect(function () {
      panelListeners.add(setOpen);
      return function () { panelListeners.delete(setOpen); };
    }, []);
    ReactRuntime.useEffect(function () {
      if (!open || !hostRef.current) return;
      var workspace = createWorkspace(function () { setPanelOpen(false); }, notifier, ctx);
      activeWorkspace = workspace;
      workspace.mount(hostRef.current);
      activePanelElement = panelRef.current;
      // 面板挂载后立即按当前模式（含全页）应用一次宽度，避免全页类丢失。
      applyPanelWidth(panelWidth, false);
      raiseWorkspacePanel(activePanelElement);
      if (pendingNoticeItems.length) {
        var nextItems = pendingNoticeItems;
        pendingNoticeItems = [];
        workspace.openNotifiedDefects(nextItems);
      }
      return function () {
        if (activeWorkspace === workspace) activeWorkspace = null;
        if (activePanelElement === panelRef.current) activePanelElement = null;
        workspace.dispose();
      };
    }, [open]);
    if (!open) return null;
    function beginResize(event) {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      var handle = event.currentTarget;
      var startX = event.clientX;
      var startWidth = panelWidth;
      handle.classList.add("active");
      document.documentElement.classList.add("dyx-resizing");
      function move(moveEvent) {
        applyPanelWidth(startWidth + startX - moveEvent.clientX, false);
        handle.setAttribute("aria-valuenow", String(panelWidth));
      }
      function finish() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        handle.classList.remove("active");
        document.documentElement.classList.remove("dyx-resizing");
        applyPanelWidth(panelWidth, true);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    }
    function resizeByKeyboard(event) {
      var delta = event.key === "ArrowLeft" ? 20 : event.key === "ArrowRight" ? -20 : 0;
      if (!delta && event.key !== "Home") return;
      event.preventDefault();
      var next = event.key === "Home" ? DEFAULT_PANEL_WIDTH : panelWidth + delta;
      applyPanelWidth(next, true);
      event.currentTarget.setAttribute("aria-valuenow", String(panelWidth));
    }
    return ReactRuntime.createElement("div", { ref: panelRef, className: "dyx-right-panel" },
      ReactRuntime.createElement("div", {
        className: "dyx-resize-handle",
        role: "separator",
        tabIndex: 0,
        "aria-label": "调整云效工作台宽度",
        "aria-orientation": "vertical",
        "aria-valuemin": MIN_PANEL_WIDTH,
        "aria-valuemax": MAX_PANEL_WIDTH,
        "aria-valuenow": panelWidth,
        onPointerDown: beginResize,
        onKeyDown: resizeByKeyboard
      }),
      ReactRuntime.createElement("div", { ref: hostRef, className: "dyx-slot-host" }));
  }

  function onWindowResize() { applyPanelWidth(preferredPanelWidth, false); }
  window.addEventListener("resize", onWindowResize);

  function SidebarTrigger(props) {
    var wide = Boolean(props && props.wide);
    var countState = ReactRuntime.useState(notifier.snapshot().lastResultCount);
    var count = countState[0];
    var setCount = countState[1];
    ReactRuntime.useEffect(function () {
      return notifier.subscribe(function (value) { setCount(value.lastResultCount); });
    }, []);
    return ReactRuntime.createElement("button", {
      type: "button",
      className: "dyx-sidebar-trigger",
      "data-wide": wide ? "true" : "false",
      "aria-label": "打开云效工作台",
      title: wide ? undefined : "云效工作台",
      // 面板已打开时再次点击：重新置顶，从另一插件的面板下面翻上来。
      onClick: function () {
        setPanelOpen(true);
        if (activePanelElement) raiseWorkspacePanel(activePanelElement);
      }
    },
    ReactRuntime.createElement("span", { className: "dyx-sidebar-trigger-mark", "aria-hidden": "true" }, "云"),
    wide ? ReactRuntime.createElement("span", null, "云效工作台") : null,
    count ? ReactRuntime.createElement("span", { className: "dyx-sidebar-trigger-count", "aria-label": "当前 " + count + " 条未处理缺陷" }, count > 99 ? "99+" : String(count)) : null);
  }

  ctx.slots.inject("sidebar.footer.action", function () { return ctx.slots.register({
    name: "sidebar.footer.action",
    id: "dsh-yunxiao",
    label: "云效工作台"
  }, SidebarTrigger); });

  ctx.slots.inject("shell.overlay", function () { return ctx.slots.register({
    name: "shell.overlay",
    id: "dsh-yunxiao-workspace",
    label: "云效工作台"
  }, RightWorkspace); });

  ctx.effect(function () { return function () {
    panelOpen = false;
    panelListeners.clear();
    notifier.dispose();
    restoreWorkspaceFrame();
    window.removeEventListener("resize", onWindowResize);
    document.documentElement.classList.remove("dyx-resizing");
    closeHostDetails();
    if (!existingStyle) style.remove();
  }; }, "dsh-yunxiao: reserved right workspace");
}

exports.apply = apply;
exports.inject = ["slots", "layout", "sessions", "workspaces"];
return module.exports;
} });
