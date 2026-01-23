
function isHashLink(link){ return typeof link==='string' && link.startsWith('#') && link.length>1; }
function dispatch(name, detail){
  try{ window.dispatchEvent(new CustomEvent(name, {detail})); }catch(_){}
}
function handleAction(action, link, sheet_id, sheet_path){
  const a = String(action||'none');
  if (a==='none') return;
  if (a==='link'){
    if (isHashLink(link)){
      dispatch('sg:navigate', { page: link.slice(1) });
    }else if (link){
      try{ window.open(link, '_blank'); }catch(_){}
    }
    return;
  }
  if (a==='sheet'){
    dispatch('sg:openSheet', { sheet_id, sheet_path });
    return;
  }
  if (a==='sheet_page'){
    dispatch('sg:openSheetPage', { sheet_id, sheet_path });
    return;
  }
}

function esc(s){ return String(s??''); }

function render(root, props){
  const items = root.querySelector('[data-items]');
  if (!items) return;
  const cards = Array.isArray(props.cards)? props.cards : [];
  items.innerHTML = cards.map((c,i)=>{
    const icon = c.icon || '';
    const title = esc(c.title||'');
    const sub = esc(c.sub||'');
    return `
      <button class="startcard" type="button" data-i="${i}">
        <span class="startcard__icon">${icon?`<img src="${icon}" alt="">`:''}</span>
        <span class="startcard__body">
          <span class="startcard__t">${title}</span>
          <span class="startcard__s">${sub}</span>
        </span>
        <span class="startcard__chev">›</span>
      </button>
    `;
  }).join('');
}

export function mount(root, props, ctx){
  render(root, props||{});
  const onClick = (e)=>{
    const btn = e.target.closest('.startcard');
    if (!btn) return;
    const i = Number(btn.getAttribute('data-i')||0);
    const c = (props.cards && props.cards[i]) || {};
    handleAction(c.action, c.link, c.sheet_id, c.sheet_path);
  };
  root.addEventListener('click', onClick);
  return ()=> root.removeEventListener('click', onClick);
}
export function unmount(root, ctx){}
