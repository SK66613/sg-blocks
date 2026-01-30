// beer_bonus_wheel/runtime.js
// SG block runtime (Telegram mini-app friendly)
// - Uses ctx.api if provided, else falls back to POST /api/mini/<method>
// - Scoped DOM + removable listeners

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
  const clamp01 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  };
  const str = (v, d = "") => (v === undefined || v === null) ? d : String(v);

  // Minimal safe API wrapper
  const apiFn = (typeof ctx.api === "function") ? ctx.api : (typeof win.api === "function" ? win.api : null);

  async function apiCall(method, payload = {}) {
    // Prefer injected API (it usually already includes auth/initData/app_public_id)
    if (apiFn) return await apiFn(method, payload);

    // Fallback: same-origin Worker API
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
      throw new Error((j && (j.error || j.message)) || `API ${method} failed (${r.status})`);
    }
    return j;
  }

  // ---------- defaults (keep backward compatible with existing props)
  const title = str(props.h1 ?? props.title, "Колесо бонусов");

  // Legacy fields support (img1..img4, t1..t4)
  const legacyTexts = [props.t1, props.t2, props.t3, props.t4].map(v => str(v, "")).filter(Boolean);
  const basePrizes = legacyTexts.length
    ? legacyTexts.map((txt, i) => ({ text: txt, value: 0, color: ["#7c5cff", "#2dd4bf", "#5ddcff", "#fb7185"][i % 4] }))
    : null;

  const prizes = (Array.isArray(props.prizes) && props.prizes.length)
    ? props.prizes
    : (basePrizes || [
        { text: "+5",  value: 5,  color: "#5ddcff" },
        { text: "+10", value: 10, color: "#7c5cff" },
        { text: "+20", value: 20, color: "#2dd4bf" },
        { text: "0",   value: 0,  color: "#fbbf24" },
        { text: "+15", value: 15, color: "#fb7185" },
      ]);

  const spinCost = num(props.spin_cost ?? props.spin_cost_coins, 10);

  // i18n texts (optional)
  const i18n = props.i18n || {};
  // legacy direct text props override i18n (so your current editor continues to work)
  if (props.sub !== undefined) i18n.sub = props.sub;
  if (props.spin !== undefined) i18n.spin = props.spin;
  if (props.claim !== undefined) i18n.claim = props.claim;
  if (props.pill !== undefined) i18n.hint_cost = props.pill;
  const t = (k, d) => str(i18n[k], d);

  // ---------- render (view.html already exists inside root)
  const card = root.querySelector(".bw-card") || root;
  const titleEl = root.querySelector("[data-bw-title]");
  const subEl = root.querySelector("[data-bw-sub]");
  const coinsEl = root.querySelector("[data-bw-coins]");
  const cdEl = root.querySelector("[data-bw-cd]");
  const spinBtn = root.querySelector("[data-spin-btn]");
  const claimBtn = root.querySelector("[data-claim-btn]");
  const hintEl = root.querySelector("[data-bw-hint]");
  const canvas = root.querySelector("#bonusWheel");

  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = t("sub", "Крути и забирай бонусы");
  if (spinBtn) spinBtn.textContent = t("spin", "Крутить");
  if (claimBtn) claimBtn.textContent = t("claim", "Забрать");
  if (hintEl) hintEl.textContent = t("hint_cost", `Стоимость: ${spinCost}`);

  // ---------- state (from ctx.state if your mini runtime passes it)
  const state = (ctx && ctx.state) ? ctx.state : (win.MiniState || {});
  let coins = num(state.coins, 0);
  let wheel = state.wheel || {}; // {claim_cooldown_left_ms, has_unclaimed, last_prize_title, last_prize_code}

  function setCoins(v) {
    coins = num(v, 0);
    if (coinsEl) coinsEl.textContent = String(coins);
  }

  function setCooldown(ms) {
    const left = Math.max(0, num(ms, 0));
    if (cdEl) cdEl.textContent = left ? formatMs(left) : t("ready", "Готово");
  }

  function setButtons() {
    const canSpin = coins >= spinCost && !wheel.has_unclaimed && num(wheel.claim_cooldown_left_ms, 0) <= 0;
    const canClaim = !!wheel.has_unclaimed;

    if (spinBtn) {
      spinBtn.disabled = !canSpin;
      spinBtn.setAttribute("aria-disabled", (!canSpin).toString());
    }
    if (claimBtn) {
      claimBtn.disabled = !canClaim;
      claimBtn.setAttribute("aria-disabled", (!canClaim).toString());
    }

    if (hintEl) {
      if (wheel.has_unclaimed) hintEl.textContent = t("hint_unclaimed", "Есть незабранный приз");
      else if (num(wheel.claim_cooldown_left_ms, 0) > 0) hintEl.textContent = t("hint_cooldown", "Подожди кулдаун");
      else hintEl.textContent = t("hint_cost", `Стоимость: ${spinCost}`);
    }
  }

  function formatMs(ms) {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${s}s`;
  }

  // ---------- wheel drawing / animation
  const DPR = Math.max(1, win.devicePixelRatio || 1);
  const ctx2d = canvas ? canvas.getContext("2d") : null;

  let animRaf = 0;
  let angle = 0; // radians
  let spinning = false;

  function resizeCanvas() {
    if (!canvas || !ctx2d) return;
    const box = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(box.width));
    const h = Math.max(10, Math.round(box.height));
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawWheel();
  }

  function drawWheel() {
    if (!canvas || !ctx2d) return;
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.46;

    ctx2d.clearRect(0, 0, w, h);

    // background disc
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.rotate(angle);

    const n = prizes.length;
    const step = (Math.PI * 2) / n;

    for (let i = 0; i < n; i++) {
      const a0 = i * step - Math.PI / 2;
      const a1 = a0 + step;

      ctx2d.beginPath();
      ctx2d.moveTo(0, 0);
      ctx2d.arc(0, 0, r, a0, a1);
      ctx2d.closePath();
      ctx2d.fillStyle = prizes[i].color || "#7c5cff";
      ctx2d.globalAlpha = 0.92;
      ctx2d.fill();

      // text
      const mid = (a0 + a1) / 2;
      ctx2d.save();
      ctx2d.rotate(mid);
      ctx2d.textAlign = "right";
      ctx2d.textBaseline = "middle";
      ctx2d.fillStyle = "#ffffff";
      ctx2d.globalAlpha = 0.95;
      ctx2d.font = "700 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx2d.fillText(String(prizes[i].text || ""), r * 0.82, 0);
      ctx2d.restore();
    }

    // inner circle
    ctx2d.globalAlpha = 1;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx2d.closePath();
    ctx2d.fillStyle = "rgba(0,0,0,.22)";
    ctx2d.fill();

    ctx2d.restore();

    // pointer
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.beginPath();
    ctx2d.moveTo(0, -r - 6);
    ctx2d.lineTo(-10, -r + 10);
    ctx2d.lineTo(10, -r + 10);
    ctx2d.closePath();
    ctx2d.fillStyle = "rgba(255,255,255,.92)";
    ctx2d.fill();
    ctx2d.restore();
  }

  function stopAnim() {
    if (animRaf) cancelAnimationFrame(animRaf);
    animRaf = 0;
  }

  function animateSpin(targetTurns = 5, extra = Math.random() * Math.PI * 2) {
    stopAnim();
    spinning = true;

    const start = angle;
    const target = start + targetTurns * Math.PI * 2 + extra;
    const startT = performance.now();
    const dur = 1600;

    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

    const tick = (now) => {
      const t01 = Math.min(1, (now - startT) / dur);
      angle = start + (target - start) * easeOutCubic(t01);
      drawWheel();
      if (t01 < 1) animRaf = requestAnimationFrame(tick);
      else {
        spinning = false;
        animRaf = 0;
      }
    };
    animRaf = requestAnimationFrame(tick);
  }

  // ---------- actions
  async function doSpin() {
    if (spinning) return;
    try {
      spinning = true;
      setButtons();

      // optimistic spin animation while waiting
      animateSpin(6);

      const res = await apiCall("wheel.spin", {
        cost: spinCost,
        // optional: tell server about prize table (if server needs it). Keep backward compatible.
        prizes: prizes.map(p => ({ text: p.text, value: p.value })),
      });

      // expected shape: { ok:true, coins, wheel:{...}, prize:{title,code,value} }
      if (res && typeof res === "object") {
        if (res.coins !== undefined) setCoins(res.coins);
        if (res.wheel) wheel = res.wheel;
        if (wheel && res.prize) {
          wheel.has_unclaimed = true;
          wheel.last_prize_title = res.prize.title || res.prize.text || "";
          wheel.last_prize_code = res.prize.code || "";
        }
        if (wheel && wheel.claim_cooldown_left_ms !== undefined) setCooldown(wheel.claim_cooldown_left_ms);
      }

      // stop quickly if we still spinning too long
      win.setTimeout(() => { spinning = false; setButtons(); }, 250);
    } catch (e) {
      spinning = false;
      setButtons();
      try { TG && TG.showPopup && TG.showPopup({ title: "Ошибка", message: String(e.message || e), buttons: [{ type: "ok" }] }); }
      catch(_){ alert(String(e.message || e)); }
    }
  }

  async function doClaim() {
    if (spinning) return;
    try {
      spinning = true;
      setButtons();

      const res = await apiCall("wheel.claim", {});

      if (res && typeof res === "object") {
        if (res.coins !== undefined) setCoins(res.coins);
        if (res.wheel) wheel = res.wheel;
        wheel.has_unclaimed = false;
        if (wheel && wheel.claim_cooldown_left_ms !== undefined) setCooldown(wheel.claim_cooldown_left_ms);
      }

      spinning = false;
      setButtons();
    } catch (e) {
      spinning = false;
      setButtons();
      try { TG && TG.showPopup && TG.showPopup({ title: "Ошибка", message: String(e.message || e), buttons: [{ type: "ok" }] }); }
      catch(_){ alert(String(e.message || e)); }
    }
  }

  // ---------- bind
  const onResize = () => resizeCanvas();
  win.addEventListener("resize", onResize);

  const onSpin = (e) => { e.preventDefault(); doSpin(); };
  const onClaim = (e) => { e.preventDefault(); doClaim(); };

  spinBtn && spinBtn.addEventListener("click", onSpin);
  claimBtn && claimBtn.addEventListener("click", onClaim);

  // init render
  setCoins(coins);
  setCooldown(num(wheel.claim_cooldown_left_ms, 0));
  resizeCanvas();
  setButtons();

  // cooldown ticker
  let cdTimer = 0;
  function startCooldownTicker() {
    if (cdTimer) return;
    cdTimer = win.setInterval(() => {
      const left = Math.max(0, num(wheel.claim_cooldown_left_ms, 0) - 1000);
      wheel.claim_cooldown_left_ms = left;
      setCooldown(left);
      if (left <= 0) {
        win.clearInterval(cdTimer);
        cdTimer = 0;
        setButtons();
      }
    }, 1000);
  }
  if (num(wheel.claim_cooldown_left_ms, 0) > 0) startCooldownTicker();

  // cleanup
  return () => {
    stopAnim();
    win.removeEventListener("resize", onResize);
    spinBtn && spinBtn.removeEventListener("click", onSpin);
    claimBtn && claimBtn.removeEventListener("click", onClaim);
    if (cdTimer) win.clearInterval(cdTimer);
  };
}
