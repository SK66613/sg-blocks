/* Flappy-lite+ mountable version for constructor preview
   Based on original app_block_06.js logic, but scoped to a host container.
   Exposes: window.GAMES.flappy.mount(host, ctx) -> cleanup()
*/
(function(){
  window.GAMES = window.GAMES || {};

  const ASSET_BASE = (window.__SG_FLAPPY_BASE__ || './games/flappy/') + 'assets/';
  const ASSETS = {
    bird:   { img: ASSET_BASE+'bumblebee.png',  w: 56, h: 42 },
    pipes:  { top: ASSET_BASE+'pipe_top.png', bottom: ASSET_BASE+'pipe_bottom.png', width:54 },
    coin:   { img: ASSET_BASE+'coin.png',   w:32, h:32, value:5 },
    shield: { img: ASSET_BASE+'shield.png', w:34, h:34, dur_ms:6000 }
  };

  window.GAMES.flappy = {
    title:'Flappy',
    mount(host, ctx){
      const props = (ctx && ctx.props) || {};
      const difficulty = props.difficulty || 'normal';
      const birdMode   = props.bird_mode || 'default';
      const customBirdImg = (birdMode === 'custom' && props.bird_img) ? props.bird_img : null;
      const shieldImg = props.shield_img || null;

      const TG =
  (window.Telegram && window.Telegram.WebApp) ||
  (window.parent && window.parent.Telegram && window.parent.Telegram.WebApp);


      // Fullscreen overlay inside iframe (covers the preview viewport)
      host.innerHTML = `
        <div class="flappy is-open" role="dialog" aria-label="Flappy">
          <div class="flappy__wrap" id="flappy">
            <div class="fl-hud">
              <div class="fl-score">Счёт: <span id="fl-score">0</span></div>
              <div class="fl-bar"><i id="fl-bar"></i></div>

              <div class="fl-stats">
                <div class="fl-stat">
                  <span class="fl-ico" id="fl-coin-ico"></span>
                  <span id="fl-coin-count">0</span>
                </div>
                <div class="fl-stat fl-shield-wrap">
                  <span class="fl-ico" id="fl-shield-ico"></span>
                  <span class="fl-shield-bar"><i id="fl-shield-bar"></i></span>
                </div>
              </div>
            </div>

            <div class="fl-stage" id="fl-stage">
              <div class="fl-hint" id="fl-hint">Тапни чтобы начать</div>
              <div class="fl-bird" id="fl-bird"></div>
            </div>

            <div class="fl-result" id="fl-result">
              <div class="fl-card">
                <div class="fl-cell"><div class="fl-val" id="fl-best">0</div><div class="fl-sub">Лучший</div></div>
                <div class="fl-cell"><div class="fl-val" id="fl-world">200</div><div class="fl-sub">Мир</div></div>
              </div>
            </div>

            <div class="fl-cta" id="fl-cta">
              <button class="btn">Ещё раз</button>
            </div>
          </div>
        </div>
      `;

      // scope helpers
      const doc = host.ownerDocument;
      const $ = (sel)=>host.querySelector(sel);

      const root   = $('#flappy');
      const stage  = $('#fl-stage');
      const birdEl = $('#fl-bird');
      const hintEl = $('#fl-hint');
      const scoreEl= $('#fl-score');
      const barEl  = $('#fl-bar');

      const coinIco= $('#fl-coin-ico');
      const coinCnt= $('#fl-coin-count');
      const shIco  = $('#fl-shield-ico');
      const shBar  = $('#fl-shield-bar');

      const resBox = $('#fl-result');
      const bestEl = $('#fl-best');
      const worldEl= $('#fl-world');
      const cta    = $('#fl-cta');

      // ===== ASSETS apply (same as original, but with our paths) =====
      function applyAssets(){
        doc.documentElement.style.setProperty('--bird-w', (ASSETS.bird.w||48)+'px');
        doc.documentElement.style.setProperty('--bird-h', (ASSETS.bird.h||36)+'px');
        const birdImg = customBirdImg || ASSETS.bird.img;
        if (birdImg){
          birdEl.classList.add('fl-bird--sprite');
          birdEl.style.backgroundImage = `url(${birdImg})`;
        } else {
          birdEl.classList.remove('fl-bird--sprite');
          birdEl.style.backgroundImage = '';
        }
        doc.documentElement.style.setProperty('--pipe-w', (ASSETS.pipes.width||76)+'px');
        if (ASSETS.coin.img)   coinIco.style.backgroundImage = `url(${ASSETS.coin.img})`;
        const shieldSprite = shieldImg || ASSETS.shield.img;
        if (shieldSprite) shIco.style.backgroundImage = `url(${shieldSprite})`;
        doc.documentElement.style.setProperty('--coin-w', (ASSETS.coin.w||32)+'px');
        doc.documentElement.style.setProperty('--coin-h', (ASSETS.coin.h||32)+'px');
        doc.documentElement.style.setProperty('--pow-w',  (ASSETS.shield.w||34)+'px');
        doc.documentElement.style.setProperty('--pow-h',  (ASSETS.shield.h||34)+'px');
      }

      // ===== TUNING (from original) =====
      const WORLD_RECORD     = 200;
      const GRAVITY          = 1800;
      const FLAP_VELOCITY    = -520;
      let SPEED_X          = 220;
      const ACCEL_EACH_MS    = 8000;
      const SPEED_STEP       = 28;
      const PIPE_SPAWN_MS    = 1300;
      let GAP_MIN          = 150;
      let GAP_MAX          = 190;
      // tuning by difficulty
      if (difficulty === 'easy'){
        SPEED_X *= 0.8;
        GAP_MIN *= 1.2;
        GAP_MAX *= 1.2;
      } else if (difficulty === 'hard'){
        SPEED_X *= 1.25;
        GAP_MIN *= 0.85;
        GAP_MAX *= 0.85;
      }

      const GAP_TOP_PAD      = 80;
      const BIRD_X_FACTOR    = 0.25;
      const ROT_UP           = -35, ROT_DOWN = 90;
      const SAFE_FLOOR_PAD   = 6;

      const COIN_IN_GAP_PROB = 0.9;
      const SHIELD_PROB      = 0.18;   // in preview keep sane (original had 0.9)
      const SHIELD_COOLDOWN  = 9000;

      const MAGNET_ENABLED   = true;
      const MAGNET_RADIUS    = 140;
      const MAGNET_PULL_PX_S = 300;

      // ===== STATE =====
      let best     = 0;
      try{ best = Number(doc.defaultView.localStorage.getItem('flappy_best')||0) || 0; }catch(_){}
      let running=false, started=false;
      let raf=0, spawnT=Infinity, t0=0;
      let w=0,h=0, birdX=0, birdY=0, birdVY=0;

      let pipes=[];   // {x, gapY, gap, topEl, botEl, passed:false}
      let items=[];   // {type, x,y, el}
      let lastShieldSpawn=0;

      let score=0, coins=0;
      let shieldActive=false, shieldUntil=0;

      const haptic = lvl=>{ try{ TG?.HapticFeedback?.impactOccurred(lvl||'light'); }catch(_){} };
      const clamp  = (v,a,b)=> Math.max(a, Math.min(b, v));
      const rand   = (a,b)=> a + Math.random()*(b-a);

      function layout(){
        w = stage.clientWidth;
        h = stage.clientHeight;
        birdX = w * BIRD_X_FACTOR;
        if (!started){
          birdY = h * 0.45;
          applyBird();
        }
      }
      function applyBird(){ birdEl.style.left = birdX + 'px'; birdEl.style.top = birdY + 'px'; }
      function setScore(v){ scoreEl.textContent = String(v|0); }
      function setCoins(v){ coinCnt.textContent = String(v|0); }

      function spawnPipe(){
        const gap = rand(GAP_MIN, GAP_MAX);
        const minY = GAP_TOP_PAD + gap/2;
        const maxY = h - GAP_TOP_PAD - gap/2;
        const gapY = rand(minY, maxY);

        const top = doc.createElement('div');
        const bot = doc.createElement('div');
        top.className = 'fl-pipe-part';
        bot.className = 'fl-pipe-part';
        if (ASSETS.pipes.top && ASSETS.pipes.bottom){
          top.classList.add('fl-pipe--sprite');
          bot.classList.add('fl-pipe--sprite');
          top.style.backgroundImage = `url(${ASSETS.pipes.top})`;
          bot.style.backgroundImage = `url(${ASSETS.pipes.bottom})`;
        }
        stage.appendChild(top);
        stage.appendChild(bot);

        const p = { x: w + (ASSETS.pipes.width||76), gapY, gap, topEl: top, botEl: bot, passed:false };
        pipes.push(p);
        positionPipe(p);

        // coin in gap
        if (Math.random() < COIN_IN_GAP_PROB){
          const c = doc.createElement('div');
          c.className = 'fl-coin';
          if (ASSETS.coin.img) c.style.backgroundImage = `url(${ASSETS.coin.img})`;
          stage.appendChild(c);
          const it = { type:'coin', x: p.x + 200, y: gapY, el: c };
          items.push(it);
          positionItem(it);
        }

        // shield (cooldown)
        if (Date.now() - lastShieldSpawn > SHIELD_COOLDOWN && Math.random() < SHIELD_PROB){
          const s = doc.createElement('div');
          s.className = 'fl-power';
          const shieldSprite = shieldImg || ASSETS.shield.img;
          if (shieldSprite) s.style.backgroundImage = `url(${shieldSprite})`;
          stage.appendChild(s);
          const it = { type:'shield', x: p.x + 300, y: gapY - gap*0.35, el: s };
          items.push(it);
          positionItem(it);
          lastShieldSpawn = Date.now();
        }
      }

      function positionPipe(p){
        const pipeW = (ASSETS.pipes.width||76);
        const th = p.gapY - p.gap/2;
        const bt = p.gapY + p.gap/2;
        p.topEl.style.left = p.x + 'px';
        p.topEl.style.top  = '0px';
        p.topEl.style.height = th + 'px';
        p.topEl.style.width  = pipeW + 'px';
        p.botEl.style.left = p.x + 'px';
        p.botEl.style.top  = bt + 'px';
        p.botEl.style.height = (h - bt) + 'px';
        p.botEl.style.width  = pipeW + 'px';
      }

      function positionItem(it){
        it.el.style.left = it.x + 'px';
        it.el.style.top  = it.y + 'px';
      }
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
              coins += 1;
              setCoins(coins);
              score += 1; // score for passing is separate; keep simple here
              setScore(score);
              haptic('medium');
            } else if (it.type==='shield'){
              activateShield();
              haptic('medium');
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
          hintEl.style.display = 'none';
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
        cancelAnimationFrame(raf);

        if (score > best){
          best = score;
          try{ doc.defaultView.localStorage.setItem('flappy_best', String(best)); }catch(_){}
        }

            // === submit score to backend (D1) ===
try {
  const TG =
  (window.Telegram && window.Telegram.WebApp) ||
  (window.parent && window.parent.Telegram && window.parent.Telegram.WebApp);


  // public_id из урла вида /m/<public_id>  (например: /m/app-test1-jxk6)
  const pid = (function () {
    try {
      const p = (location.pathname || "").split("/").filter(Boolean);
      const i = p.indexOf("m") >= 0 ? p.indexOf("m") : p.indexOf("app");
      if (i >= 0 && p[i + 1]) return p[i + 1];
      return new URL(location.href).searchParams.get("public_id") || "";
    } catch (_) {
      return "";
    }
  })();

  if (TG && pid) {
    const init_data = TG.initData || "";
    const u =
      TG.initDataUnsafe && TG.initDataUnsafe.user ? TG.initDataUnsafe.user : null;

    if (init_data && u && u.id) {
      // ВАЖНО: правильный роут воркера для событий из мини-аппа:
      // POST /api/public/app/<publicId>/event
      const url =
        "https://app.salesgenius.ru/api/public/app/" +
        encodeURIComponent(pid) +
        "/event";

      const payload = {
        type: "game.submit",
        init_data,
        tg_user: {
          id: u.id,
          username: u.username || "",
          first_name: u.first_name || "",
          last_name: u.last_name || "",
        },
        payload: {
          game_id: "flappy",
          mode: "daily",
          score: Number(score || 0),
          // опционально (если захочешь учитывать время игры)
          // duration_ms: Number(performance.now() - t0 || 0)
        },
      };

      // НЕ глушим ошибки: читаем ответ и показываем в UI/локально
      let status = 0;
      let text = "";
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        status = resp.status;
        text = await resp.text();

        // сохраним на всякий случай, чтобы потом посмотреть без консоли
        try {
          localStorage.setItem(
            "flappy_last_submit",
            JSON.stringify({ at: Date.now(), status, body: text }).slice(0, 8000)
          );
        } catch (_) {}

        // если есть тосты — покажем
        if (window.showToast) {
          if (resp.ok) window.showToast("Score отправлен ✅", true);
          else window.showToast("Score НЕ отправлен: " + status, false);
        }
      } catch (e) {
        try {
          localStorage.setItem(
            "flappy_last_submit",
            JSON.stringify({ at: Date.now(), status: 0, error: String(e) }).slice(
              0,
              8000
            )
          );
        } catch (_) {}

        if (window.showToast) window.showToast("Score: ошибка сети", false);
      }
    }
  }
} catch (_) {}




         
        bestEl.textContent = String(best|0);
        worldEl.textContent = String(WORLD_RECORD);

        resBox.classList.add('show');
        cta.classList.add('show');
      }

      function resetScene(){
        pipes.forEach(removePipe); pipes = [];
        items.forEach(removeItem); items = [];
        coins=0; setCoins(0);

        shieldActive=false;
        birdEl.classList.remove('fl-bird--shield');
        shBar.style.transform = 'scaleX(0)';

        started=false; score=0; setScore(0);
        hintEl.style.display = '';
        birdVY = 0;
        birdEl.style.transform = 'translate(-50%,-50%) rotate(0deg)';
        barEl.style.transform = 'scaleX(1)';

        layout();

        spawnT = Infinity;
        tick._prev = performance.now();
        resBox.classList.remove('show');
        cta.classList.remove('show');
      }

      function tick(){
        const now = performance.now();
        const dt  = Math.min(32, now - (tick._prev||now)); tick._prev = now;

        if (!started){
          birdY += Math.sin(now/300) * 0.12;
          applyBird();
          updateShieldHud();
          raf = requestAnimationFrame(tick);
          return;
        }

        const elapsed = now - t0;
        const prog = Math.min(1, elapsed / 45000);
        barEl.style.transform = `scaleX(${1-prog})`;

        const speed = SPEED_X + Math.floor(elapsed / ACCEL_EACH_MS) * SPEED_STEP;

        birdVY += GRAVITY * (dt/1000);
        birdY  += birdVY * (dt/1000);

        const ang = clamp((birdVY/600)*45, ROT_UP, ROT_DOWN);
        birdEl.style.transform = `translate(-50%,-50%) rotate(${ang}deg)`;

        const topLimit = 6;
        const botLimit = h - SAFE_FLOOR_PAD;
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

        for (const p of pipes){
          if (!p.passed && p.x + (ASSETS.pipes.width||76) < birdX){
            p.passed = true;
            score += 1;
            setScore(score);
            haptic('light');
          }
        }

        while (pipes.length && pipes[0].x < -(ASSETS.pipes.width||76)-2){ removePipe(pipes[0]); pipes.shift(); }
        while (items.length && items[0].x < -80){ removeItem(items[0]); items.shift(); }

        collideItems();
        if (collidePipe()){
          if (shieldActive){
            shieldActive = false;
            birdEl.classList.remove('fl-bird--shield');
            shBar.style.transform = 'scaleX(0)';
            birdVY = -260;
          } else { crash(); return; }
        }

        if (now - spawnT > PIPE_SPAWN_MS){ spawnT = now; spawnPipe(); }

        applyBird();
        updateShieldHud();

        raf = requestAnimationFrame(tick);
      }

// listeners (scoped + removable)
const onPointer = (e)=>{
  // ✅ если тап по UI (кнопка/оверлей) — НЕ трогаем игру
  if (
    e.target.closest('#fl-cta') ||
    e.target.closest('#fl-result') ||
    e.target.closest('button,a,input,textarea,select')
  ) return;

  // ✅ при показанном результате/CTA — сцену игнорируем (никакого рестарта)
  if (cta.classList.contains('show') || resBox.classList.contains('show')) return;

  e.preventDefault();
  flap();
};
stage.addEventListener('pointerdown', onPointer, { passive:false });

const onKey = (e)=>{
  if (e.code==='Space' || e.key==='ArrowUp'){ e.preventDefault(); flap(); }
  if (e.key==='Escape'){ cleanup(); }
};
doc.addEventListener('keydown', onKey);

// ✅ рестарт ТОЛЬКО по кнопке (pointerdown в capture, чтобы не зависеть от click)
const onCta = (e)=>{
  const btn = e.target.closest('.btn');
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  // спрятать результат и кнопку
  resBox.classList.remove('show');
  cta.classList.remove('show');

  // сброс в режим ожидания тапа
  resetScene();
  running = true;
  const t = performance.now();
  tick._prev = t;
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
};

// вместо click:
cta.addEventListener('pointerdown', onCta, { capture:true, passive:false });
// можно оставить click как запасной:
cta.addEventListener('click', onCta, true);


      // open fullscreen immediately
      try{ doc.body.classList.add('flappy-open'); }catch(_){}
      applyAssets();
      layout();
      resetScene();

      running = true;
      raf = requestAnimationFrame(tick);

      // resize
      const ro = new (doc.defaultView.ResizeObserver || ResizeObserver)(()=>layout());
      try{ ro.observe(stage); }catch(_){}

      function cleanup(){
        try{ running=false; cancelAnimationFrame(raf); }catch(_){}
        try{ stage.removeEventListener('pointerdown', onPointer); }catch(_){}
        try{ doc.removeEventListener('keydown', onKey); }catch(_){}
        try{ cta.removeEventListener('click', onCta); }catch(_){}
        try{ ro.disconnect(); }catch(_){}
        try{ doc.body.classList.remove('flappy-open'); }catch(_){}
        host.innerHTML = '';
      }

      return cleanup;
    }
  };
})();
