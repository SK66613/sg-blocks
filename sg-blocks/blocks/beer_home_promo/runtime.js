// ESM runtime for beer_home_promo

function wireActions(root){
  const onClick = (e)=>{
    const t = e.target.closest('[data-open-sheet],[data-open-sheet-page],[data-link],[data-page]');
    if (!t) return;
    e.preventDefault();
    const sheet = t.getAttribute('data-open-sheet');
    const sheetPage = t.getAttribute('data-open-sheet-page');
    const link = t.getAttribute('data-link');
    const page = t.getAttribute('data-page');

    if (sheet){
      window.dispatchEvent(new CustomEvent('sg:openSheet', { detail:{ sheet_id: sheet } }));
      return;
    }
    if (sheetPage){
      window.dispatchEvent(new CustomEvent('sg:openSheetPage', { detail:{ sheet_path: sheetPage } }));
      return;
    }
    if (page){
      window.dispatchEvent(new CustomEvent('sg:navigate', { detail:{ page: page.replace(/^#/, '') } }));
      return;
    }
    if (link){
      window.open(link, '_blank', 'noopener');
    }
  };
  root.addEventListener('click', onClick);
  return ()=>root.removeEventListener('click', onClick);
}

export function mount(root, props={}, ctx={}){
  const btn = root.querySelector('.promo__btn');
  if (btn){
    const action = props.action || 'none';
    if (action === 'sheet' && props.sheet_id) btn.setAttribute('data-open-sheet', String(props.sheet_id));
    if (action === 'sheet_page' && props.sheet_path) btn.setAttribute('data-open-sheet-page', String(props.sheet_path));
  }
  return wireActions(root);
}
