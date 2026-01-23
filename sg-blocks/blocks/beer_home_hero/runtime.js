// ESM runtime for beer_home_hero

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
  return ()=>{};
}
