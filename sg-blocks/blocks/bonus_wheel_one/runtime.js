// bonus_wheel_one/runtime.js
// Wheel-track runtime — PROD via ctx.api/window.api or /api/mini/*
// Preview/Constructor: DEMO mode (no API, no D1).

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
  // sometimes data-spin is on wrapper, sometimes on the <button>
  const spinHost = root.querySelector('[data-spin]');
  const spinBtn =
    (spinHost && spinHost.tagName === "BUTTON") ? spinHost :
    (spinHost ? (spinHost.querySelector("button") || spinHost) : null);

  const walletCountEl = root.querySelector('[data-bw-wallet-count]');
  const walletListEl = root.querySelector('[data-bw-wallet-list]');

  const modalEl = root.querySelector('[data-bw-modal]');
  const modalTitleEl = root.querySelector('[data-bw-modal-title]');
  const modalCodeEl = root.querySelector('[data-bw-modal-code]');
  const modalQrEl = root.querySelector('[data-bw-modal-qr]');
  const modalCopyBtn = root.querySelector('[data-bw-copy]');
  const modalCloseEls = root.querySelectorAll('[data-bw-modal-close], [data-bw-modal-close-btn]');

  // NOTE: do not "mount" if DOM mismatch
  if (!trackEl || !spinBtn || !coinsEl || !pillEl || !walletCountEl || !walletListEl || !modalEl || !modalTitleEl || !modalCodeEl || !modalQrEl || !modalCopyBtn) {
    slog("sg.wheel.fail.render", { error: "view.html mismatch / missing elements" });
    try { root.__sg_bonus_wheel_mounted = false; } catch (_) {}
    try { root.__sg_bonus_wheel_unmount = null; } catch (_) {}
    return () => {};
  }

  // mark mounted ONLY after DOM is valid
  try { root.__sg_bonus_wheel_mounted = true; } catch (_) {}

  // set placeholder unmount immediately (so guard has something to return even if later throws)
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
  let openedReward = null;

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
        <div class="bw-wallet-card" data-reward-id="${escapeAttr(id)}" data-reward-code="${escapeAttr(code)}" data-reward-title="${escapeAttr(title)}">
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
        const title = card.getAttribute("data-reward-title") || "Приз";
        if (!code) return;
        openModal(title, code);
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

  // ===== Modal + QR
  function clearQr(){
    try{ modalQrEl.innerHTML = ""; }catch(_){}
  }
  function renderQr(code){
    clearQr();
    try{
      if (win.QRCode) {
        const box = doc.createElement("div");
        modalQrEl.appendChild(box);
        try { new win.QRCode(box, { text: code, width: 160, height: 160 }); return; } catch (_) {}
        try { new win.QRCode(box, code); return; } catch (_) {}
      }
    }catch(_){}
  }
  function openModal(title, code){
    openedReward = { title, code };
    modalTitleEl.textContent = title + (DEMO ? " (DEMO)" : "");
    modalCodeEl.textContent = code;
    renderQr(code);
    modalEl.hidden = false;
  }
  function closeModal(){
    modalEl.hidden = true;
    openedReward = null;
    clearQr();
    loadRewards();
  }
  modalCloseEls.forEach((el) => el.addEventListener("click", (ev)=>{ ev.preventDefault(); ev.stopPropagation(); closeModal(); }));

  modalCopyBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const code = openedReward?.code || "";
    if (!code) return;
    try{
      await win.navigator.clipboard.writeText(code);
      try{ TG?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
    }catch(_){
      try{ win.prompt("Скопируй код:", code); }catch(_){}
    }
  });

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

   /* let free = true;
   const FREE_RPS = 1;
   const FREE_SPEED = (FREE_RPS * N) / 1000;
    let last = performance.now();

    function freeLoop(now) {
      if (!free) return;
      const dt = now - last;
      last = now;
      curr = mod(curr + FREE_SPEED * dt, N);
      updateUI();
      requestAnimationFrame(freeLoop);
    }
    requestAnimationFrame(freeLoop); */

    try {
      if (DEMO) {
        await new Promise(r => setTimeout(r, 350 + ((Math.random() * 450) | 0)));
        demoCoins = Math.max(0, demoCoins - costNow);

        const its = items();
        const pickIdx = (Math.random() * Math.max(1, its.length)) | 0;

        const elapsed = performance.now() - startTs;
        if (elapsed < MIN_SPIN_MS) await new Promise(res => setTimeout(res, MIN_SPIN_MS - elapsed));
        // free = false;

        await spinTo(pickIdx, FINAL_LAPS, FINAL_DUR);

        const card = its[pickIdx];
        const code = String(card?.dataset?.code || "");
        const title = String(card?.dataset?.name || "Приз");

        if (pickedEl) pickedEl.textContent = `Выпало: ${title}`;

        const pr = prizes.find(p => String(p.code) === code) || {};
        demoRewards.unshift({
          id: String(Date.now()) + "-" + String((Math.random() * 1000) | 0),
          prize_code: code,
          prize_title: title,
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
      // free = false;

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

  // also do first paint immediately (even before state comes)
  try { updateUI(); } catch (_) {}

  const unmount = () => {
    stopPolling();
    spinBtn.removeEventListener("pointerdown", onSpinAny);
    try { modalEl.hidden = true; } catch (_) {}

    try { root.__sg_bonus_wheel_mounted = false; } catch (_) {}
    try { root.__sg_bonus_wheel_unmount = null; } catch (_) {}
  };

  try { root.__sg_bonus_wheel_unmount = unmount; } catch (_) {}
  return unmount;
}
