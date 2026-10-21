# aura-tab 源码调研

调研日期：2026-10-19。外部仓库固定在 [a706cee56e43b80777de697dd4462083b1f97ef8](https://github.com/nil-byte/aura-tab/tree/a706cee56e43b80777de697dd4462083b1f97ef8)，其 manifest 版本为 3.5.3；对照本地 chrome_nav 的 `3def973207e973c70d4c3bf28724ac0e8783e274` 工作区。结论来自源码静态阅读，以及下述本地图标回退的内存 DOM 模拟；未执行外部仓库脚本或测试。性能改善需实测，不能从实现直接推断具体提速。

最值得迁移的是网站图标的完整发现、解码与缓存链路，其次是首屏恢复和包含本地资源的备份。桌面式 Dock、窗口外观与水果导航当前产品定位不同，优先借鉴底层机制。

## 网站图标处理

核心结论：Aura Tab 将网站图标做成了一套“发现来源、验证和评分、缓存图片、渲染回退”的流程。Google S2 仍在代码里，但处于自动发现的末级第三方候选；不能简单概括为换用了另一个图标服务。[来源：自动发现与评分][icon-worker]

### 实际调用链

1. **区分图片图标和文字外观。** Dock、Launchpad 共用 icon-renderer。配置了文字外观时直接画文字；图片模式向共享加载器传入页面 URL、真正的自定义图标 URL 和缓存键，预览面板也使用同一加载器。[来源：共享渲染器][icon-renderer]、[编辑预览][icon-preview]
2. **先查本机缓存。** IndexedDB 命中后，把图片 Blob 转成 object URL 展示；自定义图标会核对缓存来源。缓存损坏时删除并回退。自定义 URL 未命中时先下载该 URL；没有自定义图标才进入页面图标发现。[来源：缓存优先分支][icon-loader]
3. **后台发现网站声明的图标。** Service Worker 获取 HTML，offscreen 文档用 DOMParser 解析 rel=icon、apple-touch-icon 和 Web Manifest。Manifest 中继续解析 icons，补全相对 URL，并排除 monochrome 图标。解析器没有执行目标网页脚本。[来源：offscreen 解析器][icon-parser]
4. **合并候选并验证质量。** 后台把网页声明、Manifest、Chrome 的 /_favicon/（128、64）和根目录 favicon.ico / favicon.png / apple-touch-icon.png 合并去重，按声明尺寸排序后最多保留 12 项并发检查。先看响应是否为图片，再实际解码取得尺寸，按来源、格式、尺寸评分；主来源中最大边小于 32px 的非 SVG 图片不进入优选。主来源没有合格结果时才尝试 Vemetric 和 Google S2。[来源：候选、评分、发现][icon-worker]
5. **缓存图片本身。** 图像二进制经消息桥返回前台，存入 IndexedDB，并保存来源 URL、来源类型、宽高、评分、时间等元信息；再次打开新标签页时可从本机读取，而不只是再次使用同一远程 URL。[来源：消息桥][icon-bridge]、[缓存结构][icon-cache-data]
6. **等待时有文字占位，失败时有首字回退。** 成功后移除占位；使用加载 token 防止旧请求覆盖新请求的结果，使用 object URL 注册与 pagehide 清理管理 Blob URL。[来源：渲染器][icon-renderer]、[加载状态][icon-loader]、[Blob URL 管理][icon-objecturl]

Chrome 官方支持的地址形式为：

```text
chrome-extension://扩展ID/_favicon/?pageUrl=编码后的网站网址&size=64
```

它通过 runtime.getURL('/_favicon/') 构造，需声明 favicon 权限。这里是浏览器提供的扩展端点，不是自己调用 Google S2；但也不能据此保证任意网站都有高清图标。[来源：Chrome 官方 favicon 文档](https://developer.chrome.com/docs/extensions/how-to/ui/favicons)

### 缓存实现值得借鉴的细节

| 机制 | Aura Tab 实现 | 对当前项目的价值 |
| --- | --- | --- |
| 图片存储 | IndexedDB 存 Blob，不把全部图片塞进导航 JSON | 离线可展示，减少新标签页重复依赖网络 |
| 缓存键 | v2 + 规范化页面完整 URL + 自定义图标 URL；去掉 hash，保留路径、端口等 | 不同应用路径或不同自定义图标不会简单按域名串图 |
| 存储边界 | 单图 512 KiB、总图像数据 20 MiB、1000 条目标上限 | 适合参考，但应按本项目实际站点规模调整 |
| 淘汰 | 按 lastAccessedAt 由旧到新，每批最多删除 50 条 | 属于按近期访问淘汰；上限通过写入后的异步清理维持，并非硬事务限额 |
| 负缓存 | 内存 Map 记录失败，24 小时过期 | 可跳过重复自动发现；它没有持久化，且命中后仍会尝试直接图片候选 |
| 刷新 | 编辑链接时提供刷新图标，清除负缓存后重新下载或发现 | 换品牌、旧图或临时失败时，用户有明确修复入口 |

来源：[缓存配置][icon-cache-config]、[缓存键][icon-key]、[淘汰][icon-eviction]、[负缓存][icon-negative]、[手动刷新][icon-refresh]。

### 对照当前 chrome_nav 的差距

| 环节 | 当前正式代码 | 可借鉴方案 |
| --- | --- | --- |
| 默认来源 | 飞书“备用图标”有值则使用，否则生成 Google S2 64px URL；表单也会生成 S2 地址 | 明确自动图标与自定义图标，自动模式优先浏览器/网站自身来源 |
| 持久化 | site-logo-manager 的 local 为 null；正式页面未接入原型里的本地图片缓存 | 运行时下载到扩展自己的 IndexedDB，不把私人站点图片写进安装包 |
| 备用来源 | 设计上尝试站点根目录 favicon.ico，但当前 DOM 下取不到站点 URL | 从站点数据显式传入 URL，或明确写到卡片 data 属性 |
| 质量验证 | 图片 naturalWidth > 0 即接受 | 检查图片类型、解码、尺寸，优选适合展示的图片 |
| 展示入口 | 首页、快速搜索各自渲染，再由 MutationObserver 后处理 | 首页、搜索、编辑预览共用一个带缓存的加载接口 |

本地源码：[飞书默认图标](D:/AI/chrome_nav/js/modules/feishu-api.js:39)、[表单默认图标](D:/AI/chrome_nav/js/modules/link-manager-core.js:101)、[正式图标管理器](D:/AI/chrome_nav/js/modules/site-logo-manager.js:6)、[首页卡片](D:/AI/chrome_nav/js/modules/ui-renderer.js:283)、[搜索结果模板](D:/AI/chrome_nav/js/modules/quick-search-manager.js:344)。

**已验证的当前问题：** site-logo-manager.js 第 12–18 行通过 card 本身或后代的 a.href 获取 siteUrl；首页卡片实际为 div，搜索结果实际为 li，两者没有对应 a。因此 new URL(siteUrl) 失败，站点 /favicon.ico 不会加入候选。在内存 DOM 桩中运行原脚本，模拟原图加载失败：现有 div/li 结构只尝试原图 URL，随后显示首字；补一个 a 的对照结构才会再尝试 https://example.com/favicon.ico。这是源码加隔离模拟结论，尚未在已安装扩展中做真实网络验证。本次未修改产品代码。

### 建议迁移顺序

1. **P0：修正站点 URL 的传递，统一首页、搜索、预览的加载接口。** 保留现有 no-referrer、单候选 2.2 秒/总预算 6.5 秒的可预期回退，避免只增加来源却延长等待。
2. **P0：接入 Chrome favicon 和 IndexedDB 图片缓存。** 保留飞书的手动图标优先级。新增或更新链接时获取，首屏优先显示缓存和文字占位；补刷新单个图标与清理缓存入口。
3. **P1：按需增加 HTML / Manifest 图标发现与质量筛选。** 对失败站点启用后台增强发现，给整个应用设置并发上限和同键请求合并；第三方服务作为可控制的最后一级回退。

迁移时要先处理数据语义：当前 icon 字段可能是自动生成的 Google S2 URL。如果直接把它当成 Aura 的 customIconUrl，加载器会进入自定义分支，跳过自动发现。建议显式区分 iconMode=auto/custom/text 与 customIconUrl；自动解析得到的图片和元信息留在缓存层。旧数据转换时需要区分系统生成地址与用户手填地址。[来源：当前默认生成逻辑与 Aura 的模式分支][icon-loader]

### 不宜直接照搬的地方

- **权限范围：** Aura 声明了 favicon、offscreen 以及所有 HTTP/HTTPS 站点的 host_permissions；本项目现在只有飞书主机权限。普通 img 显示图片与 fetch 读取图片二进制不是同一件事，不能把当前 img 能显示误当成已经能下载并缓存；网站 HTML 和远程图像的读取需要设计相应权限策略。[Aura manifest][icon-manifest]、[Chrome 官方跨域请求文档](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- **永久缓存：** 当前默认 TTL=-1，且读取旧的合法 7/30 天设置时也会改写成永久。不能描述成默认定期刷新。可借鉴它的手动刷新，或为本项目另设可控更新时间。[来源：TTL 加载][icon-ttl]
- **首次并发与超时：** 每站最多 12 个主候选同时检查，不等于整个页面最多 12 个请求；所读发现路径没有全局请求池或同键请求合并。后台 fetchLimited 有单请求 3 秒预算，但整次发现还包括 HTML、多个 Manifest、图片解码等步骤，不能声称整个流程 3 秒必定结束；直接 img 候选回退也没有显式超时。[来源：自动发现][icon-worker]、[图片回退][icon-img-fallback]
- **无法识别所有错误图案：** 类型和尺寸合格并不代表图片语义正确；第三方返回的通用地球图标仍可能被当成可用图片。抓取也没有执行站点 JS，客户端动态注入的图标可能发现不到。需要保留手动图标和首字回退。[来源：解析器][icon-parser]、[评分][icon-worker]

[icon-worker]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/background-worker.js#L218-L354
[icon-renderer]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/domains/quicklinks/icon-renderer.js#L52-L105
[icon-preview]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/domains/quicklinks/link-manager.js#L504-L530
[icon-loader]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/shared/favicon.js#L80-L196
[icon-parser]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/favicon-offscreen.js#L22-L90
[icon-bridge]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/icon-fetch-bridge.js#L65-L107
[icon-cache-config]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/icon-cache.js#L10-L27
[icon-cache-data]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/icon-cache.js#L287-L325
[icon-key]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/shared/text.js#L87-L113
[icon-eviction]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/icon-cache.js#L400-L434
[icon-negative]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/icon-cache.js#L575-L620
[icon-objecturl]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/shared/favicon.js#L208-L342
[icon-refresh]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/domains/quicklinks/index.js#L388-L437
[icon-manifest]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/manifest.json#L7-L19
[icon-ttl]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/icon-cache.js#L93-L110
[icon-img-fallback]: https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/shared/favicon.js#L391-L463

## 其他可借鉴设计

### 1. 首屏快照与明确的背景交接（P1）

**做法：** [newtab.html 第 7–9 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/newtab.html#L7-L9) 在样式表之前加载首屏脚本；它读取带时间戳的颜色、壁纸预览，过期则忽略，先铺底色和预览。[快照读取与有效期](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/boot/first-paint.js#L87-L99)、[首屏应用](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/boot/first-paint.js#L171-L195)。正式背景应用后等待两个动画帧再撤预览，另设 3 秒兜底；预览淡出有清理保护。[交接控制](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/main.js#L50-L66)、[淡出清理](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/boot/first-paint.js#L198-L243)。

**当前项目：** [sidebar-state-init.js](D:/AI/chrome_nav/js/sidebar-state-init.js:1) 已有提前恢复侧栏的同类思路；[app.js](D:/AI/chrome_nav/js/app.js:29) 的主题和字体仍在异步初始化，[background-manager.js](D:/AI/chrome_nav/js/modules/background-manager.js:94) 需图片加载后才提交。没有对应的壁纸首屏快照。

**迁移建议与风险：** 先同步恢复主题底色，再为上传壁纸保存小尺寸预览；以“背景实际呈现”事件交接。限制预览体积和有效期，异常时显示安全默认色，避免同步读写大图拖慢首屏。此项收益是降低视觉跳变，尚无测量证明当前页面存在多严重闪动。

### 2. 备份完整本地状态，导入先暂存验证（P1）

**做法：** [backup-manager.js 第 13–55 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/backup-manager.js#L13-L55) 将图标、图片资源、上传原图等 IndexedDB 数据纳入备份；[第 420–457 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/backup-manager.js#L420-L457) 同时写入 storage 数据及格式版本。恢复先解压到暂存库，检查 schema、版本与完整性，再写正式存储，最后清理暂存库。[恢复流程](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/backup-manager.js#L84-L155)。

**当前项目：** [README 第 277 行](D:/AI/chrome_nav/README.md:277) 只建议在飞书备份表格；[storage.js](D:/AI/chrome_nav/js/modules/storage.js:354) 的主题设置、[background-storage.js](D:/AI/chrome_nav/js/modules/background-storage.js:1) 的上传背景、果园状态属于浏览器本地数据，表格备份不能完整恢复页面体验。

**迁移建议与风险：** 先提供本地 ZIP 导出/导入，覆盖站点快照、偏好、背景 Blob、果园状态；配置格式版本和导入预检，敏感凭据默认排除。Aura 的恢复是 storage 和多个 IndexedDB 顺序写入，并非跨库原子事务；迁移时需设计失败回滚或先备份原状态。WebDAV 可后续再做，不必一起引入。

### 3. 弹层统一注册层级，关闭最上层并恢复焦点（P2）

**做法：** [modal-layer.js 第 171–215 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/modal-layer.js#L171-L215) 统一登记弹层优先级、点击命中区域与外部点击策略；[第 305–323 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/platform/modal-layer.js#L305-L323) 让 Escape 只关闭最高层的最上方弹层。[focus-restoration.js 第 63–81 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/shared/focus-restoration.js#L63-L81) 把原焦点与后备目标恢复封装出来。

**当前项目：** [quick-search-manager.js](D:/AI/chrome_nav/js/modules/quick-search-manager.js:201) 已保存和恢复搜索前焦点，也会让原生 dialog 接管按键；但 [home-keyboard.js](D:/AI/chrome_nav/js/modules/home-keyboard.js:5)、搜索和 [link-manager.js](D:/AI/chrome_nav/js/modules/link-manager.js:50) 的模态交互分散，没有统一的弹层注册机制。

**迁移建议与风险：** 保留现有原生 dialog，新增小型弹层协调器，让搜索、编辑、删除确认共用关闭优先级和焦点归还规则。避免直接复制 Aura 整个窗口系统；需验证中文输入法、文本输入、点击穿透，以及弹层关闭时原按钮已被重绘移除的情况。

### 4. 书签导入拆成解析、预览、执行三步（P2）

**做法：** [importer.js 第 31–94 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/domains/bookmarks/importer.js#L31-L94) 从 Chrome 书签树解析，建立已有 URL 集合，预览时选择目录、去重、统计超限量；[第 96–164 行](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/scripts/domains/bookmarks/importer.js#L96-L164) 把执行限制为最多 500 条，批量写入并返回成功/失败数。目录分页与去重属于独立逻辑，不直接塞进界面事件。

**当前项目：** [link-manager.js](D:/AI/chrome_nav/js/modules/link-manager.js:4) 聚焦飞书站点 CRUD；[manifest.json](D:/AI/chrome_nav/manifest.json:40) 目前只请求 storage、alarms，没有读取浏览器书签的权限。没有批量迁移入口，新用户需要先整理飞书数据。

**迁移建议与风险：** 可把书签目录映射到现有分类，在预览中展示重复数与目标飞书表格，确认后复用同步服务批量写入。先建立 URL 协议白名单和清楚的去重规则；书签标题同名、目录重名、嵌套结构与飞书速率限制需要另行处理。若产品仍坚持飞书为唯一入口，此项优先级低于图标与备份。

## 采用顺序

1. 修复当前网站图标回退的调用契约，再建设获取服务和缓存。
2. 加入首屏主题/壁纸预览交接。
3. 补完整本地备份，再考虑可选云备份。
4. 随弹层数量增长引入协调器；按用户迁移需求安排书签导入。

## 源码使用范围

此处只记录调研建议，未修改产品代码。仓库为 [MIT License](https://github.com/nil-byte/aura-tab/blob/a706cee56e43b80777de697dd4462083b1f97ef8/LICENSE#L1-L21)，若直接迁入源码，应保留适用的版权和许可声明；单纯借鉴方案不需要引入其完整依赖与权限。

