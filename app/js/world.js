/* Mundo: clima de outras cidades, relógio mundial, mapa dia/noite com o sol e widgets da Início.
 * Cidades escolhidas em Clima › "Escolher cidades" (ficam salvas em Ajustes: world.cities).
 * Mapa: imagem pública da NASA (Blue Marble, Wikimedia) + sombra da noite calculada pela posição do sol. */
var PK = window.PK || {};
window.PK = PK;

PK.world = (function () {
  var U = PK.util, I = PK.icons, esc = U.esc;
  var CITIES = [
    ['Sydney', -33.87, 151.21, 'Australia/Sydney'], ['Melbourne', -37.81, 144.96, 'Australia/Melbourne'], ['Auckland', -36.85, 174.76, 'Pacific/Auckland'],
    ['São Paulo', -23.55, -46.63, 'America/Sao_Paulo'], ['Rio de Janeiro', -22.91, -43.17, 'America/Sao_Paulo'], ['Lisboa', 38.72, -9.14, 'Europe/Lisbon'],
    ['Porto', 41.15, -8.61, 'Europe/Lisbon'], ['Londres', 51.51, -0.13, 'Europe/London'], ['Paris', 48.86, 2.35, 'Europe/Paris'],
    ['Nova York', 40.71, -74.01, 'America/New_York'], ['Miami', 25.76, -80.19, 'America/New_York'], ['Los Angeles', 34.05, -118.24, 'America/Los_Angeles'],
    ['Tóquio', 35.68, 139.69, 'Asia/Tokyo'], ['Xangai', 31.23, 121.47, 'Asia/Shanghai'], ['Haikou (Hainan)', 20.04, 110.2, 'Asia/Shanghai'],
    ['Dubai', 25.2, 55.27, 'Asia/Dubai'], ['Singapura', 1.35, 103.82, 'Asia/Singapore'], ['Karachi', 24.86, 67.01, 'Asia/Karachi'],
    ['Calcutá', 22.57, 88.36, 'Asia/Kolkata'], ['Joanesburgo', -26.2, 28.05, 'Africa/Johannesburg']
  ].map(function (c) { return { name: c[0], lat: c[1], lon: c[2], tz: c[3] }; });
  var MAP = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Blue_Marble_2002.png/1280px-Blue_Marble_2002.png';
  var wx = {}, sub = 'forecast', city = null;

  function chosen() {
    var names = PK.settings.get('world.cities') || ['São Paulo', 'Lisboa', 'Londres', 'Nova York', 'Xangai'];
    return names.map(function (n) { return CITIES.filter(function (c) { return c.name === n; })[0]; }).filter(Boolean);
  }
  function home(state) {
    var l = (state.household && state.household.location) || PK.config.location, tz = (state.household && state.household.timezone) || 'Australia/Sydney';
    return { name: (l && l.name) || 'Casa', lat: l.lat, lon: l.lon, tz: tz, home: true };
  }
  // hora local de uma cidade (Intl com timeZone; se o aparelho não suportar, usa a hora da TV)
  function parts(tz, d) {
    try {
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', day: '2-digit', hour12: false }).formatToParts(d || new Date()), o = {};
      f.forEach(function (p) { o[p.type] = p.value; }); return { h: +o.hour % 24, m: +o.minute, wd: o.weekday, day: +o.day };
    } catch (e) { var n = d || new Date(); return { h: n.getHours(), m: n.getMinutes(), wd: '', day: n.getDate() }; }
  }
  function offsetMin(tz) { var n = new Date(), a = parts(tz, n), b = { h: n.getHours(), m: n.getMinutes(), day: n.getDate() }; var dd = a.day - b.day; if (dd > 1) dd = -1; if (dd < -1) dd = 1; return (a.h - b.h) * 60 + (a.m - b.m) + dd * 1440; }
  var WD = { Sun: 'dom', Mon: 'seg', Tue: 'ter', Wed: 'qua', Thu: 'qui', Fri: 'sex', Sat: 'sáb' };
  function timeStr(tz) { var p = parts(tz); return U.pad(p.h) + ':' + U.pad(p.m); }

  /* ---------- posição do sol (aproximação astronômica, boa para o mapa) ---------- */
  function sun(d) {
    d = d || new Date();
    var rad = Math.PI / 180, jd = d.getTime() / 864e5 + 2440587.5, n = jd - 2451545.0;
    var L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) % 360 * rad;
    var lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = 23.439 * rad;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    var gmst = (18.697374558 + 24.06570982441908 * n) % 24, ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / rad / 15;
    var lon = ((ra - gmst) * 15 + 540) % 360 - 180;
    return { lat: dec / rad, lon: lon };
  }
  function isDay(c, s) { var rad = Math.PI / 180; return Math.sin(c.lat * rad) * Math.sin(s.lat * rad) + Math.cos(c.lat * rad) * Math.cos(s.lat * rad) * Math.cos((c.lon - s.lon) * rad) > -0.0145; }

  /* ---------- aba Clima: Previsão (por cidade) · Relógio mundial · Mapa dia/noite ---------- */
  function tab(state) {
    var h = home(state), list = [h].concat(chosen());
    var seg = '<div class="tv-seg wo-seg">' + [['forecast', 'Previsão'], ['clock', 'Relógio mundial'], ['map', 'Mapa dia/noite']].map(function (v) { return '<button class="tv-b focusable' + (sub === v[0] ? ' on' : '') + '" data-wo="sub:' + v[0] + '"' + (sub === v[0] ? ' data-autofocus' : '') + '>' + v[1] + '</button>'; }).join('') +
      '<button class="tv-b focusable wo-pick" data-wo="pick">' + I.get('plus', 18) + ' Escolher cidades</button></div>';
    if (sub === 'clock') return seg + clockView(list);
    if (sub === 'map') { setTimeout(drawMap, 30); return seg + '<div class="wo-map" id="wo-map"><img src="' + MAP + '" alt="" onerror="this.style.display=\'none\'"><canvas id="wo-cv" width="1280" height="640"></canvas><div class="wo-pins" id="wo-pins"></div></div>'; }
    var c = city && city !== h.name ? list.filter(function (x) { return x.name === city; })[0] : null;
    var chips = '<div class="wo-cities">' + list.map(function (x) { var on = (c ? c.name : h.name) === x.name, w = x.home ? state.weather : wx[x.name]; return '<button class="chip focusable' + (on ? ' on' : '') + '" data-wo="city:' + esc(x.name) + '">' + (x.home ? I.get('home', 20) + ' ' : '') + esc(x.name) + ' <small>' + timeStr(x.tz) + (w ? ' · ' + w.temp + '°' : '') + '</small></button>'; }).join('') + '</div>';
    if (!c) return seg + chips + PK.views.weather(state);
    if (!wx[c.name]) { load(c); return seg + chips + '<div class="empty">Carregando o clima de ' + esc(c.name) + '…</div>'; }
    var alt = {}; for (var k in state) alt[k] = state[k]; alt.weather = wx[c.name];
    return seg + chips + PK.views.weather(alt);
  }
  function load(c, cb) {
    PK.weather.load({ lat: c.lat, lon: c.lon, name: c.name }).then(function (w) { wx[c.name] = w; if (cb) cb(); else if (PK.app.refreshView) PK.app.refreshView('weather'); }).catch(function () {});
  }
  function clockView(list) {
    var s = sun();
    return '<div class="wo-grid">' + list.map(function (c) {
      var p = parts(c.tz), off = offsetMin(c.tz), day = isDay(c, s), w = c.home ? null : wx[c.name];
      if (!c.home && !w) load(c, function () {});
      return '<div class="wo-c focusable' + (day ? ' day' : ' night') + (c.home ? ' home' : '') + '"><div class="wo-n">' + (c.home ? I.get('home', 22) + ' ' : '') + esc(c.name) + '</div>' +
        '<div class="wo-t" data-wotz="' + esc(c.tz) + '">' + U.pad(p.h) + ':' + U.pad(p.m) + '</div><div class="wo-d">' + (WD[p.wd] || p.wd) + ' ' + p.day + ' · ' + (c.home ? 'aqui' : (off === 0 ? 'mesma hora' : (off > 0 ? '+' : '−') + Math.floor(Math.abs(off) / 60) + 'h' + (Math.abs(off) % 60 ? U.pad(Math.abs(off) % 60) : ''))) + '</div>' +
        '<div class="wo-s">' + I.get(day ? 'sun' : 'moon', 26) + (w ? ' ' + w.temp + '° · ' + I.weatherText(w.code) : (day ? ' dia' : ' noite')) + '</div></div>';
    }).join('') + '</div>';
  }
  /* sombra da noite: para cada coluna (longitude), a latitude onde o sol nasce/se põe */
  function drawMap() {
    var cv = document.getElementById('wo-cv'), pins = document.getElementById('wo-pins'); if (!cv) return;
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, s = sun(), rad = Math.PI / 180;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(2, 6, 23, .62)'; ctx.beginPath();
    var south = s.lat > 0; // no verão do norte, o polo sul fica de noite
    ctx.moveTo(0, south ? H : 0);
    for (var x = 0; x <= W; x += 4) {
      var lon = x / W * 360 - 180, tanLat = -Math.cos((lon - s.lon) * rad) / Math.tan(s.lat * rad), lat = Math.atan(tanLat) / rad;
      ctx.lineTo(x, (90 - lat) / 180 * H);
    }
    ctx.lineTo(W, south ? H : 0); ctx.closePath(); ctx.fill();
    var sx = (s.lon + 180) / 360 * W, sy = (90 - s.lat) / 180 * H, g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
    g.addColorStop(0, 'rgba(253, 224, 71, 1)'); g.addColorStop(.3, 'rgba(253, 224, 71, .5)'); g.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, 7); ctx.fill();
    var st = PK.app.state(), list = [home(st)].concat(chosen());
    if (pins) pins.innerHTML = list.map(function (c) {
      return '<span class="wo-pin' + (c.home ? ' home' : '') + (isDay(c, s) ? ' day' : '') + '" style="left:' + ((c.lon + 180) / 360 * 100) + '%;top:' + ((90 - c.lat) / 180 * 100) + '%"><i></i><b>' + esc(c.name) + ' ' + timeStr(c.tz) + '</b></span>';
    }).join('');
  }
  // escolher cidades (várias); salva em Ajustes
  function picker() {
    var sel = (PK.settings.get('world.cities') || chosen().map(function (c) { return c.name; })).slice();
    PK.app.openModal({ title: I.get('sun', 36) + ' Cidades do clima e relógio', body: '<div class="wo-pk">' + CITIES.map(function (c, i) { var on = sel.indexOf(c.name) >= 0; return '<button class="chip focusable' + (on ? ' on' : '') + '" data-wo="toggle:' + esc(c.name) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + esc(c.name) + ' <small>' + timeStr(c.tz) + '</small>' + (on ? '<i class="chk">' + I.get('check', 16, ' stroke-width="3"') + '</i>' : '') + '</button>'; }).join('') + '</div>',
      actions: [{ label: 'Pronto', act: 'close' }] }, 'detail wide');
  }
  function cmd(v) {
    var i = v.indexOf(':'), a = i < 0 ? v : v.slice(0, i), arg = i < 0 ? '' : v.slice(i + 1);
    if (a === 'sub') { sub = arg; return 'render'; }
    if (a === 'city') { city = arg; return 'render'; }
    if (a === 'pick') { picker(); return; }
    if (a === 'toggle') {
      var sel = (PK.settings.get('world.cities') || chosen().map(function (c) { return c.name; })).slice(), ix = sel.indexOf(arg);
      if (ix >= 0) sel.splice(ix, 1); else sel.push(arg);
      PK.settings.set('world.cities', sel);
      var b = document.querySelector('.wo-pk [data-wo="toggle:' + arg + '"]');
      if (b) { b.classList.toggle('on', ix < 0); var ck = b.querySelector('.chk'); if (ix < 0 && !ck) b.insertAdjacentHTML('beforeend', '<i class="chk">' + I.get('check', 16, ' stroke-width="3"') + '</i>'); if (ix >= 0 && ck) ck.parentNode.removeChild(ck); }
      return 'render-later';
    }
  }
  // atualização a cada segundo dos relógios visíveis
  function second() { Array.prototype.forEach.call(document.querySelectorAll('[data-wotz]'), function (el) { el.textContent = timeStr(el.getAttribute('data-wotz')); }); }

  /* ---------- widgets da Início ---------- */
  function homeTile(state, kind) {
    if (kind === 'world') {
      var list = chosen().slice(0, 3);
      return '<div class="sh-tile world focusable" data-view="weather" data-wo-go="clock"><div class="sh-k">' + I.get('sun', 18) + ' Relógio mundial</div>' +
        list.map(function (c) { return '<div class="sh-wc"><span>' + esc(c.name) + '</span><b data-wotz="' + esc(c.tz) + '">' + timeStr(c.tz) + '</b></div>'; }).join('') + '</div>';
    }
    if (kind === 'sun') {
      var w = state.weather, d = w && w.days && w.days[0], d1 = w && w.days && w.days[1], now = new Date(); if (!d) return '';
      var before = now < d.sunrise, set = !before && d.sunset > now, next = before ? d.sunrise : set ? d.sunset : (d1 && d1.sunrise), mins = next ? Math.max(0, Math.round((next - now) / 60000)) : 0;
      return '<div class="sh-tile sunw focusable" data-view="weather"><div class="sh-k">' + I.get(set ? 'sun' : 'moon', 18) + (set ? ' Pôr do sol' : ' Nascer do sol') + '</div>' +
        '<div class="sh-n big">' + (next ? U.hm(next) : '—') + '</div><div class="sh-s">' + (mins >= 60 ? 'em ' + Math.floor(mins / 60) + 'h' + U.pad(mins % 60) : 'em ' + mins + ' min') + ' · ' + (set ? 'nasceu ' + U.hm(d.sunrise) : before ? 'pôr do sol ' + U.hm(d.sunset) : 'pôs ' + U.hm(d.sunset)) + '</div></div>';
    }
    return '';
  }

  return { tab: tab, cmd: cmd, second: second, homeTile: homeTile, sun: sun, cities: CITIES, setSub: function (s) { sub = s; } };
})();
