(() => {
  const resize = new ResizeObserver(entries => entries.forEach(entry => {
    entry.target.querySelector('iframe').style.transform = `scale(${entry.contentRect.width / 1440})`;
  }));
  document.querySelectorAll('.preview-window').forEach(frame => resize.observe(frame));
  let dark = false;
  document.getElementById('compare-theme').addEventListener('click', event => {
    dark = !dark; event.target.textContent = dark ? '查看浅色' : '查看深色'; event.target.setAttribute('aria-pressed', String(dark));
    document.querySelectorAll('.candidate').forEach(card => {
      const url = `/newtab.html?variant=${card.dataset.variant}&theme=${dark ? 'dark' : 'light'}`;
      card.querySelector('iframe').src = url + '&overview=1';
      card.querySelector('.candidate-heading a').href = url;
    });
  });
})();
