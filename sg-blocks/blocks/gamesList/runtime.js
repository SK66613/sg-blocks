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
  const titleEl = el.querySelector('[data-bind="title"]');
  setText(titleEl, props.title || 'Игры');

  const list = el.querySelector('[data-role="cards"]');
  const cards = Array.isArray(props.cards) ? props.cards : [];
  const frag = document.createDocumentFragment();

  function makeItem(card, idx){
    const d = document.createElement('div');
    d.className = 'gl-item';
    const ico = document.createElement('div');
    ico.className = 'gl-ico';
    const img = document.createElement('img');
    img.alt = card.title ? String(card.title) : 'icon';
    if(card.icon) img.src = String(card.icon);
    ico.appendChild(img);

    const txt = document.createElement('div');
    txt.className = 'gl-txt';
    const name = document.createElement('div');
    name.className = 'gl-name';
    setText(name, card.title || '');
    const sub = document.createElement('div');
    sub.className = 'gl-sub';
    setText(sub, card.sub || '');
    txt.appendChild(name); txt.appendChild(sub);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gl-btn';
    setText(btn, card.btn || 'Открыть');
    btn.dataset.action = card.action || 'none';
    if(card.link) btn.dataset.link = card.link;
    if(card.sheet_id) btn.dataset.sheet_id = card.sheet_id;
    if(card.sheet_path) btn.dataset.sheet_path = card.sheet_path;

    d.appendChild(ico); d.appendChild(txt); d.appendChild(btn);
    return d;
  }

  list && (list.innerHTML = '');
  cards.forEach((c,i)=>{ frag.appendChild(makeItem(c,i)); });
  list && list.appendChild(frag);

  function onClick(e){
    const btn = e.target.closest('.gl-btn');
    if(!btn) return;
    e.preventDefault();
    const action = btn.dataset.action || 'none';
    const link = btn.dataset.link || '';
    const sheet_id = btn.dataset.sheet_id || '';
    const sheet_path = btn.dataset.sheet_path || '';

    if(action==='link' && link){
      if(link.startsWith('#')) dispatch('sg:navigate', { page: link.replace(/^#/, '') });
      else window.open(link, '_blank');
      return;
    }
    if(action==='sheet'){ dispatch('sg:openSheet', { sheet_id, sheet_path }); return; }
    if(action==='sheet_page'){ dispatch('sg:openSheetPage', { sheet_id, sheet_path }); return; }
  }
  el.addEventListener('click', onClick);

  return ()=>{ el.removeEventListener('click', onClick); };
}

export function unmount(el){ /* handled by cleanup */ }