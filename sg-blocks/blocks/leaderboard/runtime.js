// Auto-migrated from build-apps templates.js (pack3)
const BLOCK = {
  type:'htmlEmbed',
  title:'Турнир',
  defaults:{
    title:'Bumblebee',
    text:'Турнирная таблица'
  },

  preview:(p={})=>`
    <section class="blk blk-beer">
      <div class="lb-card" data-page="leaderboard">
        <div class="lb-head">
          <div>
            <div class="lb-title">${p.title || 'Bumblebee'}</div>
            <div class="lb-sub">${p.text || 'Турнирная таблица'}</div>
          </div>
          <div class="lb-seg">
            <button type="button" data-lb-tab="today" aria-pressed="true">День</button>
            <button type="button" data-lb-tab="all" aria-pressed="false">Все</button>
          </div>
        </div>

        <div class="lb-you">
          <div class="lb-you__avatar js-lb-me-avatar">U</div>
          <div>
            <div class="lb-you__name js-lb-me-name">—</div>
            <div class="lb-you__sub" data-bind="lb-me-label">—</div>
          </div>
          <div class="lb-you__score js-lb-me-best">0</div>
        </div>

        <div class="lb-lists">
          <div class="lb-list" data-lb-list="today" style="display:block;"></div>
          <div class="lb-list" data-lb-list="all" style="display:none;"></div>
        </div>

        <div class="lb-actions">
          <button type="button" class="lb-btn" data-action="lb-refresh">Обновить</button>
          <button type="button" class="lb-btn lb-btn--primary js-lb-play">Играть</button>
        </div>
      </div>
    </section>
  `,

  init:(el, props, ctx)=>{
    try{
      const root = el.querySelector('[data-page="leaderboard"]') || el;

      const tabs  = root.querySelectorAll('[data-lb-tab]');
      const lists = root.querySelectorAll('[data-lb-list]');
      const btnRefresh = root.querySelector('[data-action="lb-refresh"]');
      const btnPlay = root.querySelector('.js-lb-play');

      const meScoreEl = root.querySelector('.js-lb-me-best');
      const meLabelEl = root.querySelector('[data-bind="lb-me-label"]');
      const meNameEl  = root.querySelector('.js-lb-me-name');
      const meAvEl    = root.querySelector('.js-lb-me-avatar');

      function esc(s){
        return String(s||'').replace(/[&<>"']/g, m=>({
          '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
      }
      function initials(name){
        const n = String(name||'').replace('@','').trim();
        return (n[0] || 'U').toUpperCase();
      }

      function getTgUser(){
        if (window.TG_USER && window.TG_USER.id) return window.TG_USER;
        const u = (window.Telegram && window.Telegram.WebApp &&
                  window.Telegram.WebApp.initDataUnsafe &&
                  window.Telegram.WebApp.initDataUnsafe.user)
          ? window.Telegram.WebApp.initDataUnsafe.user
          : null;
        return u || {};
      }

      function pickMyDisplayName(u){
        const fn = String(u.first_name || '').trim();
        const ln = String(u.last_name || '').trim();
        const full = (fn + ' ' + ln).trim();
        if (full) return full;

        const un = String(u.username || '').replace(/^@/,'').trim();
        if (un) return '@' + un;

        const id = u.id ? String(u.id) : '';
        return id ? ('ID ' + id.slice(-4)) : '—';
      }

      function pickMyPhotoUrl(state, u){
        if (state && state.user_photo) return String(state.user_photo);
        if (state && state.profile && state.profile.photo_url) return String(state.profile.photo_url);
        if (window.USER && window.USER.photo_url) return String(window.USER.photo_url);
        if (u && u.photo_url) return String(u.photo_url);
        return '';
      }

      // --- helpers for leaderboard rows ---

      // медальки для топ-3
      function rankBadge(i){
        if (i === 0) return '🥇';
        if (i === 1) return '🥈';
        if (i === 2) return '🥉';
        return String(i + 1);
      }

      // прячем последние N символов
      function maskTail(s, hideLast){
        const str = String(s||'').trim();
        const n = Math.max(0, Math.floor(hideLast||0));
        if (!str) return '';
        if (str.length <= n) return '•'.repeat(str.length);
        return str.slice(0, str.length - n) + '•'.repeat(n);
      }

      // ✅ Имя участника: name -> username -> masked tg id
      function pickRowName(r){
        if (!r) return '—';

        const n1 = String(r.name || '').trim();
        if (n1) return n1;

        const u1 = String(r.username || '').replace(/^@/,'').trim();
        if (u1) return '@' + u1;

        const id = (r.tg_id != null) ? String(r.tg_id).trim() : '';
        if (!id) return '—';

        // скрываем последние 3 символа
        return 'ID ' + maskTail(id, 3);
      }

      // 🔥 резка без конфликта: ID не режем, @ режем мягко, имена режем обычно
      function shortNameSmart(s, maxLen){
        const str = String(s || '').trim();
        if (!str) return '—';

        // ID и так "безопасный" (маской), оставляем больше символов
        if (str.startsWith('ID ')) return str;

        // @username: показываем больше до …
        if (str.startsWith('@')){
          if (str.length <= maxLen) return str;
          return str.slice(0, Math.max(3, maxLen - 1)) + '…';
        }

        // обычное имя
        if (str.length <= maxLen) return str;
        return str.slice(0, Math.max(3, maxLen - 1)) + '…';
      }

      // оставил на будущее (если вернёшь аватарки)
      function pickRowAvatarHtml(r){
        const photo = r && (r.photo_url || r.photo);
        const nm = pickRowName(r);
        if (photo){
          return `<img src="${esc(photo)}" alt="">`;
        }
        return esc(initials(nm));
      }

      function findMyRank(rows, myId){
        if (!rows || !rows.length || !myId) return 0;
        const idx = rows.findIndex(x => String(x.tg_id) === String(myId));
        return (idx >= 0) ? (idx + 1) : 0;
      }

      function renderRows(container, rows){
        if(!container) return;

        if(!rows || !rows.length){
          container.innerHTML = '<div class="lb-empty">Пока пусто. Сыграй и попади в топ 👇</div>';
          return;
        }

        // ✅ увеличили лимит — будет больше символов до …
        const NAME_MAX = 30;

        container.innerHTML = rows.map((r, idx)=>{
          const rawName = pickRowName(r);
          const nm = shortNameSmart(rawName, NAME_MAX);

          const score = Number((r && (r.score != null ? r.score : r.best_score)) || 0);

          return `
            <div class="lb-row">
              <div class="lb-rank">${rankBadge(idx)}</div>

              <!-- аватарки участников отключены -->
              <!-- <div class="lb-you__avatar">${pickRowAvatarHtml(r)}</div> -->

              <div class="lb-name">${esc(nm)}</div>
              <div class="lb-score" style="margin-left:auto;">${score}</div>
            </div>
          `;
        }).join('');
      }

      function renderSkeleton(){
        const todayList = root.querySelector('[data-lb-list="today"]');
        const allList   = root.querySelector('[data-lb-list="all"]');

        const sk = `
          <div class="lb-skel">
            ${Array.from({length:4}).map((_,i)=>`
              <div class="lb-row">
                <div class="lb-rank">${rankBadge(i)}</div>
                <!-- <div class="lb-you__avatar"></div> -->
                <div class="lb-name">ID 562472273•••</div>
                <div class="lb-score" style="margin-left:auto;">0</div>
              </div>
            `).join('')}
          </div>
        `;

        if (todayList) todayList.innerHTML = sk;
        if (allList)   allList.innerHTML   = sk;
      }

      function applyStateToLeaderboard(state){
        state = state || window.MiniState || {};

        const todayList = root.querySelector('[data-lb-list="today"]');
        const allList   = root.querySelector('[data-lb-list="all"]');

        renderRows(todayList, state.leaderboard_today || []);
        renderRows(allList,   state.leaderboard_alltime || []);

        // === Я (имя/аватар) ===
        const tg = getTgUser();
        const myName = pickMyDisplayName(tg);

        if (meNameEl) meNameEl.textContent = myName;

        if (meAvEl){
          const photo = pickMyPhotoUrl(state, tg);
          if (photo){
            meAvEl.innerHTML = `<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:999px;">`;
          } else {
            meAvEl.textContent = initials(myName);
          }
        }

        // === Мой best score ===
        if (meScoreEl) {
          const all = (state.leaderboard_alltime||[]).find(x=>String(x.tg_id)===String(tg.id));
          const tdy = (state.leaderboard_today||[]).find(x=>String(x.tg_id)===String(tg.id));
          const v = (all && (all.score ?? all.best_score)) || (tdy && (tdy.score ?? tdy.best_score)) || state.game_today_best || 0;
          meScoreEl.textContent = String(v);
        }

        // === Под именем: без # ===
        if (meLabelEl) {
          const myId = String((tg && tg.id) || '');

          const rankToday = Number(state.rank_today || 0) || findMyRank(state.leaderboard_today || [], myId);
          const rankAll   = Number(state.rank_alltime || 0) || findMyRank(state.leaderboard_alltime || [], myId);

          if (rankToday || rankAll){
            const a = rankToday ? ('Сегодня: ' + rankToday + ' место') : 'Сегодня: вне топа';
            const b = rankAll   ? (' · All-time: ' + rankAll + ' место') : '';
            meLabelEl.textContent = a + b;
          } else {
            meLabelEl.textContent = 'Ты вне топа — сыграй ещё 😄';
          }
        }
      }

      function setMode(mode){
        tabs.forEach(btn=>{
          const isActive = btn.getAttribute('data-lb-tab') === mode;
          btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        lists.forEach(list=>{
          const on = list.getAttribute('data-lb-list') === mode;
          list.style.display = on ? 'block' : 'none';
        });
      }

      tabs.forEach(btn=>{
        btn.addEventListener('click', ()=>{
          setMode(btn.getAttribute('data-lb-tab') || 'today');
        });
      });

      // ✅ при открытии: сразу скелетон + текущий state + догрузка state
      setMode('today');
      renderSkeleton();
      applyStateToLeaderboard(window.MiniState || {});
      (async ()=>{
        try{
          if (typeof window.api !== 'function') return;
          const r = await window.api('state', {});
          if (r && r.ok && r.state){
            window.MiniState = r.state;
            applyStateToLeaderboard(r.state);
          }
        }catch(e){
          console.warn('lb auto-load state failed', e);
        }
      })();

      // refresh кнопка — оставляем
      if (btnRefresh){
        btnRefresh.addEventListener('click', async ()=>{
          try{
            if (typeof window.api !== 'function') return;
            renderSkeleton();
            const r = await window.api('state', {});
            if (r && r.ok && r.state){
              window.MiniState = r.state;
              applyStateToLeaderboard(r.state);
            }
          }catch(e){
            console.error('lb-refresh failed', e);
          }
        });
      }

      if (btnPlay){
        btnPlay.addEventListener('click', ()=>{
          if (window.router && typeof window.router.go === 'function'){
            window.router.go('/play');
          } else {
            location.hash = '#/play';
          }
        });
      }

      window.__applyLeaderboardState = applyStateToLeaderboard;

    }catch(e){
      console.error('leaderboard init error', e);
    }
    return null;
  }
};

export async function mount(el, props={}, ctx={}){
  try{
    if (!el) return null;
    if (typeof BLOCK.init === 'function') {
      // init may return cleanup fn
      return await BLOCK.init(el, props, ctx);
    }
    if (typeof BLOCK.preview === 'function') {
      el.innerHTML = BLOCK.preview(props||{});
    }
    return null;
  }catch(e){
    console.error('[leaderboard] mount error', e);
    return null;
  }
}

export function unmount(el){
  try{ if (el) el.innerHTML=''; }catch(_e){}
}
