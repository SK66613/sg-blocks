// Auto-migrated from build-apps templates.js (pack3)
const BLOCK = {
    type:'game',
    title:'Flappy',
    // настройки по умолчанию
    defaults:{
      key:'flappy',
      autostart:true,
      min_h:520,
      difficulty:'normal',   // easy | normal | hard
      bird_mode:'default',   // default | custom
      bird_img:'',
      shield_img:''
    },
    preview:(p)=>{
      const key  = (p&&p.key)||'flappy';
      const mh   = (p&&p.min_h)||520;
      const diff = (p&&p.difficulty)||'normal';
      const diffLabel = diff==='easy' ? 'Легко' : (diff==='hard' ? 'Жёстко' : 'Норма');
      return `
        <div class="card game-card" data-game-block data-game-key="${key}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div><b>Flappy</b><div class="mut" style="opacity:.7;font-size:12px">Тапай / Space</div></div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="mut" style="opacity:.7;font-size:12px">Авто</span>
              <span class="pill pill-xs" style="font-size:11px;opacity:.85">${diffLabel}</span>
            </div>
          </div>
          <div class="game-host" data-game-host style="margin-top:10px;min-height:${mh}px"></div>
        </div>`;
    },
    // init превью: монтируем игру и пробрасываем props
    init:(el, props, ctx)=>{
      try{
        const key = (props && props.key) ? String(props.key) : 'flappy';
        const host = el.querySelector('[data-game-host]') || el.querySelector('.game-host');
        if(!host) return null;
        if(window.mountGame){
          const cleanup = window.mountGame(key, host, {ctx, props}) || null;
          host.__cleanup = (typeof cleanup==='function') ? cleanup : null;
          return host.__cleanup;
        }
        if(window.GAMES && window.GAMES[key] && typeof window.GAMES[key].mount==='function'){
          const cleanup = window.GAMES[key].mount(host, {ctx, props}) || null;
          host.__cleanup = (typeof cleanup==='function') ? cleanup : null;
          return host.__cleanup;
        }
        host.innerHTML = '<div class="card">Игра не подключена: '+key+'</div>';
        return null;
      }catch(_){ return null; }
    }
  };

export async function mount(el, props={}, ctx={}){
  try{
    if (!el) return null;
    if (typeof BLOCK.init === 'function') {
      // init may return cleanup fn
      return await BLOCK.init(el, props, ctx);
    }
    if (typeof BLOCK.preview === 'function') {
      el.innerHTML = BLOCK.preview(props||{});
    }
    return null;
  }catch(e){
    console.error('[flappyGame] mount error', e);
    return null;
  }
}

export function unmount(el){
  try{ if (el) el.innerHTML=''; }catch(_e){}
}
