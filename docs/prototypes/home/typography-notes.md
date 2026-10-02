# 中文字体探索与正式设置

最初探索 A（温和手写）、B（圆润活泼）、C（复古像素），使用 60 个中文为主的示例网站。运行 `npm run prototype:home` 可预览 `/docs/prototypes/home/typography.html?variant=A`；已有服务时不要重复启动。

2026-10-02 按用户要求全部保留为设置项，并统一全页字体（包含时间区域）。正式入口为 `options.html`，正文大小可选 14–20 px，默认 A / 16 px。修改先预览，保存后通过 chrome.storage.onChanged 更新打开的首页。网站名称最多两行，完整名称可悬停查看。

## A 加载问题

原型最初复制本机 `LXGWWenKai-Regular.ttf`，HTTP 200、长度及 SHA256 与本机文件一致，但浏览器报 NetworkError；fontTools 解析 cmap 表时 IndexError。换用 Google Fonts 发布的霞鹜文楷 TC Regular，完整转为 WOFF2，未裁剪字符。浏览器实际解析及 Canvas 度量确认三款字体均 loaded=1，且字形度量均与系统回退字体不同。诊断入口为 `font-probe.html`。

## 资源与验证

- 正式字体资源及 OFL 授权见 `css/fonts/README.md`，三款字体均离线打包；未覆盖的生僻字由系统字库补齐。
- 字体原型复用正式资源，通过底部按钮或左右方向键切换；并排对比展示同一份文字。
- 开发预览使用隔离的模拟存储，无真实飞书请求；字体预览偏好仅保存在 chromeNav_previewTypography。
- 浏览器验证了 A/B/C 实际加载、保存重载、跨页面更新、全页字体一致、搜索输入焦点及深色布局；responsive-check.html 用 390 px iframe 检查真实窄视口，无水平溢出。
- npm test：77 项通过。字体模块测试覆盖非法配置、字号范围、持久化、存储失败及跨页面更改/删除。

原型、截图和诊断页在 docs 下，扩展打包不包含 docs。正式 HTML、CSS、脚本和字体资源在根目录、css 与 js 下。
