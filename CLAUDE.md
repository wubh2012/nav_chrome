# Chrome Nav 插件开发指南

## 项目概述
Chrome 导航起始页插件，将 navsite 网站导航功能迁移为 Chrome 插件。

## 开发前必读

**重要**：开发前必须先阅读 `d:\AI\navsite\CHROME_PLUGIN_PLAN.md`

## 项目结构

```
d:\AI\chrome_nav\
├── manifest.json              # 插件配置（V3）
├── newtab.html               # 起始页（主页面）
├── options.html              # 配置页
├── popup.html                 # 快捷操作弹窗
├── background.js             # 后台 Service Worker
├── css/
│   ├── style.css             # 主样式
│   ├── options.css           # 配置页样式
│   └── popup.css             # 弹窗样式
├── js/
│   ├── app.js                # 主入口
│   ├── popup.js              # 弹窗脚本
│   ├── options.js            # 配置页脚本
│   └── modules/
│       ├── feishu-api.js     # 飞书 API
│       ├── storage.js        # 存储封装
│       ├── sync-manager.js   # 同步管理
│       ├── theme-manager.js   # 主题管理
│       ├── ui-renderer.js    # UI 渲染
│       └── link-manager.js   # 链接管理
├── lib/
│   ├── axios.min.js
│   └── lunar.js
└── img/
```

## 当前开发状态

### Sprint 1（MVP）- 已完成

| Story | 名称 | 状态 | 故事点 |
|-------|------|------|--------|
| M1 | 存储模块 | ✅ 完成 | 2 |
| M2 | 飞书 API 模块 | ✅ 完成 | 3 |
| M3 | 主页面开发 | ✅ 完成 | 5 |
| M4 | 链接管理功能 | ✅ 完成 | 3 |
| M5 | 配置页开发 | ✅ 完成 | 3 |

**Sprint 1 合计：16 点**

### Sprint 2（后台同步）- 进行中

| Story | 名称 | 状态 | 故事点 |
|-------|------|------|--------|
| S2.1 | sync-manager.js | ✅ 完成 | 5 |
| S2.2 | background.js | ✅ 完成 | 5 |

**功能**:
- ✅ 定时同步（默认 30 分钟）
- ✅ 失败自动重试（最多 3 次，间隔 1 分钟）
- ✅ 首次打开浏览器时自动同步
- ✅ 同步状态实时显示
- ✅ Google Favicon 自动获取图标

**Sprint 2 合计：10 点**

### 待开发功能

| Story | 名称 | 故事点 | 优先级 |
|-------|------|--------|--------|
| 搜索功能 | Ctrl+K 快捷键搜索、本地过滤 | 3 | P1 |
| 首次安装引导 | 欢迎页、配置引导 | 3 | P1 |
| 快捷弹窗增强 | 同步状态、立即刷新、主题切换 | 2 | P2 |
| 离线支持 | 离线模式、网络恢复自动同步 | 2 | P2 |
| 商店上架 | 128x128 图标、宣传截图、隐私政策 | 4 | P3 |

**待开发合计：14 点**

## 复用 navsite 代码

- CSS：`navsite/public/css/style.css` → `chrome_nav/css/style.css`
- Theme Manager：`navsite/public/js/modules/core/theme-manager.js`
- UI Renderer：`navsite/public/js/modules/core/ui-renderer.js`
- Link Manager：`navsite/public/js/modules/features/link-manager.js`

## 测试步骤

1. 加载插件：Chrome → 扩展程序 → 加载已解压的扩展程序 → 选择 `chrome_nav` 目录
2. 打开新标签页测试
3. 配置页测试：右键插件图标 → 选项

## 飞书 API 配置

需要配置：
- APP_ID
- APP_SECRET
- APP_TOKEN (多维表格 Token)
- TABLE_ID

## 相关文档

- 详细计划：[CHROME_PLUGIN_PLAN.md](d:\AI\navsite\CHROME_PLUGIN_PLAN.md)
- navsite 源码：`d:\AI\navsite\public\`
