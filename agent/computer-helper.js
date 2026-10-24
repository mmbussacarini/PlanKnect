/* PlanKnect — ajudante do computador (Mac/PC ligado na TV pelo HDMI).
 * A TV pede "entrar na reunião" e este serviço abre o link no navegador do computador, que aparece
 * na janela do modo Computador. Sem dependências.
 *  - Só abre links de reunião: Google Meet, Zoom e Microsoft Teams.
 *  - Exige o segredo (PK_SECRET) configurado também na TV (config.computer.secret).
 * Uso: PK_SECRET=xxxx node computer-helper.js   (porta 8788; PK_PORT muda) */
const http = require('http');
const { execFile } = require('child_process');
const SECRET = process.env.PK_SECRET || '';
const PORT = +process.env.PK_PORT || 8788;
const ALLOW = /^https:\/\/(meet\.google\.com|([a-z0-9-]+\.)?zoom\.us|teams\.microsoft\.com|teams\.live\.com)\//i;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(obj));
}
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url === '/status') return send(res, 200, { ok: true, name: require('os').hostname(), platform: process.platform });
  if (req.method === 'POST' && req.url === '/open') {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 4096) req.destroy(); });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
      if (!SECRET || j.secret !== SECRET) return send(res, 401, { error: 'segredo inválido' });
      if (!ALLOW.test(j.url || '')) return send(res, 400, { error: 'só links do Meet, Zoom ou Teams' });
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
      execFile(cmd, [j.url], (err) => { if (err) return send(res, 500, { error: err.message }); log('abrindo', j.url); send(res, 200, { ok: true }); });
    });
    return;
  }
  send(res, 404, { error: 'rota' });
}).listen(PORT, () => log(`PlanKnect computer helper em http://0.0.0.0:${PORT}`));
