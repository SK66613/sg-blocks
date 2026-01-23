function applyActionAttrs(btn, props){
  if (!btn) return;
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
  const iconWrap= imgEl ? imgEl.closest('.info-card__icon') : null;
  const btn     = root.querySelector('[data-action-btn]');

  if (titleEl) titleEl.textContent = (props?.title ?? '').toString();
  if (subEl) subEl.textContent = (props?.sub ?? '').toString();

  const icon = (props?.icon ?? '').toString().trim();
  if (imgEl){
    if (icon){ imgEl.src = icon; imgEl.style.display=''; if (iconWrap) iconWrap.style.display=''; }
    else { imgEl.removeAttribute('src'); imgEl.style.display='none'; if (iconWrap) iconWrap.style.display='none'; }
  }

  if (btn) btn.textContent = (props?.btn ?? '').toString() || 'О нас';
  applyActionAttrs(btn, props || {});
}
