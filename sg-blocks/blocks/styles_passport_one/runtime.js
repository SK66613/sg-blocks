// stylesPassport/runtime.js
// Universal passport (stamps/collection) — SG blocks format.
// API priority: ctx.api -> window.api -> POST /api/mini/<method>

export async function mount(root, props = {}, ctx = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  const TG =
    ctx.tg ||
    (win.Telegram && win.Telegram.WebApp) ||
    (win.parent && win.parent.Telegram && win.parent.Telegram.WebApp) ||
    null;

  // ---------- helpers
  const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const str = (v, d = "") => (v === undefined || v === null) ? d : String(v);
  const clamp01 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  };

  function haptic(kind="light"){
    try{ TG && TG.HapticFeedback && TG.HapticFeedback.impactOccurred && TG.HapticFeedback.impactOccurred(kind); }catch(_){}
  }

  async function uiAlert(msg){
    try{
      if (TG && TG.showAlert) return await TG.showAlert(String(msg||""));
    }catch(_){}
    alert(String(msg||""));
  }

  // ---------- API
  const apiFn =
    (typeof ctx.api === "function") ? ctx.api :
    (typeof win.api === "function") ? win.api :
    null;

  async function apiCall(pathSeg, body = {}) {
    if (apiFn) return await apiFn(pathSeg, body);

    const url = `/api/mini/${pathSeg}`;
    const initData = (ctx && ctx.initData) ? ctx.initData : (TG && TG.initData ? TG.initData : "");

    // tg_user обязателен для воркера
    const u =
      (ctx && (ctx.tg_user || ctx.tgUser)) ||
      (TG && TG.initDataUnsafe && TG.initDataUnsafe.user) ||
      null;

    const tg_user = u ? {
      id: u.id,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name
    } : (ctx && ctx.tg && ctx.tg.id ? { id: ctx.tg.id } : null);

    const payload = {
      ...body,
      init_data: initData,
      tg_user,
      app_public_id: (ctx && (ctx.public_id || ctx.publicId)) ? String(ctx.public_id || ctx.publicId) : (body.app_public_id || "")
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.ok === false) {
      const err = new Error((j && (j.error || j.message)) || `API ${pathSeg} failed (${r.status})`);
      err.status = r.status;
      err.payload = j;
      throw err;
    }
    return j;
  }

  // единый “event” вызов под твой воркер
  async function apiEvent(type, payload = {}) {
    return await apiCall("event", { type, payload });
  }


  // ---------- DOM
  const titleEl = root.querySelector("[data-pp-title]");
  const subEl   = root.querySelector("[data-pp-subtitle]");
  const coverEl = root.querySelector("[data-pp-cover]");
  const coverImg= coverEl ? coverEl.querySelector("img") : null;

  const gridEl  = root.querySelector("[data-pp-grid]");
  const progWrap= root.querySelector("[data-pp-progress]");
  const progBar = root.querySelector("[data-pp-bar]");
  const progTxt = root.querySelector("[data-pp-progress-text]");

  const rewardWrap = root.querySelector("[data-pp-reward]");
  const rewardTitle= root.querySelector("[data-pp-reward-title]");
  const rewardText = root.querySelector("[data-pp-reward-text]");
  const rewardCode = root.querySelector("[data-pp-reward-code]");

  const modalEl  = root.querySelector("[data-pp-modal]");
  const pinInp   = root.querySelector("[data-pp-pin-inp]");
  const modalOk  = root.querySelector("[data-pp-modal-ok]");
  const modalCancel = root.querySelector("[data-pp-modal-cancel]");
  const modalClose  = root.querySelector("[data-pp-modal-close]");
  const modalTitle  = root.querySelector("[data-pp-modal-title]");
  const modalSub    = root.querySelector("[data-pp-modal-sub]");
  const modalErr    = root.querySelector("[data-pp-modal-err]");

  // ---------- props (defaults)
  const P = props || {};
  const styles = Array.isArray(P.styles) ? P.styles : [];
  const gridCols = Math.max(1, Math.min(6, num(P.grid_cols, 3)));
  const requirePin = !!P.require_pin;
  const collectMode = str(P.collect_mode, "bot_pin"); // bot_pin | direct_pin
  const btnCollect = str(P.btn_collect, "Отметить");
  const btnDone = str(P.btn_done, "Получено");

  // IMPORTANT: one-campaign mode (for now)
  // style_id stored in D1: just code (back-compat). Later we'll do campaignId:code.
  function getStyleId(st){
    return str(st && st.code, "").trim();
  }

  // ---------- state
  let collected = new Set(); // style_id
  let busy = new Set();      // style_id currently sending
  let selectedStyleId = "";
  let selectedStyleName = "";

  function isDone(styleId){ return collected.has(styleId); }

  function setModalVisible(v){
    if (!modalEl) return;
    modalEl.hidden = !v;
    if (!v){
      if (modalErr) { modalErr.hidden = true; modalErr.textContent = ""; }
      if (pinInp) pinInp.value = "";
    } else {
      setTimeout(()=>{ try{ pinInp && pinInp.focus && pinInp.focus(); }catch(_){} }, 50);
    }
  }

  function renderHeader(){
    if (titleEl) titleEl.textContent = str(P.title, "Паспорт");
    if (subEl) subEl.textContent = str(P.subtitle, "");

    const coverUrl = str(P.cover_url, "").trim();
    if (coverEl && coverImg){
      if (coverUrl){
        coverEl.hidden = false;
        coverImg.src = coverUrl;
      } else {
        coverEl.hidden = true;
        coverImg.removeAttribute("src");
      }
    }
  }

  function renderProgress(){
    const total = styles.length;
    const got = collected.size;
    if (!progWrap || !progBar || !progTxt){
      return;
    }
    if (!total){
      progWrap.hidden = true;
      return;
    }
    progWrap.hidden = false;
    const pct = total ? clamp01(got / total) : 0;
    progBar.style.width = `${Math.round(pct * 100)}%`;
    progTxt.textContent = `${got}/${total}`;
  }

  function renderReward(){
    const enabled = !!P.reward_enabled;
    const total = styles.length;
    const got = collected.size;

    if (!rewardWrap) return;
    if (!enabled || !total || got < total){
      rewardWrap.hidden = true;
      return;
    }

    rewardWrap.hidden = false;
    if (rewardTitle) rewardTitle.textContent = str(P.reward_title, "🎁 Приз");
    if (rewardText) rewardText.textContent = str(P.reward_text, "");

    const pref = str(P.reward_code_prefix, "PASS-");
    const code = pref + str(ctx && (ctx.tg && ctx.tg.id), "").slice(-6); // визуальный код (не redeem)
    if (rewardCode){
      rewardCode.hidden = false;
      rewardCode.textContent = code;
    }
  }

  function cardHtml(st, idx){
    const sid = getStyleId(st);
    const done = sid && isDone(sid);
    const img = str(st && st.image, "").trim();
    const name = str(st && (st.name || st.title), sid || `#${idx+1}`);
    const desc = str(st && (st.desc || st.subtitle), "");

    const disabled = !sid || done || busy.has(sid);
    const badge = done ? "✓" : `${idx+1}`;

    return `
      <div class="pp-card" data-sid="${sid}" data-done="${done ? 1 : 0}">
        <div class="pp-badge">${badge}</div>
        <div class="pp-card-top">
          <div class="pp-ico">
            ${img ? `<img alt="" src="${img}">` : `<span class="pp-ico-ph">★</span>`}
          </div>
          <div class="pp-txt">
            <div class="pp-name">${escapeHtml(name)}</div>
            ${desc ? `<div class="pp-desc">${escapeHtml(desc)}</div>` : ``}
          </div>
        </div>
        <div class="pp-card-bot">
          <button class="pp-btn ${done ? "" : "primary"}" type="button" ${disabled ? "disabled" : ""}>
            ${escapeHtml(done ? btnDone : btnCollect)}
          </button>
        </div>
      </div>
    `;
  }

  function escapeHtml(s){
    return String(s||"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function renderGrid(){
    if (!gridEl) return;
    gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(0, 1fr))`;
    gridEl.innerHTML = styles.map(cardHtml).join("");

    gridEl.querySelectorAll(".pp-card").forEach(card=>{
      const sid = card.getAttribute("data-sid") || "";
      const btn = card.querySelector("button");
      if (!btn) return;
      btn.addEventListener("click", async ()=>{
        if (!sid) return;
        if (isDone(sid)) return;
        if (busy.has(sid)) return;

        await onCollectClick(sid, card);
      });
    });
  }

  async function refreshFromServer(){
    try{
      const j = await apiEvent("state", {});

      const st = j && (j.state || j.fresh_state || j.fresh || j.data) ? (j.state || j.fresh_state || j.fresh || j.data) : j;
      applyState(st);
    }catch(_){}
  }

  function applyState(st){
    // expects: styles[] = collected style ids
    collected = new Set(Array.isArray(st && st.styles) ? st.styles.map(x=>String(x||"")) : []);
    renderProgress();
    renderReward();
    // re-render buttons (cheap: full rerender)
    renderGrid();
  }

  async function collectDirectPin(styleId, pin){
    const res = await apiEvent("style.collect", { style_id: styleId, pin });

    if (res && res.fresh_state) applyState(res.fresh_state);
    else await refreshFromServer();
  }

  async function collectBotPin(styleId){
    // asks bot to request PIN in chat
    await apiEvent("passport.pin_start", { style_id: styleId });

    await uiAlert("Я попросил бота запросить PIN в чате ✅\nВведите PIN в переписке с ботом, и штамп появится тут.");
  }

  async function collectNoPin(styleId){
    const res = await apiCall("public.event", { type:"style.collect", payload:{ style_id: styleId } });
    if (res && res.fresh_state) applyState(res.fresh_state);
    else await refreshFromServer();
  }

  async function onCollectClick(styleId){
    busy.add(styleId);
    renderGrid();

    try{
      haptic("light");

      if (requirePin){
        if (collectMode === "direct_pin"){
          selectedStyleId = styleId;
          selectedStyleName = (styles.find(s=>getStyleId(s)===styleId)?.name) || "";
          if (modalTitle) modalTitle.textContent = "Введите PIN";
          if (modalSub) modalSub.textContent = selectedStyleName ? `Штамп: ${selectedStyleName}` : "";
          setModalVisible(true);
        } else {
          await collectBotPin(styleId);
        }
      } else {
        await collectNoPin(styleId);
      }
    } catch (e){
      const msg = (e && e.message) ? e.message : "Ошибка";
      await uiAlert(msg);
    } finally {
      busy.delete(styleId);
      renderGrid();
    }
  }

  // modal events
  if (modalOk){
    modalOk.addEventListener("click", async ()=>{
      const pin = str(pinInp && pinInp.value, "").trim();
      if (!pin){
        if (modalErr){ modalErr.hidden=false; modalErr.textContent="Введите PIN"; }
        return;
      }
      if (modalErr){ modalErr.hidden=true; modalErr.textContent=""; }

      try{
        haptic("light");
        await collectDirectPin(selectedStyleId, pin);
        setModalVisible(false);
      } catch (e){
        if (modalErr){
          modalErr.hidden=false;
          modalErr.textContent = (e && e.message) ? e.message : "PIN неверный";
        } else {
          await uiAlert((e && e.message) ? e.message : "PIN неверный");
        }
      }
    });
  }
  if (modalCancel) modalCancel.addEventListener("click", ()=> setModalVisible(false));
  if (modalClose)  modalClose.addEventListener("click", ()=> setModalVisible(false));

  // ---------- init
  renderHeader();
  renderGrid();

  // take initial state from ctx if present
  if (ctx && ctx.state){
    applyState(ctx.state);
  } else {
    await refreshFromServer();
  }
}
