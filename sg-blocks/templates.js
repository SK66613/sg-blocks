
/*! Blocks Library Loader (manifest-based) */
(function(){
  const VER = window.__VER__ || new URLSearchParams(location.search).get("v") || Date.now().toString();
  const LIB_BASE = (function(){
    if (window.__BLOCKS_BASE__) return String(window.__BLOCKS_BASE__);
    try{ return new URL("blocks/", (document.currentScript && document.currentScript.src) || location.href).toString(); }
    catch(_){ return "blocks/"; }
  })();
  function q(u){ return u + (u.includes("?") ? "&" : "?") + "v=" + VER; }

  async function loadManifest(){
    const url = new URL("index.json", LIB_BASE).toString();
    const res = await fetch(q(url), { cache:"no-store" });
    if(!res.ok) throw new Error("manifest load failed: "+res.status);
    return await res.json();
  }
  function ensureStyle(href){
    if (document.querySelector('link[data-block-href="'+href+'"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = q(href);
    l.setAttribute("data-block-href", href);
    document.head.appendChild(l);
  }
  async function loadBlockAssets(files){
    if (files.style){
      ensureStyle(new URL(files.style, new URL("blocks/", LIB_BASE)).toString());
    }
    if (files.runtime){
      await new Promise((resolve,reject)=>{
        const s = document.createElement("script");
        s.src = q(new URL(files.runtime, new URL("blocks/", LIB_BASE)).toString());
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
  }
  window.BlockRegistry = window.BlockRegistry || {};
  window.loadBlocksManifest = async function(){
    const m = await loadManifest();
    (m.blocks||[]).forEach(b => {
      const reg = (window.BlockRegistry[b.key] = window.BlockRegistry[b.key] || {});
      Object.assign(reg, {
        key:b.key, title:b.title, category:b.category, tags:b.tags,
        version:b.version, files:b.files, defaults:b.defaults||{}
      });
    });
    return m;
  };
  window.loadBlock = async function(key){
    const reg = window.BlockRegistry[key];
    if (!reg || !reg.files) throw new Error("Unknown block: "+key);
    await loadBlockAssets(reg.files);
    return reg;
  };
})();
