/* Utilidades, ícones, navegação por controle remoto e ponte com o webOS.
 * Escrito em JS compatível com Chromium 68 (webOS 5 / TVs 2020+). */
var PK = window.PK || {};
window.PK = PK;

/* ---------------- util ---------------- */
PK.face = function (m) { return m && m.photo ? 'background:' + (m.color || '#334155') + ' url(\'' + String(m.photo).replace(/['"\\]/g, '') + '\') center/cover;' : ''; }; // foto do membro (quando o PlanKnect mandar)
// quem participa de um compromisso: fotos (ou inicial na cor da pessoa), "+N", ou selo Família quando é de todos
PK.who = function (state, e, size, max) {
  var mem = (state && state.members) || [], ids = (e && e.members) || [], s = size || 28, fam = state && state.household && state.household.id;
  var everyone = mem.length > 1 && mem.every(function (m) { return ids.indexOf(m.id) >= 0; });
  if (everyone || (!ids.length && fam && e.organizationId === fam && e.type !== 'task' && e.type !== 'milestone'))
    return '<span class="who fam" title="Família" style="height:' + s + 'px;font-size:' + Math.round(s * .42) + 'px">' + PK.icons.get('users', Math.round(s * .62)) + (s >= 28 ? '<em>Família</em>' : '') + '</span>';
  var list = ids.map(function (id) { return mem.filter(function (m) { return m.id === id; })[0]; }).filter(Boolean); if (!list.length) return '';
  var n = max || 3, esc = PK.util.esc;
  return '<span class="who">' + list.slice(0, n).map(function (m) {
    return '<span class="av" style="background:' + (m.color || '#7c5cff') + ';' + PK.face(m) + 'width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * .46) + 'px">' + (m.photo ? '' : esc(m.initial || String(m.name || '?').charAt(0))) + '</span>';
  }).join('') + (list.length > n ? '<span class="av more" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * .38) + 'px">+' + (list.length - n) + '</span>' : '') + '</span>';
};
PK.noAuto = /[?&]noauto=1/.test(location.search); // sem rotinas/Alfred/ambiente automáticos (capturas de tela)
if (PK.noAuto) document.documentElement.className += ' no-anim';
PK.util = (function () {
  var DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DAYS_S = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function D(v) { return v instanceof Date ? v : new Date(v); } // aceita Date ou texto ISO vindo da API
  function hm(d) { d = D(d); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sameDay(a, b) {
    if (!a || !b) return false; a = D(a); b = D(b);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function weekStart(d) { var x = startOfDay(d); return addDays(x, -x.getDay()); }
  function longDate(d) { d = D(d); return DAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]; }
  function shortDate(d) { d = D(d); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }
  function relMinutes(min) {
    if (min < 1) return 'agora';
    if (min < 60) return 'em ' + Math.round(min) + ' min';
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    if (h >= 24) return 'em ' + Math.round(h / 24) + ' dia' + (h >= 48 ? 's' : '');
    return 'em ' + h + 'h' + (m ? ' ' + pad(m) : '');
  }
  function dueLabel(due, now) {
    if (!due) return '';
    var d0 = startOfDay(now), dd = startOfDay(due);
    var diff = Math.round((dd - d0) / 86400000);
    if (diff < -1) return 'atrasada ' + (-diff) + ' dias';
    if (diff === -1) return 'atrasada desde ontem';
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff < 7) return DAYS[due.getDay()].toLowerCase();
    return shortDate(due);
  }
  function toDate(v) { return v instanceof Date ? v : (v ? new Date(v) : null); }
  function uid() { return 'xxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); }

  var store = {
    get: function (k, def) {
      try { var v = localStorage.getItem('pk.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) { try { localStorage.setItem('pk.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('pk.' + k); } catch (e) {} }
  };

  return {
    DAYS: DAYS, DAYS_S: DAYS_S, MONTHS: MONTHS, pad: pad, hm: hm, esc: esc,
    startOfDay: startOfDay, addDays: addDays, sameDay: sameDay, weekStart: weekStart,
    longDate: longDate, shortDate: shortDate, relMinutes: relMinutes, dueLabel: dueLabel,
    toDate: toDate, uid: uid, store: store
  };
})();

/* ---------------- ícones (SVG em linha, herdam currentColor) ---------------- */
PK.icons = (function () {
  function svg(inner, size, extra) {
    return '<svg class="ic" width="' + (size || 24) + '" height="' + (size || 24) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
      (extra || '') + '>' + inner + '</svg>';
  }
  var P = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.9 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
    partly: '<path d="M8.5 5.2a4 4 0 0 1 6.3 2.3"/><path d="M5 3.2l.9.9M9 1.8v1.3M2.6 7.5h1.3"/><path d="M8 20h9a3.6 3.6 0 0 0 .5-7.2 5 5 0 0 0-9.6-.9A4.1 4.1 0 0 0 8 20z"/>',
    rain: '<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.9 6.6 4.5 4.5 0 0 0 7 15.5z"/><path d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5"/>',
    storm: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.9 5.6 4.5 4.5 0 0 0 7 14.5z"/><path d="M12.5 15.5l-2 3.5h3l-2 3.5"/>',
    snow: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.9 5.6 4.5 4.5 0 0 0 7 14.5z"/><path d="M8.5 18.5v.1M12 20v.1M15.5 18.5v.1M10 22v.1M14 22v.1"/>',
    fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    video: '<rect x="3" y="6.5" width="12" height="11" rx="2.2"/><path d="M15 10.5l5.5-3v9l-5.5-3"/>',
    people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.2A4.5 4.5 0 0 1 21 18.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    star: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    run: '<circle cx="14.5" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2.5V22M7 11l3-3.5 4 1.5 2.5 3.5H20M11 15l-1.5-4"/>',
    church: '<path d="M12 2v4M10 4h4M6 21V11l6-4 6 4v10M3 21h18M10 21v-4a2 2 0 0 1 4 0v4"/>',
    task: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    cake: '<path d="M4 21h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM4 16.5c2 1.3 4 1.3 5.3 0 1.4 1.3 4 1.3 5.4 0 1.3 1.3 3.3 1.3 5.3 0M12 12V8.5M12 5.5v.1"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.1M17 21h4v-4M14 21v.1"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    tv: '<rect x="2.5" y="5" width="19" height="13" rx="2"/><path d="M8 21h8M9 2l3 3 3-3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4"/>',
    bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.8"/>',
    tooth: '<path d="M7.5 3.5c-2.5 0-4 2-3.5 5 .4 2.5 1.6 3.5 2 6 .5 3 1 6 2.5 6s1.5-4 3.5-4 2 4 3.5 4 2-3 2.5-6c.4-2.5 1.6-3.5 2-6 .5-3-1-5-3.5-5-2 0-3 1-4.5 1s-2.5-1-4.5-1z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13v-4"/>',
    paw: '<circle cx="6" cy="10" r="1.8"/><circle cx="9.5" cy="5.8" r="1.8"/><circle cx="14.5" cy="5.8" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 11.5c-3 0-5.5 4-5.5 6.5 0 1.8 1.5 2.5 3 2.2 1-.2 1.6-.7 2.5-.7s1.5.5 2.5.7c1.5.3 3-.4 3-2.2 0-2.5-2.5-6.5-5.5-6.5z"/>',
    toy: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 13h16M9 9V6a3 3 0 0 1 6 0v3"/>',
    plate: '<circle cx="12" cy="12" r="6.5"/><path d="M3 4v6a2 2 0 0 0 2 2M5 4v16M21 4c-1.5 1-2 3-2 5s.5 3 2 3v8"/>',
    shirt: '<path d="M8 3l-5 3 2 4 2.5-1V21h9V9L19 10l2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h2.8l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 7.5H6.2"/>',
    pill: '<rect x="2.8" y="8.5" width="18.4" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.8 8.8l6.4 6.4"/>',
    home: '<path d="M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
    mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    flame: '<path d="M12 21.5c-4 0-6.5-2.7-6.5-6.3 0-4.2 3.6-6.3 4.4-11 2.8 1.8 4.4 4.3 4.6 6.6.8-.6 1.4-1.6 1.6-2.8 1.6 1.6 2.4 4 2.4 7.2 0 3.6-2.5 6.3-6.5 6.3z"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V21h14v-8.5M12 8.5V21M12 8.5c-1.5-3.5-5.5-4-5.5-1.5 0 1.5 2.5 1.5 5.5 1.5zM12 8.5c1.5-3.5 5.5-4 5.5-1.5 0 1.5-2.5 1.5-5.5 1.5z"/>',
    rocket: '<path d="M12 15.5l-3.5-3.5c1.5-5 4.5-8.5 11-9-.5 6.5-4 9.5-9 11zM8.5 12l-4 .5 3-4h4M12 15.5l-.5 4 4-3v-4"/><path d="M5.5 16.5c-1.2 1.2-1.5 3.5-1.5 3.5s2.3-.3 3.5-1.5"/>',
    note: '<path d="M5 3.5h14v11l-5 6H5z"/><path d="M14 20.5v-6h5M8.5 8.5h7M8.5 12h4"/>',
    sparkle: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    camera: '<rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/><circle cx="21" cy="4" r="1.2" fill="currentColor"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.2A4.5 4.5 0 0 1 21 18.5"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5L4 12z"/><path d="M11.5 13.5L20 4"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
    airplay: '<path d="M6 17H4.5A2 2 0 0 1 2.5 15V5.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H18"/><path d="M12 14l5 6.5H7z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chef: '<path d="M7 14.5V20h10v-5.5M7 14.5A4 4 0 0 1 6.5 6.6 5 5 0 0 1 12 3.5a5 5 0 0 1 5.5 3.1 4 4 0 0 1-.5 7.9zM7 17h10"/>',
    sun2: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2"/>'
  };
  function get(name, size, extra) { return svg(P[name] || P.task, size, extra); }

  function weather(code, isDay) {
    if (code === 0 || code === 1) return isDay === false ? 'moon' : 'sun';
    if (code === 2) return 'partly';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 95) return 'storm';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 51) return 'rain';
    return 'cloud';
  }
  function weatherText(code) {
    var T = { 0: 'Céu limpo', 1: 'Predomínio de sol', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina',
      51: 'Chuvisco', 53: 'Chuvisco', 55: 'Chuvisco forte', 61: 'Chuva fraca', 63: 'Chuva', 65: 'Chuva forte',
      66: 'Chuva gelada', 67: 'Chuva gelada', 71: 'Neve fraca', 73: 'Neve', 75: 'Neve forte', 80: 'Pancadas de chuva',
      81: 'Pancadas de chuva', 82: 'Temporal', 95: 'Trovoadas', 96: 'Trovoadas', 99: 'Trovoadas' };
    return T[code] || 'Nublado';
  }
  return { get: get, weather: weather, weatherText: weatherText };
})();

/* ---------------- toast ---------------- */
PK.toast = function (msg) {
  var t = document.getElementById('toast');
  t.innerHTML = msg;
  t.className = 'show';
  clearTimeout(PK.toast._t);
  PK.toast._t = setTimeout(function () { t.className = ''; }, 2600);
};

/* ---------------- ponte webOS ---------------- */
PK.tv = (function () {
  var isWebOS = typeof window.PalmServiceBridge !== 'undefined' || /Web0S|webOS/i.test(navigator.userAgent);
  // Samsung (Tizen): app web empacotado como .wgt (veja docs/SAMSUNG_TIZEN.md)
  var isTizen = typeof window.tizen !== 'undefined';
  var platform = isWebOS ? 'lg' : isTizen ? 'samsung' : 'browser';
  if (isTizen) {
    // Botões coloridos e de mídia precisam ser registrados no Tizen
    try { window.tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'MediaPlayPause']); } catch (e) {}
  }
  var bridges = []; // mantém referência até a resposta chegar (senão o GC mata a chamada)

  function luna(uri, params, cb) {
    if (typeof window.PalmServiceBridge === 'undefined') { if (cb) cb({ returnValue: false, errorText: 'not webOS' }); return; }
    var b = new window.PalmServiceBridge();
    bridges.push(b);
    b.onservicecallback = function (msg) {
      bridges.splice(bridges.indexOf(b), 1);
      var res; try { res = JSON.parse(msg); } catch (e) { res = { returnValue: false }; }
      if (cb) cb(res);
    };
    b.call(uri, JSON.stringify(params || {}));
  }

  function launch(appId, name, params) {
    if (isTizen) {
      // appId pode ser o id da LG; o config traz o equivalente Samsung em apps[].samsung
      var a = (PK.config.apps || []).filter(function (x) { return x.id === appId || x.samsung === appId; })[0];
      var sid = (a && a.samsung) || appId;
      try {
        window.tizen.application.launch(sid, function () {}, function () { PK.toast('Não consegui abrir ' + PK.util.esc(name || sid) + ' — o app está instalado?'); });
      } catch (e) { PK.toast('Não consegui abrir ' + PK.util.esc(name || sid)); }
      return;
    }
    if (!isWebOS) { PK.toast('Na TV isso abriria <b>' + PK.util.esc(name || appId) + '</b>' + (params ? ' (direto no título)' : '')); return; }
    luna('luna://com.webos.applicationManager/launch', params ? { id: appId, params: params } : { id: appId }, function (res) {
      if (!res.returnValue) PK.toast('Não consegui abrir ' + PK.util.esc(name || appId) + ' — o app está instalado?');
    });
  }

  function deviceInfo(cb) {
    if (isTizen) {
      var model = 'Samsung TV';
      try { model = window.webapis.productinfo.getRealModel() || model; } catch (e) {}
      cb({ model: model, name: 'Samsung ' + model }); return;
    }
    if (!isWebOS) { cb({ model: 'Navegador', name: 'PlanKnect TV (preview)' }); return; }
    luna('luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName', 'firmwareVersion', 'sdkVersion'] }, function (r) {
      cb({ model: r.modelName || 'LG webOS', firmware: r.firmwareVersion, sdk: r.sdkVersion, name: 'LG ' + (r.modelName || 'TV') });
    });
  }

  // Ícones oficiais dos apps instalados na TV (para o dock)
  var icons = {};
  function loadIcons(cb) {
    if (isTizen) {
      try {
        window.tizen.application.getAppsInfo(function (list) {
          var bySid = {}; list.forEach(function (a) { if (a.iconPath) bySid[a.id] = a.iconPath; });
          (PK.config.apps || []).forEach(function (a) { var ic = a.samsung && (bySid[a.samsung] || bySid[a.samsung + '.' + a.samsung]); if (ic) icons[a.id] = ic; });
          if (cb) cb();
        }, function () {});
      } catch (e) {}
      return;
    }
    if (!isWebOS) return;
    luna('luna://com.webos.applicationManager/listApps', {}, function (r) {
      (r.apps || []).forEach(function (a) {
        var base = a.folderPath ? 'file://' + a.folderPath + '/' : '';
        var ic = a.largeIcon || a.icon || a.mediumLargeIcon;
        if (ic) icons[a.id] = /^(file|https?):/.test(ic) ? ic : base + ic;
      });
      if (cb) cb();
    });
  }
  return { isWebOS: isWebOS, isTizen: isTizen, platform: platform, luna: luna, launch: launch, deviceInfo: deviceInfo, loadIcons: loadIcons, icons: icons };
})();

/* ---------------- navegação espacial (setas do controle) ---------------- */
PK.nav = (function () {
  var current = null;
  var KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 461: 'back', 10009: 'back', 8: 'back', 27: 'back',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue', 82: 'red', 71: 'green', 89: 'yellow', 66: 'blue',
    86: 'voice', 77: 'meet', 65: 'ambient', 48: 'voice', 74: 'jarvis', 87: 'work' };
  var onKey = null;

  function scope() {
    var al = document.querySelector('#alerts.has-focus');
    if (al && al.querySelector('.focusable') && !document.querySelector('.overlay.dyn.active')) return al;
    var wmm = document.querySelector('#wm-modal.on'); if (wmm && !document.querySelector('.overlay.active')) return wmm;
    var wm = document.querySelector('#workmode.active');
    if (wm && !document.querySelector('.overlay.active')) return wm;
    var mt = document.querySelector('#meeting.active.room');
    if (mt && !document.querySelector('.overlay.active')) return mt;
    var ovs = document.querySelectorAll('.overlay.active');
    return ovs.length ? ovs[ovs.length - 1] : document.querySelector('.screen.active');
  }
  function items() {
    var s = scope(); if (!s) return [];
    var nodes;
    if (s.classList.contains('screen') && s.querySelector('.view.active')) { // tela principal: só o topo e a aba aberta (muito mais leve na TV)
      nodes = Array.prototype.slice.call(s.querySelectorAll('.topbar .focusable')).concat(Array.prototype.slice.call(s.querySelectorAll('.view.active .focusable')));
    } else nodes = Array.prototype.slice.call(s.querySelectorAll('.focusable'));
    return nodes.filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }
  var lastInView = {};
  function focus(el, noScroll) {
    if (!el) return;
    if (current) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    var vw = el.closest && el.closest('.view.active'); if (vw) lastInView[vw.id] = el;
    if (el.tagName === 'INPUT') el.focus(); else if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
    if (!noScroll && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    var evt = document.createEvent('Event'); evt.initEvent('pkfocus', true, true); el.dispatchEvent(evt);
  }
  function move(dir) {
    var list = items();
    if (!current || list.indexOf(current) < 0) { focus(preferred(list)); return; }
    var r = current.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === current) return;
      var b = el.getBoundingClientRect();
      var x = b.left + b.width / 2, y = b.top + b.height / 2, primary, cross;
      if (dir === 'left') { if (b.right > r.left + 4) return; primary = r.left - b.right; cross = Math.abs(y - cy); }
      if (dir === 'right') { if (b.left < r.right - 4) return; primary = b.left - r.right; cross = Math.abs(y - cy); }
      if (dir === 'up') { if (b.bottom > r.top + 4) return; primary = r.top - b.bottom; cross = Math.abs(x - cx); }
      if (dir === 'down') { if (b.top < r.bottom - 4) return; primary = b.top - r.bottom; cross = Math.abs(x - cx); }
      var score = primary + cross * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) {
      var inTop = function (el) { return !!(el.closest && el.closest('.topbar')); };
      // conteúdo → menu: vai para a aba atual (não para o botão do topo mais próximo)
      if (dir === 'up' && inTop(best) && !inTop(current)) { var tab = document.querySelector('.topbar .tab.active'); if (tab) best = tab; }
      // menu → conteúdo: volta para onde estava nesta aba
      if (dir === 'down' && inTop(current) && !inTop(best)) { var v = document.querySelector('.view.active'), last = v && lastInView[v.id]; if (last && document.body.contains(last) && last.offsetParent !== null && v.contains(last)) best = last; }
      focus(best);
    }
  }
  function preferred(list) {
    var p = list.filter(function (el) { return el.hasAttribute('data-autofocus'); })[0];
    return p || list[0];
  }
  function reset() { var list = items(); focus(preferred(list), true); }

  document.addEventListener('keydown', function (e) {
    var k = KEYS[e.keyCode];
    if (!k) return;
    var inInput = document.activeElement && document.activeElement.tagName === 'INPUT';
    // Dentro de um campo de texto: letras e backspace são do teclado
    if (inInput && (e.keyCode === 8 || (e.keyCode >= 65 && e.keyCode <= 90) || (e.keyCode >= 48 && e.keyCode <= 57) || e.keyCode === 32 || ((k === 'left' || k === 'right') && document.activeElement.value))) return;
    e.preventDefault();
    if (onKey && onKey(k, current) === true) return;
    if (k === 'ok') { if (current) current.click(); return; }
    if (k === 'left' || k === 'right' || k === 'up' || k === 'down') move(k);
  });
  // Magic Remote (ponteiro): passar o mouse foca
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest && e.target.closest('.focusable');
    if (el && el !== current && items().indexOf(el) >= 0) focus(el, true);
  });

  return {
    focus: focus, reset: reset, move: move,
    current: function () { return current; },
    setHandler: function (fn) { onKey = fn; }
  };
})();

/* ---------- atualização automática do código ----------
 * A cada 2 min compara version.json com a versão carregada; se mudou, recarrega a página
 * (tokens e ajustes ficam no localStorage, então a TV/Hub continua conectada). */
PK.updater = (function () {
  function check() {
    if (!window.PK_VERSION) return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.version && j.version !== window.PK_VERSION) location.reload();
    }).catch(function () {});
  }
  setInterval(check, 2 * 60 * 1000);
  return { check: check };
})();

/* Mensagem amigável para falhas de escrita — mostra o motivo real que o PlanKnect devolveu. */
PK.writeErr = function (e) {
  var m = (e && e.message) || '';
  var where = ' para esta TV em planknect.com › Configurações › Dispositivos';
  if (/note/i.test(m) && /edit|writ|enable|forbid|permission/i.test(m)) return 'Ative “Escrever recados”' + where;
  if (/chore/i.test(m) && /edit|enable|forbid|permission/i.test(m)) return 'Ative “Editar missões”' + where;
  if (/(list|shopping)/i.test(m) && /edit|enable|forbid|permission/i.test(m)) return 'Ative “Editar listas”' + where;
  if (/task/i.test(m) && /edit|enable|forbid|permission/i.test(m)) return 'Ative “Editar tarefas”' + where;
  if (/memory/i.test(m)) return 'Ative a memória do Alfred' + where;
  if (/forbidden|403/i.test(m)) return 'Esta TV não tem permissão para isso — veja Ajustes › “O que esta TV pode ver e fazer”';
  if (/not_found|404|HTTP 405/.test(m)) return 'Ainda não disponível no PlanKnect';
  if (/unauthorized/.test(m)) return 'Sessão expirada — conecte a TV de novo';
  return m ? 'PlanKnect: ' + PK.util.esc(m) : 'Não consegui salvar — tente de novo';
};

/* Computador ligado na TV (agent/computer-helper.js): abre o Meet/Zoom/Teams nele e mostra pelo HDMI. */
PK.computer = {
  on: function () { var c = PK.config.computer; return !!(c && c.url && c.secret); },
  join: function (url) {
    var c = PK.config.computer;
    if (!url) { PK.toast('Esta reunião não tem link'); return Promise.resolve(false); }
    if (!PK.computer.on()) { PK.toast('Aponte o celular para o QR para entrar'); return Promise.resolve(false); }
    PK.toast('Abrindo a reunião no computador…');
    return fetch(c.url + '/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url, secret: c.secret }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function () {
        PK.toast('Reunião aberta no computador');
        if (PK.workmode && !PK.workmode.active() && PK.app.state) { if (PK.modes && PK.modes.meeting.active()) PK.modes.meeting.toggle(false); PK.workmode.open(function () { return PK.app.state(); }); }
        return true;
      })
      .catch(function (e) { PK.toast('Computador não respondeu (' + PK.util.esc(e.message) + ') — use o QR'); return false; });
  }
};
