function buildActionAttrs(s){
  const action = (s && s.action) ? String(s.action) : 'none';
  const link = (s && s.link) ? String(s.link) : '';
  const sheet_id = (s && s.sheet_id) ? String(s.sheet_id) : '';
  const sheet_path = (s && s.sheet_path) ? String(s.sheet_path) : '';

  if (action === 'sheet' && sheet_id) return { 'data-open-sheet': sheet_id };
  if (action === 'sheet_page' && sheet_path) return { 'data-open-sheet-page': sheet_path };
  if (action === 'link' && link) return { 'data-link': link };
  return {};
}

function attrsToString(obj){
  return Object.entries(obj).map(([k,v])=>` ${k}="${String(v).replace(/"/g,'&quot;')}"`).join('');
}

export async function mount(root, props){
  const slidesWrap = root.querySelector('[data-promo-slides]');
  const dotsWrap   = root.querySelector('[data-promo-dots]');

  const interval = Number(props?.interval) || 4000;
  const slides = Array.isArray(props?.slides) && props.slides.length
    ? props.slides
    : [
        { img:'', action:'link', link:'#play', sheet_id:'', sheet_path:'' },
        { img:'', action:'link', link:'#bonuses', sheet_id:'', sheet_path:'' },
        { img:'', action:'link', link:'#tournament', sheet_id:'', sheet_path:'' }
      ];

  slidesWrap.innerHTML = slides.map((s,i)=>{
    const img = (s && s.img) ? String(s.img) : '';
    const attrs = attrsToString(buildActionAttrs(s));
    return `
      <div class="promo-slide${i===0?' is-active':''}">
        <button class="promo-slide__btn" type="button"${attrs}>
          ${img
            ? `<img class="promo-img" src="${img}" alt="">`
            : `<div class="promo-img promo-img--placeholder"></div>`
          }
        </button>
      </div>
    `;
  }).join('');

  dotsWrap.innerHTML = slides.map((_,i)=>`<span class="promo-dot${i===0?' is-active':''}" data-dot="${i}"></span>`).join('');

  const slideEls = Array.from(root.querySelectorAll('.promo-slide'));
  const dotEls   = Array.from(root.querySelectorAll('.promo-dot'));
  if (slideEls.length <= 1) return;

  let idx = 0;
  const go = (next)=>{
    slideEls[idx]?.classList.remove('is-active');
    dotEls[idx]?.classList.remove('is-active');
    idx = next;
    slideEls[idx]?.classList.add('is-active');
    dotEls[idx]?.classList.add('is-active');
  };

  const onDotClick = (e)=>{
    const d = e.target.closest('.promo-dot');
    if (!d) return;
    const i = Number(d.getAttribute('data-dot'));
    if (Number.isFinite(i) && i >= 0 && i < slideEls.length) go(i);
  };
  dotsWrap.addEventListener('click', onDotClick);

  let timer = setInterval(()=>go((idx+1)%slideEls.length), interval);

  return ()=>{
    dotsWrap.removeEventListener('click', onDotClick);
    if (timer) clearInterval(timer);
    timer = null;
  };
}
