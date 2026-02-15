// beer_bonus_wheel/runtime.js
// Wheel-track (cards) runtime — matches view.html
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

  // ---------- API
  const apiFn =
    (typeof ctx.api === "function") ? ctx.api :
    (typeof win.api === "function") ? win.api :
    null;

  async function apiCall(method, payload = {}) {
    if (apiFn) return await apiFn(method, payload);

    const url = `/api/mini/${method}`;
    const initData = (ctx && ctx.initData) ? ctx.initData : (TG && TG.initData ? TG.initData : "");
    const body = {
      ...payload,
      app_public_id: ctx && ctx.public_id ? String(ctx.public_id) : (payload.app_public_id || ""),
      init_data: initData
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.ok === false) {
      const err = new Error((j && (j.error || j.message)) || `API ${method} failed (${r.status})`);
      err.status = r.status;
      err.payload = j;
      throw err;
    }
    return j;
  }

  // ---------- DOM (MATCHES YOUR view.html)
  const titleEl  = root.querySelector('[data-bw-title]');
  const pillEl   = root.querySelector('[data-picked-pill]');
  const coinsEl  = root.querySelector('[data-coins]');
  const pickedEl = root.querySelector('[data-picked]');
  const wheelEl  = root.querySelector('[data-bonus-wheel]');
  const trackEl  = root.querySelector('[data-wheel-track]');
  const spinBtn  = root.querySelector('[data-spin]');
  const claimBtn = root.querySelector('[data-claim]');
  const rewardsCountEl = root.querySelector('[data-rewards-count]');
  const rewardsListEl = root.querySelector('[data-rewards-list]');

  if (!trackEl || !wheelEl || !spinBtn || !claimBtn) {
    // view.html mismatch
    return () => {};
  }

  // ---------- props
  const title = str(props.title ?? props.h1, "Колесо бонусов");

  // prizes: теперь поддерживаем coins
  const prizes = (Array.isArray(props.prizes) && props.prizes.length)
    ? props.prizes.map(p => ({
        code:  str(p.code, ""),
        name:  str(p.name, ""),
        img:   str(p.img, ""),
        coins: Math.max(0, Math.floor(num(p.coins, 0))),
      }))
    : [];

  if (titleEl) titleEl.textContent = title;

  // ---------- state
  const getMiniState = () => (ctx && ctx.state) ? ctx.state : (win.MiniState || {});
  const getWheelState = () => (getMiniState().wheel || {});
  const getCoins = () => num(getMiniState().coins, 0);

  // актуальная стоимость спина: сначала из MiniState.config.wheel.spin_cost (потому что воркер читает cfg),
  // иначе из props.spin_cost
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

  // minimal escaping helpers
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function escapeAttr(s){ return String(s).replace(/"/g, "&quot;"); }

  // ---------- render prizes into track
  function renderTrack() {
    trackEl.innerHTML = prizes.map(pr => {
      const code = String(pr.code || "");
      const name = String(pr.name || "");
      const img  = String(pr.img || "");
      const coins = Math.max(0, Math.floor(Number(pr.coins || 0)));

      // маленький бейдж монет (если coins>0)
      const badge = coins > 0 ? `<span class="bonus__badge">${coins} 🪙</span>` : '';

      return `
        <button class="bonus" type="button" data-code="${escapeHtml(code)}" data-name="${escapeHtml(name)}">
          ${img ? `<img src="${escapeAttr(img)}" alt="">` : `<div class="bonus__ph" aria-hidden="true"></div>`}
          ${badge}
          <span>${escapeHtml(name)}</span>
        </button>
      `;
    }).join("");
  }

  renderTrack();

  const items = () => Array.from(trackEl.children);
  let N = items().length || 1;

  // ---------- UI helpers
  function setPillIdle() {
    if (!pillEl) return;
    pillEl.classList.add("muted");
    pillEl.textContent = 'Нажми «Крутануть»';
  }

  function setPillByIndex(idx) {
    const its = items();
    if (!its.length || !pillEl) return;
    const it = its[idx];
    const name = it?.dataset?.name || "—";
    const img = it?.querySelector("img")?.src || "";
    pillEl.classList.remove("muted");
    pillEl.innerHTML = img ? `<img src="${escapeAttr(img)}" alt=""><span>${escapeHtml(name)}</span>` : escapeHtml(name);
  }

  function syncCoins() {
    if (coinsEl) coinsEl.textContent = String(getCoins());
  }

  function refreshClaimBtn() {
    const ws = getWheelState();
    const has = !!ws.has_unclaimed;

    if (!has) {
      claimBtn.disabled = true;
      claimBtn.textContent = "Нет приза к выдаче";
      return;
    }

    const rem = num(ws.claim_cooldown_left_ms, 0);
    if (rem <= 0) {
      claimBtn.disabled = false;
      claimBtn.textContent = "Забрать бонус";
      return;
    }

    claimBtn.disabled = true;
    const totalSec = Math.floor(rem / 1000);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    claimBtn.textContent = "Доступно через " + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  // ---------- wheel-track animation
  let STEP = 114; // px between cards, auto-detect below
  let curr = 0;   // float index
  let interacted = false;
  let spinning = false;

  let rewards = [];

  function showRedeemCode(code) {
    const text = `Redeem code: ${code || '—'}`;
    try {
      if (TG && typeof TG.showPopup === "function") {
        TG.showPopup({ title: "Reward code", message: text, buttons: [{ type: "ok" }] });
        return;
      }
    } catch (_) {}
    win.alert(text);
  }

  function renderRewards() {
    if (rewardsCountEl) rewardsCountEl.textContent = String(rewards.length);
    if (!rewardsListEl) return;

    rewardsListEl.innerHTML = rewards.map((reward, idx) => {
      const title = reward && reward.title ? String(reward.title) : `Reward #${idx + 1}`;
      return `
        <div class="bw-reward-item">
          <div class="bw-reward-title">${escapeHtml(title)}</div>
          <button type="button" class="btn bw-reward-btn" data-reward-index="${idx}">Show code</button>
        </div>
      `;
    }).join("");
  }

  async function loadRewards() {
    const r = await apiCall("wheel.rewards", {});
    if (!r || r.ok === false) throw new Error((r && (r.error || r.message)) || "rewards_failed");

    const list = Array.isArray(r.rewards) ? r.rewards : (Array.isArray(r.items) ? r.items : []);
    rewards = list.map((it) => ({
      title: str(it && (it.title || it.name), ""),
      redeem_code: str(it && (it.redeem_code || it.code), ""),
    }));

    renderRewards();
    return rewards;
  }

  const mod = (a, n) => ((a % n) + n) % n;

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
    refreshClaimBtn();

    // lock spin if not enough coins or currently spinning
    const cost = getSpinCost();
    const canSpin = (getCoins() >= cost) && !spinning;

    spinBtn.classList.toggle("is-locked", !canSpin);
    spinBtn.disabled = !canSpin;

    // (опционально) показать стоимость на кнопке
    // если хочешь — раскомментируй
    // spinBtn.textContent = cost > 0 ? `Крутануть за ${cost} 🪙` : 'Крутануть';
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
        if (t - lastPulse >= period) { haptic("light"); lastPulse = t; }

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

  requestAnimationFrame(() => {
    measureStep();
    updateUI();
  });

  // ---------- cooldown ticker (UI only)
  let cdTimer = 0;
  function startCooldownTicker() {
    if (cdTimer) return;
    cdTimer = win.setInterval(() => {
      const st = getMiniState();
      const ws = st.wheel || (st.wheel = {});
      const left = Math.max(0, num(ws.claim_cooldown_left_ms, 0) - 1000);
      ws.claim_cooldown_left_ms = left;
      refreshClaimBtn();
      if (left <= 0) {
        win.clearInterval(cdTimer);
        cdTimer = 0;
        updateUI();
      }
    }, 1000);
  }
  if (num(getWheelState().claim_cooldown_left_ms, 0) > 0) startCooldownTicker();

  // ---------- actions
  async function doSpin() {
    if (spinning) return;

    const costNow = getSpinCost();
    const coins = getCoins();
    if (coins < costNow) {
      haptic("medium");
      if (pillEl) {
        pillEl.classList.remove("muted");
        pillEl.textContent = `Недостаточно монет. Нужно ${costNow} 🪙, у тебя ${coins} 🪙`;
      }
      return;
    }

    spinning = true;
    updateUI();

    const MIN_SPIN_MS = num(props.min_spin_ms, 1600);
    const FINAL_LAPS  = num(props.final_laps, 1);
    const FINAL_DUR   = num(props.final_dur, 1200);

    const startTs = performance.now();

    // free-run while waiting
    let free = true;
    const FREE_RPS = 1;
    const FREE_SPEED = (FREE_RPS * N) / 1000;
    let last = performance.now();
    function freeLoop(now) {
      if (!free) return;
      const dt = now - last; last = now;
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
        // красиво покажем NOT_ENOUGH_COINS
        if (e && (e.status === 409 || e.status === 400) && e.payload && e.payload.error === 'NOT_ENOUGH_COINS') {
          const have = num(e.payload.have, coins);
          const need = num(e.payload.need, costNow);
          if (pillEl) {
            pillEl.classList.remove("muted");
            pillEl.textContent = `Не хватает монет: нужно ${need} 🪙, у тебя ${have} 🪙`;
          }
          haptic("medium");
          return;
        }
        throw e;
      }

      const elapsed = performance.now() - startTs;
      if (elapsed < MIN_SPIN_MS) await new Promise(res => setTimeout(res, MIN_SPIN_MS - elapsed));

      free = false;

      if (!r || r.ok === false) {
        throw new Error((r && (r.error || r.message)) || "spin_failed");
      }

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

      if (num(ws.claim_cooldown_left_ms, 0) > 0) startCooldownTicker();

      await loadRewards();

    } finally {
      spinning = false;
      updateUI();
    }
  }

  async function doClaim() {
    if (spinning) return;
    if (claimBtn.disabled) return;

    spinning = true;
    updateUI();

    try {
      const r = await apiCall("wheel.claim", {});
      if (!r || r.ok === false) throw new Error((r && (r.error || r.message)) || "claim_failed");

      if (r.fresh_state) applyFreshState(r.fresh_state);
      else applyFreshState(r);

      if (pickedEl) pickedEl.textContent = "";
      const ws = getWheelState();
      if (num(ws.claim_cooldown_left_ms, 0) > 0) startCooldownTicker();

      haptic("selection");
    } finally {
      spinning = false;
      updateUI();
    }
  }

  const onSpin = (e) => { e.preventDefault(); doSpin(); };
  const onClaim = (e) => { e.preventDefault(); doClaim(); };
  const onRewardsClick = (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-reward-index]') : null;
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-reward-index'));
    if (!Number.isFinite(idx) || idx < 0 || idx >= rewards.length) return;
    showRedeemCode(rewards[idx].redeem_code);
  };

  spinBtn.addEventListener("click", onSpin);
  claimBtn.addEventListener("click", onClaim);
  rewardsListEl && rewardsListEl.addEventListener("click", onRewardsClick);

  // initial UI
  updateUI();
  loadRewards().catch(() => {});

  // cleanup
  return () => {
    try { cdTimer && win.clearInterval(cdTimer); } catch (_) {}
    spinBtn.removeEventListener("click", onSpin);
    claimBtn.removeEventListener("click", onClaim);
    rewardsListEl && rewardsListEl.removeEventListener("click", onRewardsClick);
  };
}
