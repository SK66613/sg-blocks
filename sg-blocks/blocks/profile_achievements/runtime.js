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
  setText(el.querySelector('[data-bind="title"]'), props.title || '');
  setText(el.querySelector('[data-bind="best_label"]'), props.best_label || '');
  setText(el.querySelector('[data-bind="pass_label"]'), props.pass_label || '');
  setText(el.querySelector('[data-bind="last_label"]'), props.last_label || '');
  setText(el.querySelector('[data-bind="refs_label"]'), props.refs_label || '');

  const bestEl = el.querySelector('#pf-best-score');
  const passEl = el.querySelector('#pf-pass-count');
  const lastEl = el.querySelector('#pf-last-stamp');
  const refEl  = el.querySelector('#pf-referrals-count');

  let alive = true;
  (async()=>{
    try{
      if(!window.api) return;
      const r = await window.api('state', {});
      if(!alive) return;
      const st = (r && (r.state || r.data || r)) || {};
      const best = st.game_alltime_best ?? st.game_best ?? st.game_today_best ?? 0;
      const sc = st.styles_count ?? (st.styles_user ? st.styles_user.length : 0) ?? 0;
      const total = st.styles_total ?? (st.styles ? st.styles.length : 0) ?? 0;
      const last = st.last_stamp_name ?? st.last_stamp ?? '—';
      const refs = st.ref_total ?? st.referrals_total ?? 0;

      if(bestEl) bestEl.textContent = String(best);
      if(passEl) passEl.textContent = String(sc) + '/' + String(total);
      if(lastEl) lastEl.textContent = String(last || '—');
      if(refEl)  refEl.textContent = String(refs);
    }catch(_){
    }
  })();
  return ()=>{ alive=false; };
}
export function unmount(){}