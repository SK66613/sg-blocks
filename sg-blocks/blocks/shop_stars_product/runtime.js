// shop_stars_product/runtime.js
// export function mount(rootEl, props, ctx) -> cleanup()

function $(root, sel){ return root.querySelector(sel); }
function setText(el, v){ if (el) el.textContent = (v==null?'':String(v)); }
function setHidden(el, hid){ if (el) el.hidden = !!hid; }

function getPublicId(ctx){
  const c = ctx || {};
  const pid = c.publicId || c.appPublicId || c.public_id || c.app_public_id || '';
  if (pid) return String(pid);

  // ✅ как в sales_qr: достаём из /m/<publicId>
  try{
    const parts = String(location.pathname||'').split('/').filter(Boolean);
    const i = parts.indexOf('m');
    if (i >= 0 && parts[i+1]) return parts[i+1];
  }catch(_){}

  // резерв (если вдруг где-то прокинул)
  const w = globalThis || window;
  return String(w.__APP_PUBLIC_ID__ || w.APP_PUBLIC_ID || '').trim();
}


function getTgUser(ctx){
  const c = ctx || {};
  if (c.tg && c.tg.id) return { id: c.tg.id, username: c.tg.username || '' };
  if (c.tg_user && c.tg_user.id) return { id: c.tg_user.id, username: c.tg_user.username || '' };
  const tg = (globalThis.Telegram && globalThis.Telegram.WebApp) ? globalThis.Telegram.WebApp : null;
  const u = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
  if (u && u.id) return { id: u.id, username: u.username || '' };
  return null;
}

async function postJSON(url, body){
  const r = await fetch(url, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok || !j || !j.ok){
    const msg = (j && (j.error || j.message)) ? String(j.error || j.message) : ('HTTP_' + r.status);
    throw new Error(msg);
  }
  return j;
}

export function mount(rootEl, props={}, ctx={}){
  const root = $(rootEl, '[data-ss]') || rootEl;

  const imgEl   = $(root, '[data-ss-img]');
  const titleEl = $(root, '[data-ss-title]');
  const descEl  = $(root, '[data-ss-desc]');
  const starsEl = $(root, '[data-ss-stars]');
  const buyBtn  = $(root, '[data-ss-buy]');
  const hintEl  = $(root, '[data-ss-hint]');

  const p = props || {};
  const title = p.title || 'Товар';
  const description = p.description || '';
  const productId = p.product_id || 'product';
  const photoUrl = p.photo_url || '';
  const stars = Math.max(1, Math.floor(Number(p.stars || 1)));
  const qty = Math.max(1, Math.floor(Number(p.qty || 1)));
  const btnText = p.btn_text || 'Купить за ⭐';

  const txtOK = p.success_text || '✅ Оплачено!';
  const txtCancel = p.cancel_text || 'Отменено';
  const txtFail = p.fail_text || 'Ошибка оплаты';

  setText(titleEl, title);
  setText(descEl, description);
  setText(starsEl, String(stars * qty));
  setText(buyBtn, btnText);

  if (imgEl){
    if (photoUrl) imgEl.style.backgroundImage = `url('${photoUrl}')`;
    else imgEl.style.backgroundImage = '';
  }

  function setHint(t){
    if (!hintEl) return;
    setText(hintEl, t || '');
    setHidden(hintEl, !t);
  }

  let destroyed = false;

  async function onBuy(e){
    e.preventDefault();
    e.stopPropagation();
    setHint('');

    const publicId = getPublicId(ctx);
    if (!publicId) { setHint('NO_APP_PUBLIC_ID'); return; }

    const tgUser = getTgUser(ctx);
    if (!tgUser || !tgUser.id) { setHint('NO_TG_USER'); return; }

    const tg = (globalThis.Telegram && globalThis.Telegram.WebApp) ? globalThis.Telegram.WebApp : null;
    if (!tg || typeof tg.openInvoice !== 'function') { setHint('NO_TG_OPEN_INVOICE'); return; }

    try{
      buyBtn && (buyBtn.disabled = true);

      const j = await postJSON(`/api/public/app/${encodeURIComponent(publicId)}/stars/create`, {
        tg_user: tgUser,
        title: title,
        description: description || 'Оплата звёздами в Telegram',
        photo_url: photoUrl,
        items: [{ product_id: productId, title, stars, qty }]
      });

      const link = j.invoice_link;
      if (!link) throw new Error('NO_INVOICE_LINK');

      tg.openInvoice(link, (status)=>{
        if (destroyed) return;
        if (status === 'paid') setHint(txtOK);
        else if (status === 'cancelled') setHint(txtCancel);
        else if (status === 'failed') setHint(txtFail);
        else setHint('Ожидание…');
      });

    }catch(err){
      if (destroyed) return;
      console.error('[shop_stars_product] buy error', err);
      setHint('Ошибка: ' + (err && err.message ? err.message : String(err)));
    }finally{
      buyBtn && (buyBtn.disabled = false);
    }
  }

  buyBtn && buyBtn.addEventListener('click', onBuy);

  return function cleanup(){
    destroyed = true;
    buyBtn && buyBtn.removeEventListener('click', onBuy);
  };
}
