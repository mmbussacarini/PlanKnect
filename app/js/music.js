/* "Tocando agora" (Spotify) — TV e Nest Hub.
 * O som sai do Spotify Connect (app do Spotify da TV, Nest Hub, caixa de som…); aqui só mostramos e controlamos.
 * Rotas do PlanKnect (Lovable guarda o login do Spotify): GET /music/now, POST /music/control, GET /music/devices,
 * POST /music/transfer, GET /music/playlists, POST /music/play. Ver docs/LOVABLE_PROMPT.md (Round 4).
 * Sem PlanKnect pareado: modo demonstração com músicas de exemplo. */
var PK = window.PK || {};
window.PK = PK;

PK.music = (function () {
  var U = PK.util, I = PK.icons, esc = function (s) { return U.esc(s == null ? '' : String(s)); };
  var now = null, at = 0, err = '', devs = null, lists = null, pane = 'now', subs = [], pollT = null, tickT = null, busy = false;

  /* ---------- demonstração ---------- */
  var DEMO_T = [
    { title: 'Here Comes the Sun', artist: 'The Beatles', album: 'Abbey Road', image: '', duration_ms: 185000 },
    { title: 'Aquarela', artist: 'Toquinho', album: 'Aquarela', image: '', duration_ms: 236000 },
    { title: 'Golden Hour', artist: 'JVKE', album: 'this is what ____ feels like', image: '', duration_ms: 209000 },
    { title: 'Garota de Ipanema', artist: 'Tom Jobim', album: 'Getz/Gilberto', image: '', duration_ms: 324000 }
  ];
  var DEMO_D = [{ id: 'd-tv', name: 'Samsung TV da sala', type: 'TV' }, { id: 'd-nest', name: 'Kitchen Display', type: 'CastAudio' }, { id: 'd-mac', name: 'MacBook', type: 'Computer' }];
  var DEMO_P = [{ uri: 'demo:familia', name: 'Família no carro', owner: 'Você' }, { uri: 'demo:jantar', name: 'Jantar tranquilo', owner: 'Você' }, { uri: 'demo:kids', name: 'Músicas das crianças', owner: 'Você' }, { uri: 'demo:foco', name: 'Foco no trabalho', owner: 'Spotify' }];
  var demo = { i: 0, playing: true, started: Date.now(), offset: 40000, dev: 0, vol: 45, ctx: 'Família no carro' };
  function demoNow() {
    var t = DEMO_T[demo.i % DEMO_T.length], p = demo.offset + (demo.playing ? Date.now() - demo.started : 0);
    if (p >= t.duration_ms) { demo.i++; demo.offset = 0; demo.started = Date.now(); return demoNow(); }
    return { connected: true, playing: demo.playing, progress_ms: p, track: t, device: { id: DEMO_D[demo.dev].id, name: DEMO_D[demo.dev].name, type: DEMO_D[demo.dev].type, volume: demo.vol }, context: { name: demo.ctx }, demo: true };
  }
  function demoDo(a, v) {
    var cur = demoNow(); demo.offset = cur.progress_ms; demo.started = Date.now();
    if (a === 'toggle') demo.playing = !demo.playing;
    if (a === 'play') demo.playing = true;
    if (a === 'pause') demo.playing = false;
    if (a === 'next') { demo.i++; demo.offset = 0; demo.playing = true; }
    if (a === 'previous') { if (cur.progress_ms > 5000) demo.offset = 0; else { demo.i = (demo.i + DEMO_T.length - 1) % DEMO_T.length; demo.offset = 0; } }
    if (a === 'volume') demo.vol = Math.max(0, Math.min(100, v));
    if (a === 'transfer') DEMO_D.forEach(function (d, i) { if (d.id === v) demo.dev = i; });
    if (a === 'playlist') { var p = DEMO_P.filter(function (x) { return x.uri === v; })[0]; demo.ctx = p ? p.name : demo.ctx; demo.i = Math.floor(Math.random() * DEMO_T.length); demo.offset = 0; demo.playing = true; }
    return Promise.resolve(demoNow());
  }

  /* ---------- PlanKnect ---------- */
  function live() { return PK.data && PK.data.mode() === 'live'; }
  function api(m, p, b) { return PK.api.music(m, p, b); }
  function why(e) {
    var m = String((e && e.message) || e || '');
    if (/403|forbidden|disabled/i.test(m)) return 'Música desligada para esta tela — ative “Música (Spotify)” no PlanKnect › Dispositivos.';
    if (/404|405|not_found/i.test(m)) return 'O PlanKnect ainda não tem a rota de música (pedido enviado ao Lovable).';
    if (/not_connected|spotify/i.test(m)) return 'Conecte o Spotify no PlanKnect › Integrações › Spotify.';
    if (/no_device|NO_ACTIVE_DEVICE/i.test(m)) return 'Nenhum aparelho tocando — escolha onde tocar em “Tocar em”.';
    return 'Não consegui falar com o Spotify agora.';
  }
  function load() {
    if (!live()) { set(demoNow()); return Promise.resolve(now); }
    return api('GET', '/now').then(function (r) { err = r && r.connected === false ? 'Conecte o Spotify no PlanKnect › Integrações › Spotify.' : ''; set(r); return now; },
      function (e) { err = why(e); set(null); return null; });
  }
  function set(r) { now = r; at = Date.now(); emit(); }
  function emit() { subs.forEach(function (f) { try { f(now); } catch (e) {} }); update(); }
  function progress() { if (!now || !now.track) return 0; var p = now.progress_ms + (now.playing ? Date.now() - at : 0); return Math.min(p, now.track.duration_ms || p); }

  function control(a, v) {
    if (busy) return Promise.resolve(now); busy = true;
    // resposta otimista: a tela muda na hora
    if (now && a === 'toggle') { now.progress_ms = progress(); at = Date.now(); now.playing = !now.playing; update(); }
    var p = !live() ? demoDo(a, v) :
      a === 'transfer' ? api('POST', '/transfer', { device_id: v, play: true }) :
      a === 'playlist' ? api('POST', '/play', { uri: v }) :
      a === 'search' ? api('POST', '/play', { query: v }) :
      api('POST', '/control', { action: a === 'toggle' ? (now && now.playing ? 'play' : 'pause') : a, value: v });
    return p.then(function () { busy = false; return live() ? delay(450).then(load) : load(); }, function (e) { busy = false; err = why(e); emit(); throw e; });
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function devices() { return (live() ? api('GET', '/devices').then(function (r) { return r.devices || r || []; }) : Promise.resolve(DEMO_D)).then(function (d) { devs = d; return d; }, function (e) { err = why(e); devs = []; return []; }); }
  function playlists() { return (live() ? api('GET', '/playlists').then(function (r) { return r.playlists || r || []; }) : Promise.resolve(DEMO_P)).then(function (p) { lists = p; return p; }, function (e) { err = why(e); lists = []; return []; }); }

  /* ---------- polling: 5 s com o player aberto, 20 s no resto ---------- */
  function start() {
    if (pollT) return;
    load();
    var loop = function () { pollT = setTimeout(function () { load().then(loop, loop); }, document.querySelector('.mu-player') ? 5000 : 20000); };
    loop();
    tickT = setInterval(function () { if (document.querySelector('.mu-prog')) update(true); }, 1000);
  }

  /* ---------- HTML ---------- */
  function cover(t, size) {
    var img = t && t.image;
    var hue = 0, nm = (t && (t.album || t.name || t.title)) || ''; for (var i = 0; i < nm.length; i++) hue = (hue * 31 + nm.charCodeAt(i)) % 360;
    return '<span class="mu-cv" style="width:' + size + 'px;height:' + size + 'px;' + (img ? "background-image:url('" + esc(img) + "')" : 'background-image:linear-gradient(135deg,hsl(' + hue + ',70%,45%),hsl(' + ((hue + 60) % 360) + ',70%,25%))') + '">' + (img ? '' : I.get('music', Math.round(size * .45))) + '</span>';
  }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + U.pad(s % 60); }
  function tile() { // prateleira da tela inicial (TV)
    start();
    var t = now && now.track;
    return '<div class="sh-tile music focusable" data-act="music-open"><div class="sh-k">' + I.get('music', 18) + (now && now.playing ? ' Tocando agora' : ' Música') + '</div>' +
      (t ? '<div class="mu-tl">' + cover(t, 58) + '<div><b id="mu-t-title">' + esc(t.title) + '</b><span>' + esc(t.artist) + '</span></div></div>' : '<div class="sh-s">' + esc(err || 'Spotify — toque para abrir') + '</div>') + '</div>';
  }
  function chip() { // tela inicial do Nest Hub
    start();
    var t = now && now.track; if (!t && !err) return '';
    return '<button class="chip mu-chip" data-mu="open">' + (t ? cover(t, 26) + ' ' + esc(t.title) + (now.playing ? '' : ' (pausado)') : I.get('music', 22) + ' Música') + '</button>';
  }
  function player(compact) {
    start();
    var t = now && now.track, big = compact ? 200 : 380, ic = compact ? 30 : 40;
    var head = '<div class="mu-tabs"><button class="focusable' + (pane === 'now' ? ' on' : '') + '" data-mu="pane:now">' + I.get('music', 20) + ' Tocando</button>' +
      '<button class="focusable' + (pane === 'lists' ? ' on' : '') + '" data-mu="pane:lists">' + I.get('list', 20) + ' Playlists</button>' +
      '<button class="focusable' + (pane === 'devs' ? ' on' : '') + '" data-mu="pane:devs">' + I.get('airplay', 20) + ' Tocar em</button></div>';
    var body = '';
    if (pane === 'lists') {
      if (!lists) { playlists().then(rerender); body = '<div class="mu-wait">Carregando playlists…</div>'; }
      else body = '<div class="mu-grid">' + lists.slice(0, compact ? 6 : 12).map(function (p, i) {
        return '<button class="mu-pl focusable" data-mu="playlist:' + esc(p.uri) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + cover(p, compact ? 64 : 96) + '<b>' + esc(p.name) + '</b><span>' + esc(p.owner || '') + '</span></button>'; }).join('') + (lists.length ? '' : '<div class="mu-wait">Nenhuma playlist.</div>') + '</div>';
    } else if (pane === 'devs') {
      if (!devs) { devices().then(rerender); body = '<div class="mu-wait">Procurando aparelhos…</div>'; }
      else body = '<div class="mu-devs">' + devs.map(function (d, i) {
        var on = now && now.device && now.device.id === d.id;
        return '<button class="mu-dev focusable' + (on ? ' on' : '') + '" data-mu="transfer:' + esc(d.id) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + I.get(/tv/i.test(d.type) ? 'tv' : /comp/i.test(d.type) ? 'monitor' : 'speaker', 26) + '<b>' + esc(d.name) + '</b>' + (on ? '<span>tocando aqui</span>' : '') + '</button>'; }).join('') +
        (devs.length ? '' : '<div class="mu-wait">Nenhum aparelho com Spotify aberto. Abra o Spotify na TV ou no celular.</div>') + '</div>';
    } else {
      body = t ? '<div class="mu-now">' + cover(t, big) + '<div class="mu-info"><div class="mu-ctx">' + esc((now.context && now.context.name) || '') + '</div><b class="mu-title">' + esc(t.title) + '</b><span class="mu-artist">' + esc(t.artist) + (t.album ? ' · ' + esc(t.album) : '') + '</span>' +
          '<div class="mu-prog"><i style="width:' + (100 * progress() / (t.duration_ms || 1)) + '%"></i></div><div class="mu-times"><span id="mu-pos">' + mmss(progress()) + '</span><span>' + mmss(t.duration_ms) + '</span></div>' +
          '<div class="mu-ctl"><button class="focusable" data-mu="previous">' + I.get('prev', ic) + '</button><button class="focusable mu-pp" data-mu="toggle" data-autofocus>' + I.get(now.playing ? 'pause' : 'play', ic + 8) + '</button><button class="focusable" data-mu="next">' + I.get('next', ic) + '</button>' +
          '<button class="focusable mu-vol" data-mu="vol:-10">' + I.get('minus', compact ? 22 : 28) + '</button><span class="mu-v">' + ((now.device && now.device.volume != null) ? now.device.volume + '%' : '') + '</span><button class="focusable mu-vol" data-mu="vol:10">' + I.get('plus', compact ? 22 : 28) + '</button></div>' +
          '<div class="mu-where">' + I.get('speaker', 18) + ' ' + esc((now.device && now.device.name) || 'Spotify') + (now.demo ? ' · demonstração' : '') + '</div></div></div>'
        : '<div class="mu-empty">' + I.get('music', 64) + '<b>' + esc(err || 'Nada tocando agora') + '</b><span>Escolha uma playlist ou diga “Alfred, toca a playlist da família”.</span><button class="focusable" data-mu="pane:lists" data-autofocus>' + I.get('list', 22) + ' Ver playlists</button></div>';
    }
    return '<div class="mu-player' + (compact ? ' compact' : '') + '">' + head + (err && t ? '<div class="mu-err">' + esc(err) + '</div>' : '') + body + '</div>';
  }
  var host = null, compactHost = false;
  function rerender() { if (host && document.body.contains(host)) { host.innerHTML = player(compactHost); if (PK.nav && !compactHost) setTimeout(PK.nav.reset, 20); } }
  function mount(el, compact) { host = el; compactHost = !!compact; rerender(); }
  function update(tickOnly) {
    if (!host || !document.body.contains(host)) return;
    var t = now && now.track, bar = host.querySelector('.mu-prog i'), pos = host.querySelector('#mu-pos');
    if (tickOnly) { if (bar && t) { bar.style.width = (100 * progress() / (t.duration_ms || 1)) + '%'; if (pos) pos.textContent = mmss(progress()); } return; }
    var ti = host.querySelector('.mu-title');
    if (pane !== 'now' || !ti || !t || ti.textContent !== t.title) { if (pane === 'now') { var f = document.activeElement, fm = PK.nav && PK.nav.current && PK.nav.current(), key = fm && fm.getAttribute && fm.getAttribute('data-mu'); rerender(); if (key && PK.nav) { var b = host.querySelector('[data-mu="' + key + '"]'); if (b) PK.nav.focus(b, true); } } return; }
    var pp = host.querySelector('.mu-pp'); if (pp) pp.innerHTML = I.get(now.playing ? 'pause' : 'play', compactHost ? 38 : 48);
    var v = host.querySelector('.mu-v'); if (v && now.device && now.device.volume != null) v.textContent = now.device.volume + '%';
    update(true);
  }

  // data-mu="toggle|next|previous|vol:+10|pane:lists|playlist:<uri>|transfer:<id>"
  function cmd(arg) {
    var k = String(arg).split(':')[0], v = String(arg).slice(k.length + 1);
    if (k === 'pane') { pane = v; if (v === 'lists') lists = lists; if (v === 'devs') devs = null; rerender(); return; }
    if (k === 'vol') { var cur = (now && now.device && now.device.volume) || 50; return control('volume', Math.max(0, Math.min(100, cur + (+v)))); }
    if (k === 'playlist') { pane = 'now'; return control('playlist', v).then(rerender, rerender); }
    if (k === 'transfer') { pane = 'now'; return control('transfer', v).then(rerender, rerender); }
    return control(k);
  }

  // Comandos de voz/texto tratados aqui mesmo (rápido, sem esperar a IA). Devolve null se não for sobre música.
  function intent(text, en) {
    var s = String(text || '').toLowerCase().trim(), L = function (pt, e) { return { reply: pt, en: e }; };
    if (!/(m[uú]sica|spotify|playlist|\btoca\b|tocar|toque|\bplay\b|pausa|pause|pare a m|stop the music|pr[oó]xima (m[uú]sica|faixa)|^pr[oó]xima$|next song|skip|volta a m|previous track|volume|(aumenta|abaixa|diminui) (o )?(som|volume|a m))/.test(s)) return null;
    var done = function (p, r) { return p.then(function () { return r; }, function () { return L(err || 'Não consegui falar com o Spotify.', 'I’m afraid Spotify isn’t answering just now.'); }); };
    if (/^(pausa|pause|pare a m|para a m|stop the music|pause the music)/.test(s)) return done(control('pause'), L('Música pausada.', 'Music paused.'));
    if (/(pr[oó]xima|next song|skip|pula)/.test(s) && !/reuni|tarefa|meeting|task|evento/.test(s)) return done(control('next'), L('Próxima música.', 'Next track.'));
    if (/(volta a m|anterior|previous)/.test(s)) return done(control('previous'), L('Voltei a música.', 'Going back.'));
    if (/(aumenta|louder|volume up|mais alto)/.test(s)) return done(cmd('vol:15'), L('Volume mais alto.', 'A touch louder.'));
    if (/(abaixa|diminui|quieter|volume down|mais baixo)/.test(s)) return done(cmd('vol:-15'), L('Volume mais baixo.', 'A touch quieter.'));
    var m = s.match(/(?:toca|tocar|toque|play|coloca|põe|poe)\s+(?:a\s+|o\s+|uma\s+|um\s+|the\s+|some\s+)?(.+)/);
    if (m && m[1] && !/^(m[uú]sica|music)$/.test(m[1])) {
      var q = m[1].replace(/^(playlist|música|musica)\s+(da|do|de)?\s*/, '').trim();
      return playlists().then(function (ps) {
        var hit = ps.filter(function (p) { return p.name.toLowerCase().indexOf(q.replace(/^(da|do|de)\s+/, '')) >= 0; })[0];
        return done(hit ? control('playlist', hit.uri) : control('search', q), L('Tocando ' + (hit ? hit.name : q) + '.', 'Playing ' + (hit ? hit.name : q) + '.'));
      });
    }
    if (/^(toca|tocar|play|continua|resume|volta a tocar)/.test(s) || /(toca|play) (m[uú]sica|music)/.test(s)) return done(control('play'), L('Tocando.', 'Playing.'));
    return null;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-mu]'); if (!b) return;
    var a = b.getAttribute('data-mu'); if (a === 'open') { if (PK.music.openHandler) PK.music.openHandler(); return; }
    cmd(a);
  });
  subs.push(function () {
    var tile2 = document.querySelector('.sh-tile.music');
    if (tile2) { var tmp = document.createElement('div'); tmp.innerHTML = tile(); if (tile2.innerHTML !== tmp.firstChild.innerHTML) tile2.innerHTML = tmp.firstChild.innerHTML; }
    var ch = document.querySelector('.mu-chip'); if (ch) { var tmp2 = document.createElement('div'); tmp2.innerHTML = chip(); if (tmp2.firstChild) ch.innerHTML = tmp2.firstChild.innerHTML; }
  });
  // ação vinda do servidor: { type:'music', action, uri|query, device_id, value }
  function act(a) {
    if (a.device_id && a.action !== 'transfer') return control('transfer', a.device_id).then(function () { return act({ action: a.action, uri: a.uri, query: a.query, value: a.value }); });
    if (a.uri) return control('playlist', a.uri);
    if (a.query) return control('search', a.query);
    return control(a.action || 'play', a.value);
  }
  return { act: act, start: start, load: load, now: function () { return now; }, tile: tile, chip: chip, player: player, mount: mount, cmd: cmd, intent: intent, on: function (f) { subs.push(f); }, error: function () { return err; } };
})();
