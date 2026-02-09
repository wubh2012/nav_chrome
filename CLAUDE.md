# Chrome Nav 插件开发指南

## 项目概述
Chrome 导航起始页插件，将 navsite 网站导航功能迁移为 Chrome 插件。


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

