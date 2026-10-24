/* Controle da LG pela rede (SSAP sobre WebSocket, wss://IP:3001).
 * Na 1ª conexão a TV mostra "Permitir conexão?" — aceite com o controle; a chave fica em .tv-key.
 * A TESTAR: alguns firmwares exigem o manifesto assinado. Se o pareamento for recusado,
 * troque esta classe pela biblioteca "lgtv2" (Node) ou use a integração webOS do Home Assistant. */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PERMISSIONS = ['LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CONTROL_POWER', 'READ_INSTALLED_APPS', 'READ_RUNNING_APPS',
  'READ_CURRENT_CHANNEL', 'READ_POWER_STATE', 'CONTROL_AUDIO', 'CONTROL_DISPLAY', 'WRITE_NOTIFICATION_TOAST', 'WRITE_NOTIFICATION_ALERT', 'READ_APP_STATUS'];

class TV {
  constructor({ ip, keyFile }) {
    this.ip = ip; this.keyFile = keyFile || path.join(__dirname, '..', '.tv-key');
    this.ws = null; this.ready = null; this.seq = 0; this.pending = new Map();
  }
  connect(timeoutMs = 8000) {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://${this.ip}:3001`, { rejectUnauthorized: false, handshakeTimeout: timeoutMs });
      const fail = (e) => { this.ready = null; this.ws = null; reject(e); };
      ws.on('error', fail);
      ws.on('close', () => { this.ready = null; this.ws = null; });
      ws.on('message', (raw) => {
        let m; try { m = JSON.parse(raw); } catch (e) { return; }
        if (m.id === 'register') {
          if (m.type === 'registered') {
            fs.writeFileSync(this.keyFile, m.payload['client-key']);
            resolve(this);
          } else if (m.type === 'error') fail(new Error(m.error));
          return; // 'response' com pairingType PROMPT: aguardando aceite na TV
        }
        const p = this.pending.get(m.id); if (!p) return;
        this.pending.delete(m.id);
        m.type === 'error' ? p.reject(new Error(m.error)) : p.resolve(m.payload);
      });
      ws.on('open', () => {
        this.ws = ws;
        const key = fs.existsSync(this.keyFile) ? fs.readFileSync(this.keyFile, 'utf8').trim() : undefined;
        ws.send(JSON.stringify({ id: 'register', type: 'register', payload: {
          forcePairing: false, pairingType: 'PROMPT', 'client-key': key,
          manifest: { manifestVersion: 1, appVersion: '1.0', permissions: PERMISSIONS }
        } }));
      });
    });
    return this.ready;
  }
  async request(uri, payload = {}) {
    await this.connect();
    const id = 'r' + (++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, type: 'request', uri, payload }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error('timeout ' + uri)); }, 10000);
    });
  }
  toast(message, onclick) { return this.request('ssap://system.notifications/createToast', onclick ? { message, onClick: onclick } : { message }); }
  // Alerta com botões (a testar por firmware); cai para toast se recusado
  async alert(message, buttons) {
    try { return await this.request('ssap://system.notifications/createAlert', { message, buttons }); }
    catch (e) { return this.toast(message.replace(/<[^>]+>/g, ' ')); }
  }
  launch(id, params) { return this.request('ssap://system.launcher/launch', params ? { id, params } : { id }); }
  foreground() { return this.request('ssap://com.webos.applicationManager/getForegroundAppInfo'); }
  off() { return this.request('ssap://system/turnOff'); }
  async isOn() { try { await this.connect(3000); await this.foreground(); return true; } catch (e) { return false; } }
}
module.exports = TV;
