// sg-blocks/blocks/game_flappy/runtime.js
// Порт твоей оригинальной превью-версии под формат блока.
// export async function mount(root, props, ctx) -> cleanup()

export async function mount(root, props = {}, ctx = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  const TG =
    ctx.tg ||
    (win.Telegram && win.Telegram.WebApp) ||
    (win.parent && win.parent.Telegram && win.parent.Telegram.WebApp) ||
    null;

  // ==== BASE ассетов
  const BASE = String(
    ctx.base_url ||
    (() => { try { return new URL('./', import.meta.url).href; } catch (_) { return ''; } })()
  ).replace(/\/?$/,'/');

  // ==== DOM якоря
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

  if (!stage || !birdEl) return () => {};

  // ==== ассеты (с фолбэком)
  const ASSETS = {
    bird:   { img: (props.bird_mode === 'custom' && props.bird_img) ? props.bird_img : (BASE + 'assets/bumblebee.png'),  w:56, h:42 },
    pipes:  { top: BASE + 'assets/pipe_top.png', bottom: BASE + 'assets/pipe_bottom.png', width:54 },
    coin:   { img: BASE + 'assets/coin.png',   w:32, h:32, value: Number(props.coin_value ?? 5) },
    shield: { img: BASE + 'assets/shield.png', w:34, h:34, dur_ms: Number(props.shield_duration_ms ?? 6000) }
  };

  // прелоад труб — если не загрузятся, используем цветной fallback
  let pipeSpritesOK = true;
  await Promise.allSettled(
    ['top','bottom'].map(k => new Promise((res) => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => { pipeSpritesOK = false; res(false); };
      img.src = ASSETS.pipes[k];
    }))
  );

  // ==== применяем ассеты в scope host
  (function applyAssets(){
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
    } else {
      birdEl.classList.remove('fl-bird--sprite');
      birdEl.style.backgroundImage = '';
    }
    if (coinIco && ASSETS.coin.img)   coinIco.style.backgroundImage = `url(${ASSETS.coin.img})`;
    if (shIco   && ASSETS.shield.img) shIco.style.backgroundImage   = `url(${ASSETS.shield.img})`;
  })();

  // ==== константы как в оригинале
  const WORLD_RECORD   = Number(props.leaderboard_world_stub) || 200;
  const GRAVITY        = 1800;
  const FLAP_VELOCITY  = -520;
  let   SPEED_X        = Number(props.speed_x ?? 220);
  const ACCEL_EACH_MS  = Number(props.accel_each_ms ?? 8000);
  const SPEED_STEP     = Number(props.speed_step ?? 18);
  const PIPE_SPAWN_MS  = 1300;

  let GAP_MIN = Number(props.gap_min ?? 140);
  let GAP_MAX = Number(props.gap_max ?? 220);

  // сложность
  const diff = String(props.difficulty||'normal');
  if (diff === 'easy'){  SPEED_X*=0.9;  GAP_MIN*=1.1; GAP_MAX*=1.1; }
  if (diff === 'hard'){  SPEED_X*=1.2;  GAP_MIN*=0.9; GAP_MAX*=0.9; }

  const SAFE_FLOOR_PAD = Number(props.safe_floor_pad ?? 24);
  const SESSION_MS     = Number(props.session_ms ?? 45000);

  const COIN_PROB      = clamp01(props.coin_prob ?? 0.55);
  const SHIELD_PROB    = clamp01(props.shield_prob ?? 0.25);
  const SH_CD          = Number(props.shield_cooldown_ms ?? 9000);

  // ==== state
  let best=0; try{ best = Number(win.localStorage.getItem('flappy_best')||0)||0; }catch(_){}
  let running=false, started=false;
  let raf=0, spawnT=Infinity, t0=0;

  let w=0, h=0, floorY=0;
  let birdX=0, birdY=0, birdVY=0;

  let pipes=[]; // {x, gapY, gap, topEl, botEl, passed:false}
  let items=[]; // {type:'coin'|'shield', x,y, el}
  let lastShieldSpawn=0;

  let score=0, coins=0;
  let shieldUntil=0;

  const haptic = (kind='light')=>{
    try{
      if (!TG || !TG.HapticFeedback) return;
      if (kind==='error') TG.HapticFeedback.notificationOccurred('error');
      else if (kind==='success') TG.HapticFeedback.notificationOccurred('success');
      else TG.HapticFeedback.impactOccurred(kind);
    }catch(_){}
  };

  // ==== helpers
  function clamp01(v){ const n=Number(v); return isFinite(n)? Math.max(0, Math.min(1,n)) : 0; }
  const clamp  = (v,a,b)=> Math.max(a, Math.min(b, v));
  const rand   = (a,b)=> a + Math.random()*(b-a);

  // надёжный layout
  function layout(){
    const r = stage.getBoundingClientRect();
    let cw = r.width, ch = r.height;
    if (!ch || ch < 20){
      // fallback: computed style / min-height
      const cs = win.getComputedStyle(stage);
      ch = parseFloat(cs.height) || parseFloat(cs.minHeight) || 480;
      cw = parseFloat(cs.width)  || 360;
    }
    w = Math.max(300, Math.round(cw));
    h = Math.max(320, Math.round(ch));
    floorY = h - SAFE_FLOOR_PAD;

    birdX = Math.max(60, w * 0.25);
    if (!started){
      birdY = Math.min(floorY - (ASSETS.bird.h*0.5), Math.max(ASSETS.bird.h*0.5, h*0.45));
      applyBird();
    }
  }
  function applyBird(){
    birdEl.style.left = birdX + 'px';
    birdEl.style.top  = birdY + 'px';
  }
  function setScore(v){ if(scoreEl) scoreEl.textContent = String(v|0); }
  function setCoins(v){ if(coinCnt) coinCnt.textContent = String(v|0); }

  // трубы/предметы
  function spawnPipe(){
    const gap  = rand(GAP_MIN, GAP_MAX);
    const minY = gap*0.6;
    const maxY = h - SAFE_FLOOR_PAD - gap*0.6;
    const gapY = clamp(rand(minY, maxY), gap*0.6, h - SAFE_FLOOR_PAD - gap*0.6);

    const top = doc.createElement('div');
    const bot = doc.createElement('div');
    top.className = 'fl-pipe-part';
    bot.className = 'fl-pipe-part';

    if (pipeSpritesOK){
      top.style.background = `url(${ASSETS.pipes.top}) center/100% 100% no-repeat`;
      bot.style.background = `url(${ASSETS.pipes.bottom}) center/100% 100% no-repeat`;
    } else {
      // fallback: сплошная заливка — чтобы точно были видны
      top.style.background = 'linear-gradient(180deg,#6BFF7A,#1ED760)';
      bot.style.background = 'linear-gradient(180deg,#6BFF7A,#1ED760)';
    }

    stage.appendChild(top); stage.appendChild(bot);

    const p = { x: w + (ASSETS.pipes.width||54), gapY, gap, topEl: top, botEl: bot, passed:false };
    pipes.push(p); positionPipe(p);

    // coin
    if (Math.random() < COIN_PROB){
      const c = doc.createElement('div');
      c.className = 'fl-coin';
      if (ASSETS.coin.img) c.style.backgroundImage = `url(${ASSETS.coin.img})`;
      stage.appendChild(c);
      const it = { type:'coin', x: p.x + 200, y: gapY, el: c };
      items.push(it); positionItem(it);
    }
    // shield (с КД)
    if ((performance.now() - lastShieldSpawn) > SH_CD && Math.random() < (props.shield_prob ?? 0.25)){
      const s = doc.createElement('div');
      s.className = 'fl-power';
      if (ASSETS.shield.img) s.style.backgroundImage = `url(${ASSETS.shield.img})`;
      stage.appendChild(s);
      const it = { type:'shield', x: p.x + 300, y: clamp(gapY - gap*0.35, 30, floorY-30), el: s };
      items.push(it); positionItem(it);
      lastShieldSpawn = performance.now();
    }
  }
  function positionPipe(p){
    const pipeW = (ASSETS.pipes.width||54);
    const th = Math.max(0, p.gapY - p.gap/2);
    const bt = Math.min(h, p.gapY + p.gap/2);

    p.topEl.style.left   = p.x + 'px';
    p.topEl.style.top    = '0px';
    p.topEl.style.height = th + 'px';
    p.topEl.style.width  = pipeW + 'px';

    p.botEl.style.left   = p.x + 'px';
    p.botEl.style.top    = bt + 'px';
    p.botEl.style.height = Math.max(0, h - bt) + 'px';
    p.botEl.style.width  = pipeW + 'px';
  }
  function positionItem(it){
    it.el.style.left = it.x + 'px';
    it.el.style.top  = it.y + 'px';
  }
  function removePipe(p){ try{ p.topEl.remove(); p.botEl.remove(); }catch(_){} }
  function removeItem(it){ try{ it.el.remove(); }catch(_){} }

  function rectsOverlap(a,b){ return !(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom); }
  function collidePipe(){
    const br = birdEl.getBoundingClientRect();
    for (const p of pipes){
      if (rectsOverlap(br, p.topEl.getBoundingClientRect()) || rectsOverlap(br, p.botEl.getBoundingClientRect())) return true;
    }
    return false;
  }

  function hasShield(){ return performance.now() < shieldUntil; }
  function activateShield(){
    shieldUntil = performance.now() + (ASSETS.shield.dur_ms||6000);
    birdEl.classList.add('fl-bird--shield');
  }
  function updateShieldHud(){
    if (!shBar) return;
    if (!hasShield()){ shBar.style.transform = 'scaleX(0)'; return; }
    const left = shieldUntil - performance.now();
    const pct  = clamp(left / (ASSETS.shield.dur_ms||6000), 0, 1);
    shBar.style.transform = `scaleX(${pct.toFixed(3)})`;
  }
  function collideItems(){
    const br = birdEl.getBoundingClientRect();
    const dead=[];
    for (let i=0;i<items.length;i++){
      const it = items[i];
      const ir = it.el.getBoundingClientRect();
      if (rectsOverlap(br, ir)){
        if (it.type==='coin'){ coins += ASSETS.coin.value||1; setCoins(coins); score += 1; setScore(score); haptic('light'); }
        if (it.type==='shield'){ activateShield(); haptic('success'); }
        removeItem(it); dead.push(i);
      }
    }
    for (let i=dead.length-1;i>=0;i--) items.splice(dead[i],1);
  }

  // ==== геймплей
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
  }
  function crash(){ haptic('error'); finish(); }

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

    // сабмит — как у тебя
    try{
      const publicId = String(ctx.public_id||'').trim();
      if (TG && publicId && (TG.initData || TG.initDataUnsafe)){
        const init_data = TG.initData || '';
        const u = TG.initDataUnsafe && TG.initDataUnsafe.user;
        if (init_data && u && u.id){
          const payload = {
            type:'game.submit',
            init_data,
            tg_user: { id:u.id, username:u.username||'', first_name:u.first_name||'', last_name:u.last_name||'' },
            payload: { game_id:'flappy', mode:String(props.submit_mode||'daily'), score:Number(score||0) }
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

    birdEl.classList.remove('fl-bird--shield');
    shieldUntil = 0; if (shBar) shBar.style.transform = 'scaleX(0)';

    started=false; score=0; setScore(0);
    if (hintEl) hintEl.style.display = '';           // снова «Тапни чтобы начать»
    birdVY = 0; birdEl.style.transform = 'translate(-50%,-50%) rotate(0deg)';
    if (barEl) barEl.style.transform = 'scaleX(1)';

    layout();
    spawnT = Infinity;

    if (resBox) resBox.classList.remove('show');
    if (cta)    cta.classList.remove('show');
  }

  function tick(){
    const now = performance.now();
    const dt  = Math.min(34, now - (tick._prev||now)); tick._prev = now;

    if (!started){
      // лёгкая «левитация» перед стартом
      birdY = clamp(birdY + Math.sin(now/320)*0.18, ASSETS.bird.h*0.5, floorY - ASSETS.bird.h*0.5);
      applyBird();
      updateShieldHud();
      raf = win.requestAnimationFrame(tick);
      return;
    }

    const elapsed = now - t0;
    const prog = clamp(1 - (elapsed/SESSION_MS), 0, 1);
    if (barEl) barEl.style.transform = `scaleX(${prog.toFixed(3)})`;

    const speed = SPEED_X + Math.floor(elapsed / ACCEL_EACH_MS) * SPEED_STEP;

    birdVY += GRAVITY * (dt/1000);
    birdY  += birdVY * (dt/1000);

    // ограничители
    const topLimit = ASSETS.bird.h*0.5 + 2;
    const botLimit = floorY - ASSETS.bird.h*0.5;
    if (birdY <= topLimit){ birdY = topLimit; birdVY = 0; }
    if (birdY >= botLimit){
      birdY = botLimit;
      if (!hasShield()){ crash(); return; }
      birdVY = -220;
    }

    // движение мира
    const dx = speed * dt/1000;
    for (const p of pipes){ p.x -= dx; positionPipe(p); }
    for (const it of items){ it.x -= dx; positionItem(it); }

    // очки за пролет
    for (const p of pipes){
      if (!p.passed && p.x + (ASSETS.pipes.width||54) < birdX){
        p.passed = true; score += 1; setScore(score); haptic('light');
      }
    }

    // GC
    while (pipes.length && pipes[0].x < -(ASSETS.pipes.width||54)-4){ removePipe(pipes[0]); pipes.shift(); }
    while (items.length && items[0].x < -80){ removeItem(items[0]); items.shift(); }

    // коллизии
    collideItems();
    if (collidePipe()){
      if (hasShield()){
        shieldUntil = 0; birdEl.classList.remove('fl-bird--shield'); if (shBar) shBar.style.transform = 'scaleX(0)';
        birdVY = -260;
      } else { crash(); return; }
    }

    // спавн
    if (now - spawnT > PIPE_SPAWN_MS){ spawnT = now; spawnPipe(); }

    // визуал птички
    const ang = clamp((birdVY/600)*45, -35, 90);
    birdEl.style.transform = `translate(-50%,-50%) rotate(${ang}deg)`;

    applyBird();
    updateShieldHud();

    if (elapsed >= SESSION_MS){ finish(); return; }
    raf = win.requestAnimationFrame(tick);
  }

  // ==== input
  const onPointer = (e)=>{
    // игнор кликов по оверлеям/кнопкам
    if (e.target.closest('#fl-cta') || e.target.closest('#fl-result') ||
        e.target.closest('button,a,input,textarea,select')) return;
    if (cta?.classList.contains('show') || resBox?.classList.contains('show')) return;

    e.preventDefault();
    flap();
  };
  // слушаем и сцену, и хост (capture) — чтобы первый тап всегда ловился
  stage.addEventListener('pointerdown', onPointer, { passive:false });
  host.addEventListener('pointerdown', onPointer, { passive:false, capture:true });
  hintEl && hintEl.addEventListener('pointerdown', onPointer, { passive:false });

  const onKey = (e)=>{
    if (e.code==='Space' || e.key==='ArrowUp'){ e.preventDefault(); flap(); }
    if (e.key==='Escape'){ /* ничего */ }
  };
  doc.addEventListener('keydown', onKey);

  const onCta = (e)=>{
    const btn = e.target.closest('.btn');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    // рестарт ТОЛЬКО по кнопке → снова «тапни», а не автозапуск
    resetScene();
    running = true;
    try{ win.cancelAnimationFrame(raf); }catch(_){}
    tick._prev = performance.now();
    raf = win.requestAnimationFrame(tick);
  };
  cta && cta.addEventListener('pointerdown', onCta, { capture:true, passive:false });
  cta && cta.addEventListener('click', onCta, true);

  // ==== старт
  layout();
  resetScene();
  running = true;
  raf = win.requestAnimationFrame(tick);

  // resize
  const ro = new (win.ResizeObserver||ResizeObserver)(()=>layout());
  try{ ro.observe(stage); }catch(_){}

  // ==== cleanup
  function cleanup(){
    try{ running=false; win.cancelAnimationFrame(raf); }catch(_){}
    try{ stage.removeEventListener('pointerdown', onPointer); }catch(_){}
    try{ host.removeEventListener('pointerdown', onPointer, true); }catch(_){}
    try{ hintEl && hintEl.removeEventListener('pointerdown', onPointer); }catch(_){}
    try{ doc.removeEventListener('keydown', onKey); }catch(_){}
    try{ cta && cta.removeEventListener('pointerdown', onCta, true); }catch(_){}
    try{ cta && cta.removeEventListener('click', onCta, true); }catch(_){}
    try{ ro.disconnect(); }catch(_){}
    try{ pipes.forEach(removePipe); items.forEach(removeItem); }catch(_){}
  }
  return cleanup;
}
