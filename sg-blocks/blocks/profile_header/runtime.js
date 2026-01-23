export function mount(el, props={}, ctx={}){
  function setText(el, val){
  if(!el) return;
  const v = (val===undefined || val===null) ? '' : String(val);
  el.textContent = v;
  if(!v) el.style.display = 'none';
}
function setHTML(el, val){
  if(!el) return;
  const v = (val===undefined || val===null) ? '' : String(val);
  el.innerHTML = v;
  if(!v) el.style.display = 'none';
}
function setAttr(el, name, val){
  if(!el) return;
  const v = (val===undefined || val===null || val==='') ? '' : String(val);
  if(!v){ el.removeAttribute(name); }
  else { el.setAttribute(name, v); }
}
function dispatch(name, detail){
  try{ window.dispatchEvent(new CustomEvent(name, {detail})); }catch(_){}
}
  const q = (sel)=> el.querySelector(sel);
  const img = q('.pf-ava img');
  const nameEl = q('.pf-name');
  const userEl = q('.pf-username');
  const coinsEl = q('#pf-coins');

  // defaults first
  setText(nameEl, props.title || '');
  setText(userEl, props.text || '');

  const tg = (window.getTgUserSafe && window.getTgUserSafe())
    || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user)
    || null;

  if (tg){
    const full = ((tg.first_name||'') + ' ' + (tg.last_name||'')).trim();
    if (full) setText(nameEl, full);
    const un = tg.username ? ('@' + tg.username) : '';
    if (un) setText(userEl, un);
    if (img && tg.photo_url) img.src = tg.photo_url;
    if (userEl && !userEl.textContent) userEl.style.display = 'none';
  }

  let alive = true;
  (async()=>{
    try{
      if(!window.api) return;
      const r = await window.api('state', {});
      if(!alive) return;
      const st = (r && (r.state || r.data || r)) || {};
      const coins = (st.user && (st.user.coins ?? st.user.balance ?? st.user.total_coins))
        ?? (st.coins ?? st.balance ?? st.total_coins)
        ?? 0;
      if (coinsEl) coinsEl.textContent = String(coins);
    }catch(_){
    }
  })();

  return ()=>{ alive = false; };
}
export function unmount(){}