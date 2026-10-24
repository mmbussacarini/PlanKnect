/* PlanKnect Home Agent — roda na rede de casa (Raspberry Pi, NAS ou add-on do Home Assistant).
 *  - Rotinas: liga a TV (Wake-on-LAN) e abre o PlanKnect na rotina da manhã/noite
 *  - Avisos por cima de qualquer app (toast/alerta da LG): reunião, campainha, casa, recados
 *  - LG ThinQ: estado e controle dos aparelhos; transições viram aviso na TV
 *  - API local para o app da TV (config.agentUrl no app): /devices, /notify, /doorbell, /routine/:nome
 * Uso: cp config.example.json config.json && npm install && npm start */
const http = require('http');
const fs = require('fs');
const path = require('path');
const TV = require('./lib/tv');
const ThinQ = require('./lib/thinq');
const wake = require('./lib/wol');
const { execFile } = require('child_process');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const tv = new TV({ ip: cfg.tv.ip });
const thinq = cfg.thinq && cfg.thinq.pat ? new ThinQ(cfg.thinq) : null;
const APP = cfg.tv.appId || 'com.planknect.tv';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let devices = [];
const prev = {};
const done = {};      // rotinas/avisos já disparados (chave = nome + data)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- TV ---------- */
async function ensureOn() {
  if (await tv.isOn()) return true;
  log('TV desligada — enviando Wake-on-LAN');
  await wake(cfg.tv.mac).catch((e) => log('WoL falhou', e.message));
  for (let i = 0; i < 15; i++) { await sleep(3000); if (await tv.isOn()) return true; }
  return false;
}
async function notify(a) {
  const html = `<b>${a.title}</b>${a.body ? '<br/>' + a.body : ''}`;
  const open = { label: 'Abrir', onclick: 'luna://com.webos.applicationManager/launch', params: { id: APP, params: { alert: a } } };
  try { await tv.alert(html, [open, { label: 'Ok' }]); log('aviso:', a.title); }
  catch (e) { log('TV indisponível para aviso:', e.message); }
}
async function runRoutine(name) {
  log('rotina', name);
  if (!(await ensureOn())) return log('TV não respondeu');
  await tv.launch(APP, { routine: name }).catch((e) => log('launch falhou', e.message));
}

/* ---------- agenda: reuniões (fallback quando o serviço da TV não está ativo) ---------- */
async function planknectMeetings() {
  const p = cfg.planknect; if (!p || !p.token) return [];
  const from = new Date(), to = new Date(Date.now() + 864e5);
  const r = await fetch(`${p.apiBase}/dashboard?from=${from.toISOString()}&to=${to.toISOString()}`, { headers: { Authorization: `Bearer ${p.token}` } });
  if (!r.ok) throw new Error('PlanKnect ' + r.status);
  const j = await r.json();
  return (j.events || []).filter((e) => e.type === 'meeting' && !e.allDay && (!e.members || !e.members.length || e.members.includes(p.owner)));
}
async function meetingTick() {
  let list = []; try { list = await planknectMeetings(); } catch (e) { return; }
  const lead = (cfg.planknect.meetingLeadMin || 5) * 60000, now = Date.now();
  for (const e of list) {
    const dt = Date.parse(e.start) - now;
    if (dt <= lead && dt > 0 && !done['m-lead-' + e.id]) { done['m-lead-' + e.id] = 1; await notify({ kind: 'meeting', title: `Reunião em ${Math.round(dt / 60000)} min`, body: e.title, open: 'event:' + e.id }); }
    if (dt <= 0 && dt > -60000 && !done['m-start-' + e.id]) { done['m-start-' + e.id] = 1; await notify({ kind: 'meeting', title: 'Começou agora', body: e.title }); }
  }
}

/* ---------- rotinas ---------- */
function routineTick() {
  const now = new Date(), hhmm = now.toTimeString().slice(0, 5), day = now.toDateString();
  for (const [name, r] of Object.entries(cfg.routines || {})) {
    if (r.start === hhmm && r.days.includes(now.getDay()) && done[name] !== day) { done[name] = day; runRoutine(name); }
  }
}

/* ---------- ThinQ ---------- */
async function thinqTick() {
  if (!thinq) return;
  try { devices = await thinq.devices(); } catch (e) { return log(e.message); }
  for (const d of devices) {
    const p = prev[d.id];
    if (p && ['washer', 'dryer', 'dishwasher'].includes(d.type) && p.state === 'running' && d.state === 'done') notify({ kind: 'device', title: `${d.name} terminou`, body: d.detail });
    if (p && d.type === 'fridge' && d.door && !p.door) notify({ kind: 'device', title: 'Porta da geladeira aberta', body: 'Feche para não perder o frio' });
    prev[d.id] = { state: d.state, door: d.door };
  }
}

/* ---------- Nest Hub: manter o PlanKnect nest-hub na tela ---------- */
// Só abre quando o Hub está ocioso e dentro do horário; nunca interrompe música/YouTube.
function hubCast(force) {
  const h = cfg.nestHub; if (!h || !h.name) return Promise.resolve({ ok: false, action: 'disabled' });
  const args = [path.join(__dirname, 'cast_hub.py'), h.name, h.url];
  if (h.receiverId) args.push('--receiver=' + h.receiverId);
  if (force) args.push('--force');
  return new Promise((resolve) => execFile(h.python || 'python3', args, { timeout: 40000 }, (err, out) => {
    let r = { ok: false, action: 'error', error: err && err.message };
    try { r = JSON.parse(String(out).trim().split('\n').pop()); } catch (e) {}
    if (r.action === 'cast') log('nest-hub: PlanKnect aberto no', h.name);
    resolve(r);
  }));
}
function hubTick() {
  const h = cfg.nestHub; if (!h || !h.keepAlive) return;
  const now = new Date().toTimeString().slice(0, 5);
  if (now >= (h.from || '06:00') && now <= (h.to || '22:00')) hubCast(false);
}

/* ---------- API local ---------- */
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(obj));
}
function body(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); }); }

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const u = new URL(req.url, 'http://x'), parts = u.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'GET' && u.pathname === '/status') return send(res, 200, { ok: true, tvOn: await tv.isOn(), devices: devices.length, thinq: !!thinq });
    if (req.method === 'GET' && u.pathname === '/devices') return send(res, 200, { devices });
    if (req.method === 'POST' && parts[0] === 'devices' && parts[2] === 'control') {
      const d = devices.find((x) => x.id === parts[1]); if (!d || !thinq) return send(res, 404, { error: 'aparelho' });
      await thinq.control(d.id, d.type, await body(req)); setTimeout(thinqTick, 2000);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && u.pathname === '/notify') { await notify(await body(req)); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && u.pathname === '/doorbell') {
      const b = await body(req);
      if (cfg.doorbell && cfg.doorbell.secret && b.secret !== cfg.doorbell.secret) return send(res, 401, { error: 'secret' });
      await notify({ kind: 'door', title: 'Tem alguém na porta', body: b.camera || 'Campainha', image: b.image });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && parts[0] === 'routine') { runRoutine(parts[1]); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && u.pathname === '/nest-hub/show') return send(res, 200, await hubCast(true));
    if (req.method === 'POST' && u.pathname === '/tv/on') return send(res, 200, { ok: await ensureOn() });
    if (req.method === 'POST' && u.pathname === '/tv/off') { await tv.off(); return send(res, 200, { ok: true }); }
    send(res, 404, { error: 'rota' });
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(cfg.port || 8787, () => log(`PlanKnect Home Agent em http://0.0.0.0:${cfg.port || 8787}`));

setInterval(routineTick, 20000);
setInterval(hubTick, ((cfg.nestHub && cfg.nestHub.everySeconds) || 120) * 1000);
hubTick();
setInterval(meetingTick, 30000);
setInterval(thinqTick, (cfg.thinq && cfg.thinq.pollSeconds || 60) * 1000);
thinqTick();
