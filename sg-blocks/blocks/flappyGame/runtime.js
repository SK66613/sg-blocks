function loadScript(src){
  return new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = ()=>res();
    s.onerror = (e)=>rej(e);
    document.head.appendChild(s);
  });
}

function getBlockBase(ctx){
  // 1) если твой лоадер передаёт base_url — это лучший вариант
  if (ctx && ctx.base_url) return String(ctx.base_url).replace(/\/?$/,'/');

  // 2) fallback: попробуем вычислить из URL runtime.js, если он есть в stack (не идеально, но лучше чем currentScript null)
  // ВНИМАНИЕ: если у тебя loader умеет — лучше передай ctx.base_url
  return '';
}

export async function mount(el, props = {}, ctx = {}){
  // Не перетираем view.html — используем существующий host
  const host = el.querySelector('[data-game-host]') || el;
  if (!host) return;

  // base блока (ОЧЕНЬ желательно, чтобы лоадер прокидывал ctx.base_url)
  const base = getBlockBase(ctx);
  if (!base){
    console.warn('[flappyGame] ctx.base_url is missing; paths may break. Update loader to pass base_url.');
  }

  const blockBase = base || ''; // если пусто — ниже всё равно будет ломаться на 404, поэтому лучше починить лоадер

  // база для ассетов внутри flappy
  window.__SG_FLAPPY_BASE__ = blockBase + 'games/flappy/';

  await loadScript(blockBase + 'games/runtime.js');
  await loadScript(blockBase + 'games/flappy/flappy.mount.js');

  // в оригинале игра монтится через window.GAMES.flappy.mount(host, ctx)
  if (window.GAMES && window.GAMES.flappy && typeof window.GAMES.flappy.mount === 'function'){
    const cleanup = window.GAMES.flappy.mount(host, { props, ctx });
    return ()=>{ try{ cleanup && cleanup(); }catch(_){} };
  }

  // fallback если у тебя есть mountGame
  if (window.mountGame){
    window.mountGame('flappy', host, props);
  } else {
    console.error('[flappyGame] No mount method found (GAMES.flappy.mount / mountGame)');
  }
}

export function unmount(el){
  // если mount возвращал cleanup — твой общий engine должен его вызвать
}
