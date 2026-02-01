// stylesPassport/runtime.js
// Passport (stamps/collection) — SG blocks format.
// Works with legacy window.api('style.collect', payload) AND with fetch fallback to /api/mini/*?public_id=...

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

  // ---------- API adapter (legacy-first)
  const apiFn =
    (typeof ctx.api === "function") ? ctx.api :
    (typeof win.api === "function") ? win.api :
    null;

  // public_id is required for fetch fallback (for worker verify)
  const publicId =
    str(ctx.publicId || ctx.public_id || ctx.publicID, "").trim() ||
    str(props.app_public_id || props.public_id || props.publicId, "").trim() ||
    str(win.SG_APP_PUBLIC_ID || win.APP_PUBLIC_ID, "").trim();

  async function apiCall(pathSeg, body = {}) {
    // If legacy api exists — use it directly (like old passport did)
    if (apiFn) return await apiFn(pathSeg, body);

    if (!publicId){
      const e = new Error("NO_PUBLIC_ID: stylesPassport needs ctx.publicId or props.app_public_id for fetch fallback");
      e.code = "NO_PUBLIC_ID";
      throw e;
    }

    const initData = (ctx && (ctx.initData || ctx.init_data)) ? (ctx.initData || ctx.init_data) : (TG && TG.initData ? TG.initData : "");

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

    const url = `/api/mini/${pathSeg}?public_id=${encodeURIComponent(publicId)}`;

    const payload = {
      ...body,
      init_data: initData,
      tg_user,
      app_public_id: publicId
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

  // Our internal wrappers
  async function apiState(){
    // worker supports /api/mini/state
    return await apiCall("state", {});
  }
  async function apiCollect(style_id, pin){
    // worker supports type === 'style.collect' when called as /api/mini/style.collect
    return await apiCall("style.collect", { style_id, pin });
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

  // ---------- props
  const P = props || {};
  const styles = Array.isArray(P.styles) ? P.styles : [];
  const gridCols = Math.max(1, Math.min(6, num(P.grid_cols, 3)));
  const requirePin = !!P.require_pin;
  // IMPORTANT: to match what "worked": direct_pin (prompt/modal) is the working mode
  const collectMode = str(P.collect_mode, "direct_pin"); // direct_pin | bot_pin (bot_pin needs extra worker logic)
  const btnCollect = str(P.btn_collect, "Отметить");
  const btnDone = str(P.btn_done, "Получено");

  function getStyleId(st){
    return str(st && st.code, "").trim();
  }

  // ---------- state
  let collected = new Set();
  let busy = new Set();
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

  function escapeHtml(s){
    return String(s||"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
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
    if (!progWrap || !progBar || !progTxt) return;

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
    const tgIdStr = str((ctx && ctx.tg && ctx.tg.id) || (TG && TG.initDataUnsafe && TG.initDataUnsafe.user && TG.initDataUnsafe.user.id), "");
    const code = pref + tgIdStr.slice(-6);
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
      <div class="pp-card" data-sid="${escapeHtml(sid)}" data-done="${done ? 1 : 0}">
        <div class="pp-badge">${escapeHtml(badge)}</div>
        <div class="pp-card-top">
          <div class="pp-ico">
            ${img ? `<img alt="" src="${escapeHtml(img)}">` : `<span class="pp-ico-ph">★</span>`}
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
        await onCollectClick(sid);
      });
    });
  }

  async function refreshFromServer(){
    // DO NOT swallow errors silently (temporary debug)
    const j = await apiState();
    const st = (j && (j.state || j.fresh_state || j.fresh || j.data)) ? (j.state || j.fresh_state || j.fresh || j.data) : j;
    applyState(st);
  }

  function applyState(st){
    collected = new Set(Array.isArray(st && st.styles) ? st.styles.map(x=>String(x||"")) : []);
    renderProgress();
    renderReward();
    renderGrid();
  }

  async function collectDirectPin(styleId, pin){
    const res = await apiCollect(styleId, pin);
    if (res && res.fresh_state) applyState(res.fresh_state);
    else await refreshFromServer();
  }

async function collectNoPin(styleId){
  const res = await apiCall("style.collect", { style_id: styleId, pin: "" });
  if (res && res.fresh_state) applyState(res.fresh_state);
  else await refreshFromServer();
}


  async function collectBotPin(styleId){
    // WARNING: your current worker DOES NOT have passport.pin_start / pin_pending handling.
    // This will not work until we add it in worker.
    await uiAlert("⚠️ Режим bot_pin пока не включён в воркере. Используй direct_pin (модалка).");
    // If you later add worker support: apiCall("passport.pin_start", {style_id})
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
      await uiAlert((e && e.message) ? e.message : "Ошибка");
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
        const msg = (e && e.message) ? e.message : "PIN неверный";
        if (modalErr){
          modalErr.hidden=false;
          modalErr.textContent = msg;
        } else {
          await uiAlert(msg);
        }
      }
    });
  }
  if (modalCancel) modalCancel.addEventListener("click", ()=> setModalVisible(false));
  if (modalClose)  modalClose.addEventListener("click", ()=> setModalVisible(false));

  // ---------- init
  renderHeader();
  renderGrid();

  try{
    if (ctx && ctx.state) applyState(ctx.state);
    else await refreshFromServer();
  }catch(e){
    await uiAlert((e && e.message) ? e.message : "Не удалось загрузить состояние");
  }
}
