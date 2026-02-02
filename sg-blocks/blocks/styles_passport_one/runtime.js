// stylesPassport/runtime.js
// Passport (stamps/collection) — SG blocks format.
// Works with legacy window.api('style.collect', payload) AND with fetch fallback to /api/mini/*?public_id=...
// Completion QR: like sales_qr_one — build https://t.me/<bot>?start=redeem_<token> (or use deep_link from server),
// then render QR via quickchart into canvas.

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

  const publicId =
    str(ctx.publicId || ctx.public_id || ctx.publicID, "").trim() ||
    str(props.app_public_id || props.public_id || props.publicId, "").trim() ||
    str(win.SG_APP_PUBLIC_ID || win.APP_PUBLIC_ID, "").trim();

  async function apiCall(pathSeg, body = {}) {
    if (apiFn) return await apiFn(pathSeg, body);

    if (!publicId) return { ok:false, error:"NO_PUBLIC_ID" };

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
      app_public_id: publicId
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`API ${pathSeg} failed (${r.status})`);
    if (j.ok === false) throw new Error(String(j.error || j.message || "API_ERROR"));
    return j;
  }

  // worker supports /api/mini/state and /api/mini/style.collect
  async function apiState(){ return await apiCall("state", {}); }
  async function apiCollect(style_id, pin){ return await apiCall("style.collect", { style_id, pin }); }

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

  const qrWrap   = root.querySelector("[data-pp-qr]");
  const qrTitle  = root.querySelector("[data-pp-qr-title]");
  const qrText   = root.querySelector("[data-pp-qr-text]");
  const qrCanvas = root.querySelector("[data-pp-qr-canvas]");
  const qrCodeText = root.querySelector("[data-pp-qr-code]");

  const modalEl    = root.querySelector("[data-pp-modal]");
  const pinInp     = root.querySelector("[data-pp-pin-inp]");
  const modalOk    = root.querySelector("[data-pp-modal-ok]");
  const modalCancel= root.querySelector("[data-pp-modal-cancel]");
  const modalClose = root.querySelector("[data-pp-modal-close]");
  const modalTitle = root.querySelector("[data-pp-modal-title]");
  const modalSub   = root.querySelector("[data-pp-modal-sub]");
  const modalErr   = root.querySelector("[data-pp-modal-err]");

  // ---------- props
  const P = props || {};
  const styles = Array.isArray(P.styles) ? P.styles : [];

  const gridCols   = Math.max(1, Math.min(6, num(P.grid_cols, 3)));
  const requirePin = !!P.require_pin;
  const collectMode= str(P.collect_mode, "direct_pin"); // direct_pin | bot_pin

  const btnCollect = str(P.btn_collect, "Отметить");
  const btnDone    = str(P.btn_done, "Получено");

  // Completion -> QR view (simple like sales_qr_one)
  const completeShowQr    = (P.complete_show_qr === undefined) ? true : !!P.complete_show_qr;
  const completeHideHeader= !!P.complete_hide_header;

  const qrTitleText = str(P.qr_title, "🎁 Получите приз");
  const qrHelpText  = str(P.qr_text, "Покажите этот QR кассиру, чтобы получить подарок.");
  const qrShowCodeText = !!P.qr_show_code_text;

  // redeem token endpoint (worker side)
  const redeemStartPrefix = str(P.redeem_start_prefix, "redeem_"); // inside /start
  const redeemTtlSec      = Math.max(30, num(P.redeem_ttl_sec, 600));
  const redeemRefreshSec  = Math.max(0,  num(P.redeem_refresh_sec, 0)); // 0 disables auto refresh
  const redeemTokenPathTpl= str(P.redeem_token_path, "/api/public/app/{publicId}/redeem/token");

  // QR image service (same approach as sales_qr_one)
  const qrService = str(P.qr_service, "https://quickchart.io/qr");
  const qrSize    = Math.max(120, num(P.qr_size, 260));
  const qrMargin  = Math.max(0,   num(P.qr_margin, 2));

  function getStyleId(st){ return str(st && st.code, "").trim(); }

  // ---------- state
  let state = null;
  let collected = new Set();
  let busy = new Set();
  let selectedStyleId = "";
  let selectedStyleName = "";

  // redeem link cached
  let redeemLink = "";
  let redeemTimer = null;

  function normalizeCollected(st){
    const out = new Set();
    if (!st) return out;

    // common variants
    const candidates = [
      st.styles,
      st.collected,
      st.stamps,
      st.done_styles,
      st.styles_done,
      st.collected_styles,
      st.styles_collected,
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

    // map/object form: { day1:true, day2:true }
    const map = st.styles_map || st.collected_map || st.stamps_map;
    if (map && typeof map === "object"){
      for (const k of Object.keys(map)){
        if (map[k]) out.add(String(k));
      }
    }

    return out;
  }

  function isDone(styleId){ return collected.has(String(styleId)); }
  function isComplete(){
    const total = styles.length;
    return total > 0 && collected.size >= total;
  }

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

    const p = total ? clamp01(done/total) : 0;
    if (progBar) progBar.style.width = `${Math.round(p*100)}%`;
    if (progTxt) progTxt.textContent = `${done}/${total}`;
  }

  function renderReward(){
    if (!rewardWrap) return;
    const en = (P.reward_enabled === undefined) ? true : !!P.reward_enabled;
    const show = en && isComplete();

    rewardWrap.hidden = !show;
    if (!show) return;

    if (rewardTitle) rewardTitle.textContent = str(P.reward_title, "🎁 Приз");
    if (rewardText) rewardText.textContent = str(P.reward_text, "");

    // if server returned redeem_code (legacy), show it
    const pr = state && state.passport_reward ? state.passport_reward : null;
    const redeem = pr && pr.redeem_code ? String(pr.redeem_code) : "";
    if (rewardCode){
      if (redeem){
        rewardCode.hidden = false;
        rewardCode.textContent = redeem;
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

    return `
      <button class="pp-card" type="button"
        data-sid="${escapeHtml(sid)}"
        data-done="${done ? 1 : 0}"
        ${disabled ? "disabled" : ""}>
        <div class="pp-badge">${escapeHtml(done ? "✓" : String(idx+1))}</div>
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

  function setQrTextLink(link){
    if (qrCodeText){
      if (qrShowCodeText){
        qrCodeText.hidden = false;
        qrCodeText.textContent = link || "";
      } else {
        qrCodeText.hidden = true;
        qrCodeText.textContent = "";
      }
    }
  }

  async function fetchRedeemLink(){
    if (!publicId) throw new Error("NO_PUBLIC_ID");

    const initData =
      (ctx && (ctx.initData || ctx.init_data)) ? (ctx.initData || ctx.init_data) :
      (TG && TG.initData ? TG.initData : "");

    const url = redeemTokenPathTpl.replace("{publicId}", encodeURIComponent(publicId));
    const payload = { init_data: initData, ttl_sec: redeemTtlSec };

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type":"application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(()=>null);
    if (!r.ok || !j) throw new Error(`redeem/token HTTP ${r.status}`);
    if (j.ok === false) throw new Error(String(j.error || j.message || "redeem/token error"));

    // support {result:{...}} and direct
    const d = j.result || j;

    if (d.deep_link) return String(d.deep_link);
    const bot = d.bot_username ? String(d.bot_username).replace(/^@/,'') : "";
    const token = d.token ? String(d.token) : "";
    if (bot && token) return `https://t.me/${bot}?start=${encodeURIComponent(redeemStartPrefix + token)}`;

    throw new Error("redeem/token missing deep_link or bot_username+token");
  }

  async function renderQr(){
    if (!qrWrap) return;
    if (!completeShowQr || !isComplete()){
      setQrVisible(false);
      return;
    }

    setQrVisible(true);
    if (qrTitle) qrTitle.textContent = qrTitleText;
    if (qrText) qrText.textContent = qrHelpText;

    // ensure link
    try{
      redeemLink = await fetchRedeemLink();
    }catch(e){
      // show fallback text
      const msg = e && e.message ? e.message : String(e);
      setQrTextLink("QR: ошибка токена ("+msg+")");
      return;
    }

    setQrTextLink(redeemLink);

    // draw via quickchart like sales_qr_one
    if (!qrCanvas) return;
    const canvas = qrCanvas;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;

    // clear
    ctx2.clearRect(0,0,canvas.width,canvas.height);

    const qUrl = `${qrService}?size=${qrSize}&margin=${qrMargin}&text=${encodeURIComponent(redeemLink)}`;

await new Promise((resolve)=>{
  const img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = ()=>{
    const w = canvas.width, h = canvas.height;
    ctx2.fillStyle = "#fff";
    ctx2.fillRect(0,0,w,h);
    ctx2.drawImage(img, 0, 0, w, h);
    resolve(true);
  };

  img.onerror = ()=>{
    // fallback: рисуем хотя бы текст, чтобы видно было, что QR режим включился
    const w = canvas.width, h = canvas.height;
    ctx2.fillStyle = "#fff";
    ctx2.fillRect(0,0,w,h);
    ctx2.fillStyle = "#000";
    ctx2.font = "12px ui-monospace, Menlo, Consolas, monospace";
    const txt = "QR load error";
    ctx2.fillText(txt, 10, 20);
    resolve(false);
  };

  img.src = qUrl;
});

  }

  async function renderMode(){
    const done = isComplete();

    if (gridEl) gridEl.hidden = !!(completeShowQr && done);

    if (completeShowQr && done){
      if (completeHideHeader){
        const head = root.querySelector(".pp-head");
        const prog = root.querySelector(".pp-progress");
        if (head) head.style.display = "none";
        if (prog) prog.style.display = "none";
      }
      await renderQr();
    } else {
      const head = root.querySelector(".pp-head");
      const prog = root.querySelector(".pp-progress");
      if (head) head.style.display = "";
      if (prog) prog.style.display = "";
      setQrVisible(false);
    }
  }

  function parseStateFromResponse(j){
    if (!j) return null;
    // many workers wrap {ok:true, state:{...}}
    const st = (j.state || j.fresh_state || j.fresh || j.data || j.result) ? (j.state || j.fresh_state || j.fresh || j.data || j.result) : j;
    return st;
  }

  async function refreshFromServer(){
    const j = await apiState();
    const st = parseStateFromResponse(j);
    applyState(st);
  }

function applyState(st){
  state = st || {};
  collected = normalizeCollected(state);
  renderProgress();
  renderReward();
  renderGrid();
  // важно: если паспорт complete — показать QR режим
  renderMode().catch(()=>{});
}


  async function collectDirectPin(styleId, pin){
    const res = await apiCollect(styleId, pin);
    const st = parseStateFromResponse(res && (res.fresh_state || res.state || res.result || res));
    if (st) applyState(st);
    else await refreshFromServer();
  }

  async function collectNoPin(styleId){
    const res = await apiCollect(styleId, "");
    const st = parseStateFromResponse(res && (res.fresh_state || res.state || res.result || res));
    if (st) applyState(st);
    else await refreshFromServer();
  }

  async function collectBotPin(styleId){
    await uiAlert("⚠️ Режим bot_pin пока не включён в воркере. Используй direct_pin (модалка).");
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
          return;
        } else {
          await collectBotPin(styleId);
        }
      } else {
        await collectNoPin(styleId);
      }

      // completion mode
      await renderMode();
      haptic("success");
    } catch (e) {
      haptic("error");
      const msg = e && e.message ? e.message : String(e);
      await uiAlert(msg);
    } finally {
      busy.delete(styleId);
      renderGrid();
    }
  }

  // ---------- modal wiring
  if (modalCancel) modalCancel.addEventListener("click", ()=>setModalVisible(false));
  if (modalClose) modalClose.addEventListener("click", ()=>setModalVisible(false));

  if (modalOk){
    modalOk.addEventListener("click", async ()=>{
      if (!selectedStyleId) return;
      const pin = pinInp ? String(pinInp.value||"").trim() : "";
      if (requirePin && !pin){
        if (modalErr){ modalErr.hidden = false; modalErr.textContent = "Введите PIN"; }
        return;
      }
      if (modalErr){ modalErr.hidden = true; modalErr.textContent = ""; }

      modalOk.disabled = true;
      try{
        await collectDirectPin(selectedStyleId, pin);
        setModalVisible(false);
        await renderMode();
        haptic("success");
      } catch (e){
        const msg = e && e.message ? e.message : String(e);
        if (modalErr){ modalErr.hidden = false; modalErr.textContent = msg; }
        else await uiAlert(msg);
        haptic("error");
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
  renderReward();
  setQrVisible(false);

  // initial server state
  try{
    await refreshFromServer();
    await renderMode();

    // auto refresh redeem QR if enabled
    if (redeemRefreshSec > 0){
      redeemTimer = setInterval(async ()=>{
        if (!isComplete()) return;
        try{ await renderQr(); }catch(_){}
      }, redeemRefreshSec * 1000);
    }
  }catch(_){
    // ignore in studio preview
  }

  // cleanup
  return () => {
    try{ redeemTimer && clearInterval(redeemTimer); }catch(_){}
  };
}
