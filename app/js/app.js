/* Orquestração do Family Hub: boot, pareamento, abas, modais, voz, modos reunião/ambiente. */
(function () {
  var U = PK.util, V = PK.views, C = PK.config, I = PK.icons, S = PK.settings, M = PK.modes;
  var $ = function (id) { return document.getElementById(id); };
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  var state = { household: null, members: [], events: [], tasks: [], projects: [], chores: [], lists: [], meals: [], notes: [], photos: [], weather: null };
  var ui = { view: 'home', agenda: { mode: 'people', member: 'all', familyOnly: false }, project: 'all', list: null };
  var timers = {}, overlayReturn = [];

  PK.app = { state: function () { return state; } };

  /* ---------- escala 1920x1080 ---------- */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    $('stage').style.transform = 'translate(' + (window.innerWidth - 1920 * s) / 2 + 'px,' + (window.innerHeight - 1080 * s) / 2 + 'px) scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  function showScreen(id) {
    each('.screen', function (s) { s.classList.toggle('active', s.id === id); });
    setTimeout(PK.nav.reset, 30);
  }

  /* ================= PAREAMENTO ================= */
  var pair = { poll: null, countdown: null };
  function startPairing() {
    stopPairing();
    showScreen('screen-pair'); showPairPane('qr');
    $('pair-status').innerHTML = '<span class="spin"></span> Gerando código…';
    $('pair-code').textContent = '····-····';
    PK.tv.deviceInfo(function (info) {
      PK.api.startDeviceAuth(info).then(function (d) {
        qr('qr', d.verification_uri_complete || (C.linkUrl + '?code=' + encodeURIComponent(d.user_code)), 380);
        $('pair-code').textContent = d.user_code;
        $('pair-url').textContent = (d.verification_uri || C.linkUrl).replace(/^https?:\/\//, '');
        tickCountdown(Date.now() + (d.expires_in || 600) * 1000);
        pollLoop(d.device_code, (d.interval || 5) * 1000);
      }).catch(function (err) {
        qr('qr', C.linkUrl + '?code=DEMO-0000', 380);
        $('pair-code').textContent = 'DEMO-0000';
        $('pair-url').textContent = C.linkUrl.replace(/^https?:\/\//, '');
        $('pair-status').innerHTML = '<span class="warn">O PlanKnect ainda não respondeu</span> (' + U.esc(err.message) + '). Use o <b>modo demonstração</b> por enquanto.';
      });
    });
  }
  function pollLoop(code, interval) {
    $('pair-status').innerHTML = '<span class="spin"></span> Aguardando aprovação no celular…';
    pair.poll = setTimeout(function () {
      PK.api.pollDeviceAuth(code).then(function (r) {
        if (r.status === 'approved') return onLinked();
        if (r.status === 'expired') return startPairing();
        if (r.status === 'denied') { $('pair-status').innerHTML = '<span class="warn">Conexão recusada no celular.</span>'; setTimeout(startPairing, 3000); return; }
        pollLoop(code, r.status === 'slow_down' ? interval + 5000 : interval);
      }).catch(function () { pollLoop(code, interval * 2); });
    }, interval);
  }
  function tickCountdown(exp) {
    clearInterval(pair.countdown);
    pair.countdown = setInterval(function () {
      var s = Math.max(0, Math.round((exp - Date.now()) / 1000));
      $('pair-exp').textContent = 'Código válido por ' + Math.floor(s / 60) + ':' + U.pad(s % 60);
      if (!s) clearInterval(pair.countdown);
    }, 1000);
  }
  function stopPairing() { clearTimeout(pair.poll); clearInterval(pair.countdown); $('pair-exp').textContent = ''; }
  function showPairPane(w) {
    $('pair-qr').classList.toggle('hidden', w !== 'qr');
    $('pair-login').classList.toggle('hidden', w !== 'login');
    setTimeout(PK.nav.reset, 30);
  }
  function doLogin() {
    var email = $('login-email').value.trim(), pass = $('login-pass').value;
    if (!email || !pass) { $('login-msg').textContent = 'Preencha email e senha.'; return; }
    $('login-msg').innerHTML = '<span class="spin"></span> Entrando…';
    PK.api.loginPassword(email, pass).then(function () { $('login-pass').value = ''; onLinked(); })
      .catch(function (e) { $('login-msg').innerHTML = '<span class="warn">' + U.esc(e.message === 'Failed to fetch' ? 'Sem conexão com o PlanKnect' : e.message) + '</span>'; });
  }
  function onLinked() { stopPairing(); PK.data.setMode('live'); enterMain(); PK.toast('TV conectada ao PlanKnect'); }
  function enterDemo() { stopPairing(); PK.data.setMode('demo'); enterMain(); PK.toast('Modo demonstração — dados de exemplo'); }

  /* QR genérico */
  function qr(id, text, size) {
    var el = $(id); if (!el) return;
    el.innerHTML = '';
    if (window.QRCode) new window.QRCode(el, { text: text, width: size, height: size, colorDark: '#0b1230', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    else el.innerHTML = '<div class="qr-fallback">' + I.get('qr', size / 3) + '</div>';
  }

  /* ================= PRINCIPAL ================= */
  function enterMain() {
    showScreen('screen-main');
    setView('home');
    refreshData(); refreshWeather();
    clearInterval(timers.data); clearInterval(timers.weather);
    // conectado: GET /version a cada 15 s e recarrega só quando muda (+ segurança a cada 2 min); demo: intervalo fixo
    timers.data = setInterval(function () {
      if (PK.data.mode() !== 'live') { if (Date.now() - sync.last > C.refresh.dataMs) refreshData(); return; }
      if (sync.ver) PK.data.version().then(function (r) {
        if (r && r.version && r.version !== sync.v) { var first = sync.v === null; sync.v = r.version; if (!first) refreshData(); }
      }).catch(function () { sync.ver = false; });
      if (!sync.ver || Date.now() - sync.last > 120000) refreshData();
    }, 15000);
    // respostas do celular (planknect.com/tv/remote) para esta TV
    clearInterval(timers.pending);
    timers.pending = setInterval(function () {
      if (PK.data.mode() !== 'live' || !PK.api.assistantPending) return;
      PK.api.assistantPending(sync.cursor).then(function (r) {
        var reps = r.replies || [];
        reps.forEach(function (x) { if (sync.seen[x.id]) return; sync.seen[x.id] = 1; if (PK.jarvis.remote) PK.jarvis.remote(x.reply || {}); });
        sync.cursor = reps.length >= 20 ? reps[reps.length - 1].created_at : (r.cursor || sync.cursor);
      }).catch(function () {});
    }, 5000);
    timers.weather = setInterval(refreshWeather, C.refresh.weatherMs);
  }
  var sync = { v: null, ver: true, last: 0, cursor: new Date(Date.now() - 120000).toISOString(), seen: {} };
  function refreshData() {
    sync.last = Date.now();
    $('sync').className = 'sync busy';
    return PK.data.load().then(function (b) {
      for (var k in b) state[k] = b[k];
      if (b.scenes) PK.scenes.setRemote(b.scenes);
      $('household').textContent = (state.household && state.household.name) || '';
      $('mode-badge').style.display = PK.data.mode() === 'demo' ? '' : 'none';
      $('sync').className = 'sync ok';
      if (PK.data.mode() === 'live') PK.deals.load(true).then(function () { if (ui.view === 'deals') render(); });
      if (state.household && state.household.location && !refreshData.loc) { refreshData.loc = true; refreshWeather(); }
      render();
      M.meeting.tick(state);
      PK.alerts.tick(state); PK.alerts.sync(state); PK.routine.render(state);
      extras();
    }).catch(function (e) {
      $('sync').className = 'sync err';
      if (e.message === 'unauthorized') { PK.data.setMode('unlinked'); startPairing(); return; }
      PK.toast('Sem conexão — mostrando os últimos dados');
    });
  }
  // Avisos do PlanKnect (campainha, recados, casa): GET /alerts a cada 5 s no modo conectado
  var alertsSince = Date.now() - 60000, hasAlerts = true;
  setInterval(function () {
    if (!hasAlerts || PK.data.mode() !== 'live' || !$('screen-main').classList.contains('active')) return;
    PK.api.alerts(alertsSince).then(function (r) {
      alertsSince = r.now || Date.now();
      (r.alerts || []).forEach(function (a) {
        if (a.kind === 'door') PK.alerts.push({ id: a.id, kind: 'door', label: 'CAMPAINHA', title: a.title || 'Tem alguém na porta', body: a.body, image: a.image || a.image_url, live: a.live, device_id: a.device_id, ttl: 0.25, urgent: true });
        else PK.alerts.push({ id: a.id, kind: a.kind || 'family', icon: a.icon, label: (a.kind === 'device' ? 'CASA' : 'RECADO'), title: a.title, body: a.body, ttl: 10 });
      });
    }).catch(function () { hasAlerts = false; });
  }, 5000);

  // Integrações opcionais: TMDB direto (testes) e agente local (ThinQ via LAN)
  function extras() {
    if (C.tmdb.apiKey && !extras.busy) {
      extras.busy = true;
      PK.content.load(S.get('watch.follows') || ['The Diplomat', 'Bluey', 'Reacher']).then(function (w) {
        extras.busy = false; if (w && w.items.length) { state.watch = w; if (ui.view === 'watch') render(); }
      }, function () { extras.busy = false; });
    }
    if (C.agentUrl) fetch(C.agentUrl + '/devices').then(function (r) { return r.json(); }).then(function (d) {
      state.devices = d.devices || d; PK.alerts.tick(state); if (ui.view === 'home-devices') render();
    }).catch(function () {});
  }
  function refreshWeather() {
    var loc = (state.household && state.household.location) || C.location;
    PK.weather.load(loc).then(function (w) { state.weather = w; render(); if (ui.view === 'home') mountHomeBg(); });
  }

  /* Fundo fotográfico/vídeo da tela inicial */
  var homeBgId = null;
  function mountHomeBg(force) {
    var want = S.get('home.scene');
    if (want === 'auto') want = PK.scenes.auto(state.weather);
    document.body.classList.toggle('home-dark', want === 'dark');
    if (want === 'dark') { $('home-bg').innerHTML = ''; homeBgId = null; return; }
    if (!force && want === homeBgId) return;
    homeBgId = want;
    PK.scenes.mount($('home-bg'), want, { shade: 'home' });
  }
  function setView(v, keepFocus) {
    ui.view = v;
    document.body.classList.toggle('on-home', v === 'home');
    if (v === 'home') mountHomeBg();
    each('.tab', function (t) { t.classList.toggle('active', t.getAttribute('data-view') === v); });
    each('.view', function (el) { el.classList.toggle('active', el.id === 'view-' + v); });
    render(!keepFocus);
  }

  // Re-renderiza a aba ativa preservando o foco (por índice) em atualizações
  function render(resetFocus) {
    var el = $('view-' + ui.view); if (!el) return;
    var cur = PK.nav.current(), idx = -1;
    if (!resetFocus && cur && el.contains(cur)) idx = Array.prototype.indexOf.call(el.querySelectorAll('.focusable'), cur);
    var keepOutside = !resetFocus && cur && !el.contains(cur);
    var v = ui.view;
    if (v === 'home') el.innerHTML = V.home(state);
    if (v === 'agenda') el.innerHTML = V.agenda(state, ui.agenda);
    if (v === 'chores') el.innerHTML = V.chores(state);
    if (v === 'lists') { el.innerHTML = V.lists(state, ui.list); shareQr(ui.list || (state.lists[0] || {}).id); }
    if (v === 'work') el.innerHTML = V.work(state, ui.project, ui.tview);
    if (v === 'deals') el.innerHTML = PK.deals.view(state);
    if (v === 'weather') el.innerHTML = PK.world.tab(state);
    if (v === 'notes') el.innerHTML = PK.plus.notesView(state);
    if (v === 'timers') el.innerHTML = PK.plus.timersView(state);
    if (v === 'watch') { el.innerHTML = V.watch(state); qr('vote-qr', C.baseUrl + '/tv/vote', 140); }
    if (v === 'home-devices') el.innerHTML = V.devices(state);
    el.classList.toggle('kids-theme', v === 'chores');
    $('top-clock').textContent = U.hm(new Date());
    if (keepOutside) return;
    var items = el.querySelectorAll('.focusable');
    if (idx >= 0 && items[idx]) PK.nav.focus(items[idx], true);
    else if (resetFocus) setTimeout(function () { PK.nav.focus(el.querySelector('[data-autofocus]') || items[0] || document.querySelector('.tab.active'), true); }, 10);
  }

  /* ---------- relógio, minuto, modos ---------- */
  var lastMinute = -1;
  setInterval(function () {
    var n = new Date();
    if (n.getMinutes() !== lastMinute) {
      lastMinute = n.getMinutes();
      var main = $('screen-main').classList.contains('active');
      if (main && ui.view === 'home' && !document.querySelector('.overlay.active')) render();
      $('top-clock').textContent = U.hm(n);
      nightAndShift(n);
      if (main && n.getMinutes() === 0 && ui.view === 'home') mountHomeBg();
      if (main) { PK.alerts.tick(state); PK.routine.tick(state); }
      if (main) { M.meeting.tick(state); M.ambient.tick(state, !document.querySelector('.overlay.active')); }
    }
    var bt = $('big-time'); if (bt) bt.textContent = U.hm(n);
    PK.alerts.second(); PK.routine.second(); PK.plus.second(); PK.world.second();
  }, 1000);
  function nightAndShift(n) {
    var h = n.getHours(), nf = C.night.from, nt = C.night.to;
    document.body.classList.toggle('night', nf > nt ? (h >= nf || h < nt) : (h >= nf && h < nt));
    if (n.getMinutes() % C.pixelShiftMin === 0) {
      document.body.style.setProperty('--shift-x', Math.round(Math.random() * 8 - 4) + 'px');
      document.body.style.setProperty('--shift-y', Math.round(Math.random() * 8 - 4) + 'px');
    }
  }

  /* ================= MODAIS ================= */
  // openModal({ title, body, actions:[{label, act, ghost, data}], after }, cls) -> overlay (empilhável)
  function actionsHtml(list) {
    return (list || [{ label: 'Fechar', act: 'close' }]).map(function (a) {
      return '<button class="btn focusable' + (a.ghost ? ' ghost' : '') + '" data-act="' + a.act + '"' + (a.data ? ' data-arg="' + U.esc(a.data) + '"' : '') + '>' + a.label + '</button>';
    }).join('');
  }
  function openModal(o, cls) {
    var ov = document.createElement('div');
    ov.className = 'overlay dyn';
    ov.innerHTML = '<div class="modal ' + (cls || (o.wide ? 'wide' : '')) + '">' + (o.title ? '<div class="modal-head"><h1>' + o.title + '</h1></div>' : '') +
      '<div class="modal-body"></div><div class="modal-actions"></div></div>';
    $('stage').insertBefore(ov, $('meeting'));
    fillModal(ov, o, true);
    overlayReturn.push(PK.nav.current());
    ov.classList.add('active');
    setTimeout(PK.nav.reset, 20);
    return ov;
  }
  function fillModal(ov, o, first) {
    ov.querySelector('.modal-body').innerHTML = o.body || '';
    ov.querySelector('.modal-actions').innerHTML = actionsHtml(o.actions);
    if (o.after) o.after(ov);
    if (!first) setTimeout(PK.nav.reset, 20);
  }
  PK.app.refresh = function () { refreshData(); };
  PK.app.ui = function () { return ui; };
  PK.app.refreshView = function (v) { if (ui.view === v) render(); };
  PK.app.openModal = openModal; PK.app.fillModal = fillModal; PK.app.qr = function (id, t, s) { qr(id, t, s); };
  function openOverlay(id) {
    overlayReturn.push(PK.nav.current());
    $(id).classList.add('active');
    setTimeout(PK.nav.reset, 20);
  }
  PK.app.showOverlay = function (id) { if (!$(id).classList.contains('active')) openOverlay(id); };
  PK.app.hideOverlay = function (id) {
    if (!$(id).classList.contains('active')) return;
    $(id).classList.remove('active'); if (id === 'routine') PK.routine.close();
    var back = overlayReturn.pop(); if (back && document.body.contains(back)) PK.nav.focus(back, true); else PK.nav.reset();
  };
  function closeOverlay() {
    var ovs = document.querySelectorAll('.overlay.active');
    if (!ovs.length) return false;
    var ov = ovs[ovs.length - 1];
    ov.classList.remove('active');
    if (ov.classList.contains('dyn')) ov.parentNode.removeChild(ov);
    if (ov.id === 'routine') PK.routine.close();
    if (ov.classList.contains('kn')) PK.jarvis.close();
    if (ov.id === 'recipe-layer') PK.plus.closeRecipe();
    if (ov.id === 'tm-pop') { PK.plus.stopRinging(); if (ui.view === 'timers') render(); } // Voltar = Parar
    var back = overlayReturn.pop();
    if (back && document.body.contains(back)) PK.nav.focus(back, true); else PK.nav.reset();
    return true;
  }

  /* ---------- Ajustes ---------- */
  function sceneOpts(extra) { return extra.concat(PK.scenes.all().map(function (x) { return [x.id, x.name]; })); }
  var OPTS = {
    'meeting.style': [['banner', 'Banner discreto + QR do Meet'], ['backdrop', 'Fundo para câmera'], ['onair', 'Aviso para a família']],
    'ambient.afterMin': [[5, '5 min'], [10, '10 min'], [20, '20 min'], [0, 'Nunca']],
    'ambient.darkAfterMin': [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hora'], [120, '2 horas'], [0, 'Nunca']],
    'ambient.saver': (PK.saver ? PK.saver.OPTS : [['black', 'Só relógio']]),
    'ambient.nightDark': [[true, 'Sim (22h–6h)'], [false, 'Não']],
    'meeting.auto': [[true, 'Ligado'], [false, 'Desligado']],
    'alerts.meetingLeadMin': [[2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min']],
    'alerts.snoozeMin': [[1, '1 min'], [2, '2 min'], [5, '5 min']],
    'ai.voice': [[true, 'Ligado'], [false, 'Desligado']],
    'ai.lang': [['en-GB', 'English — sotaque britânico'], ['pt-BR', 'Português']],
    'ai.listenLang': [['pt-BR', 'Português'], ['en-GB', 'English']],
    'ai.planknectVoice': [[true, 'PlanKnect (natural)'], [false, 'Voz da TV']],
    'ai.particles': [[true, 'Partículas 3D'], [false, 'Simples (TV mais leve)']],
    'home.extra': [['note', 'Recado'], ['world', 'Relógio mundial'], ['sun', 'Pôr / nascer do sol']],
    'work.hdmi': [['auto', 'Automático (1º com sinal)'], [1, 'HDMI 1'], [2, 'HDMI 2'], [3, 'HDMI 3'], [4, 'HDMI 4']],
    'ambient.weather': [[true, 'Sim'], [false, 'Não']],
    'ambient.agenda': [[true, 'Sim'], [false, 'Não']]
  };
  function opts(key) {
    if (key === 'meeting.scene') return sceneOpts([]);
    if (key === 'ai.scene') return sceneOpts([['none', 'Sem foto (só o orbe)']]);
    if (key === 'home.scene' || key === 'ambient.scene') return sceneOpts([['auto', 'Automático (hora e clima)']].concat(key === 'home.scene' ? [['dark', 'Escuro, sem foto']] : []));
    return OPTS[key];
  }
  function optLabel(key) {
    var v = S.get(key), o = opts(key).filter(function (x) { return x[0] === v; })[0];
    return o ? o[1] : String(v);
  }
  function settingsBody() {
    var live = PK.data.mode() === 'live';
    function row(label, value, attr, icon, hint) {
      return '<div class="set-row focusable" ' + attr + '><span class="set-ic">' + I.get(icon, 28) + '</span><div class="set-main"><div class="set-l">' + label + '</div>' +
        (hint ? '<div class="set-h">' + hint + '</div>' : '') + '</div><div class="set-v">' + value + '</div></div>';
    }
    return '<div class="set-group">Conexão</div>' +
      row(live ? 'Conectada ao PlanKnect' : 'Modo demonstração', live ? 'Desconectar' : 'Conectar', 'data-act="link" data-autofocus', 'tv', (state.household && state.household.name) || '') +
      row('Atualizar agora', state.fetchedAt ? 'última ' + U.hm(state.fetchedAt) : '—', 'data-act="refresh"', 'refresh') +
      (live ? (function () {
        var c = (state.settings && state.settings.content) || {}, keys = Object.keys(c);
        if (!keys.length) return '';
        var NAMES = { events: 'Agenda', tasks: 'Tarefas', chores: 'Missões', lists: 'Listas', notes: 'Recados', meals: 'Refeições', members: 'Membros', projects: 'Projetos', deals: 'Deals', photos: 'Fotos', cameras: 'Câmeras', meetingLive: 'Reunião ao vivo', meetingInsights: 'Insights de reunião', meetingRecordings: 'Gravações', taskWrite: 'Editar tarefas', choreWrite: 'Editar missões', listWrite: 'Editar listas', noteWrite: 'Escrever recados' };
        return '<div class="set-group">O que esta TV pode ver e fazer</div><div class="set-perm">' + keys.map(function (k) { return '<span class="' + (c[k] ? 'on' : 'off') + '">' + (c[k] ? '✓ ' : '✕ ') + U.esc(NAMES[k] || k) + '</span>'; }).join('') +
          '</div><div class="set-h" style="margin:6px 0 14px">Para mudar: planknect.com › Configurações › Dispositivos › esta TV (<span class="mono">' + PK.api.deviceId() + '</span>) › Conteúdo e conexões</div>';
      })() : '') +
      '<div class="set-group">Modo reunião</div>' +
      row('Entrar sozinho nas reuniões', optLabel('meeting.auto'), 'data-set="meeting.auto"', 'video', 'Reuniões com vídeo na sua agenda') +
      row('Ao entrar, mostrar', optLabel('meeting.style'), 'data-set="meeting.style"', 'camera') +
      row('Cenário', optLabel('meeting.scene'), 'data-set="meeting.scene"', 'sparkle') +
      row('Testar agora', '▶', 'data-act="meeting-now"', 'play') +
      '<div class="set-group">Avisos</div>' +
      row('Avisar reunião com antecedência de', optLabel('alerts.meetingLeadMin'), 'data-set="alerts.meetingLeadMin"', 'video', 'Timer ao vivo, Adiar e Fechar') +
      row('Botão Adiar', optLabel('alerts.snoozeMin'), 'data-set="alerts.snoozeMin"', 'refresh') +
      row('Simular aviso de reunião', '▶', 'data-act="sim-meeting"', 'play', 'Cria uma reunião que começa em 3 min') +
      row('Simular campainha', '▶', 'data-act="sim-door"', 'home') +
      row('Simular máquina de lavar terminou', '▶', 'data-act="sim-washer"', 'shirt') +
      row('Simular “Jantar pronto!”', '▶', 'data-act="sim-dinner"', 'chef') +
      '<div class="set-group">Rotinas</div>' +
      row('Rotina da manhã', (C.routines.morning.start + '–' + C.routines.morning.until), 'data-act="routine-morning"', 'sun2', 'Abrir agora · ' + U.esc(C.routines.morning.label)) +
      row('Rotina da noite', (C.routines.bedtime.start + '–' + C.routines.bedtime.until), 'data-act="routine-bedtime"', 'moon', 'Abrir agora · ' + U.esc(C.routines.bedtime.label)) +
      '<div class="set-group">Alfred</div>' +
      row('Abrir o Alfred agora', '▶', 'data-act="knect"', 'sparkle', 'Também abre sozinho de manhã (6h–11h) e à noite (18h–21h)') +
      row('Alfred fala em voz alta', optLabel('ai.voice'), 'data-set="ai.voice"', 'mic') +
      row('Alfred responde em', optLabel('ai.lang'), 'data-set="ai.lang"', 'sparkle', 'Voz britânica, educada e simpática') +
      row('Você fala com o Alfred em', optLabel('ai.listenLang'), 'data-set="ai.listenLang"', 'mic') +
      row('Voz do Alfred', optLabel('ai.planknectVoice'), 'data-set="ai.planknectVoice"', 'sparkle', 'PlanKnect: a mesma voz natural do site · cai na voz da TV se não houver') +
      row('Visual do Alfred', optLabel('ai.particles'), 'data-set="ai.particles"', 'sparkle') +
      row('Fundo do Alfred', optLabel('ai.scene'), 'data-set="ai.scene"', 'home', 'Foto ou vídeo atrás do Alfred') +
      row('Testar voz do Alfred', '▶', 'data-act="voice-test"', 'play', 'Fala uma frase e mostra o resultado') +
      '<div class="set-group">Computador na TV</div>' +
      row('Computador está no', optLabel('work.hdmi'), 'data-set="work.hdmi"', 'monitor', 'Entrada HDMI usada no modo Computador') +
      row('Abrir o modo Computador', '▶', 'data-act="workmode"', 'briefcase', 'HDMI numa janela com o PlanKnect em volta') +
      '<div class="set-group">Voz</div>' +
      row('Testar microfone do controle', '▶', 'data-act="mic-test"', 'mic', 'Ditado do teclado da LG, voz no app e microfone USB') +
      '<div class="set-group">Tela</div>' +
      row('Fundo da tela inicial', optLabel('home.scene'), 'data-set="home.scene"', 'home', 'Fotos e vídeos reais em loop') +
      row('Cartão extra na Início', optLabel('home.extra'), 'data-set="home.extra"', 'sun', 'Recado, relógio mundial ou pôr do sol') +
      row('Cenário do modo ambiente', optLabel('ambient.scene'), 'data-set="ambient.scene"', 'sparkle') +
      row('Modo ambiente depois de', optLabel('ambient.afterMin'), 'data-set="ambient.afterMin"', 'moon', 'Relógio e cenário quando ninguém usa a TV') +
      row('Proteção de tela: escurecer depois de', optLabel('ambient.darkAfterMin'), 'data-set="ambient.darkAfterMin"', 'moon', 'Tela preta com relógio pequeno que flutua — evita marcas na tela') +
      row('Protetor de tela', optLabel('ambient.saver'), 'data-set="ambient.saver"', 'sparkle', 'Vídeo ou animação em movimento + relógio que flutua') +
      row('Escurecer direto de madrugada', optLabel('ambient.nightDark'), 'data-set="ambient.nightDark"', 'moon') +
      row('Testar modo ambiente', '▶', 'data-act="ambient-now"', 'play') +
      row('Ver protetor de tela agora', '▶', 'data-act="saver-now"', 'play') +
      row('Moldura: mostrar clima', optLabel('ambient.weather'), 'data-set="ambient.weather"', 'sun') +
      row('Moldura: mostrar agenda de cada pessoa', optLabel('ambient.agenda'), 'data-set="ambient.agenda"', 'users') +
      (!live ? row('Restaurar dados do demo', '↺', 'data-act="reset-demo"', 'trash') : '') +
      '<div class="set-foot">ID da TV: <span class="mono">' + PK.api.deviceId() + '</span></div>';
  }
  function openSettings() { openModal({ title: I.get('gear', 40) + ' Ajustes', body: settingsBody(), actions: [{ label: 'Fechar', act: 'close', ghost: true }] }, 'settings'); }
  function cycleSetting(el) {
    var key = el.getAttribute('data-set'), o = opts(key), v = S.get(key);
    var i = 0; o.forEach(function (x, j) { if (x[0] === v) i = j; });
    S.set(key, o[(i + 1) % o.length][0]);
    el.querySelector('.set-v').textContent = optLabel(key);
    if (key === 'home.scene') mountHomeBg(true);
  }

  /* ================= VOZ ================= */
  /* ---------- Alfred: voz e comandos ---------- */
  function openVoice() { PK.jarvis.listen(); }
  // Executa o comando no PlanKnect (ou no demo) e aplica as ações. Ações que trocam de tela esperam o Alfred terminar a frase.
  function alfredCommand(text, o) {
    var mi = PK.music && PK.music.intent(text); if (mi) return mi; // música: responde na hora, sem esperar a IA
    return PK.data.assistant(text, { state: state, view: ui.view, lang: o && o.lang, meeting_id: o && o.meeting_id }).then(function (r) {
      var acts = r.actions || [], moves = acts.some(function (x) { return /navigate|meeting|work|launch|camera/.test(x.type); });
      if (PK.workmode.active()) { applyActions(acts.filter(function (x) { return !/navigate|launch|camera/.test(x.type); })); return r; } // no modo Computador, não troca de tela
      if (r.needs_confirmation || (r.proposals && r.proposals.length)) { applyActions(acts.filter(function (x) { return x.type === 'refresh'; })); return r; } // espera o Confirmar
      if (!moves) applyActions(acts);
      else setTimeout(function () { PK.jarvis.close(); applyActions(acts); }, 2600);
      return r;
    });
  }
  function applyActions(actions) {
    var needRefresh = actions.some(function (a) { return a.type === 'refresh'; });
    var go = function () {
      actions.forEach(function (a) {
        if (a.type === 'music' && PK.music) { PK.music.act(a); return; }
        if (a.type === 'navigate') {
          if (a.view === 'agenda') { if (a.mode) ui.agenda.mode = a.mode; if (a.member) ui.agenda.members = a.member === 'all' ? [] : [a.member]; if (a.familyOnly !== undefined) ui.agenda.familyOnly = a.familyOnly; }
          if (a.view === 'lists' && a.list) ui.list = a.list;
          setView(a.view, true);
        }
        if (a.type === 'meeting') { closeOverlay(); M.meeting.toggle(a.on, state); }
        if (a.type === 'launch') PK.tv.launch(a.app, a.name);
        if (a.type === 'camera') PK.camera.open(a.deviceId || a.device_id, a.title || 'Câmera');
        if (a.type === 'navigate' && a.camera) PK.camera.open(a.camera, 'Câmera');
        if (a.type === 'alert') PK.alerts.push({ kind: 'family', icon: 'note', label: 'ALFRED', title: a.title, body: a.body, ttl: 5 });
        if (a.type === 'meeting' && a.meetingId && a.on === undefined) PK.details.open('event', a.meetingId);
        if (a.type === 'work') { while (closeOverlay()) {} PK.workmode.open(function () { return state; }); }
        if (a.type === 'brief') { closeOverlay(); PK.jarvis.open(); }
        if (a.type === 'celebrate') setTimeout(function () { var k = document.querySelector('[data-kid="' + a.member + '"]'); if (k) confetti(k, 70); }, 250);
      });
    };
    if (needRefresh) refreshData().then(go); else go();
  }

  /* ---------- confete ---------- */
  var CONF_COLORS = ['#fbbf24', '#f472b6', '#38bdf8', '#34d399', '#a78bfa', '#fb923c'];
  function confetti(el, n) {
    var st = $('stage').getBoundingClientRect(), s = st.width / 1920, r = el.getBoundingClientRect();
    var cx = (r.left - st.left + r.width / 2) / s, cy = (r.top - st.top + r.height / 2) / s, fx = $('fx');
    for (var i = 0; i < (n || 34); i++) {
      var p = document.createElement('i');
      var ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260;
      p.className = 'conf' + (i % 3 === 0 ? ' round' : '');
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = CONF_COLORS[i % CONF_COLORS.length];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', (Math.sin(ang) * dist - 120) + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      fx.appendChild(p);
      (function (q) { setTimeout(function () { q.parentNode && q.parentNode.removeChild(q); }, 1300); })(p);
    }
  }

  /* ================= CLIQUES (OK = click) ================= */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-pt],[data-pn],[data-pq],[data-nm],[data-pm],[data-rc],[data-tdo],[data-noteby],[data-seenby],[data-nn],[data-seen2],[data-tf],[data-vote],[data-dev],[data-open],[data-subtask],[data-tview],[data-dview],[data-wo],[data-view],[data-app],[data-goto],[data-day],[data-project],[data-chore],[data-ag],[data-list],[data-item],[data-set],[data-say],[data-act]') : null;
    if (!t) return;
    var a = function (n) { return t.getAttribute(n); };
    // ---- recursos vindos do nest-hub ----
    if (a('data-pt')) { PK.plus.timerCmd(a('data-pt')); render(); return; }
    if (a('data-pn')) {
      var pn = a('data-pn'), ci2 = pn.indexOf(':');
      if (pn === 'new') { var cc = (state.settings && state.settings.content) || {}; if (PK.data.mode() === 'live' && cc.noteWrite === false) { PK.toast('Ative “Escrever recados” para esta TV em planknect.com › Configurações › Dispositivos'); return; } PK.plus.newNoteModal(state); }
      else if (pn.slice(0, ci2) === 'seen') PK.plus.seenModal(state, pn.slice(ci2 + 1));
      else if (pn.slice(0, ci2) === 'text') { closeOverlay(); PK.plus.whoModal(state, 'Quem está escrevendo?', 'noteby', pn.slice(ci2 + 1)); }
      return;
    }
    if (a('data-tf')) { // filtro de tarefas: liga/desliga (dentro do modal ou no chip ✕ do painel)
      var tp2 = a('data-tf'), ix2 = tp2.indexOf(':'), tk = tp2.slice(0, ix2), tv2 = tp2.slice(ix2 + 1);
      ui.tf = ui.tf || {}; ui.tf[tk] = ui.tf[tk] || []; var at = ui.tf[tk].indexOf(tv2); if (at >= 0) ui.tf[tk].splice(at, 1); else ui.tf[tk].push(tv2);
      var mb = document.querySelector('.overlay.dyn.tf-ov .modal-body');
      if (mb) { mb.innerHTML = V.tfModalBody(state, ui.tf); PK.nav.focus(mb.querySelector('[data-tf="' + tp2 + '"]'), true); }
      var pnl2 = $('prio-panel'); if (pnl2) pnl2.innerHTML = V.prioPanel(state, ui.project, ui.tview, ui.tf);
      if (!mb) PK.nav.focus(document.querySelector('#prio-panel .tf-open'), true);
      return;
    }
    if (a('data-nn')) { PK.plus.nnCmd(a('data-nn')); return; }
    if (a('data-seen2')) { PK.plus.seenToggle(a('data-seen2')); return; }
    if (a('data-seenby')) { closeOverlay(); PK.data.setNoteSeen(a('data-seenby'), a('data-m')).then(refreshData).then(function () { PK.toast('Marcado como visto'); }).catch(function (e) { PK.toast(PK.writeErr(e)); }); return; }
    if (a('data-noteby')) { var txt = a('data-noteby'); closeOverlay(); PK.data.addNote(txt, a('data-m')).then(function () { return PK.data.broadcast({ kind: 'family', icon: 'note', title: txt, ttl: 10 }).catch(function () {}); }).then(refreshData).then(function () { PK.toast('Recado enviado'); }).catch(function (e) { PK.toast(PK.writeErr(e)); }); return; }
    if (a('data-pq')) { var pq = a('data-pq').split('|'); t.classList.add('added'); t.disabled = true; PK.data.addListItems(pq[0], [pq[1]]).then(refreshData).then(function () { PK.toast(U.esc(pq[1]) + ' na lista'); }).catch(function (e) { PK.toast(PK.writeErr(e)); }); return; }
    if (a('data-nm')) { var nmp = a('data-nm').split(':'); PK.plus.nm[nmp[0]] = nmp[1] === 'null' ? null : (nmp[0] === 'points' ? +nmp[1] : nmp[1]); closeOverlay(); PK.plus.missionModal(state); return; }
    if (a('data-pm')) { var mt = PK.plus.MISSIONS[+a('data-pm')], nmv = PK.plus.nm; closeOverlay(); PK.data.addChore({ member: nmv.kid, familyMemberId: (state.members.filter(function (m) { return m.id === nmv.kid; })[0] || {}).familyMemberId, organizationId: state.household && state.household.id, title: mt[0], icon: mt[1], period: mt[2], points: nmv.points || mt[3], repeat: nmv.repeat }).then(refreshData).then(function () { PK.toast('Missão “' + U.esc(mt[0]) + '” criada'); }).catch(function (e) { PK.toast(PK.writeErr(e)); }); return; }
    if (a('data-rc')) { PK.plus.recipeCmd(a('data-rc')); return; }
    if (a('data-tdo')) {
      var tp = a('data-tdo').split(':'), patchT = tp[1] === 'done' ? { status: 'done' } : tp[1] === 'progress' ? { status: 'in_progress' } : { due: U.addDays(U.startOfDay(new Date()), tp[1] === 'week' ? 7 : 1).toISOString().slice(0, 10) };
      closeOverlay(); PK.data.updateTask(tp[0], patchT).then(refreshData).then(function () { PK.toast(patchT.status === 'done' ? 'Tarefa concluída' : patchT.status ? 'Tarefa em andamento' : 'Tarefa adiada'); }).catch(function (e) { PK.toast(PK.writeErr(e)); }); return;
    }
    if (a('data-vote')) { chooseVoter(a('data-vote')); return; }
    if (a('data-dev')) { deviceCmd(a('data-dev')); return; }
    if (a('data-open')) { var o = a('data-open'), ci = o.indexOf(':'); PK.details.open(o.slice(0, ci), o.slice(ci + 1)); return; }
    if (a('data-subtask')) { toggleSubtask(t); return; }
    if (a('data-wo')) { var wr = PK.world.cmd(a('data-wo')); if (wr === 'render' || wr === 'render-later') { if (ui.view === 'weather') { render(true); if (wr === 'render') PK.nav.focus(document.querySelector('[data-wo="' + a('data-wo') + '"]'), true); } } return; }
    if (a('data-view')) { if (a('data-wo-go')) PK.world.setSub(a('data-wo-go')); setView(a('data-view'), true); PK.nav.focus(t, true); return; }
    if (a('data-app')) { PK.tv.launch(a('data-app'), a('data-name')); return; }
    if (a('data-goto')) { setView(a('data-goto')); return; }
    if (a('data-day') !== null) { var d = V.dayDetail(state, +a('data-day'), ui.agenda); openModal({ title: d.title, body: d.body, wide: true, actions: [{ label: 'Fechar', act: 'close', ghost: true }] }); return; }
    if (a('data-dview')) { PK.deals.setView(a('data-dview')); render(); PK.nav.focus(document.querySelector('[data-dview="' + a('data-dview') + '"]'), true); return; }
    if (a('data-tview')) { ui.tview = a('data-tview'); var pnl = $('prio-panel'); pnl.innerHTML = V.prioPanel(state, ui.project, ui.tview); pnl.scrollTop = 0; PK.nav.focus(pnl.querySelector('[data-tview="' + ui.tview + '"]'), true); return; }
    if (a('data-project')) { var pj = a('data-project'); selectProject(pj); var first = $('prio-panel') && $('prio-panel').querySelector('.task-row, .pp-detail'); if (first) PK.nav.focus(first); return; } // OK no projeto: tarefas no painel da direita
    if (a('data-chore')) { toggleChore(t); return; }
    if (a('data-ag')) { agendaControl(a('data-ag')); return; }
    if (a('data-list')) { selectList(a('data-list')); return; }
    if (a('data-item')) { toggleItem(t); return; }
    if (a('data-set')) { cycleSetting(t); return; }
    var act = a('data-act');
    if (act === 'login') showPairPane('login');
    if (act === 'qr') showPairPane('qr');
    if (act === 'do-login') doLogin();
    if (act === 'demo') enterDemo();
    if (act === 'retry') startPairing();
    if (act === 'settings') openSettings();
    if (act === 'close') closeOverlay();
    if (act === 'voice') openVoice();
    if (act === 'meeting') M.meeting.toggle(undefined, state);
    if (act === 'knect') PK.jarvis.open();
    if (act === 'workmode') { while (closeOverlay()) {} PK.workmode.open(function () { return state; }); }
    if (act === 'refresh') { closeOverlay(); refreshData(); refreshWeather(); PK.toast('Atualizando…'); }
    if (act === 'voice-test') {
      PK.voice.reset(); PK.toast('Alfred vai falar…');
      var vt0 = PK.voice.debug().played;
      PK.voice.speak('Good evening. This is Alfred, testing the voice.', PK.settings.get('ai.lang') || 'en-GB', { silent: function () { PK.toast('Sem voz: o aparelho não tem voz própria e a do PlanKnect falhou'); } });
      setTimeout(function () { var d = PK.voice.debug(); PK.toast((d.played > vt0 ? '✓ Áudio tocou' : '✗ Não tocou') + ' · voz ' + (d.cloud ? 'PlanKnect' : 'da TV') + (d.lastErr ? ' · ' + U.esc(d.lastErr) : ''), 8000); }, 7000);
      return;
    }
    if (act === 'tf-open') { var tov = openModal({ title: I.get('sliders', 36) + ' Filtrar tarefas', body: V.tfModalBody(state, ui.tf), actions: [{ label: 'Pronto', act: 'close' }, { label: 'Limpar tudo', act: 'tf-clear', ghost: true }] }, 'detail wide'); tov.classList.add('tf-ov'); return; }
    if (act === 'tf-clear') { ui.tf = {}; var tmb = document.querySelector('.overlay.dyn.tf-ov .modal-body'); if (tmb) tmb.innerHTML = V.tfModalBody(state, ui.tf); var pnl3 = $('prio-panel'); if (pnl3) pnl3.innerHTML = V.prioPanel(state, ui.project, ui.tview, ui.tf); if (!tmb) PK.nav.focus(document.querySelector('#prio-panel .tf-open'), true); return; }
    if (act === 'nn-cancel') { PK.plus.nnCancel(); closeOverlay(); return; }
    if (act === 'nn-send') {
      var note = PK.plus.nnSend(); if (!note) return; closeOverlay();
      PK.data.addNote(note).then(function () { return PK.data.broadcast({ kind: 'family', icon: 'note', title: note.text, ttl: 10 }).catch(function () {}); }).then(refreshData).then(function () { PK.toast('Recado enviado'); }).catch(function (e) { PK.toast(PK.writeErr(e)); });
      return;
    }
    if (act === 'seen-ok') {
      var sn = PK.plus.seenTake(); closeOverlay(); if (!sn || !sn.ids.length) return;
      Promise.all(sn.ids.map(function (id) { return PK.data.setNoteSeen(sn.id, id); })).then(refreshData).then(function () { PK.toast('Marcado como visto (' + sn.ids.length + ')'); }).catch(function (e) { PK.toast(PK.writeErr(e)); });
      return;
    }
    if (act === 'meeting-now') { closeOverlay(); M.meeting.toggle(true, state); }
    if (act === 'ambient-now') { closeOverlay(); M.ambient.enter(state); }
    if (act === 'music-open') { var mo = openModal({ title: I.get('music', 36) + ' Música', body: '<div id="mu-host"></div>', actions: [{ label: 'Fechar', act: 'close', ghost: true }] }, 'wide mu-modal'); PK.music.mount(mo.querySelector('#mu-host')); }
    if (act === 'saver-now') { closeOverlay(); M.ambient.saver(state); }
    if (act === 'reset-demo') { PK.mock.reset(); closeOverlay(); refreshData(); PK.toast('Demo restaurado'); }
    var arg = a('data-arg');
    var wItem = function () { return (state.watch.items || []).filter(function (x) { return x.id === arg; })[0]; };
    if (act === 'play' && wItem()) PK.details.play(wItem());
    if (act === 'recording') { closeOverlay(); PK.details.recording(arg); }
    if (act === 'quick-add-list') PK.plus.quickAddModal(state, a('data-list-id') || ui.list);
    if (act === 'mission-new') PK.plus.missionModal(state);
    if (act === 'cook') { closeOverlay(); PK.data.detail('meal', arg).then(function (d) { if (d.steps && d.steps.length) PK.plus.openRecipe(arg, d.steps); else PK.toast('Sem receita cadastrada'); }); }
    if (act === 'trailer' && wItem()) PK.details.trailer(wItem());
    if (act === 'follow') {
      var on = arg.charAt(0) === '+', name = arg.slice(1);
      PK.data.follow(name, on).then(function () { closeOverlay(); refreshData(); PK.toast(on ? 'Seguindo <b>' + U.esc(name) + '</b> — aviso quando sair episódio novo' : 'Deixou de seguir ' + U.esc(name)); });
    }
    if (act === 'vote') {
      var vp = arg.split('|');
      PK.data.vote(vp[0], vp[1]).then(function () { closeOverlay(); refreshData(); PK.toast('Voto registrado'); });
    }
    if (act === 'routine-morning' || act === 'routine-bedtime') { while (closeOverlay()) {} PK.routine.open(act === 'routine-morning' ? 'morning' : 'bedtime', state); }
    if (act === 'sim-meeting') { while (closeOverlay()) {} simulateMeeting(); }
    if (act === 'sim-door') { while (closeOverlay()) {} PK.alerts.push({ kind: 'door', label: 'CAMPAINHA', title: 'Tem alguém na porta', body: 'Câmera da entrada · agora', icon: 'home', ttl: 3, urgent: true }); }
    if (act === 'sim-washer') { while (closeOverlay()) {} PK.alerts.push({ kind: 'device', icon: 'shirt', title: 'Lava e seca terminou', body: 'Lavanderia · Algodão 40°', ttl: 10 }); }
    if (act === 'sim-dinner') { while (closeOverlay()) {} PK.data.broadcast({ kind: 'family', icon: 'chef', label: 'RECADO DA ELIANE', title: 'Jantar pronto!', body: 'Todo mundo para a mesa', ttl: 10 }); }
    if (act === 'mic-test') { while (closeOverlay()) {} micTest(); }
    if (act === 'toggle-done') { PK.listShowDone = !PK.listShowDone; var lnow = state.lists.filter(function (x) { return x.id === (ui.list || (state.lists[0] || {}).id); })[0]; if (lnow) $('ls-panel').innerHTML = V.listPanel(state, lnow); }
    if (act === 'goto-lists') { while (closeOverlay()) {} ui.list = a('data-arg'); setView('lists'); }
    if (act === 'add-ingredients') {
      var ing = (a('data-arg') || '').split('|').filter(Boolean);
      PK.data.addListItems(state.lists[0].id, ing).then(function () { closeOverlay(); refreshData(); PK.toast(I.get('cart', 24) + ' ' + ing.length + ' ingredientes adicionados à lista'); });
    }
    if (act === 'clear-done') { PK.data.clearDone(a('data-list-id')).then(refreshData); }
    if (act === 'link') {
      closeOverlay();
      if (PK.data.mode() === 'live') PK.api.logout();
      PK.data.setMode('unlinked');
      clearInterval(timers.data); clearInterval(timers.weather);
      startPairing();
    }
  });

  // QR da lista: link público e único (sem login) quando o PlanKnect oferece; senão, o link normal
  function shareQr(listId) {
    if (!listId) return;
    PK.data.shareUrl(listId).then(function (sh) {
      qr('list-qr', sh.url, 150);
      var t = document.querySelector('.ls-qr b'), sub = document.querySelector('.ls-qr span');
      if (t) t.textContent = sh.public ? 'Lista compartilhada' : 'Leve a lista no celular';
      if (sub) sub.textContent = sh.public ? 'Qualquer pessoa com este QR vê e marca até ' + U.shortDate(new Date(sh.expires)) : 'Aponte a câmera para abrir no mercado';
    });
  }
  function chooseVoter(itemId) {
    var w = (state.watch.items || []).filter(function (x) { return x.id === itemId; })[0];
    openModal({ title: 'Quem está votando em ' + U.esc(w ? w.title : '') + '?', body: '<div class="voters">' + state.members.map(function (m, i) {
      return '<button class="voter focusable" data-act="vote" data-arg="' + m.id + '|' + U.esc(itemId) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + V.av(m, 96) + '<span>' + U.esc(m.name) + '</span></button>';
    }).join('') + '</div>', actions: [{ label: 'Cancelar', act: 'close', ghost: true }] }, 'settings');
  }
  function deviceCmd(spec) {
    var p = spec.split(':'), d = state.devices.filter(function (x) { return x.id === p[0]; })[0]; if (!d) return;
    var cmd = p[1] === 'power' ? { power: !d.power } : p[1] === 'temp' ? { target: Math.max(16, Math.min(30, d.target + +p[2])) } : p[1] === 'start' ? { start: true } : { dock: true };
    var go = C.agentUrl ? fetch(C.agentUrl + '/devices/' + d.id + '/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) }) : PK.data.deviceControl(d.id, cmd);
    go.then(function () { return refreshData(); }).then(function () {
      var b = document.querySelector('[data-dev="' + spec + '"]') || document.querySelector('[data-dev^="' + d.id + ':"]'); if (b) PK.nav.focus(b, true);
    }).catch(function () { PK.toast('Não consegui falar com o aparelho'); });
  }
  // Demo: cria uma reunião que começa daqui a 3 min para ver o aviso com timer
  function simulateMeeting() {
    var st = new Date(Date.now() + 3 * 60000); st.setSeconds(0, 0);
    state.events.unshift({ id: 'sim-' + Date.now(), title: 'Call com fornecedor (teste)', type: 'meeting', start: st, end: new Date(st.getTime() + 30 * 60000),
      allDay: false, members: [C.owner], video: 'meet', location: '' });
    PK.alerts.tick(state);
  }
  // Teste do microfone: ditado do teclado da LG, Web Speech e microfone USB
  function micTest() {
    var hasSR = PK.assistant.canListen();
    var ov = openModal({ title: I.get('mic', 40) + ' Teste do microfone', body:
      '<p class="mt-p">1. Com o campo abaixo selecionado, <b>aperte e segure o botão de microfone do controle</b> e diga: “adiciona leite na lista”.</p>' +
      '<input id="mic-input" class="focusable mic-input" type="text" placeholder="O que você falar aparece aqui…" data-autofocus>' +
      '<div class="mic-res" id="mic-res"></div>' +
      '<div class="dt-sec">Diagnóstico</div><div class="mic-diag">' +
      '<div><b>Reconhecimento de voz no app</b><span class="rsvp ' + (hasSR ? 'ok">disponível' : 'pending">indisponível') + '</span></div>' +
      '<div><b>Microfone USB / câmera</b><span class="rsvp pending" id="mic-usb">verificando…</span></div>' +
      '<div><b>Câmera</b><span class="rsvp pending" id="cam-st">verificando…</span></div>' +
      '<div><b>Plataforma</b><span class="rsvp ' + (PK.tv.isWebOS ? 'ok">LG webOS' : PK.tv.isTizen ? 'ok">Samsung Tizen' : 'pending">navegador (não é a TV)') + '</span></div></div>' +
      '<video id="cam-prev" class="cam-prev" autoplay muted playsinline></video>',
      actions: [{ label: 'Fechar', act: 'close', ghost: true }] }, 'settings');
    var inp = ov.querySelector('#mic-input'), res = ov.querySelector('#mic-res');
    var check = function () {
      if (!inp.value.trim()) return;
      res.innerHTML = '<span class="rsvp ok">funcionou</span> O ditado do controle chegou ao app: “' + U.esc(inp.value) + '”. Enviando para o assistente…';
      PK.data.assistant(inp.value, { state: state, view: ui.view }).then(function (r) { res.innerHTML += '<div class="v-reply show">' + U.esc(r.reply) + '</div>'; refreshData(); });
      inp.value = '';
    };
    inp.addEventListener('change', check);
    inp.addEventListener('keydown', function (e) { if (e.keyCode === 13) check(); });
    var usb = ov.querySelector('#mic-usb');
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var n = ds.filter(function (d) { return d.kind === 'audioinput'; }).length;
      usb.className = 'rsvp ' + (n ? 'ok' : 'pending'); usb.textContent = n ? n + ' encontrado(s)' : 'nenhum';
    }).catch(function () { usb.textContent = 'sem acesso'; });
    else usb.textContent = 'não suportado';
    // Prévia da câmera + microfone (para chamadas e voz direto na TV)
    var cs = ov.querySelector('#cam-st'), pv = ov.querySelector('#cam-prev');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (stream) {
      pv.srcObject = stream; pv.style.display = 'block'; cs.className = 'rsvp ok'; cs.textContent = 'funcionando';
      var stop = function () { stream.getTracks().forEach(function (t) { t.stop(); }); };
      var obs = setInterval(function () { if (!document.body.contains(pv)) { stop(); clearInterval(obs); } }, 1000);
    }).catch(function (e) { cs.textContent = 'sem acesso (' + e.name + ')'; });
    else cs.textContent = 'não suportado';
  }
  function agendaControl(v) {
    var p = v.split(':');
    if (p[0] === 'mode') { ui.agenda.mode = p[1]; ui.agenda.week = 0; }
    if (p[0] === 'week') { ui.agenda.mode = 'week'; ui.agenda.week = +p[1]; }
    if (p[0] === 'member') { // seleção múltipla: OK liga/desliga a pessoa; Todos limpa
      ui.agenda.members = ui.agenda.members || [];
      if (p[1] === 'all') ui.agenda.members = [];
      else { var ix = ui.agenda.members.indexOf(p[1]); if (ix >= 0) ui.agenda.members.splice(ix, 1); else ui.agenda.members.push(p[1]); }
      ui.agenda.member = 'all';
    }
    if (p[0] === 'family') ui.agenda.familyOnly = !ui.agenda.familyOnly;
    var el = $('view-agenda');
    el.innerHTML = V.agenda(state, ui.agenda);
    PK.nav.focus(el.querySelector('[data-ag="' + v + '"]') || el.querySelector('.focusable'), true);
  }
  document.addEventListener('pkfocus', function (e) {
    var p = e.target.getAttribute && e.target.getAttribute('data-project');
    if (p && p !== ui.project) selectProject(p);
  });
  function selectProject(pid) {
    ui.project = pid;
    each('.proj', function (el) { el.classList.toggle('selected', el.getAttribute('data-project') === pid); });
    var panel = $('prio-panel'); if (panel) { panel.innerHTML = V.prioPanel(state, pid, ui.tview); panel.scrollTop = 0; }
  }
  function selectList(id) {
    ui.list = id;
    each('.ls-item', function (el) { el.classList.toggle('selected', el.getAttribute('data-list') === id); });
    var l = state.lists.filter(function (x) { return x.id === id; })[0];
    if (l) { $('ls-panel').innerHTML = V.listPanel(state, l); shareQr(id); }
    var first = $('ls-panel').querySelector('.li'); if (first) PK.nav.focus(first);
  }
  function toggleItem(el) {
    var lid = el.getAttribute('data-list-id'), iid = el.getAttribute('data-item');
    var l = state.lists.filter(function (x) { return x.id === lid; })[0]; if (!l) return;
    var it = l.items.filter(function (x) { return x.id === iid; })[0]; if (!it) return;
    it.done = !it.done;
    el.classList.toggle('done', it.done);
    if (it.done) { el.classList.add('leaving'); setTimeout(function () { if (ui.view === 'lists') { var ln = state.lists.filter(function (x) { return x.id === lid; })[0]; if (ln) { $('ls-panel').innerHTML = V.listPanel(state, ln); PK.nav.reset(); } } }, 1800); }
    PK.data.setListItem(lid, iid, it.done).catch(function () { it.done = !it.done; el.classList.toggle('done', it.done); PK.toast('Não consegui salvar'); });
  }
  function toggleSubtask(el) {
    var p = el.getAttribute('data-subtask').split('|'), done = !el.classList.contains('done');
    el.classList.toggle('done', done);
    var box = el.parentNode, all = box.querySelectorAll('.dt-check'), dn = box.querySelectorAll('.dt-check.done').length;
    var bar = box.querySelector('.bar.sub i'); if (bar) bar.style.width = Math.round(dn / all.length * 100) + '%';
    PK.data.setSubtask(p[0], p[1], done).catch(function () { el.classList.toggle('done', !done); PK.toast('Não consegui salvar'); });
  }
  function toggleChore(el) {
    var id = el.getAttribute('data-chore');
    var c = state.chores.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    var live = PK.data.mode() === 'live';
    if (live && c.pending) { PK.toast('Já enviada — aguardando um adulto aprovar no PlanKnect'); return; }
    if (live && c.done) { PK.toast('Missão já aprovada ⭐'); return; }
    if (live) { // envia para aprovação (não marca como feita nem dá pontos)
      el.classList.add('pending', 'pop'); confetti(el, 24);
      PK.data.setChore(id, true).then(function (r) { c.pending = true; PK.toast('Muito bem! Enviada para aprovação ⭐'); setTimeout(refreshData, 700); })
        .catch(function (e) { el.classList.remove('pending'); PK.toast(PK.writeErr(e)); });
      return;
    }
    c.done = !c.done;
    el.classList.toggle('done', c.done);
    if (c.done) { el.classList.add('pop'); confetti(el, 30); }
    PK.data.setChore(id, c.done).then(function () {
      setTimeout(function () { refreshData().then(function () {
        var k = c.done && document.querySelector('.kid-card.all-done[data-kid="' + c.member + '"]');
        if (k) confetti(k, 80);
      }); }, 650);
    }).catch(function () { c.done = !c.done; render(); PK.toast('Não consegui salvar — tente de novo'); });
  }

  /* ================= TECLAS ================= */
  var COLOR_VIEWS = { red: 'home', green: 'agenda', yellow: 'chores', blue: 'lists' };
  document.addEventListener('keydown', function () { M.ambient.input(); }, true);
  document.addEventListener('mousemove', function () { M.ambient.input(); });
  PK.nav.setHandler(function (k, cur) {
    var main = $('screen-main').classList.contains('active');
    if (M.meeting.active()) { if (M.meeting.key(k) !== false) return true; return false; }
    if (PK.workmode.active() && !document.querySelector('.overlay.active')) { if (PK.workmode.key(k) !== false) return true; return false; }
    if (PK.camera.active()) { if (k === 'back') PK.camera.close(); return true; }
    if (PK.player.active()) { if (k === 'back') PK.player.close(); else PK.player.key(k); return true; }
    if (M.ambient.active()) { M.ambient.exit(); return true; }
    var al = document.querySelector('#alerts.has-focus');
    if (al && k === 'back' && !document.querySelector('.overlay.dyn.active')) { var top = al.querySelector('[data-alert]'); if (top) PK.alerts.dismiss(top.getAttribute('data-alert')); return true; }
    if (k === 'ok' && cur && cur.classList.contains('al-in') && cur.value) { var sb = document.querySelector('.al-send'); if (sb) sb.click(); return true; }
    if (k === 'back') {
      if (closeOverlay()) return true;
      if ($('screen-pair').classList.contains('active')) { if (!$('pair-login').classList.contains('hidden')) showPairPane('qr'); return true; }
      if (ui.view !== 'home') { setView('home'); return true; }
      return true;
    }
    if (!main) return false;
    if (COLOR_VIEWS[k]) { while (closeOverlay()) {} setView(COLOR_VIEWS[k]); return true; }
    if (k === 'voice') { openVoice(); return true; }
    if (k === 'meet') { M.meeting.toggle(undefined, state); return true; }
    if (k === 'ambient') { M.ambient.enter(state); return true; }
    if (k === 'jarvis') { PK.jarvis.open(); return true; }
    if (k === 'work') { while (closeOverlay()) {} PK.workmode.open(function () { return state; }); return true; }
    return false;
  });

  /* ---------- parâmetros de abertura (agente local, serviço, toasts) ---------- */
  function handleLaunch(p) {
    if (!p) return;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return; } }
    if (!$('screen-main').classList.contains('active')) return;
    if (p.view) setView(p.view);
    if (p.routine) PK.routine.open(p.routine, state);
    if (p.open) { var ci = p.open.indexOf(':'); PK.details.open(p.open.slice(0, ci), p.open.slice(ci + 1)); }
    if (p.meeting) M.meeting.toggle(true, state);
    if (p.alert) PK.alerts.push(p.alert);
    if (p.work) PK.workmode.open(function () { return state; });
    if (p.alfred) PK.jarvis.open('silent');
  }
  document.addEventListener('webOSRelaunch', function (e) { handleLaunch(e.detail); });
  function initialParams() {
    var p = null;
    try { if (window.PalmSystem && window.PalmSystem.launchParams) p = JSON.parse(window.PalmSystem.launchParams); } catch (e) {}
    if (!p && location.search) { p = {}; location.search.slice(1).split('&').forEach(function (kv) { var x = kv.split('='); p[x[0]] = decodeURIComponent(x[1] || ''); }); }
    return p;
  }

  /* ---------- Alfred (conceito Jarvis) ---------- */
  PK.jarvis.init({
    host: $('stage'), getState: function () { return state; },
    navigate: function (a) { if (a.open) PK.details.open(a.open.kind, a.open.id); if (a.view) { if (a.list) ui.list = a.list; setView(a.view); } },
    canInterrupt: function () { return $('screen-main').classList.contains('active') && !document.querySelector('.overlay.active') && !M.meeting.active() && !PK.workmode.active() && !PK.routine.active(); },
    command: alfredCommand, applyActions: function (a) { applyActions(a); },
    speak: function () { openVoice(); }, refresh: function () { refreshData(); },
    focus: function () { setTimeout(PK.nav.reset, 40); }
  });

  /* ---------- boot ---------- */
  fit();
  setTimeout(function () { document.body.classList.add('pk-ready'); var sp = document.getElementById('pk-splash'); if (sp) setTimeout(function () { sp.parentNode && sp.parentNode.removeChild(sp); }, 700); }, 350);
  PK.tv.loadIcons(function () { if (ui.view === 'home') render(); });
  nightAndShift(new Date());
  if (/[?&]demo=1/.test(location.search)) PK.data.setMode('demo'); // demonstração (capturas de tela, apresentações)
  var mode = PK.data.mode();
  if ((mode === 'live' && PK.api.isLinked()) || mode === 'demo') { enterMain(); setTimeout(function () { handleLaunch(initialParams()); }, 600); } else startPairing();
})();
