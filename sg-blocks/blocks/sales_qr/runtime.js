// sales_qr/runtime.js
// Требования твоего loader-а:
// - export function mount(el, props, ctx)
// - mount может вернуть cleanup-функцию
// (см. templates.js: mf.__runtime.mount(...) + cleanup) :contentReference[oaicite:1]{index=1}

function $(root, sel){ return root.querySelector(sel); }

function safeNum(x, def){
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function getPublicId(ctx){
  // 1) если runtime передал ctx.publicId / ctx.appPublicId
  const c = ctx || {};
  const pid = c.publicId || c.appPublicId || c.public_id || '';
  if (pid) return String(pid);

  // 2) fallback: URL вида /m/<publicId> (как у тебя)
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

// --- QR rendering ---
// Быстро и без библиотек: рендерим QR картинкой через quickchart
// Если вдруг заблокировано — показываем ссылку текстом.
async function drawQr(canvas, fallbackEl, text){
  // очистка
  try{
    const ctx2 = canvas.getContext('2d');
    ctx2.clearRect(0,0,canvas.width,canvas.height);
  }catch(_){}

  // пытаемся картинкой
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
      ctx2.drawImage(img, 0,0, canvas.width, canvas.height);
      return true;
    }
  }catch(_){}

  // fallback: текст
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
    headers:{'content-type':'application/json'},
    body: JSON.stringify(data || {})
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) {
    const msg = (j && (j.error || j.message)) ? String(j.error || j.message) : ('HTTP_' + r.status);
    throw new Error(msg);
  }
  return j;
}

function toast(msg){
  try{
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showToast){
      window.Telegram.WebApp.showToast({ text: String(msg||'') });
      return;
    }
  }catch(_){}
  // fallback
  try{ console.log('[sales_qr]', msg); }catch(_){}
}

export function mount(rootEl, props={}, ctx={}){
  const root = $(rootEl, '[data-sq]') || rootEl;

  const titleEl  = $(root, '[data-sq-title]');
  const subEl    = $(root, '[data-sq-sub]');
  const cbEl     = $(root, '[data-sq-cb]');
  const statusEl = $(root, '[data-sq-status]');
  const canvas   = $(root, '[data-sq-canvas]');
  const fallback = $(root, '[data-sq-fallback]');
  const btnRefresh = $(root, '[data-sq-act="refresh"]');
  const btnCopy    = $(root, '[data-sq-act="copy"]');

  // apply props
  const title = (props.title || 'Ваш QR для оплаты').toString();
  const sub   = (props.sub   || 'Покажите кассиру при оплате').toString();

  const cashback = safeNum(props.cashback_percent, 10);
  const ttlSec   = Math.max(60, Math.min(600, safeNum(props.token_ttl_sec, 300)));
  const refreshEvery = Math.max(20, Math.min(600, safeNum(props.refresh_every_sec, 60)));

  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
  if (cbEl) cbEl.textContent = `${cashback}%`;

  // show/hide actions
  const showRefresh = props.show_refresh !== false;
  const showCopy    = props.show_copy !== false;
  if (btnRefresh) btnRefresh.style.display = showRefresh ? '' : 'none';
  if (btnCopy)    btnCopy.style.display    = showCopy ? '' : 'none';

  let lastLink = '';
  let timer = null;
  let inFlight = false;

  function setStatus(s){
    if (statusEl) statusEl.textContent = String(s||'');
  }

  async function refresh(){
    if (inFlight) return;
    inFlight = true;

    try{
      const publicId = getPublicId(ctx);
      if (!publicId){
        setStatus('Не найден publicId приложения');
        inFlight = false;
        return;
      }

      const initData = getInitData();
      if (!initData){
        // В студии initData может отсутствовать — это норм.
        setStatus('Откройте в Telegram для реального QR');
        // Дадим демо ссылку
        lastLink = `sale_demo_${publicId}`;
        await drawQr(canvas, fallback, lastLink);
        inFlight = false;
        return;
      }

      setStatus('Обновляем QR…');

      // ОЖИДАЕМЫЙ эндпоинт (ты добавишь в воркер):
      // POST /api/public/app/:publicId/sales/token
      // body: { init_data, ttl_sec }
      const r = await postJSON(`/api/public/app/${encodeURIComponent(publicId)}/sales/token`, {
        init_data: initData,
        ttl_sec: ttlSec
      });

      const token = r && r.token ? String(r.token) : '';
      if (!token){
        setStatus('Нет token от сервера');
        inFlight = false;
        return;
      }

      // deep-link в бота
      const bot = (props.bot_username || '').toString().replace(/^@/,'').trim();
      const link = bot
        ? `https://t.me/${bot}?start=sale_${token}`
        : `sale_${token}`; // пока без бота (для теста)

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
        navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(lastLink)
          : null;
        toast('Скопировано');
      }catch(_){
        toast('Не удалось скопировать');
      }
      return;
    }
  }

  root.addEventListener('click', onClick);

  // первичная отрисовка
  refresh();

  // авто-обновление (чтобы токен не протух)
  timer = setInterval(()=>{
    // если есть initData (Telegram), то обновляем периодически
    const initData = getInitData();
    if (initData) refresh();
  }, refreshEvery * 1000);

  // cleanup
  return function cleanup(){
    try{ root.removeEventListener('click', onClick); }catch(_){}
    try{ if (timer) clearInterval(timer); }catch(_){}
  };
}
