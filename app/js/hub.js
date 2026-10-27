/* PlanKnect nest-hub — Google Nest Hub (1024×600, toque), aberto por Cast.
 * Mesma API, dados e pareamento da TV.
 * Abas: Hoje · Lista · Missões · Jantar · Timers · Clima · Recados · Moldura (tela de espera).
 * Extras: receita passo a passo com timers, contagens (saída, dormir, próximos compromissos,
 * Filme da sexta, aniversários), placar de estrelas, contas do mês, câmera da campainha. */
(function () {
  var U = PK.util, I = PK.icons, C = PK.config, esc = U.esc, $ = function (id) { return document.getElementById(id); };
  var state = { members: [], events: [], chores: [], lists: [], meals: [], notes: [], photos: [], watch: null, weather: null, settings: {} };
  var COLORS = { meeting: '#a78bfa', task: '#60a5fa', milestone: '#fb923c', event: '#34d399', family: '#ff7a9a', church: '#fbbf24', birthday: '#e879f9' };
  var tab = 'today', listSel = null, adding = false, showDone = false, undoId = null, recentDone = {};
  var timers = U.store.get('hubTimers', []), lastTouch = Date.now(), pairT = null, recipe = null;
  var amb = U.store.get('hubAmb', { weather: true, agenda: true, afterMin: 5 });
  if (amb.darkAfterMin == null) amb.darkAfterMin = 45; if (amb.nightDark == null) amb.nightDark = true; if (!amb.saver) amb.saver = 'auto';
  var STAPLES = ['Leite', 'Pão', 'Ovos', 'Banana', 'Café', 'Arroz', 'Feijão', 'Tomate', 'Queijo', 'Manteiga', 'Papel higiênico', 'Detergente'];
  var NOTES = ['Jantar pronto!', 'Já volto', 'Chego em 10 min', 'Hora de dormir', 'Desçam para o café', 'Alguém viu minha chave?'];
  var PRESETS = [['Ovo cozido', 9, 'tooth'], ['Chá', 4, 'plate'], ['Massa', 10, 'chef'], ['Arroz', 18, 'chef'], ['Pizza', 12, 'chef'], ['Bolo', 40, 'cake'],
    ['Pipoca', 3, 'sparkle'], ['Banho das crianças', 20, 'users'], ['Tela / TV', 30, 'tv']];
  var QUICK = [1, 5, 10, 15, 30, 60];
  var MISSIONS = [['Arrumar a cama', 'bed', 'manhã', 5], ['Escovar os dentes', 'tooth', 'manhã', 2], ['Dever de casa', 'book', 'tarde', 10], ['Guardar os brinquedos', 'toy', 'tarde', 5],
    ['Colocar a mesa', 'plate', 'noite', 5], ['Separar a roupa', 'shirt', 'noite', 3], ['Ler 20 minutos', 'book', 'noite', 5], ['Dar comida ao pet', 'paw', 'manhã', 5],
    ['Levar o lixo', 'trash', 'tarde', 5], ['Arrumar o quarto', 'home', 'tarde', 10], ['Lavar a louça', 'plate', 'noite', 10], ['Praticar instrumento', 'star', 'tarde', 10]];
  var nm = { kid: null, repeat: 'daily', points: null };
  var tf = { when: 'late', who: 'all' };   // filtros da aba Tarefas

  /* ---------- base ---------- */
  function fit() {
    var s = Math.min(window.innerWidth / 1024, window.innerHeight / 600);
    $('hub').style.transform = 'translate(' + (window.innerWidth - 1024 * s) / 2 + 'px,' + (window.innerHeight - 600 * s) / 2 + 'px) scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  function show(id) { Array.prototype.forEach.call(document.querySelectorAll('.hub-screen'), function (s) { s.classList.toggle('on', s.id === id); }); }
  function icons(root) { Array.prototype.forEach.call((root || document).querySelectorAll('[data-ic]'), function (i) { i.outerHTML = I.get(i.getAttribute('data-ic'), 24); }); }
  function qr(id, text, size) { var el = $(id); if (!el) return; el.innerHTML = ''; if (window.QRCode) new window.QRCode(el, { text: text, width: size, height: size, colorDark: '#0b1230', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M }); }
  function member(id) { return state.members.filter(function (m) { return m.id === id || m.familyMemberId === id; })[0]; }
  function first(m) { return m ? String(m.name).split(' ')[0] : ''; }
  function av(m, s) { return m ? '<span class="av" style="background:' + m.color + ';' + PK.face(m) + 'width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * .45) + 'px">' + (m.photo ? '' : esc(m.initial)) + '</span>' : ''; }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600); return (h ? h + ':' + U.pad(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + U.pad(s % 60); }
  function until(ms) {
    if (ms <= 0) return 'agora';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    if (d >= 2) return d + ' dias'; if (d === 1) return '1 dia ' + h + 'h';
    if (h) return h + 'h ' + U.pad(m % 60); return m + ' min ' + U.pad(Math.floor(ms / 1000) % 60) + 's';
  }
  function at(hhmm, base) { var p = hhmm.split(':'), d = new Date(base || Date.now()); d.setHours(+p[0], +p[1], 0, 0); return d; }
  function ago(d) { var m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.round(m / 60) + ' h' : m < 2880 ? 'ontem' : 'há ' + Math.round(m / 1440) + ' dias'; }

  /* ---------- pareamento ---------- */
  function pair() {
    show('hub-pair'); clearTimeout(pairT);
    $('hp-status').textContent = 'Gerando código…';
    PK.api.startDeviceAuth({ name: 'Google Nest Hub', model: 'nest-hub' }).then(function (d) {
      qr('hp-qrbox', d.verification_uri_complete, 230);
      $('hp-code').textContent = d.user_code;
      $('hp-url').textContent = (d.verification_uri || C.linkUrl).replace(/^https?:\/\//, '');
      $('hp-status').textContent = 'Aguardando aprovação no celular…';
      var poll = function () {
        pairT = setTimeout(function () {
          PK.api.pollDeviceAuth(d.device_code).then(function (r) {
            if (r.status === 'approved') { PK.data.setMode('live'); start(); return; }
            if (r.status === 'expired') return pair();
            if (r.status === 'denied') { $('hp-status').textContent = 'Conexão recusada.'; return setTimeout(pair, 3000); }
            poll();
          }).catch(poll);
        }, (d.interval || 5) * 1000);
      };
      poll();
    }).catch(function (e) { $('hp-status').textContent = 'PlanKnect não respondeu (' + e.message + '). Use o modo demonstração.'; });
  }

  /* ---------- dados e atualização ---------- */
  var lastVer = null, hasVer = true, lastLoad = 0, loading = null, syncedAt = null, alertsSince = Date.now() - 60000, hasAlerts = true;
  function start() {
    show('hub-main'); clearTimeout(pairT);
    PK.scenes.mount($('hub-bg'), PK.scenes.auto(null), { shade: 'hub' });
    load(); watch();
    PK.weather.load(C.location).then(function (w) { state.weather = w; render(); });
    setInterval(function () { PK.weather.load(C.location).then(function (w) { state.weather = w; }); }, 20 * 60000);
  }
  function watch() {
    setInterval(function () {
      if (hasVer) PK.data.version().then(function (r) { if (r && r.version && r.version !== lastVer) { lastVer = r.version; load(); } }).catch(function () { hasVer = false; });
      if (!hasVer && Date.now() - lastLoad > 15000) load();
      pollAlerts();
    }, 5000);
  }
  function load() {
    if (loading) return loading;
    lastLoad = Date.now();
    loading = PK.data.load().then(function (b) {
      loading = null; for (var k in b) state[k] = b[k];
      var f = state.settings && state.settings.frame; if (f) { for (var k2 in f) amb[k2] = f[k2]; }
      syncedAt = new Date(); render(); if ($('hub-ambient').classList.contains('on')) ambientUI();
    }, function (e) {
      loading = null;
      if (e.message === 'unauthorized') { PK.data.setMode('unlinked'); pair(); }
    });
    return loading;
  }
  // Avisos do PlanKnect (campainha, recados) — GET /alerts; no demo, só os simulados
  function pollAlerts() {
    if (!hasAlerts || PK.data.mode() !== 'live') return;
    PK.api.alerts(alertsSince).then(function (r) { alertsSince = r.now || Date.now(); (r.alerts || []).forEach(incoming); }).catch(function () { hasAlerts = false; });
  }
  function incoming(a) { if (a.kind === 'door') door(a); else banner(a); }
  function write(p, ok) {
    return p.then(function () { if (ok) PK.toast(ok); return load(); }).catch(function (e) {
      PK.toast(PK.writeErr(e), 6000);
      return load();
    });
  }

  /* ---------- topo ---------- */
  function top() {
    var n = new Date(), w = state.weather;
    $('hb-clock').textContent = U.hm(n);
    $('hb-date').textContent = U.longDate(n);
    $('hb-wx').innerHTML = w ? I.get(I.weather(w.code, w.isDay), 24) + ' ' + w.temp + '°' : '';
    var s = syncedAt ? Math.round((Date.now() - syncedAt) / 1000) : null;
    $('hb-sync').innerHTML = I.get('refresh', 18) + (s === null ? '' : s < 60 ? ' agora' : ' há ' + Math.round(s / 60) + ' min');
  }

  /* ---------- contagens (Hoje e Timers) ---------- */
  function countdowns() {
    var now = new Date(), out = [], R = C.routines || {};
    var mr = R.morning, br = R.bedtime;
    if (mr && mr.days.indexOf(now.getDay()) >= 0) { var lv = at(mr.until); if (lv > now && lv - now < 3 * 3600000) out.push({ ic: 'sun2', label: mr.label, at: lv, accent: '#fbbf24', key: 'leave' }); }
    if (br && br.days.indexOf(now.getDay()) >= 0) { var bd = at(br.until); if (bd > now && now.getHours() >= 15) out.push({ ic: 'moon', label: br.label, at: bd, accent: '#a78bfa' }); }
    state.events.filter(function (e) { return !e.allDay && e.start > now && e.start - now < 36 * 3600000 && e.type !== 'birthday'; }).slice(0, 3).forEach(function (e) {
      out.push({ ic: e.type === 'meeting' ? 'video' : e.type === 'church' ? 'church' : 'calendar', label: e.private ? 'Ocupado' : e.title, at: e.start, accent: COLORS[e.type] || '#60a5fa' });
    });
    var mn = state.watch && state.watch.movieNight;
    if (mn) { var d = U.startOfDay(now); d.setDate(d.getDate() + ((mn.day - d.getDay() + 7) % 7)); var mt = at(mn.time, d); if (mt < now) mt.setDate(mt.getDate() + 7); out.push({ ic: 'tv', label: 'Filme da sexta', at: mt, accent: '#f472b6' }); }
    var bday = state.events.filter(function (e) { return e.type === 'birthday' && e.start >= U.startOfDay(now); })[0];
    if (bday) out.push({ ic: 'cake', label: bday.title.replace(/^Aniversário\s*—\s*/, 'Aniversário: '), at: U.startOfDay(bday.start), accent: '#e879f9', day: true });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function bills() {
    var l = state.lists.filter(function (x) { return /payment|pagamento|conta/i.test(x.name); })[0]; if (!l) return null;
    var open = l.items.filter(function (i) { return !i.done; }), now = U.startOfDay(new Date());
    var soon = open.filter(function (i) { return i.due && new Date(i.due) - now < 7 * 864e5; });
    var late = open.filter(function (i) { return i.due && new Date(i.due) < now; });
    return { list: l, open: open, soon: soon, late: late };
  }

  /* ---------- HOJE ---------- */
  function today() {
    var now = new Date();
    var timed = state.events.filter(function (e) { return U.sameDay(e.start, now) && !e.allDay; });
    var next = timed.filter(function (e) { return e.end > now; })[0];
    var meal = state.meals.filter(function (m) { return U.sameDay(m.date, now); })[0];
    var leave = countdowns().filter(function (c) { return c.key === 'leave'; })[0];
    var b = bills();
    var hero = next ? '<div class="hb-hero" style="--c:' + (COLORS[next.type] || '#60a5fa') + '"><div class="hh-k">' + (next.start <= now ? 'AGORA' : 'A SEGUIR · ' + U.relMinutes((next.start - now) / 60000)) + '</div>' +
      '<div class="hh-t">' + esc(next.private ? 'Ocupado' : next.title) + '</div><div class="hh-m">' + U.hm(next.start) + ' – ' + U.hm(next.end) + ' ' + PK.who(state, next, 30, 4) + '</div></div>'
      : '<div class="hb-hero"><div class="hh-k">HOJE</div><div class="hh-t">Agenda livre</div></div>';
    var chips = (meal ? '<button class="chip" data-go="dinner">' + I.get('chef', 22) + ' ' + esc(meal.title) + '</button>' : '') +
      (state.lists[0] ? '<button class="chip" data-go="list">' + I.get('cart', 22) + ' ' + state.lists[0].items.filter(function (i) { return !i.done; }).length + ' na lista</button>' : '') +
      (b && b.open.length ? '<button class="chip' + (b.late.length ? ' warn' : '') + '" data-golist="' + b.list.id + '">' + I.get('card', 22) + ' ' + (b.late.length ? b.late.length + ' conta' + (b.late.length > 1 ? 's' : '') + ' atrasada' + (b.late.length > 1 ? 's' : '') : b.soon.length ? b.soon.length + ' conta' + (b.soon.length > 1 ? 's' : '') + ' esta semana' : b.open.length + ' contas do mês') + '</button>' : '') +
      (function () { var g = taskGroups(); var n = g.today.length + g.late.length; return n ? '<button class="chip' + (g.late.length ? ' warn' : '') + '" data-go="tasks">' + I.get('task', 22) + ' ' + (g.today.length ? g.today.length + ' tarefa' + (g.today.length > 1 ? 's' : '') + ' hoje' : '') + (g.today.length && g.late.length ? ' · ' : '') + (g.late.length ? g.late.length + ' atrasada' + (g.late.length > 1 ? 's' : '') : '') + '</button>' : ''; })() +
      (PK.music ? PK.music.chip() : '') +
      (state.notes.length ? '<button class="chip" data-go="notes">' + I.get('note', 22) + ' ' + state.notes.length + ' recado' + (state.notes.length > 1 ? 's' : '') + '</button>' : '');
    var side = timed.length ? timed.map(function (e) {
      return '<div class="tl-r' + (e.end <= now ? ' past' : '') + '" style="--c:' + (COLORS[e.type] || '#60a5fa') + '"><b>' + U.hm(e.start) + '</b><i></i><span>' + esc(e.private ? 'Ocupado' : e.title) + '</span>' + PK.who(state, e, 24, 3) + '</div>';
    }).join('') : '<div class="hb-empty">Nada marcado para hoje.</div>';
    return '<div class="hb-today"><div class="ht-l">' +
      (leave ? '<div class="leave" style="--c:' + leave.accent + '">' + I.get('sun2', 26) + '<span>' + esc(leave.label) + ' em</span><b data-cd="' + leave.at.getTime() + '">' + until(leave.at - now) + '</b></div>' : '<div class="ht-time">' + U.hm(now) + '</div>') +
      hero + '<div class="ht-chips">' + chips + '</div>' +
      '<div class="ht-acts"><button class="act" data-act="notes-sheet">' + I.get('note', 22) + ' Avisar a família</button><button class="act" data-act="phone-add">' + I.get('qr', 22) + ' Adicionar pelo celular</button></div></div>' +
      '<div class="ht-r glass">' + todayWx() + '<div class="sec">HOJE</div><div class="hb-tl">' + side + '</div></div></div>';
  }

  // Clima resumido no topo do Hoje (toque abre a aba Clima)
  function todayWx() {
    var w = state.weather; if (!w) return '';
    var d = w.days[0], hrs = (w.hours || []).filter(function (h, i) { return i > 0 && i % 3 === 0; }).slice(0, 4);
    return '<button class="tw" data-go="weather"><div class="tw-now">' + I.get(I.weather(w.code, w.isDay), 46, ' stroke-width="1.4"') + '<b>' + w.temp + '°</b><div><span>' + I.weatherText(w.code) + '</span><small>↑ ' + d.max + '°  ↓ ' + d.min + '° · ' + (d.rain || 0) + '% chuva</small></div></div>' +
      '<div class="tw-h">' + hrs.map(function (h) { return '<div><small>' + U.pad(h.time.getHours()) + 'h</small>' + I.get(I.weather(h.code, h.isDay), 22) + '<b>' + h.temp + '°</b></div>'; }).join('') + '</div></button>';
  }

  /* ---------- LISTA ---------- */
  function list() {
    var l = state.lists.filter(function (x) { return x.id === listSel; })[0] || state.lists[0];
    if (!l) return '<div class="hb-empty">Nenhuma lista.</div>';
    var now = Date.now(), isBills = /payment|pagamento|conta/i.test(l.name);
    var open = l.items.filter(function (i) { return !i.done || now - (recentDone[i.id] || 0) < 2500; });
    if (isBills) open.sort(function (a, b) { return (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity); });
    var done = l.items.filter(function (i) { return i.done && !(now - (recentDone[i.id] || 0) < 2500); });
    var sod = U.startOfDay(new Date());
    return '<div class="hb-list"><div class="hl-tabs">' + state.lists.map(function (x) {
      return '<button class="' + (x.id === l.id ? 'on' : '') + '" data-list="' + x.id + '">' + esc(x.name) + ' <b>' + x.items.filter(function (i) { return !i.done; }).length + '</b></button>';
    }).join('') + '</div><div class="hl-items">' + open.concat(showDone ? done : []).map(function (i) {
      var due = i.due ? new Date(i.due) : null, dueTxt = due ? (due < sod ? 'atrasada' : U.dueLabel(due, new Date())) : '';
      return '<button class="hl-i' + (i.done ? ' done' : '') + (recentDone[i.id] && i.done ? ' leaving' : '') + (due && due < sod ? ' late' : '') + '" data-item="' + esc(i.id) + '" data-l="' + l.id + '"><span class="box">' + I.get('check', 22, ' stroke-width="3"') + '</span><span class="hl-t">' + esc(i.title) + (dueTxt ? '<small>' + dueTxt + '</small>' : '') + '</span></button>';
    }).join('') + (!open.length ? '<div class="hb-empty">' + (isBills ? 'Tudo pago!' : 'Tudo comprado!') + '</div>' : '') + '</div>' +
      (done.length ? '<button class="hl-done" data-act="toggle-done">' + I.get('check', 18) + ' ' + done.length + (isBills ? ' paga' : ' comprado') + (done.length > 1 ? 's' : '') + ' · ' + (showDone ? 'esconder' : 'ver') + '</button>' : '') +
      (undoId ? '<button class="hl-undo" data-act="undo">Desfazer</button>' : '') +
      '<div class="hl-qr"><button class="hl-add" data-act="quick-add">' + I.get('plus', 24) + ' Adicionar</button><div id="hl-qrbox"></div><span></span></div>' + (adding ? quickAdd(l) : '') + '</div>';
  }
  function quickAdd(l) {
    var have = {}; l.items.forEach(function (i) { if (!i.done) have[i.title.toLowerCase()] = 1; });
    var past = l.items.filter(function (i) { return i.done; }).map(function (i) { return i.title; });
    var sugg = past.concat(STAPLES).filter(function (t, i, a) { return !have[t.toLowerCase()] && a.indexOf(t) === i; }).slice(0, 12);
    return '<div class="qa"><div class="qa-box"><div class="qa-h">Adicionar em ' + esc(l.name) + '<button data-act="quick-close">' + I.get('x', 26) + '</button></div>' +
      '<div class="qa-grid">' + sugg.map(function (t) { return '<button data-qadd="' + esc(t) + '" data-l="' + l.id + '">' + I.get('plus', 20) + ' ' + esc(t) + '</button>'; }).join('') + '</div>' +
      '<div class="qa-foot"><div id="qa-qr"></div><span>Outro item? Aponte o celular e digite ou fale.</span></div></div></div>';
  }

  /* ---------- TAREFAS ---------- */
  var PRIO = { urgent: ['Urgente', 'urgent'], high: ['Alta', 'high'], medium: ['Média', 'med'], low: ['Baixa', 'low'] };
  function late(d) {
    var days = Math.round((U.startOfDay(new Date()) - U.startOfDay(d)) / 864e5);
    if (days <= 0) return U.dueLabel(d, new Date());
    if (days === 1) return 'atrasada desde ontem';
    if (days < 30) return 'atrasada há ' + days + ' dias';
    var mo = Math.round(days / 30); return 'atrasada há ' + mo + (mo > 1 ? ' meses' : ' mês');
  }
  function taskGroups() {
    var sod = U.startOfDay(new Date()), eow = U.addDays(sod, 7);
    var open = state.tasks.filter(function (t) { return t.status !== 'done' && (tf.who === 'all' || t.assignee === tf.who); });
    return {
      late: open.filter(function (t) { return t.due && t.due < sod; }),
      today: open.filter(function (t) { return t.due && U.sameDay(t.due, sod); }),
      week: open.filter(function (t) { return t.due && t.due > sod && t.due < eow && !U.sameDay(t.due, sod); }),
      none: open.filter(function (t) { return !t.due || t.due >= eow; })
    };
  }
  function tasksView() {
    var g = taskGroups(), labels = { late: 'Atrasadas', today: 'Hoje', week: 'Próximos 7 dias', none: 'Depois / sem data' };
    if (!g[tf.when].length) { var firstNon = ['today', 'week', 'late', 'none'].filter(function (k) { return g[k].length; })[0]; if (firstNon && tf.userWhen !== true) tf.when = firstNon; }
    var list = g[tf.when].slice().sort(function (a, b) { var pa = a.priority === 'high' ? 0 : a.priority === 'medium' ? 1 : 2, pb = b.priority === 'high' ? 0 : b.priority === 'medium' ? 1 : 2; return pa - pb || ((b.due || 0) - (a.due || 0)); });
    var people = state.members.filter(function (m) { return state.tasks.some(function (t) { return t.assignee === m.id; }); });
    return '<div class="hb-tasks"><div class="tk-bar"><div class="seg">' + ['late', 'today', 'week', 'none'].map(function (k) {
      return '<button class="' + (tf.when === k ? 'on' : '') + (k === 'late' && g.late.length ? ' warn' : '') + '" data-tf="when:' + k + '">' + labels[k] + ' <b>' + g[k].length + '</b></button>';
    }).join('') + '</div>' + (people.length ? '<div class="seg">' + '<button class="' + (tf.who === 'all' ? 'on' : '') + '" data-tf="who:all">Todos</button>' + people.map(function (m) { return '<button class="' + (tf.who === m.id ? 'on' : '') + '" data-tf="who:' + m.id + '">' + av(m, 22) + '</button>'; }).join('') + '</div>' : '') +
      '<button class="act" data-act="task-new">' + I.get('plus', 20) + ' Nova</button></div>' +
      '<div class="tk-list">' + (list.length ? list.slice(0, 7).map(function (t) {
        var p = PRIO[t.priority] || PRIO.medium, who = member(t.assignee);
        return '<button class="tk" data-task="' + esc(t.id) + '"><span class="pr ' + p[1] + '">' + p[0] + '</span><span class="tk-m"><b>' + esc(t.title) + '</b><small>' + esc(t.project || '') + '</small></span>' +
          '<span class="tk-d' + (t.due && t.due < U.startOfDay(new Date()) ? ' late' : '') + '">' + (t.due ? late(t.due) : 'sem data') + '</span>' + (who ? av(who, 28) : '') + '</button>';
      }).join('') + (list.length > 7 ? '<div class="tk-more">+ ' + (list.length - 7) + ' tarefas · veja todas no PlanKnect</div>' : '') : '<div class="hb-empty">Nada aqui. ' + (tf.when === 'late' ? 'Nenhuma tarefa atrasada!' : '') + '</div>') + '</div></div>';
  }
  function taskSheet(id) {
    var t = state.tasks.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var p = PRIO[t.priority] || PRIO.medium;
    sheet('<div class="qa-h"><span class="pr ' + p[1] + '">' + p[0] + '</span><button data-act="sheet-close">' + I.get('x', 26) + '</button></div>' +
      '<div class="tsk-t">' + esc(t.title) + '</div><div class="tsk-s">' + esc(t.project || '') + (t.due ? ' · ' + late(t.due) : '') + '</div>' +
      '<div class="tsk-a"><button class="done" data-tdo="' + esc(t.id) + ':done">' + I.get('check', 24, ' stroke-width="3"') + ' Concluir</button>' +
      '<button data-tdo="' + esc(t.id) + ':tomorrow">Adiar para amanhã</button><button data-tdo="' + esc(t.id) + ':week">Adiar 1 semana</button></div>' +
      '<div class="qa-foot"><div id="qa-qr"></div><span>Detalhes, subtarefas e comentários no celular.</span></div>');
    qr('qa-qr', C.baseUrl + '/tasks/' + encodeURIComponent(t.id), 90);
  }

  /* ---------- MISSÕES (com placar da semana) ---------- */
  function chores() {
    var kids = state.members.filter(function (m) { return m.kid; });
    if (!kids.length) return '<div class="hb-empty">Nenhuma criança marcada como criança no PlanKnect.<br>Em Família, marque quem é criança para as missões aparecerem aqui.</div>';
    kids.forEach(function (k) { k.week = Math.max(+k.weekStars || 0, +k.stars || 0, +k.weekLocal || 0); });
    var ranked = kids.slice().sort(function (a, b) { return b.week - a.week; });
    var medal = ['#fbbf24', '#cbd5e1', '#f59e0b'];
    var board = '<div class="hk-board"><span class="hb-l">' + I.get('star', 20) + ' PLACAR DA SEMANA</span>' + ranked.map(function (k, i) {
      var g = (k.reward && k.reward.goal) || 50, pct = Math.min(100, Math.round(k.week / g * 100));
      return '<div class="hb-k" style="--k:' + k.color + '"><b class="pos" style="background:' + (medal[i] || '#64748b') + '">' + (i + 1) + '</b>' + av(k, 26) + '<span>' + esc(first(k)) + '</span><em>' + k.week + '★</em>' +
        (k.reward ? '<i class="rw"><i style="width:' + pct + '%"></i></i>' : '') + '</div>';
    }).join('') + '<button class="hk-new" data-act="mission-new">' + I.get('plus', 20) + ' Nova missão</button></div>';
    return board + '<div class="hb-kids" style="grid-template-columns:repeat(' + kids.length + ',1fr)">' + kids.map(function (k) {
      var mine = state.chores.filter(function (c) { return c.member === k.id; }), dn = mine.filter(function (c) { return c.done; }).length, pend = mine.filter(function (c) { return c.pending && !c.done; }).length;
      return '<div class="hk" style="--k:' + k.color + '"><div class="hk-h">' + av(k, 40) + '<b>' + esc(first(k)) + '</b><span>' + dn + '/' + mine.length + (pend ? ' · ⏳' + pend : '') + '</span></div>' +
        (mine.length ? mine.map(function (c) { var p = c.pending && !c.done; return '<button class="hk-c' + (c.done ? ' done' : '') + (p ? ' pending' : '') + '" data-chore="' + esc(c.id) + '"><span class="ic">' + I.get(p ? 'clock' : c.icon, 22) + '</span><span class="hk-t">' + esc(c.title) + (p ? '<small>aguardando um adulto aprovar' + (c.points ? ' · +' + c.points + '★' : '') + '</small>' : c.done && c.points ? '<small>+' + c.points + '★</small>' : '') + '</span></button>'; }).join('') : '<div class="hb-empty">Sem missões</div>') + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- JANTAR (com receita passo a passo) ---------- */
  var mealCache = {};
  function dinner() {
    var now = new Date(), meal = state.meals.filter(function (m) { return U.sameDay(m.date, now); })[0];
    var week = state.meals.map(function (m) { return '<div class="dw' + (U.sameDay(m.date, now) ? ' on' : '') + '"><b>' + U.DAYS_S[m.date.getDay()] + '</b><span>' + esc(m.title) + '</span></div>'; }).join('');
    return '<div class="hb-dinner"><div class="hd-main glass">' + (meal ? '<div class="sec">JANTAR DE HOJE</div><h1>' + esc(meal.title) + '</h1>' +
      (member(meal.cook) ? '<div class="hd-cook">' + av(member(meal.cook), 30) + ' ' + esc(first(member(meal.cook))) + ' cozinha</div>' : '') +
      '<div id="hd-ings" class="hd-ings">…</div><div id="hd-steps"></div>' : '<h1>Sem jantar planejado</h1><p class="hb-empty">Planeje a semana no PlanKnect.</p>') + '</div>' +
      '<div class="hd-week glass"><div class="sec">SEMANA</div>' + (week || '<div class="hb-empty">—</div>') + '</div></div>';
  }
  function mealDetail(title) { if (mealCache[title]) return Promise.resolve(mealCache[title]); return PK.data.detail('meal', title).then(function (d) { mealCache[title] = d; return d; }); }
  function fillDinner() {
    var meal = state.meals.filter(function (m) { return U.sameDay(m.date, new Date()); })[0], box = $('hd-ings'); if (!meal || !box) return;
    mealDetail(meal.title).then(function (d) {
      var l = state.lists[0], have = function (x) { return l && l.items.some(function (i) { return !i.done && i.title.toLowerCase() === x.toLowerCase(); }); };
      var miss = (d.ingredients || []).filter(function (x) { return !have(x); });
      box.innerHTML = (d.ingredients || []).map(function (x) { return '<span class="' + (have(x) ? 'in' : '') + '">' + esc(x) + '</span>'; }).join('') +
        (miss.length && l ? '<button class="hd-add" data-add="' + esc(miss.join('|')) + '">' + I.get('plus', 22) + ' ' + miss.length + ' na lista</button>' : '');
      var st = $('hd-steps'), steps = d.steps || [];
      if (st && steps.length) {
        var total = steps.reduce(function (s, x) { return s + (x.minutes || 0); }, 0);
        st.innerHTML = '<button class="hd-cook-btn" data-act="recipe">' + I.get('play', 22) + ' Cozinhar passo a passo<small>' + steps.length + ' passos · ~' + total + ' min</small></button>';
      }
    }).catch(function () { box.textContent = 'Sem receita cadastrada.'; });
  }
  function openRecipe() {
    var meal = state.meals.filter(function (m) { return U.sameDay(m.date, new Date()); })[0]; if (!meal) return;
    mealDetail(meal.title).then(function (d) { recipe = { title: meal.title, steps: d.steps || [], i: 0 }; drawRecipe(); });
  }
  function drawRecipe() {
    var el = $('hub-recipe'); if (!recipe) { el.classList.remove('on'); return; }
    var s = recipe.steps[recipe.i], n = recipe.steps.length;
    var running = timers.filter(function (t) { return t.recipe === recipe.title + '#' + recipe.i; })[0];
    el.innerHTML = '<div class="rc-top"><b>' + esc(recipe.title) + '</b><span>Passo ' + (recipe.i + 1) + ' de ' + n + '</span><button data-act="recipe-close">' + I.get('x', 26) + '</button></div>' +
      '<div class="rc-dots">' + recipe.steps.map(function (x, i) { return '<i class="' + (i < recipe.i ? 'done' : i === recipe.i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="rc-step">' + esc(s.text) + '</div>' +
      (s.minutes ? (running ? '<div class="rc-run">' + I.get('refresh', 26) + ' <b data-cd="' + running.end + '">' + mmss(running.end - Date.now()) + '</b> no timer</div>'
        : '<button class="rc-timer" data-act="recipe-timer">' + I.get('refresh', 26) + ' Iniciar timer de ' + s.minutes + ' min</button>') : '') +
      '<div class="rc-nav"><button data-act="recipe-prev"' + (recipe.i ? '' : ' disabled') + '>‹ Anterior</button><button class="next" data-act="recipe-next">' + (recipe.i < n - 1 ? 'Próximo ›' : 'Pronto!') + '</button></div>';
    el.classList.add('on');
  }

  /* ---------- TIMERS + CONTAGENS ---------- */
  function ring(frac, size, color) {
    var r = size / 2 - 7, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/>' +
      '<circle class="arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c * Math.max(0, Math.min(1, frac)) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  function left(t) { return t.paused ? t.remain : t.end - Date.now(); }
  function timersView() {
    var run = timers.map(function (t) {
      var l = left(t), frac = l / t.total, ringing = l <= 0 && !t.paused;
      return '<div class="tm' + (ringing ? ' ring-on' : '') + (t.paused ? ' paused' : '') + '" data-tid="' + t.id + '"><div class="tm-r">' + ring(frac, 118, ringing ? '#fbbf24' : t.paused ? '#64748b' : '#a78bfa') +
        '<b class="tm-t">' + mmss(l) + '</b></div><div class="tm-i"><span>' + esc(t.label) + '</span><div class="tm-b">' +
        (ringing ? '<button data-stop="' + t.id + '">Parar</button>' : '<button data-pause="' + t.id + '">' + (t.paused ? 'Continuar' : 'Pausar') + '</button><button data-plus="' + t.id + '">+1 min</button><button data-stop="' + t.id + '">' + I.get('x', 18) + '</button>') + '</div></div></div>';
    }).join('');
    var cds = countdowns().slice(0, 5).map(function (c) {
      return '<div class="cd" style="--c:' + c.accent + '">' + I.get(c.ic, 22) + '<span>' + esc(c.label) + '</span><b data-cd="' + c.at.getTime() + '"' + (c.day ? ' data-day="1"' : '') + '>' + (c.day ? until(c.at - Date.now()).replace(/ \d+h$/, '') : until(c.at - Date.now())) + '</b></div>';
    }).join('');
    return '<div class="hb-timers"><div class="tp"><div class="sec">RECEITAS E ROTINAS</div><div class="tp-grid">' + PRESETS.map(function (p) {
      return '<button data-timer="' + p[1] + '" data-label="' + esc(p[0]) + '">' + I.get(p[2], 22) + '<b>' + esc(p[0]) + '</b><small>' + p[1] + ' min</small></button>';
    }).join('') + '</div><div class="tp-quick">' + QUICK.map(function (m) { return '<button data-timer="' + m + '">' + m + '′</button>'; }).join('') + '</div></div>' +
      '<div class="tr-col">' + (run ? '<div class="tm-list">' + run + '</div>' : '') +
      '<div class="glass cds' + (run ? '' : ' big') + '"><div class="sec">CONTAGEM PARA O QUE VEM</div>' + (cds || '<div class="hb-empty">Nada marcado nas próximas horas.</div>') + '</div></div></div>';
  }
  function addTimer(min, label, extra) {
    var t = { id: U.uid(), end: Date.now() + min * 60000, total: min * 60000, label: label || ('Timer de ' + min + ' min') };
    for (var k in extra || {}) t[k] = extra[k];
    timers.push(t); saveTimers(); beep(1); return t;
  }
  function saveTimers() { U.store.set('hubTimers', timers); }

  /* ---------- CLIMA ---------- */
  function weatherView() {
    var w = state.weather; if (!w) return '<div class="hb-empty">Carregando clima…</div>';
    var d0 = w.days[0], hrs = (w.hours || []).slice(0, 13);
    var W = 620, H = 170, x0 = 20, x1 = W - 20, tMin = Math.min.apply(null, hrs.map(function (h) { return h.temp; })), tMax = Math.max.apply(null, hrs.map(function (h) { return h.temp; }));
    if (tMax === tMin) tMax++;
    var X = function (i) { return x0 + (x1 - x0) * i / Math.max(1, hrs.length - 1); }, Y = function (t) { return 110 - 60 * (t - tMin) / (tMax - tMin); };
    var line = hrs.map(function (h, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(h.temp).toFixed(1); }).join('');
    var chart = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '"><path d="' + line + 'L' + X(hrs.length - 1) + ' 120L' + x0 + ' 120Z" fill="rgba(251,191,36,.15)"/><path d="' + line + '" fill="none" stroke="#fbbf24" stroke-width="3"/>' +
      hrs.map(function (h, i) {
        var bh = 28 * (h.rain || 0) / 100;
        return '<rect x="' + (X(i) - 7) + '" y="' + (150 - bh) + '" width="14" height="' + bh + '" rx="3" fill="#60a5fa" opacity="' + (h.rain >= 50 ? .9 : .45) + '"/>' +
          (i % 2 === 0 ? '<text x="' + X(i) + '" y="' + (Y(h.temp) - 10) + '" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">' + h.temp + '°</text><text x="' + X(i) + '" y="168" text-anchor="middle" font-size="13" fill="#9aa8d1">' + (i ? U.pad(h.time.getHours()) + 'h' : 'agora') + '</text>' : '');
      }).join('') + '</svg>';
    var tip = (d0.rain || 0) >= 50 ? 'Leve guarda-chuva: ' + d0.rain + '% de chuva hoje.' : d0.max >= 28 ? 'Dia quente: água e protetor para as crianças.' : d0.min <= 12 ? 'Manhã fria: casaco para a escola.' : d0.uv >= 7 ? 'UV ' + d0.uv + ': protetor solar.' : 'Tempo tranquilo hoje.';
    return '<div class="hb-wx"><div class="wx-now glass"><div class="wn-h">' + I.get(I.weather(w.code, w.isDay), 80, ' stroke-width="1.3"') + '<div><b>' + w.temp + '°</b><span>' + I.weatherText(w.code) + '</span></div></div>' +
      '<div class="wn-mm">↑ ' + d0.max + '°  ↓ ' + d0.min + '° · sensação ' + w.feels + '°</div>' +
      '<div class="wn-g"><div>' + I.get('rain', 20) + '<span>Chuva</span><b>' + (d0.rain || 0) + '%</b></div><div>' + I.get('fog', 20) + '<span>Vento</span><b>' + (w.wind || d0.wind || '–') + ' km/h</b></div>' +
      '<div>' + I.get('sun2', 20) + '<span>Nascer</span><b>' + (d0.sunrise ? U.hm(d0.sunrise) : '–') + '</b></div><div>' + I.get('moon', 20) + '<span>Pôr</span><b>' + (d0.sunset ? U.hm(d0.sunset) : '–') + '</b></div></div>' +
      '<div class="wn-tip">' + I.get('sparkle', 18) + ' ' + tip + '</div></div>' +
      '<div class="wx-r"><div class="glass wx-h"><div class="sec">PRÓXIMAS 12 HORAS · ' + esc(w.name) + '</div>' + chart + '</div>' +
      '<div class="glass wx-d">' + w.days.slice(1, 6).map(function (d) { return '<div><b>' + U.DAYS_S[d.date.getDay()] + '</b>' + I.get(I.weather(d.code, true), 30) + '<span>' + d.max + '° <em>' + d.min + '°</em></span><small>' + (d.rain || 0) + '%</small></div>'; }).join('') + '</div></div></div>';
  }

  /* ---------- RECADOS (com "visto por") ---------- */
  function notesView() {
    var ns = state.notes || [], seenOf = function (n) { return (n.seenBy || []).map(member).filter(Boolean); };
    var unseen = ns.filter(function (n) { return !seenOf(n).length; }).length;
    return '<div class="hb-notes"><div class="nb-h"><div class="sec">RECADOS DA FAMÍLIA' + (ns.length ? ' · ' + ns.length + (unseen ? ' · <b>' + unseen + ' novo' + (unseen > 1 ? 's' : '') + '</b>' : '') : '') + '</div><button class="act" data-act="note-new">' + I.get('plus', 22) + ' Novo recado</button></div>' +
      (ns.length ? '<div class="nb-grid">' + ns.slice(0, 6).map(function (n, i) {
        var by = member(n.by), seen = seenOf(n), isNew = !seen.length;
        var missing = state.members.filter(function (m) { return seen.indexOf(m) < 0 && m !== by; });
        return '<div class="nb-c c' + (i % 4) + ' r' + (i % 3) + (isNew ? ' new' : '') + '"><i class="nb-pin"></i>' + (isNew ? '<span class="nb-new">NOVO</span>' : '') +
          '<div class="nb-by">' + (by ? av(by, 30) + '<span><b>' + esc(first(by)) + '</b><small>' + (n.at ? ago(n.at) : '') + '</small></span>' : '<small>' + (n.at ? ago(n.at) : '') + '</small>') + '</div><p>' + esc(n.text) + '</p>' +
          '<div class="nb-s"><span>' + (seen.length ? I.get('check', 16) + seen.map(function (m) { return av(m, 22); }).join('') : 'Ninguém viu ainda') + '</span>' +
          (missing.length ? '<button data-seen="' + esc(n.id) + '">' + I.get('check', 18) + ' Vi</button>' : '<em>Todos viram</em>') + '</div></div>';
      }).join('') + '</div>' : '<div class="nb-empty">' + I.get('note', 64) + '<b>O mural está vazio</b><span>Toque em “Novo recado” — aparece na TV e no PlanKnect.</span></div>') + '</div>';
  }

  /* ---------- render ---------- */
  function render() {
    top();
    var v = $('hb-view');
    v.innerHTML = { today: today, list: list, chores: chores, tasks: tasksView, dinner: dinner, timers: timersView, weather: weatherView, notes: notesView }[tab]();
    Array.prototype.forEach.call(document.querySelectorAll('.hb-nav button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    $('hb-tbadge').textContent = timers.length ? timers.length : '';
    if (tab === 'list') listQr();
    if (tab === 'dinner') fillDinner();
  }
  function listQr() {
    var cl = (state.lists.filter(function (x) { return x.id === listSel; })[0] || state.lists[0] || {}).id; if (!cl) return;
    PK.data.shareUrl(cl).then(function (sh) {
      qr('hl-qrbox', sh.url, 110); if (adding) qr('qa-qr', sh.url + (sh.url.indexOf('?') < 0 ? '?' : '&') + 'add=1', 96);
      var lb = document.querySelector('.hl-qr span');
      if (lb) lb.textContent = sh.public ? 'Qualquer pessoa com este QR vê e marca até ' + U.shortDate(new Date(sh.expires)) : 'Abrir no celular (precisa estar logado)';
    });
  }

  /* ---------- alarme, campainha, avisos ---------- */
  var audio = null;
  function beep(n) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      for (var i = 0; i < (n || 3); i++) (function (t) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(.4, audio.currentTime + t + .02);
        g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + t + .25);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .3);
      })(i * .35);
    } catch (e) {}
  }
  var doorT = null;
  function door(a) {
    exitAmbient();
    var el = $('hub-door'), img = a.image || a.image_url, vid = a.video_url;
    el.innerHTML = (a.live ? '<div class="dr-img"><video id="dr-live" autoplay muted playsinline></video></div>' :
      vid ? '<div class="dr-img"><video src="' + esc(vid) + '" autoplay muted loop playsinline></video></div>' :
      img ? '<div class="dr-img" id="dr-img" style="background-image:url(\'' + esc(img) + '\')"></div>' : '<div class="dr-img none">' + I.get('home', 90) + '</div>') +
      '<div class="dr-p"><div class="dr-k">CAMPAINHA</div><b>' + esc(a.title || 'Tem alguém na porta') + '</b><span>' + esc(a.body || '') + ' · ' + U.hm(new Date()) + '</span><button data-act="door-close">Ok, vou atender</button></div>';
    el.classList.add('on'); beep(4);
    if (a.live) doorLive(a.device_id);
    clearInterval(doorT);
    if (img) doorT = setInterval(function () { var i = $('dr-img'); if (i) i.style.backgroundImage = "url('" + img + (img.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now() + "')"; }, 2000);
    setTimeout(closeDoor, 90000);
  }
  // Ao vivo: WebRTC só de recepção (áudio, vídeo e canal de dados, na ordem que o Google exige)
  var doorPc = null;
  function doorLive(deviceId) {
    if (!window.RTCPeerConnection || !PK.api.doorLive) return;
    try {
      doorPc = new RTCPeerConnection();
      doorPc.addTransceiver('audio', { direction: 'recvonly' });
      doorPc.addTransceiver('video', { direction: 'recvonly' });
      doorPc.createDataChannel('dataSendChannel');
      doorPc.ontrack = function (ev) { var v = $('dr-live'); if (v && ev.streams[0]) v.srcObject = ev.streams[0]; };
      doorPc.createOffer().then(function (o) { return doorPc.setLocalDescription(o).then(function () { return PK.api.doorLive(o.sdp, deviceId); }); })
        .then(function (r) { return doorPc.setRemoteDescription({ type: 'answer', sdp: r.answerSdp }); })
        .catch(function () { var v = $('dr-live'); if (v) v.parentNode.innerHTML = I.get('home', 90); });
    } catch (e) {}
  }
  function closeDoor() { $('hub-door').classList.remove('on'); clearInterval(doorT); if (doorPc) { try { doorPc.close(); } catch (e) {} doorPc = null; } }
  function banner(a) {
    var el = $('hub-banner');
    el.innerHTML = I.get(a.icon || 'note', 26) + '<div><b>' + esc(a.title) + '</b>' + (a.body ? '<span>' + esc(a.body) + '</span>' : '') + '</div>';
    el.classList.add('on'); beep(2); clearTimeout(banner.t); banner.t = setTimeout(function () { el.classList.remove('on'); }, 20000);
  }

  function tick() {
    var now = Date.now();
    var ringing = timers.filter(function (t) { return !t.paused && t.end <= now; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tid]'), function (el) {
      var t = timers.filter(function (x) { return x.id === el.getAttribute('data-tid'); })[0]; if (!t) return;
      var l = left(t), r = 118 / 2 - 7, c = 2 * Math.PI * r, arc = el.querySelector('.arc');
      el.querySelector('.tm-t').textContent = mmss(l);
      if (arc) arc.setAttribute('stroke-dasharray', c * Math.max(0, l / t.total) + ' ' + c);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cd]'), function (el) {
      var ms = +el.getAttribute('data-cd') - now;
      el.textContent = el.closest('.rc-run') ? mmss(ms) : el.hasAttribute('data-day') ? until(ms).replace(/ \d+h$/, '') : until(ms);
    });
    var al = $('hub-alarm');
    if (ringing.length) {
      if (!al.classList.contains('on') || al.getAttribute('data-id') !== ringing[0].id) {
        al.setAttribute('data-id', ringing[0].id);
        al.innerHTML = '<div>' + ring(1, 160, '#fbbf24') + '<b>' + esc(ringing[0].label) + '</b><span>terminou</span><div class="al-b"><button data-plus="' + ringing[0].id + '">+1 min</button><button class="stop" data-stop="' + ringing[0].id + '">Parar</button></div></div>';
        al.classList.add('on'); exitAmbient();
      }
      if (Math.floor(now / 1000) % 2 === 0) beep();
    } else al.classList.remove('on');
    if ($('hb-clock') && $('hb-clock').textContent !== U.hm(new Date())) { top(); if (tab === 'today' || tab === 'timers') render(); }
    if (recipe && document.querySelector('.rc-run [data-cd]') && +document.querySelector('.rc-run [data-cd]').getAttribute('data-cd') <= now) drawRecipe();
    if (amb.afterMin && now - lastTouch > amb.afterMin * 60000 && !ringing.length && !recipe && $('hub-main').classList.contains('on')) enterAmbient();
    if ($('hub-ambient').classList.contains('on') && new Date().getSeconds() === 0) ambMinute();
  }

  /* ---------- MOLDURA (tela de espera) ---------- */
  var ambI = 0, ambT = null, ambSince = 0;
  /* proteção da tela: a moldura se move um pouco a cada minuto e, depois de um tempo (ou à noite), vira um relógio pequeno que passeia na tela preta */
  function rnd(n) { return Math.round((Math.random() * 2 - 1) * n); }
  function nightNow() { var n = (PK.config.night || { from: 22, to: 6 }), h = new Date().getHours(); return n.from > n.to ? (h >= n.from || h < n.to) : (h >= n.from && h < n.to); }
  function shouldDark() { var m = amb.darkAfterMin == null ? 45 : amb.darkAfterMin; return (amb.nightDark !== false && nightNow()) || (m > 0 && Date.now() - ambSince > m * 60000); }
  function ambMinute() {
    var el = $('hub-ambient');
    if (!el.classList.contains('dark') && shouldDark()) { el.classList.add('dark'); clearInterval(ambT); el.innerHTML = '<div id="am-sv"></div><div class="am-dark" id="am-dark"><b id="amd-t"></b><span id="amd-d"></span></div>';
      if (PK.saver) PK.saver.mount($('am-sv'), amb.saver || 'auto', { night: nightNow(), isNight: nightNow }); }
    if (el.classList.contains('dark')) {
      var d = $('am-dark'), now = new Date(); if (!d) return;
      $('amd-t').textContent = U.hm(now); $('amd-d').textContent = U.longDate(now);
      d.style.left = (18 + Math.random() * 64) + '%'; d.style.top = (22 + Math.random() * 56) + '%';
      return;
    }
    ambientUI();
    var ui = $('am-ui'); if (ui) ui.style.transform = 'translate(' + rnd(14) + 'px,' + rnd(10) + 'px)';
  }
  function enterAmbient() {
    var el = $('hub-ambient'); if (el.classList.contains('on')) return;
    ambSince = Date.now(); el.classList.remove('dark');
    el.innerHTML = '<div class="am-ph" id="am-p0"></div><div class="am-ph" id="am-p1"></div><div class="am-sh"></div><div id="am-ui"></div>';
    el.classList.add('on'); ambI = 0; photo(); ambientUI();
    clearInterval(ambT); ambT = setInterval(function () { ambI++; photo(); ambientUI(); }, 20000);
  }
  function photo() {
    var ps = state.photos || [], a = $('am-p0'), b = $('am-p1'); if (!a) return;
    if (!ps.length) { var sc = PK.scenes.get(PK.scenes.auto(state.weather)); a.style.backgroundImage = "url('" + (sc.kind === 'photo' ? sc.src : PK.scenes.get('living-cozy').src) + "')"; a.classList.add('on'); return; }
    var p = ps[ambI % ps.length], next = ambI % 2 ? b : a, prev = ambI % 2 ? a : b, img = new Image();
    img.onload = function () { next.style.backgroundImage = "url('" + p.url + "')"; next.classList.add('on'); prev.classList.remove('on'); };
    img.src = p.url;
  }
  function line(e, now) {
    var past = !e.allDay && e.end <= now, live = !e.allDay && e.start <= now && e.end > now;
    return '<div class="am-e' + (past ? ' past' : '') + (live ? ' live' : '') + '"><b>' + (e.allDay ? 'dia' : U.hm(e.start)) + '</b><span>' + esc(e.private ? 'Ocupado' : e.title) + '</span></div>';
  }
  function ambientUI() {
    var ui = $('am-ui'); if (!ui) return;
    var now = new Date(), w = state.weather, ps = state.photos || [], p = ps[ambI % Math.max(1, ps.length)];
    var wx = '';
    if (amb.weather && w) {
      var d = w.days[0], hrs = (w.hours || []).filter(function (h, i) { return i > 0 && i % 3 === 0; }).slice(0, 4);
      wx = '<div class="am-wx"><div class="aw-now">' + I.get(I.weather(w.code, w.isDay), 52, ' stroke-width="1.4"') + '<b>' + w.temp + '°</b><div><span>' + I.weatherText(w.code) + '</span><small>↑ ' + d.max + '°  ↓ ' + d.min + '° · ' + (d.rain || 0) + '% chuva</small></div></div>' +
        (hrs.length ? '<div class="aw-hrs">' + hrs.map(function (h) { return '<div><small>' + U.pad(h.time.getHours()) + 'h</small>' + I.get(I.weather(h.code, h.isDay), 24) + '<b>' + h.temp + '°</b></div>'; }).join('') + '</div>' : '') + '</div>';
    }
    var ag = '';
    if (amb.agenda) {
      var evs = state.events.filter(function (e) { return U.sameDay(e.start, now); }).sort(function (x, y) { return x.allDay === y.allDay ? x.start - y.start : (x.allDay ? -1 : 1); });
      var all = state.members.map(function (m) { return m.id; });
      var shared = evs.filter(function (e) { return !e.members || !e.members.length || (e.members.length >= all.length && all.length > 1); });
      ag = '<div class="am-ag"><div class="am-sec">HOJE</div>' +
        (shared.length ? '<div class="am-row fam"><div class="am-who"><span class="av all">' + I.get('users', 18) + '</span><b>Família</b></div>' + shared.slice(0, 2).map(function (e) { return line(e, now); }).join('') + '</div>' : '') +
        state.members.map(function (m) {
          var mine = evs.filter(function (e) { return shared.indexOf(e) < 0 && e.members && e.members.indexOf(m.id) >= 0; });
          return '<div class="am-row"><div class="am-who">' + av(m, 26) + '<b>' + esc(first(m)) + '</b></div>' + (mine.length ? mine.slice(0, 2).map(function (e) { return line(e, now); }).join('') + (mine.length > 2 ? '<div class="am-more">+' + (mine.length - 2) + '</div>' : '') : '<div class="am-free">livre</div>') + '</div>';
        }).join('') + '</div>';
    }
    var cap = '';
    if (p && p.takenAt) { var y = now.getFullYear() - p.takenAt.getFullYear(); cap = (y > 0 && p.takenAt.getMonth() === now.getMonth() && p.takenAt.getDate() === now.getDate() ? 'Há ' + y + ' ano' + (y > 1 ? 's' : '') + ', hoje' : U.MONTHS[p.takenAt.getMonth()] + ' de ' + p.takenAt.getFullYear()) + (p.caption ? ' · ' + esc(p.caption) : ''); }
    ui.innerHTML = '<div class="am-tools"><button data-amb="weather" class="' + (amb.weather ? 'on' : '') + '">' + I.get('sun', 20) + ' Clima</button><button data-amb="agenda" class="' + (amb.agenda ? 'on' : '') + '">' + I.get('calendar', 20) + ' Agenda</button><button data-act="frame-exit">' + I.get('x', 20) + '</button></div>' +
      '<div class="am-left"><div class="am-t">' + U.hm(now) + '</div><div class="am-d">' + U.longDate(now) + '</div>' + wx + '</div>' + ag +
      (cap ? '<div class="am-cap">' + I.get('sparkle', 16) + ' ' + cap + '</div>' : (!ps.length ? '<div class="am-cap">Conecte o Google Photos no PlanKnect para ver as fotos da família aqui</div>' : ''));
  }
  function exitAmbient() { var el = $('hub-ambient'); if (!el.classList.contains('on')) return; el.classList.remove('on', 'dark'); clearInterval(ambT); lastTouch = Date.now(); load(); }

  /* ---------- folhas (sheets) ---------- */
  if (PK.music) PK.music.openHandler = function () { sheet('<div class="qa-h">' + I.get('music', 28) + ' Música<button data-act="sheet-close">' + I.get('x', 26) + '</button></div><div id="mu-host"></div>'); PK.music.mount($('mu-host'), true); };
  function sheet(html) { closeSheet(); var d = document.createElement('div'); d.className = 'qa'; d.id = 'sheet'; d.innerHTML = '<div class="qa-box">' + html + '</div>'; $('hub').appendChild(d); }
  function closeSheet() { var d = $('sheet'); if (d) d.parentNode.removeChild(d); }
  function whoSheet(title, act, arg) {
    sheet('<div class="qa-h">' + esc(title) + '<button data-act="sheet-close">' + I.get('x', 26) + '</button></div><div class="who">' + state.members.map(function (m) {
      return '<button data-' + act + '="' + esc(arg) + '" data-m="' + m.id + '">' + av(m, 64) + '<span>' + esc(first(m)) + '</span></button>';
    }).join('') + '</div>');
  }
  function missionSheet() {
    var kids = state.members.filter(function (m) { return m.kid; });
    if (!nm.kid && kids[0]) nm.kid = kids[0].id;
    var opt = function (k, v, lbl) { return '<button class="' + (nm[k] === v ? 'on' : '') + '" data-nm="' + k + ':' + v + '">' + lbl + '</button>'; };
    sheet('<div class="qa-h">Nova missão<button data-act="sheet-close">' + I.get('x', 26) + '</button></div>' +
      '<div class="nm-kids">' + kids.map(function (k) { return '<button class="' + (nm.kid === k.id ? 'on' : '') + '" data-nm="kid:' + k.id + '" style="--k:' + k.color + '">' + av(k, 40) + '<span>' + esc(first(k)) + '</span></button>'; }).join('') + '</div>' +
      '<div class="nm-opts"><div class="seg">' + opt('repeat', 'daily', 'Todo dia') + opt('repeat', 'weekdays', 'Dias de semana') + opt('repeat', 'once', 'Só hoje') + '</div>' +
      '<div class="seg">' + opt('points', null, 'Estrelas padrão') + opt('points', 2, '2★') + opt('points', 5, '5★') + opt('points', 10, '10★') + '</div></div>' +
      '<div class="qa-grid nm-grid">' + MISSIONS.map(function (m, i) { return '<button data-mission="' + i + '">' + I.get(m[1], 22) + ' <span>' + esc(m[0]) + '</span><small>' + m[2] + ' · ' + m[3] + '★</small></button>'; }).join('') + '</div>' +
      '<div class="qa-foot"><div id="qa-qr"></div><span>Outra missão? Aponte o celular e escreva ou fale.</span></div>');
    qr('qa-qr', C.baseUrl + '/add?type=chore&from=nest-hub', 90);
  }
  function micSheet() {
    sheet('<div class="qa-h">Falar com o PlanKnect<button data-act="sheet-close">' + I.get('x', 26) + '</button></div>' +
      '<div class="pa"><div id="pa-qr"></div><div><b>Fale pelo celular</b><span>Aponte a câmera, segure o botão e fale: “nova tarefa ligar para o Paulo amanhã”, “adiciona leite na lista”, “nova missão para o Wesley: arrumar o quarto”. A resposta aparece aqui.</span>' +
      '<small class="pa-note">O microfone do Nest Hub é reservado ao Google Assistente: testamos e o aparelho nega o acesso a páginas abertas por Cast.</small></div></div>');
    qr('pa-qr', C.remoteUrl + '?device=nest-hub', 180);
  }
  function settingsSheet() {
    var opt = function (k, v, lbl) { return '<button class="' + (amb[k] === v ? 'on' : '') + '" data-set="' + k + ':' + v + '">' + lbl + '</button>'; };
    sheet('<div class="qa-h">Ajustes do display<button data-act="sheet-close">' + I.get('x', 26) + '</button></div>' +
      '<div class="st-r"><span>Moldura abre depois de</span><div class="seg">' + opt('afterMin', 2, '2 min') + opt('afterMin', 5, '5 min') + opt('afterMin', 10, '10 min') + opt('afterMin', 0, 'Nunca') + '</div></div>' +
      '<div class="st-r"><span>Proteção de tela (relógio no escuro) depois de</span><div class="seg">' + opt('darkAfterMin', 15, '15 min') + opt('darkAfterMin', 30, '30 min') + opt('darkAfterMin', 45, '45 min') + opt('darkAfterMin', 0, 'Nunca') + '</div></div>' +
      '<div class="st-r"><span>Protetor de tela</span><div class="seg wrap">' + PK.saver.OPTS.map(function (o) { return opt('saver', o[0], o[1]); }).join('') + '</div></div>' +
      '<div class="st-r"><span>À noite (22h–6h), escurecer direto</span><div class="seg">' + opt('nightDark', true, 'Sim') + opt('nightDark', false, 'Não') + '</div></div>' +
      '<div class="st-r"><span>Na moldura, mostrar clima</span><div class="seg">' + opt('weather', true, 'Sim') + opt('weather', false, 'Não') + '</div></div>' +
      '<div class="st-r"><span>Na moldura, mostrar agenda</span><div class="seg">' + opt('agenda', true, 'Sim') + opt('agenda', false, 'Não') + '</div></div>' +
      '<div class="st-acts"><button data-act="saver-test">' + I.get('sparkle', 20) + ' Ver protetor</button><button data-act="sync">' + I.get('refresh', 20) + ' Atualizar agora</button><button data-act="sim-door">' + I.get('home', 20) + ' Testar campainha</button><button data-act="unlink">Desconectar</button></div>' +
      '<div class="st-foot">' + (PK.data.mode() === 'live' ? 'Conectado ao PlanKnect' : 'Modo demonstração') + ' · versão ' + esc(window.PK_VERSION || '') + (PK.tzInfo ? ' · Fuso: ' + PK.tzInfo.household + (PK.tzInfo.shiftMin ? ' (aparelho em ' + PK.tzInfo.device + ', ajustado)' : '') : '') + '</div>');
  }

  /* ---------- toque ---------- */
  document.addEventListener('click', function (e) {
    lastTouch = Date.now();
    var t = e.target.closest && e.target.closest('button');
    if ($('hub-ambient').classList.contains('on')) {
      if (t && t.getAttribute('data-amb')) { var k = t.getAttribute('data-amb'); amb[k] = !amb[k]; U.store.set('hubAmb', amb); ambientUI(); return; }
      exitAmbient(); return;
    }
    if (e.target.id === 'sheet' || (e.target.classList && e.target.classList.contains('qa') && adding)) { adding = false; closeSheet(); render(); return; }
    if (!t) return;
    var a = function (k) { return t.getAttribute(k); }, act = a('data-act');
    if (a('data-tab')) { tab = a('data-tab'); adding = false; render(); }
    if (a('data-go')) { tab = a('data-go'); render(); }
    if (a('data-golist')) { tab = 'list'; listSel = a('data-golist'); render(); }
    if (a('data-list')) { listSel = a('data-list'); render(); }
    if (a('data-item')) {
      var l = state.lists.filter(function (x) { return x.id === a('data-l'); })[0], it = l && l.items.filter(function (x) { return x.id === a('data-item'); })[0];
      if (it) {
        it.done = !it.done;
        if (it.done) { recentDone[it.id] = Date.now(); var uid = it.id + '|' + l.id; undoId = uid; setTimeout(render, 2600); setTimeout(function () { if (undoId === uid) { undoId = null; render(); } }, 8000); }
        else delete recentDone[it.id];
        render(); write(PK.data.setListItem(l.id, it.id, it.done));
      }
    }
    if (a('data-chore')) {
      var c = state.chores.filter(function (x) { return x.id === a('data-chore'); })[0];
      if (c && PK.data.mode() === 'live') {
        if (c.done) PK.toast('Missão de hoje já feita ⭐');
        else {
          c.done = true; var k = member(c.member); if (k) k.weekLocal = (k.weekLocal || 0) + (+c.points || 0); render();
          PK.data.setChore(c.id, true).then(function () { PK.toast('Muito bem! Missão feita ⭐' + (c.points ? ' +' + c.points : '')); setTimeout(load, 700); })
            .catch(function (e) { c.done = false; if (k) k.weekLocal -= (+c.points || 0); render(); PK.toast(PK.writeErr(e)); });
        }
      } else if (c) { c.done = !c.done; render(); write(PK.data.setChore(c.id, c.done), c.done ? 'Boa! Missão feita' : null); }
    }
    if (a('data-add')) write(PK.data.addListItems(state.lists[0].id, a('data-add').split('|')), 'Ingredientes na lista');
    if (a('data-qadd')) { t.disabled = true; t.classList.add('added'); write(PK.data.addListItems(a('data-l'), [a('data-qadd')]), a('data-qadd') + ' na lista'); }
    if (a('data-timer')) { addTimer(+a('data-timer'), a('data-label') ? a('data-label') + ' · ' + a('data-timer') + ' min' : null); if (tab !== 'timers') tab = 'timers'; render(); }
    if (a('data-stop')) { timers = timers.filter(function (x) { return x.id !== a('data-stop'); }); saveTimers(); $('hub-alarm').classList.remove('on'); render(); if (recipe) drawRecipe(); }
    if (a('data-plus')) { timers.forEach(function (x) { if (x.id === a('data-plus')) { if (x.paused) x.remain += 60000; else { x.end = Math.max(x.end, Date.now()) + 60000; } x.total += 60000; } }); saveTimers(); $('hub-alarm').classList.remove('on'); render(); }
    if (a('data-pause')) { timers.forEach(function (x) { if (x.id === a('data-pause')) { if (x.paused) { x.end = Date.now() + x.remain; x.paused = false; } else { x.remain = x.end - Date.now(); x.paused = true; } } }); saveTimers(); render(); }
    if (a('data-seen')) whoSheet('Quem está vendo este recado?', 'seenby', a('data-seen'));
    if (a('data-seenby')) { closeSheet(); write(PK.data.setNoteSeen(a('data-seenby'), a('data-m')), 'Marcado como visto'); }
    if (a('data-notetext')) whoSheet('Quem está escrevendo?', 'noteby', a('data-notetext'));
    if (a('data-noteby')) { closeSheet(); var txt = a('data-noteby'); write(PK.data.addNote(txt, a('data-m')).then(function () { return PK.data.broadcast({ kind: 'family', icon: 'note', title: txt, ttl: 10 }).catch(function () {}); }), 'Recado enviado'); }
    if (a('data-note')) { closeSheet(); write(PK.data.broadcast({ kind: 'family', icon: 'note', title: a('data-note'), ttl: 10 }), 'Aviso enviado: ' + a('data-note')); }
    if (a('data-set')) { var sp = a('data-set').split(':'), val = sp[1] === 'true' ? true : sp[1] === 'false' ? false : isNaN(+sp[1]) ? sp[1] : +sp[1]; amb[sp[0]] = val; U.store.set('hubAmb', amb); settingsSheet(); }
    if (act === 'frame') enterAmbient();
    if (act === 'mission-new') { nm.points = null; missionSheet(); }
    if (a('data-tf')) { var fp = a('data-tf').split(':'); tf[fp[0]] = fp[1]; if (fp[0] === 'when') tf.userWhen = true; render(); }
    if (a('data-task')) taskSheet(a('data-task'));
    if (a('data-tdo')) {
      var tp = a('data-tdo').split(':'), tt = state.tasks.filter(function (x) { return x.id === tp[0]; })[0], patch;
      if (tp[1] === 'done') patch = { status: 'done' };
      else { var nd = U.addDays(U.startOfDay(new Date()), tp[1] === 'week' ? 7 : 1); patch = { due: nd.toISOString().slice(0, 10) }; }
      closeSheet();
      if (tt) { if (patch.status) tt.status = 'done'; else tt.due = new Date(patch.due + 'T00:00:00'); render(); }
      write(PK.data.updateTask(tp[0], patch), patch.status ? 'Tarefa concluída' : 'Adiada');
    }
    if (act === 'saver-test') { closeSheet(); enterAmbient(); ambSince = 0; ambMinute(); return; }
    if (act === 'task-new') { sheet('<div class="qa-h">Nova tarefa<button data-act="sheet-close">' + I.get('x', 26) + '</button></div><div class="pa"><div id="pa-qr"></div><div><b>Fale ou escreva no celular</b><span>Aponte a câmera: abre o PlanKnect já em “nova tarefa”. Você também pode falar: “nova tarefa revisar contrato sexta, prioridade alta”.</span></div></div>'); qr('pa-qr', C.remoteUrl + '?device=nest-hub&intent=task', 180); }
    if (act === 'mic') micSheet();
    if (act === 'knect') PK.jarvis.open();
    if (a('data-nm')) { var np = a('data-nm').split(':'); nm[np[0]] = np[1] === 'null' ? null : (np[0] === 'points' ? +np[1] : np[1]); missionSheet(); }
    if (a('data-mission')) {
      var mt = MISSIONS[+a('data-mission')], kid = member(nm.kid);
      closeSheet(); tab = 'chores';
      write(PK.data.addChore({ member: nm.kid, title: mt[0], icon: mt[1], period: mt[2], points: nm.points || mt[3], repeat: nm.repeat }), 'Missão “' + mt[0] + '” para ' + first(kid));
    }
    if (act === 'settings') settingsSheet();
    if (act === 'sync') { closeSheet(); PK.toast('Atualizando…'); load().then(function () { PK.toast('Atualizado'); }); }
    if (act === 'sim-door') { closeSheet(); door({ title: 'Tem alguém na porta', body: 'Câmera da entrada (teste)' }); }
    if (act === 'door-close') closeDoor();
    if (act === 'unlink') { closeSheet(); U.store.del('tokens'); PK.data.setMode('unlinked'); pair(); }
    if (act === 'toggle-done') { showDone = !showDone; render(); }
    if (act === 'undo' && undoId) {
      var up = undoId.split('|'), ul = state.lists.filter(function (x) { return x.id === up[1]; })[0], ui2 = ul && ul.items.filter(function (x) { return x.id === up[0]; })[0];
      undoId = null; if (ui2) { ui2.done = false; delete recentDone[ui2.id]; render(); write(PK.data.setListItem(ul.id, ui2.id, false)); }
    }
    if (act === 'quick-add') { adding = true; render(); }
    if (act === 'quick-close') { adding = false; render(); }
    if (act === 'notes-sheet') sheet('<div class="qa-h">Avisar a família agora<button data-act="sheet-close">' + I.get('x', 26) + '</button></div><div class="qa-grid">' +
      NOTES.map(function (n) { return '<button data-note="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div><div class="qa-foot"><span>Aparece nas TVs e neste display por alguns minutos.</span></div>');
    if (act === 'note-new') { sheet('<div class="qa-h">Novo recado<button data-act="sheet-close">' + I.get('x', 26) + '</button></div><div class="qa-grid">' +
      NOTES.concat(['Acabou o leite!', 'Reunião até as 18h']).map(function (n) { return '<button data-notetext="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div><div class="qa-foot"><div id="qa-qr"></div><span>Escrever outro? Aponte o celular.</span></div>'); qr('qa-qr', C.baseUrl + '/add?type=note&from=nest-hub', 96); }
    if (act === 'phone-add') { sheet('<div class="qa-h">Adicionar pelo celular<button data-act="sheet-close">' + I.get('x', 26) + '</button></div><div class="pa"><div id="pa-qr"></div><div><b>Aponte a câmera</b><span>Abre o PlanKnect para adicionar evento, tarefa, item da lista ou recado. Aparece aqui em segundos.</span></div></div>'); qr('pa-qr', C.baseUrl + '/add?from=nest-hub', 180); }
    if (act === 'sheet-close') closeSheet();
    if (act === 'recipe') openRecipe();
    if (act === 'recipe-close') { recipe = null; drawRecipe(); }
    if (act === 'recipe-prev' && recipe && recipe.i) { recipe.i--; drawRecipe(); }
    if (act === 'recipe-next' && recipe) { if (recipe.i < recipe.steps.length - 1) { recipe.i++; drawRecipe(); } else { recipe = null; drawRecipe(); PK.toast('Bom apetite!'); } }
    if (act === 'recipe-timer' && recipe) { var st = recipe.steps[recipe.i]; addTimer(st.minutes, 'Passo ' + (recipe.i + 1) + ' · ' + st.text.slice(0, 28), { recipe: recipe.title + '#' + recipe.i }); drawRecipe(); }
    if (act === 'demo') { PK.data.setMode('demo'); start(); }
    if (act === 'retry') pair();
  });
  document.addEventListener('touchstart', function () { lastTouch = Date.now(); }, { passive: true });

  /* ---------- Alfred (Jarvis) ---------- */
  PK.jarvis.init({
    host: $('hub'), compact: true, getState: function () { return state; },
    navigate: function (a) {
      var k = a.open && a.open.kind;
      tab = k === 'meal' ? 'dinner' : k === 'event' ? 'today' : a.view === 'lists' ? 'list' : a.view === 'work' ? 'tasks' : a.view === 'chores' ? 'chores' : tab;
      if (a.list) listSel = a.list; render();
    },
    canInterrupt: function () { if (!$('hub-main').classList.contains('on') || recipe || $('hub-door').classList.contains('on')) return false; exitAmbient(); return true; },
    command: function (text, o) { var mi = PK.music && PK.music.intent(text); if (mi) return mi; return PK.data.assistant(text, { state: state, view: tab, lang: o && o.lang }).then(function (r) { (r.actions || []).forEach(function (x) { if (x.type === 'music' && PK.music) PK.music.act(x); }); load(); return r; }); },
    speak: function () { micSheet(); }, refresh: function () { load(); }
  });

  /* ---------- boot ---------- */
  fit(); icons();
  setTimeout(function () { document.body.classList.add('pk-ready'); var sp = document.getElementById('pk-splash'); if (sp) setTimeout(function () { sp.parentNode && sp.parentNode.removeChild(sp); }, 700); }, 350);
  // timers antigos sem "total" (versão anterior)
  timers.forEach(function (t) { if (!t.total) t.total = Math.max(60000, t.end - Date.now()); });
  setInterval(tick, 1000);
  if (/[?&]demo=1/.test(location.search)) PK.data.setMode('demo');
  var qt = location.search.match(/[?&]tab=([a-z]+)/); if (qt) tab = qt[1];
  if (/[?&]alfred=1/.test(location.search)) setTimeout(function () { PK.jarvis.open('silent'); }, 1800);
  var mode = PK.data.mode();
  if ((mode === 'live' && PK.api.isLinked()) || mode === 'demo') start(); else pair();
})();
