// stylesPassport/runtime.js
// Universal passport (stamps/collection) — SG blocks format.
// API priority: ctx.api -> window.api -> POST /api/mini/<method>?public_id=...

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

  // ---------- resolve public_id
  const pid =
    str(ctx.publicId || ctx.public_id || "", "").trim() ||
    str(props.app_public_id || props.public_id || "", "").trim() ||
    str(win.SG_APP_PUBLIC_ID || "", "").trim();

  if (!pid){
    await uiAlert("❌ stylesPassport: не найден public_id");
    return;
  }

  // ---------- API
  const apiFn =
    (typeof ctx.api === "function") ? ctx.api :
    (typeof win.api === "function") ? win.api :
    null;

  async function apiCall(method, payload = {}) {
    if (apiFn) return await apiFn(method, payload);

    const url = `/api/mini/${encodeURIComponent(method)}?public_id=${encodeURIComponent(pid)}`;

    const initData =
      (ctx && (ctx.initData || ctx.init_data)) ? (ctx.initData || ctx.init_data) :
      (TG && TG.initData ? TG.initData : "");

    const u =
      (ctx && (ctx.tg_user || ctx.tgUser)) ||
      (TG && TG.initDataUnsafe && TG.initDataUnsafe.user) ||
      null;

    const tg_user = u ? {
      id: u.id,
      username: u.username,
      first_name: u.first_name,
      last_name: u.last_name
    } : null;

    const body = {
      ...payload,
      init_data: initData,
      tg_user,
      app_public_id: pid
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

  const modalEl  = root.querySelector("[data-pp-modal]");
  const pinInp   = root.querySelector("[data-pp-pin-inp]");
  const modalOk  = root.querySelector("[data-pp-modal-ok]");
  const modalCancel = root.querySelector("[data-pp-modal-cancel]");
  const modalClose  = root.querySelector("[data-pp-modal-close]");
  const modalTitle  = root.querySelector("[data-pp-modal-title]");
  const modalSub    = root.querySelector("[data-pp-modal-sub]");
  const modalErr    = root.querySelector("[data-pp-modal-err]");

  // ---------- props
  const P = props || {};
  const styles = Array.isArray(P.styles) ? P.styles : [];
  const gridCols = Math.max(1, Math.min(6, num(P.grid_cols, 3)));
  const requirePin = !!P.require_pin;
  const collectMode = str(P.collect_mode, "bot_pin");
  const btnCollect = str(P.btn_collect, "Отметить");
  const btnDone = str(P.btn_done, "Получено");

  function getStyleId(st){
    return str(st && st.code, "").trim();
  }

  // ---------- state
  let collected = new Set();
  let busy = new Set();
  let selectedStyleId = "";
  let selectedStyleName = "";

  function isDone(styleId){ return collected.has(styleId); }

  function setModalVisible(v){
    if (!modalEl) return;
    modalEl.hidden = !v;
    if (!v){
      if (modalErr){ modalErr.hidden=true; modalErr.textContent=""; }
      if (pinInp) pinInp.value="";
    } else {
      setTimeout(()=>{ try{ pinInp && pinInp.focus(); }catch(_){} },50);
    }
  }

  function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function renderHeader(){
    if (titleEl) titleEl.textContent = str(P.title,"Паспорт");
    if (subEl) subEl.textContent = str(P.subtitle,"");
    const coverUrl = str(P.cover_url,"").trim();
    if (coverEl && coverImg){
      if (coverUrl){ coverEl.hidden=false; coverImg.src=coverUrl; }
      else { coverEl.hidden=true; coverImg.removeAttribute("src"); }
    }
  }

  function renderProgress(){
    const total = styles.length;
    const got = collected.size;
    if (!progWrap||!progBar||!progTxt) return;
    if (!total){ progWrap.hidden=true; return; }
    progWrap.hidden=false;
    const pct = total?clamp01(got/total):0;
    progBar.style.width = `${Math.round(pct*100)}%`;
    progTxt.textContent = `${got}/${total}`;
  }

  function renderReward(){
    const enabled = !!P.reward_enabled;
    const total = styles.length;
    const got = collected.size;
    if (!rewardWrap) return;
    if (!enabled || !total || got<total){ rewardWrap.hidden=true; return; }
    rewardWrap.hidden=false;
    if (rewardTitle) rewardTitle.textContent=str(P.reward_title,"🎁 Приз");
    if (rewardText) rewardText.textContent=str(P.reward_text,"");
    const pref=str(P.reward_code_prefix,"PASS-");
    const tgId=str(TG?.initDataUnsafe?.user?.id||"");
    if (rewardCode){ rewardCode.hidden=false; rewardCode.textContent=pref+tgId.slice(-6); }
  }

  function cardHtml(st,idx){
    const sid=getStyleId(st);
    const done=sid && isDone(sid);
    const img=str(st.image,"").trim();
    const name=str(st.name||st.title,sid||`#${idx+1}`);
    const desc=str(st.desc||st.subtitle,"");
    const disabled=!sid||done||busy.has(sid);
    const badge=done?"✓":`${idx+1}`;
    return `
      <div class="pp-card" data-sid="${escapeHtml(sid)}">
        <div class="pp-badge">${escapeHtml(badge)}</div>
        <div class="pp-card-top">
          <div class="pp-ico">${img?`<img src="${escapeHtml(img)}">`:`<span>★</span>`}</div>
          <div class="pp-txt">
            <div class="pp-name">${escapeHtml(name)}</div>
            ${desc?`<div class="pp-desc">${escapeHtml(desc)}</div>`:''}
          </div>
        </div>
        <div class="pp-card-bot">
          <button ${disabled?"disabled":""}>${escapeHtml(done?btnDone:btnCollect)}</button>
        </div>
      </div>
    `;
  }

  function renderGrid(){
    if (!gridEl) return;
    gridEl.style.gridTemplateColumns=`repeat(${gridCols},1fr)`;
    gridEl.innerHTML=styles.map(cardHtml).join("");
    gridEl.querySelectorAll(".pp-card").forEach(card=>{
      const sid=card.dataset.sid;
      const btn=card.querySelector("button");
      btn.onclick=()=>{ if(sid && !isDone(sid) && !busy.has(sid)) onCollectClick(sid); };
    });
  }

  async function refresh(){
    const j=await apiCall("state",{});
    applyState(j.state||j);
  }

  function applyState(st){
    collected=new Set(Array.isArray(st.styles)?st.styles.map(String):[]);
    renderProgress(); renderReward(); renderGrid();
  }

  async function collectDirectPin(styleId,pin){
    const r=await apiCall("style.collect",{style_id:styleId,pin});
    if(r.fresh_state) applyState(r.fresh_state); else await refresh();
  }

  async function collectBotPin(styleId){
    await apiCall("passport.pin_start",{style_id:styleId});
    await uiAlert("Я попросил бота запросить PIN в чате.\nВведите PIN в переписке с ботом.");
  }

  async function collectNoPin(styleId){
    const r=await apiCall("style.collect",{style_id:styleId,pin:""});
    if(r.fresh_state) applyState(r.fresh_state); else await refresh();
  }

  async function onCollectClick(styleId){
    busy.add(styleId); renderGrid();
    try{
      if(requirePin){
        if(collectMode==="direct_pin"){
          selectedStyleId=styleId;
          setModalVisible(true);
        }else{
          await collectBotPin(styleId);
        }
      }else{
        await collectNoPin(styleId);
      }
    }catch(e){ await uiAlert(e.message||"Ошибка"); }
    finally{ busy.delete(styleId); renderGrid(); }
  }

  if(modalOk){
    modalOk.onclick=async()=>{
      const pin=str(pinInp?.value,"").trim();
      if(!pin){ if(modalErr){modalErr.hidden=false;modalErr.textContent="Введите PIN";} return; }
      try{ await collectDirectPin(selectedStyleId,pin); setModalVisible(false); }
      catch(e){ if(modalErr){modalErr.hidden=false;modalErr.textContent=e.message||"PIN неверный";} }
    };
  }
  if(modalCancel) modalCancel.onclick=()=>setModalVisible(false);
  if(modalClose) modalClose.onclick=()=>setModalVisible(false);

  renderHeader(); renderGrid();
  try{ ctx.state?applyState(ctx.state):await refresh(); }
  catch(e){ await uiAlert(e.message||"Не удалось загрузить"); }
}
