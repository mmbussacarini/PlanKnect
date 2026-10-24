/* Renderização das telas do Family Hub. Funções puras: estado -> HTML. */
var PK = window.PK || {};
window.PK = PK;

PK.views = (function () {
  var U = PK.util, I = PK.icons, esc = U.esc;
  var TYPE = {
    meeting: { color: '#a78bfa', icon: 'video', label: 'Reunião', work: true },
    task: { color: '#60a5fa', icon: 'task', label: 'Trabalho', work: true },
    milestone: { color: '#fb923c', icon: 'flag', label: 'Milestone', work: true },
    event: { color: '#34d399', icon: 'pin', label: 'Compromisso' },
    family: { color: '#ff7a9a', icon: 'heart', label: 'Família' },
    church: { color: '#fbbf24', icon: 'church', label: 'Igreja' },
    birthday: { color: '#e879f9', icon: 'cake', label: 'Aniversário' }
  };
  var PRIO = { urgent: { label: 'Urgente', cls: 'urgent', w: -1 }, high: { label: 'Alta', cls: 'high', w: 0 }, medium: { label: 'Média', cls: 'med', w: 1 }, low: { label: 'Baixa', cls: 'low', w: 2 } };

  function T(e) { return TYPE[e.type] || TYPE.event; }
  function color(e) { return e.color || T(e).color; }
  function title(e) { return e.private ? 'Ocupado' : e.title; }
  function member(state, id) { return state.members.filter(function (m) { return m.id === id; })[0]; }
  function av(m, size) {
    if (!m) return '';
    if (m.photo) return '<span class="av photo" style="background:' + m.color + ' url(\'' + esc(m.photo) + '\') center/cover;width:' + size + 'px;height:' + size + 'px"></span>';
    return '<span class="av" style="background:' + m.color + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.46) + 'px">' + esc(m.initial) + '</span>';
  }
  function avatars(state, ids, size) { return (ids || []).slice(0, 5).map(function (id) { return av(member(state, id), size); }).join(''); }
  function chevron() { return '<span class="chev">›</span>'; }
  function isWork(e) { return !!T(e).work; }
  function sortTasks(list, now) {
    return list.slice().sort(function (a, b) {
      var ao = a.due && a.due < U.startOfDay(now) ? 0 : 1, bo = b.due && b.due < U.startOfDay(now) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      var pa = (PRIO[a.priority] || PRIO.medium).w, pb = (PRIO[b.priority] || PRIO.medium).w;
      if (pa !== pb) return pa - pb;
      return (a.due || Infinity) - (b.due || Infinity);
    });
  }
  var STATUS = { in_progress: ['Em andamento', 'prog'], review: ['Em revisão', 'rev'], todo: null, open: null };
  // chip do projeto: cor + nome + organização — usado em todas as listas de tarefas
  function projChip(t, short) {
    if (!t.project) return '';
    return '<span class="pchip" style="--c:' + (t.projectColor || '#94a3b8') + '"><i></i>' + esc(t.project) + (t.org && !short && t.org !== t.project ? '<em>' + esc(t.org) + '</em>' : '') + '</span>';
  }
  function taskRow(t, now, cls) {
    var overdue = t.due && t.due < U.startOfDay(now);
    var p = PRIO[t.priority] || PRIO.medium, s = STATUS[t.status], who = t.assignee && (PK.app.state().members || []).filter(function (m) { return m.id === t.assignee; })[0];
    return '<div class="task-row focusable ' + (cls || '') + (overdue ? ' overdue' : '') + '" data-open="task:' + esc(t.id) + '" style="--c:' + (t.projectColor || '#94a3b8') + '">' +
      '<span class="prio ' + p.cls + '">' + p.label + '</span>' +
      '<div class="task-main"><div class="task-title">' + esc(t.title) + (s ? '<span class="tstat ' + s[1] + '">' + s[0] + '</span>' : '') + '</div>' +
      '<div class="task-sub">' + projChip(t) + (t.due ? '<b class="tdue' + (overdue ? ' red' : '') + '">' + I.get('calendar', 16) + U.dueLabel(t.due, now) + (t.due.getHours && (t.due.getHours() || t.due.getMinutes()) ? ' · ' + U.hm(t.due) : '') + '</b>' : '<span class="tdue muted">sem prazo</span>') + '</div></div>' +
      (who ? av(who, 36) : '') + '<span class="dt-go">›</span></div>';
  }

  /* ================= INÍCIO (cinematográfico) ================= */
  function greet(now) { var h = now.getHours(); return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite'); }
  function stack(state, ids, size, max) {
    ids = ids || []; max = max || 4;
    return '<span class="stack">' + ids.slice(0, max).map(function (id) { return av(member(state, id), size); }).join('') +
      (ids.length > max ? '<span class="av more" style="width:' + size + 'px;height:' + size + 'px">+' + (ids.length - max) + '</span>' : '') + '</span>';
  }
  function home(state) {
    var now = new Date(), w = state.weather;
    var today = state.events.filter(function (e) { return U.sameDay(e.start, now); });
    var timed = today.filter(function (e) { return !e.allDay; });
    var allDay = today.filter(function (e) { return e.allDay; });
    var current = timed.filter(function (e) { return e.start <= now && e.end > now; })[0];
    var next = state.events.filter(function (e) { return !e.allDay && e.start > now; })[0];
    var hero = current || next;
    var hh = state.household && state.household.name ? state.household.name.replace(/\s*(family|família)(\s+calendar)?$/i, '').replace(/^(family|família)\s+/i, '') : '';

    var left = '<div class="h-left">' +
      '<div class="h-greet">' + greet(now) + (hh ? ', família <b>' + esc(hh) + '</b>' : '') + '</div>' +
      '<div class="h-time" id="big-time">' + U.hm(now) + '</div>' +
      '<div class="h-date">' + U.longDate(now) + (w ? '<span class="h-wx">' + I.get(I.weather(w.code, w.isDay), 34) + ' ' + w.temp + '° · ' + I.weatherText(w.code) + '</span>' : '') + '</div>' +
      (hero ? '<div class="h-hero focusable" data-open="event:' + esc(hero.id) + '" data-autofocus style="--c:' + color(hero) + '">' +
        '<div class="hh-label"><i class="dot"></i>' + (current ? 'AGORA · termina ' + U.relMinutes((hero.end - now) / 60000) : 'A SEGUIR · ' + U.relMinutes((hero.start - now) / 60000)) + '</div>' +
        '<div class="hh-title">' + esc(title(hero)) + '</div>' +
        '<div class="hh-meta"><span>' + I.get('calendar', 26) + ' ' + (U.sameDay(hero.start, now) ? '' : U.DAYS[hero.start.getDay()] + ' · ') + U.hm(hero.start) + ' – ' + U.hm(hero.end) + '</span>' +
        (hero.video ? '<span>' + I.get('video', 26) + ' Google Meet</span>' : '') + (hero.location ? '<span>' + I.get('pin', 26) + ' ' + esc(hero.location) + '</span>' : '') +
        stack(state, hero.members, 40) + '</div>' +
        '<div class="hh-ok">OK para ver detalhes, participantes e pauta</div></div>'
      : '<div class="h-hero free"><div class="hh-label">PRÓXIMAS HORAS</div><div class="hh-title">Agenda livre</div><div class="hh-meta">Aproveitem o dia!</div></div>') +
      '</div>';

    // Linha do tempo de hoje
    var items = '', nowPlaced = false;
    timed.forEach(function (e) {
      if (!nowPlaced && e.start > now) { items += '<div class="tl-now"><span>' + U.hm(now) + '</span></div>'; nowPlaced = true; }
      var past = e.end <= now, live = e.start <= now && e.end > now;
      items += '<div class="tl-item focusable' + (past ? ' past' : '') + (live ? ' live' : '') + '" data-open="event:' + esc(e.id) + '" style="--c:' + color(e) + '">' +
        '<div class="tl-time">' + U.hm(e.start) + '<span>' + U.hm(e.end) + '</span></div><i class="tl-dot"></i>' +
        '<div class="tl-main"><div class="tl-title">' + esc(title(e)) + '</div><div class="tl-sub">' + I.get(T(e).icon, 20) + ' ' + T(e).label +
        (e.location ? ' · ' + esc(e.location) : '') + '</div></div>' + PK.who(state, e, 34, 3) + '</div>';
    });
    if (!nowPlaced && timed.length) items += '<div class="tl-now"><span>' + U.hm(now) + '</span></div>';
    var right = '<div class="h-right glass"><div class="h-sec">HOJE<span>' + timed.length + ' compromisso' + (timed.length === 1 ? '' : 's') + (allDay.length ? ' · ' + allDay.length + ' do dia' : '') + '</span></div>' +
      (allDay.length ? '<div class="tl-chips">' + allDay.map(function (e) {
        return '<span class="tl-chip focusable" data-open="event:' + esc(e.id) + '" style="--c:' + color(e) + '">' + I.get(T(e).icon, 18) + ' ' + esc(title(e)) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="tl">' + (items || '<div class="empty">Nada marcado hoje.</div>') + '</div></div>';

    // Prateleira
    var tiles = [];
    if (w) tiles.push('<div class="sh-tile focusable" data-goto="weather"><div class="sh-k">' + I.get('pin', 18) + ' ' + esc(w.name) + '</div><div class="sh-v">' +
      I.get(I.weather(w.code, w.isDay), 40) + '<b>' + w.temp + '°</b></div><div class="sh-s">↑' + w.days[0].max + '° ↓' + w.days[0].min + '° · ' + (w.days[0].rain || 0) + '% chuva</div></div>');
    var kids = state.members.filter(function (m) { return m.kid; });
    if (kids.length) tiles.push('<div class="sh-tile focusable" data-goto="chores"><div class="sh-k">' + I.get('star', 18) + ' Missões</div><div class="sh-rings">' + kids.map(function (k) {
      var ch = state.chores.filter(function (c) { return c.member === k.id; }), dn = ch.filter(function (c) { return c.done; }).length, r = 22, ci = 2 * Math.PI * r;
      return '<span class="sh-ring"><svg viewBox="0 0 54 54" width="54" height="54"><circle cx="27" cy="27" r="' + r + '" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="5"/><circle cx="27" cy="27" r="' + r + '" fill="none" stroke="' + k.color +
        '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (ch.length ? ci * dn / ch.length : 0) + ' ' + ci + '" transform="rotate(-90 27 27)"/></svg><i style="color:' + k.color + ';' + (k.photo ? PK.face(k) + 'border-radius:50%;' : '') + '">' + (k.photo ? '' : esc(k.initial)) + '</i></span>'; }).join('') +
      '</div><div class="sh-s">' + kids.map(function (k) { var ch = state.chores.filter(function (c) { return c.member === k.id; }); return ch.filter(function (c) { return c.done; }).length + '/' + ch.length; }).join(' · ') + '</div></div>');
    var l = state.lists[0];
    var bl = PK.plus.bills(state);
    if (l) { var open = l.items.filter(function (i) { return !i.done; }); tiles.push('<div class="sh-tile focusable" data-open="list:' + l.id + '"><div class="sh-k">' + I.get('cart', 18) + ' ' + esc(l.name) + '</div><div class="sh-v"><b>' + open.length + '</b><small>ite' + (open.length === 1 ? 'm' : 'ns') + '</small></div><div class="sh-s' + (bl && (bl.late.length || bl.soon.length) ? ' warn' : '') + '">' + (bl && (bl.late.length || bl.soon.length) ? I.get('card', 14) + ' ' + (bl.late.length ? bl.late.length + ' conta(s) atrasada(s)' : bl.soon.length + ' conta(s) esta semana') : esc(open.slice(0, 3).map(function (i) { return i.title; }).join(', '))) + '</div></div>'); }
    var meal = state.meals.filter(function (m) { return U.sameDay(m.date, now); })[0];
    if (meal) { var ck = member(state, meal.cook); tiles.push('<div class="sh-tile focusable" data-open="meal:' + esc(meal.title) + '"><div class="sh-k">' + I.get('chef', 18) + ' Jantar</div><div class="sh-t">' + esc(meal.title) + '</div><div class="sh-s">' + (ck ? esc(ck.name) + ' cozinha' : '') + '</div></div>'); }
    var note = state.notes[0], extra = PK.settings.get('home.extra') || 'note';
    if (extra !== 'note' && PK.world) { var xt = PK.world.homeTile(state, extra); if (xt) tiles.push(xt); }
    else if (note) { var nb = member(state, note.by); tiles.push('<div class="sh-tile note focusable" data-open="note:' + esc(note.id) + '"><div class="sh-k">' + I.get('note', 18) + ' Recado' + (nb ? ' de ' + esc(nb.name) : '') + '</div><div class="sh-n">' + esc(note.text) + '</div></div>'); }

    if (PK.music && PK.settings.get('home.music') !== false) tiles.push(PK.music.tile());
    var dock = '<div class="h-dock">' + PK.config.apps.map(function (a) {
      if (PK.tv.isTizen && a.samsungName) a = { id: a.samsung, samsung: a.samsung, name: a.samsungName, style: a.samsungStyle };
      return '<button class="dk focusable" data-app="' + esc(a.id) + '" data-name="' + esc(a.name) + '">' + appIcon(a) + '<span>' + esc(a.name) + '</span></button>';
    }).join('') + '</div>';

    return '<div class="home2">' + left + right + '<div class="h-shelf">' + tiles.join('') + '</div>' + dock + '</div>';
  }

  // Ícones dos apps: na TV usamos o ícone instalado (listApps); fora dela, versões em SVG
  function appIcon(a) {
    var native = PK.tv.icons && PK.tv.icons[a.id];
    if (native) return '<span class="dk-ic native"><img src="' + esc(native) + '" alt=""></span>';
    var svg = {
      netflix: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#000"/><path d="M33 18h12l22 64H55z" fill="#e50914"/><path d="M33 18h12v64H33zM55 18h12v64H55z" fill="#b20710"/><path d="M33 18h12l22 64H55z" fill="#e50914"/></svg>',
      youtube: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><rect x="20" y="29" width="60" height="42" rx="12" fill="#ff0033"/><path d="M44 39v22l18-11z" fill="#fff"/></svg>',
      disney: '<svg viewBox="0 0 100 100"><defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a1f5c"/><stop offset="1" stop-color="#0b7a8f"/></linearGradient></defs><rect width="100" height="100" fill="url(#dg)"/><path d="M18 52 Q50 14 86 46" fill="none" stroke="#fff" stroke-width="2" opacity=".85"/><text x="50" y="64" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="700" font-size="21" fill="#fff">Disney+</text></svg>',
      prime: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#00a8e1"/><text x="50" y="45" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="21" fill="#fff">prime</text><text x="50" y="66" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="19" fill="#fff">video</text><path d="M26 73 Q50 84 72 73" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M67 70l6 3-3 5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      spotify: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#121212"/><circle cx="50" cy="50" r="30" fill="#1ed760"/><path d="M34 42c11-3 23-2 33 4M36 51c9-2 18-1 26 3M38 59c7-1 14-1 20 2" stroke="#121212" stroke-width="4.5" fill="none" stroke-linecap="round"/></svg>',
      livetv: '<svg viewBox="0 0 100 100"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8102e"/><stop offset="1" stop-color="#6b0f2a"/></linearGradient></defs><rect width="100" height="100" fill="url(#lg)"/><rect x="24" y="32" width="52" height="36" rx="6" fill="none" stroke="#fff" stroke-width="4"/><path d="M40 22l10 10 10-10M40 76h20" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>'
    }[a.style] || '';
    return '<span class="dk-ic">' + svg + '</span>';
  }

  /* ================= CLIMA ================= */
  function weather(state) {
    var w = state.weather; if (!w) return '<div class="empty">Carregando clima…</div>';
    var now = new Date(), d0 = w.days[0];
    var hours = (w.hours || []).slice(0, 25);
    // gráfico 24h
    var W = 1100, H = 300, x0 = 40, x1 = W - 30, yT = 60, yB = 190;
    var tMin = Math.min.apply(null, hours.map(function (h) { return h.temp; })), tMax = Math.max.apply(null, hours.map(function (h) { return h.temp; }));
    if (tMax === tMin) tMax = tMin + 1;
    var X = function (i) { return x0 + (x1 - x0) * i / Math.max(1, hours.length - 1); };
    var Y = function (t) { return yB - (yB - yT) * (t - tMin) / (tMax - tMin); };
    var line = hours.map(function (h, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(h.temp).toFixed(1); }).join('');
    var area = line + 'L' + X(hours.length - 1) + ' ' + yB + 'L' + x0 + ' ' + yB + 'Z';
    var chart = '<svg class="wx-chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '"><defs><linearGradient id="wxa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity=".35"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#wxa)"/><path d="' + line + '" fill="none" stroke="#fbbf24" stroke-width="4" stroke-linejoin="round"/>' +
      hours.map(function (h, i) {
        var bh = 50 * (h.rain || 0) / 100, lbl = i % 3 === 0;
        return '<rect x="' + (X(i) - 9) + '" y="' + (H - 30 - bh) + '" width="18" height="' + bh + '" rx="4" fill="#60a5fa" opacity="' + (h.rain >= 50 ? .9 : .45) + '"/>' +
          (lbl ? '<circle cx="' + X(i) + '" cy="' + Y(h.temp) + '" r="6" fill="#fbbf24"/><text x="' + X(i) + '" y="' + (Y(h.temp) - 16) + '" text-anchor="middle" font-size="24" font-weight="700" fill="#fff">' + h.temp + '°</text>' +
            '<text x="' + X(i) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="20" fill="#9aa8d1">' + (i === 0 ? 'Agora' : U.pad(h.time.getHours()) + 'h') + '</text>' +
            (h.rain >= 30 ? '<text x="' + X(i) + '" y="' + (H - 36 - bh) + '" text-anchor="middle" font-size="17" fill="#93c5fd">' + h.rain + '%</text>' : '') : '');
      }).join('') + '</svg>';
    var gMin = Math.min.apply(null, w.days.map(function (d) { return d.min; })), gMax = Math.max.apply(null, w.days.map(function (d) { return d.max; }));
    var days = w.days.slice(0, 7).map(function (d, i) {
      var a = (d.min - gMin) / Math.max(1, gMax - gMin) * 100, b = (d.max - gMin) / Math.max(1, gMax - gMin) * 100;
      return '<div class="wx-day focusable"><b>' + (i === 0 ? 'Hoje' : U.DAYS[d.date.getDay()]) + '</b>' + I.get(I.weather(d.code, true), 34) +
        '<span class="wx-rain' + (d.rain >= 50 ? ' hi' : '') + '">' + I.get('rain', 20) + ' ' + (d.rain || 0) + '%</span><span class="wx-min">' + d.min + '°</span>' +
        '<span class="wx-range"><i style="left:' + a + '%;width:' + Math.max(4, b - a) + '%"></i></span><span class="wx-max">' + d.max + '°</span></div>';
    }).join('');
    // dicas ligadas à agenda
    var tips = state.events.filter(function (e) { return !e.allDay && e.start > now && e.start - now < 24 * 3600000 && !isWork(e) && !e.private; }).map(function (e) {
      var h = hours.filter(function (x) { return Math.abs(x.time - e.start) < 1800001; })[0];
      return h && h.rain >= 40 ? '<div class="wx-tip">' + I.get('rain', 26) + '<div><b>' + esc(title(e)) + ' · ' + U.hm(e.start) + '</b><span>' + h.rain + '% de chance de chuva, ' + h.temp + '°. Levem guarda-chuva.</span></div></div>' : '';
    }).filter(Boolean).slice(0, 3).join('');
    if (d0.uv >= 6) tips += '<div class="wx-tip uv">' + I.get('sun', 26) + '<div><b>UV ' + d0.uv + ' hoje</b><span>Protetor solar nas crianças antes de sair.</span></div></div>';
    var stat = function (ic, k, v) { return '<div class="wx-stat">' + I.get(ic, 26) + '<span>' + k + '</span><b>' + v + '</b></div>'; };
    return '<div class="wx">' +
      '<div class="wx-now glass"><div class="wx-city">' + I.get('pin', 28) + ' ' + esc(w.name) + (w.offline ? ' <small>(sem conexão)</small>' : '') + '</div>' +
      '<div class="wx-hero">' + I.get(I.weather(w.code, w.isDay), 150, ' stroke-width="1.2"') + '<div class="wx-temp">' + w.temp + '<sup>°</sup></div></div>' +
      '<div class="wx-desc">' + I.weatherText(w.code) + '</div><div class="wx-mm">↑ ' + d0.max + '°  ↓ ' + d0.min + '°</div>' +
      '<div class="wx-stats">' + stat('sun', 'Sensação', w.feels + '°') + stat('rain', 'Umidade', w.humidity + '%') + stat('fog', 'Vento', (w.wind || d0.wind) + ' km/h') + stat('sparkle', 'Índice UV', d0.uv) +
      stat('sun2', 'Nascer do sol', U.hm(d0.sunrise)) + stat('moon', 'Pôr do sol', U.hm(d0.sunset)) + '</div>' +
      (tips ? '<div class="h-sec small">PARA A AGENDA</div>' + tips : '') + '</div>' +
      '<div class="wx-right"><div class="glass wx-24"><div class="h-sec">PRÓXIMAS 24 HORAS<span>temperatura e chance de chuva</span></div>' + chart + '</div>' +
      '<div class="glass wx-7"><div class="h-sec">PRÓXIMOS 7 DIAS</div>' + days + '</div></div></div>';
  }

  /* ================= AGENDA DA FAMÍLIA ================= */
  // ui: { mode: 'week'|'people', member: 'all'|id, familyOnly: bool }
  function filterEvents(state, ui) {
    return state.events.filter(function (e) {
      if (ui.familyOnly && isWork(e)) return false;
      var sel = selected(ui);
      if (sel.length) {
        if (e.members.length) return e.members.some(function (id) { return sel.indexOf(id) >= 0; });
        // sem dono: só entra se for da família (não tarefa/marco de empresa)
        var fam = state.household && state.household.id;
        return !!fam && e.organizationId === fam && e.type !== 'task' && e.type !== 'milestone';
      }
      return true;
    });
  }
  // pessoas escolhidas na agenda (várias ao mesmo tempo); vazio = todos
  function selected(ui) { return ui.members && ui.members.length ? ui.members : (ui.member && ui.member !== 'all' ? [ui.member] : []); }
  function agenda(state, ui) {
    var chips = '<div class="ag-bar">' +
      '<div class="seg"><button class="seg-b focusable' + (ui.mode === 'people' ? ' on' : '') + '" data-ag="mode:people"' + (ui.mode === 'people' ? ' data-autofocus' : '') + '>' + I.get('users', 26) + ' Hoje por pessoa</button>' +
      '<button class="seg-b focusable' + (ui.mode === 'week' && !ui.week ? ' on' : '') + '" data-ag="week:0"' + (ui.mode === 'week' ? ' data-autofocus' : '') + '>' + I.get('calendar', 26) + ' Esta semana</button>' +
      '<button class="seg-b focusable' + (ui.mode === 'week' && ui.week ? ' on' : '') + '" data-ag="week:1">Próxima</button></div>' +
      '<div class="chips">' + (function () { var sel = selected(ui);
        return '<button class="chip focusable' + (!sel.length ? ' on' : '') + '" data-ag="member:all"><span class="av all">' + I.get('users', 22) + '</span>Todos</button>' +
          state.members.map(function (m) {
            return '<button class="chip focusable' + (sel.indexOf(m.id) >= 0 ? ' on' : '') + '" data-ag="member:' + m.id + '" style="--m:' + m.color + '">' + av(m, 40) + esc(String(m.name).split(' ')[0]) + (sel.indexOf(m.id) >= 0 ? '<i class="chk">' + I.get('check', 16, ' stroke-width="3"') + '</i>' : '') + '</button>';
          }).join(''); })() +
      '<button class="chip toggle focusable' + (ui.familyOnly ? ' on' : '') + '" data-ag="family"><span class="tg"><i></i></span>Só família</button></div></div>';
    return chips + (ui.mode === 'people' ? people(state, ui) : week(state, ui));
  }

  function week(state, ui) {
    var now = new Date(), ws = U.addDays(U.weekStart(now), 7 * (ui.week || 0)), evAll = filterEvents(state, ui), cols = [];
    var sel = selected(ui), kids = state.members.filter(function (m) { return m.kid && sel.indexOf(m.id) >= 0; }), kid = kids[0];
    for (var i = 0; i < 7; i++) {
      var day = U.addDays(ws, i), isToday = U.sameDay(day, now), past = day < U.startOfDay(now);
      var evs = evAll.filter(function (e) { return U.sameDay(e.start, day); });
      evs.sort(function (a, b) { return (a.allDay === b.allDay) ? a.start - b.start : (a.allDay ? -1 : 1); });
      var wd = state.weather && state.weather.days.filter(function (d) { return U.sameDay(d.date, day); })[0];
      var meal = state.meals.filter(function (m) { return U.sameDay(m.date, day); })[0];
      var MAX = 6;
      cols.push('<div class="wk-col focusable' + (isToday ? ' today' : '') + (past ? ' past' : '') + '" data-day="' + i + '">' +
        '<div class="wk-head"><div class="wk-dn">' + U.DAYS_S[day.getDay()] + '</div><div class="wk-num">' + day.getDate() + '</div>' +
        '<div class="wk-w">' + (wd ? I.get(I.weather(wd.code, true), 24) + ' ' + wd.max + '°' : '') + '</div></div>' +
        '<div class="wk-list">' + evs.slice(0, MAX).map(function (e) {
          return '<div class="wk-item' + (e.allDay ? ' allday' : '') + '" style="--c:' + color(e) + '">' +
            (e.allDay ? '<span class="wk-av">' + PK.who(state, e, 20, 3) + '</span>' : '<span class="wk-time">' + U.hm(e.start) + '<span class="wk-av">' + PK.who(state, e, 22, 3) + '</span></span>') + '<span class="wk-t">' + esc(title(e)) + '</span></div>';
        }).join('') + (evs.length > MAX ? '<div class="wk-more">+' + (evs.length - MAX) + ' mais</div>' : '') +
        (!evs.length ? '<div class="wk-free">Livre</div>' : '') + '</div>' +
        (meal ? '<div class="wk-meal">' + I.get('chef', 20) + ' ' + esc(meal.title) + '</div>' : '') + (function () {
          var mine = (state.choresAll || state.chores).filter(function (c) { return (kids.length ? kids.some(function (k) { return k.id === c.member; }) : !sel.length) && c.due && U.sameDay(U.toDate(String(c.due).slice(0, 10) + 'T12:00:00'), day); });
          if (!mine.length) return '';
          return '<div class="wk-ch">' + I.get('star', 18) + ' ' + mine.length + ' miss' + (mine.length > 1 ? 'ões' : 'ão') + (kid ? '<small>' + mine.slice(0, 3).map(function (c) { return esc(c.title); }).join(' · ') + (mine.length > 3 ? '…' : '') + '</small>' : '') + '</div>';
        })() + '</div>');
    }
    return '<div class="wk-grid">' + cols.join('') + '</div>';
  }

  function people(state, ui) {
    var now = new Date(), evs = filterEvents(state, { member: 'all', familyOnly: ui.familyOnly })
      .filter(function (e) { return U.sameDay(e.start, now); });
    var sel = selected(ui), who = sel.length ? state.members.filter(function (m) { return sel.indexOf(m.id) >= 0; }) : state.members;
    var cols = who.map(function (m) {
      var mine = evs.filter(function (e) { return e.members.indexOf(m.id) >= 0; });
      var allDay = mine.filter(function (e) { return e.allDay; }), timed = mine.filter(function (e) { return !e.allDay; });
      var nowShown = false, html = '';
      timed.forEach(function (e) {
        if (!nowShown && e.start > now) { html += nowLine(now); nowShown = true; }
        var live = e.start <= now && e.end > now;
        html += '<div class="pp-item focusable' + (e.end <= now ? ' past' : '') + (live ? ' live' : '') + '" data-open="event:' + esc(e.id) + '" style="--c:' + color(e) + '"><div class="pp-time">' + U.hm(e.start) + ' – ' + U.hm(e.end) +
          (live ? ' <span class="pill now">AGORA</span>' : '') + '</div><div class="pp-t">' + I.get(T(e).icon, 22) + ' ' + esc(title(e)) + '</div></div>';
      });
      if (!nowShown && timed.length) html += nowLine(now);
      var kidInfo = '';
      if (m.kid) {
        var ch = state.chores.filter(function (c) { return c.member === m.id; }), dn = ch.filter(function (c) { return c.done; }).length;
        kidInfo = '<div class="pp-kid">' + I.get('star', 20) + ' ' + dn + '/' + ch.length + ' missões</div>';
      }
      return '<div class="pp-col" style="--m:' + m.color + '"><div class="pp-head">' + av(m, 64) + '<div><div class="pp-name">' + esc(m.name) + '</div>' +
        '<div class="pp-sub">' + (timed.length ? timed.length + ' compromisso' + (timed.length > 1 ? 's' : '') : 'Dia livre') + '</div></div></div>' + kidInfo +
        allDay.map(function (e) { return '<div class="pp-all focusable" data-open="event:' + esc(e.id) + '" style="--c:' + color(e) + '">' + esc(title(e)) + '</div>'; }).join('') +
        '<div class="pp-list">' + (html || '<div class="wk-free">Livre</div>') + '</div></div>';
    });
    return '<div class="pp-grid" style="grid-template-columns:repeat(' + who.length + ',1fr)">' + cols.join('') + '</div>';
  }
  function nowLine(now) { return '<div class="pp-now"><span>' + U.hm(now) + '</span></div>'; }

  function dayDetail(state, dayIndex, ui) {
    var day = U.addDays(U.weekStart(new Date()), dayIndex);
    var evs = filterEvents(state, ui).filter(function (e) { return U.sameDay(e.start, day); });
    evs.sort(function (a, b) { return (a.allDay === b.allDay) ? a.start - b.start : (a.allDay ? -1 : 1); });
    var meal = state.meals.filter(function (m) { return U.sameDay(m.date, day); })[0];
    return {
      title: U.longDate(day),
      body: '<div class="dd-list">' + (evs.length ? evs.map(function (e, i) {
        return '<div class="dd-item focusable" data-open="event:' + esc(e.id) + '" style="--c:' + color(e) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' +
          '<div class="dd-time">' + (e.allDay ? 'Dia todo' : U.hm(e.start) + ' — ' + U.hm(e.end)) + '</div>' +
          '<div class="dd-title">' + I.get(T(e).icon, 28) + ' ' + esc(title(e)) + '</div>' +
          '<div class="dd-av">' + PK.who(state, e, 36, 4) + '</div></div>';
      }).join('') : '<div class="empty">Dia livre.</div>') + '</div>' +
        (meal ? '<div class="dd-meal">' + I.get('chef', 26) + ' Jantar: <b>' + esc(meal.title) + '</b></div>' : '')
    };
  }

  /* ================= MISSÕES (KIDS) ================= */
  var PERIOD_IC = { 'manhã': 'sun2', 'tarde': 'sun', 'noite': 'moon' };

  /* ---------- pontos da semana + pote de estrelas ----------
   * Fonte: PlanKnect (members[].weekStars / scores de GET /chores/scores) ou, enquanto não houver,
   * histórico guardado na TV: soma dos pontos das missões feitas em cada dia desta semana. */
  var scoresApi = null;
  function weekScores(state) {
    var hist = U.store.get('choreHist', {}), today = U.startOfDay(new Date()), key = today.toISOString().slice(0, 10), ws = U.weekStart(today), out = {};
    var day = hist[key] = hist[key] || {};
    (state.members || []).filter(function (m) { return m.kid; }).forEach(function (k) {
      day[k.id] = (state.chores || []).filter(function (c) { return c.member === k.id && c.done; }).reduce(function (a, c) { return a + (+c.points || 0); }, 0);
    });
    Object.keys(hist).forEach(function (d) { if (new Date(d + 'T00:00:00') < U.addDays(ws, -21)) delete hist[d]; });
    U.store.set('choreHist', hist);
    (state.members || []).filter(function (m) { return m.kid; }).forEach(function (k) {
      var api = scoresApi && scoresApi[k.id], local = 0, days = [];
      for (var i = 0; i < 7; i++) { var dk = U.addDays(ws, i).toISOString().slice(0, 10), v = (hist[dk] && hist[dk][k.id]) || 0; local += v; days.push(v); }
      var week = api ? api.points : (k.weekStars != null ? k.weekStars : (k.stars != null ? k.stars : local));
      out[k.id] = { monday: !!(api && api.days), week: week, days: api && api.days || days, goal: (api && api.goal) || (k.reward && k.reward.goal) || +PK.settings.get('chores.weeklyGoal') || 50, reward: (api && api.reward) || (k.reward && k.reward.title) || '' };
    });
    return out;
  }
  function loadScores(cb) {
    if (PK.data.mode() !== 'live' || !PK.api.choreScores) return;
    PK.api.choreScores().then(function (r) { scoresApi = {}; (r.members || r.scores || []).forEach(function (m) { scoresApi[m.member || m.id] = m; }); if (cb) cb(); }).catch(function () { scoresApi = null; });
  }
  function jar(k, sc, size) {
    var pct = Math.max(0, Math.min(1, sc.week / (sc.goal || 1))), H = 150, W = 120, top = 30, bot = 142, fillY = bot - (bot - top - 6) * pct;
    var n = Math.min(28, Math.round(pct * 28)), stars = '';
    for (var i = 0; i < n; i++) { // estrelas empilhadas de baixo para cima (posição fixa por índice)
      var row = Math.floor(i / 5), col = i % 5, x = 22 + col * 19 + (row % 2 ? 9 : 0), y = bot - 12 - row * 15;
      stars += '<path class="jar-st' + (i === n - 1 ? ' new' : '') + '" transform="translate(' + x + ' ' + y + ') rotate(' + ((i * 37) % 50 - 25) + ')" d="M0 -7l2 4.6 5 .5-3.8 3.4 1.1 5L0 8.8l-4.3 2.7 1.1-5L-7 5.1l5-.5z"/>';
    }
    var id = 'jc' + k.id.replace(/[^a-z0-9]/gi, '').slice(0, 10);
    return '<svg class="jar' + (pct >= 1 ? ' full' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + (size || W) + '" height="' + Math.round((size || W) * H / W) + '" style="--k:' + k.color + '">' +
      '<defs><clipPath id="' + id + '"><path d="M24 30h72v8c10 6 14 16 14 30v62c0 8-6 14-14 14H24c-8 0-14-6-14-14V68c0-14 4-24 14-30z"/></clipPath>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>' +
      '<g clip-path="url(#' + id + ')"><rect x="0" y="' + fillY + '" width="' + W + '" height="' + (H - fillY) + '" fill="url(#' + id + 'g)" opacity=".28"/>' + stars + '</g>' +
      '<path class="jar-glass" d="M24 30h72v8c10 6 14 16 14 30v62c0 8-6 14-14 14H24c-8 0-14-6-14-14V68c0-14 4-24 14-30z"/>' +
      '<rect class="jar-lid" x="20" y="16" width="80" height="16" rx="5"/><path class="jar-shine" d="M22 70c0-10 3-17 9-21"/></svg>';
  }
  function chores(state) {
    var SC = weekScores(state); if (!scoresApi && !chores.asked) { chores.asked = true; loadScores(function () { if (PK.app.refresh) PK.app.refresh(); }); }
    var kids = state.members.filter(function (m) { return m.kid; });
    var h = new Date().getHours(), period = h < 12 ? 'manhã' : (h < 18 ? 'tarde' : 'noite');
    var order = ['manhã', 'tarde', 'noite'];
    var hello = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
    return '<div class="kids">' +
      '<div class="kids-head"><div class="kids-title">' + I.get('rocket', 54) + '<span>Missões de hoje</span></div>' +
      '<div class="kids-sub">' + hello + ', turma! Agora é <b>' + period + '</b> · aperte <b>OK</b> quando terminar</div>' +
      '<button class="btn focusable kids-new" data-act="mission-new">' + I.get('plus', 24) + ' Nova missão</button></div>' +
      (function () { var r = kids.slice().sort(function (x, y) { return SC[y.id].week - SC[x.id].week; }), md = ['#fbbf24', '#cbd5e1', '#f59e0b'];
        return '<div class="kids-board">' + I.get('star', 26) + '<span>PLACAR DA SEMANA</span>' + r.map(function (k, i) { var sc = SC[k.id];
          return '<div class="kb-k" style="--k:' + k.color + '"><b style="background:' + (md[i] || '#64748b') + '">' + (i + 1) + '</b>' + av(k, 34) + '<em>' + esc(String(k.name).split(' ')[0]) + '</em><strong>' + sc.week + '★</strong><i><i style="width:' + Math.min(100, Math.round(sc.week / sc.goal * 100)) + '%"></i></i></div>'; }).join('') + '</div>'; })() +
      '<div class="kids-grid" style="grid-template-columns:repeat(' + Math.max(kids.length, 1) + ',1fr)">' + kids.map(function (k, ki) {
        var mine = state.chores.filter(function (c) { return c.member === k.id; }).sort(function (a, b) {
          return (a.done - b.done) || (order.indexOf(a.period) - order.indexOf(b.period));
        });
        var done = mine.filter(function (c) { return c.done; }).length;
        var allDone = mine.length && done === mine.length;
        var sc = SC[k.id], stars = sc.week, goal = sc.goal;
        var pct = Math.min(100, Math.round(stars / goal * 100));
        return '<div class="kid-card' + (allDone ? ' all-done' : '') + '" style="--k:' + k.color + '" data-kid="' + k.id + '">' +
          '<div class="kid-top"><div class="kid-bubble" style="' + PK.face(k) + '">' + (k.photo ? '' : esc(k.initial)) + '</div><div class="kid-id"><div class="kid-name">' + esc(k.name) + '</div>' +
          '<div class="kid-badges"><span class="kb star">' + I.get('star', 24) + ' ' + stars + '</span>' +
          (k.streak ? '<span class="kb flame">' + I.get('flame', 24) + ' ' + k.streak + ' dias</span>' : '') + '</div></div>' +
          '<div class="kid-count"><b>' + done + '</b>/' + mine.length + '</div></div>' +
          '<div class="jar-row">' + jar(k, sc, 96) + '<div class="jar-info"><div class="jar-n"><b>' + stars + '</b>/' + goal + ' ★</div><div class="jar-l">esta semana</div>' +
            (sc.reward ? '<div class="jar-rw">' + I.get('gift', 22) + ' ' + (stars >= goal ? 'Ganhou: ' : 'Faltam ' + (goal - stars) + ' para ') + '<b>' + esc(sc.reward) + '</b></div>' : '') +
            '<div class="jar-days">' + sc.days.map(function (v, i) { return '<i class="' + (v ? 'on' : '') + (i === (sc.monday ? (new Date().getDay() + 6) % 7 : new Date().getDay()) ? ' today' : '') + '" title="' + v + '"></i>'; }).join('') + '</div></div></div>' +
          (allDone ? '<div class="kid-party">' + I.get('sparkle', 40) + '<div>Arrasou, ' + esc(k.name) + '!<small>Todas as missões feitas</small></div></div>' : '') +
          '<div class="mission-grid">' + mine.map(function (c, i) {
            return '<div class="mission focusable' + (c.done ? ' done' : '') + (c.pending && !c.done ? ' pending' : '') + (c.period === period && !c.done ? ' now' : '') + '" data-chore="' + esc(c.id) + '"' + (ki === 0 && i === 0 ? ' data-autofocus' : '') + '>' +
              '<span class="ms-ic">' + I.get(c.icon, 40) + '</span><div class="ms-t">' + esc(c.title) + '</div>' +
              '<div class="ms-foot"><span class="ms-p">' + I.get(PERIOD_IC[c.period] || 'sun', 18) + ' ' + esc(c.period) + '</span><span class="ms-pts">+' + c.points + I.get('star', 16) + '</span></div>' +
              (c.pending && !c.done ? '<span class="ms-wait">aguardando aprovação</span>' : '') + '<span class="ms-check">' + I.get(c.pending && !c.done ? 'clock' : 'check', 34, ' stroke-width="3.2"') + '</span></div>';
          }).join('') + '</div></div>';
      }).join('') + '</div></div>';
  }

  /* ================= LISTAS ================= */
  var LIST_IC = { cart: 'cart', pill: 'pill', home: 'home', card: 'card' };
  function lists(state, sel) {
    var cur = state.lists.filter(function (l) { return l.id === sel; })[0] || state.lists[0];
    if (!cur) return '<div class="empty">Nenhuma lista ainda.</div>';
    var left = state.lists.map(function (l, i) {
      var open = l.items.filter(function (it) { return !it.done; }).length;
      return '<div class="ls-item focusable' + (l.id === cur.id ? ' selected' : '') + '" data-list="' + l.id + '" style="--c:' + l.color + '"' + (l.id === cur.id ? ' data-autofocus' : '') + '>' +
        '<span class="ls-ic">' + I.get(LIST_IC[l.icon] || 'list', 34) + '</span><div class="ls-main"><div class="ls-name">' + esc(l.name) + '</div>' +
        '<div class="ls-sub">' + open + ' para comprar</div></div><span class="ls-count">' + open + '</span></div>';
    }).join('');
    return '<div class="ls-grid"><div class="ls-left"><h2>' + chevron() + 'LISTAS DA FAMÍLIA</h2>' + left +
      '<div class="ls-qr"><div id="list-qr" class="mini-qr"></div><div><b>Leve a lista no celular</b><span>Aponte a câmera para abrir no mercado</span></div></div></div>' +
      '<div class="card ls-panel" id="ls-panel">' + listPanel(state, cur) + '</div></div>';
  }
  function listPanel(state, l) {
    var open = l.items.filter(function (i) { return !i.done; }), done = l.items.filter(function (i) { return i.done; });
    var cats = [];
    open.forEach(function (i) { if (cats.indexOf(i.category) < 0) cats.push(i.category); });
    return '<div class="lp-head" style="--c:' + l.color + '"><div><h1>' + esc(l.name) + '</h1><div class="lp-sub">' + open.length + ' para comprar · ' + done.length + ' no carrinho</div></div>' +
      '<div class="lp-actions"><button class="btn focusable" data-act="quick-add-list" data-list-id="' + l.id + '">' + I.get('plus', 24) + ' Adicionar rápido</button><button class="btn ghost focusable" data-act="voice" data-hint="adiciona ... na lista ' + esc(l.name) + '">' + I.get('mic', 26) + ' Adicionar por voz</button>' +
      (done.length ? '<button class="btn ghost focusable" data-act="clear-done" data-list-id="' + l.id + '">' + I.get('trash', 24) + ' Limpar comprados</button>' : '') + '</div></div>' +
      '<div class="lp-body">' + cats.map(function (c) {
        return '<div class="lp-cat">' + esc(c) + '</div><div class="lp-items">' + open.filter(function (i) { return i.category === c; }).map(function (i) { return itemTile(state, l, i); }).join('') + '</div>';
      }).join('') +
      (done.length ? (PK.listShowDone ? '<div class="lp-cat muted">Comprados</div><div class="lp-items">' + done.map(function (i) { return itemTile(state, l, i); }).join('') + '</div>' : '') +
        '<button class="lp-done focusable" data-act="toggle-done">' + I.get('check', 22) + ' ' + done.length + ' comprado' + (done.length > 1 ? 's' : '') + ' · ' + (PK.listShowDone ? 'esconder' : 'ver') + '</button>' : '') +
      (!l.items.length ? '<div class="empty">Lista vazia. Diga “adiciona leite na lista”.</div>' : '') + '</div>';
  }
  function itemTile(state, l, i) {
    return '<div class="li focusable' + (i.done ? ' done' : '') + (i.fresh ? ' fresh' : '') + '" data-item="' + esc(i.id) + '" data-list-id="' + l.id + '">' +
      '<span class="li-box">' + I.get('check', 24, ' stroke-width="3"') + '</span><span class="li-t">' + esc(i.title) + '</span>' + av(member(state, i.by), 30) + '</div>';
  }

  /* ================= ASSISTIR ================= */
  var SERVICE = { netflix: ['Netflix', '#e50914'], prime: ['Prime Video', '#00a8e1'], disney: ['Disney+', '#1f6feb'], youtube: ['YouTube', '#ff0033'] };
  function when(d, now) {
    if (!d) return '';
    var diff = Math.round((U.startOfDay(d) - U.startOfDay(now)) / 86400000);
    if (diff === 0) return 'hoje'; if (diff === -1) return 'ontem'; if (diff === 1) return 'amanhã';
    if (diff < 0 && diff > -7) return U.DAYS[d.getDay()].toLowerCase(); if (diff > 0 && diff < 7) return U.DAYS[d.getDay()].toLowerCase();
    return U.shortDate(d);
  }
  function poster(w, now, cls) {
    var sv = SERVICE[w.service] || ['', '#64748b'];
    var bg = w.poster ? 'background-image:url(\'' + esc(w.poster) + '\')' : 'background:linear-gradient(160deg,' + (w.colors || ['#334155', '#0f172a']).join(',') + ')';
    return '<div class="pst ' + (cls || '') + ' focusable" data-open="watch:' + esc(w.id) + '"><div class="pst-art" style="' + bg + '">' +
      (w.poster ? '' : '<div class="pst-name">' + esc(w.title) + '</div>') +
      '<span class="pst-sv" style="background:' + sv[1] + '">' + sv[0] + '</span>' +
      (w.badge ? '<span class="pst-badge' + (/novo|nova|episód/i.test(w.badge) ? ' new' : '') + '">' + esc(w.badge) + '</span>' : '') + '</div>' +
      '<div class="pst-t">' + esc(w.title) + '</div><div class="pst-s">' + esc([w.ep, w.date && when(w.date, now)].filter(Boolean).join(' · ')) + '</div></div>';
  }
  function watch(state) {
    var now = new Date(), W = state.watch || {}, items = W.items || [];
    var followed = items.filter(function (w) { return w.followed; }).sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    var releases = items.filter(function (w) { return /lança|em alta/i.test(w.badge || ''); });
    var mn = W.movieNight, night = '';
    if (mn) {
      var cands = mn.candidates.map(function (id) { return items.filter(function (i) { return i.id === id; })[0]; }).filter(Boolean);
      var tally = {}; Object.keys(mn.votes || {}).forEach(function (m) { tally[mn.votes[m]] = (tally[mn.votes[m]] || []).concat([m]); });
      var total = Object.keys(mn.votes || {}).length || 1;
      cands.sort(function (a, b) { return (tally[b.id] || []).length - (tally[a.id] || []).length; });
      night = '<div class="glass mn"><div class="h-sec">FILME DA SEXTA<span>' + U.DAYS[mn.day] + ' às ' + esc(mn.time) + ' · ' + total + ' votos</span></div><div class="mn-body"><div class="mn-list">' +
        cands.map(function (c, i) {
          var v = tally[c.id] || [], pct = Math.round(v.length / total * 100), sv = SERVICE[c.service] || ['', '#64748b'];
          return '<div class="mn-row focusable' + (i === 0 && v.length ? ' lead' : '') + '" data-vote="' + esc(c.id) + '"><span class="mn-thumb" style="background:linear-gradient(160deg,' + (c.colors || []).join(',') + ')"></span>' +
            '<div class="mn-main"><b>' + esc(c.title) + (i === 0 && v.length ? ' <em>na frente</em>' : '') + '</b><span>' + sv[0] + '</span><div class="mn-bar"><i style="width:' + pct + '%"></i></div></div>' +
            '<span class="stack">' + v.map(function (m) { return av(member(state, m), 34); }).join('') + '</span></div>';
        }).join('') + '</div><div class="mn-qr"><div class="qr-box small"><div id="vote-qr"></div></div><b>Vote pelo celular</b><span>ou OK aqui para votar</span></div></div></div>';
    }
    return '<div class="wt">' +
      '<div class="wt-sec"><div class="h-sec">NOVOS EPISÓDIOS DO QUE VOCÊS SEGUEM<span>' + followed.length + ' séries · diga “seguir …” para adicionar</span></div>' +
      '<div class="pst-row">' + (followed.map(function (w) { return poster(w, now); }).join('') || '<div class="empty">Vocês ainda não seguem nenhuma série.</div>') + '</div></div>' +
      '<div class="wt-bottom">' + night + '<div class="glass wt-rel"><div class="h-sec">LANÇAMENTOS NOS SEUS APPS</div>' +
      releases.map(function (w) {
        var sv = SERVICE[w.service] || ['', '#64748b'];
        return '<div class="rel-row focusable" data-open="watch:' + esc(w.id) + '"><span class="rel-art" style="background:linear-gradient(160deg,' + (w.colors || []).join(',') + ')"></span>' +
          '<div class="rel-main"><b>' + esc(w.title) + '</b><span><i style="background:' + sv[1] + '"></i>' + sv[0] + (w.ep ? ' · ' + esc(w.ep) : '') + (w.date ? ' · ' + when(w.date, now) : '') + '</span></div></div>';
      }).join('') + '</div></div></div>';
  }

  /* ================= CASA (LG ThinQ) ================= */
  var DEV_IC = { washer: 'shirt', dryer: 'shirt', dishwasher: 'plate', fridge: 'home', ac: 'sun2', robot: 'sparkle' };
  function devices(state) {
    var devs = state.devices || [];
    if (!devs.length) return '<div class="empty">Nenhum aparelho conectado. Ligue o LG ThinQ no PlanKnect (Configurações → Casa).</div>';
    return '<div class="hm-head"><h1>Casa</h1><span>' + I.get('home', 22) + ' LG ThinQ · ' + devs.length + ' aparelhos' + (PK.data.mode() === 'demo' ? ' · demonstração' : '') + '</span></div>' +
      '<div class="hm-grid">' + devs.map(function (d, i) {
        var body = '', ctrl = '', st = 'idle';
        if (d.type === 'washer' || d.type === 'dryer' || d.type === 'dishwasher') {
          st = d.state;
          body = d.state === 'running' ? '<div class="hm-big">' + d.endsIn + '<small> min</small></div><div class="hm-s">para terminar · ' + esc(d.detail || '') + '</div>'
            : d.state === 'done' ? '<div class="hm-big ok">Terminou</div><div class="hm-s">' + esc(d.detail || '') + '</div>' : '<div class="hm-big dim">Desligada</div>';
        }
        if (d.type === 'fridge') {
          st = d.door ? 'alert' : 'ok';
          body = '<div class="hm-temps"><div><b>' + d.fridge + '°</b><span>Geladeira</span></div><div><b>' + d.freezer + '°</b><span>Freezer</span></div></div><div class="hm-s ' + (d.door ? 'red' : '') + '">' + (d.door ? 'Porta aberta!' : 'Portas fechadas') + '</div>';
        }
        if (d.type === 'ac') {
          st = d.power ? 'on' : 'idle';
          body = '<div class="hm-big' + (d.power ? '' : ' dim') + '">' + d.target + '°<small> alvo</small></div><div class="hm-s">' + (d.power ? esc(d.mode) + ' · agora ' + d.current + '°' : 'Desligado · agora ' + d.current + '°') + '</div>';
          ctrl = '<div class="hm-ctrl"><button class="btn ' + (d.power ? '' : 'ghost ') + 'focusable" data-dev="' + d.id + ':power">' + (d.power ? 'Desligar' : 'Ligar') + '</button>' +
            '<button class="btn ghost focusable rd" data-dev="' + d.id + ':temp:-1">−</button><button class="btn ghost focusable rd" data-dev="' + d.id + ':temp:1">+</button></div>';
        }
        if (d.type === 'robot') {
          st = d.state === 'cleaning' ? 'on' : 'idle';
          body = '<div class="hm-big">' + (d.state === 'cleaning' ? 'Limpando' : d.battery + '%') + '</div><div class="hm-s">' + (d.state === 'cleaning' ? 'em andamento' : 'na base, carregando') + '</div>';
          ctrl = '<div class="hm-ctrl"><button class="btn focusable" data-dev="' + d.id + (d.state === 'cleaning' ? ':dock">Voltar à base' : ':start">Começar limpeza') + '</button></div>';
        }
        return '<div class="hm-card st-' + st + (ctrl ? '' : ' focusable') + '"' + (i === 0 ? ' data-autofocus' : '') + '><div class="hm-top"><span class="hm-ic">' + I.get(DEV_IC[d.type] || 'home', 34) + '</span>' +
          '<div><b>' + esc(d.name) + '</b><span>' + esc(d.room || '') + '</span></div><i class="hm-led"></i></div>' + body + ctrl + '</div>';
      }).join('') + '</div>';
  }

  /* ================= TRABALHO ================= */
  // grupo da esquerda: todas, uma pessoa (quadro pessoal ou atribuída) ou um projeto
  function inGroup(pid, t) {
    if (!pid || pid === 'all') return true;
    if (pid.indexOf('person:') === 0) { var id = pid.slice(7); return t.assignee === id || (t.personal || []).indexOf(id) >= 0; }
    if (pid.indexOf('org:') === 0) return t.org === pid.slice(4);
    return t.projectId === pid;
  }
  function statusLabel(s) { return ({ planning: 'Planejamento', active: 'Em andamento', in_progress: 'Em andamento', on_hold: 'Pausado', completed: 'Concluído', review: 'Em revisão' })[s] || s; }
  function work(state, selected, tview) {
    var now = new Date();
    var open = state.tasks.filter(function (t) { return t.status !== 'done'; });
    var people = (state.members || []).filter(function (m) { return !m.kid && (m.dest || open.some(function (t) { return t.assignee === m.id; })); })
      .map(function (m) { return { id: 'person:' + m.id, name: String(m.name).split(' ')[0], org: m.dest ? 'Quadro pessoal + atribuídas' : 'Atribuídas a ' + String(m.name).split(' ')[0], color: m.color || '#a78bfa', person: m }; });
    var cnt = function (p) { return open.filter(function (t) { return t.projectId === p.id; }).length; };
    var projs = state.projects.slice().sort(function (a, b) { return cnt(b) - cnt(a); });
    var orgs = {}; open.forEach(function (t) { if (t.org) orgs[t.org] = (orgs[t.org] || 0) + 1; });
    var orgList = Object.keys(orgs).sort(function (a, b) { return orgs[b] - orgs[a]; }).map(function (o) { return { id: 'org:' + o, name: o, org: 'Organização', color: '#94a3b8', orgItem: true }; });
    var list = [{ id: 'all', name: 'Todas as prioridades', org: open.length + ' tasks abertas', all: true }].concat(people, orgList, projs);
    var left = list.map(function (p, i) {
      var count = open.filter(function (t) { return inGroup(p.id, t); }).length;
      var overdue = open.filter(function (t) { return inGroup(p.id, t) && t.due && t.due < U.startOfDay(now); }).length;
      return '<div class="proj focusable' + (selected === p.id ? ' selected' : '') + (p.person ? ' person' : '') + (p.orgItem ? ' orgi' : '') + (!p.all && !count ? ' empty' : '') + '" data-project="' + p.id + '"' + (i === 0 ? ' data-autofocus' : '') + ' style="--c:' + (p.color || '#94a3b8') + '">' +
        '<div class="proj-top">' + (p.person ? av(p.person, 34) : '') + '<span class="proj-name">' + esc(p.name) + '</span><span class="proj-count">' + count + '</span></div>' +
        '<div class="proj-org">' + esc(p.org || '') + (overdue ? ' · <b class="red">' + overdue + ' atrasada' + (overdue > 1 ? 's' : '') + '</b>' : '') + '</div>' +
        (p.person || p.orgItem ? '' : p.all ? '' : (p.progress != null ? '<div class="bar"><i style="width:' + Math.round(p.progress * 100) + '%"></i></div>' : '') +
          '<div class="proj-ms">' + (function () { var nx = open.filter(function (t) { return t.projectId === p.id && t.due && t.due >= U.startOfDay(now); }).sort(function (a, b) { return a.due - b.due; })[0];
            return p.milestone ? I.get('flag', 20) + ' ' + esc(p.milestone.title) + ' · ' + U.dueLabel(U.toDate(p.milestone.due), now) : nx ? I.get('calendar', 18) + ' Próxima: ' + esc(nx.title).slice(0, 34) + ' · ' + U.dueLabel(nx.due, now) : (p.status ? esc(statusLabel(p.status)) : ''); })() + '</div>') +
        '</div>';
    }).join('');
    return '<div class="proj-grid"><div class="proj-list"><h2>' + chevron() + 'PROJETOS EM ABERTO</h2>' + left + '</div>' +
      '<div class="card prio-panel" id="prio-panel">' + prioPanel(state, selected || 'all', tview) + '</div></div>';
  }
  var TVIEWS = [['prio', 'Prioridades'], ['today', 'Hoje'], ['late', 'Atrasadas'], ['week', 'Esta semana'], ['status', 'Por status'], ['project', 'Por projeto'], ['org', 'Por organização'], ['person', 'Por pessoa']];
  /* filtros combináveis: organização, pessoa, prioridade, status, prazo (vários de cada) */
  var TF_PRIO = [['urgent', 'Urgente'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']], TF_STAT = [['todo', 'A fazer'], ['in_progress', 'Em andamento'], ['review', 'Em revisão']];
  var TF_DUE = [['late', 'Atrasadas'], ['today', 'Hoje'], ['week', 'Próximos 7 dias'], ['later', 'Depois'], ['none', 'Sem prazo']];
  function tfEmpty(tf) { return !tf || !['orgs', 'people', 'prio', 'status', 'due'].some(function (k) { return tf[k] && tf[k].length; }); }
  function tfPass(tf, t, now) {
    if (tfEmpty(tf)) return true;
    var sod = U.startOfDay(now), eow = U.addDays(sod, 7);
    if (tf.orgs && tf.orgs.length && tf.orgs.indexOf(t.org || '—') < 0) return false;
    if (tf.people && tf.people.length && !tf.people.some(function (id) { return t.assignee === id || (t.personal || []).indexOf(id) >= 0; })) return false;
    if (tf.prio && tf.prio.length && tf.prio.indexOf(t.priority || 'medium') < 0) return false;
    if (tf.status && tf.status.length && tf.status.indexOf(t.status === 'open' ? 'todo' : (t.status || 'todo')) < 0) return false;
    if (tf.due && tf.due.length) {
      var k = !t.due ? 'none' : t.due < sod ? 'late' : U.sameDay(t.due, now) ? 'today' : t.due < eow ? 'week' : 'later';
      if (tf.due.indexOf(k) < 0) return false;
    }
    return true;
  }
  function tfLabel(state, k, v) {
    if (k === 'people') { var m = state.members.filter(function (x) { return x.id === v; })[0]; return m ? String(m.name).split(' ')[0] : v; }
    var L = { prio: TF_PRIO, status: TF_STAT, due: TF_DUE }[k]; if (L) return (L.filter(function (x) { return x[0] === v; })[0] || [0, v])[1];
    return v;
  }
  function tfBar(state, tf) {
    var chips = [];
    ['orgs', 'people', 'prio', 'status', 'due'].forEach(function (k) { (tf && tf[k] || []).forEach(function (v) { chips.push('<button class="tf-chip focusable" data-tf="' + k + ':' + esc(v) + '">' + esc(tfLabel(state, k, v)) + ' ' + I.get('x', 14) + '</button>'); }); });
    return '<div class="tf-bar"><button class="tf-open focusable" data-act="tf-open">' + I.get('sliders', 20) + ' Filtros' + (chips.length ? ' <b>' + chips.length + '</b>' : '') + '</button>' + chips.join('') + (chips.length ? '<button class="tf-clear focusable" data-act="tf-clear">Limpar</button>' : '') + '</div>';
  }
  function tfModalBody(state, tf) {
    tf = tf || {};
    var open = state.tasks.filter(function (t) { return t.status !== 'done'; }), orgs = {}; open.forEach(function (t) { orgs[t.org || '—'] = (orgs[t.org || '—'] || 0) + 1; });
    var grp = function (title, k, items) { return '<div class="nn-sec">' + title + '</div><div class="nn-row">' + items.map(function (it, i) { var on = (tf[k] || []).indexOf(it[0]) >= 0; return '<button class="chip focusable' + (on ? ' on' : '') + '" data-tf="' + k + ':' + esc(it[0]) + '"' + (k === 'orgs' && i === 0 ? ' data-autofocus' : '') + '>' + (it[2] || '') + esc(it[1]) + (on ? '<i class="chk">' + I.get('check', 14, ' stroke-width="3"') + '</i>' : '') + '</button>'; }).join('') + '</div>'; };
    return grp('Organização', 'orgs', Object.keys(orgs).sort(function (a, b) { return orgs[b] - orgs[a]; }).map(function (o) { return [o, o + ' · ' + orgs[o]]; })) +
      grp('Pessoa', 'people', state.members.filter(function (m) { return !m.kid || m.dest; }).map(function (m) { return [m.id, String(m.name).split(' ')[0], av(m, 28) + ' ']; })) +
      grp('Prioridade', 'prio', TF_PRIO) + grp('Status', 'status', TF_STAT) + grp('Prazo', 'due', TF_DUE);
  }
  function prioPanelF(state, pid, tv, tf) { return prioPanel(state, pid, tv, tf); }
  function prioPanel(state, pid, tv, tf) {
    var now = new Date(), sod = U.startOfDay(now), eow = U.addDays(sod, 7); tv = tv || 'prio'; tf = tf || (PK.app.ui && PK.app.ui().tf);
    var open = sortTasks(state.tasks.filter(function (t) { return t.status !== 'done' && inGroup(pid, t) && tfPass(tf, t, now); }), now);
    var groups;
    if (tv === 'today') groups = [['Hoje', open.filter(function (t) { return t.due && U.sameDay(t.due, now); }), '']];
    else if (tv === 'late') groups = [['Atrasadas', open.filter(function (t) { return t.due && t.due < sod; }), 'red']];
    else if (tv === 'week') groups = [0, 1, 2, 3, 4, 5, 6].map(function (i) { var d = U.addDays(sod, i); return [i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : U.DAYS[d.getDay()] + ' ' + d.getDate(), open.filter(function (t) { return t.due && U.sameDay(t.due, d); }), '']; });
    else if (tv === 'status') groups = TF_STAT.map(function (s) { return [s[1], open.filter(function (t) { return (t.status === 'open' ? 'todo' : t.status || 'todo') === s[0]; }), s[0] === 'todo' ? '' : '']; });
    else if (tv === 'project') {
      var bp = {}, op = []; open.forEach(function (t) { var k = t.project || 'Sem projeto'; if (!bp[k]) { bp[k] = []; op.push(k); } bp[k].push(t); });
      op.sort(function (a, b) { return bp[b].length - bp[a].length; }); groups = op.map(function (k) { return [k, bp[k], k === 'Sem projeto' ? 'muted' : '']; });
    }
    else if (tv === 'org' || tv === 'person') {
      var by = {}, order = [];
      open.forEach(function (t) {
        var k = tv === 'org' ? (t.org || 'Sem organização') : ((state.members.filter(function (m) { return m.id === t.assignee; })[0] || {}).name || 'Sem responsável');
        if (!by[k]) { by[k] = []; order.push(k); } by[k].push(t);
      });
      order.sort(function (a, b) { return by[b].length - by[a].length; });
      groups = order.map(function (k) { return [k, by[k], /^Sem /.test(k) ? 'muted' : '']; });
    } else groups = [
      ['Atrasadas', open.filter(function (t) { return t.due && t.due < sod; }), 'red'],
      ['Hoje', open.filter(function (t) { return t.due && U.sameDay(t.due, now); }), ''],
      ['Próximos 7 dias', open.filter(function (t) { return t.due && t.due >= sod && t.due < eow && !U.sameDay(t.due, now); }), ''],
      ['Depois / sem data', open.filter(function (t) { return !t.due || t.due >= eow; }), 'muted']
    ];
    var tabs = '<div class="tv-seg">' + TVIEWS.map(function (v) { return '<button class="tv-b focusable' + (tv === v[0] ? ' on' : '') + '" data-tview="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>';
    var p = state.projects.filter(function (x) { return x.id === pid; })[0];
    if (!p && /^person:/.test(pid)) { var pm = (state.members || []).filter(function (m) { return 'person:' + m.id === pid; })[0]; if (pm) p = { name: 'Tarefas de ' + String(pm.name).split(' ')[0] }; }
    var real = state.projects.filter(function (x) { return x.id === pid; })[0];
    if (!p && /^org:/.test(pid)) p = { name: pid.slice(4) };
    return tabs + tfBar(state, tf) + '<div class="pp-head"><h2>' + chevron() + (TVIEWS.filter(function (v) { return v[0] === tv; })[0][1]).toUpperCase() + (p ? ' · ' + esc(p.name.toUpperCase()) : '') + '</h2>' + (real ? '<button class="btn ghost focusable pp-detail" data-open="project:' + esc(real.id) + '">' + I.get('briefcase', 22) + ' Detalhes do projeto ›</button>' : '') + '</div>' +
      groups.filter(function (g) { return g[1].length; }).map(function (g) {
        return '<div class="pg"><div class="pg-h ' + g[2] + '">' + esc(g[0]) + ' <span>' + g[1].length + '</span></div>' + g[1].map(function (t) { return taskRow(t, now, real ? 'inproj' : ''); }).join('') + '</div>';
      }).join('') + (open.length ? '' : '<div class="empty">' + (real ? 'Nenhuma tarefa aberta neste projeto.<br><small>Abra “Detalhes do projeto” para ver marcos e equipe.</small>' : /^person:/.test(pid) ? 'Nada pendente no quadro pessoal.<br><small>Tarefas criadas no quadro pessoal dessa pessoa aparecem aqui.</small>' : 'Nada pendente aqui.') + '</div>');
  }

  return { home: home, weather: weather, watch: watch, devices: devices, SERVICE: SERVICE, agenda: agenda, dayDetail: dayDetail, chores: chores, lists: lists, listPanel: listPanel,
    work: work, prioPanel: prioPanel, tfModalBody: tfModalBody, TYPE: TYPE, title: title, av: av, projChip: projChip, statusLabel: statusLabel, taskRow: taskRow, PRIO: PRIO };
})();
