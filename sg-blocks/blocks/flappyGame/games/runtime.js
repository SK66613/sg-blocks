(function(){
  // Global game registry: window.GAMES[key] = { title, mount(host, ctx) -> cleanup }
  window.GAMES = window.GAMES || {};

  // Helper to mount a game into a host with auto-cleanup
  window.mountGame = function(key, host, ctx){
    if(!host) return null;
    try{ host.__cleanup && host.__cleanup(); }catch(_){}
    host.__cleanup = null;

    const g = window.GAMES && window.GAMES[key];
    if(!g || typeof g.mount!=='function'){
      host.innerHTML = '<div class="card">Игра не найдена: '+key+'</div>';
      return null;
    }
    const cleanup = g.mount(host, ctx) || null;
    host.__cleanup = (typeof cleanup==='function') ? cleanup : null;
    return host.__cleanup;
  };
})();
