# 内置字体

三款字体均在扩展内离线加载，保留完整字库，未按页面文字裁剪。遇到字库未覆盖的字符时由系统黑体补齐。

- 霞鹜文楷 TC（A）：https://github.com/lxgw/LxgwWenKaiTC 。使用 Google Fonts 发布的 Regular，下载自 https://fonts.gstatic.com/s/lxgwwenkaitc/v11/w8gDH20td8wNsI3f40DmtXZb48uK.ttf ，仅将完整 TTF 转换为 WOFF2。许可证：wenkai-OFL.txt。
- 站酷快乐体（B）：https://github.com/googlefonts/zcool-kuaile 。使用 Google Fonts 发布的 Regular，完整 TTF 转换为 WOFF2。许可证：zcool-OFL.txt。
- 缝合像素（C）：https://github.com/TakWolf/fusion-pixel-font 。12px proportional 简体中文，来源 https://fusion-pixel-font.takwolf.com/fusion-pixel-12px-proportional-zh_hans.otf.woff2 。许可证：fusion-OFL.txt。

A 原型此前复制的本机 TTF 无法被浏览器和 fontTools 解析（cmap 表异常），现改用 Google Fonts 发布的可验证字库。中文预览、字体解析和 Canvas 字形度量回归入口：docs/prototypes/home/font-probe.html。
