
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

function render(root, props, state){
  const slides = Array.isArray(props.slides) ? props.slides : [];
  const viewport = root.querySelector('[data-viewport]');
  const dots = root.querySelector('[data-dots]');
  const btnP = root.querySelector('[data-primary]');
  const btnG = root.querySelector('[data-ghost]');
  if (!viewport || !dots || !btnP || !btnG) return;

  const i = Math.max(0, Math.min(state.i, slides.length-1));
  state.i = i;
  const s = slides[i] || {};

  viewport.innerHTML = `
    <div class="intro-slide">
      <div class="intro-slide__title">${s.title||''}</div>
      <div class="intro-slide__text">${s.text||''}</div>
    </div>
  `;

  dots.innerHTML = slides.map((_,idx)=>`<button type="button" class="dot ${idx===i?'is-on':''}" data-dot="${idx}" aria-label="slide ${idx+1}"></button>`).join('');

  btnP.textContent = s.primary || 'Продолжить';
  const ghost = s.ghost || '';
  if (ghost){
    btnG.style.display = '';
    btnG.textContent = ghost;
  }else{
    btnG.style.display = 'none';
    btnG.textContent = '';
  }
}

export function mount(root, props, ctx){
  const state={i:0};
  render(root, props||{}, state);

  const onClick=(e)=>{
    const dot = e.target.closest('[data-dot]');
    if (dot){
      state.i = Number(dot.getAttribute('data-dot')||0);
      render(root, props||{}, state);
      return;
    }
    if (e.target.closest('[data-primary]')){
      const last = (props.slides?.length||0)-1;
      if (state.i < last) state.i++;
      render(root, props||{}, state);
      if (state.i === last){
        dispatch('sg:introDone', {});
      }
      return;
    }
    if (e.target.closest('[data-ghost]')){
      dispatch('sg:introGhost', {});
      return;
    }
  };
  root.addEventListener('click', onClick);
  return ()=> root.removeEventListener('click', onClick);
}
export function unmount(root, ctx){}
