(function(){
  async function postJSON(url, data){
    const r = await fetch(url, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify(data||{})
    });
    const j = await r.json().catch(()=>null);
    if (!r.ok) throw new Error((j && (j.error||j.message)) || ('HTTP_'+r.status));
    return j;
  }

  function getPublicIdFromLocation(){
    // твой runtime обычно /m/<publicId> ...
    const p = location.pathname.split('/').filter(Boolean);
    const i = p.indexOf('m');
    if (i >= 0 && p[i+1]) return p[i+1];
    const i2 = p.indexOf('app');
    if (i2 >= 0 && p[i2+1]) return p[i2+1];
    return '';
  }

  function buildQrLink(botUsername, token){
    // deep-link in bot
    // token already without spaces
    return `https://t.me/${botUsername}?start=sale_${token}`;
  }

  async function initOne(root){
    try{
      const props = JSON.parse(root.getAttribute('data-props') || '{}');

      const title = props.title || 'Мой QR';
      const subtitle = props.subtitle || '';
      const ttlSec = Number(props.ttl_sec || 300);
      const refreshSec = Math.max(10, Number(props.refresh_sec || 60));

      const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
      const initData = tg ? (tg.initData || '') : '';

      const publicId = props.app_public_id || getPublicIdFromLocation();
      if (!publicId) throw new Error('NO_PUBLIC_ID');

      // IMPORTANT: bot username нужен, чтобы собрать ссылку t.me/<bot>
      // Берём из state (самый простой путь)
      // Если у тебя state уже грузится глобально — можно заменить на window.__STATE__.bot_username
      let botUsername = props.bot_username || '';

      // запрос токена
      const tokRes = await postJSON(`/api/public/app/${encodeURIComponent(publicId)}/sales/token`, {
        init_data: initData,
        ttl_sec: ttlSec
      });

      const token = tokRes.token;

      // Если botUsername неизвестен — покажем QR хотя бы с token (как fallback)
      // Но лучше передавать bot_username в props из state.
      const deep = botUsername ? buildQrLink(botUsername, token) : `sale_${token}`;

      // QR картинкой через QuickChart (быстро и без либ)
      const qrUrl = `https://quickchart.io/qr?size=240&text=${encodeURIComponent(deep)}`;

      root.querySelector('.salesqr-title').textContent = title;
      root.querySelector('.salesqr-sub').textContent = subtitle;

      const img = root.querySelector('.salesqr-qr img');
      img.src = qrUrl;

      root.querySelector('[data-salesqr-token]').textContent = deep;

      // refresh
      let left = refreshSec;
      const leftEl = root.querySelector('[data-salesqr-left]');
      const tick = async ()=>{
        left -= 1;
        if (leftEl) leftEl.textContent = String(left);
        if (left <= 0){
          left = refreshSec;
          // перезапуск
          initOne(root);
        } else {
          root._salesqr_t = setTimeout(tick, 1000);
        }
      };
      root._salesqr_t = setTimeout(tick, 1000);

      // manual refresh
      const btn = root.querySelector('[data-salesqr-refresh]');
      if (btn){
        btn.onclick = (e)=>{
          e.preventDefault();
          try{ clearTimeout(root._salesqr_t); }catch(_){}
          initOne(root);
        };
      }
    }catch(e){
      console.error('[sales_qr] init error', e);
      root.querySelector('.salesqr-hint').textContent = 'Ошибка QR: ' + (e && e.message ? e.message : 'unknown');
    }
  }

  function mount(){
    document.querySelectorAll('.blk-salesqr[data-props]').forEach(el=>{
      // очистим старый таймер
      try{ clearTimeout(el._salesqr_t); }catch(_){}
      initOne(el);
    });
  }

  // авто
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // export (если нужно дергать из вашего рантайма)
  window.SG_sales_qr_mount = mount;
})();
