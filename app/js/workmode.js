/* Modo Computador — o computador pelo HDMI numa janela, com o PlanKnect em volta (Samsung/Tizen).
 * API oficial tizen.tvwindow (privilégio tv.window): a entrada é desenhada atrás da página, no retângulo
 * deixado transparente (.wm-hdmi). Em outras TVs/navegador mostra um espaço reservado.
 *  - Entrada: Ajustes › "Computador está no" (Automático ou HDMI 1–4) ou o botão Entrada aqui (fica salvo).
 *  - Lateral: relógio/clima, próxima reunião (contagem, progresso, QR do Meet perto da hora), tarefas por urgência.
 *  - Barra: linha do tempo do dia com o "agora" e os botões Entrada · Tela cheia · Alfred · Sair.
 *  - Tela cheia: só o computador + uma pílula discreta com hora e próxima reunião. Voltar sai da tela cheia. */
var PK = window.PK || {};
window.PK = PK;

PK.workmode = (function () {
  var U = PK.util, I = PK.icons, esc = U.esc, $ = function (id) { return document.getElementById(id); };
  var sideTab = 'tasks';
  var active = false, port = U.store.get('wmPort', 1), timer = null, getState = null, sources = [], all = [], full = false, picking = false, conf = {};
  var tvw = function () { return window.tizen && window.tizen.tvwindow; };
  function pref() { var p = PK.settings.get('work.hdmi'); return p && p !== 'auto' ? +p : null; }

  function open(gs) {
    getState = gs; active = true; full = false; picking = false;
    if (pref()) port = pref();
    var el = $('workmode');
    el.innerHTML = '<div class="wm-hdmi" id="wm-hdmi">' + (tvw() ? '' : '<div class="wm-ph">' + I.get('monitor', 80) + '<b>HDMI ' + port + '</b><span>Ligue o computador (ou um Apple TV) no HDMI — ele aparece aqui, com o PlanKnect em volta.<br>AirPlay direto do Mac abre em tela cheia pela própria TV.</span></div>') +
        '</div><div class="wm-tag" id="wm-tag"></div><div class="wm-status" id="wm-status"></div><div class="wm-modal" id="wm-modal"><div class="wm-pick" id="wm-pick"></div></div>' +
      '<aside class="wm-side"><div class="wm-info" id="wm-side"></div><div class="wm-alfred" id="wm-alfred"></div></aside>' +
      '<div class="wm-bar"><div class="wm-tl" id="wm-tl"></div><div class="wm-ctl">' +
        '<button class="wm-b focusable" data-wm="pick" data-autofocus>' + I.get('monitor', 28) + '<span><b>Entrada</b><em id="wm-port">HDMI ' + port + '</em></span></button>' +
        '<button class="wm-b focusable" data-wm="full">' + I.get('tv', 28) + '<span><b>Tela cheia</b><em>só o computador</em></span></button>' +
        '<button class="wm-b focusable" data-wm="alfred"><span class="kn-mini"></span><span><b>Alfred</b><em>falar com ele</em></span></button>' +
        '<button class="wm-b ghost focusable" data-wm="exit">' + I.get('x', 28) + '<span><b>Sair</b><em>voltar</em></span></button>' +
      '</div></div><div class="wm-pill" id="wm-pill"></div>';
    el.classList.add('active'); el.classList.remove('full');
    document.body.classList.add('wm-on'); document.documentElement.classList.add('wm-on');
    if (!tvw()) document.documentElement.classList.add('wm-sim'); // fora da TV: fundo escuro no lugar do vídeo
    el.onclick = click;
    if (PK.jarvis.dock) PK.jarvis.dock($('wm-alfred'));
    render(); clearInterval(timer); timer = setInterval(render, 1000);
    setTimeout(function () { showHdmi(true); PK.nav.reset(); }, 60);
  }
  function close() {
    if (!active) return; active = false; clearInterval(timer);
    if (PK.jarvis.undock) PK.jarvis.undock();
    try { if (tvw()) tvw().hide(function () {}, function () {}, 'MAIN'); } catch (e) {}
    var el = $('workmode'); el.classList.remove('active'); el.classList.remove('full'); el.innerHTML = '';
    document.body.classList.remove('wm-on'); document.documentElement.classList.remove('wm-on'); document.documentElement.classList.remove('wm-sim');
  }

  /* ---------- HDMI ---------- */
  function status(msg, ok) { var s = $('wm-status'); if (s) { s.textContent = msg || ''; s.className = 'wm-status' + (msg ? ' on' : '') + (ok ? ' ok' : ''); } }
  function connected(n) { return sources.some(function (x) { return x.number === n; }); }
  function labels() {
    var t = $('wm-tag'); if (t) t.textContent = 'HDMI ' + port + (all.length ? (connected(port) ? ' · com sinal' : ' · sem sinal') : '');
    var p = $('wm-port'); if (p) p.textContent = 'HDMI ' + port + (pref() ? ' · fixo' : ' · automático');
  }
  function rectPx() {
    var st = $('stage').getBoundingClientRect(), k = st.width / 1920, d = window.devicePixelRatio || 1;
    var b = full ? [0, 0, 1920, 1080] : [24, 24, 1440, 810];
    return [Math.round((st.left + b[0] * k) * d) + 'px', Math.round((st.top + b[1] * k) * d) + 'px', Math.round(b[2] * k * d) + 'px', Math.round(b[3] * k * d) + 'px'];
  }
  function rectPxDom() {
    var r = $('wm-hdmi').getBoundingClientRect(), d = window.devicePixelRatio || 1;
    return [Math.round(r.left * d) + 'px', Math.round(r.top * d) + 'px', Math.round(r.width * d) + 'px', Math.round(r.height * d) + 'px'];
  }
  function findSources(cb0) {
    var called = false, cb = function () { if (!called) { called = true; cb0(); } };
    if (!(window.tizen && tizen.systeminfo)) { cb(); return; }
    setTimeout(cb, 1500); // se a TV não responder, segue sem a lista de sinais
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (vs) {
        sources = (vs.connected || []).filter(function (x) { return x.type === 'HDMI'; });
        all = sources.concat((vs.disconnected || []).filter(function (x) { return x.type === 'HDMI'; }));
        cb();
      }, function () { cb(); });
    } catch (e) { cb(); }
  }
  // auto=true: sem preferência fixa, vai para um HDMI com sinal
  function showHdmi(auto) {
    if (!active) return;
    findSources(function () {
      if (auto && !pref() && sources.length && !connected(port)) { port = sources[0].number; U.store.set('wmPort', port); }
      labels(); if (tvw()) apply();
    });
  }
  function apply() {
    var src = all.filter(function (x) { return x.number === port; })[0] || { type: 'HDMI', number: port };
    status('Conectando ao HDMI ' + port + '…');
    try {
      tvw().setSource(src, function () {
        var mo = $('wm-modal'); if (mo && mo.classList.contains('on')) return; // modal aberto: mostra quando fechar
        tvw().show(function () { status('HDMI ' + port + ' na tela', true); setTimeout(function () { status(''); }, 2000); },
          function (e) { status('A TV não mostrou o HDMI: ' + e.message); }, rectPx(), 'MAIN');
      }, function (e) { status('HDMI ' + port + ' recusado: ' + e.message); }, 'MAIN');
    } catch (e) { status('Esta TV bloqueou o HDMI dentro do app (' + e.name + '). Use a entrada pelo controle.'); }
  }
  // muda o tamanho da janela do HDMI: esconde e mostra de novo com o retângulo novo (a Samsung não redimensiona com show() direto)
  function resize() {
    if (!tvw() || !active) return;
    var again = function () { try { tvw().show(function () {}, function (e) { status('A TV não redimensionou o HDMI: ' + e.message); }, rectPx(), 'MAIN'); } catch (e) {} };
    try { tvw().hide(again, again, 'MAIN'); } catch (e) { again(); }
  }
  // modais (entrada, tarefa) ficam por cima do vídeo: some com o HDMI enquanto estão abertos
  function modal(on) {
    var m = $('wm-modal'); if (m) m.classList.toggle('on', on);
    if (!tvw()) return;
    try { if (on) tvw().hide(function () {}, function () {}, 'MAIN'); else resize(); } catch (e) {}
  }

  /* seletor de entrada: HDMI 1–4 com sinal/sem sinal; a escolha fica salva (Ajustes › Computador está no) */
  function pick(on) {
    picking = on; var el = $('wm-pick'); if (!el) return;
    if (!on) { el.classList.remove('on'); el.innerHTML = ''; modal(false); PK.nav.reset(); return; }
    modal(true); drawPick(); findSources(function () { if (picking) drawPick(true); });
  }
  function drawPick(keepFocus) {
    var el = $('wm-pick'); if (!el) return;
    var cur = keepFocus && document.querySelector('.wm-pk.focused'), curV = cur && cur.getAttribute('data-wm-port');
    (function () {
      var nums = [1, 2, 3, 4]; all.forEach(function (x) { if (nums.indexOf(x.number) < 0) nums.push(x.number); });
      el.innerHTML = '<div class="wm-pk-h">Em qual entrada está o computador?</div><div class="wm-pk-row">' +
        '<button class="wm-pk focusable' + (!pref() ? ' on' : '') + '" data-wm-port="auto"' + (!pref() ? ' data-autofocus' : '') + '>' + I.get('sparkle', 30) + '<b>Automático</b><em>1º HDMI com sinal</em></button>' +
        nums.map(function (n) { var c = connected(n), on = pref() === n; return '<button class="wm-pk focusable' + (on ? ' on' : '') + (c ? ' sig' : '') + '" data-wm-port="' + n + '"' + (on ? ' data-autofocus' : '') + '>' + I.get('monitor', 30) + '<b>HDMI ' + n + '</b><em>' + (c ? '● com sinal' : (all.length ? 'sem sinal' : '')) + '</em></button>'; }).join('') +
        '</div><div class="wm-pk-f">Fica salvo · também em Ajustes › Computador está no · Voltar fecha</div>';
      el.classList.add('on');
      if (curV) { var nb = el.querySelector('[data-wm-port="' + curV + '"]'); if (nb) { PK.nav.focus(nb); return; } }
      setTimeout(PK.nav.reset, 30);
    })();
  }
  function choose(v) {
    PK.settings.set('work.hdmi', v === 'auto' ? 'auto' : +v);
    if (v !== 'auto') { port = +v; U.store.set('wmPort', port); }
    picking = false; var pe = $('wm-pick'); if (pe) { pe.classList.remove('on'); pe.innerHTML = ''; } var m = $('wm-modal'); if (m) m.classList.remove('on');
    PK.nav.reset(); showHdmi(v === 'auto');
  }
  function setFull(on) {
    full = on; var el = $('workmode'); el.classList.toggle('full', on);
    resize(); setTimeout(function () { PK.nav.reset(); }, 60);
    if (on) { var p = $('wm-pill'); if (p) { p.classList.add('hint'); setTimeout(function () { p.classList.remove('hint'); }, 5000); } }
  }

  function click(e) {
    var b = e.target.closest && e.target.closest('[data-wm],[data-wm-port],[data-wm-task],[data-wm-tdo],[data-wm-deal],[data-wm-ev]'); if (!b) return;
    e.stopPropagation();
    var a = b.getAttribute('data-wm'), p = b.getAttribute('data-wm-port');
    if (p) return choose(p);
    var tk = b.getAttribute('data-wm-task'); if (tk) return taskSheet(tk);
    var dl = b.getAttribute('data-wm-deal'); if (dl) return dealSheet(dl);
    var ev = b.getAttribute('data-wm-ev'); if (ev) return eventSheet(ev);
    if (a && a.indexOf('tab:') === 0) { sideTab = a.slice(4); $('wm-side').setAttribute('data-sig', ''); render(); var tb = document.querySelector('[data-wm="tab:' + sideTab + '"]'); if (tb) PK.nav.focus(tb); return; }
    if (a === 'room') { var evid = b.getAttribute('data-id'); taskSheet(null); close(); PK.modes.meeting.toggle(true, PK.app.state()); return; }
    var ta = b.getAttribute('data-wm-tdo'); if (ta) return taskDo(ta);
    if (a === 'pick') return pick(true);
    if (a === 'full') return setFull(true);
    if (a === 'exit') return close();
    if (a === 'alfred') return PK.jarvis.listen();
    if (a === 'join') return PK.computer.join(b.getAttribute('data-url'));
    if (a === 'tclose') return taskSheet(null);
    if (a === 'joinev') { var jid = b.getAttribute('data-id'); taskSheet(null); PK.data.detail('event', jid).then(function (d) { PK.computer.join(d.conference && d.conference.url); }); return; }
  }

  /* ---------- tarefa: concluir / adiar sem sair do computador ---------- */
  function taskSheet(id) {
    var el = $('wm-pick'); if (!el) return;
    if (!id) { picking = false; el.classList.remove('on'); el.innerHTML = ''; modal(false); PK.nav.reset(); return; }
    var t = (getState().tasks || []).filter(function (x) { return x.id === id; })[0]; if (!t) return;
    picking = true;
    el.innerHTML = '<div class="wm-pk-h">' + esc(t.title) + '</div><div class="wm-tk-meta">' + (t.project ? esc(t.project) + ' · ' : '') + (t.due ? U.dueLabel(t.due, new Date()) : '') + '</div><div class="wm-pk-row">' +
      '<button class="wm-pk focusable" data-wm-tdo="' + esc(id) + ':done" data-autofocus>' + I.get('check', 30) + '<b>Concluir</b><em>marcar como feita</em></button>' +
      '<button class="wm-pk focusable" data-wm-tdo="' + esc(id) + ':progress">' + I.get('play', 30) + '<b>Em andamento</b><em>comecei</em></button>' +
      '<button class="wm-pk focusable" data-wm-tdo="' + esc(id) + ':tomorrow">' + I.get('calendar', 30) + '<b>Amanhã</b><em>adiar 1 dia</em></button>' +
      '<button class="wm-pk focusable" data-wm-tdo="' + esc(id) + ':week">' + I.get('calendar', 30) + '<b>Próx. semana</b><em>adiar 7 dias</em></button>' +
      '<button class="wm-pk focusable" data-wm="tclose">' + I.get('x', 30) + '<b>Fechar</b><em>voltar</em></button></div>';
    modal(true); el.classList.add('on'); setTimeout(PK.nav.reset, 30);
  }
  function sheetOpen(html) { var el = $('wm-pick'); picking = true; el.innerHTML = html; modal(true); el.classList.add('on'); setTimeout(PK.nav.reset, 30); }
  function dealSheet(id) {
    var x = PK.deals.get(id); if (!x) return; var now = new Date();
    sheetOpen('<div class="wm-pk-h">' + esc(x.company) + ' · ' + esc(x.title) + '</div><div class="wm-tk-meta">' + esc(x.stage) + ' · ' + PK.deals.money(x.value, x.currency) + ' · ' + Math.round(x.probability * 100) + '% · fecha ' + (x.close ? U.dueLabel(x.close, now) : '—') + '</div>' +
      (x.next ? '<div class="wm-sh-row">' + I.get('flag', 26) + '<b>' + esc(x.next.text) + '</b><span>' + (x.next.due ? U.dueLabel(x.next.due, now) + ' ' + U.hm(x.next.due) : '') + '</span></div>' : '') +
      (x.risk ? '<div class="wm-sh-row r">' + I.get('bell', 24) + '<b>' + esc(x.risk) + '</b></div>' : '') +
      ((x.documents || []).length ? '<div class="wm-sh-row">' + I.get('note', 24) + '<b>' + x.documents.length + ' documento(s) no Deal Room</b><span>' + esc(x.documents.map(function (f) { return f.name; }).join(' · ')).slice(0, 90) + '</span></div>' : '') +
      '<div class="wm-pk-row"><button class="wm-pk focusable" data-wm="tclose" data-autofocus>' + I.get('x', 30) + '<b>Fechar</b><em>voltar</em></button></div>');
  }
  function eventSheet(id) {
    var e = getState().events.filter(function (x) { return x.id === id; })[0]; if (!e) return; var now = new Date(), live = e.start <= now && e.end > now;
    sheetOpen('<div class="wm-pk-h">' + esc(e.private ? 'Ocupado' : e.title) + '</div><div class="wm-tk-meta">' + U.hm(e.start) + ' – ' + U.hm(e.end) + (live ? ' · acontecendo agora' : ' · ' + U.relMinutes((e.start - now) / 60000)) + (e.location ? ' · ' + esc(e.location) : '') + '</div><div class="wm-pk-row">' +
      (e.video && PK.computer.on() ? '<button class="wm-pk focusable" data-wm="joinev" data-id="' + esc(e.id) + '" data-autofocus>' + I.get('video', 30) + '<b>Entrar</b><em>abre no computador</em></button>' : '') +
      (e.type === 'meeting' || e.video ? '<button class="wm-pk focusable" data-wm="room" data-id="' + esc(e.id) + '">' + I.get('camera', 30) + '<b>Sala de reunião</b><em>pauta e insights</em></button>' : '') +
      '<button class="wm-pk focusable" data-wm="tclose"' + (e.video && PK.computer.on() ? '' : ' data-autofocus') + '>' + I.get('x', 30) + '<b>Fechar</b><em>voltar</em></button></div>');
  }
  function taskDo(v) {
    var p = v.split(':'), id = p[0], how = p[1], patch = {};
    if (how === 'done') patch.status = 'done'; else if (how === 'progress') patch.status = 'in_progress';
    if (!patch.status) { var d = U.addDays(U.startOfDay(new Date()), how === 'week' ? 7 : 1); patch.due = d.toISOString().slice(0, 10); }
    taskSheet(null); status('Salvando…');
    PK.data.updateTask(id, patch).then(function () {
      status(how === 'done' ? 'Tarefa concluída ✓' : how === 'progress' ? 'Tarefa em andamento' : 'Tarefa adiada', true); setTimeout(function () { status(''); }, 2500);
      $('wm-side').setAttribute('data-sig', ''); if (PK.app.refresh) PK.app.refresh();
    }).catch(function (e) { status(PK.writeErr(e)); setTimeout(function () { status(''); }, 7000); });
  }

  /* ---------- painéis ---------- */
  function mm(ms) { var m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + U.pad(m % 60) : m + ' min'; }
  var PR = { high: 0, medium: 1, low: 2 };
  function nextEvent(st, now) {
    return st.events.filter(function (e) { return !e.allDay && e.end > now && U.sameDay(e.start, now); })
      .sort(function (a, b) { return a.start - b.start; })[0];
  }
  function confUrl(e) {
    if (!e || !e.video) return null;
    if (conf[e.id] !== undefined) return conf[e.id];
    conf[e.id] = null;
    PK.data.detail('event', e.id).then(function (d) { conf[e.id] = (d.conference && d.conference.url) || null; drawQr(e); }).catch(function () {});
    return null;
  }
  function drawQr(e) {
    var q = $('wm-qr'), u = conf[e.id]; if (!q || !u || !window.QRCode || q.firstChild) return;
    new window.QRCode(q, { text: u, width: 120, height: 120, colorDark: '#0b1230', colorLight: '#ffffff' });
  }
  function render() {
    if (!active) return;
    var st = getState(), now = new Date(), side = $('wm-side'); if (!side) return;
    var e = nextEvent(st, now), live = e && e.start <= now, soon = e && !live && e.start - now < 15 * 60000;
    var w = st.weather, sod = U.startOfDay(now);
    var open = (st.tasks || []).filter(function (t) { return t.status !== 'done' && t.due && (U.sameDay(t.due, now) || t.due < sod); })
      .sort(function (a, b) { return (PR[a.priority] == null ? 1 : PR[a.priority]) - (PR[b.priority] == null ? 1 : PR[b.priority]) || a.due - b.due; });
    var late = open.filter(function (t) { return t.due < sod; }).length, today = open.length - late;
    var hours = w && w.hours ? w.hours.filter(function (h) { return h.time > now; }).slice(0, 4) : [];
    var sig = sideTab + '|' + (e ? e.id + (live ? 'L' : soon ? 'S' : '') : '-') + '|' + open.length + '|' + (w ? w.temp : '') + '|' + now.getHours() + '|' + (PK.deals && PK.deals.get ? (PK.deals.compact(1) || '').length : 0);
    if (side.getAttribute('data-sig') !== sig) {
      side.setAttribute('data-sig', sig);
      var u = confUrl(e);
      side.innerHTML = '<div class="wm-top"><div class="wm-clock" id="wm-clock"></div><div class="wm-wx">' + (w ? I.get(I.weather(w.code, w.isDay !== false), 40) + '<b>' + w.temp + '°</b>' : '') + '</div></div>' +
        '<div class="wm-date">' + U.longDate(now) + '</div>' +
        (hours.length ? '<div class="wm-hours">' + hours.map(function (h) { return '<span><em>' + U.pad(h.time.getHours()) + 'h</em>' + I.get(I.weather(h.code, true), 24) + '<b>' + h.temp + '°</b>' + (h.rain >= 40 ? '<i>' + h.rain + '%</i>' : '') + '</span>'; }).join('') + '</div>' : '') +
        (e ? '<div class="wm-next' + (live ? ' live' : soon ? ' soon' : '') + '"><span id="wm-nl"></span><b id="wm-nc"></b><em>' + esc(e.private ? 'Ocupado' : e.title) + '</em><small>' + U.hm(e.start) + ' – ' + U.hm(e.end) + (e.video ? ' · Google Meet' : '') + (e.location ? ' · ' + esc(e.location) : '') + '</small>' +
            (live ? '<div class="wm-prog"><i id="wm-pg"></i></div>' : '') +
            ((live || soon) && e.video ? '<div class="wm-join"><div class="wm-qr" id="wm-qr"></div><div><b>Entrar no Meet</b><span>' + (u ? 'Aponte o celular' : 'Buscando o link…') + '</span>' + (u && PK.computer.on() ? '<button class="wm-go focusable" data-wm="join" data-url="' + esc(u) + '">' + I.get('video', 22) + ' Entrar no computador</button>' : '') + '</div></div>' : '') + '</div>'
          : '<div class="wm-next free"><span>HOJE</span><em>Nada mais na agenda</em><small>Bom momento para focar</small></div>') +
        '<div class="wm-tabs"><button class="wm-tab focusable' + (sideTab === 'tasks' ? ' on' : '') + '" data-wm="tab:tasks">Tarefas' + (late ? '<i class="r">' + late + '</i>' : '') + (today ? '<i>' + today + '</i>' : '') + '</button>' +
          '<button class="wm-tab focusable' + (sideTab === 'deals' ? ' on' : '') + '" data-wm="tab:deals">' + I.get('briefcase', 18) + ' Deals</button></div>' +
        (sideTab === 'deals' ? '<div class="wm-tasks">' + PK.deals.compact(live || soon ? 3 : 6) + '</div>' : '') +
        (sideTab !== 'tasks' ? '' : '<div class="wm-tasks">') + (sideTab !== 'tasks' ? '' : open.length ? open.slice(0, live || soon ? 3 : 6).map(function (t) { return '<div class="wm-t focusable p-' + (t.priority || 'medium') + (t.due < sod ? ' late' : '') + '" data-wm-task="' + esc(t.id) + '"><i></i><span>' + esc(t.title) + (t.project ? '<small style="color:' + (t.projectColor || '#9aa8d1') + '">' + esc(t.project) + '</small>' : '') + '</span><em>' + (t.due < sod ? U.dueLabel(t.due, now).replace('atrasada ', '') : 'hoje') + '</em></div>'; }).join('') : '<div class="wm-t done"><i></i><span>Nada para hoje</span></div>') + (sideTab !== 'tasks' ? '' : '</div>');
      if (e && (live || soon)) drawQr(e);
    }
    var ck = $('wm-clock'); if (ck) ck.textContent = U.hm(now);
    if (e) {
      var nl = $('wm-nl'), nc = $('wm-nc'), pg = $('wm-pg');
      if (nl) nl.textContent = live ? 'AGORA · termina em' : 'A SEGUIR · em';
      if (nc) nc.textContent = mm(live ? e.end - now : e.start - now);
      if (pg) pg.style.width = Math.min(100, Math.round((now - e.start) / (e.end - e.start) * 100)) + '%';
    }
    timeline(st, now);
    var pill = $('wm-pill');
    if (pill) pill.innerHTML = '<em class="wm-hint">Voltar: sair da tela cheia</em><b>' + U.hm(now) + '</b>' + (e ? '<span class="' + (live ? 'live' : '') + '">' + (live ? 'termina em ' : esc(e.private ? 'Ocupado' : e.title).slice(0, 28) + ' em ') + mm(live ? e.end - now : e.start - now) + '</span>' : '');
  }
  /* linha do tempo: de 1h antes até 7h depois, com o "agora" */
  /* linha do tempo: de 1h atrás até o fim do dia (8 a 14 h), compromissos + tarefas com horário; tudo abre com OK */
  function timeline(st, now) {
    var tl = $('wm-tl'); if (!tl) return;
    var t0 = new Date(now); t0.setMinutes(0, 0, 0); t0 = new Date(t0.getTime() - 3600000);
    var eod = U.addDays(U.startOfDay(now), 1), hrs = Math.max(8, Math.min(14, Math.ceil((eod - t0) / 3600000))), span = hrs * 3600000, t1 = new Date(t0.getTime() + span);
    var pos = function (d) { return Math.max(0, Math.min(100, (d - t0) / span * 100)); };
    var evs = st.events.filter(function (e) { return !e.allDay && e.end > t0 && e.start < t1; }).sort(function (a, b) { return a.start - b.start; });
    var tks = (st.tasks || []).filter(function (t) { return t.status !== 'done' && t.due && t.due >= t0 && t.due < t1 && (t.due.getHours() || t.due.getMinutes()); });
    var allDayT = (st.tasks || []).filter(function (t) { return t.status !== 'done' && t.due && U.sameDay(t.due, now) && !(t.due.getHours() || t.due.getMinutes()); }), allDay = allDayT.length;
    var key = t0.getTime() + ':' + hrs + ':' + evs.map(function (e) { return e.id; }).join(',') + ':' + tks.length + ':' + allDay;
    if (tl.getAttribute('data-k') !== key) {
      tl.setAttribute('data-k', key);
      var step = hrs > 10 ? 2 : 1, ticks = ''; for (var h = 0; h <= hrs; h += step) { var d = new Date(t0.getTime() + h * 3600000); ticks += '<span class="wm-tk" style="left:' + (h / hrs * 100) + '%">' + U.pad(d.getHours()) + 'h</span>'; }
      var lanes = [];
      tl.innerHTML = '<div class="wm-axis">' + ticks + '' + '</div><div class="wm-lanes">' + evs.map(function (e) {
        var l = 0; while (lanes[l] && lanes[l] > e.start) l++; lanes[l] = e.end; if (l > 1) l = 1;
        var a = pos(e.start), b = pos(e.end);
        return '<div class="wm-ev focusable t-' + (e.type || 'event') + '" data-wm-ev="' + esc(e.id) + '" style="left:' + a + '%;width:' + Math.max(13, b - a) + '%;top:' + (l * 42) + 'px" data-s="' + e.start.getTime() + '" data-e="' + e.end.getTime() + '"><b>' + U.hm(e.start) + (e.video ? ' · Meet' : '') + '</b>' + esc(e.private ? 'Ocupado' : e.title) + '</div>';
      }).join('') + tks.map(function (t) {
        return '<div class="wm-tm focusable" data-wm-task="' + esc(t.id) + '" style="left:' + pos(t.due) + '%;--c:' + (t.projectColor || '#fbbf24') + '"><i></i><span>' + U.hm(t.due) + ' ' + esc(t.title) + '</span></div>';
      }).join('') + (evs.length || tks.length ? '' : '<div class="wm-free">Agenda livre até o fim do dia</div>') + '<div class="wm-now" id="wm-now"><i></i></div></div>' +
        (allDay ? '<div class="wm-alld"><span>Hoje, sem horário</span>' + allDayT.slice(0, 4).map(function (t) { return '<button class="wm-ad focusable" data-wm-task="' + esc(t.id) + '" style="--c:' + (t.projectColor || '#94a3b8') + '"><i></i>' + esc(t.title) + '</button>'; }).join('') + (allDay > 4 ? '<em>+' + (allDay - 4) + '</em>' : '') + '</div>' : '');
    }
    var n = $('wm-now'); if (n) n.style.left = pos(now) + '%';
    Array.prototype.forEach.call(tl.querySelectorAll('.wm-ev'), function (x) { var s = +x.getAttribute('data-s'), en = +x.getAttribute('data-e'); x.classList.toggle('past', en <= now); x.classList.toggle('live', s <= now && en > now); });
  }

  /* ---------- controle remoto ---------- */
  function key(k) {
    if (k === 'voice' || k === 'jarvis') { PK.jarvis.listen(); return true; } // botão do microfone fala com o Alfred acoplado
    if (k === 'back') {
      var now = Date.now(); if (now - (key.last || 0) < 700) return true; key.last = now;
      if (picking) { if ($('wm-pick').querySelector('[data-wm-tdo]')) taskSheet(null); else pick(false); } else if (full) setFull(false); else close();
      return true;
    }
    if (full) { if (k === 'ok' || k === 'up' || k === 'down') setFull(false); return true; }
    return false; // setas e OK: navegação normal entre os botões
  }

  return { open: open, close: close, active: function () { return active; }, key: key, full: function () { return full; } };
})();
