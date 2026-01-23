(function(){
  const BASE = (window.__SG_FLAPPY_BASE__ || './games/flappy/') + 'assets/';

  window.GAMES = window.GAMES || {};

  window.GAMES.flappy = {
    assets: {
      bird: BASE + 'bumblebee.png',
      coin: BASE + 'coin.png',
      pipeBottom: BASE + 'pipe_bottom.png',
      pipeTop: BASE + 'pipe_top.png',
      shield: BASE + 'shield.png'
    },

    start(host, opts = {}){
      host.innerHTML = `
        <div class="flappy-game">
          <div class="flappy-sky"></div>
          <div class="flappy-bird"></div>
          <div class="flappy-score">0</div>
        </div>
      `;

      const bird = host.querySelector('.flappy-bird');
      bird.style.backgroundImage = `url(${this.assets.bird})`;
      bird.style.backgroundSize = 'contain';
      bird.style.backgroundRepeat = 'no-repeat';

      let y = 100, v = 0, g = 0.6, score = 0;
      let running = true;

      const flap = ()=>{ v = -8; };

      const onClick = ()=>flap();
      host.addEventListener('pointerdown', onClick);

      function loop(){
        if (!running) return;
        v += g;
        y += v;
        if (y > 240){ y = 240; v = 0; }
        if (y < 0){ y = 0; v = 0; }
        bird.style.transform = `translateY(${y}px)`;
        requestAnimationFrame(loop);
      }

      loop();
    }
  };

  window.mountGame = function(key, host, opts){
    if (window.GAMES && window.GAMES[key]){
      window.GAMES[key].start(host, opts);
    }
  };
})();

