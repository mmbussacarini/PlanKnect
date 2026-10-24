/* PlanKnect TV — serviço em segundo plano (JS service do webOS).
 *
 * Mostra avisos POR CIMA de qualquer app (Netflix, YouTube, TV ao vivo):
 *   - Reunião em X min, com botões "Abrir no PlanKnect", "Adiar" e "Fechar" (createAlert)
 *   - Avisos que o PlanKnect manda (campainha, máquina terminou, "jantar pronto")
 * O app chama `configure` a cada atualização com as reuniões das próximas 24 h.
 * Se houver token, o serviço também consulta GET /api/tv/alerts a cada 30 s.
 *
 * A TESTAR NA TV: tempo de vida do serviço com outro app na frente e se `createAlert`
 * com botões é permitido para apps instalados pelo Developer Mode. Se não for, cai para
 * `createToast` (sem botões; clicar abre o PlanKnect no detalhe da reunião).
 * Escrito em ES5 (Node antigo nas TVs). */
var Service = require('webos-service');
var https = require('https');
var url = require('url');

var APP_ID = 'com.planknect.tv';
var service = new Service('com.planknect.tv.service');
var state = { meetings: [], leadMin: 5, snoozeMin: 2, token: null, apiBase: '', dismissed: {}, snoozed: {}, shown: {}, lastPoll: 0 };
var keepAlive = null;

// Mantém o serviço vivo enquanto houver reuniões a vigiar
function hold() {
  if (keepAlive) return;
  service.activityManager.create('planknect-keepalive', function (activity) { keepAlive = activity; });
}
function release() {
  if (!keepAlive) return;
  service.activityManager.complete(keepAlive, function () {});
  keepAlive = null;
}

function fmt(ms) { var d = new Date(ms); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
function esc(s) { return String(s || '').replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

function launchParams(extra) { var p = { id: APP_ID, params: extra }; return p; }

// Aviso com botões; se a TV recusar, toast simples
function alertWithButtons(id, html, buttons, toastText, openParams) {
  service.call('luna://com.webos.notification/createAlert', {
    sourceId: APP_ID, message: html, buttons: buttons, onclose: { uri: 'luna://com.planknect.tv.service/dismiss', params: { id: id, soft: true } }
  }, function (r) {
    if (r.payload && r.payload.returnValue) return;
    service.call('luna://com.webos.notification/createToast', {
      sourceId: APP_ID, message: toastText, noaction: false,
      onclick: { appId: APP_ID, params: openParams }
    }, function () {});
  });
}

function meetingAlert(m, startedNow) {
  var minLeft = Math.max(0, Math.round((m.start - Date.now()) / 60000));
  var head = startedNow ? 'Começou agora' : 'Reunião em ' + minLeft + ' min';
  var html = '<b>' + head + '</b><br/>' + esc(m.title) + ' · ' + fmt(m.start) + (m.video ? ' · Google Meet' : '');
  var buttons = [
    { label: startedNow ? 'Modo reunião' : 'Abrir', onclick: 'luna://com.webos.applicationManager/launch', params: launchParams(startedNow ? { meeting: true } : { open: 'event:' + m.id }) }
  ];
  if (!startedNow) buttons.push({ label: 'Adiar ' + state.snoozeMin + ' min', onclick: 'luna://com.planknect.tv.service/snooze', params: { id: m.id } });
  buttons.push({ label: 'Fechar', onclick: 'luna://com.planknect.tv.service/dismiss', params: { id: m.id } });
  alertWithButtons(m.id, html, buttons, head + ': ' + m.title + ' (' + fmt(m.start) + ')', { open: 'event:' + m.id });
}

function check() {
  var now = Date.now(), lead = state.leadMin * 60000, watching = false;
  state.meetings.forEach(function (m) {
    if (m.end < now) return;
    watching = true;
    if (state.dismissed[m.id]) return;
    if (state.snoozed[m.id] && state.snoozed[m.id] > now) return;
    var dt = m.start - now;
    // 1º aviso: dentro da antecedência; 2º: na hora de começar
    if (dt <= lead && dt > 0 && state.shown[m.id] !== 'lead' && state.shown[m.id] !== 'start') { state.shown[m.id] = 'lead'; meetingAlert(m, false); }
    else if (dt <= 0 && dt > -60000 && state.shown[m.id] !== 'start') { state.shown[m.id] = 'start'; meetingAlert(m, true); }
    else if (state.snoozed[m.id] && state.snoozed[m.id] <= now && dt > 0) { delete state.snoozed[m.id]; meetingAlert(m, false); }
  });
  if (state.token && now - state.lastPoll > 30000) { state.lastPoll = now; pollServer(); watching = true; }
  if (watching) hold(); else release();
}

// Avisos do PlanKnect (campainha, casa, recados) — GET /api/tv/alerts
function pollServer() {
  var u = url.parse(state.apiBase + '/alerts?since=' + (state.since || 0));
  var req = https.request({ hostname: u.hostname, path: u.path, method: 'GET', headers: { Authorization: 'Bearer ' + state.token } }, function (res) {
    var body = ''; res.on('data', function (c) { body += c; });
    res.on('end', function () {
      try {
        var j = JSON.parse(body); state.since = j.now || Date.now();
        (j.alerts || []).forEach(function (a) { generic(a); });
      } catch (e) {}
    });
  });
  req.on('error', function () {});
  req.end();
}

function generic(a) {
  var html = '<b>' + esc(a.title) + '</b>' + (a.body ? '<br/>' + esc(a.body) : '');
  alertWithButtons(a.id || String(Date.now()), html,
    [{ label: 'Abrir', onclick: 'luna://com.webos.applicationManager/launch', params: launchParams({ alert: a }) },
     { label: 'Ok', onclick: 'luna://com.planknect.tv.service/dismiss', params: { id: a.id } }],
    a.title, { alert: a });
}

/* ---------- comandos ---------- */
service.register('configure', function (msg) {
  var p = msg.payload || {};
  if (p.meetings) state.meetings = p.meetings;
  if (p.leadMin) state.leadMin = p.leadMin;
  if (p.snoozeMin) state.snoozeMin = p.snoozeMin;
  if (p.apiBase) state.apiBase = p.apiBase;
  state.token = p.token || null;
  (p.dismissed || []).forEach(function (id) { state.dismissed[id] = true; });
  check();
  msg.respond({ returnValue: true, watching: state.meetings.length });
});
service.register('snooze', function (msg) {
  var id = msg.payload.id, m = state.meetings.filter(function (x) { return x.id === id; })[0];
  var until = Date.now() + state.snoozeMin * 60000;
  if (m && m.start > Date.now()) until = Math.min(until, m.start);
  state.snoozed[id] = until; state.shown[id] = 'lead';
  msg.respond({ returnValue: true, until: until });
});
service.register('dismiss', function (msg) {
  if (!msg.payload.soft) state.dismissed[msg.payload.id] = true;
  msg.respond({ returnValue: true });
});
service.register('notify', function (msg) { generic(msg.payload || {}); msg.respond({ returnValue: true }); });
service.register('status', function (msg) {
  msg.respond({ returnValue: true, meetings: state.meetings.length, leadMin: state.leadMin, alive: !!keepAlive, hasToken: !!state.token });
});

setInterval(check, 15000);
