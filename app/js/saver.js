/* Protetor de tela (TV e Nest Hub): algo sempre em movimento quando ninguém está usando.
 * Vídeos em loop (lareira, ondas, chuva…) ou animações leves em canvas (estrelas, aurora).
 * No modo "auto" troca de cena a cada 15 min; de madrugada só cenas escuras e com brilho reduzido.
 * Nada fica parado no mesmo lugar, então não marca a tela. */
var PK = window.PK || {};
window.PK = PK;

PK.saver = (function () {
  var OPTS = [['auto', 'Automático (vários)'], ['fireplace', 'Lareira'], ['waves', 'Ondas'], ['rain-window', 'Chuva na janela'], ['city-dusk', 'Cidade à noite'],
    ['beach-sunset', 'Pôr do sol'], ['leaves-macro', 'Folhas ao vento'], ['stars', 'Céu estrelado'], ['flow', 'Aurora suave'], ['black', 'Só relógio (tela preta)']];
  var DAY = ['waves', 'stars', 'leaves-macro', 'flow', 'beach-sunset', 'fireplace', 'city-dusk', 'rain-window'];
  var NIGHT = ['fireplace', 'stars', 'rain-window', 'flow', 'city-dusk'];
  var EVERY = 15 * 60000;

  function alive(el) { return el && document.body.contains(el); }

  // Céu estrelado: estrelas piscando que andam devagar + uma estrela cadente de vez em quando
  function stars(host) {
    var c = document.createElement('canvas'), g = c.getContext('2d'); host.appendChild(c);
    var W = c.width = Math.max(320, host.clientWidth >> 1), H = c.height = Math.max(180, host.clientHeight >> 1);
    var list = [], shoot = null, i;
    for (i = 0; i < Math.round(W * H / 2600); i++) list.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1 + .3, p: Math.random() * 6.3, s: Math.random() * .02 + .005 });
    var last = 0;
    (function loop(t) {
      if (!alive(c)) return;
      requestAnimationFrame(loop);
      if (t - last < 50) return; last = t; // ~20 fps, leve para TV e Nest Hub
      var sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#02030a'); sky.addColorStop(1, '#0a1026');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (var k = 0; k < list.length; k++) {
        var s = list[k]; s.p += s.s * 3; s.x -= s.r * .06; if (s.x < 0) s.x += W;
        g.globalAlpha = .35 + .65 * Math.abs(Math.sin(s.p)); g.fillStyle = '#dfe6ff';
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.3); g.fill();
      }
      g.globalAlpha = 1;
      if (!shoot && Math.random() < .004) shoot = { x: Math.random() * W * .7 + W * .3, y: Math.random() * H * .4, l: 0 };
      if (shoot) {
        shoot.l += 1; var x = shoot.x - shoot.l * 6, y = shoot.y + shoot.l * 2.4;
        var tr = g.createLinearGradient(x, y, x + 60, y - 24); tr.addColorStop(0, 'rgba(255,255,255,.9)'); tr.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = tr; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 60, y - 24); g.stroke();
        if (shoot.l > 40) shoot = null;
      }
    })(0);
  }

  // Aurora: manchas de cor grandes e suaves que flutuam (desenhado em baixa resolução e ampliado)
  function flow(host) {
    var c = document.createElement('canvas'), g = c.getContext('2d'); c.className = 'sv-soft'; host.appendChild(c);
    var W = c.width = 192, H = c.height = 108, last = 0;
    var cols = ['64,90,255', '30,200,170', '160,70,240', '20,140,255', '255,90,160'];
    var b = cols.map(function (col, i) { return { col: col, a: Math.random() * 6.3, sp: .0011 + i * .0003, r: 50 + i * 9 }; });
    (function loop(t) {
      if (!alive(c)) return;
      requestAnimationFrame(loop);
      if (t - last < 66) return; last = t; // ~15 fps
      g.globalCompositeOperation = 'source-over'; g.fillStyle = '#03040c'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      b.forEach(function (o, i) {
        o.a += o.sp * 66 / 16;
        var x = W / 2 + Math.cos(o.a + i) * W * .36, y = H / 2 + Math.sin(o.a * 1.3 + i * 2) * H * .34;
        var rg = g.createRadialGradient(x, y, 0, x, y, o.r); rg.addColorStop(0, 'rgba(' + o.col + ',.55)'); rg.addColorStop(1, 'rgba(' + o.col + ',0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, H);
      });
    })(0);
  }

  function pick(night, prev) {
    var l = (night ? NIGHT : DAY).filter(function (x) { return x !== prev; });
    return l[Math.floor(Math.random() * l.length)];
  }

  function show(host, id) {
    host.innerHTML = ''; host.setAttribute('data-saver', id);
    if (id === 'black') return;
    if (id === 'stars') return stars(host);
    if (id === 'flow') return flow(host);
    var s = PK.scenes && PK.scenes.get(id);
    if (!s || s.id !== id) return stars(host);
    var box = document.createElement('div'); box.className = 'sv-scene'; host.appendChild(box);
    PK.scenes.mount(box, id);
    var v = box.querySelector('video');
    if (v) v.addEventListener('error', function () { if (alive(box)) show(host, 'stars'); }); // sem internet: estrelas
  }

  // mount(host, modo, { night }) — monta e mantém trocando; para sozinho quando o host sai da tela
  function mount(host, mode, o) {
    o = o || {}; mode = mode || 'auto';
    host.classList.add('sv-host'); host.classList.toggle('sv-night', !!o.night);
    var cur = mode === 'auto' ? pick(o.night) : mode;
    show(host, cur);
    if (mode !== 'auto') return;
    var t = setInterval(function () {
      if (!alive(host)) { clearInterval(t); return; }
      var night = typeof o.isNight === 'function' ? o.isNight() : !!o.night;
      host.classList.toggle('sv-night', night);
      show(host, cur = pick(night, cur));
    }, EVERY);
  }

  return { OPTS: OPTS, mount: mount };
})();
