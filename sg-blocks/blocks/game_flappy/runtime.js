// sg-blocks/blocks/game_flappy/runtime.js
export async function mount(root, props = {}, ctx = {}){
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const TG = ctx.tg || (win.Telegram && win.Telegram.WebApp) || null;

  const BASE = String(ctx.base_url || (()=>{try{return new URL('./', import.meta.url).href;}catch(_){return ''}})()).replace(/\/?$/,'/');
  const host   = root.querySelector('[data-game-host]') || root;
  const stage  = host.querySelector('#fl-stage');
  const birdEl = host.querySelector('#fl-bird');
  const hintEl = host.querySelector('#fl-hint');
  const scoreEl= host.querySelector('#fl-score');
  const bestEl = host.querySelector('#fl-best');
  const worldEl= host.querySelector('#fl-world');
  const timeBar= host.querySelector('#fl-bar');
  const resBox = host.querySelector('#fl-result');
  const cta    = host.querySelector('#fl-cta');

  const coinIco = host.querySelector('#fl-coin-ico');
  const coinCnt = host.querySelector('#fl-coin-count');
  const shieldI = host.querySelector('#fl-shield-ico');
  const shieldBar = host.querySelector('#fl-shield-bar');
  const coinStat = host.querySelector('#coin-stat');
  const shStat   = host.querySelector('#shield-stat');

  if (coinStat && props.show_coin_bar===false) coinStat.style.display='none';
  if (shStat   && props.show_shield_bar===false) shStat.style.display='none';

  if (!stage || !birdEl) return ()=>{};

  const WORLD_RECORD = num(props.leaderboard_world_stub, 200);
  const GRAVITY = 1800; const FLAP_VELOCITY = -520;
  let SPEED_X = num(props.speed_x, 220);
  const SPEED_STEP = num(props.speed_step, 18);
  const ACCEL_EACH_MS = num(props.accel_each_ms, 8000);
  let GAP_MIN = num(props.gap_min, 140);
  let GAP_MAX = num(props.gap_max, 220);
  const SAFE_FLOOR_PAD = num(props.safe_floor_pad, 24);
  const SESSION_MS = num(props.session_ms, 45000);
  const COIN_VALUE = num(props.coin_value, 5);
  const COIN_IN_GAP_PROB = clamp01(props.coin_prob ?? 0.55);
  const SHIELD_PROB = clamp01(props.shield_prob ?? 0.25);
  const SHIELD_COOLDOWN = num(props.shield_cooldown_ms, 9000);
  const SHIELD_DURATION = num(props.shield_duration_ms, 6000);
  const HAPTICS = props.haptics !== false;
  const SUBMIT_MODE = String(props.submit_mode || 'daily');
  const DIFF = String(props.difficulty || 'normal');

  if (DIFF==='easy'){ SPEED_X*=0.9; GAP_MIN*=1.1; GAP_MAX*=1.1; }
  if (DIFF==='hard'){ SPEED_X*=1.2; GAP_MIN*=0.9; GAP_MAX*=0.9; }

  const ASSETS = {
    bird: { img: (props.bird_mode==='custom' && props.bird_img) ? props.bird_img : (BASE+'assets/bumblebee.png'), w:56, h:42 },
    pipes:{ top: BASE+'assets/pipe_top.png', bottom: BASE+'assets/pipe_bottom.png', width:54 },
    coin:{ img: BASE+'assets/coin.png', w:32, h:32, value:COIN_VALUE },
    shield:{ img: props.shield_img ? props.shield_img : (BASE+'assets/shield.png'), w:34, h:34, dur_ms:SHIELD_DURATION }
  };

  host.style.setProperty('--bird-w', (ASSETS.bird.w||48)+'px');
  host.style.setProperty('--bird-h', (ASSETS.bird.h||36)+'px');
  host.style.setProperty('--pipe-w',(ASSETS.pipes.width||54)+'px');
  host.style.setProperty('--coin-w',(ASSETS.coin.w||32)+'px');
  host.style.setProperty('--coin-h',(ASSETS.coin.h||32)+'px');
  host.style.setProperty('--pow-w', (ASSETS.shield.w||34)+'px');
  host.style.setProperty('--pow-h', (ASSETS.shield.h||34)+'px');
  if (ASSETS.bird.img){ birdEl.classList.add('fl-bird--sprite'); birdEl.style.backgroundImage = `url(${ASSETS.bird.img})`; }
  if (coinIco && ASSETS.coin.img)   coinIco.style.backgroundImage = `url(${ASSETS.coin.img})`;
  if (shieldI && ASSETS.shield.img) shieldI.style.backgroundImage = `url(${ASSETS.shield.img})`;

  let raf=0, running=false, started=false;
  let world={w:360,h:480,floorY:456};
  let bird={x:100,y:200,w:ASSETS.bird.w,h:ASSETS.bird.h,vy:0,alive:true,shieldTill:0,shieldCdTill:0};
  let pipes=[], coins=[], powers=[];
  let spawn={nextPipeX:0,minDx:220,maxDx:320};
  let score=0, coinsTaken=0, best=loadBest(), startedAt=0, timeLeft=SESSION_MS, lastAccelAt=0;

  const ro = new (win.ResizeObserver||ResizeObserver)(layout); try{ ro.observe(stage);}catch(_){}
  layout();

  setText(scoreEl, score); setText(bestEl, best); setText(worldEl, WORLD_RECORD);
  if (coinCnt) setText(coinCnt, 0); setTimeBar(1);
  hide(resBox); show(hintEl); hide(cta);

  function haptic(kind='light'){ try{ if(!HAPTICS||!TG||!TG.HapticFeedback) return;
    if (kind==='error') TG.HapticFeedback.notificationOccurred('error');
    else if (kind==='success') TG.HapticFeedback.notificationOccurred('success');
    else TG.HapticFeedback.impactOccurred('light'); }catch(_){}
  }

  function onPointer(e){
    if (!started){ start(); return; }
    if (cta.classList.contains('show') || resBox.classList.contains('show')) return;
    e.preventDefault(); flap();
  }
  stage.addEventListener('pointerdown', onPointer, {passive:false});
  hintEl && hintEl.addEventListener('pointerdown', onPointer, {passive:false});

  function onKey(e){
    if (cta.classList.contains('show') || resBox.classList.contains('show')) return;
    if (e.code==='Space' || e.key==='ArrowUp'){ e.preventDefault(); flap(); }
  }
  doc.addEventListener('keydown', onKey);

  function onCta(e){
    const btn = e.target.closest('button.btn');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    resetScene(); running = true; tick._prev = performance.now(); raf = win.requestAnimationFrame(tick);
  }
  cta.addEventListener('click', onCta, true);

  function start(){
    started = true; running = true; startedAt = performance.now(); lastAccelAt = startedAt;
    hide(hintEl); hide(cta); hide(resBox);
    score=0; coinsTaken=0; setText(scoreEl,score); if (coinCnt) setText(coinCnt,0);
    SPEED_X = num(props.speed_x, 220); timeLeft = SESSION_MS;
    resetActors(); tick._prev = performance.now(); raf = win.requestAnimationFrame(tick);
  }
  function resetScene(){ started = true; hide(resBox); hide(cta); show(stage); start(); }
  function resetActors(){
    pipes.forEach(p=>{p.elTop&&p.elTop.remove(); p.elBot&&p.elBot.remove();});
    coins.forEach(c=>c.el&&c.el.remove()); powers.forEach(p=>p.el&&p.el.remove());
    pipes.length=0; coins.length=0; powers.length=0;
    bird={x:Math.max(60,world.w*0.25),y:world.h*0.5,w:ASSETS.bird.w,h:ASSETS.bird.h,vy:0,alive:true,shieldTill:0,shieldCdTill:0};
    placeEl(birdEl,bird.x,bird.y,bird.w,bird.h); stage.classList.remove('over');
    spawn.nextPipeX = world.w + randInt(140, 220);
  }
  function flap(){ if(!running||!bird.alive) return; bird.vy = -520; haptic('light'); }

  function tick(t){
    const prev = tick._prev||t; tick._prev=t; let dt=(t-prev)/1000; if(dt>0.05) dt=0.05;
    if (t-lastAccelAt>=ACCEL_EACH_MS){ SPEED_X+=SPEED_STEP; lastAccelAt=t; }
    const elapsed = t-startedAt; timeLeft=Math.max(0,SESSION_MS-elapsed); setTimeBar(timeLeft/SESSION_MS);
    bird.vy+=1800*dt; bird.y+=bird.vy*dt;

    if (bird.y + bird.h*0.5 > world.floorY){ bird.y = world.floorY - bird.h*0.5; collide('ground'); }
    if (bird.y - bird.h*0.5 < 0){ bird.y = bird.h*0.5; bird.vy = 0; }
    placeEl(birdEl,bird.x,bird.y,bird.w,bird.h);

    spawnPipes(); stepPipesCoinsPowers(dt);
    if (timeLeft <= 0){ finish(); return; }
    if (running) raf = win.requestAnimationFrame(tick);
  }

  function spawnPipes(){
    if (pipes.length===0){ spawn.nextPipeX = world.w + randInt(140,220); }
    const lastX = pipes.length ? pipes[pipes.length-1].x : 0;
    if (pipes.length===0 || lastX < world.w){
      if (spawn.nextPipeX <= world.w){
        const gapH = randInt(GAP_MIN, GAP_MAX);
        const gapY = randInt(int(gapH*0.6), int(world.h - SAFE_FLOOR_PAD - gapH*0.6));
        const x = world.w + randInt(160,240);

        const elTop = make('div','fl-pipe-part');
        const elBot = make('div','fl-pipe-part');
        elTop.style.backgroundImage = `url(${ASSETS.pipes.top})`;
        elBot.style.backgroundImage = `url(${ASSETS.pipes.bottom})`;
        stage.appendChild(elTop); stage.appendChild(elBot);

        const p = {x, gapY, gapH, passed:false, elTop, elBot};
        pipes.push(p); positionPipe(p);

        if (Math.random() < COIN_IN_GAP_PROB){
          const cy = gapY; const cx = x + ASSETS.pipes.width*0.5;
          const el = make('div','fl-coin'); el.style.backgroundImage = `url(${ASSETS.coin.img})`;
          stage.appendChild(el);
          coins.push({x:cx, y:cy, w:ASSETS.coin.w, h:ASSETS.coin.h, el, value:COIN_VALUE});
          placeEl(el,cx,cy,ASSETS.coin.w,ASSETS.coin.h);
        }
        if (performance.now() > bird.shieldCdTill && Math.random() < SHIELD_PROB){
          const py = clamp(gapY + randInt(int(-gapH*0.35), int(gapH*0.35)), 30, world.floorY-30);
          const px = x + randInt(40,120);
          const el = make('div','fl-power'); el.style.backgroundImage = `url(${ASSETS.shield.img})`;
          stage.appendChild(el);
          powers.push({x:px, y:py, w:ASSETS.shield.w, h:ASSETS.shield.h, el});
          placeEl(el,px,py,ASSETS.shield.w,ASSETS.shield.h);
        }
        spawn.nextPipeX = x + randInt(spawn.minDx, spawn.maxDx);
      }
    }
  }
  function positionPipe(p){
    const w = ASSETS.pipes.width;
    const topH = Math.max(0, p.gapY - p.gapH*0.5);
    const botY = p.gapY + p.gapH*0.5;
    const botH = Math.max(0, world.floorY - botY);
    placeRect(p.elTop, p.x, topH*0.5, w, topH);
    placeRect(p.elBot, p.x, botY + botH*0.5, w, botH);
  }
  function stepPipesCoinsPowers(dt){
    const vx = -SPEED_X * dt;
    for (let i=pipes.length-1;i>=0;i--){
      const p = pipes[i];
      p.x += vx; positionPipe(p);
      if (!p.passed && p.x + ASSETS.pipes.width*0.5 < bird.x){ p.passed=true; score+=1; setText(scoreEl,score); haptic('success'); }
      if (!hasShield() && intersectsPipe(bird,p)){ collide('pipe'); break; }
      if (p.x + ASSETS.pipes.width < -10){ p.elTop.remove(); p.elBot.remove(); pipes.splice(i,1); }
    }
    for (let i=coins.length-1;i>=0;i--){
      const c = coins[i];
      c.x += vx; placeEl(c.el,c.x,c.y,c.w,c.h);
      if (intersects(bird,c)){
        coinsTaken += c.value || COIN_VALUE; if (coinCnt) setText(coinCnt, coinsTaken);
        c.el.remove(); coins.splice(i,1); haptic('light'); continue;
      }
      if (c.x + c.w < -10){ c.el.remove(); coins.splice(i,1); }
    }
    for (let i=powers.length-1;i>=0;i--){
      const pw = powers[i];
      pw.x += vx; placeEl(pw.el,pw.x,pw.y,pw.w,pw.h);
      if (intersects(bird,pw)){
        bird.shieldTill = performance.now() + SHIELD_DURATION;
        bird.shieldCdTill = performance.now() + SHIELD_COOLDOWN;
        birdEl.classList.add('fl-bird--shield'); updateShieldBar();
        pw.el.remove(); powers.splice(i,1); haptic('success'); continue;
      }
      if (pw.x + pw.w < -10){ pw.el.remove(); powers.splice(i,1); }
    }
    if (bird.shieldTill && performance.now() > bird.shieldTill){ bird.shieldTill=0; birdEl.classList.remove('fl-bird--shield'); updateShieldBar(); }
    else updateShieldBar();
  }
  function hasShield(){ return bird.shieldTill && performance.now() < bird.shieldTill; }
  function updateShieldBar(){
    if (!shieldBar) return;
    let v = 0;
    if (hasShield()){ const left = bird.shieldTill - performance.now(); v = clamp(left/SHIELD_DURATION,0,1); }
    shieldBar.style.transform = `scaleX(${v.toFixed(3)})`; shieldBar.style.transformOrigin = 'left center';
  }
  function collide(){ if(!running) return;
    if (hasShield()){ bird.shieldTill=0; birdEl.classList.remove('fl-bird--shield'); updateShieldBar(); haptic('error'); return; }
    bird.alive=false; finish();
  }
  function finish(){
    if (!running) return; running=false; try{ win.cancelAnimationFrame(raf);}catch(_){}
    stage.classList.add('over');
    const finalScore = score + coinsTaken;
    if (finalScore > best){ best=finalScore; saveBest(best); }
    setText(bestEl,best); show(resBox); show(cta);
  }

  function layout(){
    const r = stage.getBoundingClientRect ? stage.getBoundingClientRect() : {width:360,height:480};
    world.w = Math.max(300, Math.floor(r.width||360));
    world.h = Math.max(360, Math.floor(r.height||480));
    world.floorY = world.h - SAFE_FLOOR_PAD;
    placeEl(birdEl,bird.x,bird.y,bird.w,bird.h);
    pipes.forEach(positionPipe);
    coins.forEach(c=>placeEl(c.el,c.x,c.y,c.w,c.h));
    powers.forEach(p=>placeEl(p.el,p.x,p.y,p.w,p.h));
  }

  function setText(el,v){ if(el) el.textContent=String(v); }
  function show(el){ if(el) el.classList.add('show'); }
  function hide(el){ if(el) el.classList.remove('show'); }
  function setTimeBar(frac){ if(!timeBar) return; const v=clamp(frac,0,1); timeBar.style.transform=`scaleX(${v.toFixed(3)})`; timeBar.style.transformOrigin='left center'; }
  function make(tag, cls){ const el = doc.createElement(tag); if(cls) el.className=cls; return el; }
  function placeEl(el,cx,cy,w,h){ el.style.width=w+'px'; el.style.height=h+'px'; el.style.transform=`translate(${Math.round(cx-w*.5)}px, ${Math.round(cy-h*.5)}px)`; }
  function placeRect(el,cx,cy,w,height){ el.style.width=w+'px'; el.style.height=height+'px'; el.style.transform=`translate(${Math.round(cx-w*.5)}px, ${Math.round(cy-height*.5)}px)`; }
  function intersects(a,b){ const ax1=a.x-a.w*.5, ay1=a.y-a.h*.5, ax2=a.x+a.w*.5, ay2=a.y+a.h*.5; const bx1=b.x-b.w*.5, by1=b.y-b.h*.5, bx2=b.x+b.w*.5, by2=b.y+b.h*.5; return ax1<bx2 && ax2>bx1 && ay1<by2 && ay2>by1; }
  function intersectsPipe(a,p){ const w=ASSETS.pipes.width; const topRect={x:p.x,y:p.gapY*.5,w,h:p.gapY}; const botH=Math.max(0, world.floorY - (p.gapY + p.gapH*.5)); const botRect={x:p.x, y:p.gapY + p.gapH*.5 + botH*.5, w, h:botH}; return intersects(a, topRect) || intersects(a, botRect); }
  function randInt(a,b){ return Math.floor(a + Math.random()*(b-a+1)); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function num(v,d){ const n=Number(v); return isFinite(n)? n : d; }

  function loadBest(){ try{ const v=localStorage.getItem('flappy_best'); const n=Number(v); return isFinite(n)? n:0; }catch(_){ return 0; } }
  function saveBest(v){ try{ localStorage.setItem('flappy_best', String(v)); }catch(_){ } }

  function cleanup(){
    try{ running=false; win.cancelAnimationFrame(raf);}catch(_){}
    try{ stage.removeEventListener('pointerdown', onPointer);}catch(_){}
    try{ doc.removeEventListener('keydown', onKey);}catch(_){}
    try{ cta.removeEventListener('click', onCta, true);}catch(_){}
    try{ ro.disconnect(); }catch(_){}
    try{ pipes.forEach(p=>{p.elTop&&p.elTop.remove(); p.elBot&&p.elBot.remove();}); coins.forEach(c=>c.el&&c.el.remove()); powers.forEach(p=>p.el&&p.el.remove()); }catch(_){}
  }
  return cleanup;
}
