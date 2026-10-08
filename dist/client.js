// dsh-yunxiao — 无框架、无构建步骤的轻量 Web 工作台。
window.__ModuleLoader__.load({ id: "dsh-yunxiao", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
var ReactRuntime = null;
try { ReactRuntime = require("react"); } catch (error) {}

var STYLE_ID = "dsh-yunxiao-style";
var ROOT_ID = "dsh-yunxiao-root";
var PAGE_SIZE = 5;
var PANEL_WIDTH_STORAGE_KEY = "dsh-yunxiao:panel-width";
var DEFAULT_PANEL_WIDTH = 480;
var MIN_PANEL_WIDTH = 380;
var MAX_PANEL_WIDTH = 1080;
var DEFAULT_NOTIFICATION_INTERVAL = 5;
var NOTIFICATION_MINUTE_MS = Math.max(100, Number(window.__DYX_NOTIFICATION_MINUTE_MS__) || 60 * 1000);

var CSS = [
  // 设计变量：浅色为默认，深色跟随系统。整体走“柔和分层”：不用硬描边，
  // 层级靠底色深浅与柔和投影表达；分隔仅保留极浅发丝线（表格、弹窗头尾）。
  ":root{color-scheme:light;--dyx-bg:#f2f4f8;--dyx-panel:#ffffff;--dyx-panel2:#f4f6f9;--dyx-field:#f2f4f8;--dyx-hover:#e9edf3;--dyx-tag:#eef1f6;--dyx-text:#202836;--dyx-muted:#68758c;--dyx-line:#edf0f5;--dyx-line-strong:#dde2ea;--dyx-brand:#3565e0;--dyx-brand-solid:#3565e0;--dyx-brand-weak:rgba(53,101,224,.1);--dyx-danger:#d6453f;--dyx-danger-weak:rgba(217,73,63,.09);--dyx-ok:#17754c;--dyx-ok-weak:rgba(46,166,109,.12);--dyx-warn:#a56207;--dyx-warn-weak:rgba(235,164,74,.16);--dyx-status-pending:#96660e;--dyx-status-pending-bg:rgba(236,164,60,.16);--dyx-status-pending-line:transparent;--dyx-status-processing:#3a67d6;--dyx-status-processing-bg:rgba(58,116,222,.09);--dyx-status-processing-line:transparent;--dyx-status-reopened:#a3567f;--dyx-status-reopened-bg:rgba(210,96,150,.11);--dyx-status-reopened-line:transparent;--dyx-shadow:0 24px 60px rgba(15,23,42,.16),0 4px 14px rgba(15,23,42,.06);--dyx-shadow-sm:0 1px 2px rgba(16,24,40,.04),0 6px 16px rgba(16,24,40,.05)}",
  "@media(prefers-color-scheme:dark){:root{color-scheme:dark;--dyx-bg:#12161d;--dyx-panel:#1a1f28;--dyx-panel2:#20262f;--dyx-field:#1d232c;--dyx-hover:#272e39;--dyx-tag:#242b35;--dyx-text:#e8ecf3;--dyx-muted:#8b98ad;--dyx-line:#262d37;--dyx-line-strong:#333c49;--dyx-brand:#8aabff;--dyx-brand-solid:#3b6ce0;--dyx-brand-weak:rgba(138,171,255,.14);--dyx-danger:#ef8377;--dyx-danger-weak:rgba(242,121,107,.11);--dyx-ok:#53c896;--dyx-ok-weak:rgba(83,200,150,.13);--dyx-warn:#e5ab52;--dyx-warn-weak:rgba(232,163,61,.14);--dyx-status-pending:#e3b968;--dyx-status-pending-bg:rgba(229,178,93,.12);--dyx-status-pending-line:transparent;--dyx-status-processing:#96b3f2;--dyx-status-processing-bg:rgba(143,181,255,.12);--dyx-status-processing-line:transparent;--dyx-status-reopened:#e89ec0;--dyx-status-reopened-bg:rgba(239,154,189,.12);--dyx-status-reopened-line:transparent;--dyx-shadow:0 24px 64px rgba(0,0,0,.5),0 4px 16px rgba(0,0,0,.3);--dyx-shadow-sm:0 1px 2px rgba(0,0,0,.2),0 6px 16px rgba(0,0,0,.2)}}",
  ".dyx-root,.dyx-root *{box-sizing:border-box}",
  ".dyx-slot-host{width:100%;height:100%;min-height:0}",
  ".dyx-right-panel{position:absolute;inset:0 0 0 auto;width:var(--dyx-workspace-width,480px);min-width:0;overflow:hidden;pointer-events:auto;background:var(--dyx-bg);box-shadow:-12px 0 32px rgba(15,23,42,.08)}",
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
  ".dyx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.dyx-account{padding:13px;border:0;border-radius:13px;background:var(--dyx-panel2);transition:box-shadow .15s,background .15s}.dyx-account:hover{background:var(--dyx-hover)}.dyx-account.active{background:color-mix(in srgb,var(--dyx-brand) 7%,var(--dyx-panel));box-shadow:0 0 0 2px color-mix(in srgb,var(--dyx-brand) 32%,transparent)}",
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
  ".dyx-drawer{position:absolute;inset:0;z-index:30;overflow:hidden;background:var(--dyx-bg);animation:dyx-slide-in .18s ease-out}@keyframes dyx-slide-in{from{transform:translateX(20px);opacity:.6}to{transform:none;opacity:1}}",
  ".dyx-modal{width:100%;height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:var(--dyx-panel)}",
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
  "@container(max-width:430px){.dyx-main{padding:12px 14px 20px}.dyx-notify-grid,.dyx-project-row{grid-template-columns:1fr}.dyx-defect-filters .dyx-field{width:140px}.dyx-pipeline-filters .dyx-field{width:150px}.dyx-defect-row .dyx-inline-status{width:88px}.dyx-defect-row-assignee{max-width:96px}.dyx-title{display:block}.dyx-title>.dyx-btn,.dyx-title>.dyx-actions{margin-top:8px}.dyx-modal-body{padding:12px}.dyx-head{flex-wrap:wrap;gap:8px;padding:8px 10px 8px 14px}.dyx-nav{order:3;width:100%}.dyx-nav button{flex:1;min-height:30px;padding:5px 10px;font-size:12.5px}.dyx-status-row{align-items:stretch;flex-direction:column}.dyx-status-row .dyx-field{min-width:0;width:auto}}",
  "@media(max-width:760px){.dyx-preview-host{inset:0;width:100%;border-radius:0}}"
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

function applyDefectStatusTone(select, statusName) {
  select.classList.remove("dyx-status-pending", "dyx-status-processing", "dyx-status-reopened");
  var normalized = String(statusName || "").trim();
  if (["待确认", "未确认"].indexOf(normalized) >= 0) select.classList.add("dyx-status-pending");
  else if (normalized === "处理中") select.classList.add("dyx-status-processing");
  else if (["再次打开", "重新打开", "REOPEN", "REOPENED"].indexOf(normalized.toUpperCase()) >= 0) select.classList.add("dyx-status-reopened");
}

function applyDefectRecordTone(card, statusName) {
  card.classList.remove("dyx-record-status-pending", "dyx-record-status-processing", "dyx-record-status-reopened");
  var normalized = String(statusName || "").trim();
  if (["待确认", "未确认"].indexOf(normalized) >= 0) card.classList.add("dyx-record-status-pending");
  else if (normalized === "处理中") card.classList.add("dyx-record-status-processing");
  else if (["再次打开", "重新打开", "REOPEN", "REOPENED"].indexOf(normalized.toUpperCase()) >= 0) card.classList.add("dyx-record-status-reopened");
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
    lastSystemStatus: "尚未触发"
  };

  function copySnapshot() {
    return Object.assign({}, snapshot, {
      settings: Object.assign({}, snapshot.settings),
      assignees: snapshot.assignees.slice()
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
  var box = node("div", "dyx-modal");
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
    tab: "defects",
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
    if (state.tab === "overview") renderOverview();
    if (state.tab === "defects") renderDefects();
    if (state.tab === "pipelines") renderPipelines();
  }

  function renderOverview() {
    var section = node("section", "dyx-section");
    var title = node("div", "dyx-title");
    var copy = node("div");
    copy.append(node("h2", "", "设置"), node("p", "", "维护云效账号与当前项目；所有数据保存在一个 JSON 文本文件中。"));
    title.append(copy, button("新增账号", "primary", function () { openAccountForm(null); }));
    section.append(title);

    var accountsCard = node("div", "dyx-card");
    var accountsHead = node("div", "dyx-card-head");
    accountsHead.append(node("h3", "", "云效账号"), node("small", "", state.server.accounts.length + " 个"));
    accountsCard.append(accountsHead);
    if (!state.server.accounts.length) {
      accountsCard.append(empty("还没有云效账号", "新增账号后即可读取项目、缺陷和流水线。"));
    } else {
      var grid = node("div", "dyx-grid");
      state.server.accounts.forEach(function (account) {
        var card = node("div", "dyx-account" + (account.id === state.server.selectedAccountId ? " active" : ""));
        var top = node("div", "dyx-account-top");
        var avatar = node("div", "dyx-avatar", (account.name || "云").slice(0, 1));
        var grow = node("div", "dyx-grow");
        grow.append(node("strong", "", account.name), node("small", "", account.organizationId));
        var actions = node("div", "dyx-actions");
        actions.append(
          button("编辑", "", function () { openAccountForm(account); }),
          button("删除", "danger", function () { removeAccount(account); })
        );
        actions.addEventListener("click", function (event) { event.stopPropagation(); });
        top.append(avatar, grow, node("span", "dyx-badge " + (account.hasToken ? "ok" : "fail"), account.hasToken ? "令牌已配置" : "缺少令牌"), actions);
        top.addEventListener("click", function () { chooseAccount(account.id); });
        card.append(top);
        grid.append(card);
      });
      accountsCard.append(grid);
    }
    section.append(accountsCard);

    var projectCard = node("div", "dyx-card");
    var projectHead = node("div", "dyx-card-head");
    projectHead.append(node("h3", "", "当前项目"), button("从云效刷新", "", loadProjects));
    projectCard.append(projectHead);
    var account = selectedAccount();
    if (!account) {
      projectCard.append(empty("请先选择账号", "项目按账号和组织分别读取。"));
    } else {
      var row = node("div", "dyx-project-row");
      var select = node("select", "dyx-select");
      var placeholder = node("option", "", state.projects.length ? "选择一个项目" : "点击右侧按钮读取项目");
      placeholder.value = "";
      select.append(placeholder);
      state.projects.forEach(function (project) {
        var option = node("option", "", project.name);
        option.value = project.id;
        if (account.selectedProject && account.selectedProject.id === project.id) option.selected = true;
        select.append(option);
      });
      row.append(select, button("设为当前项目", "primary", function () {
        var project = state.projects.find(function (item) { return item.id === select.value; });
        if (!project) return toast("请选择项目", true);
        setBusy(projectCard, true);
        rpc("project.select", { accountId: account.id, project: project })
          .then(loadState)
          .then(function () { return notifier ? notifier.refresh() : null; })
          .then(function () { notificationAssigneesScope = ""; toast("已切换到“" + project.name + "”"); render(); })
          .catch(function (error) { toast(error.message, true); })
          .finally(function () { setBusy(projectCard, false); });
      }));
      projectCard.append(row);
      var current = node("div", "dyx-current");
      if (account.selectedProject) current.append(node("span", "", "当前："), node("strong", "", account.selectedProject.name), node("span", "", "  ·  " + account.selectedProject.id));
      else current.textContent = "尚未选择项目。选择后，缺陷与流水线页面会自动使用该项目上下文。";
      projectCard.append(current);
    }
    section.append(projectCard);
    renderWorkspaceBinding(section, account);
    main.append(section);
  }

  // DSH 工作区绑定：按账号+项目保存；绑定后缺陷列表可一键处理到该工作区的会话。
  function renderWorkspaceBinding(section, account) {
    var project = account && account.selectedProject || null;
    var workspace = account && account.workspace || null;
    var card = node("div", "dyx-card");
    var head = node("div", "dyx-card-head");
    head.append(node("h3", "", "DSH 工作区绑定"), node("span", "dyx-badge " + (workspace ? "ok" : ""), workspace ? "已绑定" : "未绑定"));
    card.append(head);
    if (!account || !project) {
      card.append(empty(!account ? "请先选择账号" : "请先选择项目", "工作区绑定按账号和项目分别保存。"));
      section.append(card);
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
    section.append(card);
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
    copy.append(node("h2", "", "缺陷"), node("p", "", "实时读取云效工作项，按创建时间从新到旧排列；页面底部可配置新增缺陷提醒。"));
    title.append(copy, button("刷新", "", loadDefects));
    section.append(title);
    if (!renderRequirement(section)) { main.append(section); return; }
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
    if (!state.defects.items.length) card.append(empty("暂无缺陷", "可调整关键词后重新查询。"));
    else card.append(defectTable(state.defects.items));
    card.append(pager(state.defects, onPage));
    section.append(card);
    // 缺陷通知按账号+项目生效，配置与未处理数展示在缺陷页底部，不再放在设置页。
    renderDefectNotification(section, selectedAccount());
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

  // 列表压缩为两行：标题独占一行超长省略，负责人、状态、创建时间与操作按钮同行。
  function defectTable(items) {
    var wrap = node("div", "dyx-record-list");
    items.forEach(function (item) {
      var row = node("article", "dyx-record dyx-defect-row");
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
      var assignee = node("span", "dyx-defect-row-assignee", item.assignedToName || "未分配");
      assignee.title = "负责人 " + (item.assignedToName || "未分配");
      var time = node("span", "dyx-defect-row-time", shortDateTime(item.gmtCreate || item.gmtModified));
      time.title = "创建 " + formatDate(item.gmtCreate || item.gmtModified);
      var meta = node("div", "dyx-defect-row-meta");
      var actions = node("div", "dyx-actions");
      fillDefectRowActions(actions, item);
      meta.append(assignee, statusSelect, time, actions);
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
  // 修改成功返回后等半秒再刷新，避开索引延迟。
  function reloadDefectsSoon() {
    setTimeout(function () {
      if (state.tab === "defects" && selectedProject()) loadDefects();
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

  function loadDefects() {
    if (!selectedProject()) return render();
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
      var files = node("div", "dyx-attachments");
      detail.attachments.forEach(function (file) { files.append(attachmentRow(item, file)); });
      dialog.body.append(files);
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
    var card = node("div", "dyx-card");
    var keyword = input("text", "流水线名称", state.pipelineKeyword);
    function onPage(next) { state.pipelines.page = next; loadPipelines(); }
    var filters = node("div", "dyx-pipeline-filters");
    filters.append(field("关键词", keyword), button("查询", "primary", function () { state.pipelineKeyword = keyword.value.trim(); state.pipelines.page = 1; loadPipelines(); }), button("清空", "", function () { state.pipelineKeyword = ""; state.pipelines.page = 1; loadPipelines(); }));
    var toolbar = node("div", "dyx-list-toolbar");
    toolbar.append(filters, pager(state.pipelines, onPage));
    card.append(toolbar);
    if (state.pipelines.stale) card.append(node("div", "dyx-stale", "云效暂时不可用，当前为 " + formatDate(state.pipelines.cachedAt) + " 的缓存。"));
    if (!state.pipelines.items.length) card.append(empty("暂无流水线", "当前账号在该组织中可能没有流水线权限。"));
    else card.append(pipelineTable(state.pipelines.items));
    card.append(pager(state.pipelines, onPage));
    section.append(card); main.append(section);
  }

  function pipelineTable(items) {
    var wrap = node("div", "dyx-record-list");
    items.forEach(function (item) {
      var card = node("article", "dyx-record dyx-record-clickable");
      // 整卡点击进入详情；按钮区域（详情/运行）保持自身行为，不冒泡重复触发。
      card.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        openPipeline(item);
      });
      var head = node("div", "dyx-record-head");
      head.append(node("span", "dyx-badge", "#" + item.id), node("span", "dyx-badge " + statusClass(item.status), item.status || "暂无运行"));
      var title = node("button", "dyx-link dyx-record-title", item.name || "未命名流水线");
      title.type = "button";
      title.addEventListener("click", function () { openPipeline(item); });
      var foot = node("div", "dyx-record-foot");
      var actions = node("div", "dyx-actions");
      actions.append(button("详情", "", function () { openPipeline(item); }), button("运行", "primary", function () { openRunPipeline(item); }));
      foot.append(node("span", "dyx-muted", formatDate(item.updateTime)), actions);
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

  function openRunPipeline(pipeline) {
    var dialog = modal("运行流水线：" + pipeline.name, true);
    dialog.body.append(empty("正在读取代码源与分支", "Codeup 分支会自动加载；无论是否读取到，都可以手动输入分支名称。"));
    rpc("pipeline.branches", rpcArgs({ pipelineId: pipeline.id })).then(function (sources) {
      dialog.body.textContent = "";
      var form = node("div", "dyx-form");
      var sourceFields = [];
      (sources || []).forEach(function (source) {
        var branches = Array.from(new Set([source.defaultBranch].concat(source.branches || []).filter(Boolean)));
        var datalist = node("datalist");
        datalist.id = "dyx-branch-list-" + (++branchDatalistSeq);
        branches.forEach(function (branch) { var option = node("option", "", branch); option.value = branch; datalist.append(option); });
        form.append(datalist);
        var control;
        if (source.isBranchMode && branches.length) {
          control = node("select", "dyx-select");
          control.multiple = true;
          control.size = Math.min(5, Math.max(3, branches.length));
          branches.forEach(function (branch) { var option = node("option", "", branch); option.value = branch; option.selected = branch === source.defaultBranch; control.append(option); });
          control.setAttribute("aria-label", source.name + "运行分支");
          form.append(field(source.name + " · 运行分支（可多选）", control));
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
          form.append(customRow);
        } else {
          control = input("text", "留空使用流水线默认分支", source.defaultBranch || "");
          control.setAttribute("list", datalist.id);
          control.setAttribute("aria-label", source.name + "运行分支");
          form.append(field(source.name + (source.isBranchMode ? " · 运行分支（手动输入）" : " · 运行分支"), control));
        }
        if (source.warning) form.append(node("div", "dyx-note", source.warning));
        sourceFields.push({ source: source, control: control });
      });
      if (!sourceFields.length) form.append(empty("没有可配置的代码源", "将使用流水线默认配置运行。"));
      var commentInput = input("textarea", "可选，填写本次运行备注");
      form.append(field("运行备注", commentInput)); dialog.body.append(form);
      dialog.foot.textContent = ""; dialog.foot.append(button("取消", "", dialog.close), button("确认运行", "primary", function (event) {
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
        if (missingRepo.length) toast("这些代码源未识别到仓库地址，本次运行将使用流水线默认分支：" + missingRepo.join("、"), true);
        var submit = event.currentTarget; submit.disabled = true;
        rpc("pipeline.run.create", rpcArgs({ pipelineId: pipeline.id, branchModeBranches: branchModeBranches, runningBranches: runningBranches, comment: commentInput.value })).then(function (result) {
          dialog.close(); toast("流水线已开始运行，实例 #" + result.pipelineRunId); loadPipelines();
        }).catch(function (error) { toast(error.message, true); }).finally(function () { submit.disabled = false; });
      }));
    }).catch(function (error) { dialog.body.textContent = ""; dialog.body.append(empty("代码源读取失败", error.message)); });
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

  function mount(container) {
    root = node("div", "dyx-root"); root.id = ROOT_ID;
    shell = node("div", "dyx-shell");
    var head = node("header", "dyx-head"); var logo = node("div", "dyx-logo", "云"); var copy = node("div", "dyx-head-copy"); copy.append(node("strong", "", "云效工作台")); subtitle = node("span", "", "正在读取配置…"); copy.append(subtitle);
    var closeButton = button("×", "dyx-close", close); closeButton.setAttribute("aria-label", "关闭云效工作台");
    head.append(logo, copy);
    var body = node("div", "dyx-body"); var nav = node("nav", "dyx-nav");
    // 页签按使用频率排序：缺陷、流水线为工作区，账号/项目等配置收敛到设置页。
    [["defects", "缺陷"], ["pipelines", "流水线"], ["overview", "设置"]].forEach(function (item) {
      var tab = node("button", item[0] === state.tab ? "active" : ""); tab.type = "button"; tab.append(node("span", "", item[1])); tab.addEventListener("click", function () { setTab(item[0]); }); navButtons[item[0]] = tab; nav.append(tab);
    });
    // 布局：页签收进顶栏，与标题同一行，主体区整栏留给内容。
    main = node("main", "dyx-main"); head.append(nav, closeButton); body.append(main); shell.append(head, body); root.append(shell); (container || document.body).append(root);
    if (notifier) unsubscribeNotifier = notifier.subscribe(function () { if (root && state.tab === "defects") render(); });
    render();
    loadState().then(function () {
      render();
      if (state.tab === "defects" && selectedProject()) { loadDefects(); loadDefectFilterOptions(); }
      else if (state.tab === "pipelines" && selectedProject()) loadPipelines();
    }).catch(function (error) { toast(error.message, true); });
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
    if (activePanelElement) activePanelElement.style.setProperty("--dyx-workspace-width", panelWidth + "px");
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
      if (!frame) return;
      var match = String(frame.style.gridTemplateColumns || "").match(/^([\d.]+px)/);
      frame.style.setProperty("--dyx-sidebar-track", match ? match[1] : "280px");
      frame.style.setProperty("--dyx-workspace-width", panelWidth + "px");
      frame.setAttribute("data-dyx-workspace-open", "true");
      workspaceFrame = frame;
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
