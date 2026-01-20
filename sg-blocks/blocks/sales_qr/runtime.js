// sales_qr/runtime.js
// Renders "client QR for cashier" with optional buttons and auto refresh.
// Depends only on DOM + fetch().
// QR rendering uses quickchart.io (as you used earlier).

function $(root, sel){ return root ? root.querySelector(sel) : null; }

function safeNum(x, def){
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function clamp(n, a, b){
  n = Number(n);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function getPublicId(ctx){
  const c = ctx || {};
  const pid = c.publicId || c.appPublicId || c.public_id || '';
  if (pid) return String(pid);

  // optional: try infer from URL like /m/<publicId>/...
  try{
    const parts = String(location.pathname||'').split('/').filter(Boolean);
    const i = parts.indexOf('m');
    if (i >= 0 && parts[i+1]) return parts[i+1];
  }catch(_){}
  return '';
}

function getInitData(){
  try{
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    return tg && tg.initData ? String(tg.initData) : '';
  }catch(_){ return ''; }
}

async function postJSON(url, data){
  const r = await fetch(url, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify(data || {})
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok){
    const msg = (j && (j.error || j.message)) ? String(j.error || j.message) : ('HTTP_' + r.status);
    throw new Error(msg);
  }
  return j;
}

async function drawQr(canvas, fallbackEl, text){
  if (!canvas || !fallbackEl) return false;

  // clear canvas
  try{
    const ctx2 = canvas.getContext('2d');
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
  }catch(_){}

  // render via image
  const imgUrl = `https://quickchart.io/qr?size=${canvas.width}&text=${encodeURIComponent(text)}`;

  try{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const ok = await new Promise((resolve)=>{
      img.onload = ()=> resolve(true);
      img.onerror = ()=> resolve(false);
      img.src = imgUrl;
    });

    if (ok){
      fallbackEl.style.display = 'none';
      canvas.style.display = 'block';
      const ctx2 = canvas.getContext('2d');
      ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
      return true;
    }
  }catch(_){}

  // fallback: show text if image blocked
  canvas.style.display = 'none';
  fallbackEl.style.display = 'block';
  fallbackEl.textContent = text;
  return false;
}

function toast(msg){
  try{
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.showToast){
      tg.showToast({ text: String(msg||'') });
      return;
    }
  }catch(_){}
  try{ console.log('[sales_qr]', msg); }catch(_){}
}

export function mount(rootEl, props = {}, ctx = {}){
  const root = $(rootEl, '[data-sq]') || rootEl;

  const titleEl   = $(root, '[data-sq-title]');
  const subEl     = $(root, '[data-sq-sub]');
  const descEl    = $(root, '[data-sq-desc]');
  const cbEl      = $(root, '[data-sq-cb]');
  const statusEl  = $(root, '[data-sq-status]');
  const canvas    = $(root, '[data-sq-canvas]');
  const fallback  = $(root, '[data-sq-fallback]');
  const actionsEl = $(root, '[data-sq-actions]');

  const btnRefresh = $(root, '[data-sq-act="refresh"]');
  const btnCopy    = $(root, '[data-sq-act="copy"]');
  const btnRefreshLabel = $(root, '[data-sq-btn-refresh]');
  const btnCopyLabel    = $(root, '[data-sq-btn-copy]');

  // ---- props (support new + legacy keys) ----
  const title = String((props.title ?? '')).trim();
  const subtitle = String((props.subtitle ?? props.sub ?? '')).trim();
  const description = String((props.description ?? '')).trim();

  const cashback = clamp(props.cashback_percent ?? 10, 0, 100);

  // ttl affects server-side token lifetime (we show it, but server may override via D1)
  const ttlSec = clamp(props.ttl_sec ?? props.token_ttl_sec ?? 300, 60, 600);

  // refresh is client-side auto refresh frequency
  const refreshEvery = clamp(props.refresh_sec ?? props.refresh_every_sec ?? 60, 10, 600);

  const showRefresh = props.show_refresh !== false;
  const showCopy = props.show_copy !== false;

  const labelRefresh = String(props.btn_refresh || 'Обновить');
  const labelCopy = String(props.btn_copy || 'Скопировать ссылку');

  // bot username: best is ctx.bot_username from state; fallback to props.bot_username
  const bot = String(ctx.bot_username || props.bot_username || '').replace(/^@/, '').trim();

  // apply content + hide when empty
  if (titleEl){
    titleEl.textContent = title;
    titleEl.style.display = title ? '' : 'none';
  }
  if (subEl){
    subEl.textContent = subtitle;
    subEl.style.display = subtitle ? '' : 'none';
  }
  if (descEl){
    if (description){
      descEl.textContent = description;
      descEl.style.display = '';
    } else {
      descEl.textContent = '';
      descEl.style.display = 'none';
    }
  }
  if (cbEl) cbEl.textContent = `${cashback}%`;

  if (btnRefresh) btnRefresh.style.display = showRefresh ? '' : 'none';
  if (btnCopy) btnCopy.style.display = showCopy ? '' : 'none';
  if (actionsEl) actionsEl.style.display = (showRefresh || showCopy) ? '' : 'none';

  // button labels (if your view.html puts label spans; if not, we set button text)
  if (btnRefreshLabel) btnRefreshLabel.textContent = labelRefresh;
  else if (btnRefresh) btnRefresh.textContent = labelRefresh;

  if (btnCopyLabel) btnCopyLabel.textContent = labelCopy;
  else if (btnCopy) btnCopy.textContent = labelCopy;

  let lastLink = '';
  let inFlight = false;
  let timer = null;

  function setStatus(s){
    if (statusEl) statusEl.textContent = String(s || '');
  }

  async function refresh(){
    if (inFlight) return;
    inFlight = true;

    try{
      const publicId = getPublicId(ctx);
      if (!publicId){
        setStatus('Не найден publicId приложения');
        return;
      }

      const initData = getInitData();
      if (!initData){
        // preview mode (not in Telegram) – show a demo token
        setStatus('Откройте в Telegram для реального QR');
        lastLink = bot ? `https://t.me/${bot}?start=sale_demo_${publicId}` : `sale_demo_${publicId}`;
        await drawQr(canvas, fallback, lastLink);
        return;
      }

      setStatus('Обновляем QR…');

      // server should take TTL/cashback/cashiers from D1; we send only init_data
      // (ttlSec kept for backward compatibility if your server still reads it)
      const r = await postJSON(`/api/public/app/${encodeURIComponent(publicId)}/sales/token`, {
        init_data: initData,
        ttl_sec: ttlSec // can be ignored by server if D1 is source of truth
      });

      const token = r && r.token ? String(r.token) : '';
      if (!token){
        setStatus('Нет token от сервера');
        return;
      }

      const link = bot
        ? `https://t.me/${bot}?start=sale_${token}`
        : `sale_${token}`;

      lastLink = link;

      const ok = await drawQr(canvas, fallback, link);
      setStatus(ok ? 'QR готов' : 'Показали ссылку текстом');
    } catch (e){
      setStatus('Ошибка: ' + (e && e.message ? e.message : 'ERR'));
    } finally {
      inFlight = false;
    }
  }

  function onClick(e){
    const t = e.target && e.target.closest ? e.target.closest('[data-sq-act]') : null;
    if (!t) return;

    const act = t.getAttribute('data-sq-act');

    if (act === 'refresh'){
      e.preventDefault();
      refresh();
      return;
    }

    if (act === 'copy'){
      e.preventDefault();
      if (!lastLink){
        toast('Сначала обнови QR');
        return;
      }
      try{
        if (navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(lastLink);
          toast('Скопировано');
        } else {
          toast(lastLink);
        }
      }catch(_){
        toast('Не удалось скопировать');
      }
      return;
    }
  }

  root.addEventListener('click', onClick);

  // initial
  refresh();

  // auto refresh only if we have initData (Telegram)
  timer = setInterval(()=>{
    if (getInitData()) refresh();
  }, refreshEvery * 1000);

  return function cleanup(){
    try{ root.removeEventListener('click', onClick); }catch(_){}
    try{ if (timer) clearInterval(timer); }catch(_){}
  };
}
