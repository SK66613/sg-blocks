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

  function escapeHtml(s){
    return String(s||"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
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
      // Studio/preview mode: no api + no publicId => can't call backend, just return stub
      return { ok:false, error:'NO_PUBLIC_ID' };
    }

    const initData =
      (ctx && (ctx.initData || ctx.init_data))
        ? (ctx.initData || ctx.init_data)
        : (TG && TG.initData ? TG.initData : "");

    const u =
      (ctx && (ctx.tg_user || ctx.tgUser)) ||
      (TG && TG.initDataUnsafe && TG.initDataUnsafe.user) ||
      null;

    const tg_user = u ? {
      id: u.id,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name
    } : null;

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
    return await apiCall("state", {});
  }
  async function apiCollect(style_id, pin){
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

  // QR bottom sheet
  const sheetEl   = root.querySelector("[data-pp-sheet]");
  const sheetCloseEls = root.querySelectorAll("[data-pp-sheet-close]");

  const sheetPanel = sheetEl ? sheetEl.querySelector(".pp-sheet-panel") : null;


  const qrTitle  = root.querySelector("[data-pp-qr-title]");
  const qrText   = root.querySelector("[data-pp-qr-text]");
  const qrCanvas = root.querySelector("[data-pp-qr-canvas]");
  const qrCodeText = root.querySelector("[data-pp-qr-code]");

  const openQrBtn = root.querySelector("[data-pp-open-qr]");

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

  // IMPORTANT: direct_pin is the working mode
  const collectMode = str(P.collect_mode, "direct_pin"); // direct_pin | bot_pin
  const btnCollect = str(P.btn_collect, "Отметить");
  const btnDone = str(P.btn_done, "Получено");

  function getStyleId(st){
    return str(st && st.code, "").trim();
  }

  // ---------- state
  let state = null; // keep the latest server state (needed for passport_reward)
  let collected = new Set();
  let busy = new Set();
  let selectedStyleId = "";
  let selectedStyleName = "";

  function isDone(styleId){ return collected.has(String(styleId)); }

  function isComplete(){
    const total = styles.length;
    return total > 0 && collected.size >= total;
  }

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

  // ===== QR helpers (variant 2: from state.passport_reward.redeem_code + state.bot_username)
  const completeShowQr = (P.complete_show_qr === undefined) ? true : !!P.complete_show_qr;
  const completeHideHeader = (P.complete_hide_header === undefined) ? true : !!P.complete_hide_header;

  const qrTitleText = str(P.qr_title, "🎁 Получите приз");
  const qrHelpText  = str(P.qr_text, "Покажите этот QR кассиру, чтобы получить подарок.");
  const qrShowCodeText = !!P.qr_show_code_text;

  const qrService = str(P.qr_service, "https://quickchart.io/qr");
  const qrSize    = Math.max(120, num(P.qr_size, 260));
  const qrMargin  = Math.max(0,   num(P.qr_margin, 2));

    // ===== Sheet swipe (down-to-close)
  const SWIPE_CLOSE_PX = Math.max(50, num(P.sheet_swipe_close_px, 90));   // сколько тянуть вниз чтобы закрыть
  const SWIPE_VELOCITY = Math.max(0.3, num(P.sheet_swipe_velocity, 0.6)); // px/ms, быстрый свайп закрывает
  const SWIPE_EDGE_PX  = Math.max(10, num(P.sheet_swipe_edge_px, 6));     // анти-дребезг


    let sheetOpen = false;

  function lockBodyScroll(locked){
    // блокируем прокрутку фона, пока sheet открыт (очень важно для iOS/TG)
    try{
      const b = doc.body;
      if (!b) return;
      if (locked){
        b.dataset.ppSheetLock = "1";
        b.style.overflow = "hidden";
        b.style.touchAction = "none";
      }else{
        if (b.dataset.ppSheetLock === "1"){
          delete b.dataset.ppSheetLock;
          b.style.overflow = "";
          b.style.touchAction = "";
        }
      }
    }catch(_){}
  }

  function setSheetTranslate(px){
    if (!sheetPanel) return;
    sheetPanel.style.transform = px ? `translateY(${px}px)` : "";
  }

  function setSheetDragState(on){
    if (!sheetPanel) return;
    if (on){
      sheetPanel.style.transition = "none";
    }else{
      sheetPanel.style.transition = "";
    }
  }

  function openSheet(){
    if (!sheetEl) return;
    sheetEl.hidden = false;
    // сброс drag
    setSheetDragState(false);
    setSheetTranslate(0);
    sheetEl.classList.add("is-open");
    sheetOpen = true;
    lockBodyScroll(true);
  }

  function closeSheet(){
    if (!sheetEl) return;
    sheetEl.classList.remove("is-open");
    sheetOpen = false;
    lockBodyScroll(false);
    // сброс drag, чтобы в следующий раз не было смещения
    setSheetDragState(false);
    setSheetTranslate(0);
    setTimeout(()=>{ try{ sheetEl.hidden = true; }catch(_){ } }, 180);
  }


  // close on backdrop / handle
  try{
    sheetCloseEls && sheetCloseEls.forEach && sheetCloseEls.forEach(el=>{
      el.addEventListener("click", closeSheet);
    });
  }catch(_){}

    // ===== Swipe-to-close (drag down on panel)
  (function setupSheetSwipe(){
    if (!sheetEl || !sheetPanel) return;

    let dragging = false;
    let startY = 0;
    let lastY = 0;
    let startT = 0;

    function getY(ev){
      if (ev && ev.touches && ev.touches[0]) return ev.touches[0].clientY;
      if (ev && ev.changedTouches && ev.changedTouches[0]) return ev.changedTouches[0].clientY;
      return ev.clientY;
    }

    function onStart(ev){
      if (!sheetOpen) return;

      // стартуем только если тач на панели (не на бекдропе)
      const y = getY(ev);
      if (!Number.isFinite(y)) return;

      dragging = true;
      startY = y;
      lastY = y;
      startT = performance.now();

      setSheetDragState(true);

      // iOS: важно — не дать странице “перехватить” жест
      try{ ev.preventDefault(); }catch(_){}
    }

    function onMove(ev){
      if (!dragging) return;
      const y = getY(ev);
      if (!Number.isFinite(y)) return;

      const dy = Math.max(0, y - startY);
      lastY = y;

      // маленький шум игнорируем
      if (dy < SWIPE_EDGE_PX) return;

      setSheetTranslate(dy);

      try{ ev.preventDefault(); }catch(_){}
      try{ ev.stopPropagation(); }catch(_){}
    }

    function onEnd(ev){
      if (!dragging) return;
      dragging = false;

      const endT = performance.now();
      const dt = Math.max(1, endT - startT);

      const y = getY(ev);
      const dy = Math.max(0, (Number.isFinite(y) ? y : lastY) - startY);
      const v = dy / dt; // px/ms

      setSheetDragState(false);

      // закрываем если дотянули или “быстро свайпнули”
      if (dy >= SWIPE_CLOSE_PX || v >= SWIPE_VELOCITY){
        haptic("light");
        closeSheet();
        return;
      }

      // иначе возвращаем назад
      setSheetTranslate(0);
    }

    // PointerEvents если есть
    const hasPointer = "PointerEvent" in win;

    if (hasPointer){
      sheetPanel.addEventListener("pointerdown", onStart, { passive:false });
      win.addEventListener("pointermove", onMove, { passive:false });
      win.addEventListener("pointerup", onEnd, { passive:false });
      win.addEventListener("pointercancel", onEnd, { passive:false });
    }else{
      // Touch fallback
      sheetPanel.addEventListener("touchstart", onStart, { passive:false });
      win.addEventListener("touchmove", onMove, { passive:false });
      win.addEventListener("touchend", onEnd, { passive:false });
      win.addEventListener("touchcancel", onEnd, { passive:false });
    }
  })();


  function setQrVisible(v){
    if (v) openSheet();
    else closeSheet();
  }

  function setQrTextLink(text){
    if (!qrCodeText) return;
    if (qrShowCodeText){
      qrCodeText.hidden = false;
      qrCodeText.textContent = text || "";
    }else{
      qrCodeText.hidden = true;
      qrCodeText.textContent = "";
    }
  }

  function getRedeemDeepLink(){
    const pr = state && (state.passport_reward || state.reward || state.pass_reward)
      ? (state.passport_reward || state.reward || state.pass_reward)
      : null;

    const code = pr && (pr.redeem_code || pr.code || pr.redeemCode)
      ? String(pr.redeem_code || pr.code || pr.redeemCode).trim()
      : "";
    if (!code) return "";

    const botRaw =
      (state && (state.bot_username || state.botUsername)) ||
      (P && (P.bot_username || P.botUsername)) ||
      "";

    const bot = botRaw ? String(botRaw).replace(/^@/,'').trim() : "";

    // start payload must be redeem_<code>
    const startPayload = "redeem_" + code;

    if (bot) return `https://t.me/${bot}?start=${encodeURIComponent(startPayload)}`;

    // fallback: just payload (if no bot_username)
    return startPayload;
  }

  async function renderQr(){
    if (!sheetEl) return;

    // ✅ ВАЖНО: тут НИКАКИХ addEventListener — только рендер
    if (!completeShowQr || !isComplete()){
      setQrVisible(false);
      return;
    }

    const link = getRedeemDeepLink();
    if (!link){
      // passport complete but no redeem_code yet
      setQrVisible(true);
      if (qrTitle) qrTitle.textContent = qrTitleText;
      if (qrText)  qrText.textContent  = "Приз готовится… обновите экран";
      setQrTextLink("Нет redeem_code в state");
      return;
    }

    setQrVisible(true);
    if (qrTitle) qrTitle.textContent = qrTitleText;
    if (qrText)  qrText.textContent  = qrHelpText;
    setQrTextLink(link);

    if (!qrCanvas) return;

    // set canvas size
    try{
      qrCanvas.width = qrSize;
      qrCanvas.height = qrSize;
    }catch(_){}

    const ctx2 = qrCanvas.getContext("2d");
    if (!ctx2) return;

    // white bg
    ctx2.fillStyle = "#fff";
    ctx2.fillRect(0,0,qrCanvas.width, qrCanvas.height);

    const qUrl = `${qrService}?size=${qrSize}&margin=${qrMargin}&text=${encodeURIComponent(link)}`;

    await new Promise((resolve)=>{
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = ()=>{
        ctx2.drawImage(img, 0, 0, qrCanvas.width, qrCanvas.height);
        resolve(true);
      };
      img.onerror = ()=>{
        // fallback so you SEE something
        ctx2.fillStyle = "#fff";
        ctx2.fillRect(0,0,qrCanvas.width, qrCanvas.height);
        ctx2.fillStyle = "#000";
        ctx2.font = "12px ui-monospace, Menlo, Consolas, monospace";
        ctx2.fillText("QR load error", 10, 20);
        resolve(false);
      };
      img.src = qUrl;
    });
  }

  async function renderMode(){
    const done = isComplete();

    // hide cards after completion (QR is shown via bottom sheet)
    if (gridEl) gridEl.hidden = !!(completeShowQr && done);

    if (completeShowQr && done && completeHideHeader){
      const head = root.querySelector(".pp-head");
      const prog = root.querySelector(".pp-progress");
      if (head) head.style.display = "none";
      if (prog) prog.style.display = "none";
    } else {
      const head = root.querySelector(".pp-head");
      const prog = root.querySelector(".pp-progress");
      if (head) head.style.display = "";
      if (prog) prog.style.display = "";
    }

    // do NOT auto-open QR here — QR opens from the reward button
  }

  function renderReward(){
    const enabled = !!P.reward_enabled;
    if (!rewardWrap) return;

    if (!enabled || !isComplete()){
      rewardWrap.hidden = true;
      return;
    }

    rewardWrap.hidden = false;
    if (rewardTitle) rewardTitle.textContent = str(P.reward_title, "🎁 Приз");

    const pr = state && (state.passport_reward || state.reward || state.pass_reward)
      ? (state.passport_reward || state.reward || state.pass_reward)
      : null;

    let codeToShow = "";
    let hint = "";

    if (pr && (pr.redeem_code || pr.code)){
      codeToShow = String(pr.redeem_code || pr.code);
      hint = str(P.reward_text, "");
    } else if (pr && Number(pr.coins) > 0){
      hint = str(P.reward_text, "");
      const coinsLine = `Начислено монет: ${Number(pr.coins)}`;
      hint = hint ? (hint + "\n\n" + coinsLine) : coinsLine;
    } else {
      hint = str(P.reward_text, "");
      const extra = "Приз готовится… обновите экран";
      hint = hint ? (hint + "\n\n" + extra) : extra;
    }

    if (rewardText) rewardText.textContent = hint;

    if (rewardCode){
      if (codeToShow){
        rewardCode.hidden = false;
        rewardCode.textContent = codeToShow;
      } else {
        rewardCode.hidden = true;
        rewardCode.textContent = "";
      }
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

    // ✅ делаем карточку настоящей кнопкой — в TG WebView клики стабильнее
    return `
      <button class="pp-card ${disabled ? "is-disabled" : ""}" type="button"
        data-sid="${escapeHtml(sid)}"
        data-done="${done ? 1 : 0}"
        ${disabled ? "disabled" : ""}>
        <div class="pp-badge">${escapeHtml(badge)}</div>

        <div class="pp-card-top">
          <div class="pp-ico">
            ${img ? `<img alt="" src="${escapeHtml(img)}">` : `<span class="pp-ico-ph">★</span>`}
          </div>

          <div class="pp-txt">
            <div class="pp-name">${escapeHtml(name)}</div>
            ${desc ? `<div class="pp-desc">${escapeHtml(desc)}</div>` : ``}
            <div class="pp-action">${escapeHtml(done ? btnDone : btnCollect)}</div>
          </div>
        </div>
      </button>
    `;
  }

  function renderGrid(){
    if (!gridEl) return;
    gridEl.style.gridTemplateColumns = `repeat(${gridCols}, minmax(0, 1fr))`;
    gridEl.innerHTML = styles.map(cardHtml).join("");

    gridEl.querySelectorAll(".pp-card").forEach(card=>{
      const sid = card.getAttribute("data-sid") || "";

      card.addEventListener("click", async ()=>{
        if (!sid) return;
        if (card.disabled) return;
        if (isDone(sid)) return;
        if (busy.has(sid)) return;
        await onCollectClick(sid);
      });
    });
  }

  // ----- normalize collected (so old worker formats don't break)
  function normalizeCollected(st){
    const out = new Set();
    if (!st) return out;

    const candidates = [
      st.styles,
      st.styles_collected,
      st.collected_styles,
      st.stamps,
      st.done_styles,
      st.passport && st.passport.styles,
      st.passport && st.passport.collected
    ];

    let arr = null;
    for (const c of candidates){
      if (Array.isArray(c)) { arr = c; break; }
    }

    if (arr){
      for (const it of arr){
        if (it === null || it === undefined) continue;
        if (typeof it === "string" || typeof it === "number") out.add(String(it));
        else if (typeof it === "object"){
          const v = it.code || it.style_id || it.styleId || it.id || it.key;
          if (v !== undefined && v !== null) out.add(String(v));
        }
      }
      return out;
    }

    const map = st.styles_map || st.collected_map || st.stamps_map;
    if (map && typeof map === "object"){
      for (const k of Object.keys(map)){
        if (map[k]) out.add(String(k));
      }
    }

    return out;
  }

  async function refreshFromServer(){
    const j = await apiState();
    const st = (j && (j.state || j.fresh_state || j.fresh || j.data || j.result))
      ? (j.state || j.fresh_state || j.fresh || j.data || j.result)
      : j;
    await applyState(st);
  }

  async function applyState(st){
    state = st || {};
    collected = normalizeCollected(state);
    renderProgress();
    renderReward();
    renderGrid();
    try{ await renderMode(); }catch(_){}
  }

  async function collectDirectPin(styleId, pin){
    const res = await apiCollect(styleId, pin);
    const st = (res && (res.fresh_state || res.state || res.result))
      ? (res.fresh_state || res.state || res.result)
      : res;
    if (st) await applyState(st);
    else await refreshFromServer();
  }

  async function collectNoPin(styleId){
    const res = await apiCollect(styleId, "");
    const st = (res && (res.fresh_state || res.state || res.result))
      ? (res.fresh_state || res.state || res.result)
      : res;
    if (st) await applyState(st);
    else await refreshFromServer();
  }

  async function collectBotPin(styleId){
    await uiAlert("⚠️ Режим bot_pin пока не включён в воркере. Используй direct_pin (модалка).");
  }

  async function onCollectClick(styleId){
    try{
      haptic("light");

      // ✅ direct_pin: просто открываем модалку, без busy/renderGrid
      if (requirePin && collectMode === "direct_pin"){
        selectedStyleId = styleId;
        selectedStyleName = (styles.find(s=>getStyleId(s)===styleId)?.name) || "";
        if (modalTitle) modalTitle.textContent = "Введите PIN";
        if (modalSub) modalSub.textContent = selectedStyleName ? `Штамп: ${selectedStyleName}` : "";
        setModalVisible(true);
        return;
      }

      // ✅ для остальных случаев busy нужен только на момент запроса
      busy.add(styleId);
      renderGrid();

      if (requirePin){
        await collectBotPin(styleId);
      } else {
        await collectNoPin(styleId);
      }
    } catch (e){
      await uiAlert((e && e.message) ? e.message : "Ошибка");
    } finally {
      if (busy.has(styleId)){
        busy.delete(styleId);
        renderGrid();
      }
    }
  }

  // modal events
  if (modalOk){
    modalOk.addEventListener("click", async ()=>{
      const pin = str(pinInp && pinInp.value, "").trim();
      if (requirePin && !pin){
        if (modalErr){ modalErr.hidden=false; modalErr.textContent="Введите PIN"; }
        return;
      }
      if (modalErr){ modalErr.hidden=true; modalErr.textContent=""; }

      try{
        haptic("light");

        // ✅ busy только во время подтверждения PIN
        if (selectedStyleId){
          busy.add(selectedStyleId);
          renderGrid();
        }

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
      } finally {
        if (selectedStyleId && busy.has(selectedStyleId)){
          busy.delete(selectedStyleId);
          renderGrid();
        }
      }
    });
  }
  if (modalCancel) modalCancel.addEventListener("click", ()=> setModalVisible(false));
  if (modalClose)  modalClose.addEventListener("click", ()=> setModalVisible(false));

  // ---------- init
  renderHeader();
  renderGrid();
  renderProgress();
  renderReward();
  setQrVisible(false);

  // ✅ Open QR bottom sheet from reward card button (ONLY HERE)
  if (openQrBtn){
    openQrBtn.addEventListener("click", async ()=>{
      openSheet();
      try{ await renderQr(); }catch(_){ }
    });
  }

  try{
    if (ctx && ctx.state) await applyState(ctx.state);
    else await refreshFromServer();
  }catch(e){
    await uiAlert((e && e.message) ? e.message : "Не удалось загрузить состояние");
  }
}
