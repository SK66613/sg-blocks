// sg-blocks/blocks/game_flappy/runtime.js
// Строгий порт оригинала превью-игры под формат блока.
// API: export async function mount(root, props, ctx){...} -> cleanup()

export async function mount(root, props = {}, ctx = {}){
  // ==== контекст
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  const TG =
    ctx.tg ||
    (win.Telegram && win.Telegram.WebApp) ||
    (win.parent && win.parent.Telegram && win.parent.Telegram.WebApp) ||
    null;

  // базовый URL ассетов блока: .../blocks/game_flappy/
  const BASE = String(ctx.base_url || (()=>{ try{return new URL('./', import.meta.url).href;}catch(_){return '';} })())
                  .replace(/\/?$/,'/');

  // DOM якоря (под твой view.html)
  const host    = root.querySelector('[data-game-host]') || root;
  const stage   = host.querySelector('#fl-stage');
  const birdEl  = host.querySelector('#fl-bird');
  const hintEl  = host.querySelector('#fl-hint');
  const scoreEl = host.querySelector('#fl-score');
  const barEl   = host.querySelector('#fl-bar');

  const coinIco = host.querySelector('#fl-coin-ico');
  const coinCnt = host.querySelector('#fl-coin-count');
  const shIco   = host.querySelector('#fl-shield-ico');
  const shBar   = host.querySelector('#fl-shield-bar');

  const resBox  = host.querySelector('#fl-result');
  const bestEl  = host.querySelector('#fl-best');
  const worldEl = host.querySelector('#fl-world');
  const cta     = host.querySelector('#fl-cta');

  if(!stage || !birdEl){ return ()=>{}; }

  // ==== ассеты как в оригинале
  const ASSETS = {
    bird:   { img: (props.bird_mode==='custom' && props.bird_img) ? props.bird_img : (BASE+'assets/bumblebee.png'),  w:56, h:42 },
    pipes:  { top: BASE+'assets/pipe_top.png', bottom: BASE+'assets/pipe_bottom.png', width:54 },
    coin:   { img: BASE+'assets/coin.png',   w:32, h:32, value:5 },
    shield: { img: BASE+'assets/shield.png', w:34, h:34, dur_ms:6000 }
  };

  // ==== применяем ассеты (как у тебя)
  function applyAssets(){
    // ВНИМАНИЕ: переменные кладём в scope host, чтобы не ломать чужие блоки
    const scope = host;
    scope.style.setProperty('--bird-w', (ASSETS.bird.w||48)+'px');
    scope.style.setProperty('--bird-h', (ASSETS.bird.h||36)+'px');
    scope.style.setProperty('--pipe-w',(ASSETS.pipes.width||54)+'px');
    scope.style.setProperty('--coin-w',(ASSETS.coin.w||32)+'px');
    scope.style.setProperty('--coin-h',(ASSETS.coin.h||32)+'px');
    scope.style.setProperty('--pow-w', (ASSETS.shield.w||34)+'px');
    scope.style.setProperty('--pow-h', (ASSETS.shield.h||34)+'px');

    if (ASSETS.bird.img){
      birdEl.classList.add('fl-bird--sprite');
      birdEl.style.backgroundImage = `url(${ASSETS.bird.img})`;
    }else{
      birdEl.classList.remove('fl-bird--sprite');
      birdEl.style.backgroundImage = '';
    }
    if (coinIco && ASSETS.coin.img) coinIco.style.backgroundImage = `url(${ASSETS.coin.img})`;
    if (shIco   && ASSETS.shield.img) shIco.style.backgroundImage = `url(${ASSETS.shield.img})`;
  }

  // ==== настройки ИЗ ОРИГИНАЛА превью (важно оставить как есть)
  const WORLD_RECORD   = Number(props.leaderboard_world_stub) || 200;
  const GRAVITY        = 1800;
  const FLAP_VELOCITY  = -520;
  let   SPEED_X        = 220;
  const ACCEL_EACH_MS  = 8000;
  const SPEED_STEP     = 28;
  const PIPE_SPAWN_MS  = 1300;

  let GAP_MIN = 150, GAP_MAX = 190;
  const diff = String(props.difficulty||'normal');
  if (diff==='easy'){ SPEED_X*=0.8; GAP_MIN*=1.2; GAP_MAX*=1.2; }
  if (diff==='hard'){ SPEED_X*=1.25; GAP_MIN*=0.85; GAP_MAX*=0.85; }

  const GAP_TOP_PAD    = 80;
  const BIRD_X_FACTOR  = .25;
  const ROT_UP         = -35, ROT_DOWN = 90;
  const SAFE_FLOOR_PAD = 6;

  const COIN_IN_GAP_PROB = .9;
  const SHIELD_PROB      = .18;
  const SHIELD_COOLDOWN  = 9000;

  const MAGNET_ENABLED   = true;
  const MAGNET_RADIUS    = 140;
  const MAGNET_PULL_PX_S = 300;

  // ==== стейт как у тебя
  let best=0; try{ best = Number(win.localStorage.getItem('flappy_best')||0)||0; }catch(_){}
  let running=false, started=false;
  let raf=0, spawnT=Infinity, t0=0;
  let w=0,h=0, birdX=0, birdY=0, birdVY=0;
  let pipes=[];   // {x, gapY, gap, topEl, botEl, passed:false}
  let items=[];   // {type, x,y, el}
  let lastShieldSpawn=0;
  let score=0, coins=0;
  let shieldActive=false, shieldUntil=0;

  const haptic = lvl=>{ try{ TG?.HapticFeedback?.impactOccurred(lvl||'light'); }catch(_){ } };
  const clamp  = (v,a,b)=> Math.max(a, Math.min(b, v));
  const rand   = (a,b)=> a + Math.random()*(b-a);

  function layout(){
    w = stage.clientWidth || 360;
    h = stage.clientHeight || 480;
    birdX = w * BIRD_X_FACTOR;
    if (!started){
      birdY = h * 0.45;
      applyBird();
    }
  }
  function applyBird(){ birdEl.style.left = birdX + 'px'; birdEl.style.top = birdY + 'px'; }
  function setScore(v){ if(scoreEl) scoreEl.textContent = String(v|0); }
  function setCoins(v){ if(coinCnt) coinCnt.textContent = String(v|0); }

  function spawnPipe(){
    const gap  = rand(GAP_MIN, GAP_MAX);
    const minY = GAP_TOP_PAD + gap/2;
    const maxY = h - GAP_TOP_PAD - gap/2;
    const gapY = rand(minY, maxY);

    const top = doc.createElement('div');
    const bot = doc.createElement('div');
    top.className = 'fl-pipe-part';
    bot.className = 'fl-pipe-part';
    if (ASSETS.pipes.top && ASSETS.pipes.bottom){
      top.style.backgroundImage = `url(${ASSETS.pipes.top})`;
      bot.style.backgroundImage = `url(${ASSETS.pipes.bottom})`;
    }
    stage.appendChild(top); stage.appendChild(bot);

    const p = { x: w + (ASSETS.pipes.width||54), gapY, gap, topEl: top, botEl: bot, passed:false };
    pipes.push(p); positionPipe(p);

    // coin
    if (Math.random() < COIN_IN_GAP_PROB){
      const c = doc.createElement('div');
      c.className = 'fl-coin';
      if (ASSETS.coin.img) c.style.backgroundImage = `url(${ASSETS.coin.img})`;
      stage.appendChild(c);
      const it = { type:'coin', x: p.x + 200, y: gapY, el: c };
      items.push(it); positionItem(it);
    }
    // shield (с учётом КД)
    if (Date.now() - lastShieldSpawn > SHIELD_COOLDOWN && Math.random() < SHIELD_PROB){
      const s = doc.createElement('div');
      s.className = 'fl-power';
      if (ASSETS.shield.img) s.style.backgroundImage = `url(${ASSETS.shield.img})`;
      stage.appendChild(s);
      const it = { type:'shield', x: p.x + 300, y: gapY - gap*0.35, el: s };
      items.push(it); positionItem(it);
      lastShieldSpawn = Date.now();
    }
  }
  function positionPipe(p){
    const pipeW = (ASSETS.pipes.width||54);
    const th = p.gapY - p.gap/2;
    const bt = p.gapY + p.gap/2;
    p.topEl.style.left   = p.x + 'px';
    p.topEl.style.top    = '0px';
    p.topEl.style.height = th + 'px';
    p.topEl.style.width  = pipeW + 'px';
    p.botEl.style.left   = p.x + 'px';
    p.botEl.style.top    = bt + 'px';
    p.botEl.style.height = (h - bt) + 'px';
    p.botEl.style.width  = pipeW + 'px';
  }
  function positionItem(it){ it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px'; }
  function removePipe(p){ try{ p.topEl.remove(); p.botEl.remove(); }catch(_){ } }
  function removeItem(it){ try{ it.el.remove(); }catch(_){ } }

  function rectsOverlap(a,b){ return !(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom); }
  function collidePipe(){
    const br = birdEl.getBoundingClientRect();
    for (const p of pipes){
      if (rectsOverlap(br, p.topEl.getBoundingClientRect()) || rectsOverlap(br, p.botEl.getBoundingClientRect())) return true;
    }
    return false;
  }
  function activateShield(){
    shieldActive = true;
    shieldUntil  = Date.now() + (ASSETS.shield.dur_ms||6000);
    birdEl.classList.add('fl-bird--shield');
  }
  function updateShieldHud(){
    if (!shBar) return;
    if (!shieldActive){ shBar.style.transform = 'scaleX(0)'; return; }
    const left = shieldUntil - Date.now();
    if (left <= 0){
      shieldActive = false;
      birdEl.classList.remove('fl-bird--shield');
      shBar.style.transform = 'scaleX(0)';
    } else {
      const pct = clamp(left / (ASSETS.shield.dur_ms||6000), 0, 1);
      shBar.style.transform = `scaleX(${pct})`;
    }
  }
  function collideItems(){
    const br = birdEl.getBoundingClientRect();
    const dead=[];
    for (let i=0;i<items.length;i++){
      const it = items[i];
      const ir = it.el.getBoundingClientRect();
      if (rectsOverlap(br, ir)){
        if (it.type==='coin'){
          coins += 1; setCoins(coins); score += 1; setScore(score); haptic('medium');
        } else if (it.type==='shield'){
          activateShield(); haptic('medium');
        }
        removeItem(it); dead.push(i);
      }
    }
    for (let i=dead.length-1;i>=0;i--) items.splice(dead[i],1);
  }

  function flap(){
    if (!running) return;
    if (!started){
      started = true;
      if (hintEl) hintEl.style.display = 'none';
      birdVY = FLAP_VELOCITY;
      t0 = performance.now();
      spawnT = t0;
      tick._prev = t0;
    } else {
      birdVY = FLAP_VELOCITY;
    }
    haptic('light');
  }
  function crash(){ haptic('heavy'); finish(); }

  async function finish(){
    running = false;
    try{ win.cancelAnimationFrame(raf); }catch(_){}
    if (score > best){
      best = score;
      try{ win.localStorage.setItem('flappy_best', String(best)); }catch(_){}
    }
    if (bestEl)  bestEl.textContent  = String(best|0);
    if (worldEl) worldEl.textContent = String(WORLD_RECORD);
    if (resBox)  resBox.classList.add('show');
    if (cta)     cta.classList.add('show');

    // сабмит оставляем, но в превью он просто тихо не отработает — это ок
    try{
      if (TG && (TG.initData || TG.initDataUnsafe)){
        const init_data = TG.initData || '';
        const u = TG.initDataUnsafe && TG.initDataUnsafe.user;
        const publicId = String(ctx.public_id||'').trim();
        if (publicId && init_data && u && u.id){
          const payload = {
            type:'game.submit',
            init_data,
            tg_user: { id:u.id, username:u.username||'', first_name:u.first_name||'', last_name:u.last_name||'' },
            payload: { game_id:'flappy', mode:'daily', score:Number(score||0) }
          };
          fetch(`/api/public/app/${encodeURIComponent(publicId)}/event`, {
            method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)
          }).catch(()=>{});
        }
      }
    }catch(_){}
  }

  function resetScene(){
    pipes.forEach(removePipe); pipes = [];
    items.forEach(removeItem); items = [];
    coins=0; setCoins(0);

    shieldActive=false; birdEl.classList.remove('fl-bird--shield'); if (shBar) shBar.style.transform = 'scaleX(0)';
    started=false; score=0; setScore(0);
    if (hintEl) hintEl.style.display = '';
    birdVY = 0;
    birdEl.style.transform = 'translate(-50%,-50%) rotate(0deg)';
    if (barEl) barEl.style.transform = 'scaleX(1)';

    layout();

    spawnT = Infinity;
    tick._prev = performance.now();
    if (resBox) resBox.classList.remove('show');
    if (cta)    cta.classList.remove('show');
  }

  function tick(){
    const now = performance.now();
    const dt  = Math.min(32, now - (tick._prev||now)); tick._prev = now;

    if (!started){
      birdY += Math.sin(now/300) * 0.12;
      applyBird();
      updateShieldHud();
      raf = win.requestAnimationFrame(tick);
      return;
    }

    const elapsed = now - t0;
    const prog = Math.min(1, elapsed / 45000);
    if (barEl) barEl.style.transform = `scaleX(${1-prog})`;

    const speed = SPEED_X + Math.floor(elapsed / ACCEL_EACH_MS) * SPEED_STEP;

    birdVY += GRAVITY * (dt/1000);
    birdY  += birdVY * (dt/1000);

    const ang = clamp((birdVY/600)*45, ROT_UP, ROT_DOWN);
    birdEl.style.transform = `translate(-50%,-50%) rotate(${ang}deg)`;

    const topLimit = 6;
    const botLimit = (h||480) - SAFE_FLOOR_PAD;
    if (birdY <= topLimit){ birdY = topLimit; birdVY = 0; }
    if (birdY >= botLimit){
      birdY = botLimit;
      if (!shieldActive){ crash(); return; }
      birdVY = -200;
    }

    const dx = speed * dt/1000;
    for (const p of pipes){ p.x -= dx; positionPipe(p); }
    for (const it of items){
      it.x -= dx;
      // магнит для монет при активном щите
      if (MAGNET_ENABLED && shieldActive && it.type === 'coin'){
        const vx=birdX-it.x, vy=birdY-it.y, dist=Math.hypot(vx,vy);
        if (dist < MAGNET_RADIUS){
          const pull = MAGNET_PULL_PX_S * (dt/1000);
          const step = Math.min(pull, dist||0);
          const nx = vx/(dist||1), ny = vy/(dist||1);
          it.x += nx*step; it.y += ny*step;
          it.el.style.transform = 'translate(-50%,-50%) scale(1.08)';
        } else it.el.style.transform = 'translate(-50%,-50%)';
      } else it.el.style.transform = 'translate(-50%,-50%)';

      positionItem(it);
    }

    // очки за пролет трубы
    for (const p of pipes){
      if (!p.passed && p.x + (ASSETS.pipes.width||54) < birdX){
        p.passed = true; score += 1; setScore(score); haptic('light');
      }
    }

    // GC
    while (pipes.length && pipes[0].x < -(ASSETS.pipes.width||54)-2){ removePipe(pipes[0]); pipes.shift(); }
    while (items.length && items[0].x < -80){ removeItem(items[0]); items.shift(); }

    collideItems();
    if (collidePipe()){
      if (shieldActive){
        shieldActive = false; birdEl.classList.remove('fl-bird--shield');
        if (shBar) shBar.style.transform = 'scaleX(0)';
        birdVY = -260;
      } else { crash(); return; }
    }

    if (now - spawnT > PIPE_SPAWN_MS){ spawnT = now; spawnPipe(); }

    applyBird();
    updateShieldHud();

    raf = win.requestAnimationFrame(tick);
  }

  // ==== инпуты (как у тебя)
  const onPointer = (e)=>{
    if (
      e.target.closest('#fl-cta') ||
      e.target.closest('#fl-result') ||
      e.target.closest('button,a,input,textarea,select')
    ) return;
    if (cta?.classList.contains('show') || resBox?.classList.contains('show')) return;
    e.preventDefault(); flap();
  };
  stage.addEventListener('pointerdown', onPointer, { passive:false });

  const onKey = (e)=>{
    if (e.code==='Space' || e.key==='ArrowUp'){ e.preventDefault(); flap(); }
    if (e.key==='Escape'){ /* мягко закрыть/ничего не делать в превью */ }
  };
  doc.addEventListener('keydown', onKey);

  const onCta = (e)=>{
    const btn = e.target.closest('.btn');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    // рестарт ТОЛЬКО по кнопке
    if (resBox) resBox.classList.remove('show');
    if (cta)    cta.classList.remove('show');
    resetScene();
    running = true;
    const t = performance.now();
    tick._prev = t;
    try{ win.cancelAnimationFrame(raf); }catch(_){}
    raf = win.requestAnimationFrame(tick);
  };
  cta && cta.addEventListener('pointerdown', onCta, { capture:true, passive:false });
  cta && cta.addEventListener('click', onCta, true);

  // старт
  applyAssets();
  layout();
  resetScene();
  running = true;
  raf = win.requestAnimationFrame(tick);

  // resize
  const ro = new (win.ResizeObserver||ResizeObserver)(()=>layout());
  try{ ro.observe(stage); }catch(_){}

  // cleanup
  function cleanup(){
    try{ running=false; win.cancelAnimationFrame(raf); }catch(_){}
    try{ stage.removeEventListener('pointerdown', onPointer); }catch(_){}
    try{ doc.removeEventListener('keydown', onKey); }catch(_){}
    try{ cta && cta.removeEventListener('pointerdown', onCta, true); }catch(_){}
    try{ cta && cta.removeEventListener('click', onCta, true); }catch(_){}
    try{ ro.disconnect(); }catch(_){}
    try{
      pipes.forEach(removePipe); items.forEach(removeItem);
    }catch(_){}
  }
  return cleanup;
}
