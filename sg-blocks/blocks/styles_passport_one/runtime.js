// stylesPassport/runtime.js
// Passport (tiers + stamps) — SG blocks format.
// Works with legacy window.api('state') / window.api('style.collect') AND with fetch fallback to /api/mini/*?public_id=...
//
// Data source priority:
// 1) state.passport (from worker state.ts -> loadPassportSnapshot())
// 2) props.tiers (constructor preview / legacy)
// 3) props.styles (legacy flat)
//
// Key behaviors:
// - Marks collected stamps visually (✓) based on state.passport.stamps[].collected OR legacy collected sets
// - Reward card appears when passport is complete AND (passport_reward exists OR tiers have rewards configured)
// - QR bottom sheet uses state.passport_reward.redeem_code + state.bot_username
// - DEMO mode in constructor preview (no apiFn + no publicId): local-only progress + fake reward

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
  const toInt = (v, d = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return d;
    return Math.trunc(n);
  };
  const str = (v, d = "") => (v === undefined || v === null ? d : String(v));
  const clamp01 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  };

  function haptic(kind = "light") {
    try {
      TG &&
        TG.HapticFeedback &&
        TG.HapticFeedback.impactOccurred &&
        TG.HapticFeedback.impactOccurred(kind);
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

  // ---------- API adapter (legacy-first)
  const apiFn =
    typeof ctx.api === "function"
      ? ctx.api
      : typeof win.api === "function"
      ? win.api
      : null;

  // public_id is required for fetch fallback (for worker verify)
  const publicId =
    str(ctx.publicId || ctx.public_id || ctx.publicID, "").trim() ||
    str(props.app_public_id || props.public_id || props.publicId, "").trim() ||
    str(win.SG_APP_PUBLIC_ID || win.APP_PUBLIC_ID, "").trim();

  const IS_DEMO = !apiFn && !publicId;

  async function apiCall(pathSeg, body = {}) {
    // If legacy api exists — use it directly
    if (apiFn) return await apiFn(pathSeg, body);

    if (!publicId) {
      // Studio/preview mode
      return { ok: false, error: "NO_PUBLIC_ID" };
    }

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
      ? {
          id: u.id,
          username: u.username,
          first_name: u.first_name,
          last_name: u.last_name,
        }
      : null;

    const url = `/api/mini/${pathSeg}?public_id=${encodeURIComponent(publicId)}`;

    const payload = {
      ...body,
      init_data: initData,
      tg_user,
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
      const err = new Error(
        (j && (j.error || j.message)) || `API ${pathSeg} failed (${r.status})`
      );
      err.status = r.status;
      err.payload = j;
      throw err;
    }
    return j;
  }

  // wrappers
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
  const requirePin = P.require_pin === undefined ? true : !!P.require_pin; // you said always true
  const collectMode = str(P.collect_mode, "direct_pin"); // direct_pin | bot_pin (bot_pin not used)
  const gridColsFallback = Math.max(1, Math.min(6, toInt(P.grid_cols ?? 3, 3)));

  // ---------- state
  let state = null;
  let collected = new Set();
  let busy = new Set();

  let selectedStyleId = "";
  let selectedStyleName = "";

  // DEMO local progress
  const demoCollected = new Set();

  // derived passport model for render
  let passportModel = {
    title: str(P.title, "Паспорт"),
    subtitle: str(P.subtitle, ""),
    cover_url: str(P.cover_url, ""),
    grid_cols: gridColsFallback,
    collect_coins: Math.max(0, toInt(P.collect_coins ?? 0, 0)),
    btn_collect: str(P.btn_collect, "Отметить"),
    btn_done: str(P.btn_done, "Получено"),

    active_tier_id: null,
    tiers: [], // [{tier_id,enabled,title,subtitle,stamps_total,stamps_collected,progress_pct,reward{enabled}}]
    stamps: [], // [{tier_id,idx,code,name,desc,image,collected}]
    progress: { total: 0, collected: 0, pct: 0 },
  };

  // ----- normalize collected (supports NEW state.passport.stamps[].collected)
  function normalizeCollected(st) {
    const out = new Set();
    if (!st) return out;

    // ✅ NEW: passport.stamps array with collected flag
    const ps = st.passport && Array.isArray(st.passport.stamps) ? st.passport.stamps : null;
    if (ps) {
      for (const it of ps) {
        if (!it) continue;
        const code = it.code || it.style_id || it.styleId;
        if (!code) continue;
        if (it.collected === true || Number(it.collected) === 1) out.add(String(code).trim());
      }
    }

    // legacy candidates
    const candidates = [
      st.styles,
      st.styles_collected,
      st.collected_styles,
      st.stamps,
      st.done_styles,
      st.passport && st.passport.styles,
      st.passport && st.passport.collected,

      // sometimes backends put stamps list here
      st.passport && st.passport.stamps,
    ];

    let arr = null;
    for (const c of candidates) {
      if (Array.isArray(c)) {
        arr = c;
        break;
      }
    }

    if (arr) {
      for (const it of arr) {
        if (it === null || it === undefined) continue;

        if (typeof it === "string" || typeof it === "number") {
          out.add(String(it).trim());
          continue;
        }

        if (typeof it === "object") {
          // ✅ if it's a stamp object with collected flag
          if (
            (it.code || it.style_id || it.styleId) &&
            (it.collected === true || Number(it.collected) === 1)
          ) {
            out.add(String(it.code || it.style_id || it.styleId).trim());
            continue;
          }

          const v = it.code || it.style_id || it.styleId || it.id || it.key;
          if (v !== undefined && v !== null) out.add(String(v).trim());
        }
      }
    }

    const map = st.styles_map || st.collected_map || st.stamps_map;
    if (map && typeof map === "object") {
      for (const k of Object.keys(map)) {
        if (map[k]) out.add(String(k).trim());
      }
    }

    return out;
  }

  function isDone(code) {
    if (!code) return false;
    const k = String(code);
    if (IS_DEMO) return demoCollected.has(k);
    return collected.has(k);
  }

  function isComplete() {
    const p = passportModel && passportModel.progress ? passportModel.progress : null;
    const total = p ? Number(p.total || 0) : 0;
    const got = p ? Number(p.collected || 0) : 0;
    return total > 0 && got >= total;
  }



    function getActiveTierIdSafe() {
    const v = passportModel && passportModel.active_tier_id != null ? Number(passportModel.active_tier_id) : null;
    return Number.isFinite(v) ? v : null;
  }

  function isTierComplete(tierId) {
    tierId = Number(tierId || 0);
    if (!tierId || !passportModel || !Array.isArray(passportModel.tiers)) return false;
    const t = passportModel.tiers.find((x) => Number(x.tier_id) === tierId);
    if (!t) return false;
    const total = Number(t.stamps_total || 0);
    const got = Number(t.stamps_collected || 0);
    return total > 0 && got >= total;
  }

  function isAnyTierJustCompleted() {
    // если сервер уже переключил active_tier_id на следующий, то "закрытый" — это предыдущий.
    // Поэтому проверяем: есть ли хотя бы один enabled tier, который completed.
    if (!passportModel || !Array.isArray(passportModel.tiers)) return false;
    return passportModel.tiers.some((t) => t && t.enabled !== false && Number(t.stamps_total || 0) > 0 && Number(t.stamps_collected || 0) >= Number(t.stamps_total || 0));
  }

  function hasIssuedReward() {
    const pr = getPassportReward();
    if (!pr) return false;
    const st = String(pr.status || "issued").toLowerCase();
    const code = pr.redeem_code || pr.code || pr.redeemCode;
    return st === "issued" && !!String(code || "").trim();
  }

  function shouldShowRewardCard() {
    // ✅ главный критерий: приз уже создан (issued) — показываем сразу, даже если не весь паспорт закрыт
    if (hasIssuedReward()) return true;

    // DEMO: как раньше — показываем на complete
    if (IS_DEMO && isComplete()) return true;

    // опционально: если хочешь показывать карточку "Приз готовится…" сразу после закрытия tier
    // (даже если redeem_code ещё не успел появиться в state)
    const active = getActiveTierIdSafe();
    if (active != null) {
      // если active tier уже COMPLETE — значит сервер ещё не переключил tier, можно показать
      if (isTierComplete(active)) return true;
      // если active tier НЕ complete — возможно мы уже перешли на следующий, а предыдущий был закрыт
      if (isAnyTierJustCompleted()) return true;
    }

    return false;
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
        try {
          pinInp && pinInp.focus && pinInp.focus();
        } catch (_) {}
      }, 50);
    }
  }

  function buildPassportModelFromState(st) {
    const pass = st && st.passport ? st.passport : null;

    // ✅ Prefer server passport snapshot
    if (pass && (Array.isArray(pass.stamps) || Array.isArray(pass.tiers))) {
      const stampsRaw = Array.isArray(pass.stamps) ? pass.stamps : [];
      const tiersRaw = Array.isArray(pass.tiers) ? pass.tiers : [];

      passportModel = {
        title: str(pass.title, str(P.title, "Паспорт")),
        subtitle: str(pass.subtitle, str(P.subtitle, "")),
        cover_url: str(pass.cover_url, str(P.cover_url, "")),
        grid_cols: Math.max(1, Math.min(6, toInt(pass.grid_cols ?? gridColsFallback, gridColsFallback))),
        collect_coins: Math.max(0, toInt(pass.collect_coins ?? toInt(P.collect_coins ?? 0, 0), 0)),
        btn_collect: str(pass.btn_collect, str(P.btn_collect, "Отметить")),
        btn_done: str(pass.btn_done, str(P.btn_done, "Получено")),

        active_tier_id:
          pass.active_tier_id === undefined || pass.active_tier_id === null
            ? null
            : Number(pass.active_tier_id),

        tiers: tiersRaw.map((t) => ({
          tier_id: Number(t.tier_id || 1),
          enabled: t.enabled === undefined ? true : !!t.enabled,
          title: str(t.title, ""),
          subtitle: str(t.subtitle, ""),
          stamps_total: toInt(t.stamps_total ?? 0, 0),
          stamps_collected: toInt(t.stamps_collected ?? 0, 0),
          progress_pct: toInt(t.progress_pct ?? 0, 0),
          reward: t.reward && typeof t.reward === "object" ? t.reward : { enabled: false },
        })),

        stamps: stampsRaw.map((x) => ({
          tier_id: Number(x.tier_id || 1),
          idx: toInt(x.idx ?? 0, 0),
          code: str(x.code, "").trim(),
          name: str(x.name, ""),
          desc: str(x.desc, ""),
          image: str(x.image, ""),
          collected: !!x.collected,
        })).filter((x) => x.code),

        progress: pass.progress
          ? {
              total: Math.max(0, toInt(pass.progress.total ?? 0, 0)),
              collected: Math.max(0, toInt(pass.progress.collected ?? 0, 0)),
              pct: Math.max(0, Math.min(100, toInt(pass.progress.pct ?? 0, 0))),
            }
          : { total: 0, collected: 0, pct: 0 },
      };

      // If server didn't fill progress (just in case)
      if (!passportModel.progress || !passportModel.progress.total) {
        const enabledTiers = passportModel.tiers.filter((t) => t.enabled !== false);
        const enabledTierIds = new Set(enabledTiers.map((t) => Number(t.tier_id)));
        const enabledStamps = passportModel.stamps.filter((s) => enabledTierIds.has(Number(s.tier_id)));
        const total = enabledStamps.length;
        const got = enabledStamps.reduce((a, s) => a + (s.collected ? 1 : 0), 0);
        passportModel.progress = { total, collected: got, pct: total ? Math.round((got / total) * 100) : 0 };
      }

      return;
    }

    // ✅ DEMO/preview fallback: props.tiers
    const pt = Array.isArray(P.tiers) ? P.tiers : [];
    if (pt.length) {
      const tiers = pt.map((t) => ({
        tier_id: Number(t?.tier_id || 1),
        enabled: t?.enabled === false ? false : true,
        title: str(t?.title, ""),
        subtitle: str(t?.subtitle, ""),
        stamps_total: Array.isArray(t?.stamps) ? t.stamps.length : 0,
        stamps_collected: 0,
        progress_pct: 0,
        reward: { enabled: !!t?.reward_enabled },
      }));

      const stamps = [];
      for (const t of pt) {
        const tid = Number(t?.tier_id || 1);
        const list = Array.isArray(t?.stamps) ? t.stamps : [];
        for (let i = 0; i < list.length; i++) {
          const s = list[i] || {};
          const code = str(s.code, "").trim();
          if (!code) continue;
          stamps.push({
            tier_id: tid,
            idx: i,
            code,
            name: str(s.name, ""),
            desc: str(s.desc, ""),
            image: str(s.image, ""),
            collected: IS_DEMO ? demoCollected.has(code) : false,
          });
        }
      }

      const enabledTierIds = new Set(tiers.filter((t) => t.enabled !== false).map((t) => Number(t.tier_id)));
      const enabledStamps = stamps.filter((s) => enabledTierIds.has(Number(s.tier_id)));
      const total = enabledStamps.length;
      const got = enabledStamps.reduce((a, s) => a + (IS_DEMO ? (demoCollected.has(s.code) ? 1 : 0) : 0), 0);
      const pct = total ? Math.round((got / total) * 100) : 0;

      // active tier = first enabled where not done; else last enabled
      let activeTierId = null;
      const enabledTiers = tiers.filter((t) => t.enabled !== false);
      for (const t of enabledTiers) {
        const tid = Number(t.tier_id);
        const tierStamps = enabledStamps.filter((s) => Number(s.tier_id) === tid);
        const done = tierStamps.length > 0 && tierStamps.every((s) => demoCollected.has(s.code));
        if (!done && tierStamps.length > 0) {
          activeTierId = tid;
          break;
        }
      }
      if (activeTierId === null && enabledTiers.length) activeTierId = Number(enabledTiers[enabledTiers.length - 1].tier_id);

      passportModel = {
        title: str(P.title, "Паспорт"),
        subtitle: str(P.subtitle, ""),
        cover_url: str(P.cover_url, ""),
        grid_cols: Math.max(1, Math.min(6, toInt(P.grid_cols ?? 3, 3))),
        collect_coins: Math.max(0, toInt(P.collect_coins ?? 0, 0)),
        btn_collect: str(P.btn_collect, "Отметить"),
        btn_done: str(P.btn_done, "Получено"),
        active_tier_id: activeTierId,
        tiers,
        stamps,
        progress: { total, collected: got, pct },
      };
      return;
    }

    // legacy last fallback: props.styles flat
    const legacy = Array.isArray(P.styles) ? P.styles : [];
    passportModel = {
      ...passportModel,
      title: str(P.title, "Паспорт"),
      subtitle: str(P.subtitle, ""),
      cover_url: str(P.cover_url, ""),
      grid_cols: gridColsFallback,
      tiers: [{ tier_id: 1, enabled: true, title: "", subtitle: "", stamps_total: legacy.length, stamps_collected: 0, progress_pct: 0, reward: { enabled: false } }],
      stamps: legacy.map((s, i) => ({
        tier_id: 1,
        idx: i,
        code: str(s?.code || s?.style_id || s?.styleId, "").trim(),
        name: str(s?.name || s?.title, ""),
        desc: str(s?.desc || s?.subtitle, ""),
        image: str(s?.image, ""),
        collected: false,
      })).filter((x) => x.code),
      progress: { total: legacy.length, collected: 0, pct: 0 },
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
    const total = Math.max(0, toInt(p.total ?? 0, 0));
    const got = Math.max(0, toInt(p.collected ?? 0, 0));

    if (!total) {
      progWrap.hidden = true;
      return;
    }
    progWrap.hidden = false;

    const pct = total ? clamp01(got / total) : 0;
    progBar.style.width = `${Math.round(pct * 100)}%`;
    progTxt.textContent = `${got}/${total}`;
  }

  // ===== QR helpers (from state.passport_reward.redeem_code + state.bot_username)
  const completeShowQr = P.complete_show_qr === undefined ? true : !!P.complete_show_qr;
  const completeHideHeader = P.complete_hide_header === undefined ? true : !!P.complete_hide_header;

  const qrTitleText = str(P.qr_title, "🎁 Получите приз");
  const qrHelpText = str(P.qr_text, "Покажите этот QR кассиру, чтобы получить подарок.");
  const qrShowCodeText = !!P.qr_show_code_text;

  const qrService = str(P.qr_service, "https://quickchart.io/qr");
  const qrSize = Math.max(120, num(P.qr_size, 260));
  const qrMargin = Math.max(0, num(P.qr_margin, 2));

  // ===== Sheet swipe (down-to-close)
  const SWIPE_CLOSE_PX = Math.max(50, num(P.sheet_swipe_close_px, 90));
  const SWIPE_VELOCITY = Math.max(0.3, num(P.sheet_swipe_velocity, 0.6));
  const SWIPE_EDGE_PX = Math.max(6, num(P.sheet_swipe_edge_px, 6));

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
        try {
          TG.BackButton.offClick && TG.BackButton.offClick(closeSheet);
        } catch (_) {}
        try {
          TG.BackButton.hide();
        } catch (_) {}
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
      try {
        sheetEl.hidden = true;
      } catch (_) {}
    }, 180);
  }

  try {
    sheetCloseEls &&
      sheetCloseEls.forEach &&
      sheetCloseEls.forEach((el) => {
        el.addEventListener("click", closeSheet);
      });
  } catch (_) {}

  (function setupSheetSwipe() {
    if (!sheetEl || !sheetPanel) return;

    let dragging = false;
    let startY = 0,
      startX = 0;
    let lastY = 0;
    let startT = 0;

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

      const y = getY(ev);
      const x = getX(ev);
      if (!Number.isFinite(y) || !Number.isFinite(x)) return;

      dragging = true;
      gestureLocked = false;
      isVerticalDrag = false;

      startY = y;
      lastY = y;
      startX = x;
      startT = performance.now();

      setSheetDragState(true);
      sheetPanel.style.willChange = "transform";
    }

    function onMove(ev) {
      if (!dragging) return;

      const y = getY(ev);
      const x = getX(ev);
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

      try {
        ev.preventDefault();
      } catch (_) {}
      try {
        ev.stopPropagation();
      } catch (_) {}
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

    win.addEventListener("keydown", (e) => {
      try {
        if (!sheetOpen) return;
        if (e.key === "Escape") closeSheet();
      } catch (_) {}
    });
  })();

  function setQrVisible(v) {
    if (v) openSheet();
    else closeSheet();
  }

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

  function getPassportReward() {
    const pr =
      state && (state.passport_reward || state.reward || state.pass_reward)
        ? state.passport_reward || state.reward || state.pass_reward
        : null;

    // DEMO fallback: when complete, fake redeem code
    if (!pr && IS_DEMO && isComplete()) {
      return {
        redeem_code: "DEMO-REDEEM-0001",
        status: "issued",
        prize_title: "Демо приз",
        prize_code: "demo_prize",
        coins: 0,
      };
    }
    return pr;
  }

  function getRedeemDeepLink() {
    const pr = getPassportReward();
    const code =
      pr && (pr.redeem_code || pr.code || pr.redeemCode)
        ? String(pr.redeem_code || pr.code || pr.redeemCode).trim()
        : "";
    if (!code) return "";

    const botRaw =
      (state && (state.bot_username || state.botUsername)) ||
      (P && (P.bot_username || P.botUsername)) ||
      "";
    const bot = botRaw ? String(botRaw).replace(/^@/, "").trim() : "";

    const startPayload = "redeem_" + code;

    if (bot) return `https://t.me/${bot}?start=${encodeURIComponent(startPayload)}`;
    return startPayload;
  }

  async function renderQr() {
    if (!sheetEl) return;

    // ✅ QR доступен когда есть issued reward (redeem_code), а не когда complete весь паспорт
    if (!completeShowQr || !hasIssuedReward()) {
      setQrVisible(false);
      return;
    }

    const link = getRedeemDeepLink();
    if (!link) {
      setQrVisible(true);
      if (qrTitle) qrTitle.textContent = qrTitleText;
      if (qrText) qrText.textContent = "Приз готовится… обновите экран";
      setQrTextLink("Нет redeem_code в state");
      return;
    }

    setQrVisible(true);
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
        ctx2.fillStyle = "#fff";
        ctx2.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
        ctx2.fillStyle = "#000";
        ctx2.font = "12px ui-monospace, Menlo, Consolas, monospace";
        ctx2.fillText("QR load error", 10, 20);
        resolve(false);
      };
      img.src = qUrl;
    });
  }

  async function renderMode() {
    const done = isComplete();
    const rewardReady = hasIssuedReward();

    // ✅ прячем грид только когда реально есть приз (QR), иначе пусть остаётся видимым (следующий tier)
    if (gridEl) gridEl.hidden = !!(completeShowQr && rewardReady);

        if (completeShowQr && rewardReady && completeHideHeader) {
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
  }

  function renderReward() {
    if (!rewardWrap) return;

    const pr = getPassportReward();

    const anyTierRewardEnabled =
      passportModel &&
      Array.isArray(passportModel.tiers) &&
      passportModel.tiers.some(
        (t) => t && (t.reward && t.reward.enabled === true) // from state.ts reward: {enabled:false} now, but keep
      );

    // ✅ show reward if completed AND (reward exists OR tiers configured rewards in props)
    const tiersFromProps = Array.isArray(P.tiers) ? P.tiers : [];
    const anyRewardInProps = tiersFromProps.some((t) => t && (t.reward_enabled === true || Number(t.reward_enabled) === 1));

        // ✅ теперь показываем награду по tier (когда reward issued), а не только когда весь паспорт complete
    const show = shouldShowRewardCard() && (!!pr || anyTierRewardEnabled || anyRewardInProps);

    if (!show) {
      rewardWrap.hidden = true;
      return;
    }

    rewardWrap.hidden = false;
    if (rewardTitle) rewardTitle.textContent = str(P.reward_title, "🎁 Приз");

    let codeToShow = "";
    let hint = "";

    if (pr && (pr.redeem_code || pr.code)) {
      codeToShow = String(pr.redeem_code || pr.code);
      hint = str(P.reward_text, "");
    } else if (pr && Number(pr.coins) > 0) {
      hint = str(P.reward_text, "");
      const coinsLine = `Начислено монет: ${Number(pr.coins)}`;
      hint = hint ? hint + "\n\n" + coinsLine : coinsLine;
    } else {
      hint = str(P.reward_text, "");
      const extra = "Приз готовится… обновите экран";
      hint = hint ? hint + "\n\n" + extra : extra;
    }

    if (rewardText) rewardText.textContent = hint;

    if (rewardCode) {
      if (codeToShow) {
        rewardCode.hidden = false;
        rewardCode.textContent = codeToShow;
      } else {
        rewardCode.hidden = true;
        rewardCode.textContent = "";
      }
    }

    if (openQrBtn) {
      const hasCode = !!(pr && (pr.redeem_code || pr.code || pr.redeemCode));
      openQrBtn.style.display = hasCode ? "" : "none";
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
      <button class="pp-card ${disabled ? "is-disabled" : ""} ${done ? "is-done" : ""}" type="button"
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

    const cols = Math.max(1, Math.min(6, toInt(passportModel.grid_cols ?? gridColsFallback, gridColsFallback)));
    const stamps = Array.isArray(passportModel.stamps) ? passportModel.stamps : [];

    // group stamps by tier
    const byTier = new Map();
    for (const s of stamps) {
      const tid = Number(s.tier_id || 1);
      if (!byTier.has(tid)) byTier.set(tid, []);
      byTier.get(tid).push(s);
    }

    // choose tier order
    const tiersOrder =
      Array.isArray(passportModel.tiers) && passportModel.tiers.length
        ? passportModel.tiers.map((t) => Number(t.tier_id || 1))
        : Array.from(byTier.keys()).sort((a, b) => a - b);

    let global = 0;
    const htmlParts = [];

    for (const tid of tiersOrder) {
      const list = byTier.get(tid) || [];
      if (!list.length) continue;

      const tierMeta =
        Array.isArray(passportModel.tiers) && passportModel.tiers.length
          ? passportModel.tiers.find((x) => Number(x.tier_id || 0) === Number(tid))
          : null;

      const enabled = tierMeta ? tierMeta.enabled !== false : true;
      const isActive =
        passportModel.active_tier_id !== null && Number(passportModel.active_tier_id) === Number(tid);

      const tTitle = tierMeta && tierMeta.title ? String(tierMeta.title) : `Круг ${tid}`;
      const tSub = tierMeta && tierMeta.subtitle ? String(tierMeta.subtitle) : "";

      const got =
        tierMeta && tierMeta.stamps_collected !== undefined ? Number(tierMeta.stamps_collected || 0) : null;
      const total =
        tierMeta && tierMeta.stamps_total !== undefined ? Number(tierMeta.stamps_total || 0) : null;

      const isDoneTier = total !== null && total > 0 && got !== null && got >= total;

      htmlParts.push(`
        <div class="pp-tier ${isActive ? "is-active" : ""} ${enabled ? "" : "is-disabled"} ${isDoneTier ? "is-done" : ""}">
          <div class="pp-tier-h">
            <div class="pp-tier-t">
              <div class="pp-tier-title">${escapeHtml(tTitle || `Круг ${tid}`)}</div>
              ${tSub ? `<div class="pp-tier-sub">${escapeHtml(tSub)}</div>` : ``}
            </div>
            ${
              got !== null && total !== null && total > 0
                ? `<div class="pp-tier-meta">${escapeHtml(`${got}/${total}`)}</div>`
                : ``
            }
          </div>

          <div class="pp-tier-grid" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:10px;">
            ${list
              .map((s) => {
                const card = stampCardHtml(s, global);
                global++;
                return card;
              })
              .join("")}
          </div>
        </div>
      `);
    }

    // Fallback: no tiers
    if (!htmlParts.length) {
      gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      gridEl.innerHTML = stamps.map((s) => stampCardHtml(s, global++)).join("");
    } else {
      gridEl.innerHTML = htmlParts.join("");
    }

    // bind clicks
    gridEl.querySelectorAll(".pp-card").forEach((card) => {
      const sid = card.getAttribute("data-sid") || "";
      card.addEventListener("click", async () => {
        if (!sid) return;
        if (card.disabled) return;
        if (isDone(sid)) return;
        if (busy.has(sid)) return;
        await onCollectClick(sid);
      });
    });
  }

  async function applyState(st) {
    state = st || {};
    collected = normalizeCollected(state);

    buildPassportModelFromState(state);

    // reconcile collected flags inside stamps for render
    if (passportModel && Array.isArray(passportModel.stamps)) {
      passportModel.stamps = passportModel.stamps.map((s) => ({
        ...s,
        collected: isDone(String(s.code || "")),
      }));

      // If progress missing, compute on enabled tiers
      if (!passportModel.progress || !passportModel.progress.total) {
        const enabledTierIds = new Set(
          (passportModel.tiers || [])
            .filter((t) => t && t.enabled !== false)
            .map((t) => Number(t.tier_id))
        );
        const enabledStamps = passportModel.stamps.filter((s) => enabledTierIds.has(Number(s.tier_id)));
        const total = enabledStamps.length;
        const got = enabledStamps.reduce((a, x) => a + (x.collected ? 1 : 0), 0);
        passportModel.progress = {
          total,
          collected: got,
          pct: total ? Math.round((got / total) * 100) : 0,
        };
      }
    }

    renderHeader();
    renderProgress();
    renderReward();
    renderGrid();
    try {
      await renderMode();
    } catch (_) {}
  }

  async function refreshFromServer() {
    // ✅ DEMO mode: no apiFn + no publicId => local-only state from props
    if (IS_DEMO) {
      const fake = {
        bot_username: "",
        passport_reward: null,
        passport: {
          title: str(P.title, "Паспорт"),
          subtitle: str(P.subtitle, ""),
          cover_url: str(P.cover_url, ""),
          grid_cols: toInt(P.grid_cols ?? 3, 3),
          collect_coins: toInt(P.collect_coins ?? 0, 0),
          active_tier_id: null,
          tiers: [],
          stamps: [],
          progress: { total: 0, collected: 0, pct: 0 },
        },
      };

      const tiers = Array.isArray(P.tiers) ? P.tiers : [];
      if (tiers.length) {
        fake.passport.tiers = tiers.map((t) => ({
          tier_id: Number(t?.tier_id || 1),
          enabled: t?.enabled === false ? false : true,
          title: str(t?.title, ""),
          subtitle: str(t?.subtitle, ""),
          stamps_total: Array.isArray(t?.stamps) ? t.stamps.length : 0,
          stamps_collected: 0,
          progress_pct: 0,
          reward: { enabled: !!t?.reward_enabled },
        }));

        for (const t of tiers) {
          const tid = Number(t?.tier_id || 1);
          const list = Array.isArray(t?.stamps) ? t.stamps : [];
          for (let i = 0; i < list.length; i++) {
            const s = list[i] || {};
            const code = str(s?.code, "").trim();
            if (!code) continue;
            fake.passport.stamps.push({
              tier_id: tid,
              idx: i,
              code,
              name: str(s?.name, ""),
              desc: str(s?.desc, ""),
              image: str(s?.image, ""),
              collected: demoCollected.has(code),
            });
          }
        }

        // compute progress on enabled tiers
        const enabledTierIds = new Set(fake.passport.tiers.filter((t) => t.enabled !== false).map((t) => Number(t.tier_id)));
        const enabledStamps = fake.passport.stamps.filter((s) => enabledTierIds.has(Number(s.tier_id)));
        const total = enabledStamps.length;
        const got = enabledStamps.reduce((a, s) => a + (demoCollected.has(s.code) ? 1 : 0), 0);
        fake.passport.progress = { total, collected: got, pct: total ? Math.round((got / total) * 100) : 0 };

        // active tier
        const enabledTiers = fake.passport.tiers.filter((t) => t.enabled !== false);
        let activeTierId = null;
        for (const t of enabledTiers) {
          const tid = Number(t.tier_id);
          const tierStamps = enabledStamps.filter((s) => Number(s.tier_id) === tid);
          const done = tierStamps.length > 0 && tierStamps.every((s) => demoCollected.has(s.code));
          if (!done && tierStamps.length > 0) {
            activeTierId = tid;
            break;
          }
        }
        if (activeTierId === null && enabledTiers.length) activeTierId = Number(enabledTiers[enabledTiers.length - 1].tier_id);
        fake.passport.active_tier_id = activeTierId;
      }

      await applyState(fake);
      return;
    }

    const j = await apiState();
    const st =
      j && (j.state || j.fresh_state || j.fresh || j.data || j.result)
        ? j.state || j.fresh_state || j.fresh || j.data || j.result
        : j;
    await applyState(st);
  }

  async function collectDirectPin(styleId, pin) {
    if (IS_DEMO) {
      // any PIN ok in demo
      demoCollected.add(String(styleId));
      await refreshFromServer();
      return;
    }

    const res = await apiCollect(styleId, pin);
    const st = res && (res.fresh_state || res.state || res.result) ? res.fresh_state || res.state || res.result : res;
    if (st) await applyState(st);
    else await refreshFromServer();
  }

  async function collectNoPin(styleId) {
    if (IS_DEMO) {
      demoCollected.add(String(styleId));
      await refreshFromServer();
      return;
    }

    const res = await apiCollect(styleId, "");
    const st = res && (res.fresh_state || res.state || res.result) ? res.fresh_state || res.state || res.result : res;
    if (st) await applyState(st);
    else await refreshFromServer();
  }

  async function collectBotPin() {
    await uiAlert("⚠️ Режим bot_pin пока не включён. Используй direct_pin (модалка).");
  }

  async function onCollectClick(styleId) {
    try {
      haptic("light");

      // ✅ direct_pin: open modal
      if (requirePin && collectMode === "direct_pin") {
        selectedStyleId = styleId;

        // resolve name from passportModel.stamps
        const hit = (passportModel.stamps || []).find((s) => String(s.code) === String(styleId));
        selectedStyleName = hit ? String(hit.name || "") : "";

        if (modalTitle) modalTitle.textContent = "Введите PIN";
        if (modalSub) modalSub.textContent = selectedStyleName ? `Штамп: ${selectedStyleName}` : "";
        setModalVisible(true);
        return;
      }

      busy.add(styleId);
      renderGrid();

      if (requirePin) {
        await collectBotPin(styleId);
      } else {
        await collectNoPin(styleId);
      }
    } catch (e) {
      await uiAlert(e && e.message ? e.message : "Ошибка");
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
        if (modalErr) {
          modalErr.hidden = false;
          modalErr.textContent = "Введите PIN";
        }
        return;
      }
      if (modalErr) {
        modalErr.hidden = true;
        modalErr.textContent = "";
      }

      try {
        haptic("light");

        if (selectedStyleId) {
          busy.add(selectedStyleId);
          renderGrid();
        }

        await collectDirectPin(selectedStyleId, pin);
        setModalVisible(false);
      } catch (e) {
        const msg = e && e.message ? e.message : "PIN неверный";
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

  // init
  setQrVisible(false);

  if (openQrBtn) {
    openQrBtn.addEventListener("click", async () => {
      openSheet();
      try {
        await renderQr();
      } catch (_) {}
    });
  }

  try {
    if (ctx && ctx.state) await applyState(ctx.state);
    else await refreshFromServer();
  } catch (e) {
    await uiAlert(e && e.message ? e.message : "Не удалось загрузить состояние");
  }
}
