// flappyGame runtime for SG Blocks (library)
// Mounts original game from build-apps preview/games/* inside the block folder.
let _loaded = false;

async function ensureLoaded(){
  if (_loaded) return;
  // base for assets referenced from flappy.mount.js
  window.__SG_FLAPPY_BASE__ = new URL('./games/flappy/', import.meta.url).toString();

  // original global helpers + game registry
  await import(new URL('./games/runtime.js', import.meta.url).toString());
  // registers window.GAMES.flappy
  await import(new URL('./games/flappy/flappy.mount.js', import.meta.url).toString());

  _loaded = true;
}

export async function mount(el, props = {}, ctx = {}){
  await ensureLoaded();

  // ensure host exists
  let host = el.querySelector('[data-game-host]') || el.querySelector('.game-host');
  if (!host){
    host = document.createElement('div');
    host.className = 'game-host';
    host.dataset.gameHost = '';
    el.appendChild(host);
  }

  const key = props.key ? String(props.key) : 'flappy';

  // set min height if provided
  const mh = Number(props.min_h || props.minHeight || 520);
  host.style.minHeight = mh + 'px';

  // cleanup previous
  try{ host.__cleanup && host.__cleanup(); }catch(_){}
  host.__cleanup = null;

  // mount
  let cleanup = null;
  try{
    if (window.mountGame){
      cleanup = window.mountGame(key, host, { ctx, props }) || null;
    } else if (window.GAMES && window.GAMES[key] && typeof window.GAMES[key].mount === 'function'){
      cleanup = window.GAMES[key].mount(host, { ctx, props }) || null;
    } else {
      host.innerHTML = '<div class="card">Игра не подключена: ' + key + '</div>';
    }
  }catch(e){
    console.error('[flappyGame] mount error', e);
    host.innerHTML = '<div class="card">Ошибка запуска игры</div>';
  }

  host.__cleanup = (typeof cleanup === 'function') ? cleanup : null;

  return () => {
    try{ host.__cleanup && host.__cleanup(); }catch(_){}
    host.__cleanup = null;
  };
}

export function unmount(el){
  const host = el.querySelector('[data-game-host]') || el.querySelector('.game-host');
  if (host){
    try{ host.__cleanup && host.__cleanup(); }catch(_){}
    host.__cleanup = null;
  }
}
