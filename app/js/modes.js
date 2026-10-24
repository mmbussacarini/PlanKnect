/* Modos de tela cheia: Reunião e Ambiente.
 *
 * MODO REUNIÃO — duas cenas, trocadas com ▲▼:
 *   backdrop: fundo bonito para quando a TV aparece atrás de você na câmera. Sem nenhum dado pessoal.
 *   onair:    aviso para a família ("Em reunião", até que horas, quanto falta).
 * ◀▶ troca o cenário (aurora, oceano, pôr do sol, minimal). Voltar sai.
 * Entra sozinho quando começa uma reunião com vídeo do dono da TV e sai quando ela termina.
 *
 * MODO AMBIENTE — depois de X minutos sem usar o controle: relógio grande, próximo compromisso,
 * clima, jantar e recado, sobre um cenário animado (ou fotos da família, se a API mandar).
 */
var PK = window.PK || {};
window.PK = PK;

PK.modes = (function () {
  var U = PK.util, I = PK.icons, S = PK.settings, $ = function (id) { return document.getElementById(id); };
  function SCENES() { return PK.scenes.all().map(function (x) { return x.id; }); }
  function sceneName(id) { return PK.scenes.get(id).name; }

  /* ================= REUNIÃO ================= */
  var meet = { active: false, event: null, auto: false, dismissed: {}, hintT: null, banner: null };

  /* Banner discreto (padrão do Knect Meeting): "Reunião em andamento" no topo, QR do Meet e Não perturbe.
   * A TV continua usável; o botão de câmera leva para a tela cheia (fundo/aviso). */
  function bannerOn(e) {
    meet.banner = e;
    var el = $('meet-banner'); if (!el) { el = document.createElement('div'); el.id = 'meet-banner'; $('stage').appendChild(el); }
    el.innerHTML = '<i class="mb-dot"></i><div class="mb-t"><b>Reunião em andamento: ' + U.esc(e.title) + '</b><span id="mb-left"></span></div>' +
      '<span class="mb-dnd">' + I.get('moon', 20) + ' Não perturbe</span><div class="mb-qr" id="mb-qr"></div>';
    el.classList.add('on'); document.body.classList.add('dnd'); bannerTick();
    // link do Meet vem do detalhe da reunião (GET /events/meeting:<id>)
    var put = function (url) { if (!url || !window.QRCode) return; var q = $('mb-qr'); if (!q) return; q.innerHTML = ''; new window.QRCode(q, { text: url, width: 84, height: 84, colorDark: '#0b1230', colorLight: '#ffffff' }); q.classList.add('on'); };
    PK.data.detail('event', e.id).then(function (d) { put(d.conference && d.conference.url); }).catch(function () {});
  }
  function bannerTick() {
    var e = meet.banner, l = $('mb-left'); if (!e || !l) return;
    var m = Math.max(0, Math.round((e.end - Date.now()) / 60000));
    l.textContent = 'termina em ' + (m >= 60 ? Math.floor(m / 60) + 'h ' + U.pad(m % 60) : m + ' min') + ' · às ' + U.hm(e.end);
  }
  function bannerOff() { meet.banner = null; var el = $('meet-banner'); if (el) el.classList.remove('on'); document.body.classList.remove('dnd'); }

  function currentMeeting(state, leadMin) {
    var now = new Date(), owner = PK.config.owner;
    return state.events.filter(function (e) {
      return e.type === 'meeting' && !e.allDay && (!e.members.length || e.members.indexOf(owner) >= 0) &&
        e.start - leadMin * 60000 <= now && e.end > now;
    })[0] || null;
  }

  function enterMeeting(event, auto) {
    if (auto && S.get('meeting.style') === 'banner' && event) { bannerOn(event); return; }
    if (meet.banner) bannerOff();
    meet.active = true; meet.event = event; meet.auto = !!auto; meet.started = new Date();
    meet.view = auto ? null : 'room'; // pelo botão/controle: abre a Sala de reunião; automático: fundo/aviso
    $('meeting').classList.add('active');
    renderMeeting(true);
    if (meet.view !== 'room') showHint();
  }
  function exitMeeting(byUser) {
    if (!meet.active) return;
    if (byUser && meet.event) meet.dismissed[meet.event.id] = true;
    meet.active = false; meet.event = null; meet.view = null; camStop(); knectStop();
    $('meeting').classList.remove('active'); $('meeting').classList.remove('room');
    $('meeting').innerHTML = '';
  }
  function renderMeeting(full) {
    var el = $('meeting'), style = meet.view || S.get('meeting.fullStyle'), scene = S.get('meeting.scene');
    var now = new Date(), e = meet.event;
    if (style === 'room') { renderRoom(full); return; }
    el.classList.remove('room'); camStop();
    if (full || el.getAttribute('data-scene') !== scene || el.getAttribute('data-v') === 'room') {
      el.setAttribute('data-v', style);
      el.innerHTML = '<div id="mt-scene" class="scene-host"></div><div id="mt-dim"></div><div id="mt-content"></div><div id="mt-hint" class="mt-hint"></div>';
      el.setAttribute('data-scene', scene);
      PK.scenes.mount($('mt-scene'), scene);
    }
    el.classList.toggle('onair', style !== 'backdrop');
    var c = $('mt-content');
    if (style === 'backdrop') {
      c.className = 'mt-backdrop';
      c.innerHTML = '<div class="bd-brand"><img class="logo-img" src="assets/logo.svg" alt=""><div><div class="bd-title">' + U.esc(S.get('meeting.brandTitle')) + '</div>' +
        '<div class="bd-sub">' + U.esc(S.get('meeting.brandSubtitle')) + '</div></div></div>';
    } else {
      var left = e ? Math.max(0, (e.end - now) / 60000) : 0;
      var frac = e ? Math.min(1, Math.max(0, (now - e.start) / (e.end - e.start))) : 0;
      var R = 150, CI = 2 * Math.PI * R;
      var nextFam = (PK.app.state().events || []).filter(function (x) { return !x.allDay && e && x.start >= e.end && x.type !== 'meeting'; })[0];
      c.className = 'mt-onair';
      c.innerHTML = '<div class="oa-badge"><i class="oa-dot"></i>EM REUNIÃO</div>' +
        '<div class="oa-msg">' + U.esc(S.get('meeting.onAirMessage')) + '</div>' +
        '<div class="oa-ring"><svg viewBox="0 0 340 340" width="340" height="340"><circle cx="170" cy="170" r="' + R + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/>' +
        '<circle cx="170" cy="170" r="' + R + '" fill="none" stroke="#ff5a5a" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (e ? CI * (1 - frac) : CI) + ' ' + CI + '" transform="rotate(-90 170 170)"/></svg>' +
        '<div class="oa-in">' + (e ? '<b>' + Math.ceil(left) + '</b><span>min restantes</span>' : '<b>' + Math.floor((now - meet.started) / 60000) + '</b><span>min em reunião</span>') + '</div></div>' +
        (e ? '<div class="oa-until">até <b>' + U.hm(e.end) + '</b></div>' : '') +
        (nextFam ? '<div class="oa-next">Depois: ' + U.esc(PK.views.title(nextFam)) + ' às ' + U.hm(nextFam.start) + '</div>' : '');
    }
  }

  /* ---------- Sala de reunião: câmera, Meet, participantes, pauta e o computador na TV ---------- */
  var cam = null;
  function camStart() {
    var v = $('rm-video'), ph = $('rm-cam-ph');
    if (!v || cam || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }).then(function (st) {
      if (!meet.active || meet.view !== 'room') { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      cam = st; v.srcObject = st; v.play && v.play(); if (ph) ph.style.display = 'none'; $('rm-cam').classList.add('live');
    }).catch(function () {});
  }
  function camStop() { if (cam) { cam.getTracks().forEach(function (t) { t.stop(); }); cam = null; } }
  function roomEvent() {
    if (meet.event) return meet.event;
    var now = new Date(), st = PK.app.state();
    return st.events.filter(function (e) { return !e.allDay && e.end > now && U.sameDay(e.start, now) && (e.type === 'meeting' || e.video); })[0] || null;
  }
  function initials(n) { return String(n || '?').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function renderRoom(full) {
    var el = $('meeting'), e = roomEvent(), now = new Date(), esc = U.esc;
    if (!full && el.getAttribute('data-v') === 'room') { roomTick(); return; }
    el.setAttribute('data-v', 'room'); el.classList.add('room'); el.classList.remove('onair');
    var st = PK.app.state(), today = st.events.filter(function (x) { return !x.allDay && U.sameDay(x.start, now) && (x.type === 'meeting' || x.video); });
    el.innerHTML = '<div id="mt-scene" class="scene-host"></div><div class="rm-dim"></div>' +
      '<div class="rm"><div class="rm-top"><img class="logo-img" src="assets/logo.svg" alt=""><b>Sala de reunião</b><span class="rm-dnd">' + I.get('moon', 22) + ' Não perturbe ligado</span><span class="rm-clock" id="rm-clock"></span></div>' +
      '<div class="rm-main"><div class="rm-cam" id="rm-cam"><video id="rm-video" autoplay muted playsinline></video>' +
        '<div class="rm-cam-ph rm-knect" id="rm-cam-ph">' + (e ? '<div class="kx-col kx-live"><div class="kx-h"><i class="kx-dot"></i><span id="kx-lt">KNECT MEETING · TRANSCRIÇÃO</span></div><div class="kx-lines" id="kx-lines"><div class="kx-wait">Aguardando a fala da reunião…</div></div></div>' +
          '<div class="kx-col kx-ins"><div class="kx-h">' + I.get('sparkle', 20) + '<span>INSIGHTS</span></div><div id="kx-ins"><div class="kx-wait">Os insights aparecem aqui durante a reunião.</div></div></div>'
          : I.get('camera', 72) + '<b>Sala livre</b><span>Durante as reuniões, a transcrição ao vivo e os insights do Knect Meeting aparecem aqui.</span>') + '</div>' +
        '<div class="rm-cam-tag">' + I.get('camera', 20) + ' Só você vê esta prévia</div></div>' +
      '<aside class="rm-side">' + (e ? '<div class="rm-chip" id="rm-chip"></div><h1 class="rm-t">' + esc(e.private ? 'Ocupado' : e.title) + '</h1>' +
          '<div class="rm-when">' + U.hm(e.start) + ' – ' + U.hm(e.end) + (e.video ? ' · Google Meet' : '') + '</div>' +
          '<div class="rm-join" id="rm-join"><div class="rm-qr" id="rm-qr"></div><div><b>Entrar no Google Meet</b><span>Aponte o celular ou notebook — o Meet abre lá. Na TV: AirPlay ou HDMI.</span></div></div>' +
          '<div id="rm-extra"><div class="rm-load"><span class="spin"></span> Carregando participantes e pauta…</div></div>'
        : '<div class="rm-chip">SEM REUNIÃO AGORA</div><h1 class="rm-t">Sala livre</h1><div class="rm-when">Nenhuma reunião com vídeo no resto do dia.</div>') +
      '</aside></div>' +
      '<div class="rm-acts' + (e ? ' many' : '') + '">' + (e && e.video && PK.computer.on() ? '<button class="rm-b join focusable" data-rm="join" data-autofocus>' + I.get('video', 30) + '<span><b>Entrar no computador</b><em>abre o Meet no Mac e mostra aqui</em></span></button>' : '') +
        '<button class="rm-b focusable" data-rm="work"' + (e && e.video && PK.computer.on() ? '' : ' data-autofocus') + '>' + I.get('monitor', 30) + '<span><b>Computador na TV</b><em>HDMI numa janela com o PlanKnect em volta</em></span></button>' +
        '<button class="rm-b focusable" data-rm="backdrop">' + I.get('sparkle', 30) + '<span><b>Fundo para câmera</b><em>Cenário bonito atrás de você</em></span></button>' +
        '<button class="rm-b focusable" data-rm="onair">' + I.get('moon', 30) + '<span><b>Aviso para a família</b><em>“Em reunião” com tempo restante</em></span></button>' +
        (e ? '<button class="rm-b ask focusable" data-rm="ask"><span class="kn-mini"></span><span><b>Perguntar à reunião</b><em>Alfred usa a transcrição</em></span></button>' : '') +
        (e ? '<button class="rm-b focusable" data-rm="detail">' + I.get('calendar', 30) + '<span><b>Detalhes</b><em>Pauta, anexos e gravação</em></span></button>' : '') +
        '<button class="rm-b ghost focusable" data-rm="exit">' + I.get('x', 30) + '<span><b>Sair</b><em>Voltar ao PlanKnect</em></span></button></div>' +
      (today.length ? '<div class="rm-day">' + today.map(function (x) { var live = x.start <= now && x.end > now, past = x.end <= now; return '<span class="' + (live ? 'live' : past ? 'past' : '') + '"><b>' + U.hm(x.start) + '</b>' + esc(x.private ? 'Ocupado' : x.title) + '</span>'; }).join('') + '</div>' : '') +
      '</div>';
    PK.scenes.mount($('mt-scene'), S.get('meeting.scene'));
    el.onclick = roomClick;
    if (PK.deals && PK.deals.load) PK.deals.load();
    roomTick(); camStart(); setTimeout(PK.nav.reset, 40);
    knectStart(e);
    if (e) PK.data.detail('event', e.id).then(function (d) {
      var x = $('rm-extra'); if (!x || !meet.active) return;
      var url = d.conference && d.conference.url, att = d.attendees || [], ag = d.agenda || [];
      if (url && window.QRCode) { new window.QRCode($('rm-qr'), { text: url, width: 150, height: 150, colorDark: '#0b1230', colorLight: '#ffffff' }); $('rm-join').classList.add('on'); }
      x.innerHTML = (att.length ? '<div class="rm-sec">Participantes · ' + att.length + '</div><div class="rm-people">' + att.slice(0, 8).map(function (a) {
          return '<span class="rm-p' + (a.response === 'accepted' ? ' ok' : a.response === 'declined' ? ' no' : '') + '"><i style="background:' + (a.color || '#6366f1') + '">' + esc(initials(a.name)) + '</i>' + esc(String(a.name || '').split(' ')[0]) + '</span>'; }).join('') + (att.length > 8 ? '<span class="rm-p more">+' + (att.length - 8) + '</span>' : '') + '</div>' : '') +
        (ag.length ? (function () { var dn = ag.filter(function (a) { return a && a.done; }).length;
            return '<div class="rm-sec">Pauta' + (dn ? ' · ' + dn + '/' + ag.length : '') + '</div>' + (dn ? '<div class="rm-agbar"><i style="width:' + Math.round(dn / ag.length * 100) + '%"></i></div>' : '') +
              '<ol class="rm-ag">' + ag.slice(0, 4).map(function (a) { return '<li class="' + (a && a.done ? 'done' : '') + '">' + esc(typeof a === 'string' ? a : a.title || a.text) + '</li>'; }).join('') + '</ol>'; })() : '') +
        dealCard(d, e) +
        (!att.length && !ag.length ? '<div class="rm-none">Sem participantes ou pauta no PlanKnect.</div>' : '');
    }).catch(function () { var x = $('rm-extra'); if (x) x.innerHTML = ''; });
  }
  /* ---------- Knect Meeting: transcrição ao vivo + insights + tarefas sugeridas (por projeto) ---------- */
  var kx = { t: null, it: null, seq: 0, ev: null, lines: [] };
  function knectStart(e) {
    knectStop(); if (!e) return; kx.ev = e; kx.seq = 0; kx.lines = [];
    var live = function () {
      PK.data.meetingLive(e.id, kx.seq).then(function (r) {
        var box = $('kx-lines'); if (!box) return;
        (r.lines || []).forEach(function (l) { kx.seq = Math.max(kx.seq, l.seq || 0); kx.lines.push(l); });
        kx.lines = kx.lines.slice(-9);
        var lt = $('kx-lt'); if (lt) lt.textContent = r.live ? 'AO VIVO · TRANSCRIÇÃO' : 'TRANSCRIÇÃO';
        $('rm-cam-ph').classList.toggle('is-live', !!r.live);
        if (kx.lines.length) box.innerHTML = kx.lines.map(function (l, i) { return '<div class="kx-l' + (i === kx.lines.length - 1 ? ' new' : '') + '"><b style="color:' + spk(l.speaker) + '">' + U.esc(l.speaker || '—') + '</b>' + U.esc(l.text) + '</div>'; }).join('');
      }).catch(function (err) { var box = $('kx-lines'); if (box) box.innerHTML = '<div class="kx-wait">' + (/404|not_found/.test(err.message) ? 'A transcrição ao vivo ainda não chega à TV.' : U.esc(gate(err.message))) + '</div>'; });
    };
    var ins = function () {
      PK.data.meetingInsights(e.id).then(function (r) {
        var box = $('kx-ins'); if (!box) return;
        var byProj = {}; (r.suggested_tasks || []).forEach(function (t) { var k = t.project || 'Sem projeto'; (byProj[k] = byProj[k] || []).push(t); });
        var keep = document.querySelector('.kx-s .focused'), keepId = keep && keep.getAttribute('data-kx');
        box.innerHTML = (r.summary ? '<p class="kx-sum">' + U.esc(r.summary) + '</p>' : '') +
          ((r.key_decisions || []).length ? '<div class="kx-sec">Decisões</div>' + r.key_decisions.slice(0, 3).map(function (d) { return '<div class="kx-dec">' + I.get('check', 18) + U.esc(txt(d)) + '</div>'; }).join('') : '') +
          flags(r) +
          (Object.keys(byProj).length ? '<div class="kx-sec">Tarefas sugeridas pelo PlanKnect</div>' + Object.keys(byProj).map(function (p) {
            return '<div class="kx-proj">' + I.get('briefcase', 16) + U.esc(p) + '</div>' + byProj[p].map(function (t) {
              return '<div class="kx-s"><div><b>' + U.esc(t.title) + '</b><span>' + U.esc([t.owner, t.due].filter(Boolean).join(' · ')) + '</span></div>' +
                '<button class="kx-ok focusable" data-kx="' + U.esc(t.id) + '|accept">Criar</button><button class="kx-no focusable" data-kx="' + U.esc(t.id) + '|dismiss">' + I.get('x', 18) + '</button></div>'; }).join('');
          }).join('') : '');
        if (!box.innerHTML) box.innerHTML = '<div class="kx-wait">Sem insights ainda.</div>';
        if (keepId) { var nb = box.querySelector('[data-kx="' + keepId + '"]'); if (nb) PK.nav.focus(nb, true); }
      }).catch(function (err) { var box = $('kx-ins'); if (box) box.innerHTML = '<div class="kx-wait">' + (/404|not_found/.test(err.message) ? 'Insights aparecem quando o PlanKnect liberar a rota.' : U.esc(gate(err.message))) + '</div>'; });
    };
    live(); ins(); kx.t = setInterval(live, 4000); kx.it = setInterval(ins, 10000);
  }
  function txt(x) { return typeof x === 'string' ? x : (x && (x.text || x.title || x.summary)) || ''; }
  // motivo do PlanKnect em português (reunião não liberada, sigilo comercial, etc.)
  function gate(m) {
    if (/select it for this TV|review this meeting/i.test(m)) return 'Esta reunião não foi liberada para a TV. Em planknect.com › Dispositivos › esta TV › “Reuniões aprovadas para esta TV”, revise e selecione esta reunião (e ligue Reunião ao vivo / Insights).';
    if (/commercial/i.test(m)) return 'Reunião com termos comerciais: o PlanKnect não mostra em telas compartilhadas.';
    return m;
  }
  // riscos, perguntas em aberto, conflitos com decisões anteriores e duplicatas (KnectMeet ao vivo)
  function flags(r) {
    var T = [['risks', 'Riscos', 'bell', 'risk'], ['questions', 'Perguntas em aberto', 'note', 'q'], ['conflicts', 'Conflitos', 'bell', 'conf'], ['duplicates', 'Possíveis duplicatas', 'refresh', 'dup']];
    return T.map(function (k) { var list = r[k[0]] || []; if (!list.length) return '';
      return '<div class="kx-sec">' + k[1] + '</div>' + list.slice(0, 3).map(function (x) { return '<div class="kx-flag ' + k[3] + '">' + I.get(k[2], 16) + U.esc(txt(x)) + '</div>'; }).join(''); }).join('');
  }
  function knectStop() { clearInterval(kx.t); clearInterval(kx.it); kx.t = kx.it = null; }
  var SPK = ['#a5b4fc', '#f9a8d4', '#86efac', '#fcd34d', '#7dd3fc', '#fdba74'];
  function spk(n) { var h = 0; String(n || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return SPK[h % SPK.length]; }
  function suggest(sid, action, btn) {
    var row = btn.closest('.kx-s'); if (row) row.classList.add('busy');
    PK.data.meetingSuggestion(kx.ev.id, sid, action).then(function (r) {
      if (row && row.parentNode) row.parentNode.removeChild(row);
      PK.toast(U.esc(r.reply || (action === 'accept' ? 'Tarefa criada' : 'Ignorada'))); setTimeout(PK.nav.reset, 30);
      if (action === 'accept' && PK.app.refresh) PK.app.refresh();
    }).catch(function (e) { if (row) row.classList.remove('busy'); PK.toast(PK.writeErr(e)); });
  }
  // deal do mesmo projeto da reunião (Deal Room): estágio, valor e próxima ação
  function dealCard(d, e) {
    if (!PK.deals || !PK.deals.get) return '';
    var pid = d.projectId || e.projectId, dl = (PK.deals.all ? PK.deals.all() : []).filter(function (x) { return (d.dealId && x.id === d.dealId) || (pid && x.projectId === pid); })[0];
    if (!dl) return '';
    return '<div class="rm-sec">Deal ligado</div><div class="rm-deal"><b>' + U.esc(dl.title) + '</b><span>' + U.esc(dl.stage) + ' · ' + PK.deals.money(dl.values[0].amount, dl.values[0].currency) + (dl.next ? ' · ' + U.esc(dl.next.text) : '') + '</span></div>';
  }
  function roomTick() {
    var c = $('rm-clock'); if (c) c.textContent = U.hm(new Date());
    var chip = $('rm-chip'), e = roomEvent(); if (!chip || !e) return;
    var now = Date.now(), live = e.start <= now, m = Math.max(0, Math.round(((live ? e.end : e.start) - now) / 60000));
    chip.className = 'rm-chip ' + (live ? 'live' : 'next');
    chip.textContent = (live ? 'AGORA · termina em ' : 'A SEGUIR · em ') + (m >= 60 ? Math.floor(m / 60) + 'h ' + U.pad(m % 60) : m + ' min');
  }
  function roomClick(ev) {
    var b = ev.target.closest && ev.target.closest('[data-rm],[data-kx]'); if (!b) return;
    ev.stopPropagation();
    var a = b.getAttribute('data-rm'), e = roomEvent();
    if (a === 'exit') { exitMeeting(true); return; }
    if (a === 'ask' && e) { PK.jarvis.meeting({ id: e.id, title: e.title }); PK.jarvis.listen(); return; }
    if (a === 'join' && e) { PK.data.detail('event', e.id).then(function (d) { PK.computer.join(d.conference && d.conference.url); }); return; }
    var sg = b.getAttribute('data-kx'); if (sg) { var q = sg.split('|'); suggest(q[0], q[1], b); return; }
    if (a === 'work') { exitMeeting(true); PK.workmode.open(function () { return PK.app.state(); }); return; }
    if (a === 'detail' && e) { PK.details.open('event', e.id); return; }
    if (a === 'backdrop' || a === 'onair') { camStop(); knectStop(); meet.view = null; meet.roomBack = true; S.set('meeting.fullStyle', a); renderMeeting(true); showHint(); }
  }
  function showHint() {
    var h = $('mt-hint'); if (!h) return;
    var style = S.get('meeting.fullStyle'), scene = S.get('meeting.scene');
    h.innerHTML = '<span>' + I.get('camera', 24) + (style === 'backdrop' ? ' Fundo para câmera' : ' Aviso para a família') + ' · ' + U.esc(sceneName(scene)) + '</span>' +
      '<span class="k">◀ ▶</span> cenário <span class="k">▲ ▼</span> fundo/aviso <span class="k">Voltar</span> ' + (meet.roomBack ? 'sala' : 'sair');
    h.classList.add('show');
    clearTimeout(meet.hintT);
    meet.hintT = setTimeout(function () { h.classList.remove('show'); }, 4000);
  }
  function meetingKey(k) {
    if (meet.view === 'room') {
      if (k === 'back' || k === 'meet') { exitMeeting(true); PK.toast('Sala de reunião fechada'); return; }
      return false; // setas e OK: navegação normal entre os botões da sala
    }
    if (meet.roomBack && (k === 'back')) { meet.view = 'room'; meet.roomBack = false; renderMeeting(true); return; }
    if (k === 'back' || k === 'meet') { exitMeeting(true); PK.toast('Modo reunião desligado'); return; }
    if (k === 'left' || k === 'right') {
      var L = SCENES(), i = L.indexOf(S.get('meeting.scene'));
      S.set('meeting.scene', L[(i + (k === 'right' ? 1 : L.length - 1)) % L.length]);
      renderMeeting(false);
    }
    if (k === 'up' || k === 'down') { S.set('meeting.fullStyle', S.get('meeting.fullStyle') === 'backdrop' ? 'onair' : 'backdrop'); renderMeeting(false); }
    showHint();
  }
  // Chamado a cada minuto e após cada atualização de dados
  function tickMeeting(state) {
    var e = currentMeeting(state, S.get('meeting.leadMin'));
    if (meet.banner) { if (!e || e.id !== meet.banner.id) { bannerOff(); PK.toast('Reunião terminou'); } else bannerTick(); return; }
    if (meet.active) {
      if (meet.auto && !e) { exitMeeting(false); PK.toast('Reunião terminou — bem-vindo de volta!'); return; }
      if (e && meet.event && e.id === meet.event.id) meet.event = e;
      renderMeeting(false);
      return;
    }
    if (e && S.get('meeting.auto') && !meet.dismissed[e.id] && !ambient.active) {
      enterMeeting(e, true);
      PK.toast(I.get('video', 24) + ' ' + U.esc(e.title) + ' — modo reunião ligado');
    }
  }
  function toggleMeeting(on, state) {
    if (on === false && meet.banner) { meet.dismissed[meet.banner.id] = true; bannerOff(); return; }
    if (on === false || (on === undefined && meet.active)) { exitMeeting(true); return; }
    if (ambient.active) exitAmbient();
    enterMeeting(currentMeeting(state, 15), false);
  }

  /* ================= AMBIENTE ================= */
  var ambient = { active: false, lastInput: Date.now(), rot: 0, rotT: null };

  function enterAmbient(state) {
    ambient.active = true;
    var el = $('ambient');
    var photos = state.photos || [];
    el.innerHTML = (photos.length ? '<div class="amb-photo kbp on" id="amb-p0"></div><div class="amb-photo kbp" id="amb-p1"></div>' : '<div id="amb-scene" class="scene-host"></div>') +
      '<div class="amb-shade"></div><div class="amb-content" id="amb-content"></div><div class="amb-memory" id="amb-memory"></div>';
    ambient.photoIdx = 0;
    if (photos.length) showPhoto(photos, 0);
    if (!photos.length) PK.scenes.mount($('amb-scene'), S.get('ambient.scene') === 'auto' ? PK.scenes.auto(state.weather) : S.get('ambient.scene'));
    el.classList.add('active');
    renderAmbient(state);
    clearInterval(ambient.rotT);
    ambient.since = Date.now(); ambient.dark = false; drift();
    ambient.rotT = setInterval(function () {
      ambient.rot++; var st = PK.app.state();
      if (ambient.rot % 5 === 0) drift(); // a cada minuto, nada fica no mesmo lugar (protege a tela)
      if (!ambient.dark && shouldDark()) goDark();
      if (ambient.dark) { darkTick(); return; }
      renderAmbient(st);
      if ((st.photos || []).length > 1 && ambient.rot % 2 === 0) showPhoto(st.photos, ++ambient.photoIdx);
    }, 12000);
  }
  // Fotos da família com "Há N anos, hoje"
  function showPhoto(photos, i) {
    var p = photos[i % photos.length], a = $('amb-p0'), b = $('amb-p1'); if (!a || !b) return;
    var next = i % 2 ? b : a, prev = i % 2 ? a : b;
    var img = new Image();
    img.onload = function () {
      next.style.backgroundImage = 'url(' + encodeURI(p.url) + ')';
      next.classList.add('on'); prev.classList.remove('on');
      var m = $('amb-memory'); if (!m) return;
      var now = new Date(), t = p.takenAt, yrs = t ? now.getFullYear() - t.getFullYear() : 0;
      var same = t && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
      m.innerHTML = t ? '<b>' + (same && yrs > 0 ? 'Há ' + yrs + ' ano' + (yrs > 1 ? 's' : '') + ', hoje' : U.MONTHS[t.getMonth()] + ' de ' + t.getFullYear()) + '</b>' + (p.caption ? U.esc(p.caption) : '') + (p.demo ? '<small>foto de exemplo</small>' : '') : '';
    };
    img.src = p.url;
  }
  function exitAmbient() {
    ambient.active = false; ambient.dark = false; clearInterval(ambient.rotT);
    var el = $('ambient'); el.classList.remove('active'); el.classList.remove('dark'); el.innerHTML = '';
  }
  /* ---------- proteção de tela (anti burn-in) ----------
   * 1) moldura: as informações mudam de posição a cada minuto;
   * 2) descanso: depois de N min parado (Ajustes) ou de madrugada, tela preta com um relógio pequeno que flutua. */
  function rnd(a) { return Math.round((Math.random() * 2 - 1) * a); }
  function drift() {
    var c = $('amb-content'), m = $('amb-memory');
    if (c) c.style.transform = 'translate(' + rnd(60) + 'px,' + rnd(40) + 'px)';
    if (m) m.style.transform = 'translate(' + rnd(40) + 'px,' + rnd(24) + 'px)';
  }
  function nightNow() { var h = new Date().getHours(), n = PK.config.night || { from: 22, to: 6 }; return n.from > n.to ? (h >= n.from || h < n.to) : (h >= n.from && h < n.to); }
  function shouldDark() {
    var mins = +S.get('ambient.darkAfterMin'); if (isNaN(mins)) mins = 45;
    return (S.get('ambient.nightDark') !== false && nightNow()) || (mins > 0 && Date.now() - ambient.since > mins * 60000);
  }
  function goDark() {
    ambient.dark = true; var el = $('ambient');
    el.classList.add('dark'); el.innerHTML = '<div id="amb-sv"></div><div class="amb-dark" id="amb-dark"><b id="ad-t"></b><span id="ad-d"></span></div>';
    if (PK.saver) PK.saver.mount($('amb-sv'), S.get('ambient.saver') || 'auto', { night: nightNow(), isNight: nightNow }); // algo sempre em movimento
    darkTick();
  }
  function darkTick() {
    var d = $('amb-dark'); if (!d) return; var now = new Date();
    $('ad-t').textContent = U.hm(now); $('ad-d').textContent = U.longDate(now);
    d.style.left = (160 + Math.round(Math.random() * 1400)) + 'px'; d.style.top = (140 + Math.round(Math.random() * 720)) + 'px'; // flutua pela tela
  }
  function renderAmbient(state) {
    var c = $('amb-content'); if (!c) return;
    var now = new Date(), w = state.weather;
    var next = state.events.filter(function (e) { return !e.allDay && e.end > now; })[0];
    var cards = [];
    var meal = state.meals.filter(function (m) { return U.sameDay(m.date, now); })[0];
    if (meal) cards.push(I.get('chef', 30) + ' Jantar de hoje: <b>' + U.esc(meal.title) + '</b>');
    if (state.notes[0]) cards.push(I.get('note', 30) + ' ' + U.esc(state.notes[0].text));
    var kids = state.members.filter(function (m) { return m.kid; });
    if (kids.length) cards.push(I.get('star', 30) + ' Missões: ' + kids.map(function (k) {
      var ch = state.chores.filter(function (x) { return x.member === k.id; });
      return U.esc(k.name) + ' ' + ch.filter(function (x) { return x.done; }).length + '/' + ch.length;
    }).join(' · '));
    var card = cards.length ? cards[ambient.rot % cards.length] : '';
    // Agenda de hoje por pessoa (opcional) — igual à moldura do nest-hub
    var ag = '';
    if (S.get('ambient.agenda') !== false) {
      var evs = state.events.filter(function (e) { return U.sameDay(e.start, now); }).sort(function (x, y) { return x.allDay === y.allDay ? x.start - y.start : (x.allDay ? -1 : 1); });
      var all = state.members.map(function (m) { return m.id; });
      var shared = evs.filter(function (e) { return !e.members || !e.members.length || (e.members.length >= all.length && all.length > 1); });
      var ln = function (e) { var live = !e.allDay && e.start <= now && e.end > now; return '<div class="aa-e' + (!e.allDay && e.end <= now ? ' past' : '') + (live ? ' live' : '') + '"><b>' + (e.allDay ? 'dia' : U.hm(e.start)) + '</b><span>' + U.esc(e.private ? 'Ocupado' : e.title) + '</span></div>'; };
      ag = '<div class="amb-ag"><div class="aa-h">HOJE</div>' + (shared.length ? '<div class="aa-r"><div class="aa-w"><i class="aa-all">' + I.get('users', 20) + '</i><b>Família</b></div>' + shared.slice(0, 2).map(ln).join('') + '</div>' : '') +
        state.members.map(function (m) { var mine = evs.filter(function (e) { return shared.indexOf(e) < 0 && e.members && e.members.indexOf(m.id) >= 0; });
          return '<div class="aa-r"><div class="aa-w"><i style="background:' + m.color + ';' + PK.face(m) + '">' + (m.photo ? '' : U.esc(m.initial)) + '</i><b>' + U.esc(String(m.name).split(' ')[0]) + '</b></div>' + (mine.length ? mine.slice(0, 2).map(ln).join('') : '<div class="aa-free">livre</div>') + '</div>'; }).join('') + '</div>';
    }
    var wx = '';
    if (S.get('ambient.weather') !== false && w) { var d0 = w.days[0]; wx = '<div class="amb-wx">' + I.get(I.weather(w.code, w.isDay), 56, ' stroke-width="1.4"') + '<b>' + w.temp + '°</b><div><span>' + I.weatherText(w.code) + '</span><small>↑ ' + d0.max + '°  ↓ ' + d0.min + '° · ' + (d0.rain || 0) + '% chuva</small></div></div>'; }
    c.innerHTML = ag + '<div class="amb-time">' + U.hm(now) + '</div><div class="amb-date">' + U.longDate(now) + '</div>' + wx +
      (next ? '<div class="amb-next"><span>' + (next.start <= now ? 'Agora' : U.hm(next.start)) + '</span>' + U.esc(PK.views.title(next)) + '</div>' : '') +
      (card ? '<div class="amb-card">' + card + '</div>' : '') + '<div class="amb-hint">Aperte qualquer botão</div>';
  }
  function input() { ambient.lastInput = Date.now(); }
  function tickAmbient(state, canEnter) {
    var mins = +S.get('ambient.afterMin');
    if (ambient.active) { renderAmbient(state); return; }
    if (mins > 0 && canEnter && !PK.noAuto && !meet.active && Date.now() - ambient.lastInput > mins * 60000) enterAmbient(state);
  }

  return {
    meeting: { active: function () { return meet.active; }, banner: function () { return !!meet.banner; }, bannerOff: bannerOff, key: meetingKey, tick: tickMeeting, toggle: toggleMeeting, SCENES: SCENES, name: sceneName },
    ambient: { active: function () { return ambient.active; }, saver: function (st) { if (!ambient.active) enterAmbient(st); goDark(); }, enter: enterAmbient, exit: exitAmbient, tick: tickAmbient, input: input }
  };
})();
