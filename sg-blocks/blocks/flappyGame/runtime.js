function loadScript(src){
  return new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = ()=>res();
    s.onerror = (e)=>rej(e);
    document.head.appendChild(s);
  });
}

export async function mount(el, props, ctx){
  el.innerHTML = `
    <div class="flappy-wrap">
      <div class="flappy-host" data-game-host></div>
    </div>
  `;

  const base = new URL('./games/flappy/', import.meta.url).toString();
  window.__SG_FLAPPY_BASE__ = base;

  // грузим как в исходнике
  await loadScript(new URL('./games/runtime.js', import.meta.url).toString());
  await loadScript(new URL('./games/flappy/flappy.mount.js', import.meta.url).toString());

  // ждём пока игра зарегистрируется
  let tries = 0;
  while (!(window.GAMES && window.GAMES.flappy) && tries < 50){
    await new Promise(r=>setTimeout(r, 50));
    tries++;
  }

  if (window.mountGame){
    window.mountGame('flappy', el.querySelector('[data-game-host]'), props || {});
  } else {
    console.error('[flappy] mountGame not found');
  }
}

export function unmount(el){
  el.innerHTML = '';
}
