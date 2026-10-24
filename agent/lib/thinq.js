/* LG ThinQ Connect API (oficial, 2024+). Gere um Personal Access Token em
 * https://connect-pat.lgthinq.com e confira no portal do ThinQ Developer:
 * região (aic = Américas, eic = Europa, kic = Ásia/Oceania), x-api-key e nomes dos campos de cada aparelho.
 * Os mapeamentos abaixo são defensivos: campos que não existirem viram "desconhecido". */
const crypto = require('crypto');

const API_KEY = 'v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3'; // chave pública do ThinQ Connect (conferir na documentação)
const TYPES = { DEVICE_WASHER: 'washer', DEVICE_DRYER: 'dryer', DEVICE_WASHTOWER: 'washer', DEVICE_DISH_WASHER: 'dishwasher',
  DEVICE_REFRIGERATOR: 'fridge', DEVICE_AIR_CONDITIONER: 'ac', DEVICE_ROBOT_CLEANER: 'robot' };

class ThinQ {
  constructor({ pat, country = 'AU', region = 'kic' }) {
    this.pat = pat; this.country = country; this.base = `https://api-${region}.lgthinq.com`;
    this.clientId = crypto.randomUUID();
  }
  headers() {
    return { Authorization: `Bearer ${this.pat}`, 'x-country': this.country, 'x-message-id': crypto.randomBytes(16).toString('base64url').slice(0, 22),
      'x-client-id': this.clientId, 'x-api-key': API_KEY, 'x-service-phase': 'OP', 'Content-Type': 'application/json' };
  }
  async call(method, p, body) {
    const r = await fetch(this.base + p, { method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`ThinQ ${r.status}: ${JSON.stringify(j.error || j)}`);
    return j.response !== undefined ? j.response : j;
  }
  async devices() {
    const list = await this.call('GET', '/devices');
    const out = [];
    for (const d of list || []) {
      const type = TYPES[d.deviceInfo && d.deviceInfo.deviceType]; if (!type) continue;
      let st = {}; try { st = await this.call('GET', `/devices/${d.deviceId}/state`); } catch (e) {}
      out.push(map(d.deviceId, type, (d.deviceInfo.alias || type), st));
    }
    return out;
  }
  control(id, type, cmd) {
    let body = {};
    if (type === 'ac') {
      if (cmd.power !== undefined) body.operation = { airConOperationMode: cmd.power ? 'POWER_ON' : 'POWER_OFF' };
      if (cmd.target !== undefined) body.temperature = { targetTemperature: cmd.target, unit: 'C' };
    }
    if (type === 'robot') body.operation = { cleanOperationMode: cmd.start ? 'START' : 'HOMING' };
    return this.call('POST', `/devices/${id}/control`, body);
  }
}

function first(x) { return Array.isArray(x) ? x[0] : x; }
function map(id, type, name, s) {
  const run = first(s.runState) || {}, timer = first(s.timer) || {}, temp = s.temperature, op = s.operation || {};
  const d = { id, type, name, room: '' };
  if (type === 'washer' || type === 'dryer' || type === 'dishwasher') {
    const cur = String(run.currentState || '').toUpperCase();
    d.state = /RUNNING|RINSING|SPINNING|DRYING|WASHING/.test(cur) ? 'running' : /END|COMPLETE/.test(cur) ? 'done' : 'idle';
    d.endsIn = (timer.remainHour || 0) * 60 + (timer.remainMinute || 0);
    d.detail = cur.toLowerCase();
  }
  if (type === 'fridge') {
    const t = Array.isArray(temp) ? temp : [];
    const f = t.find((x) => /FRIDGE/i.test(x.locationName || '')) || t[0] || {};
    const z = t.find((x) => /FREEZER/i.test(x.locationName || '')) || t[1] || {};
    d.fridge = f.targetTemperature; d.freezer = z.targetTemperature;
    d.door = [].concat(s.doorStatus || []).some((x) => /OPEN/i.test(x.doorState || ''));
    d.state = d.door ? 'alert' : 'ok';
  }
  if (type === 'ac') {
    d.power = /POWER_ON/.test(op.airConOperationMode || '');
    d.target = temp && (temp.targetTemperature || temp.coolTargetTemperature); d.current = temp && temp.currentTemperature;
    d.mode = ((s.airConJobMode || {}).currentJobMode || '').toLowerCase();
  }
  if (type === 'robot') {
    d.state = /CLEAN/.test(run.currentState || '') ? 'cleaning' : 'charging';
    d.battery = (s.battery || {}).level || (s.battery || {}).percent;
  }
  return d;
}
module.exports = ThinQ;
