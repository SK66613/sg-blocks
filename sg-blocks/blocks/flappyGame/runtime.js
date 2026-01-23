// ESM runtime for SG Blocks
function ensureLoaded(p){
  return p || Promise.resolve();
}

let _loadPromise = null;
async function loadGameScripts(){
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async ()=>{
    // execute IIFE scripts that register window.GAMES + window.mountGame
    await import(new URL('./games/runtime.js', import.meta.url).toString());
    await import(new URL('./games/flappy/flappy.mount.js', import.meta.url).toString());
  })();
  return _loadPromise;
}

function diffLabel(diff){
  return diff==='easy' ? 'Легко' : (diff==='hard' ? 'Жёстко' : 'Норма');
}

export async function mount(el, props={}, ctx={}){
  // render props into DOM
  const host = el.querySelector('[data-game-host]');
  const card = el.querySelector('[data-game-block]');
  if (host){
    const mh = Number(props.min_h || 520) || 520;
    host.style.minHeight = mh + 'px';
  }
  if (card){
    card.setAttribute('data-game-key', String(props.key || 'flappy'));
  }
  const pill = el.querySelector('[data-diff-pill]');
  if (pill) pill.textContent = diffLabel(String(props.difficulty||'normal'));

  await loadGameScripts();

  const key = String(props.key || 'flappy');
  if (typeof window.mountGame === 'function'){
    const cleanup = window.mountGame(key, host, {ctx, props}) || null;
    return (typeof cleanup==='function') ? cleanup : null;
  }
  if (window.GAMES && window.GAMES[key] && typeof window.GAMES[key].mount==='function'){
    const cleanup = window.GAMES[key].mount(host, {ctx, props}) || null;
    return (typeof cleanup==='function') ? cleanup : null;
  }
  if (host) host.innerHTML = '<div class="card">Игра не подключена: '+key+'</div>';
  return null;
}
export function unmount(el){ try{ const host=el.querySelector('[data-game-host]'); host && host.__cleanup && host.__cleanup(); }catch(_){} }
