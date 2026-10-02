// 临时排查入口：真正执行浏览器字体解析，并检查字形度量是否仍使用回退字体。
(async () => {
  const sample = '水果导航 哔哩哔哩 微信公众平台 中国大学慕课 GitHub 0123456789';
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
  const width = family => { ctx.font = `32px ${family}`; return ctx.measureText(sample).width; };
  const rows = [];
  for (const family of ['TypeWenKai', 'TypeKuaiLe', 'TypePixel']) {
    try {
      const loaded = await document.fonts.load(`32px ${family}`, sample);
      rows.push({family, loaded:loaded.length, status:loaded[0]?.status, width:width(family), fallbackWidth:width('"Microsoft YaHei"'), pass:loaded.length > 0 && Math.abs(width(family)-width('"Microsoft YaHei"')) > 1});
    } catch (error) { rows.push({family,pass:false,error:String(error)}); }
  }
  document.getElementById('font-report').textContent = JSON.stringify(rows,null,2);
})();
