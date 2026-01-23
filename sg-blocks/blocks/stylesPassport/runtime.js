// Auto-migrated from build-apps templates.js (pack3)
const BLOCK = {
    type:'stylesPassport',
    title:'Паспорт стилей',
    defaults:{
      title:'Паспорт стилей',
      subtitle:'Собери 6 штампов — приз.',
      cover_url:'',
      grid_cols: 3,
      require_pin: true,
      styles:[
        {code:'lager', name:'Lager'},
        {code:'ipa', name:'IPA'},
        {code:'stout', name:'Stout'},
        {code:'weizen', name:'Weizen'},
        {code:'sour', name:'Sour'},
        {code:'cider', name:'Cider'}
      ]
    },
    preview:(p)=>{
      const cols = Number(p.grid_cols||3);
      const styles = Array.isArray(p.styles)?p.styles:[];
      const safe = (s)=>String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const cover = p.cover_url ? `<img src="${p.cover_url}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div style="width:100%;height:100%;display:grid;place-items:center;opacity:.6">IMG</div>`;
      return `
<style>${STYLES_PASSPORT_CSS}</style>
<div class="card passport stylesPassport" data-styles-passport>
  <div class="passport__media">${cover}</div>
  <div class="passport__content">
    <div class="passport__title">${safe(p.title||'')}</div>
    <div class="passport__sub">${safe(p.subtitle||'')}</div>
    <div class="passport-grid" style="grid-template-columns: repeat(${isFinite(cols)&&cols>0?cols:3}, minmax(0,1fr));">
      ${styles.map(st=>`
        <div class="pslot" data-style-code="${safe(st.code||'')}">
          <div class="pslot__title">${safe(st.name||st.code||'')}</div>
          <div class="pslot__badge">Получить</div>
        </div>
      `).join('')}
    </div>
  </div>
</div>`;
    },
    init:(el, props, ctx)=>{
      const root = el.querySelector('[data-styles-passport]') || el;
      const grid = root.querySelector('.passport-grid');
      if(!grid) return;

      // demo state/api if missing
      if(!window.MiniState) window.MiniState = {};
      if(!window.MiniState.passport) window.MiniState.passport = {stamps:[]};

      if(typeof window.applyServerState!=='function'){
        window.applyServerState = function(fresh){
          if(!fresh) return;
          window.MiniState = window.MiniState || {};
          for(const k in fresh) window.MiniState[k] = fresh[k];
        };
      }

      if(typeof window.api!=='function'){
        window.api = async function(method, payload){
          await new Promise(r=>setTimeout(r, 250));
          const st = window.MiniState||{};
          if(method==='style.collect'){
            const pin = String(payload?.pin||'');
            const style_id = String(payload?.style_id||'').trim();
            if(!style_id) return {ok:false, error:'NO_STYLE'};
            if(pin && pin!=='1111') return {ok:false, error:'BAD_PIN'};
            st.passport = st.passport || {stamps:[]};
            const arr = Array.isArray(st.passport.stamps)?st.passport.stamps.slice():[];
            const low = style_id.toLowerCase();
            if(!arr.some(x=>String(x).toLowerCase()===low)) arr.push(style_id);
            st.passport.stamps = arr;
            return {ok:true, fresh_state:{ passport: st.passport }};
          }
          return {ok:false, error:'NO_METHOD'};
        };
      }

      const toast = (msg, ok)=>{
        try{
          if(window.showToast) return window.showToast(msg, ok);
          if(!ok) console.warn(msg); else console.log(msg);
        }catch(_){}
      };

      function readLocalStamps(){
        try{
          const v1 = JSON.parse(localStorage.getItem('beer_passport_v1')||'{}')||{};
          const arr = Array.isArray(v1.stamps)?v1.stamps:[];
          return arr.map(x=>String(x));
        }catch(_){ return []; }
      }

      function updateLocalCaches(code){
        try{
          const c = String(code||'').trim(); if(!c) return;
          // map
          let map={}; try{ map=JSON.parse(localStorage.getItem('beer_passport')||'{}')||{}; }catch(_){}
          map[c]=true;
          localStorage.setItem('beer_passport', JSON.stringify(map));
          // v1
          let v1={}; try{ v1=JSON.parse(localStorage.getItem('beer_passport_v1')||'{}')||{}; }catch(_){}
          const arr = Array.isArray(v1.stamps)?v1.stamps.slice():[];
          const low = c.toLowerCase();
          if(!arr.some(x=>String(x).toLowerCase()===low)) arr.push(c);
          localStorage.setItem('beer_passport_v1', JSON.stringify({stamps:arr}));
        }catch(_){}
      }

      function getDoneSet(){
        const st = window.MiniState||{};
        const s1 = (st.passport && Array.isArray(st.passport.stamps)) ? st.passport.stamps : [];
        const s2 = readLocalStamps();
        const set = new Set([...s1,...s2].map(x=>String(x).toLowerCase()));
        return set;
      }

      function paint(){
        const done = getDoneSet();
        grid.querySelectorAll('.pslot[data-style-code]').forEach(card=>{
          const code = String(card.getAttribute('data-style-code')||'').toLowerCase();
          const isDone = done.has(code);
          card.classList.toggle('is-done', isDone);
          const badge = card.querySelector('.pslot__badge');
          if(badge) badge.textContent = isDone ? 'Получен' : 'Получить';
        });
      }

      // click handler (scoped)
      let inFlight = false;
      root.addEventListener('click', async (e)=>{
        const card = e.target.closest('.pslot[data-style-code]');
        if(!card || !root.contains(card)) return;
        if(inFlight) return;
        const style_id = String(card.getAttribute('data-style-code')||'').trim();
        if(!style_id) return;

        paint();
        if(card.classList.contains('is-done')){
          toast('Этот стиль уже получен.', true);
          return;
        }

        let pin = '';
        if(props && props.require_pin){
          pin = prompt('Введите PIN для получения штампа', '') || '';
          if(!pin){ toast('Отменено', false); return; }
        }

        try{
          inFlight = true;
          const r = await window.api('style.collect', {style_id, pin});
          if(!r || r.ok===false){
            const err = (r && r.error) ? String(r.error) : 'ERR';
            toast(err==='BAD_PIN'?'Неверный PIN':'Ошибка получения', false);
            return;
          }
          if(r.fresh_state) window.applyServerState(r.fresh_state);
          updateLocalCaches(style_id);
          paint();
          toast('Штамп получен!', true);
        }catch(ex){
          toast('Ошибка сети', false);
        }finally{
          inFlight = false;
        }
      });

      // initial
      paint();
    }
  };

export async function mount(el, props={}, ctx={}){
  try{
    if (!el) return null;

    // Ensure markup exists before init()
    if (typeof BLOCK.preview === 'function') {
      el.innerHTML = BLOCK.preview(props||{});
    }

    if (typeof BLOCK.init === 'function') {
      // init may return cleanup fn
      return await BLOCK.init(el, props, ctx);
    }

    return null;
  }catch(e){
    console.error('[stylesPassport] mount error', e);
    return null;
  }
}

export function unmount(el){
  try{ if (el) el.innerHTML=''; }catch(_e){}
}
