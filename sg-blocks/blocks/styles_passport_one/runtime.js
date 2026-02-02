// styles_passport_one/runtime.js
// Passport (stamps/collection) with redeem QR link (same pattern as sales_qr_one):
// - On complete: request redeem token from worker
// - Build deep link: https://t.me/<bot>?start=redeem_<token> (or use deep_link from worker)
// - Render QR using quickchart.io and draw into canvas
//
// Works with legacy window.api('style.collect'/'state') or fetch fallback to /api/mini/*?public_id=...

export async function mount(root, props = {}, ctx = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  const TG =
    ctx.tg ||
    (win.Telegram && win.Telegram.WebApp) ||
    (win.parent && win.parent.Telegram && win.parent.Telegram.WebApp) ||
    null;

  // ---------- helpers
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const str = (v, d = "") => (v === undefined || v === null) ? d : String(v);

  function escapeHtml(s){
    return String(s||"")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function haptic(kind="light"){
    try{ TG && TG.HapticFeedback && TG.HapticFeedback.impactOccurred && TG.HapticFeedback.impactOccurred(kind); }catch(_){}
  }

  async function uiAlert(msg){
    try{ if (TG && TG.showAlert) return await TG.showAlert(String(msg||"")); }catch(_){}
    alert(String(msg||""));
  }

  function getTgUser(){
    const u =
      (ctx && (ctx.tg_user || ctx.tgUser)) ||
      (TG && TG.initDataUnsafe && TG.initDataUnsafe.user) ||
      null;
    if (u && u.id) return u;
    return null;
  }

  // ---------- API adapter (legacy-first)
  const apiFn =
    (typeof ctx.api === "function") ? ctx.api :
    (typeof win.api === "function") ? win.api :
    null;

  // public_id is required for fetch fallback
  const publicId =
    str(ctx.publicId || ctx.public_id || ctx.publicID, "").trim() ||
    str(props.app_public_id || props.public_id || props.publicId, "").trim() ||
    str(win.SG_APP_PUBLIC_ID || win.APP_PUBLIC_ID, "").trim();

  async function apiCall(pathSeg, body = {}) {
    if (apiFn) return await apiFn(pathSeg, body);

    if (!publicId){
      return { ok:false, error:'NO_PUBLIC_ID' };
    }

    const initData =
      (ctx && (ctx.initData || ctx.init_data)) ? (ctx.initData || ctx.init_data) :
      (TG && TG.initData ? TG.initData : "");

    const tg_user = getTgUser();

    const url = `/api/mini/${pathSeg}?public_id=${encodeURIComponent(publicId)}`;
    const payload = {
      ...body,
      init_data: initData,
      tg_user,
      tg_user_id: tg_user && tg_user.id ? String(tg_user.id) : undefined,
      app_public_id: publicId,
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

  // mini endpoints
  async function apiState(){ return await apiCall("state", {}); }
  async function apiCollect(style_id, pin){ return await apiCall("style.collect", { style_id, pin }); }

  // redeem token endpoint (PUBLIC, like sales_qr_one)
  // Default path follows sales_qr_one pattern: /api/public/app/<publicId>/redeem/token
  const redeemTokenPathTpl = str(props.redeem_token_path, "/api/public/app/{publicId}/redeem/token");
  const redeemTtlSec = Math.max(30, Math.round(num(props.redeem_ttl_sec, 600)));
  const redeemRefreshSec = Math.max(5, Math.round(num(props.redeem_refresh_sec, 25)));
  const redeemStartPrefix = str(props.redeem_start_prefix, "redeem_"); // start=redeem_<token>

  function buildRedeemTokenUrl(){
    return redeemTokenPathTpl.replace("{publicId}", encodeURIComponent(publicId));
  }

  async function fetchRedeemToken(){
    if (!publicId) return { ok:false, error:"NO_PUBLIC_ID" };

    const initData =
      (ctx && (ctx.initData || ctx.init_data)) ? (ctx.initData || ctx.init_data) :
      (TG && TG.initData ? TG.initData : "");

    const body = {
      init_data: initData,
      ttl_sec: redeemTtlSec,
    };

    const url = buildRedeemTokenUrl();

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(()=>null);
    if (!r.ok || !j || j.ok === false){
      return { ok:false, error: (j && (j.error || j.message)) ? (j.error || j.message) : `HTTP ${r.status}` };
    }
    return j;
  }

  function buildDeepLinkFromToken(botUsername, token){
    const bn = String(botUsername||"").replace(/^@/,"").trim();
    const t = String(token||"").trim();
    if (!bn || !t) return "";
    return `https://t.me/${bn}?start=${encodeURIComponent(redeemStartPrefix + t)}`;
  }

  // ---------- DOM
  const titleEl = root.querySelector("[data-pp-title]");
  const subEl = root.querySelector("[data-pp-subtitle]");
  const coverEl = root.querySelector("[data-pp-cover]");
  const coverImg = coverEl ? coverEl.querySelector("img") : null;

  const gridEl = root.querySelector("[data-pp-grid]");
  const progWrap = root.querySelector("[data-pp-progress]");
  const progBar = root.querySelector("[data-pp-bar]");
  const progTxt = root.querySelector("[data-pp-progress-text]");

  const qrWrap = root.querySelector("[data-pp-qr]");
  const qrTitle = root.querySelector("[data-pp-qr-title]");
  const qrText = root.querySelector("[data-pp-qr-text]");
  const qrCanvas = root.querySelector("[data-pp-qr-canvas]");
  const qrCodeText = root.querySelector("[data-pp-qr-code]");

  const modalEl = root.querySelector("[data-pp-modal]");
  const pinInp = root.querySelector("[data-pp-pin-inp]");
  const modalOk = root.querySelector("[data-pp-modal-ok]");
  const modalCancel = root.querySelector("[data-pp-modal-cancel]");
  const modalClose = root.querySelector("[data-pp-modal-close]");
  const modalTitle = root.querySelector("[data-pp-modal-title]");
  const modalSub = root.querySelector("[data-pp-modal-sub]");
  const modalErr = root.querySelector("[data-pp-modal-err]");

  // ---------- props
  const P = props || {};
  const styles = Array.isArray(P.styles) ? P.styles : [];
  const gridCols = Math.max(1, Math.min(6, num(P.grid_cols, 3)));
  const requirePin = !!P.require_pin;
  const collectMode = str(P.collect_mode, "direct_pin"); // direct_pin | bot_pin (not implemented here)

  const completeShowQr = (P.complete_show_qr === undefined) ? true : !!P.complete_show_qr;
  const completeHideHeader = !!P.complete_hide_header;

  const qrTitleText = str(P.qr_title, "🎁 Получите приз");
  const qrHelpText  = str(P.qr_text, "Покажите этот QR кассиру, чтобы получить подарок.");
  const qrShowCodeText = !!P.qr_show_code_text;

  // QuickChart QR (same as sales_qr_one)
  const qrService = str(P.qr_service, "https://quickchart.io/qr");
  const qrSize = Math.max(180, Math.min(600, Math.round(num(P.qr_size, 260))));
  const qrMargin = Math.max(0, Math.min(10, Math.round(num(P.qr_margin, 2))));

  function getStyleId(st){ return str(st && st.code, "").trim(); }

  // ---------- state
  let state = null;
  let collected = new Set();
  let busy = new Set();

  let selectedStyleId = "";
  let selectedStyleName = "";

  let redeemLink = "";
  let redeemTimer = null;
  let redeemRefreshing = false;

  function isDone(styleId){ return collected.has(styleId); }
  function isComplete(){ return styles.length > 0 && collected.size >= styles.length; }

  function setModalVisible(v){
    if (!modalEl) return;
    modalEl.hidden = !v;
    if (!v){
      if (modalErr){ modalErr.hidden = true; modalErr.textContent = ""; }
      if (pinInp) pinInp.value = "";
    } else {
      setTimeout(()=>{ try{ pinInp && pinInp.focus && pinInp.focus(); }catch(_){ } }, 50);
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
    const done = collected.size;
    const show = total > 0;
    if (progWrap) progWrap.hidden = !show;
    if (!show) return;

    const p = total ? (done / total) : 0;
    if (progBar) progBar.style.width = `${Math.round(p * 100)}%`;
    if (progTxt) progTxt.textContent = `${done}/${total}`;
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
      <button class="pp-card" type="button"
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
        if (isDone(sid)) return;
        if (busy.has(sid)) return;
        await onCollectClick(sid);
      });
    });
  }

  function setQrVisible(v){
    if (!qrWrap) return;
    qrWrap.hidden = !v;
  }

  function renderMode(){
    const done = isComplete();
    if (gridEl) gridEl.hidden = !!(completeShowQr && done);

    if (completeShowQr && done){
      if (completeHideHeader){
        const head = root.querySelector(".pp-head");
        const prog = root.querySelector(".pp-progress");
        if (head) head.style.display = "none";
        if (prog) prog.style.display = "none";
      }
    } else {
      const head = root.querySelector(".pp-head");
      const prog = root.querySelector(".pp-progress");
      if (head) head.style.display = "";
      if (prog) prog.style.display = "";
    }

    renderRedeemQr();
  }

  async function onCollectClick(styleId){
    const st = styles.find(x => getStyleId(x) === styleId) || null;
    selectedStyleId = styleId;
    selectedStyleName = str(st && (st.name || st.title), styleId);

    if (requirePin && collectMode === "direct_pin"){
      if (modalTitle) modalTitle.textContent = "Введите PIN";
      if (modalSub) modalSub.textContent = selectedStyleName ? `Карточка: ${selectedStyleName}` : "";
      setModalVisible(true);
      return;
    }

    await doCollect(styleId, "");
  }

  async function doCollect(styleId, pin){
    busy.add(styleId);
    try{
      haptic("light");
      await apiCollect(styleId, pin || "");
      await refreshState(true);
      haptic("success");
    }catch(e){
      haptic("error");
      const msg = (e && e.payload && (e.payload.error || e.payload.message)) ? (e.payload.error || e.payload.message) : (e && e.message ? e.message : String(e));
      if (modalErr){
        modalErr.hidden = false;
        modalErr.textContent = msg;
      } else {
        await uiAlert(msg);
      }
      throw e;
    }finally{
      busy.delete(styleId);
      renderGrid();
    }
  }

  async function refreshState(silent=false){
    try{
      const st = await apiState();
      applyState(st);
      return st;
    }catch(e){
      if (!silent){
        await uiAlert(e && e.message ? e.message : String(e));
      }
      throw e;
    }
  }

  function applyState(st){
    state = st || {};
    collected = new Set(Array.isArray(state.styles) ? state.styles.map(x=>String(x||"")) : []);
    renderProgress();
    renderGrid();
    renderMode();
  }

  // ---------- Redeem QR (sales_qr_one pattern)
  function buildQrUrlForText(text){
    // quickchart expects "text" param. encode FULL URL for better camera detection.
    const u = `${qrService}?size=${qrSize}&margin=${qrMargin}&text=${encodeURIComponent(String(text||""))}`;
    return u;
  }

  async function paintQrToCanvas(text){
    if (!qrCanvas) return;
    const ctx2 = qrCanvas.getContext("2d");
    if (!ctx2) return;

    const imgUrl = buildQrUrlForText(text);
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise((res, rej)=>{
      img.onload = ()=>res();
      img.onerror = (e)=>rej(e);
      img.src = imgUrl;
    });

    // white bg + draw
    ctx2.clearRect(0,0,qrCanvas.width, qrCanvas.height);
    ctx2.fillStyle = "#ffffff";
    ctx2.fillRect(0,0,qrCanvas.width, qrCanvas.height);

    // fit
    const w = qrCanvas.width;
    const h = qrCanvas.height;
    ctx2.drawImage(img, 0, 0, w, h);
  }

  async function refreshRedeemLink(){
    if (redeemRefreshing) return;
    redeemRefreshing = true;
    try{
      const r = await fetchRedeemToken();
      if (!r || r.ok === false){
        const err = r && r.error ? r.error : "TOKEN_ERROR";
        throw new Error(err);
      }

      // accept multiple shapes like sales_qr_one
      const deep = str(r.deep_link || r.link || "", "").trim();
      const bot = str(r.bot_username || (r.out && r.out.bot_username) || "", "").trim();
      const tok = str(r.token || (r.out && r.out.token) || "", "").trim();

      redeemLink = deep || buildDeepLinkFromToken(bot, tok);

      if (!redeemLink){
        throw new Error("NO_DEEP_LINK");
      }
    } finally {
      redeemRefreshing = false;
    }
  }

  async function renderRedeemQr(){
    const show = completeShowQr && isComplete();
    setQrVisible(show);
    if (!show) {
      stopRedeemTimer();
      return;
    }

    if (qrTitle) qrTitle.textContent = qrTitleText;
    if (qrText) qrText.textContent = qrHelpText;

    try{
      if (!redeemLink){
        await refreshRedeemLink();
      }
      if (qrCodeText){
        if (qrShowCodeText){
          qrCodeText.hidden = false;
          qrCodeText.textContent = redeemLink;
        } else {
          qrCodeText.hidden = true;
          qrCodeText.textContent = "";
        }
      }
      await paintQrToCanvas(redeemLink);
      startRedeemTimer();
    }catch(e){
      stopRedeemTimer();
      const msg = e && e.message ? e.message : String(e);
      if (qrCodeText){
        qrCodeText.hidden = false;
        qrCodeText.textContent = "Ошибка QR: " + msg;
      }
    }
  }

  function startRedeemTimer(){
    if (redeemTimer) return;
    redeemTimer = win.setInterval(async ()=>{
      try{
        redeemLink = "";
        await refreshRedeemLink();
        await paintQrToCanvas(redeemLink);
      }catch(_){}
    }, redeemRefreshSec * 1000);
  }

  function stopRedeemTimer(){
    if (redeemTimer){
      win.clearInterval(redeemTimer);
      redeemTimer = null;
    }
  }

  // ---------- modal wiring
  if (modalCancel) modalCancel.addEventListener("click", ()=>setModalVisible(false));
  if (modalClose) modalClose.addEventListener("click", ()=>setModalVisible(false));

  if (modalOk){
    modalOk.addEventListener("click", async ()=>{
      if (!selectedStyleId) return;
      const pin = pinInp ? String(pinInp.value || "").trim() : "";
      if (requirePin && !pin){
        if (modalErr){ modalErr.hidden = false; modalErr.textContent = "Введите PIN"; }
        return;
      }
      if (modalErr){ modalErr.hidden = true; modalErr.textContent = ""; }
      try{
        modalOk.disabled = true;
        await doCollect(selectedStyleId, pin);
        setModalVisible(false);

        // on complete -> ensure redeem link & qr
        if (isComplete() && completeShowQr){
          redeemLink = "";
          await renderRedeemQr();
        }
      } finally {
        modalOk.disabled = false;
      }
    });
  }

  if (pinInp){
    pinInp.addEventListener("keydown", (e)=>{
      if (e.key === "Enter"){
        e.preventDefault();
        modalOk && modalOk.click();
      }
    });
  }

  // ---------- init
  renderHeader();
  renderGrid();
  renderProgress();
  renderMode();

  try{
    const st = await refreshState(true);
    if (st && isComplete() && completeShowQr){
      await renderRedeemQr();
    }
  }catch(_){}

  return {
    unmount(){
      stopRedeemTimer();
    }
  };
}
