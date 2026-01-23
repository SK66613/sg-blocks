// Auto-migrated from build-apps templates.js (pack3)
const BLOCK = {
    type:'bonusWheel',
    title:'Колесо',
    defaults:{
      title:'Колесо бонусов',
      spin_cost: 10,
      prizes:[
      {code:"coins_5", name:"5 \ud83e\ude99", img:"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%237b5bff%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23111827%22/%3E%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2236%22%20fill%3D%22url%28%23g%29%22/%3E%0A%3Ctext%20x%3D%2250%25%22%20y%3D%2254%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2Csystem-ui%22%20font-size%3D%2292%22%20fill%3D%22white%22%3E5%3C/text%3E%0A%3C/svg%3E"},
      {code:"coins_20", name:"20 \ud83e\ude99", img:"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%233de0c5%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23111827%22/%3E%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2236%22%20fill%3D%22url%28%23g%29%22/%3E%0A%3Ctext%20x%3D%2250%25%22%20y%3D%2254%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2Csystem-ui%22%20font-size%3D%2292%22%20fill%3D%22white%22%3E20%3C/text%3E%0A%3C/svg%3E"},
      {code:"beer", name:"\ud83c\udf7a", img:"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ef476f%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23111827%22/%3E%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2236%22%20fill%3D%22url%28%23g%29%22/%3E%0A%3Ctext%20x%3D%2250%25%22%20y%3D%2254%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2Csystem-ui%22%20font-size%3D%2292%22%20fill%3D%22white%22%3E%F0%9F%8D%BA%3C/text%3E%0A%3C/svg%3E"},
      {code:"snack", name:"\ud83e\udd68", img:"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23118ab2%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23111827%22/%3E%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2236%22%20fill%3D%22url%28%23g%29%22/%3E%0A%3Ctext%20x%3D%2250%25%22%20y%3D%2254%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2Csystem-ui%22%20font-size%3D%2292%22%20fill%3D%22white%22%3E%F0%9F%A5%A8%3C/text%3E%0A%3C/svg%3E"},
      {code:"shot", name:"\ud83e\udd43", img:"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffd166%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23111827%22/%3E%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2236%22%20fill%3D%22url%28%23g%29%22/%3E%0A%3Ctext%20x%3D%2250%25%22%20y%3D%2254%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2Csystem-ui%22%20font-size%3D%2292%22%20fill%3D%22white%22%3E%F0%9F%A5%83%3C/text%3E%0A%3C/svg%3E"},
      {code:"gift", name:"\ud83c\udf81", img:"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%3E%0A%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%0A%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2306d6a0%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23111827%22/%3E%3C/linearGradient%3E%3C/defs%3E%0A%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2236%22%20fill%3D%22url%28%23g%29%22/%3E%0A%3Ctext%20x%3D%2250%25%22%20y%3D%2254%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2Csystem-ui%22%20font-size%3D%2292%22%20fill%3D%22white%22%3E%F0%9F%8E%81%3C/text%3E%0A%3C/svg%3E"}
      ]
    },
    preview:(p={})=>{
      const title = (p && p.title) ? p.title : 'Колесо бонусов';
      const prizes = Array.isArray(p.prizes) ? p.prizes : [];
      const items = prizes.map(pr=>`
        <button class="bonus" type="button" data-code="${pr.code||''}" data-name="${pr.name||''}">
          <img src="${pr.img||''}" alt="">
          <span>${pr.name||''}</span>
        </button>`).join('');
      return `
      <div class="card bonus-card">
        <div class="h2">${title}</div>
        <div class="bonus-head">
          <div class="picked-pill muted" data-picked-pill>Нажми «Крутануть»</div>
          <div class="mut" style="margin-left:auto">Монеты: <b data-coins>0</b></div>
        </div>
        <div class="bonus-wheel" data-bonus-wheel>
          <div class="wheel-track" data-wheel-track>
            ${items}
          </div>
          <div class="wheel-center"></div>
        </div>
        <div class="actions">
          <button class="btn primary" type="button" data-spin>Крутануть</button>
          <button class="btn" type="button" data-claim disabled>Нет приза к выдаче</button>
          <div data-picked class="mut"></div>
        </div>
      </div>`;
    },
    init:(el, props, ctx)=>{
      // ---- scoped wheel runtime (based on bonus_demo_fixed) ----
      const wheel = el.querySelector('[data-bonus-wheel]');
      const track = el.querySelector('[data-wheel-track]');
      if(!wheel || !track) return;

      const pill  = el.querySelector('[data-picked-pill]');
      const claim = el.querySelector('[data-claim]');
      const spin  = el.querySelector('[data-spin]');
      const coinsEl = el.querySelector('[data-coins]');
      const pickedEl= el.querySelector('[data-picked]');

      // Provide demo state/api if app doesn't have them yet
      if(!window.MiniState) {
        window.MiniState = {
          coins: 50,
          config: { WHEEL_SPIN_COST: (Number(props?.spin_cost)||10) },
          wheel: { has_unclaimed:false, claim_cooldown_left_ms:0, last_prize_title:'' }
        };
      }
      if(typeof window.applyServerState!=='function') {
        window.applyServerState = function(fresh){
          if(!fresh) return;
          window.MiniState = window.MiniState || {};
          for(const k in fresh) window.MiniState[k] = fresh[k];
        };
      }
      if(typeof window.api!=='function') {
        // light mock for preview
        window.api = async function(method, payload){
          await new Promise(r=>setTimeout(r, 250));
          const st = window.MiniState||{};
          st.wheel = st.wheel || {};
          if(method==='wheel.spin') {
            const cost = Number((st.config||{}).WHEEL_SPIN_COST || (Number(props?.spin_cost)||0) || 0);
            if(Number(st.coins||0) < cost) return {ok:false, error:'no_coins'};
            st.coins = Number(st.coins||0) - cost;
            const list = (Array.isArray(props?.prizes) ? props.prizes : []);
            const pick = list[Math.floor(Math.random()*Math.max(1,list.length))] || {};
            st.wheel.has_unclaimed = true;
            st.wheel.claim_cooldown_left_ms = 0;
            st.wheel.last_prize_title = pick.name || pick.code || '';
            return {ok:true, prize:{code: pick.code}, fresh_state:{coins:st.coins, wheel:st.wheel}};
          }
          if(method==='wheel.claim') {
            if(!st.wheel.has_unclaimed) return {ok:false, error:'no_unclaimed_prize'};
            st.wheel.has_unclaimed=false;
            st.wheel.claim_cooldown_left_ms = 15000;
            return {ok:true, fresh_state:{coins:st.coins, wheel:st.wheel}};
          }
          return {ok:false, error:'unknown_method'};
        };
      }

      const items = Array.from(track.children);
      const N = items.length || 1;

      // animation settings
      const CONFETTI_CODES = ['coins_20','coins_5'];
      const FINAL_LAPS = 1;
      const FINAL_DUR  = 1200;
      const MIN_SPIN_MS = 1600;
      const FREE_SPIN_RPS = 1;

      let STEP = 114;
      requestAnimationFrame(()=>{
        const a = items[0]?.getBoundingClientRect();
        const b = items[1]?.getBoundingClientRect();
        if(a && b){
          const dx = Math.round(b.left - a.left);
          if(dx>40 && dx<300) STEP = dx;
        }
      });

      let curr=0, interacted=false, spinning=false;
      const mod = (a,n)=>((a%n)+n)%n;
      function nearest(curr, idx, n){
        let t = idx;
        while (t - curr > n/2) t -= n;
        while (curr - t > n/2) t += n;
        return t;
      }

      const TG = window.Telegram && window.Telegram.WebApp;
      function hapticPulse(level='light'){
        try{ if(TG?.HapticFeedback){ if(level==='selection') return TG.HapticFeedback.selectionChanged(); TG.HapticFeedback.impactOccurred(level); return; } }catch(_ ){}
        try{ navigator.vibrate && navigator.vibrate(level==='heavy'?30:level==='medium'?20:12); }catch(_ ){}
      }

      // toast + confetti helpers (shared CSS already in theme)
      function ensureToastHost(){
        let host = document.getElementById('toasts');
        if(!host){ host=document.createElement('div'); host.id='toasts'; host.className='toasts'; document.body.appendChild(host); }
        return host;
      }
      function showToast(msg, type='error', ms=2800){
        const host=ensureToastHost();
        const el=document.createElement('div');
        el.className='toast'+(type==='ok'?' toast--ok':' toast--error');
        el.innerHTML = `<span>${msg}</span><button class="toast__close" aria-label="Закрыть">✕</button>`;
        host.appendChild(el);
        const close=()=>{ el.style.animation='toast-out .22s ease forwards'; setTimeout(()=>el.remove(),240); };
        el.querySelector('.toast__close')?.addEventListener('click', close);
        setTimeout(close, ms);
      }
      function confettiBurst(x,y){
        let layer=document.getElementById('confetti');
        if(!layer){ layer=document.createElement('div'); layer.id='confetti'; document.body.appendChild(layer); }
        const colors=['#7b5bff','#3de0c5','#ffd166','#ef476f','#06d6a0','#118ab2'];
        const rect=document.body.getBoundingClientRect();
        const ox=(x ?? rect.width/2), oy=(y ?? rect.height/3);
        for(let i=0;i<36;i++){ 
          const c=document.createElement('div');
          c.className='confetti-piece';
          c.style.background=colors[i%colors.length];
          const ang=(i/36)*Math.PI*2;
          const speed=140+Math.random()*120;
          const dx=Math.cos(ang)*speed;
          const dy=Math.sin(ang)*speed+220;
          c.style.setProperty('--x', ox+'px');
          c.style.setProperty('--y', oy+'px');
          c.style.setProperty('--dx', dx+'px');
          c.style.setProperty('--dy', dy+'px');
          layer.appendChild(c);
          setTimeout(()=>c.remove(),950);
        }
      }

      // claim cooldown
      let claimTimerId=null, claimLeftMsLocal=0;
      function getMiniState(){ return window.MiniState||{}; }
      function getWheelState(){ const st=getMiniState(); return st.wheel||{}; }
      function getCoins(){ return Number(getMiniState().coins||0); }
      function getSpinCost(){ const cfg=(getMiniState().config||{}); return Number(cfg.WHEEL_SPIN_COST||cfg.SPIN_COST||0); }

      function syncCoinsUI(){
        const coins=getCoins();
        if(coinsEl) coinsEl.textContent=String(coins);
        if(spin) spin.classList.toggle('is-locked', (coins<getSpinCost())||spinning);
      }

      function refreshClaimState(){
        if(!claim) return;
        const ws=getWheelState();
        const rem=Number(ws.claim_cooldown_left_ms||0);
        const hasPrize=!!ws.has_unclaimed;

        if(claimTimerId){ clearInterval(claimTimerId); claimTimerId=null; }

        if(!hasPrize){ claim.disabled=true; claim.textContent='Нет приза к выдаче'; return; }

        claimLeftMsLocal = rem;
        if(claimLeftMsLocal<=0){ claim.disabled=false; claim.textContent='Забрать бонус'; return; }

        claim.disabled=true;
        const tick=()=>{
          if(claimLeftMsLocal<=0){ clearInterval(claimTimerId); claimTimerId=null; claim.disabled=false; claim.textContent='Забрать бонус'; return; }
          const totalSec=Math.floor(claimLeftMsLocal/1000);
          const m=Math.floor((totalSec%3600)/60), s=totalSec%60;
          claim.textContent='Доступно через '+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
          claimLeftMsLocal -= 1000;
        };
        tick();
        claimTimerId=setInterval(tick,1000);
      }

      function updatePillByIndex(idx){
        const it=items[idx];
        const name=it?.dataset?.name||'—';
        const img=it?.querySelector('img')?.src||'';
        if(!pill) return;
        pill.classList.remove('muted');
        pill.innerHTML = img ? `<img src="${img}" alt=""><span>${name}</span>` : name;
      }

      function updateUI(){
        items.forEach((node,i)=>{
          let dx=i-curr; dx = mod(dx + N/2, N) - N/2;
          const x=dx*STEP;
          const s=1 - Math.min(Math.abs(dx)*0.16, 0.48);
          node.style.transform=`translate(-50%,-50%) translateX(${x}px) scale(${s})`;
          node.style.zIndex=String(1000 - Math.abs(dx)*10);
          node.classList.toggle('active', Math.round(Math.abs(dx))===0);
        });
        if(interacted) updatePillByIndex(mod(Math.round(curr), N));
        else if(pill){ pill.classList.add('muted'); pill.textContent='Нажми «Крутануть»'; }
        refreshClaimState();
        syncCoinsUI();
      }

      function spinTo(targetIdx, laps=1, dur=1600){
        return new Promise(resolve=>{
          const base=nearest(curr,targetIdx,N);
          const dir=(base>=curr?1:-1)||1;
          const to=base + dir*(laps*N);
          const from=curr;
          const t0=performance.now();
          let lastPulse=0;
          function tick(t){
            const k=Math.min((t-t0)/dur,1);
            curr = from + (to-from)*(1-Math.pow(1-k,3));
            updateUI();
            const period = 80 + 180*k;
            if(t-lastPulse>=period){ hapticPulse('light'); lastPulse=t; }
            if(k<1) requestAnimationFrame(tick);
            else { curr=to; interacted=true; updateUI(); resolve(); }
          }
          requestAnimationFrame(tick);
        });
      }

      // free spin
      const FREE_SPIN_SPEED = (FREE_SPIN_RPS * N) / 1000;
      let freeSpinRunning=false;
      function startFreeSpin(){
        if(freeSpinRunning) return;
        freeSpinRunning=true;
        let last=performance.now();
        function loop(now){
          if(!freeSpinRunning) return;
          const dt=now-last; last=now;
          curr = mod(curr + FREE_SPIN_SPEED*dt, N);
          updateUI();
          requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
      }
      function stopFreeSpin(){ freeSpinRunning=false; }

      spin?.addEventListener('click', async ()=>{
        if(spinning) return;
        const coins=getCoins(), cost=getSpinCost();
        if(coins < cost){ hapticPulse('medium'); showToast(`Недостаточно монет. Нужно ${cost} 🪙`, 'error'); return; }
        if(typeof window.api!=='function'){ showToast('API не инициализировалось', 'error', 3200); return; }
        spinning=true; spin.classList.add('is-locked');
        const startTs=performance.now();
        startFreeSpin();
        try{
          let r;
          try{ r = await window.api('wheel.spin', {}); }catch(e){ r={ok:false,error:'network'}; }
          const elapsed = performance.now()-startTs;
          if(elapsed<MIN_SPIN_MS) await new Promise(res=>setTimeout(res, MIN_SPIN_MS-elapsed));
          stopFreeSpin();

          if(!r || !r.ok){ showToast('Ошибка при крутке: '+(r?.error||'unknown'), 'error', 3200); return; }

          if(r.fresh_state && window.applyServerState) window.applyServerState(r.fresh_state);

          const code = r.prize?.code || '';
          let idx = items.findIndex(n=>String(n.dataset.code||'')===String(code));
          if(idx<0) idx = Math.floor(Math.random()*N);

          if(CONFETTI_CODES.includes(code)) {
            const rect = spin.getBoundingClientRect();
            confettiBurst(rect.left + rect.width/2, rect.top + rect.height/2);
          }

          await spinTo(idx, FINAL_LAPS, FINAL_DUR);

          const ws=getWheelState();
          if(pickedEl) pickedEl.textContent = ws.last_prize_title ? `Выпало: ${ws.last_prize_title}` : '';
        } finally {
          spinning=false; spin.classList.remove('is-locked');
          syncCoinsUI(); refreshClaimState();
        }
      });

      claim?.addEventListener('click', async ()=>{
        if(claim.disabled) return;
        try{
          const r = await window.api('wheel.claim', {});
          if(!r || !r.ok){ showToast('Ошибка при подтверждении: '+(r?.error||'unknown'), 'error', 3200); refreshClaimState(); return; }
          if(r.fresh_state && window.applyServerState) window.applyServerState(r.fresh_state);
          showToast('Приз подтверждён, подойди к бармену', 'ok', 2200);
          refreshClaimState();
        }catch(e){ showToast('Ошибка сети', 'error', 2800); }
      });

      // initial
      updateUI();

      // cleanup
      return ()=>{
        try{ claimTimerId && clearInterval(claimTimerId); }catch(_ ){}
      };
    }
  };

export async function mount(el, props={}, ctx={}){
  try{
    if (!el) return null;

    // Ensure markup exists before init()
    if (typeof BLOCK.preview === 'function') {
      el.innerHTML = BLOCK.preview(props||{});
    }

    if (typeof BLOCK.init === 'function') {
      // init may return cleanup fn
      return await BLOCK.init(el, props, ctx);
    }

    return null;
  }catch(e){
    console.error('[bonusWheel] mount error', e);
    return null;
  }
}

export function unmount(el){
  try{ if (el) el.innerHTML=''; }catch(_e){}
}
