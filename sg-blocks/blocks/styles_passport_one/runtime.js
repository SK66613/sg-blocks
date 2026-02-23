// stylesPassport/runtime.js
// Passport (tiers + stamps) — SG blocks format.
// Uses window.api()/ctx.api if available, otherwise POST /api/mini/*?public_id=...
// Data source priority:
// 1) state.passport (from D1 via state.ts)
// 2) props.tiers (preview / demo)

export async function mount(root, props = {}, ctx = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  // mount guard
  if (root.__sg_passport_mounted) {
    try { return root.__sg_passport_unmount || (() => {}); } catch (_) {}
  }
  root.__sg_passport_mounted = true;

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
  const toInt = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : d;
  };
  const str = (v, d = "") => (v === undefined || v === null ? d : String(v));
  const clamp01 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  };

  function haptic(kind = "light") {
    try {
      TG && TG.HapticFeedback && TG.HapticFeedback.impactOccurred && TG.HapticFeedback.impactOccurred(kind);
    } catch (_) {}
  }

  async function uiAlert(msg) {
    try {
      if (TG && TG.showAlert) return await TG.showAlert(String(msg || ""));
    } catch (_) {}
    alert(String(msg || ""));
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------- API adapter
  const apiFn =
    typeof ctx.api === "function"
      ? ctx.api
      : typeof win.api === "function"
      ? win.api
      : null;

  const publicId =
    str(ctx.publicId || ctx.public_id || ctx.publicID, "").trim() ||
    str(props.app_public_id || props.public_id || props.publicId, "").trim() ||
    str(win.SG_APP_PUBLIC_ID || win.APP_PUBLIC_ID, "").trim();

  const DEMO = !apiFn && !publicId;

  async function apiCall(pathSeg, body = {}) {
    if (apiFn) return await apiFn(pathSeg, body);

    if (!publicId) return { ok: false, error: "NO_PUBLIC_ID" };

    const initData =
      ctx && (ctx.initData || ctx.init_data)
        ? ctx.initData || ctx.init_data
        : TG && TG.initData
        ? TG.initData
        : "";

    const u =
      (ctx && (ctx.tg_user || ctx.tgUser)) ||
      (TG && TG.initDataUnsafe && TG.initDataUnsafe.user) ||
      null;

    const tg_user = u
      ? { id: u.id, username: u.username, first_name: u.first_name, last_name: u.last_name }
      : null;

    const url = `/api/mini/${pathSeg}?public_id=${encodeURIComponent(publicId)}`;
    const payload = { ...body, init_data: initData, tg_user, app_public_id: publicId };

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

  async function apiState() {
    return await apiCall("state", {});
  }
  async function apiCollect(style_id, pin) {
    return await apiCall("style.collect", { style_id, pin });
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

  const rewardWrap = root.querySelector("[data-pp-reward]");
  const rewardTitle = root.querySelector("[data-pp-reward-title]");
  const rewardText = root.querySelector("[data-pp-reward-text]");
  const rewardCode = root.querySelector("[data-pp-reward-code]");
  const openQrBtn = root.querySelector("[data-pp-open-qr]");

  // QR bottom sheet
  const sheetEl = root.querySelector("[data-pp-sheet]");
  const sheetCloseEls = root.querySelectorAll("[data-pp-sheet-close]");
  const sheetPanel = sheetEl ? sheetEl.querySelector(".pp-sheet-panel") : null;

  const qrTitle = root.querySelector("[data-pp-qr-title]");
  const qrText = root.querySelector("[data-pp-qr-text]");
  const qrCanvas = root.querySelector("[data-pp-qr-canvas]");
  const qrCodeText = root.querySelector("[data-pp-qr-code]");

  // PIN modal
  const modalEl = root.querySelector("[data-pp-modal]");
  const pinInp = root.querySelector("[data-pp-pin-inp]");
  const modalOk = root.querySelector("[data-pp-modal-ok]");
  const modalCancel = root.querySelector("[data-pp-modal-cancel]");
  const modalClose = root.querySelector("[data-pp-modal-close]");
  const modalTitle = root.querySelector("[data-pp-modal-title]");
  const modalSub = root.querySelector("[data-pp-modal-sub]");
  const modalErr = root.querySelector("[data-pp-modal-err]");

  // ---------- props / defaults
  const P = props || {};
  const gridColsFallback = Math.max(1, Math.min(6, num(P.grid_cols, 3)));
  const requirePin = true; // ✅ always for your flow
  const collectMode = str(P.collect_mode, "direct_pin"); // direct_pin
  const btnCollect = str(P.btn_collect, "Отметить");
  const btnDone = str(P.btn_done, "Получено");

  // QR props
  const qrTitleText = str(P.qr_title, "🎁 Получите приз");
  const qrHelpText = str(P.qr_text, "Покажите этот QR кассиру, чтобы получить подарок.");
  const qrShowCodeText = !!P.qr_show_code_text;
  const qrService = str(P.qr_service, "https://quickchart.io/qr");
  const qrSize = Math.max(120, num(P.qr_size, 260));
  const qrMargin = Math.max(0, num(P.qr_margin, 2));

  // Sheet swipe settings
  const SWIPE_CLOSE_PX = Math.max(50, num(P.sheet_swipe_close_px, 90));
  const SWIPE_VELOCITY = Math.max(0.3, num(P.sheet_swipe_velocity, 0.6));
  const SWIPE_EDGE_PX = Math.max(6, num(P.sheet_swipe_edge_px, 6));

  function getStyleId(st) {
    return str(st && (st.code || st.style_id || st.styleId), "").trim();
  }

  // ---------- state
  let state = null;
  let collected = new Set();
  let busy = new Set();

  let selectedStyleId = "";
  let selectedStyleName = "";

  // DEMO local store
  const demoCollected = new Set();
  let demoIssued = false;
  let demoRedeemCode = "SG-DEMO-1234";

  // derived model
  let passportModel = {
    title: str(P.title, "Паспорт"),
    subtitle: str(P.subtitle, ""),
    cover_url: str(P.cover_url, ""),
    grid_cols: gridColsFallback,
    collect_coins: Math.max(0, Math.floor(num(P.collect_coins, 0))),
    btn_collect: btnCollect,
    btn_done: btnDone,

    active_tier_id: 1,
    tiers: [],
    stamps: [],
    progress: { total: 0, collected: 0, pct: 0 },
  };

  function isDone(styleId) {
    if (DEMO) return demoCollected.has(String(styleId));
    return collected.has(String(styleId));
  }

  function setModalVisible(v) {
    if (!modalEl) return;
    modalEl.hidden = !v;
    if (!v) {
      if (modalErr) {
        modalErr.hidden = true;
        modalErr.textContent = "";
      }
      if (pinInp) pinInp.value = "";
    } else {
      setTimeout(() => {
        try { pinInp && pinInp.focus && pinInp.focus(); } catch (_) {}
      }, 50);
    }
  }

  function normalizeCollected(st) {
    const out = new Set();
    if (!st) return out;

    // from new snapshot we already have stamps[].collected, but keep compatibility
    const candidates = [
      st.styles,
      st.styles_collected,
      st.collected_styles,
      st.stamps,
      st.done_styles,
      st.passport && st.passport.styles,
      st.passport && st.passport.collected,
    ];

    let arr = null;
    for (const c of candidates) {
      if (Array.isArray(c)) { arr = c; break; }
    }

    if (arr) {
      for (const it of arr) {
        if (it === null || it === undefined) continue;
        if (typeof it === "string" || typeof it === "number") out.add(String(it));
        else if (typeof it === "object") {
          const v = it.code || it.style_id || it.styleId || it.id || it.key;
          if (v !== undefined && v !== null) out.add(String(v));
        }
      }
      return out;
    }

    const map = st.styles_map || st.collected_map || st.stamps_map;
    if (map && typeof map === "object") {
      for (const k of Object.keys(map)) if (map[k]) out.add(String(k));
    }

    return out;
  }

  function buildPassportModelFromState(st) {
    const pass = st && st.passport ? st.passport : null;

    if (pass && Array.isArray(pass.stamps)) {
      passportModel = {
        title: str(pass.title, str(P.title, "Паспорт")),
        subtitle: str(pass.subtitle, str(P.subtitle, "")),
        cover_url: str(pass.cover_url, str(P.cover_url, "")),
        grid_cols: Math.max(1, Math.min(6, toInt(pass.grid_cols, gridColsFallback))),
        collect_coins: Math.max(0, toInt(pass.collect_coins, toInt(P.collect_coins, 0))),
        btn_collect: str(pass.btn_collect, btnCollect),
        btn_done: str(pass.btn_done, btnDone),

        active_tier_id: pass.active_tier_id == null ? 1 : Number(pass.active_tier_id),

        tiers: Array.isArray(pass.tiers) ? pass.tiers : [],
        stamps: pass.stamps.map((x) => ({
          tier_id: Number(x.tier_id || 1),
          code: str(x.code, ""),
          name: str(x.name, ""),
          desc: str(x.desc, ""),
          image: str(x.image, ""),
          collected: !!x.collected,
        })),

        progress: pass.progress
          ? {
              total: Math.max(0, toInt(pass.progress.total, 0)),
              collected: Math.max(0, toInt(pass.progress.collected, 0)),
              pct: Math.max(0, Math.min(100, toInt(pass.progress.pct, 0))),
            }
          : { total: 0, collected: 0, pct: 0 },
      };
      return;
    }

    // DEMO/legacy from props.tiers
    const tiers = Array.isArray(P.tiers) ? P.tiers : [];
    const stamps = [];
    for (const t of tiers) {
      const tid = Number(t && t.tier_id ? t.tier_id : 1);
      const list = Array.isArray(t && t.stamps) ? t.stamps : [];
      for (const s of list) {
        const code = str(s && s.code, "").trim();
        if (!code) continue;
        stamps.push({
          tier_id: tid,
          code,
          name: str(s.name, code),
          desc: str(s.desc, ""),
          image: str(s.image, ""),
          collected: false,
        });
      }
    }

    passportModel = {
      ...passportModel,
      title: str(P.title, passportModel.title),
      subtitle: str(P.subtitle, passportModel.subtitle),
      cover_url: str(P.cover_url, passportModel.cover_url),
      grid_cols: gridColsFallback,
      collect_coins: Math.max(0, toInt(P.collect_coins, passportModel.collect_coins)),
      btn_collect: btnCollect,
      btn_done: btnDone,
      active_tier_id: 1,
      tiers: tiers.map((t) => ({
        tier_id: Number(t.tier_id || 1),
        enabled: t.enabled === false ? false : true,
        title: str(t.title, ""),
        subtitle: str(t.subtitle, ""),
        stamps_total: Array.isArray(t.stamps) ? t.stamps.length : 0,
        stamps_collected: 0,
        progress_pct: 0,
        reward: { enabled: true },
      })),
      stamps,
      progress: { total: stamps.length, collected: 0, pct: 0 },
    };
  }

  function renderHeader() {
    if (titleEl) titleEl.textContent = str(passportModel.title, "Паспорт");
    if (subEl) subEl.textContent = str(passportModel.subtitle, "");

    const coverUrl = str(passportModel.cover_url, "").trim();
    if (coverEl && coverImg) {
      if (coverUrl) {
        coverEl.hidden = false;
        coverImg.src = coverUrl;
      } else {
        coverEl.hidden = true;
        coverImg.removeAttribute("src");
      }
    }
  }

  function renderProgress() {
    if (!progWrap || !progBar || !progTxt) return;

    const p = passportModel.progress || { total: 0, collected: 0 };
    const total = Math.max(0, toInt(p.total, 0));
    const got = Math.max(0, toInt(p.collected, DEMO ? demoCollected.size : collected.size));

    if (!total) { progWrap.hidden = true; return; }
    progWrap.hidden = false;

    const pct = total ? clamp01(got / total) : 0;
    progBar.style.width = `${Math.round(pct * 100)}%`;
    progTxt.textContent = `${got}/${total}`;
  }

  // ===== Sheet
  let sheetOpen = false;

  function lockBodyScroll(locked) {
    try {
      const b = doc.body;
      if (!b) return;
      if (locked) {
        b.dataset.ppSheetLock = "1";
        b.style.overflow = "hidden";
      } else {
        if (b.dataset.ppSheetLock === "1") {
          delete b.dataset.ppSheetLock;
          b.style.overflow = "";
        }
      }
    } catch (_) {}
  }

  function tgBackBind(on) {
    try {
      if (!TG || !TG.BackButton) return;
      if (on) {
        TG.BackButton.show();
        TG.BackButton.onClick(closeSheet);
      } else {
        try { TG.BackButton.offClick && TG.BackButton.offClick(closeSheet); } catch (_) {}
        try { TG.BackButton.hide(); } catch (_) {}
      }
    } catch (_) {}
  }

  function setSheetTranslate(px) {
    if (!sheetPanel) return;
    sheetPanel.style.transform = px ? `translateY(${px}px)` : "";
  }

  function setSheetDragState(on) {
    if (!sheetPanel) return;
    sheetPanel.style.transition = on ? "none" : "";
  }

  function openSheet() {
    if (!sheetEl) return;
    sheetEl.hidden = false;
    setSheetDragState(false);
    setSheetTranslate(0);
    sheetEl.classList.add("is-open");
    sheetOpen = true;
    lockBodyScroll(true);
    tgBackBind(true);
  }

  function closeSheet() {
    if (!sheetEl) return;
    sheetEl.classList.remove("is-open");
    sheetOpen = false;
    tgBackBind(false);
    lockBodyScroll(false);
    setSheetDragState(false);
    setSheetTranslate(0);
    setTimeout(() => {
      try { sheetEl.hidden = true; } catch (_) {}
    }, 180);
  }

  try {
    sheetCloseEls && sheetCloseEls.forEach && sheetCloseEls.forEach((el) => el.addEventListener("click", closeSheet));
  } catch (_) {}

  (function setupSheetSwipe() {
    if (!sheetEl || !sheetPanel) return;

    let dragging = false;
    let startY = 0, startX = 0, lastY = 0, startT = 0;
    let gestureLocked = false;
    let isVerticalDrag = false;

    function getY(ev) {
      if (ev && ev.touches && ev.touches[0]) return ev.touches[0].clientY;
      if (ev && ev.changedTouches && ev.changedTouches[0]) return ev.changedTouches[0].clientY;
      return ev.clientY;
    }
    function getX(ev) {
      if (ev && ev.touches && ev.touches[0]) return ev.touches[0].clientX;
      if (ev && ev.changedTouches && ev.changedTouches[0]) return ev.changedTouches[0].clientX;
      return ev.clientX;
    }
    function canStartDrag(ev) {
      const t = ev.target;
      const onHandle = !!(t && t.closest && t.closest(".pp-sheet-handle"));
      if (onHandle) return true;
      const st = sheetPanel.scrollTop || 0;
      return st <= 0;
    }

    function onStart(ev) {
      if (!sheetOpen) return;
      if (!canStartDrag(ev)) return;

      const y = getY(ev), x = getX(ev);
      if (!Number.isFinite(y) || !Number.isFinite(x)) return;

      dragging = true;
      gestureLocked = false;
      isVerticalDrag = false;

      startY = y; lastY = y; startX = x;
      startT = performance.now();

      setSheetDragState(true);
      sheetPanel.style.willChange = "transform";
    }

    function onMove(ev) {
      if (!dragging) return;

      const y = getY(ev), x = getX(ev);
      if (!Number.isFinite(y) || !Number.isFinite(x)) return;

      const dyRaw = y - startY;
      const dxRaw = x - startX;

      if (!gestureLocked) {
        const ady = Math.abs(dyRaw);
        const adx = Math.abs(dxRaw);
        if (ady < SWIPE_EDGE_PX && adx < SWIPE_EDGE_PX) return;

        gestureLocked = true;
        isVerticalDrag = ady > adx * 1.2 && dyRaw > 0;

        if (!isVerticalDrag) {
          dragging = false;
          setSheetDragState(false);
          sheetPanel.style.willChange = "";
          return;
        }
      }

      const dy = Math.max(0, dyRaw);
      lastY = y;

      const maxPull = Math.min(420, Math.max(220, sheetPanel.clientHeight * 0.85));
      const damped = dy <= maxPull ? dy : maxPull + (dy - maxPull) * 0.25;

      setSheetTranslate(damped);

      try { ev.preventDefault(); } catch (_) {}
      try { ev.stopPropagation(); } catch (_) {}
    }

    function onEnd(ev) {
      if (!dragging) return;
      dragging = false;

      const endT = performance.now();
      const dt = Math.max(1, endT - startT);

      const y = getY(ev);
      const dy = Math.max(0, (Number.isFinite(y) ? y : lastY) - startY);
      const v = dy / dt;

      sheetPanel.style.willChange = "";
      setSheetDragState(false);

      if (isVerticalDrag && (dy >= SWIPE_CLOSE_PX || v >= SWIPE_VELOCITY)) {
        haptic("light");
        closeSheet();
        return;
      }
      setSheetTranslate(0);
    }

    const hasPointer = "PointerEvent" in win;

    if (hasPointer) {
      sheetPanel.addEventListener("pointerdown", onStart, { passive: false });
      win.addEventListener("pointermove", onMove, { passive: false });
      win.addEventListener("pointerup", onEnd, { passive: false });
      win.addEventListener("pointercancel", onEnd, { passive: false });
    } else {
      sheetPanel.addEventListener("touchstart", onStart, { passive: false });
      win.addEventListener("touchmove", onMove, { passive: false });
      win.addEventListener("touchend", onEnd, { passive: false });
      win.addEventListener("touchcancel", onEnd, { passive: false });
    }
  })();

  function setQrTextLink(text) {
    if (!qrCodeText) return;
    if (qrShowCodeText) {
      qrCodeText.hidden = false;
      qrCodeText.textContent = text || "";
    } else {
      qrCodeText.hidden = true;
      qrCodeText.textContent = "";
    }
  }

  function getRedeemDeepLink() {
    if (DEMO) {
      const bot = str(P.bot_username, "YourBot").replace(/^@/, "").trim();
      const startPayload = "redeem_" + demoRedeemCode;
      return bot ? `https://t.me/${bot}?start=${encodeURIComponent(startPayload)}` : startPayload;
    }

    const pr = state && state.passport_reward ? state.passport_reward : null;
    const code = pr && pr.redeem_code ? String(pr.redeem_code).trim() : "";
    if (!code) return "";

    const botRaw = (state && (state.bot_username || state.botUsername)) || (P && (P.bot_username || P.botUsername)) || "";
    const bot = botRaw ? String(botRaw).replace(/^@/, "").trim() : "";
    const startPayload = "redeem_" + code;

    if (bot) return `https://t.me/${bot}?start=${encodeURIComponent(startPayload)}`;
    return startPayload;
  }

  async function renderQr() {
    if (!sheetEl) return;

    const link = getRedeemDeepLink();
    if (!link) {
      openSheet();
      if (qrTitle) qrTitle.textContent = qrTitleText;
      if (qrText) qrText.textContent = "Приз готовится… обновите экран";
      setQrTextLink("Нет redeem_code");
      return;
    }

    openSheet();
    if (qrTitle) qrTitle.textContent = qrTitleText;
    if (qrText) qrText.textContent = qrHelpText;
    setQrTextLink(link);

    if (!qrCanvas) return;

    try {
      qrCanvas.width = qrSize;
      qrCanvas.height = qrSize;
    } catch (_) {}

    const ctx2 = qrCanvas.getContext("2d");
    if (!ctx2) return;

    ctx2.fillStyle = "#fff";
    ctx2.fillRect(0, 0, qrCanvas.width, qrCanvas.height);

    const qUrl = `${qrService}?size=${qrSize}&margin=${qrMargin}&text=${encodeURIComponent(link)}`;

    await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx2.drawImage(img, 0, 0, qrCanvas.width, qrCanvas.height);
        resolve(true);
      };
      img.onerror = () => {
        ctx2.fillStyle = "#000";
        ctx2.font = "12px ui-monospace, Menlo, Consolas, monospace";
        ctx2.fillText("QR load error", 10, 20);
        resolve(false);
      };
      img.src = qUrl;
    });
  }

  function renderReward() {
    if (!rewardWrap) return;

    // ✅ reward is driven by state.passport_reward (issued)
    let pr = null;

    if (DEMO) {
      pr = demoIssued ? { status: "issued", redeem_code: demoRedeemCode, prize_title: "DEMO Награда" } : null;
    } else {
      pr = state && state.passport_reward ? state.passport_reward : null;
    }

    const issued = pr && String(pr.status || "issued") === "issued";

    if (!issued) {
      rewardWrap.hidden = true;
      return;
    }

    rewardWrap.hidden = false;

    const t = pr && pr.prize_title ? String(pr.prize_title) : "🎁 Награда";
    if (rewardTitle) rewardTitle.textContent = t;

    const code = pr && pr.redeem_code ? String(pr.redeem_code) : "";
    const txt = "Покажите QR кассиру, чтобы получить приз.";

    if (rewardText) rewardText.textContent = txt;

    if (rewardCode) {
      rewardCode.hidden = true;
      rewardCode.textContent = "";
    }

    if (openQrBtn) {
      openQrBtn.textContent = "Получить приз";
      openQrBtn.disabled = false;
    }
  }

  function stampCardHtml(st, globalIndex) {
    const sid = str(st && st.code, "").trim();
    const done = sid && isDone(sid);
    const img = str(st && st.image, "").trim();
    const name = str(st && st.name, sid || `#${globalIndex + 1}`);
    const desc = str(st && st.desc, "");

    const disabled = !sid || done || busy.has(sid);
    const badge = done ? "✓" : String(globalIndex + 1);

    return `
      <button class="pp-card ${done ? "is-done" : ""} ${disabled ? "is-disabled" : ""}" type="button"
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

  function renderGrid() {
    if (!gridEl) return;

    const cols = Math.max(1, Math.min(6, toInt(passportModel.grid_cols, gridColsFallback)));
    const stamps = Array.isArray(passportModel.stamps) ? passportModel.stamps : [];

    // group by tier
    const byTier = new Map();
    for (const s of stamps) {
      const tid = Number(s.tier_id || 1);
      if (!byTier.has(tid)) byTier.set(tid, []);
      byTier.get(tid).push(s);
    }

    const tiers = Array.isArray(passportModel.tiers) && passportModel.tiers.length
      ? passportModel.tiers.map((t) => Number(t.tier_id || 1))
      : Array.from(byTier.keys()).sort((a, b) => a - b);

    let global = 0;
    const htmlParts = [];

    for (const tid of tiers) {
      const list = byTier.get(tid) || [];
      if (!list.length) continue;

      const tierMeta =
        Array.isArray(passportModel.tiers) && passportModel.tiers.length
          ? passportModel.tiers.find((x) => Number(x.tier_id || 0) === Number(tid))
          : null;

      const enabled = tierMeta ? !!tierMeta.enabled : true;
      const isActive = Number(passportModel.active_tier_id || 1) === Number(tid);

      const tTitle = tierMeta && tierMeta.title ? String(tierMeta.title) : `Круг ${tid}`;
      const tSub = tierMeta && tierMeta.subtitle ? String(tierMeta.subtitle) : "";

      const got = tierMeta && tierMeta.stamps_collected !== undefined ? Number(tierMeta.stamps_collected || 0) : null;
      const total = tierMeta && tierMeta.stamps_total !== undefined ? Number(tierMeta.stamps_total || 0) : null;

      // ✅ lock визуально будущие tiers (клика не будет, но показываем)
      const isFuture = Number(tid) > Number(passportModel.active_tier_id || 1);

      htmlParts.push(`
        <div class="pp-tier ${isActive ? "is-active" : ""} ${enabled ? "" : "is-disabled"} ${isFuture ? "is-locked" : ""}">
          <div class="pp-tier-h">
            <div class="pp-tier-t">
              <div class="pp-tier-title">${escapeHtml(tTitle)}</div>
              ${tSub ? `<div class="pp-tier-sub">${escapeHtml(tSub)}</div>` : ``}
            </div>
            ${
              got !== null && total !== null && total > 0
                ? `<div class="pp-tier-meta">${escapeHtml(`${got}/${total}`)}</div>`
                : ``
            }
          </div>

          <div class="pp-tier-grid" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:10px;">
            ${list.map((s) => {
              const html = stampCardHtml(s, global);
              global++;
              return html;
            }).join("")}
          </div>
        </div>
      `);
    }

    gridEl.innerHTML = htmlParts.join("");

    // bind clicks
    gridEl.querySelectorAll(".pp-card").forEach((card) => {
      const sid = card.getAttribute("data-sid") || "";
      card.addEventListener("click", async () => {
        if (!sid) return;
        if (card.disabled) return;
        if (isDone(sid)) return;
        if (busy.has(sid)) return;

        // DEMO click just toggles done in current tier, and issues reward when tier completed
        if (DEMO) {
          demoCollected.add(String(sid));
          haptic("light");
          // issue reward when active tier completed
          const tid = (() => {
            const hit = passportModel.stamps.find((x) => String(x.code) === String(sid));
            return hit ? Number(hit.tier_id || 1) : 1;
          })();

          // count tier completion
          const tierList = passportModel.stamps.filter((x) => Number(x.tier_id || 1) === tid);
          const got = tierList.reduce((a, x) => a + (demoCollected.has(String(x.code)) ? 1 : 0), 0);
          const total = tierList.length;

          if (total > 0 && got >= total && Number(passportModel.active_tier_id || 1) === tid) {
            demoIssued = true;
          }

          // recompute progress demo
          const totalAll = passportModel.stamps.length;
          const gotAll = passportModel.stamps.reduce((a, x) => a + (demoCollected.has(String(x.code)) ? 1 : 0), 0);
          passportModel.progress = { total: totalAll, collected: gotAll, pct: totalAll ? Math.round((gotAll / totalAll) * 100) : 0 };

          renderProgress();
          renderReward();
          renderGrid();
          return;
        }

        await onCollectClick(sid);
      });
    });
  }

  async function refreshFromServer() {
    const j = await apiState();
    const st =
      j && (j.state || j.fresh_state || j.fresh || j.data || j.result)
        ? j.state || j.fresh_state || j.fresh || j.data || j.result
        : j;
    await applyState(st);
  }

  async function applyState(st) {
    state = st || {};
    collected = normalizeCollected(state);

    buildPassportModelFromState(state);

    // reconcile collected flags based on snapshot stamps.collected if exists
    if (passportModel && Array.isArray(passportModel.stamps)) {
      passportModel.stamps = passportModel.stamps.map((s) => ({
        ...s,
        collected: !!s.collected || collected.has(String(s.code || "")),
      }));

      if (!passportModel.progress || !passportModel.progress.total) {
        const total = passportModel.stamps.length;
        const got = passportModel.stamps.reduce((a, x) => a + (x.collected ? 1 : 0), 0);
        passportModel.progress = { total, collected: got, pct: total ? Math.round((got / total) * 100) : 0 };
      }
    }

    renderHeader();
    renderProgress();
    renderReward();
    renderGrid();
  }

  async function collectDirectPin(styleId, pin) {
    const res = await apiCollect(styleId, pin);
    const st = res && (res.fresh_state || res.state || res.result) ? res.fresh_state || res.state || res.result : res;
    if (st) await applyState(st);
    else await refreshFromServer();
  }

  async function onCollectClick(styleId) {
    try {
      haptic("light");

      if (requirePin && collectMode === "direct_pin") {
        selectedStyleId = styleId;
        const hit = (passportModel.stamps || []).find((s) => String(s.code) === String(styleId));
        selectedStyleName = hit ? String(hit.name || "") : "";

        if (modalTitle) modalTitle.textContent = "Введите PIN";
        if (modalSub) modalSub.textContent = selectedStyleName ? `Штамп: ${selectedStyleName}` : "";
        setModalVisible(true);
        return;
      }

      busy.add(styleId);
      renderGrid();

      // no-pin mode not used in your setup
      await collectDirectPin(styleId, "");

    } catch (e) {
      // show known gate error nicely
      const p = e && e.payload ? e.payload : null;
      const msg =
        p && p.error === "TIER_LOCKED"
          ? "Сначала получите приз за текущий круг 🙂"
          : (e && e.message ? e.message : "Ошибка");
      await uiAlert(msg);
    } finally {
      if (busy.has(styleId)) {
        busy.delete(styleId);
        renderGrid();
      }
    }
  }

  // modal events
  if (modalOk) {
    modalOk.addEventListener("click", async () => {
      const pin = str(pinInp && pinInp.value, "").trim();
      if (requirePin && !pin) {
        if (modalErr) { modalErr.hidden = false; modalErr.textContent = "Введите PIN"; }
        return;
      }
      if (modalErr) { modalErr.hidden = true; modalErr.textContent = ""; }

      try {
        haptic("light");
        if (selectedStyleId) {
          busy.add(selectedStyleId);
          renderGrid();
        }
        await collectDirectPin(selectedStyleId, pin);
        setModalVisible(false);
      } catch (e) {
        const p = e && e.payload ? e.payload : null;
        const msg =
          p && p.error === "TIER_LOCKED"
            ? "Сначала получите приз за текущий круг 🙂"
            : (e && e.message ? e.message : "PIN неверный");
        if (modalErr) {
          modalErr.hidden = false;
          modalErr.textContent = msg;
        } else {
          await uiAlert(msg);
        }
      } finally {
        if (selectedStyleId && busy.has(selectedStyleId)) {
          busy.delete(selectedStyleId);
          renderGrid();
        }
      }
    });
  }
  if (modalCancel) modalCancel.addEventListener("click", () => setModalVisible(false));
  if (modalClose) modalClose.addEventListener("click", () => setModalVisible(false));

  // QR open
  if (openQrBtn) {
    openQrBtn.addEventListener("click", async () => {
      openSheet();
      try { await renderQr(); } catch (_) {}
    });
  }

  // init
  try {
    if (ctx && ctx.state) await applyState(ctx.state);
    else if (DEMO) {
      // demo init from props
      buildPassportModelFromState({ passport: null });
      renderHeader();
      renderProgress();
      renderReward();
      renderGrid();
    } else {
      await refreshFromServer();
    }
  } catch (e) {
    await uiAlert(e && e.message ? e.message : "Не удалось загрузить состояние");
  }

  // unmount
  const unmount = () => {
    try { root.__sg_passport_mounted = false; } catch (_) {}
  };
  root.__sg_passport_unmount = unmount;
  return unmount;
}
