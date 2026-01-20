// sales_qr/runtime.js
// export function mount(rootEl, props, ctx) -> cleanup()

function $(root, sel){ return root.querySelector(sel); }
function safeNum(x, def){ const n = Number(x); return Number.isFinite(n) ? n : def; }

function getPublicId(ctx){
  const c = ctx || {};
  const pid = c.publicId || c.appPublicId || c.public_id || c.app_public_id || '';
  if (pid) return String(pid);
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

async function drawQr(canvas, fallbackEl, text){
  // Делаем QR максимально резким: фиксируем CSS size и рисуем с DPR
  const cssSize = 260; // можно 240-320, но 260 обычно отлично сканируется
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

  canvas.style.width = cssSize + 'px';
  canvas.style.height = cssSize + 'px';
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);

  try{
    const ctx2 = canvas.getContext('2d');
    ctx2.setTransform(1,0,0,1,0,0);
    ctx2.clearRect(0,0,canvas.width,canvas.height);
  }catch(_){}

  // QuickChart QR: добавляем margin + высокий EC level
  // ВАЖНО: size даём в CSS-пикселях, а рисуем через DPR в canvas
  const imgUrl =
    `https://quickchart.io/qr?` +
    `size=${encodeURIComponent(String(cssSize))}` +
    `&margin=1&ecLevel=H` +
    `&text=${encodeURIComponent(text)}`;

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
      // Рисуем чётко в canvas с DPR
      ctx2.imageSmoothingEnabled = false;
      ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
      return true;
    }
  }catch(_){}

  // fallback: просто текст, чтобы хоть что-то работало
  try{
    canvas.style.display = 'none';
    fallbackEl.style.display = 'block';
    fallbackEl.textContent = text;
  }catch(_){}
  return false;
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

export function mount(rootEl, props={}, ctx={}){
  const root = $(rootEl, '[data-sq]') || rootEl;

  const titleEl  = $(root, '[data-sq-title]');
  const subEl    = $(root, '[data-sq-sub]');
  const descEl   = $(root, '[data-sq-desc]');
  const cbEl     = $(root, '[data-sq-cb]');
  const statusEl = $(root, '[data-sq-status]');
  const debugEl  = $(root, '[data-sq-debug]');     // добавь в view.html (ниже скажу)
  const canvas   = $(root, '[data-sq-canvas]');
  const fallback = $(root, '[data-sq-fallback]');

  const btnRefresh = $(root, '[data-sq-act="refresh"]');
  const btnCopy    = $(root, '[data-sq-act="copy"]');

  // --- props ---
  const title = String(props.title ?? '').trim();
  const subtitle = String(props.subtitle ?? '').trim();
  const description = String(props.description ?? '').trim();

  const cashback = Math.max(0, Math.min(100, safeNum(props.cashback_percent, 10)));
  const ttlSec   = Math.max(60, Math.min(600, safeNum(props.ttl_sec, 300)));
  const refreshEvery = Math.max(10, Math.min(600, safeNum(props.refresh_sec, 60)));

  const showRefresh = props.show_refresh !== false;
  const showCopy    = props.show_copy !== false;
  const btnRefreshText = String(props.btn_refresh ?? 'Обновить');
  const btnCopyText    = String(props.btn_copy ?? 'Скопировать');

  function setTextOrHide(el, txt){
    if (!el) return;
    if (txt) { el.textContent = txt; el.style.display = ''; }
    else { el.style.display = 'none'; }
  }

  setTextOrHide(titleEl, title);
  setTextOrHide(subEl, subtitle);
  setTextOrHide(descEl, description);

  if (cbEl) cbEl.textContent = `${cashback}%`;

  if (btnRefresh){
    btnRefresh.style.display = showRefresh ? '' : 'none';
    btnRefresh.textContent = btnRefreshText;
  }
  if (btnCopy){
    btnCopy.style.display = showCopy ? '' : 'none';
    btnCopy.textContent = btnCopyText;
  }

  let lastLink = '';
  let timer = null;
  let inFlight = false;

  function setStatus(s){
    if (statusEl) statusEl.textContent = String(s||'');
  }
  function setDebug(s){
    if (debugEl) debugEl.textContent = String(s||'');
  }

  async function refresh(){
    if (inFlight) return;
    inFlight = true;

    try{
      const publicId = getPublicId(ctx);
      if (!publicId){
        setStatus('Не найден publicId приложения');
        setDebug('');
        return;
      }

      const initData = getInitData();
      if (!initData){
        setStatus('Откройте в Telegram для реального QR');
        lastLink = `sale_demo_${publicId}`;
        setDebug(lastLink);
        await drawQr(canvas, fallback, lastLink);
        return;
      }

      setStatus('Обновляем QR…');

      const r = await postJSON(`/api/public/app/${encodeURIComponent(publicId)}/sales/token`, {
        init_data: initData,
        ttl_sec: ttlSec
      });

      // ВАЖНО: берём deep_link как приоритет (это URL на t.me)
      const deep = r && (r.deep_link || r.deepLink || r.link) ? String(r.deep_link || r.deepLink || r.link) : '';
      const token = r && r.token ? String(r.token) : '';

      if (!deep && !token){
        setStatus('Нет token/deep_link от сервера');
        setDebug(JSON.stringify(r||{}));
        return;
      }

      lastLink = deep || token;
      setDebug(lastLink);

      const ok = await drawQr(canvas, fallback, lastLink);
      setStatus(ok ? 'QR готов' : 'Показали ссылку текстом');
    }catch(e){
      setStatus('Ошибка: ' + (e && e.message ? e.message : 'ERR'));
      setDebug('');
    }finally{
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
      if (!lastLink) return;
      try{
        navigator.clipboard.writeText(lastLink);
        setStatus('Скопировано ✅');
      }catch(_){
        setStatus('Не смог скопировать');
      }
    }
  }

  root.addEventListener('click', onClick);

  refresh();
  timer = setInterval(refresh, refreshEvery * 1000);

  return ()=>{
    try{ root.removeEventListener('click', onClick); }catch(_){}
    try{ if (timer) clearInterval(timer); }catch(_){}
  };
}
