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

  const tEl = el.querySelector('#pf-rank-today');
  const aEl = el.querySelector('#pf-rank-alltime');

  let alive=true;
  (async()=>{
    try{
      if(!window.api) return;
      const r = await window.api('state', {});
      if(!alive) return;
      const st = (r && (r.state || r.data || r)) || {};
      // если бэк вернёт ранги — подхватим
      const rt = st.rank_today ?? st.tournament_rank_today ?? '—';
      const ra = st.rank_alltime ?? st.tournament_rank_alltime ?? '—';
      if(tEl) tEl.textContent = String(rt);
      if(aEl) aEl.textContent = String(ra);
    }catch(_){
    }
  })();
  return ()=>{ alive=false; };
}
export function unmount(){}