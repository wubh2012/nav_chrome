# 字体来源与许可

## 内置字体

以下两款字体随扩展离线加载，保留完整字库，未按页面文字裁剪。遇到字库未覆盖的字符时由系统黑体补齐。

- 站酷快乐体（A）：https://github.com/googlefonts/zcool-kuaile 。使用 Google Fonts 发布的 Regular，完整 TTF 转换为 WOFF2。许可证：zcool-OFL.txt。
- 缝合像素（B）：https://github.com/TakWolf/fusion-pixel-font 。12px proportional 简体中文，来源 https://fusion-pixel-font.takwolf.com/fusion-pixel-12px-proportional-zh_hans.otf.woff2 。许可证：fusion-OFL.txt。

霞鹜文楷 TC 已从扩展包移除；历史字体原型及其授权文件保留在 `docs/prototypes/home/assets/`，该目录不会打入扩展。

## 在线字体

以下字体只在用户选中时请求样式表，浏览器再按页面实际字符获取 WOFF2 字形分包；字体二进制不进入扩展包。网络不可用时由页面字体栈回退到系统字库。

- 思源宋体 SC / Noto Serif SC：Google Fonts CSS API，OFL 许可，https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap 。
- 思源黑体 SC / Noto Sans SC：Google Fonts CSS API，OFL 许可，https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap 。
- 得意黑 / Smiley Sans Oblique：ZeoSeven Fonts API，源字体 v2.0.1，OFL 许可，https://fontsapi.zeoseven.com/92/main/result.css 。
- 霞鹜文楷 GB / LXGW WenKai GB：lxgw-wenkai-gb-web 1.522.0（jsDelivr CDN），源字体 v1.522，OFL 许可，https://cdn.jsdelivr.net/npm/lxgw-wenkai-gb-web@1.522.0/lxgwwenkaigb-regular/result.css 。
