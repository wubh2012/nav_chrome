# 无分类木牌首页

正式入口为 `newtab.html`。保留天空、时间、搜索和果园交互，网站区使用横向木牌、两侧像素叶子与右侧两颗木结。全部网站统一显示；分类数据继续用于搜索、编辑与同步。

用户点击网站果园右侧「调色」，可调整底色、悬停色、描边、阴影、文字颜色、木结颜色、明亮度、饱和度、木纹强度、站名字重和字号。即时预览，自动存入 `chrome.storage.local`。浅色和深色分别使用 `chromeNav_woodAppearance_v1_light`、`chromeNav_woodAppearance_v1_dark`，其他新标签页也监听设置更新。恢复默认只重置当前明暗模式的木牌外观，不影响导航数据或飞书配置。

实现由 `css/wood-home.css`、`js/modules/wood-appearance-core.js` 与 `wood-appearance.js` 提供，叶子素材在 `img/wood-leaf.svg`，打包随 css/js/img 目录自动包含。正式页面不加载 docs 原型资源，不打包真实站点快照或私人图标文件。

网站图标由 `site-logo-manager.js` 处理加载超时、无 Referer 请求、官方 favicon 备用地址和首字兜底。原型下载的私人图标缓存没有写进正式扩展包。

`home-keyboard.js` 拦截重复 Ctrl+F 并保持搜索词，Esc 一次关闭。木牌样式将顶部按钮层级置于果园弹层之下，避免透出与误点。

## 验证

- `npm test`：96 项通过，包含新标签页重建后恢复外观、参数校验、写入失败、重复搜索快捷键回归。
- 以正式 HTML、CSS 与 JS 搭配隔离的 Chrome 存储测试桥进行浏览器检查：76 个真实快照网站、分类栏隐藏、调色即时生效、刷新恢复颜色和字重，控制台无运行错误。
- 正式浏览器验证使用的临时桥和页面已清理。原型继续保留。

开发版扩展重新加载后，新打开的标签页会使用这版首页。正式扩展调色独立于 localhost 原型的设置。
