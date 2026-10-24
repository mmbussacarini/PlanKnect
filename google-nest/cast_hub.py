"""Mantém o PlanKnect nest-hub na tela do Google Nest Hub.

Uso:  python3 cast_hub.py "Kitchen Display" https://planknect.com/hub/nest-hub.html [--force]
Só abre o PlanKnect se o Hub estiver ocioso (tela inicial / moldura de fotos). Nunca interrompe
música, YouTube, chamadas ou outro app, a não ser com --force.
Saída (uma linha JSON): {"ok":true,"action":"cast"|"already"|"busy"|"notfound","app":"..."}
Requer: pip install pychromecast
Receptor: DashCast (público, id 84912283) até o PlanKnect registrar o próprio receptor Cast.
"""
import json, sys, time, warnings
warnings.filterwarnings("ignore")
import pychromecast
from pychromecast.controllers.dashcast import DashCastController

IDLE_APPS = {None, "E8C28D3C"}            # sem app / Backdrop (tela inicial do Hub)
OURS = {"84912283"}                        # DashCast (+ id do receptor PlanKnect quando existir)

def main():
    name, url = sys.argv[1], sys.argv[2]
    force = "--force" in sys.argv
    if len(sys.argv) > 3 and sys.argv[3].startswith("--receiver="):
        OURS.add(sys.argv[3].split("=", 1)[1])
    casts, browser = pychromecast.get_listed_chromecasts(friendly_names=[name], timeout=10)
    try:
        if not casts:
            return print(json.dumps({"ok": False, "action": "notfound"}))
        cc = casts[0]; cc.wait(timeout=10)
        app = cc.status.app_id if cc.status else None
        if app in OURS and not force:
            return print(json.dumps({"ok": True, "action": "already", "app": app}))
        if app not in IDLE_APPS and not force:
            return print(json.dumps({"ok": True, "action": "busy", "app": cc.status.display_name}))
        # Com force=True o DashCast troca a própria página pela nossa e para de ouvir comandos;
        # para recarregar é preciso fechar a sessão e abrir de novo.
        if app in OURS:
            cc.quit_app(); time.sleep(3)
        d = DashCastController(); cc.register_handler(d)
        d.load_url(url, force=True)
        time.sleep(4)
        print(json.dumps({"ok": True, "action": "cast", "app": "DashCast"}))
    finally:
        browser.stop_discovery()

if __name__ == "__main__":
    main()
