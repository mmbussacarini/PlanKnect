/* Câmeras (WebRTC ao vivo) e player de gravações do Knect Meeting — usado pela TV.
 *  PK.camera.open(deviceId, title)  → POST /door/live { deviceId, offerSdp } → { answerSdp, sessionId, expiresAt }
 *  PK.player.open(url, title, kind) → <video>/<audio> nativo (aceleração de hardware), URL assinada temporária
 * Controle: OK = play/pausa · ◀▶ = 10 s · Voltar = fecha. */
var PK = window.PK || {};
window.PK = PK;

(function () {
  var U = PK.util, I = PK.icons, esc = U.esc;
  function layer(id) {
    var el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.className = 'media-layer'; (document.getElementById('stage') || document.body).appendChild(el); }
    return el;
  }

  /* ---------- câmera ao vivo ---------- */
  var pc = null, camEl = null;
  function camOpen(deviceId, title) {
    camEl = layer('cam-layer');
    camEl.innerHTML = '<video id="cam-video" autoplay playsinline muted></video><div class="md-top"><span class="md-live"><i></i>AO VIVO</span><b>' + esc(title || 'Câmera') + '</b><em>Voltar fecha</em></div><div class="md-msg" id="cam-msg"><span class="spin"></span> Conectando à câmera…</div>';
    camEl.classList.add('on');
    if (!window.RTCPeerConnection) return camMsg('Esta TV não suporta vídeo ao vivo (WebRTC).');
    try {
      pc = new RTCPeerConnection();
      // ordem exigida pelo Google Device Access: áudio, vídeo, canal de dados
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.createDataChannel('dataSendChannel');
      pc.ontrack = function (ev) { var v = document.getElementById('cam-video'); if (v && ev.streams[0]) { v.srcObject = ev.streams[0]; var m = document.getElementById('cam-msg'); if (m) m.style.display = 'none'; } };
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o).then(function () { return PK.api.doorLive(o.sdp, deviceId); }); })
        .then(function (r) { return pc.setRemoteDescription({ type: 'answer', sdp: r.answerSdp }); })
        .catch(function (e) { camMsg('Não consegui abrir a câmera agora (' + esc(e.message) + ').'); });
    } catch (e) { camMsg('Não consegui abrir a câmera.'); }
  }
  function camMsg(t) { var m = document.getElementById('cam-msg'); if (m) { m.innerHTML = t; m.style.display = 'block'; } }
  function camClose() { if (pc) { try { pc.close(); } catch (e) {} pc = null; } if (camEl) { camEl.classList.remove('on'); camEl.innerHTML = ''; } }

  /* ---------- player de gravações ---------- */
  var plEl = null;
  function plOpen(url, title, kind) {
    plEl = layer('player-layer');
    var tag = kind === 'audio' ? 'audio' : 'video';
    plEl.innerHTML = '<' + tag + ' id="pl-media" autoplay src="' + esc(url) + '"></' + tag + '>' + (tag === 'audio' ? '<div class="md-audio">' + I.get('mic', 90) + '</div>' : '') +
      '<div class="md-top"><span class="md-rec">' + I.get('video', 20) + ' GRAVAÇÃO</span><b>' + esc(title || '') + '</b><em>OK pausa · ◀ ▶ 10 s · Voltar fecha</em></div>' +
      '<div class="md-bar"><span id="pl-cur">0:00</span><i><i id="pl-prog"></i></i><span id="pl-dur">–</span></div>';
    plEl.classList.add('on');
    var m = document.getElementById('pl-media');
    m.addEventListener('timeupdate', function () {
      var f = function (s) { s = Math.floor(s || 0); return Math.floor(s / 60) + ':' + U.pad(s % 60); };
      document.getElementById('pl-cur').textContent = f(m.currentTime); document.getElementById('pl-dur').textContent = f(m.duration);
      document.getElementById('pl-prog').style.width = (m.duration ? m.currentTime / m.duration * 100 : 0) + '%';
    });
    m.addEventListener('error', function () { PK.toast('A gravação não abriu (o link pode ter expirado)'); });
  }
  function plClose() { if (plEl) { var m = document.getElementById('pl-media'); if (m) m.pause(); plEl.classList.remove('on'); plEl.innerHTML = ''; } }
  function plKey(k) {
    var m = document.getElementById('pl-media'); if (!m) return;
    if (k === 'ok') { if (m.paused) m.play(); else m.pause(); }
    if (k === 'left') m.currentTime = Math.max(0, m.currentTime - 10);
    if (k === 'right') m.currentTime = Math.min(m.duration || 1e9, m.currentTime + 10);
  }

  PK.camera = { open: camOpen, close: camClose, active: function () { return !!(camEl && camEl.classList.contains('on')); } };
  PK.player = { open: plOpen, close: plClose, key: plKey, active: function () { return !!(plEl && plEl.classList.contains('on')); } };
})();
