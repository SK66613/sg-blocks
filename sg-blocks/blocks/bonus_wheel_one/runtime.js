// bonus_wheel_one/runtime.js
// Wheel-track (cards) runtime — API priority: ctx.api -> window.api -> POST /api/mini/*
// Updated for reward wallet (wheel.rewards). No wheel.claim. No spin blocking by has_unclaimed.

export async function mount(root, props = {}, ctx = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  const TG =
    ctx.tg ||
    (win.Telegram && win.Telegram.WebApp) ||
    (win.parent && win.parent.Telegram && win.parent.Telegram.WebApp) ||
    null;

  // ---------- logging (single-line, low volume)
  function slog(code, extra) {
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
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  // ---------- API
  const apiFn = (typeof ctx.api === "function") ? ctx.api : (typeof win.api === "function") ? win.api : null;

  async function apiCall(method, payload = {}) {
  // если есть ctx.api / window.api — отлично, используем
  if (apiFn) return await apiFn(method, payload);

  // 1) public_id (как у /spin)
  let publicId = "";
  try{
    publicId =
      str(ctx?.public_id || ctx?.publicId || ctx?.app_public_id || ctx?.appPublicId || "") ||
      str(win?.MiniState?.public_id || win?.MiniState?.app_public_id || "") ||
      str(props?.public_id || props?.app_public_id || "");

    if (!publicId){
      const u = new URL(win.location.href);
      publicId = u.searchParams.get("public_id") || "";
    }
  }catch(_){}

  // 2) init_data (в preview TG.initData часто пустой)
  let initData = "";
  try{
    initData =
      str(ctx?.initData || ctx?.init_data || "") ||
      str(win?.SG_INIT_DATA || win?.__SG_INIT_DATA || "") ||
      str(TG?.initData || "");

    if (!initData){
      const u = new URL(win.location.href);
      initData = u.searchParams.get("init_data") || u.searchParams.get("initData") || "";
    }
  }catch(_){}

  // 3) URL + public_id query
  const url = new URL(`/api/mini/${method}`, win.location.origin);
  if (publicId) url.searchParams.set("public_id", publicId);

  // 4) body
  const body = {
    ...payload,
    // на всякий: иногда воркер читает app_public_id из body
    app_public_id: publicId || (payload.app_public_id || ""),
    init_data: initData,
    initData: initData,
  };

  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => null);

  if (!r.ok || !j || j.ok === false) {
    // 👇 полезно для дебага: покажем код/тело ошибки
    slog("sg.wheel.wallet.fail.api", {
      method,
      status: r.status,
      publicId,
      hasInitData: !!initData,
      error: String((j && (j.error || j.message)) || `API ${method} failed (${r.status})`),
    });
    const err = new Error((j && (j.error || j.message)) || `API ${method} failed (${r.status})`);
    err.status = r.status;
    err.payload = j;
    throw err;
  }

  return j;
}


  // ---------- DOM (matches view.html)
  const titleEl = root.querySelector('[data-bw-title]');
  const pillEl = root.querySelector('[data-picked-pill]');
  const coinsEl = root.querySelector('[data-coins]');
  const pickedEl = root.querySelector('[data-picked]');
  const wheelEl = root.querySelector('[data-bonus-wheel]');
  const trackEl = root.querySelector('[data-wheel-track]');
  const spinBtn = root.querySelector('[data-spin]');

  const walletCountEl = root.querySelector('[data-bw-wallet-count]');
  const walletListEl = root.querySelector('[data-bw-wallet-list]');

  const modalEl = root.querySelector('[data-bw-modal]');
  const modalTitleEl = root.querySelector('[data-bw-modal-title]');
  const modalCodeEl = root.querySelector('[data-bw-modal-code]');
  const modalQrEl = root.querySelector('[data-bw-modal-qr]');
  const modalCopyBtn = root.querySelector('[data-bw-copy]');
  const modalCloseEls = root.querySelectorAll('[data-bw-modal-close], [data-bw-modal-close-btn]');

  if (!trackEl || !wheelEl || !spinBtn || !coinsEl || !pillEl || !walletCountEl || !walletListEl || !modalEl) {
    slog("sg.wheel.wallet.fail.render", { error: "view.html mismatch / missing elements" });
    return () => {};
  }

  try {
    if (TG) { TG.ready(); TG.expand(); }
  } catch (_) {}

  // ---------- props
  const title = str(props.title ?? props.h1, "Колесо бонусов");

  // prizes list for visual track
  const prizes = (Array.isArray(props.prizes) && props.prizes.length)
    ? props.prizes.map(p => ({
        code: str(p.code, ""),
        name: str(p.name ?? p.title, ""),
        img: str(p.img, ""),
        coins: Math.max(0, Math.floor(num(p.coins, 0))),
      }))
    : [];

  if (titleEl) titleEl.textContent = title;

  // ---------- state
  const getMiniState = () => (ctx && ctx.state) ? ctx.state : (win.MiniState || {});
  const getWheelState = () => (getMiniState().wheel || {});
  const getCoins = () => num(getMiniState().coins, 0);

  function getSpinCost(){
    const st = getMiniState();
    const fromCfg = num(st?.config?.wheel?.spin_cost, NaN);
    if (Number.isFinite(fromCfg)) return Math.max(0, Math.round(fromCfg));
    const fromProps = num(props.spin_cost ?? props.spin_cost_coins, 10);
    return Math.max(0, Math.round(fromProps));
  }

  function applyFreshState(fresh) {
    if (!fresh) return;
    if (typeof win.applyServerState === "function") {
      win.applyServerState(fresh);
      return;
    }
    win.MiniState = win.MiniState || {};
    for (const k in fresh) win.MiniState[k] = fresh[k];
  }

  // ---------- haptics
  function haptic(level = "light") {
    try {
      if (TG?.HapticFeedback) {
        if (level === "selection") TG.HapticFeedback.selectionChanged();
        else TG.HapticFeedback.impactOccurred(level);
        return;
      }
    } catch (_) {}
    try { win.navigator.vibrate && win.navigator.vibrate(level === "heavy" ? 30 : level === "medium" ? 20 : 12); } catch (_) {}
  }

  // ---------- render prizes into track (cards)
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

  // ---------- UI helpers
  function setPillIdle() {
    pillEl.classList.add("muted");
    pillEl.textContent = 'Нажми «Крутануть»';
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

  // ---------- wheel-track animation
  let STEP = 114; // px between cards, auto-detect
  let curr = 0;   // float index
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

    // IMPORTANT: no has_unclaimed blocking anymore
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

  requestAnimationFrame(() => { measureStep(); updateUI(); });

  // ===== Wallet logic =====
  let rewards = [];
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
    setWalletCount(rewards.length);

    if (!rewards.length){
      walletListEl.innerHTML = `<div class="bw-wallet-empty">Пока нет призов 😌</div>`;
      return;
    }

    walletListEl.innerHTML = rewards.map((r) => {
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
            <div class="bw-wallet-meta">${issuedAt ? `Выдано: ${escapeHtml(issuedAt)}` : ""}</div>
          </div>
          <button class="bw-wallet-get" type="button" data-reward-get>Получить</button>
        </div>
      `;
    }).join("");

    walletListEl.querySelectorAll("[data-reward-get]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const card = ev.currentTarget.closest("[data-reward-id]");
        if (!card) return;
        const code = card.getAttribute("data-reward-code") || "";
        const title = card.getAttribute("data-reward-title") || "Приз";
        const id = card.getAttribute("data-reward-id") || "";
        if (!code) return;
        slog("sg.wheel.wallet.get.open", { id });
        openModal(title, code);
      });
    });
  }

  async function loadRewards(){
    try{
      let r = null;
      try{
        r = await apiCall("wheel.rewards", {});
      }catch(_){
        r = await apiCall("wheel_rewards", {});
      }

      rewards = Array.isArray(r?.rewards) ? r.rewards : [];
      slog("sg.wheel.wallet.ok", { count: rewards.length });
      renderWallet();
    }catch(e){
      rewards = [];
      slog("sg.wheel.wallet.fail.api", { error: String(e && e.message || e) });
      renderWallet();
    }
  }

  function startPolling(){
    if (pollTimer) return;
    pollTimer = win.setInterval(() => loadRewards(), 20000);
    slog("sg.wheel.wallet.poll.start");
  }
  function stopPolling(){
    try{ pollTimer && win.clearInterval(pollTimer); }catch(_){}
    pollTimer = 0;
    slog("sg.wheel.wallet.poll.stop");
  }

  // ===== Modal + QR (reuse if QR library exists globally)
  function clearQr(){
    try{ modalQrEl.innerHTML = ""; }catch(_){}
  }

  function renderQr(code){
    clearQr();
    // Try common libs if present
    try{
      if (win.QRCode) {
        // QRCode(el, text) variants differ; try best-effort
        const box = doc.createElement("div");
        modalQrEl.appendChild(box);
        try{
          // eslint-disable-next-line no-new
          new win.QRCode(box, { text: code, width: 160, height: 160 });
          return;
        }catch(_){}
        try{
          // eslint-disable-next-line no-new
          new win.QRCode(box, code);
          return;
        }catch(_){}
      }
    }catch(_){}

    // fallback: show nothing, code is still visible
  }

  function openModal(title, code){
    openedReward = { title, code };
    modalTitleEl.textContent = title;
    modalCodeEl.textContent = code;
    renderQr(code);
    modalEl.hidden = false;
  }

  function closeModal(){
    modalEl.hidden = true;
    openedReward = null;
    clearQr();
    // refresh after close (in case cashier redeemed quickly)
    loadRewards();
  }

  modalCloseEls.forEach((el) => el.addEventListener("click", closeModal));

  modalCopyBtn.addEventListener("click", async () => {
    const code = openedReward?.code || "";
    if (!code) return;
    try{
      await win.navigator.clipboard.writeText(code);
      slog("sg.wheel.wallet.get.copy.ok");
      try{ TG?.HapticFeedback?.notificationOccurred?.("success"); }catch(_){}
    }catch(e){
      slog("sg.wheel.wallet.get.copy.fail", { error: String(e && e.message || e) });
      try{ win.prompt("Скопируй код:", code); }catch(_){}
    }
  });

  // ---------- actions
  async function doSpin() {
    if (spinning) return;

    const costNow = getSpinCost();
    const coins = getCoins();
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

    // free-run while waiting
    let free = true;
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
    requestAnimationFrame(freeLoop);

    try {
      let r = null;
      try {
        r = await apiCall("wheel.spin", {});
      } catch (e) {
        if (e && (e.status === 409 || e.status === 400) && e.payload && e.payload.error === "NOT_ENOUGH_COINS") {
          const have = num(e.payload.have, coins);
          const need = num(e.payload.need, costNow);
          pillEl.classList.remove("muted");
          pillEl.textContent = `Не хватает монет: нужно ${need}, у тебя ${have}`;
          haptic("medium");
          return;
        }
        throw e;
      }

      const elapsed = performance.now() - startTs;
      if (elapsed < MIN_SPIN_MS) await new Promise(res => setTimeout(res, MIN_SPIN_MS - elapsed));
      free = false;

      if (!r || r.ok === false) throw new Error((r && (r.error || r.message)) || "spin_failed");

      // apply state
      if (r.fresh_state) applyFreshState(r.fresh_state);
      else applyFreshState(r);

      // prize index by code
      const code = (r.prize && r.prize.code) ? String(r.prize.code) : "";
      const its = items();
      let idx = its.findIndex(n => String(n.dataset.code || "") === code);
      if (idx < 0) idx = Math.floor(Math.random() * Math.max(1, its.length));
      await spinTo(idx, FINAL_LAPS, FINAL_DUR);

      const ws = getWheelState();
      if (pickedEl) pickedEl.textContent = ws.last_prize_title ? `Выпало: ${ws.last_prize_title}` : "";

      // refresh wallet after spin
      await loadRewards();

    } finally {
      spinning = false;
      updateUI();
    }
  }

  const onSpin = (e) => { e.preventDefault(); doSpin(); };
  spinBtn.addEventListener("click", onSpin);

  // initial
  updateUI();
  loadRewards();
  startPolling();

  // cleanup
  return () => {
    stopPolling();
    spinBtn.removeEventListener("click", onSpin);
    try { modalEl.hidden = true; } catch (_) {}
  };
}
