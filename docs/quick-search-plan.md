# 双击 Shift 快速搜索方案

## 目标
- 双击 `Shift` 呼出搜索框。
- 输入关键字匹配网站。
- 匹配结果支持 `↑/↓` 选择，`Enter` 打开选中站点。
- 未输入关键字时默认展示全部站点。

## 关键交互约束
- 触发范围：全局都触发。
- 匹配字段：`名称 + 网址 + 分类`。
- 结果选择：上下键循环选择。
- `Esc` 关闭搜索框。

## 实现文件
- `js/modules/quick-search-manager.js`：新增快速搜索模块。
- `newtab.html`：新增搜索弹层 DOM，接入脚本。
- `css/style.css`：新增快速搜索弹层样式。
- `js/app.js`：初始化 `QuickSearchManager`。

## 数据与行为
- 数据从 `UIRenderer.getNavDataSnapshot()` 获取并扁平化。
- 空关键字返回全量站点，非空关键字做大小写不敏感包含匹配。
- 跳转方式与卡片一致：`chrome.tabs.create({ url })`，无协议时补 `https://`。

## 验收点
- 双击 `Shift` 可稳定打开搜索框。
- 空输入显示全部网站。
- 关键字可按名称/网址/分类命中。
- `↑/↓` 可循环切换高亮项。
- `Enter` 跳转高亮项，`Esc` 关闭。
