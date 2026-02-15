/* Bonus Wheel One — Reward Wallet runtime
   - spin does NOT block on unclaimed
   - rewards list under buttons
   - “Get” shows TG popup with code + QR (if QR lib exists)
   - logs with stable codes: sg.wheel.wallet.*
*/

(function(){
  const win = window;

  function log(code, extra){
    try{
      // single-line, low volume
      console.log(code, extra ? extra : {});
    }catch(_){}
  }

  function safeJson(v){
    try{ return JSON.stringify(v); }catch(_){ return ""; }
  }

  function getTG(){
    return (win.Telegram && win.Telegram.WebApp) ? win.Telegram.WebApp : null;
  }

  function getPublicId(){
    try{
      const u = new URL(location.href);
      return u.searchParams.get("public_id") || u.searchParams.get("app") || (win.MiniState && win.MiniState.public_id) || "";
    }catch(_){
      return (win.MiniState && win.MiniState.public_id) || "";
    }
  }

  function getInitData(){
    const TG = getTG();
    return (TG && TG.initData) ? TG.initData : "";
  }

  function getCoins(){
    const ms = win.MiniState || {};
    const c = (ms.user && (ms.user.coins ?? ms.user.balance)) ?? ms.coins ?? 0;
    const n = Number(c);
    return Number.isFinite(n) ? n : 0;
  }

  function setCoins(next){
    const n = Number(next);
    if (!Number.isFinite(n)) return;
    win.MiniState = win.MiniState || {};
    win.MiniState.user = win.MiniState.user || {};
    win.MiniState.user.coins = n;
  }

  function getSpinCost(){
    const ms = win.MiniState || {};
    const cfgCost = ms?.config?.wheel?.spin_cost;
    if (cfgCost !== undefined && cfgCost !== null){
      const n = Number(cfgCost);
      if (Number.isFinite(n)) return n;
    }
    const propsCost = ms?.props?.spin_cost;
    const n2 = Number(propsCost);
    return Number.isFinite(n2) ? n2 : 10;
  }

  async function apiCall(method, data){
    const publicId = getPublicId();
    const initData = getInitData();
    const url = new URL(`${location.origin}/api/mini/${method}`);
    if (publicId) url.searchParams.set("public_id", publicId);

    const body = Object.assign({}, data || {});
    // send both keys to be safe with different parsers
    body.init_data = body.init_data || initData;
    body.initData = body.initData || initData;

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit"
    });

    const txt = await res.text();
    let json = null;
    try{ json = txt ? JSON.parse(txt) : null; }catch(_){}

    if (!res.ok){
      const err = new Error(`api ${method} ${res.status}: ${txt?.slice(0,300)}`);
      err.status = res.status;
      err.payload = json;
      throw err;
    }
    return json || {};
  }

  // ===== QR helper: use existing global if present, else show code only
  function hasQrLib(){
    // many libs expose QRCode or qrcodegen
    return !!(win.QRCode || win.qrcodegen || win.QRious);
  }

  function showGetPopup(title, code){
    const TG = getTG();
    const msg = `Код выдачи:\n${code}\n\nПокажите кассиру.`;

    // If we have TG popup only (no HTML), we show code text.
    // QR rendering can be added later in an in-block modal; for now keep stable.
    try{
      if (TG && TG.showPopup){
        TG.showPopup({
          title: title || "Приз",
          message: msg + (hasQrLib() ? "\n\nQR: доступен (добавим отрисовку в следующем патче)" : ""),
          buttons: [
            { id:"copy", type:"default", text:"Скопировать" },
            { type:"ok" }
          ]
        }, async (btnId) => {
          if (btnId === "copy"){
            try{
              await navigator.clipboard.writeText(code);
              log("sg.wheel.wallet.get.copy.ok");
              TG.showPopup({ title:"Готово", message:"Код скопирован ✅", buttons:[{type:"ok"}] });
            }catch(e){
              log("sg.wheel.wallet.get.copy.fail", { error: String(e && e.message || e) });
              try{ prompt("Скопируйте код:", code); }catch(_){}
            }
          }
        });
        return;
      }
    }catch(_){}

    // fallback
    try{ prompt("Код выдачи (скопируйте):", code); }catch(_){}
  }

  // ===== Mount
  function mount(root){
    const $ = (sel) => root.querySelector(sel);

    const elTitle = $("[data-bw-title]");
    const elSub = $("[data-bw-subtitle]");
    const elWheel = $("[data-bw-wheel]");
    const elCoins = $("[data-bw-coins]");
    const btnSpin = $("[data-bw-spin]");
    const elWalletCount = $("[data-bw-wallet-count]");
    const elWalletList = $("[data-bw-wallet-list]");

    if (!elWheel || !btnSpin || !elCoins || !elWalletCount || !elWalletList){
      log("sg.wheel.wallet.fail.render", { error: "missing_dom" });
      return;
    }

    const TG = getTG();
    try{
      if (TG){
        TG.ready();
        TG.expand();
      }
    }catch(_){}

    let spinning = false;
    let rewards = [];
    let poll = 0;

    function fmtIssuedAt(v){
      if (!v) return "";
      // keep simple: show HH:MM or date if present
      const s = String(v);
      return s.replace("T"," ").replace("Z","").slice(0,16);
    }

    function renderWallet(){
      elWalletCount.textContent = String(rewards.length);

      if (!rewards.length){
        elWalletList.innerHTML = `<div class="bw-empty">Пока нет призов 😌</div>`;
        return;
      }

      const html = rewards.map((r) => {
        const title = String(r.prize_title || r.title || "Приз");
        const code = String(r.redeem_code || r.code || "");
        const img = r.img ? String(r.img) : "";
        const issuedAt = fmtIssuedAt(r.issued_at || r.issuedAt);

        const thumb = img
          ? `<div class="bw-thumb"><img src="${img}" alt=""></div>`
          : `<div class="bw-thumb"></div>`;

        return `
          <div class="bw-card" data-reward-id="${String(r.id || "")}" data-reward-code="${code.replace(/"/g,'&quot;')}">
            ${thumb}
            <div>
              <div class="bw-cardTitle">${title}</div>
              <div class="bw-cardMeta">${issuedAt ? ("Выдано: " + issuedAt) : ""}</div>
            </div>
            <button class="bw-get" type="button" data-bw-get>Получить</button>
          </div>
        `;
      }).join("");

      elWalletList.innerHTML = html;

      // bind clicks
      elWalletList.querySelectorAll("[data-bw-get]").forEach((b) => {
        b.addEventListener("click", (ev) => {
          const card = ev.currentTarget && ev.currentTarget.closest(".bw-card");
          const code = card ? (card.getAttribute("data-reward-code") || "") : "";
          const title = card ? (card.querySelector(".bw-cardTitle")?.textContent || "Приз") : "Приз";
          log("sg.wheel.wallet.get.open", { id: card?.getAttribute("data-reward-id") || "" });
          if (code) showGetPopup(title, code);
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
        rewards = Array.isArray(r.rewards) ? r.rewards : [];
        log("sg.wheel.wallet.ok", { count: rewards.length });
        renderWallet();
      }catch(e){
        log("sg.wheel.wallet.fail.api", { error: String(e && e.message || e) });
        rewards = [];
        renderWallet();
      }
    }

    function updateUI(){
      elCoins.textContent = String(getCoins());
      const cost = getSpinCost();
      const canSpin = (getCoins() >= cost) && !spinning; // IMPORTANT: no has_unclaimed
      btnSpin.disabled = !canSpin;
      btnSpin.textContent = spinning ? "Крутим..." : `Крутануть (-${cost})`;
      if (elWheel) elWheel.classList.toggle("is-spinning", !!spinning);
    }

    async function doSpin(){
      if (spinning) return;
      spinning = true;
      updateUI();

      try{
        const cost = getSpinCost();
        if (getCoins() < cost){
          spinning = false;
          updateUI();
          return;
        }

        const res = await apiCall("spin", {}); // your worker has /api/mini/spin route
        // try to update coins from response state if present
        const fresh = res && (res.fresh_state || res.state || res);
        if (fresh && typeof fresh === "object"){
          // common patterns: fresh.coins, fresh.user.coins
          const c = (fresh.user && fresh.user.coins) ?? fresh.coins;
          if (c !== undefined) setCoins(c);
        }else{
          // fallback: deduct locally
          setCoins(getCoins() - cost);
        }

        // after spin refresh wallet
        await loadRewards();
      }catch(e){
        // leave wheel stable
        log("sg.wheel.wallet.fail.api", { error: String(e && e.message || e) });
      }finally{
        spinning = false;
        updateUI();
      }
    }

    function startPoll(){
      if (poll) return;
      poll = win.setInterval(() => {
        loadRewards();
      }, 20000);
      log("sg.wheel.wallet.poll.start");
    }

    function stopPoll(){
      try{ poll && win.clearInterval(poll); }catch(_){}
      poll = 0;
      log("sg.wheel.wallet.poll.stop");
    }

    btnSpin.addEventListener("click", doSpin);

    // init
    updateUI();
    loadRewards();
    startPoll();

    // teardown (if your runtime calls destroy)
    root._bw_destroy = () => {
      stopPoll();
    };
  }

  // entrypoint: your runtime env usually provides root element
  function init(){
    const root = document.querySelector("[data-bw-root]") || document.body;
    mount(root);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }
})();
