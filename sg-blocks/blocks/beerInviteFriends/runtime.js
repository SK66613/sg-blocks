
function showHint(root, text){
  const h = root.querySelector('[data-hint]');
  if (!h) return;
  h.textContent = text;
  h.style.display = '';
  clearTimeout(h._t);
  h._t = setTimeout(()=>{ h.style.display='none'; }, 2000);
}

async function copyText(text){
  try{
    if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch(_){}
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(_){}
  return false;
}

export function mount(root, props, ctx){
  const link = String((props&&props.link)||'');
  const onClick = async (e)=>{
    if (e.target.closest('[data-copy]')){
      const ok = await copyText(link);
      showHint(root, ok ? 'Ссылка скопирована' : 'Не удалось скопировать');
      return;
    }
    if (e.target.closest('[data-share]')){
      try{
        if (navigator.share){
          await navigator.share({ text: link, url: link });
          showHint(root, 'Открыто меню «Поделиться»');
        }else{
          const ok = await copyText(link);
          showHint(root, ok ? 'Ссылка скопирована' : link);
        }
      }catch(_){
        const ok = await copyText(link);
        showHint(root, ok ? 'Ссылка скопирована' : link);
      }
      return;
    }
  };
  root.addEventListener('click', onClick);
  return ()=> root.removeEventListener('click', onClick);
}
export function unmount(root, ctx){}
