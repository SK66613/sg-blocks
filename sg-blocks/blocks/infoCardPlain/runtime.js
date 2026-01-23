function applyActionAttrs(btn, props){
  if (!btn) return;
  // clear
  btn.removeAttribute('data-link');
  btn.removeAttribute('data-open-sheet');
  btn.removeAttribute('data-open-sheet-page');

  const action = (props && props.action) ? String(props.action) : 'none';
  if (action === 'sheet' && props.sheet_id){
    btn.setAttribute('data-open-sheet', String(props.sheet_id));
  } else if (action === 'sheet_page' && props.sheet_path){
    btn.setAttribute('data-open-sheet-page', String(props.sheet_path));
  } else if (action === 'link' && props.link){
    btn.setAttribute('data-link', String(props.link));
  }
}

export async function mount(root, props){
  const titleEl = root.querySelector('[data-title]');
  const subEl   = root.querySelector('[data-sub]');
  const imgEl   = root.querySelector('[data-icon]');
  const btn     = root.querySelector('[data-action-btn]');

  const title = (props?.title ?? '').toString();
  const sub   = (props?.sub ?? '').toString();
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;

  const icon = (props?.icon ?? '').toString().trim();
  if (imgEl){
    if (icon){ imgEl.src = icon; imgEl.style.display=''; }
    else { imgEl.removeAttribute('src'); imgEl.style.display='none'; }
  }

  const side = (props?.imgSide === 'right') ? 'right' : 'left';
  root.classList.toggle('info-card--plain-right', side === 'right');

  applyActionAttrs(btn, props || {});
}
