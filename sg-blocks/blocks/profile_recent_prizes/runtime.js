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

  const chips = el.querySelector('[data-role="chips"]');
  function render(list){
    if(!chips) return;
    chips.innerHTML = '';
    if(!Array.isArray(list) || !list.length){
      const m = document.createElement('div');
      m.className = 'chip chip--muted';
      m.innerHTML = '<span>Новые призы будут здесь</span>';
      chips.appendChild(m);
      return;
    }
    list.slice(0,8).forEach((p)=>{
      const c = document.createElement('div');
      c.className = 'chip';
      const title = (p && (p.title || p.name || p.prize_title)) ? (p.title || p.name || p.prize_title) : String(p);
      c.innerHTML = '<span>' + String(title) + '</span>';
      chips.appendChild(c);
    });
  }

  let alive=true;
  (async()=>{
    try{
      if(!window.api) return render([]);
      const r = await window.api('state', {});
      if(!alive) return;
      const st = (r && (r.state || r.data || r)) || {};
      const lp = st.last_prizes ?? st.prizes ?? [];
      render(lp);
    }catch(_){
      render([]);
    }
  })();
  return ()=>{ alive=false; };
}
export function unmount(){}