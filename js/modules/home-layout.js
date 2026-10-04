/* 无分类木牌首页：分类数据仍供搜索、编辑与同步使用。 */
(() => {
  const switchCategory = UIRenderer.switchCategory;
  UIRenderer.switchCategory = () => switchCategory('all');
  UIRenderer.switchAdjacentCategory = () => null;
})();
