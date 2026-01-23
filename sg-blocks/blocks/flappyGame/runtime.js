function loadScript(src){
  return new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = ()=>res();
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

export async function mount(el, props){
  el.innerHTML = `<div class="flappy-host" data-game-host></div>`;

  // base для ассетов внутри блока
  const base = new URL('./games/flappy/', location.origin + location.pathname).toString();
  // ⚠️ ВАЖНО: так нельзя в общем виде, поэтому делаем проще:
  // base считаем от runtime.js:
  const runtimeUrl = (document.currentScript && document.currentScript.src) || '';
  const blockBase = runtimeUrl.replace(/\/runtime\.js(\?.*)?$/,'/');
  window.__SG_FLAPPY_BASE__ = blockBase + 'games/flappy/';

  await loadScript(blockBase + 'games/runtime.js');
  await loadScript(blockBase + 'games/flappy/flappy.mount.js');

  if (window.mountGame){
    window.mountGame('flappy', el.querySelector('[data-game-host]'), props || {});
  }
}
