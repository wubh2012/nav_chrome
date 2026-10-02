/* 果园存档边界：仅接受已知字段，损坏或旧版存档回到安全的初始值。 */
(function (root) {
  'use strict';
  const integer = (value, fallback = 0, max = 1000000) =>
    Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
  function normalize(value) {
    const source = value?.version === 1 ? value : {};
    const basket = integer(source.basket);
    return {
      version: 1,
      enabled: source.enabled !== false,
      basket,
      total: Math.max(basket, integer(source.total)),
      cats: integer(source.cats),
      pondVisits: integer(source.pondVisits),
      fruit: Array.from({length:4}, (_,i) => integer(source.fruit?.[i], 3, 3)),
      trees: (Array.isArray(source.trees) ? source.trees : []).slice(0,3).map(tree => {
        const stage = integer(tree?.stage, 0, 3);
        return { stage, fruit: stage === 3 ? integer(tree?.fruit, 3, 3) : 0 };
      }),
      fish: [...new Set((Array.isArray(source.fish) ? source.fish : []).filter(id => Number.isInteger(id) && id >= 0 && id < 3))],
      decorations: ['flowers','lantern','fence'].map((id,index) => {
        const item = (Array.isArray(source.decorations) ? source.decorations : []).find(item => item?.id === id);
        return { id, owned: item?.owned === true, visible: item?.visible !== false, zone: integer(item?.zone,index,2) };
      })
    };
  }
  const api = { normalize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PixelGardenState = api;
})(typeof globalThis === 'object' ? globalThis : this);
