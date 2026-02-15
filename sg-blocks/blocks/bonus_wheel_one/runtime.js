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
  const fmtDate = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
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
  const titleEl = root.querySelector('[data-bw-title]');
  const pillEl = root.querySelector('[data-picked-pill]');
  const coinsEl = root.querySelector('[data-coins]');
  const pickedEl = root.querySelector('[data-picked]');
  const wheelEl = root.querySelector('[data-bonus-wheel]');
  const trackEl = root.querySelector('[data-wheel-track]');
  const spinBtn = root.querySelector('[data-spin]');
  const claimBtn = root.querySelector('[data-claim]');
  const rewardsTitleEl = root.querySelector('[data-rewards-title]');
  const rewardsListEl = root.querySelector('[data-rewards-list]');

  if (!trackEl || !wheelEl || !spinBtn || !rewardsListEl || !rewardsTitleEl) {
    return () => {};
  }

  // ---------- props
  const title = str(props.title ?? props.h1, "Колесо бонусов");

  const prizes = (Array.isArray(props.prizes) && props.prizes.length)
    ? props.prizes.map(p => ({
      code: str(p.code, ""),
      name: str(p.name, ""),
      img: str(p.img, ""),
      coins: Math.max(0, Math.floor(num(p.coins, 0))),
    }))
    : [];

  if (titleEl) titleEl.textContent = title;
  if (claimBtn) claimBtn.hidden = true;

  // ---------- state
  const getMiniState = () => (ctx && ctx.state) ? ctx.state : (win.MiniState || {});
  const getWheelState = () => (getMiniState().wheel || {});
  const getCoins = () => num(getMiniState().coins, 0);

  const state = {
    rewards: [],
    rewardsCount: 0,
    loadingRewards: false,
  };

  function getSpinCost() {
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

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

  function renderTrack() {
    trackEl.innerHTML = prizes.map(pr => {
      const code = String(pr.code || "");
      const name = String(pr.name || "");
      const img = String(pr.img || "");
      const coins = Math.max(0, Math.floor(Number(pr.coins || 0)));
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
  let STEP = 114;
  let curr = 0;
  let interacted = false;
  let spinning = false;
  let rewardsPollingTimer = 0;
  let isBlockVisible = true;
  let visibilityObserver = null;

  const mod = (a, n) => ((a % n) + n) % n;

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

  function measureStep() {
    const its = items();
    if (its.length < 2) return;
    const a = its[0].getBoundingClientRect();
    const b = its[1].getBoundingClientRect();
    const dx = Math.round(b.left - a.left);
    if (dx > 40 && dx < 320) STEP = dx;
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

  function getRewardCode(rw) {
    return str(rw?.redeem_code || rw?.code || "");
  }

  function renderRewards() {
    const count = num(state.rewardsCount, state.rewards.length);
    rewardsTitleEl.textContent = `Your rewards (${count})`;

    if (!state.rewards.length) {
      rewardsListEl.innerHTML = '<div class="bonus-rewards__empty">No rewards yet. Spin the wheel!</div>';
      return;
    }

    rewardsListEl.innerHTML = state.rewards.map((rw) => {
      const titleText = escapeHtml(str(rw?.prize_title, "Reward"));
      const img = str(rw?.img, "");
      const issued = fmtDate(rw?.issued_at);
      const code = escapeHtml(getRewardCode(rw));
      const idAttr = escapeAttr(str(rw?.id, ""));

      return `
        <article class="bonus-reward" data-reward-id="${idAttr}">
          ${img ? `<img class="bonus-reward__thumb" src="${escapeAttr(img)}" alt="">` : '<div class="bonus-reward__thumb is-ph" aria-hidden="true"></div>'}
          <div class="bonus-reward__body">
            <div class="bonus-reward__title">${titleText}</div>
            ${issued ? `<div class="bonus-reward__meta">Issued: ${escapeHtml(issued)}</div>` : ''}
            ${code ? `<div class="bonus-reward__meta">Code: ${code}</div>` : ''}
          </div>
          <button type="button" class="btn bonus-reward__get" data-get-reward="${idAttr}">Get</button>
        </article>
      `;
    }).join("");
  }

  async function loadRewards() {
    if (state.loadingRewards) return;
    state.loadingRewards = true;
    try {
      let res;
      try {
        res = await apiCall("wheel.rewards", {});
      } catch (e) {
        res = await apiCall("wheel_rewards", {});
      }
      const rewards = Array.isArray(res?.rewards) ? res.rewards : [];
      state.rewards = rewards;
      state.rewardsCount = num(res?.rewards_count, rewards.length);
      renderRewards();
    } catch (_) {
      state.rewards = [];
      state.rewardsCount = 0;
      renderRewards();
    } finally {
      state.loadingRewards = false;
    }
  }

  async function copyCode(code, fallbackInput) {
    if (!code) return false;
    try {
      if (win.navigator?.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(code);
        return true;
      }
    } catch (_) {}

    try {
      if (fallbackInput) {
        fallbackInput.focus();
        fallbackInput.select();
        fallbackInput.setSelectionRange(0, fallbackInput.value.length);
        return doc.execCommand && doc.execCommand("copy");
      }
    } catch (_) {}
    return false;
  }

  function showRewardModal(reward) {
    const code = getRewardCode(reward);

    return new Promise((resolve) => {
      const close = () => {
        overlay.remove();
        resolve();
      };

      const overlay = doc.createElement("div");
      overlay.className = "bonus-modal";
      overlay.innerHTML = `
        <div class="bonus-modal__backdrop" data-close-modal></div>
        <div class="bonus-modal__card" role="dialog" aria-modal="true">
          <div class="bonus-modal__title">${escapeHtml(str(reward?.prize_title, "Reward"))}</div>
          <div class="bonus-modal__code-wrap">
            <div class="bonus-modal__label">Redeem code</div>
            <input class="bonus-modal__code" value="${escapeAttr(code)}" readonly>
          </div>
          <div class="bonus-modal__qr">QR placeholder</div>
          <div class="bonus-modal__actions">
            <button type="button" class="btn" data-copy-code>Copy code</button>
            <button type="button" class="btn primary" data-close-modal>Close</button>
          </div>
        </div>
      `;

      const codeInput = overlay.querySelector('.bonus-modal__code');
      const copyBtn = overlay.querySelector('[data-copy-code]');

      overlay.addEventListener('click', (e) => {
        const target = e.target;
        if (target instanceof Element && target.hasAttribute('data-close-modal')) close();
      });

      copyBtn?.addEventListener('click', async () => {
        const copied = await copyCode(code, codeInput);
        if (copyBtn) copyBtn.textContent = copied ? 'Copied' : 'Copy failed';
      });

      root.appendChild(overlay);
    });
  }

  async function showRewardPopup(reward) {
    if (typeof TG?.showPopup === "function") {
      await new Promise((resolve) => {
        TG.showPopup({
          title: str(reward?.prize_title, "Reward"),
          message: `Code: ${getRewardCode(reward)}\nQR: placeholder`,
          buttons: [
            { id: "copy", type: "default", text: "Copy code" },
            { id: "close", type: "close", text: "Close" },
          ]
        }, async (buttonId) => {
          if (buttonId === "copy") {
            await copyCode(getRewardCode(reward));
          }
          resolve();
        });
      });
      return;
    }
    await showRewardModal(reward);
  }

  async function onRewardsClick(e) {
    const btn = e.target instanceof Element ? e.target.closest('[data-get-reward]') : null;
    if (!btn) return;
    const rewardId = btn.getAttribute('data-get-reward');
    const reward = state.rewards.find((rw) => str(rw?.id, "") === rewardId);
    if (!reward) return;

    await showRewardPopup(reward);
    await loadRewards();
  }

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
    const FINAL_LAPS = num(props.final_laps, 1);
    const FINAL_DUR = num(props.final_dur, 1200);

    const startTs = performance.now();

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

      if (r.fresh_state) applyFreshState(r.fresh_state);
      else applyFreshState(r);

      const code = (r.prize && r.prize.code) ? String(r.prize.code) : "";
      const its = items();
      let idx = its.findIndex(n => String(n.dataset.code || "") === code);
      if (idx < 0) idx = Math.floor(Math.random() * Math.max(1, its.length));

      await spinTo(idx, FINAL_LAPS, FINAL_DUR);

      const ws = getWheelState();
      if (pickedEl) pickedEl.textContent = ws.last_prize_title ? `Выпало: ${ws.last_prize_title}` : "";

      await loadRewards();
    } finally {
      spinning = false;
      updateUI();
    }
  }

  function startRewardsPolling() {
    if (rewardsPollingTimer) return;
    rewardsPollingTimer = win.setInterval(() => {
      if (doc.visibilityState === 'hidden') return;
      if (!isBlockVisible) return;
      loadRewards();
    }, 20000);
  }

  function stopRewardsPolling() {
    if (!rewardsPollingTimer) return;
    win.clearInterval(rewardsPollingTimer);
    rewardsPollingTimer = 0;
  }

  if (typeof win.IntersectionObserver === 'function') {
    visibilityObserver = new win.IntersectionObserver((entries) => {
      const ent = entries && entries[0];
      isBlockVisible = !!(ent && ent.isIntersecting);
    }, { threshold: 0.05 });
    visibilityObserver.observe(root);
  }

  const onSpin = (e) => { e.preventDefault(); doSpin(); };

  spinBtn.addEventListener("click", onSpin);
  rewardsListEl.addEventListener("click", onRewardsClick);

  requestAnimationFrame(() => {
    measureStep();
    updateUI();
  });

  renderRewards();
  await loadRewards();
  updateUI();
  startRewardsPolling();

  return () => {
    stopRewardsPolling();
    visibilityObserver?.disconnect();
    spinBtn.removeEventListener("click", onSpin);
    rewardsListEl.removeEventListener("click", onRewardsClick);
  };
}
