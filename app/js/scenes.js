/* Biblioteca de cenários: fotos reais (zoom lento "Ken Burns") e vídeos em loop.
 * No protótipo os arquivos vêm direto de bancos gratuitos (Unsplash / Mixkit).
 * Em produção o PlanKnect manda a lista em `scenes` do /dashboard, hospedada no próprio CDN.
 * Se o vídeo/foto não carregar, cai num cenário animado em CSS (sem rede). */
var PK = window.PK || {};
window.PK = PK;

PK.scenes = (function () {
  var US = function (id) { return 'https://images.unsplash.com/photo-' + id + '?w=1920&h=1080&q=80&fit=crop&auto=format'; };
  var MX = function (id, q) { return 'https://assets.mixkit.co/videos/' + id + '/' + id + '-' + (q || 1080) + '.mp4'; };

  var LIB = [
    // fundos de escritório (pensados para a câmera)
    { id: 'office-green', name: 'Home office verde', kind: 'photo', src: US('1600494603989-9650cf6ddd3d'), tags: ['office'], credit: 'Unsplash' },
    { id: 'library-warm', name: 'Biblioteca aconchegante', kind: 'photo', src: US('1642548083429-2283c4af718c'), tags: ['office'], credit: 'Unsplash' },
    { id: 'study-classic', name: 'Escritório clássico', kind: 'photo', src: US('1780245994167-cbb318c6660b'), tags: ['office'], credit: 'Unsplash' },
    { id: 'loft', name: 'Loft industrial', kind: 'photo', src: US('1497366811353-6870744d04b2'), tags: ['office'], credit: 'Unsplash' },
    { id: 'desk-evening', name: 'Mesa ao entardecer', kind: 'photo', src: US('1786640660909-a77524348b82'), tags: ['office', 'evening'], credit: 'Unsplash' },
    { id: 'books-video', name: 'Estante (vídeo)', kind: 'video', src: MX(50729), tags: ['office'], credit: 'Mixkit' },
    { id: 'leaves-sun', name: 'Luz entre folhas (vídeo)', kind: 'video', src: MX(1709), tags: ['nature', 'morning'], credit: 'Mixkit' },
    { id: 'leaves-macro', name: 'Folhas ao vento (vídeo)', kind: 'video', src: MX(125), tags: ['nature', 'office'], credit: 'Mixkit' },
    // casa e natureza (tela inicial e modo ambiente)
    { id: 'living-cozy', name: 'Sala aconchegante', kind: 'photo', src: US('1770736158887-9a0f3702416e'), tags: ['home', 'afternoon'], credit: 'Unsplash' },
    { id: 'living-nordic', name: 'Sala nórdica', kind: 'photo', src: US('1761319914911-71b059a655d8'), tags: ['home', 'morning'], credit: 'Unsplash' },
    { id: 'beach-sunset', name: 'Pôr do sol na praia (vídeo)', kind: 'video', src: MX(44498), tags: ['nature', 'evening'], credit: 'Mixkit' },
    { id: 'waves', name: 'Ondas na areia (vídeo)', kind: 'video', src: MX(5016), tags: ['nature', 'afternoon'], credit: 'Mixkit' },
    { id: 'city-dusk', name: 'Cidade ao anoitecer (vídeo)', kind: 'video', src: MX(41375), tags: ['city', 'night'], credit: 'Mixkit' },
    { id: 'rain-window', name: 'Chuva na janela (vídeo)', kind: 'video', src: MX(2846), tags: ['rain'], credit: 'Mixkit' },
    { id: 'fireplace', name: 'Lareira (vídeo)', kind: 'video', src: MX(1242), tags: ['home', 'night'], credit: 'Mixkit' },
    // animados, sem rede
    { id: 'aurora', name: 'Aurora (animado)', kind: 'css', css: 'aurora', tags: ['abstract'] },
    { id: 'ocean-css', name: 'Oceano (animado)', kind: 'css', css: 'ocean', tags: ['abstract'] },
    { id: 'minimal', name: 'Minimal (animado)', kind: 'css', css: 'minimal', tags: ['abstract'] }
  ];
  var extra = [];
  function all() { return extra.length ? extra.concat(LIB) : LIB; }
  function setRemote(list) { extra = (list || []).filter(function (s) { return s && s.id && s.src; }); }
  function get(id) { return all().filter(function (s) { return s.id === id; })[0] || LIB[0]; }

  // Fundo automático da tela inicial conforme a hora e o tempo
  function auto(weather) {
    var h = new Date().getHours();
    if (weather && weather.code >= 51 && weather.code < 70) return 'rain-window';
    if (h < 11) return 'living-nordic';
    if (h < 17) return 'living-cozy';
    if (h < 20) return 'beach-sunset';
    return 'fireplace';
  }

  function cssScene(name) {
    var waves = name === 'ocean'
      ? '<svg class="waves" viewBox="0 0 3840 400" preserveAspectRatio="none"><path d="M0 200 Q240 120 480 200 T960 200 T1440 200 T1920 200 T2400 200 T2880 200 T3360 200 T3840 200 V400 H0Z"/></svg>' +
        '<svg class="waves w2" viewBox="0 0 3840 400" preserveAspectRatio="none"><path d="M0 220 Q320 150 640 220 T1280 220 T1920 220 T2560 220 T3200 220 T3840 220 V400 H0Z"/></svg>' : '';
    return '<div class="scene scene-' + name + '"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i>' + waves + '<i class="grain"></i></div>';
  }

  // Monta o cenário dentro de `el`. Vídeo: começa invisível e aparece quando tem quadro.
  function mount(el, id, opts) {
    var s = get(id), html;
    opts = opts || {};
    if (s.kind === 'css') html = cssScene(s.css);
    else if (s.kind === 'photo') html = '<div class="scene scene-photo"><div class="kb" style="background-image:url(\'' + s.src + '\')"></div></div>';
    else html = '<div class="scene scene-video">' + cssScene('aurora') + '<video muted autoplay loop playsinline preload="auto" src="' + s.src + '"></video></div>';
    el.innerHTML = html + (opts.shade ? '<div class="scene-shade ' + opts.shade + '"></div>' : '');
    el.setAttribute('data-scene', s.id);
    var v = el.querySelector('video');
    if (v) {
      v.addEventListener('playing', function () { v.className = 'on'; });
      v.addEventListener('error', function () { v.parentNode && v.parentNode.removeChild(v); });
      var p = v.play && v.play(); if (p && p.catch) p.catch(function () {});
    }
    var kb = el.querySelector('.kb');
    if (kb) {
      var img = new Image();
      img.onload = function () { kb.className = 'kb on'; };
      img.onerror = function () { el.querySelector('.scene').outerHTML = cssScene('aurora'); };
      img.src = s.src;
    }
    return s;
  }

  return { all: all, get: get, mount: mount, auto: auto, setRemote: setRemote, cssScene: cssScene };
})();
