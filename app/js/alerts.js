/* Avisos (cartão no canto superior direito).
 *  - Reunião: aparece X min antes com timer ao vivo, "Ver detalhes", "Adiar" e "Fechar".
 *    Na hora de começar vira "Começou agora" com "Modo reunião".
 *  - Casa (ThinQ), campainha e recados da família usam o mesmo cartão.
 *  - Quando o app não está na frente (Netflix aberto), quem avisa é o serviço da TV
 *    (service/) ou o agente local (agent/). O app manda a agenda para o serviço em sync(). */
var PK = window.PK || {};
window.PK = PK;

PK.alerts = (function () {
  var U = PK.util, I = PK.icons, S = PK.settings, esc = U.esc;
  var list = [];                   // avisos ativos
  var dismissed = U.store.get('alertsDismissed', {}), snoozed = {};
  var prevDevices = null, returnFocus = null;

  function el() { return document.getElementById('alerts'); }
  function owner() { return PK.config.owner; }

  /* ---------- reuniões ---------- */
  function meetingAlerts(state) {
    var now = Date.now(), lead = (+S.get('alerts.meetingLeadMin') || 5) * 60000;
    return state.events.filter(function (e) {
      if (e.type !== 'meeting' || e.allDay) return false;
      if (e.members.length && e.members.indexOf(owner()) < 0) return false;
      var dt = e.start - now;
      return dt <= lead && dt > -60000 && !dismissed[e.id] && !(snoozed[e.id] > now);
    });
  }

  function tick(state) {
    if (!state || !state.events) return;
    var meetings = meetingAlerts(state);
    // remove reuniões que já não valem
    list = list.filter(function (a) { return a.kind !== 'meeting' || meetings.some(function (e) { return e.id === a.id; }); });
    meetings.forEach(function (e) {
      if (list.some(function (a) { return a.id === e.id; })) return;
      list.unshift({ id: e.id, kind: 'meeting', event: e, at: e.start });
    });
    devicesCheck(state);
    render();
    if (PK.modes && PK.modes.meeting.active()) hideAll();
  }

  /* ---------- casa: transições de estado viram aviso ---------- */
  function devicesCheck(state) {
    var devs = state.devices || [];
    if (prevDevices) devs.forEach(function (d) {
      var p = prevDevices[d.id]; if (!p) return;
      if ((d.type === 'washer' || d.type === 'dryer' || d.type === 'dishwasher') && p.state === 'running' && d.state === 'done')
        push({ kind: 'device', icon: 'shirt', title: d.name + ' terminou', body: d.room + ' · ' + (d.detail || ''), ttl: 10 });
      if (d.type === 'fridge' && d.door && !p.door)
        push({ kind: 'device', icon: 'home', title: 'Porta da geladeira aberta', body: 'Feche para não perder o frio', ttl: 5, urgent: true });
    });
    prevDevices = {}; devs.forEach(function (d) { prevDevices[d.id] = { state: d.state, door: d.door }; });
  }

  // Aviso genérico: { kind, icon, title, body, image, ttl (min), urgent }
  function push(a) {
    a.id = a.id || 'a' + U.uid();
    a.created = Date.now();
    list.unshift(a);
    render(true);
    return a.id;
  }

  /* ---------- ações ---------- */
  function dismiss(id) {
    var a = byId(id);
    if (a && a.kind === 'meeting') { dismissed[id] = true; U.store.set('alertsDismissed', dismissed); }
    list = list.filter(function (x) { return x.id !== id; });
    render(); restore();
  }
  function snooze(id) {
    var a = byId(id); if (!a) return;
    var min = +S.get('alerts.snoozeMin') || 2, until = Date.now() + min * 60000;
    if (a.kind === 'meeting' && a.event.start - Date.now() > 30000) until = Math.min(until, a.event.start.getTime());
    snoozed[id] = until;
    list = list.filter(function (x) { return x.id !== id; });
    render(); restore();
    PK.toast('Aviso adiado ' + (until >= a.event.start ? 'até a hora de começar' : min + ' min'));
  }
  function byId(id) { return list.filter(function (x) { return x.id === id; })[0]; }
  function restore() {
    if (list.length) return;
    var c = el(); c.classList.remove('has-focus');
    if (returnFocus && document.body.contains(returnFocus)) PK.nav.focus(returnFocus, true); else PK.nav.reset();
    returnFocus = null;
  }
  function hideAll() { list = list.filter(function (a) { return a.kind !== 'meeting'; }); render(); restore(); }

  /* ---------- desenho ---------- */
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + U.pad(s % 60); }
  function card(a) {
    var now = Date.now();
    if (a.kind === 'meeting') {
      var e = a.event, started = e.start <= now, lead = (+S.get('alerts.meetingLeadMin') || 5) * 60000;
      var frac = started ? 1 : 1 - Math.min(1, (e.start - now) / lead), R = 34, C = 2 * Math.PI * R;
      return '<div class="al-card meeting' + (started ? ' started' : '') + '" data-alert="' + esc(a.id) + '">' +
        '<div class="al-ring"><svg viewBox="0 0 80 80" width="80" height="80"><circle cx="40" cy="40" r="' + R + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="6"/>' +
        '<circle class="al-arc" cx="40" cy="40" r="' + R + '" fill="none" stroke="' + (started ? '#ff6b6b' : '#a78bfa') + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + C * frac + ' ' + C + '" transform="rotate(-90 40 40)"/></svg>' +
        '<span>' + I.get('video', 30) + '</span></div>' +
        '<div class="al-main"><div class="al-k">' + (started ? 'COMEÇOU AGORA' : 'REUNIÃO EM') + '</div>' +
        (started ? '' : '<div class="al-timer" data-until="' + e.start.getTime() + '">' + mmss(e.start - now) + '</div>') +
        '<div class="al-title">' + esc(e.title) + '</div><div class="al-sub">' + U.hm(e.start) + ' – ' + U.hm(e.end) + (e.video ? ' · Google Meet' : '') + '</div>' +
        '<div class="al-btns">' + (e.video && PK.computer.on() ? '<button class="btn focusable" data-al="join">' + I.get('video', 22) + ' Entrar</button>' : '') + (started ? '<button class="btn' + (e.video && PK.computer.on() ? ' ghost' : '') + ' focusable" data-al="meeting">' + I.get('camera', 22) + ' Modo reunião</button>' : '<button class="btn focusable" data-al="open">Ver detalhes</button>') +
        (started ? '' : '<button class="btn ghost focusable" data-al="snooze">Adiar ' + (+S.get('alerts.snoozeMin') || 2) + ' min</button>') +
        '<button class="btn ghost focusable" data-al="close">Fechar</button></div></div></div>';
    }
    return '<div class="al-card ' + esc(a.kind) + (a.urgent ? ' urgent' : '') + '" data-alert="' + esc(a.id) + '">' +
      (a.image ? '<div class="al-img" style="background-image:url(\'' + esc(a.image) + '\')"></div>' : '<div class="al-ring plain"><span>' + I.get(a.icon || 'note', 34) + '</span></div>') +
      '<div class="al-main"><div class="al-k">' + esc(a.label || (a.kind === 'door' ? 'CAMPAINHA' : a.kind === 'device' ? 'CASA' : 'AVISO')) + '</div>' +
      '<div class="al-title">' + esc(a.title) + '</div>' + (a.body ? '<div class="al-sub">' + esc(a.body) + '</div>' : '') +
      '<div class="al-btns">' + (a.kind === 'door' ? (a.live && a.device_id ? '<button class="btn focusable" data-al="live">' + I.get('video', 22) + ' Ver ao vivo</button>' : '') + '<button class="btn ghost focusable" data-al="close">Ok, vou atender</button>' : '<button class="btn focusable" data-al="close">Ok</button>') + '</div></div></div>';
  }
  var lastSig = '';
  function render(grab) {
    var c = el(); if (!c) return;
    // expira avisos com ttl
    var now = Date.now();
    list = list.filter(function (a) { return !a.ttl || now - a.created < a.ttl * 60000; });
    var dnd = PK.modes && (PK.modes.meeting.active() || (PK.modes.meeting.banner && PK.modes.meeting.banner()));
    var shown = list.filter(function (a) { return !dnd || a.kind === 'door' || a.kind === 'meeting' || a.urgent; }).slice(0, 3);
    var sig = shown.map(function (a) { return a.id + (a.kind === 'meeting' && a.event.start <= now ? 's' : ''); }).join(',');
    if (sig !== lastSig) {
      var hadFocus = c.classList.contains('has-focus');
      c.innerHTML = shown.map(card).join('');
      lastSig = sig;
      if (shown.length && PK.modes.ambient.active()) PK.modes.ambient.exit();
      if (shown.length && (grab || !hadFocus) && (!document.querySelector('.layer.active') || (PK.workmode && PK.workmode.active()))) {
        if (!hadFocus) returnFocus = PK.nav.current();
        c.classList.add('has-focus');
        setTimeout(function () { var b = c.querySelector('.btn'); if (b) PK.nav.focus(b, true); }, 30);
      }
      if (!shown.length) restore();
    }
  }
  // timers ao vivo (chamado a cada segundo)
  function second() {
    var c = el(); if (!c) return;
    Array.prototype.forEach.call(c.querySelectorAll('.al-timer'), function (t) {
      var until = +t.getAttribute('data-until'), left = until - Date.now();
      t.textContent = mmss(left);
      var card = t.closest('.al-card'), lead = (+S.get('alerts.meetingLeadMin') || 5) * 60000, R = 34, C2 = 2 * Math.PI * R;
      var arc = card && card.querySelector('.al-arc'); if (arc) arc.setAttribute('stroke-dasharray', C2 * (1 - Math.min(1, left / lead)) + ' ' + C2);
      if (left <= 0) render();
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-al]'); if (!b) return;
    var id = b.closest('[data-alert]').getAttribute('data-alert'), a = byId(id), act = b.getAttribute('data-al');
    if (act === 'close') dismiss(id);
    if (act === 'snooze') snooze(id);
    if (act === 'open' && a) { dismiss(id); PK.details.open('event', a.event.id); }
    if (act === 'meeting' && a) { dismiss(id); PK.modes.meeting.toggle(true, PK.app.state()); }
    if (act === 'join' && a) { dismiss(id); PK.data.detail('event', a.event.id).then(function (d) { PK.computer.join(d.conference && d.conference.url); }).catch(function () { PK.toast('Não achei o link da reunião'); }); }
    if (act === 'live' && a) { dismiss(id); PK.camera.open(a.device_id, a.body || 'Campainha'); }
  });

  /* ---------- serviço da TV (avisos por cima de outros apps) ---------- */
  function sync(state) {
    if (!PK.tv.isWebOS) return;
    var now = Date.now(), soon = state.events.filter(function (e) {
      return e.type === 'meeting' && !e.allDay && e.start - now < 24 * 3600000 && e.end > now && (!e.members.length || e.members.indexOf(owner()) >= 0);
    }).map(function (e) { return { id: e.id, title: e.title, start: e.start.getTime(), end: e.end.getTime(), video: !!e.video }; });
    var tokens = U.store.get('tokens', null);
    PK.tv.luna('luna://com.planknect.tv.service/configure', {
      meetings: soon, leadMin: +S.get('alerts.meetingLeadMin') || 5, snoozeMin: +S.get('alerts.snoozeMin') || 2,
      dismissed: Object.keys(dismissed), apiBase: PK.config.apiBase, token: tokens ? tokens.access : null
    }, function () {});
  }

  return { tick: tick, push: push, dismiss: dismiss, snooze: snooze, second: second, sync: sync, active: function () { return list.length > 0; } };
})();
