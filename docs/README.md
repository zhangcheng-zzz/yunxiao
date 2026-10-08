# dsh-yunxiao

适用于 DeepSeek Harness 的轻量云效工作台插件：管理云效账号与项目、处理缺陷、查看与运行流水线。配置与缓存保存在一个 JSON 文本文件中，无需数据库，也不接收消息回调或 Webhook。

## 能力

- 入口：集成到 Harness 左侧栏底部，打开后占用框架预留的右侧列；可拖拽左边缘调整宽度，浏览器记住上次宽度。
- 页面：分“缺陷”“流水线”“设置”三个页签，默认进入缺陷页；提供跟随系统的浅色/深色两套配色。
- 账号与项目：维护多个云效组织 ID 与个人访问令牌，切换当前账号；为每个账号记住当前项目。
- 工作区绑定：设置页可为当前项目绑定一个 DSH 工作区（读取 Harness 工作区注册表，按账号+项目保存），绑定后可从缺陷列表或详情一键处理缺陷。
- 缺陷：按创建时间从新到旧分页，按状态/负责人筛选（状态选项按项目缺陷工作流去重拉取，接口异常时退回最近缺陷结果）；列表和详情中可直接修改状态与负责人，成功后自动刷新列表；“待确认”“处理中”“再次打开”的缺陷卡片使用柔和差异色；支持查看描述/评论/附件并以当前账号发布评论；附件与内联图片的直链有时效性，加载或下载失败时自动换取新地址重试。描述/评论中的图片与图片附件支持点击全屏预览（点击图片切换适应窗口/原始大小，Esc 或点击遮罩关闭），右键提供“预览图片 / 复制图片 / 下载图片”菜单：复制由客户端把图片统一转成 PNG 后，桌面端经宿主调用系统剪贴板写入（macOS 走 osascript，Windows 走 PowerShell Forms，不依赖浏览器剪贴板权限，也无跨域限制），浏览器环境回退 navigator.clipboard，再回退 execCommand 选中复制。
- 缺陷处理：“待确认”“再次打开”（含同义命名）状态的缺陷在列表和详情提供“草稿”“处理”两个直达按钮：读取缺陷详情后，在项目绑定的 DSH 工作区创建会话，带入缺陷标题和描述/附件中的图片（宿主侧换取直链并转 base64，最多 8 张，单张失败自动跳过；正文只保留标题，描述含文字时附在“缺陷描述”之后）。“草稿”只填入会话输入框不自动发送（优先复用工作区空白会话），“处理”新建会话直接发送；未绑定工作区时提示先到设置页绑定。
- 缺陷通知：按项目开启系统原生通知（自动识别平台：Windows 使用 Toast，macOS 使用通知中心；识别结果存入数据文件，之后不再重复判断，数据文件搬迁到其他平台时自动重新识别），可选择负责人和轮询间隔；自动检查“待确认/再次打开”的缺陷，桌面端每轮提交一条原生通知（失败时回退 Web 通知）；提供内部通知弹窗、“测试通知”“立即检查”等操作；侧栏角标与未处理数一致，处理后自动清零。
- 流水线：组织级列表、详情、代码源与分支、运行记录、阶段/任务与日志查看；手动运行时自动加载 Codeup 分支，单分支代码源可输入任意分支名，未识别仓库地址时提示使用默认分支；不接收环境变量。
- 模型工具：`yunxiao_list_defects` 和 `yunxiao_list_pipelines` 两个只读工具，默认读取工作台的当前账号与项目。
- 离线回退：项目、最近缺陷列表和流水线列表写入文本缓存，OpenAPI 暂时失败时展示缓存并标记时间。

插件不提供消息回调、Webhook 接收、通知规则或后台定时采集。

## 数据存储

默认数据文件为 Harness 启动工作目录下的：

```text
dsh-yunxiao.data.json
```

它是可直接查看、备份和编辑的 UTF-8 JSON 文件，不需要数据库。写入时先生成临时文件再原子替换，避免中途退出留下半个 JSON。

重要：个人访问令牌也会保存在这个文本文件中。Host 不会把令牌返回给浏览器，但文件本身不是加密保险箱。请限制文件访问权限，不要提交到 Git，也不要放入公开同步目录。如果部署环境要求加密凭据，应改用 Harness credentials 服务或操作系统密钥存储。

## 安装与更新

以下命令均在插件仓库根目录（即本仓库根目录）执行，命令中只使用仓库相对路径。

首次安装或改动后重新安装：

```powershell
# 从仓库目录安装（首次安装、或换用另一份源码目录时执行）
dsh plugin --profile web add -w .

# 校验组合配置中出现 dsh-yunxiao
dsh --profile web --dump-config
```

卸载：

```powershell
dsh plugin --profile web remove -w dsh-yunxiao
```

注意事项：

- 所有 `dsh plugin --profile web add/remove` 命令都必须带 `-w` 参数。web profile 目录本身是一个 pnpm workspace 根，缺少它时会报 `ERR_PNPM_ADDING_TO_ROOT` / `ERR_PNPM_REMOVING_ROOT`。
- 安装是 link 形式：profile 直接引用仓库中的插件源码目录。日常只修改 `dist/index.js` 或 `dist/client.js` 后，重启 Harness 实例即可加载最新代码；仅当插件的 `package.json` 变化（名称、入口、依赖、版本元数据等影响安装结果的字段）时才需要重新 `add`。
- 安装或重新安装后，必须重启正在运行的 Harness Web/Desktop 实例才能生效。

验证组合配置中应出现：

```yaml
- id: dsh-yunxiao
  name: dsh-yunxiao
```

安装后重启正在运行的 Harness Web/Desktop 实例。左侧栏底部会出现“云效工作台”入口，侧栏折叠时显示“云”图标。工作台固定在右侧列中打开，关闭后聊天区恢复完整宽度。

## 配置

可在 profile 的 `cordis.patch.yml` 中覆盖整行配置：

```yaml
- override:
    id: dsh-yunxiao
    name: dsh-yunxiao
    config:
      dataFile: 'D:/private/dsh-yunxiao.data.json'
      apiBaseUrl: 'https://openapi-rdc.aliyuncs.com'
      timeoutMs: 45000
      cacheMaxItems: 100
```

`apiBaseUrl` 只接受 HTTPS。`cacheMaxItems` 限制列表缓存数量，范围 10–500。

## 云效令牌权限

按实际使用功能给个人访问令牌授予最小权限：

- 项目读取；
- 工作项读取；
- 使用缺陷“草稿/处理”时需要工作项读取（读取缺陷详情与附件图片直链）；
- 修改缺陷状态时需要工作项写入；
- 在详情中更换缺陷负责人时需要工作项写入，读取项目负责人候选列表时需要项目成员只读权限；
- 发布缺陷评论时需要工作项评论读写权限；
- 流水线读取；
- 手动运行流水线时需要流水线运行权限；
- 读取 Codeup 分支时需要代码库/分支读取权限。

只使用查看功能时无需授予写权限。

## 开发验证

在插件仓库根目录运行：

```powershell
node --check .\dist\index.js
node --check .\dist\client.js
npm test
npm pack --dry-run
```

实现遵循 Harness 的可安装组合包结构：`dsh.bundle.patch` 挂载 Host 插件，`dsh.client` 在 Web 表面即时加载无框架 Client。参考：[DeepSeek Harness 插件基础](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)。
