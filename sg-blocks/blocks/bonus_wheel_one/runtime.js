// bonus_wheel_one/runtime.js
// Wheel-track runtime — PROD via ctx.api/window.api or /api/mini/*
// Preview/Constructor: DEMO mode (no API, no D1).
//
// ✅ QR like Passport:
// - Bottom sheet (data-bw-sheet) with swipe-to-close + TG BackButton
// - Canvas QR via quickchart.io/qr
// - Deep link: https://t.me/<bot>?start=redeem_<redeem_code> (fallback: redeem_<code>)

export async function mount(root, props = {}, ctx = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  // --- mount guard: prevent double init (duplicate listeners/polling)
  if (root.__sg_bonus_wheel_mounted) {
    try { return root.__sg_bonus_wheel_unmount || (() => {}); } catch (_) {}
  }

  const TG =
    ctx.tg ||
    (win.Telegram && win.Telegram.WebApp) ||
    (win.parent && win.parent.Telegram && win.parent.Telegram.WebApp) ||
    null;

  // ---------- logging
  function slog(code, extra) {
    try { console.log(code, extra || {}); } catch (_) {}
  }

  const DBG = (() => {
    try { return new URL(win.location.href).searchParams.get("dbg") === "1"; } catch (_) { return false; }
  })();
  function dbg(code, extra) {
    if (!DBG) return;
    try { console.log(code, extra || {}); } catch (_) {}
  }

  // ---------- helpers
  const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const str = (v, d = "") => (v === undefined || v === null) ? d : String(v);
  const mod = (a, n) => ((a % n) + n) % n;

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));
  }
  function escapeAttr(s) {
    return String(s ?? "").replace(/"/g, "&quot;");
  }

  // ---------- DEMO detect (IMPORTANT: iframe ≠ demo)
  function isDemoMode() {
    try {
      if (ctx && ctx.demo === true) return true;
      if (props && props.demo === true) return true;

      const u = new URL(String(win.location.href || ""));

      // hard force
      const force = u.searchParams.get("demo");
      if (force === "1") return true;
      if (force === "0") return false;

      const preview = String(u.searchParams.get("preview") || u.searchParams.get("mode") || "");
      if (u.searchParams.get("embed") === "1") return true;
      if (preview.includes("draft")) return true;

      return false;
    } catch (_) {
      return false;
    }
  }
  const DEMO = isDemoMode();
  dbg("sg.wheel.mode", { DEMO });

  // ---------- API
  const apiFn =
    (typeof ctx.api === "function") ? ctx.api :
    (typeof win.api === "function") ? win.api :
    null;

  function resolvePublicId() {
    let pid = str(ctx?.public_id || ctx?.publicId || ctx?.app_public_id || ctx?.appPublicId || "").trim();
    if (pid) return pid;

    pid = str(win?.MiniState?.public_id || win?.MiniState?.app_public_id || "").trim();
    if (pid) return pid;

    pid = str(props?.public_id || props?.app_public_id || "").trim();
    if (pid) return pid;

    try {
      const u = new URL(win.location.href);
      pid = str(u.searchParams.get("public_id") || u.searchParams.get("publicId") || "").trim();
      if (pid) return pid;
    } catch (_) {}

    return "";
  }

  function resolveInitData() {
    let initData =
      str(ctx?.initData || ctx?.init_data || "") ||
      str(win?.SG_INIT_DATA || win?.__SG_INIT_DATA || "") ||
      str(TG?.initData || "");
    if (initData) return initData;

    try {
      const u = new URL(win.location.href);
      initData = u.searchParams.get("init_data") || u.searchParams.get("initData") || "";
      return str(initData);
    } catch (_) {}

    return "";
  }

  async function apiCall(method, payload = {}) {
    if (DEMO) {
      throw Object.assign(new Error("DEMO_MODE_NO_API"), { status: 0, payload: { error: "DEMO_MODE" } });
    }

    // ✅ if your shell defines window.api — USE IT (it already knows API_BASE and tg/initData)
    if (apiFn) return await apiFn(method, payload);

    const publicId = resolvePublicId();
    const initData = resolveInitData();

    // method candidates
    const m0 = String(method || "");
    const methodCandidates = Array.from(new Set([
      m0,
      m0 === "spin" ? "wheel.spin" : m0.replace(/^wheel\./, ""),
      m0 === "spin" ? "wheel_spin" : m0.replace(/\./g, "_"),
    ].filter(Boolean)));

    // url candidates
    function urlForPath(m) {
      const u = new URL(`/api/mini/${m}`, win.location.origin);
      if (publicId) u.searchParams.set("public_id", publicId);
      return u.toString();
    }
    function urlForWheelPath(m) {
      const u = new URL(`/api/mini/wheel/${m}`, win.location.origin);
      if (publicId) u.searchParams.set("public_id", publicId);
      return u.toString();
    }
    function urlForMiniRoot() {
      const u = new URL(`/api/mini`, win.location.origin);
      if (publicId) u.searchParams.set("public_id", publicId);
      return u.toString();
    }

    async function postAny(url, bodyObj) {
      dbg("sg.wheel.api.try", { url, bodyKeys: Object.keys(bodyObj || {}) });
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(bodyObj || {}),
      });

      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const text = await r.text().catch(() => "");
      let j = null;

      if (ct.includes("application/json") || (text && (text[0] === "{" || text[0] === "["))) {
        try { j = JSON.parse(text); } catch (_) { j = null; }
      }

      return { r, j, text };
    }

    function okJson(r, j) {
      return r && r.ok && j && typeof j === "object" && j.ok !== false;
    }

    const baseBody = {
      app_public_id: publicId || (payload.app_public_id || ""),
      public_id: publicId || (payload.public_id || ""),
      init_data: initData,
      initData: initData,
      payload: payload || {},
    };

    const attempts = [];

    for (const m of methodCandidates) {
      // /api/mini/<m>
      {
        const res = await postAny(urlForPath(m), { ...baseBody, ...payload });
        attempts.push({ mode: "path", m, status: res.r.status, ok: res.r.ok, jsonOk: res.j ? res.j.ok : null, head: (res.text || "").slice(0, 120) });
        if (okJson(res.r, res.j)) return res.j;
      }
      // /api/mini/wheel/<m>
      {
        const res = await postAny(urlForWheelPath(m), { ...baseBody, ...payload });
        attempts.push({ mode: "wheel_path", m, status: res.r.status, ok: res.r.ok, jsonOk: res.j ? res.j.ok : null, head: (res.text || "").slice(0, 120) });
        if (okJson(res.r, res.j)) return res.j;
      }
      // /api/mini (body routing)
      {
        const res = await postAny(urlForMiniRoot(), { ...baseBody, type: m, payload: { ...payload } });
        attempts.push({ mode: "body", m, status: res.r.status, ok: res.r.ok, jsonOk: res.j ? res.j.ok : null, head: (res.text || "").slice(0, 120) });
        if (okJson(res.r, res.j)) return res.j;
      }
    }

    slog("sg.wheel.api.fail.all", { origMethod: method, publicId, hasInitData: !!initData, attempts });
    const last = attempts[attempts.length - 1];
    const err = new Error(`API ${String(method)} failed. Last: ${last ? `${last.mode}/${last.m} HTTP ${last.status}` : "no attempts"}`);
    err.status = last ? last.status : 0;
    err.payload = { attempts };
    throw err;
  }

  // ---------- DOM
  const titleEl = root.querySelector('[data-bw-title]');
  const pillEl = root.querySelector('[data-picked-pill]');
  const coinsEl = root.querySelector('[data-coins]');
  const pickedEl = root.querySelector('[data-picked]');
  const trackEl = root.querySelector('[data-wheel-track]');

  // ✅ robust spin button resolve:
  const spinHost = root.querySelector('[data-spin]');
  const spinBtn =
    (spinHost && spinHost.tagName === "BUTTON") ? spinHost :
    (spinHost ? (spinHost.querySelector("button") || spinHost) : null);

  const walletCountEl = root.querySelector('[data-bw-wallet-count]');
  const walletListEl = root.querySelector('[data-bw-wallet-list]');

  // legacy modal (keep for now, but we won't use it for QR anymore)
  const modalEl = root.querySelector('[data-bw-modal]');
  const modalTitleEl = root.querySelector('[data-bw-modal-title]');
  const modalCodeEl = root.querySelector('[data-bw-modal-code]');
  const modalQrEl = root.querySelector('[data-bw-modal-qr]');
  const modalCopyBtn = root.querySelector('[data-bw-copy]');
  const modalCloseEls = root.querySelectorAll('[data-bw-modal-close], [data-bw-modal-close-btn]');

  // ✅ QR bottom sheet (like passport)
  const sheetEl = root.querySelector('[data-bw-sheet]');
  const sheetCloseEls = root.querySelectorAll('[data-bw-sheet-close]');
  const sheetPanel = sheetEl ? sheetEl.querySelector('.bw-sheet-panel') : null;

  const qrTitleEl = root.querySelector('[data-bw-qr-title]');
  const qrTextEl  = root.querySelector('[data-bw-qr-text]');
  const qrCanvas  = root.querySelector('[data-bw-qr-canvas]');
  const qrCodeTextEl = root.querySelector('[data-bw-qr-code]');

  // NOTE: do not "mount" if DOM mismatch
  if (
    !trackEl || !spinBtn || !coinsEl || !pillEl ||
    !walletCountEl || !walletListEl ||
    !modalEl || !modalTitleEl || !modalCodeEl || !modalQrEl || !modalCopyBtn ||
    !sheetEl || !sheetPanel || !qrTitleEl || !qrTextEl || !qrCanvas || !qrCodeTextEl
  ) {
    slog("sg.wheel.fail.render", { error: "view.html mismatch / missing elements" });
    try { root.__sg_bonus_wheel_mounted = false; } catch (_) {}
    try { root.__sg_bonus_wheel_unmount = null; } catch (_) {}
    return () => {};
  }

  // mark mounted ONLY after DOM is valid
  try { root.__sg_bonus_wheel_mounted = true; } catch (_) {}
  try { root.__sg_bonus_wheel_unmount = () => {}; } catch (_) {}

  try { if (TG && !DEMO) { TG.ready(); TG.expand(); } } catch (_) {}

  // ---------- props
  const title = str(props.title ?? props.h1, "Колесо бонусов");
  const prizes = (Array.isArray(props.prizes) && props.prizes.length)
    ? props.prizes.map(p => ({
      code: str(p.code, ""),
      name: str(p.name ?? p.title, ""),
      img: str(p.img, ""),
      coins: Math.max(0, Math.floor(num(p.coins, 0))),
    }))
    : [];

  if (titleEl) titleEl.textContent = title + (DEMO ? " (DEMO)" : "");

  // ---------- state
  const getMiniState = () => (ctx && ctx.state) ? ctx.state : (win.MiniState || {});
  const getWheelState = () => (getMiniState().wheel || {});

  const DEMO_DEFAULT_COINS = Math.max(0, Math.round(num(props.demo_coins, 120)));
  const DEMO_SPIN_COST = Math.max(0, Math.round(num(props.spin_cost ?? props.spin_cost_coins, 10)));
  let demoCoins = DEMO_DEFAULT_COINS;

  function getCoins() {
    return DEMO ? demoCoins : num(getMiniState().coins, 0);
  }
  function getSpinCost() {
    if (DEMO) return DEMO_SPIN_COST;
    const st = getMiniState();
    const fromCfg = num(st?.config?.wheel?.spin_cost, NaN);
    if (Number.isFinite(fromCfg)) return Math.max(0, Math.round(fromCfg));
    const fromProps = num(props.spin_cost ?? props.spin_cost_coins, 10);
    return Math.max(0, Math.round(fromProps));
  }
  function applyFreshState(fresh) {
    if (!fresh || DEMO) return;
    if (typeof win.applyServerState === "function") { win.applyServerState(fresh); return; }
    win.MiniState = win.MiniState || {};
    for (const k in fresh) win.MiniState[k] = fresh[k];
  }

  // --- refresh server state once on mount (to update spin_cost quickly after publish)
  async function refreshStateOnce(){
    if (DEMO) return;
    try{
      const r = await apiCall("state", {});
      if (r && r.ok !== false) {
        if (r.state) applyFreshState(r.state);
        else if (r.fresh_state) applyFreshState(r.fresh_state);
        else if (r.fresh) applyFreshState(r.fresh);
      }
    }catch(_){}
  }

  // ---------- haptics
  function haptic(level = "light") {
    try {
      if (!DEMO && TG?.HapticFeedback) {
        if (level === "selection") TG.HapticFeedback.selectionChanged();
        else TG.HapticFeedback.impactOccurred(level);
        return;
      }
    } catch (_) {}
    try { win.navigator.vibrate && win.navigator.vibrate(level === "heavy" ? 30 : level === "medium" ? 20 : 12); } catch (_) {}
  }

  // ---------- render track
  function renderTrack() {
    trackEl.innerHTML = prizes.map(pr => {
      const code = String(pr.code || "");
      const name = String(pr.name || "");
      const img = String(pr.img || "");
      const coins = Math.max(0, Math.floor(Number(pr.coins || 0)));
      const badge = coins > 0 ? `<div class="badge">${coins} 🪙</div>` : "";
      return `
        <div class="bw-card" data-code="${escapeAttr(code)}" data-name="${escapeAttr(name)}">
          ${img ? `<img src="${escapeAttr(img)}" alt="">` : ``}
          ${badge}
          <div class="name">${escapeHtml(name)}</div>
        </div>
      `;
    }).join("");
  }
  renderTrack();

  const items = () => Array.from(trackEl.children);
  let N = items().length || 1;

  // ---------- UI
  function setPillIdle() {
    pillEl.classList.add("muted");
    pillEl.textContent = DEMO ? 'DEMO: нажми «Крутануть»' : 'Нажми «Крутануть»';
  }
  function setPillByIndex(idx) {
    const its = items();
    if (!its.length) return;
    const it = its[idx];
    const name = it?.dataset?.name || "—";
    pillEl.classList.remove("muted");
    pillEl.innerHTML = escapeHtml(name);
  }
  function syncCoins() { coinsEl.textContent = String(getCoins()); }

  let STEP = 114;
  let curr = 0;
  let interacted = false;
  let spinning = false;

  function measureStep() {
    const its = items();
    if (its.length < 2) return;
    const a = its[0].getBoundingClientRect();
    const b = its[1].getBoundingClientRect();
    const dx = Math.round(b.left - a.left);
    if (dx > 40 && dx < 320) STEP = dx;
  }

  function updateUI() {
    const its = items();
    N = its.length || 1;

    its.forEach((node, i) => {
      let dx = i - curr;
      dx = mod(dx + N / 2, N) - N / 2;
      const x = dx * STEP;
      const s = 1 - Math.min(Math.abs(dx) * 0.16, 0.48);
      node.style.transform = `translate(-50%,-50%) translateX(${x}px) scale(${s})`;
      node.style.zIndex = String(1000 - Math.abs(dx) * 10);
      node.classList.toggle("active", Math.round(Math.abs(dx)) === 0);
    });

    if (interacted) setPillByIndex(mod(Math.round(curr), N));
    else setPillIdle();

    syncCoins();

    const cost = getSpinCost();
    const canSpin = (getCoins() >= cost) && !spinning;
    spinBtn.classList.toggle("is-locked", !canSpin);
    spinBtn.disabled = !canSpin;
  }

  function nearest(currIdx, targetIdx) {
    let t = targetIdx;
    while (t - currIdx > N / 2) t -= N;
    while (currIdx - t > N / 2) t += N;
    return t;
  }

  function spinTo(targetIdx, laps = 1, dur = 1200) {
    return new Promise((resolve) => {
      const base = nearest(curr, targetIdx);
      const dir = (base >= curr ? 1 : -1) || 1;
      const to = base + dir * (laps * N);
      const from = curr;
      const t0 = performance.now();
      let lastPulse = 0;

      function tick(t) {
        const k = Math.min((t - t0) / dur, 1);
        curr = from + (to - from) * (1 - Math.pow(1 - k, 3));
        updateUI();

        const period = 80 + 180 * k;
        if (t - lastPulse >= period) {
          haptic("light");
          lastPulse = t;
        }

        if (k < 1) requestAnimationFrame(tick);
        else {
          curr = to;
          interacted = true;
          updateUI();
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  requestAnimationFrame(() => { measureStep(); });

  // ===== Wallet
  let rewards = [];
  let demoRewards = [];
  let pollTimer = 0;

  function fmtIssuedAt(v){
    if (!v) return "";
    const s = String(v);
    return s.replace("T"," ").replace("Z","").slice(0, 16);
  }
  function setWalletCount(n){
    walletCountEl.textContent = String(Math.max(0, n|0));
  }

  function renderWallet(){
    const list = DEMO ? demoRewards : rewards;
    setWalletCount(list.length);

    if (!list.length){
      walletListEl.innerHTML = `<div class="bw-wallet-empty">${DEMO ? "DEMO: пока нет призов 😌" : "Пока нет призов 😌"}</div>`;
      return;
    }

    walletListEl.innerHTML = list.map((r) => {
      const id = String(r.id ?? "");
      const title = str(r.prize_title ?? r.title ?? "Приз");
      const code = str(r.redeem_code ?? r.code ?? "");
      const img = str(r.img ?? "");
      const issuedAt = fmtIssuedAt(r.issued_at ?? r.issuedAt);

      return `
        <div class="bw-wallet-card"
          data-reward-id="${escapeAttr(id)}"
          data-reward-code="${escapeAttr(code)}"
          data-reward-title="${escapeAttr(title)}">
          <div class="bw-wallet-thumb">${img ? `<img src="${escapeAttr(img)}" alt="">` : ``}</div>
          <div>
            <div class="bw-wallet-name">${escapeHtml(title)}</div>
            <div class="bw-wallet-meta">${issuedAt ? `Выдано: ${escapeHtml(issuedAt)}` : ""}${DEMO ? " · DEMO" : ""}</div>
          </div>
          <button class="bw-wallet-get" type="button" data-reward-get>Получить</button>
        </div>
      `;
    }).join("");

    walletListEl.querySelectorAll("[data-reward-get]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const card = ev.currentTarget.closest("[data-reward-id]");
        if (!card) return;
        const code = card.getAttribute("data-reward-code") || "";
        if (!code) return;

        // ✅ NEW: open bottom sheet QR like passport
        renderQrForReward(code).catch(() => {});
      });
    });
  }

  function demoMakeCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "SG-DEMO-";
    for (let i = 0; i < 8; i++) out += alphabet[(Math.random() * alphabet.length) | 0];
    return out;
  }

  async function loadRewards(){
    if (DEMO) { rewards = []; renderWallet(); return; }

    try{
      let r = null;
      try{
        r = await apiCall("wheel.rewards", {});
      }catch(_){
        r = await apiCall("wheel_rewards", {});
      }

      const list =
        (r && Array.isArray(r.rewards)) ? r.rewards :
        (r && Array.isArray(r.items)) ? r.items :
        (r && Array.isArray(r.list)) ? r.list :
        [];

      rewards = list.map(x => ({
        id: x.id,
        prize_code: x.prize_code,
        prize_title: x.prize_title,
        redeem_code: x.redeem_code,
        status: x.status,
        issued_at: x.issued_at,
        img: x.img || ""
      }));

      renderWallet();
      dbg("sg.wheel.rewards.ok", { n: rewards.length });

    }catch(e){
      dbg("sg.wheel.rewards.fail", { err: String(e?.message || e), payload: e?.payload || null });
      rewards = [];
      renderWallet();
    }
  }

  function startPolling(){
    if (DEMO) return;
    if (pollTimer) return;
    pollTimer = win.setInterval(() => loadRewards(), 20000);
  }
  function stopPolling(){
    try{ pollTimer && win.clearInterval(pollTimer); }catch(_){}
    pollTimer = 0;
  }

  // ===== Legacy Modal (keep, but no longer used for QR)
  function clearQr(){
    try{ modalQrEl.innerHTML = ""; }catch(_){}
  }
  function closeModal(){
    try{ modalEl.hidden = true; }catch(_){}
    clearQr();
  }
  modalCloseEls.forEach((el) => el.addEventListener("click", (ev)=>{
    ev.preventDefault(); ev.stopPropagation();
    closeModal();
  }));
  modalCopyBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const code = str(modalCodeEl && modalCodeEl.textContent, "").trim();
    if (!code) return;
    try{
      await win.navigator.clipboard.writeText(code);
      try{ TG?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
    }catch(_){
      try{ win.prompt("Скопируй код:", code); }catch(_){}
    }
  });

  // ===== QR bottom sheet (Passport-like)
  const qrTitleText = str(props.qr_title, "🎁 Получите приз");
  const qrHelpText  = str(props.qr_text, "Покажите этот QR кассиру, чтобы получить подарок.");
  const qrShowCodeText = !!props.qr_show_code_text;

  const qrService = str(props.qr_service, "https://quickchart.io/qr");
  const qrSize    = Math.max(120, num(props.qr_size, 260));
  const qrMargin  = Math.max(0,   num(props.qr_margin, 2));

  const SWIPE_CLOSE_PX = Math.max(50, num(props.sheet_swipe_close_px, 90));
  const SWIPE_VELOCITY = Math.max(0.3, num(props.sheet_swipe_velocity, 0.6));
  const SWIPE_EDGE_PX  = Math.max(6, num(props.sheet_swipe_edge_px, 6));

  let sheetOpen = false;

  function lockBodyScroll(locked){
    try{
      const b = doc.body;
      if (!b) return;
      if (locked){
        b.dataset.bwSheetLock = "1";
        b.style.overflow = "hidden";
      }else{
        if (b.dataset.bwSheetLock === "1"){
          delete b.dataset.bwSheetLock;
          b.style.overflow = "";
        }
      }
    }catch(_){}
  }

  function tgBackBind(on){
    try{
      if (!TG || !TG.BackButton) return;
      if (on){
        TG.BackButton.show();
        TG.BackButton.onClick(closeSheet);
      }else{
        try{ TG.BackButton.offClick && TG.BackButton.offClick(closeSheet); }catch(_){}
        try{ TG.BackButton.hide(); }catch(_){}
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

    setSheetDragState(false);
    setSheetTranslate(0);

    sheetEl.classList.add("is-open");
    sheetOpen = true;

    lockBodyScroll(true);
    tgBackBind(true);
  }

  function closeSheet(){
    if (!sheetEl) return;
    sheetEl.classList.remove("is-open");
    sheetOpen = false;

    tgBackBind(false);
    lockBodyScroll(false);

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

  // Swipe-to-close (drag down on panel)
  (function setupSheetSwipe(){
    if (!sheetEl || !sheetPanel) return;

    let dragging = false;
    let startY = 0, startX = 0;
    let lastY = 0;
    let startT = 0;

    let gestureLocked = false;
    let isVerticalDrag = false;

    function getY(ev){
      if (ev && ev.touches && ev.touches[0]) return ev.touches[0].clientY;
      if (ev && ev.changedTouches && ev.changedTouches[0]) return ev.changedTouches[0].clientY;
      return ev.clientY;
    }
    function getX(ev){
      if (ev && ev.touches && ev.touches[0]) return ev.touches[0].clientX;
      if (ev && ev.changedTouches && ev.changedTouches[0]) return ev.changedTouches[0].clientX;
      return ev.clientX;
    }

    function canStartDrag(ev){
      const t = ev.target;
      const onHandle = !!(t && t.closest && t.closest(".bw-sheet-handle"));
      if (onHandle) return true;
      const st = sheetPanel.scrollTop || 0;
      return st <= 0;
    }

    function onStart(ev){
      if (!sheetOpen) return;
      if (!canStartDrag(ev)) return;

      const y = getY(ev);
      const x = getX(ev);
      if (!Number.isFinite(y) || !Number.isFinite(x)) return;

      dragging = true;
      gestureLocked = false;
      isVerticalDrag = false;

      startY = y; lastY = y;
      startX = x;
      startT = performance.now();

      setSheetDragState(true);
      sheetPanel.style.willChange = "transform";
    }

    function onMove(ev){
      if (!dragging) return;

      const y = getY(ev);
      const x = getX(ev);
      if (!Number.isFinite(y) || !Number.isFinite(x)) return;

      const dyRaw = y - startY;
      const dxRaw = x - startX;

      if (!gestureLocked){
        const ady = Math.abs(dyRaw);
        const adx = Math.abs(dxRaw);

        if (ady < SWIPE_EDGE_PX && adx < SWIPE_EDGE_PX) return;

        gestureLocked = true;
        isVerticalDrag = (ady > adx * 1.2) && dyRaw > 0;

        if (!isVerticalDrag){
          dragging = false;
          setSheetDragState(false);
          sheetPanel.style.willChange = "";
          return;
        }
      }

      const dy = Math.max(0, dyRaw);
      lastY = y;

      const maxPull = Math.min(420, Math.max(220, sheetPanel.clientHeight * 0.85));
      const damped = dy <= maxPull ? dy : (maxPull + (dy - maxPull) * 0.25);

      setSheetTranslate(damped);

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
      const v = dy / dt;

      sheetPanel.style.willChange = "";
      setSheetDragState(false);

      if (isVerticalDrag && (dy >= SWIPE_CLOSE_PX || v >= SWIPE_VELOCITY)){
        haptic("light");
        closeSheet();
        return;
      }

      setSheetTranslate(0);
    }

    const hasPointer = "PointerEvent" in win;

    if (hasPointer){
      sheetPanel.addEventListener("pointerdown", onStart, { passive:false });
      win.addEventListener("pointermove", onMove, { passive:false });
      win.addEventListener("pointerup", onEnd, { passive:false });
      win.addEventListener("pointercancel", onEnd, { passive:false });
    }else{
      sheetPanel.addEventListener("touchstart", onStart, { passive:false });
      win.addEventListener("touchmove", onMove, { passive:false });
      win.addEventListener("touchend", onEnd, { passive:false });
      win.addEventListener("touchcancel", onEnd, { passive:false });
    }

    win.addEventListener("keydown", (e)=>{
      try{
        if (!sheetOpen) return;
        if (e.key === "Escape") closeSheet();
      }catch(_){}
    });
  })();

  function setQrTextLink(text){
    if (!qrCodeTextEl) return;
    if (qrShowCodeText){
      qrCodeTextEl.hidden = false;
      qrCodeTextEl.textContent = text || "";
    }else{
      qrCodeTextEl.hidden = true;
      qrCodeTextEl.textContent = "";
    }
  }

  function resolveBotUsername(){
    const botRaw =
      (getMiniState() && (getMiniState().bot_username || getMiniState().botUsername)) ||
      (ctx && ctx.state && (ctx.state.bot_username || ctx.state.botUsername)) ||
      (props && (props.bot_username || props.botUsername)) ||
      "";
    return botRaw ? String(botRaw).replace(/^@/,'').trim() : "";
  }

  function getRedeemDeepLinkFromCode(code){
    const c = str(code, "").trim();
    if (!c) return "";
    const bot = resolveBotUsername();
    const startPayload = "redeem_" + c;
    if (bot) return `https://t.me/${bot}?start=${encodeURIComponent(startPayload)}`;
    return startPayload;
  }

  async function renderQrForReward(redeemCode){
    openSheet();

    const link = getRedeemDeepLinkFromCode(redeemCode);
    if (!link){
      if (qrTitleEl) qrTitleEl.textContent = qrTitleText;
      if (qrTextEl)  qrTextEl.textContent  = "Нет redeem_code";
      setQrTextLink("Нет redeem_code");
      return;
    }

    if (qrTitleEl) qrTitleEl.textContent = qrTitleText;
    if (qrTextEl)  qrTextEl.textContent  = qrHelpText;
    setQrTextLink(link);

    if (!qrCanvas) return;

    try{
      qrCanvas.width = qrSize;
      qrCanvas.height = qrSize;
    }catch(_){}

    const ctx2 = qrCanvas.getContext("2d");
    if (!ctx2) return;

    ctx2.fillStyle = "#fff";
    ctx2.fillRect(0,0,qrCanvas.width, qrCanvas.height);

    const qUrl = `${qrService}?size=${qrSize}&margin=${qrMargin}&text=${encodeURIComponent(link)}`;

    await new Promise((resolve)=>{
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = ()=>{ ctx2.drawImage(img, 0, 0, qrCanvas.width, qrCanvas.height); resolve(true); };
      img.onerror = ()=>{
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

  // ---------- main action
  async function doSpin() {
    if (spinning) return;

    const costNow = getSpinCost();
    const coins = getCoins();

    dbg("sg.wheel.spin.pre", { DEMO, coins, costNow, disabled: !!spinBtn.disabled });

    if (coins < costNow) {
      haptic("medium");
      pillEl.classList.remove("muted");
      pillEl.textContent = `Недостаточно монет. Нужно ${costNow}, у тебя ${coins}`;
      return;
    }

    spinning = true;
    updateUI();

    const MIN_SPIN_MS = num(props.min_spin_ms, 1600);
    const FINAL_LAPS = num(props.final_laps, 1);
    const FINAL_DUR = num(props.final_dur, 1200);
    const startTs = performance.now();

    try {
      if (DEMO) {
        await new Promise(r => setTimeout(r, 350 + ((Math.random() * 450) | 0)));
        demoCoins = Math.max(0, demoCoins - costNow);

        const its = items();
        const pickIdx = (Math.random() * Math.max(1, its.length)) | 0;

        const elapsed = performance.now() - startTs;
        if (elapsed < MIN_SPIN_MS) await new Promise(res => setTimeout(res, MIN_SPIN_MS - elapsed));

        await spinTo(pickIdx, FINAL_LAPS, FINAL_DUR);

        const card = its[pickIdx];
        const code = String(card?.dataset?.code || "");
        const title2 = String(card?.dataset?.name || "Приз");

        if (pickedEl) pickedEl.textContent = `Выпало: ${title2}`;

        const pr = prizes.find(p => String(p.code) === code) || {};
        demoRewards.unshift({
          id: String(Date.now()) + "-" + String((Math.random() * 1000) | 0),
          prize_code: code,
          prize_title: title2,
          redeem_code: demoMakeCode(),
          img: pr.img || "",
          issued_at: new Date().toISOString(),
          status: "issued",
        });
        renderWallet();
        return;
      }

      // ✅ PROD spin
      let r = null;
      try {
        r = await apiCall("wheel.spin", {});
      } catch (_) {
        r = await apiCall("spin", {});
      }

      const elapsed = performance.now() - startTs;
      if (elapsed < MIN_SPIN_MS) await new Promise(res => setTimeout(res, MIN_SPIN_MS - elapsed));

      if (!r || r.ok === false) throw new Error((r && (r.error || r.message)) || "spin_failed");

      if (r.fresh_state) applyFreshState(r.fresh_state);

      const prizeCode =
        (r.prize && r.prize.code) ? String(r.prize.code) :
        str(r.prize_code || "", "");

      const its = items();
      let idx = its.findIndex(n => String(n.dataset.code || "") === prizeCode);
      if (idx < 0) idx = Math.floor(Math.random() * Math.max(1, its.length));
      await spinTo(idx, FINAL_LAPS, FINAL_DUR);

      const ws = getWheelState();
      const shownTitle =
        str(ws?.last_prize_title ?? ws?.lastPrizeTitle ?? r?.prize?.title ?? r?.prize_title ?? "", "");
      if (pickedEl) pickedEl.textContent = shownTitle ? `Выпало: ${shownTitle}` : "";

      await loadRewards();
    } finally {
      spinning = false;
      updateUI();
    }
  }

  // ✅ CLICK FIX: single listener (no duplicates) + debounce
  let lastFireAt = 0;

  function onSpinAny(ev){
    try { ev.preventDefault(); } catch(_) {}
    try { ev.stopPropagation(); } catch(_) {}
    try { ev.stopImmediatePropagation && ev.stopImmediatePropagation(); } catch(_) {}

    const now = Date.now();
    if (now - lastFireAt < 400) return;
    lastFireAt = now;

    dbg("sg.wheel.spin.fire", {
      type: ev.type,
      coins: getCoins(),
      cost: getSpinCost(),
      disabled: !!spinBtn.disabled,
      locked: spinBtn.classList.contains("is-locked"),
    });

    doSpin();
  }

  try { spinBtn.style.pointerEvents = "auto"; } catch(_) {}
  spinBtn.addEventListener("pointerdown", onSpinAny, { passive:false });

  // initial
  renderWallet();
  loadRewards();
  startPolling();

  // update spin_cost/config fast after publish
  refreshStateOnce().finally(() => {
    try { updateUI(); } catch (_) {}
  });

  // first paint
  try { updateUI(); } catch (_) {}

  const unmount = () => {
    stopPolling();
    spinBtn.removeEventListener("pointerdown", onSpinAny);

    // close legacy modal
    try { modalEl.hidden = true; } catch (_) {}

    // close sheet
    try { closeSheet(); } catch (_) {}

    try { root.__sg_bonus_wheel_mounted = false; } catch (_) {}
    try { root.__sg_bonus_wheel_unmount = null; } catch (_) {}
  };

  try { root.__sg_bonus_wheel_unmount = unmount; } catch (_) {}
  return unmount;
}
