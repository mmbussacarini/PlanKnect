# PlanKnect Home Agent

Programa pequeno que roda na rede de casa (Raspberry Pi, NAS ou junto do Home Assistant) e faz o que a nuvem não consegue:

| Função | Como |
|---|---|
| Ligar a TV nas rotinas (6h45 manhã, 20h noite) | Wake-on-LAN + abre o PlanKnect com `{ routine }` |
| Avisos por cima de qualquer app | Toast/alerta da LG pela rede (SSAP) |
| Reunião em X min (se o serviço da TV não estiver ativo) | Lê a agenda do PlanKnect e avisa |
| LG ThinQ | Estado e controle de lava e seca, lava-louças, geladeira, ar, robô |
| Campainha | `POST /doorbell` (de Ring/UniFi/Home Assistant) vira aviso na TV |
| nest-hub | Mantém o PlanKnect na tela do Google Nest Hub (`cast_hub.py`); só abre quando o Hub está ocioso, nunca interrompe música ou YouTube |

## Instalar
```bash
cp config.example.json config.json
```
```bash
npm install
```
```bash
pip3 install pychromecast
```
```bash
npm start
```
1. Em `config.json`: IP e MAC da TV, `planknect.apiBase` + `planknect.token` (opcional, veja abaixo) e o Personal Access Token do ThinQ (https://connect-pat.lgthinq.com).
2. Na TV: Configurações → Geral → Dispositivos → **Ligar via Wi-Fi** (para o Wake-on-LAN) e aceite "Permitir conexão" na primeira vez.
3. No app da TV, em `js/config.js`: `agentUrl: 'http://IP-DO-AGENTE:8787'`.

## API local
- `GET /status`, `GET /devices`
- `POST /devices/:id/control` com `{ power, target, start, dock }`
- `POST /notify` com `{ title, body }`
- `POST /doorbell` com `{ secret, camera, image }`
- `POST /routine/morning` · `POST /routine/bedtime` · `POST /tv/on` · `POST /tv/off`
- `POST /nest-hub/show` (abre o nest-hub agora, mesmo se o Hub estiver ocupado)

## A testar com a TV
- Pareamento SSAP sem manifesto assinado (se recusar, trocar `lib/tv.js` pela biblioteca `lgtv2`).
- `createAlert` com botões via rede (se recusar, o agente usa toast).
- Região e campos do ThinQ Connect para cada modelo de aparelho.

## O que o agente precisa do PlanKnect (Lovable)

O agente usa a mesma API da TV (`docs/PLANKNECT_TV_API.md`). Para falar com ela, precisa de:

| Item | Onde fica | Quem gera |
|---|---|---|
| `planknect.apiBase` | `config.json` | Lovable: `https://<project-ref>.supabase.co/functions/v1/tv` |
| `planknect.token` | `config.json` | Lovable: botão **"Criar token do agente"** em Configurações → Dispositivos. Cria uma linha em `tv_devices` com `name = 'Agente de casa'` e mostra o token uma única vez |
| `planknect.owner` | `config.json` | Id do membro dono da TV (vem do `/dashboard`) |

Com o token, o agente:
- lê `GET /dashboard` para avisar das reuniões quando o serviço da TV não estiver ativo;
- pode mandar estados do ThinQ para o PlanKnect. Isso é opcional: se o ThinQ estiver configurado no PlanKnect (cron no servidor), o agente nem precisa do PAT.

Quando faz sentido usar o ThinQ **no agente** e não no servidor:
- quando a família não quer guardar o token do ThinQ na nuvem;
- quando se quer resposta mais rápida na rede local.

O app da TV lê os aparelhos direto do agente quando `agentUrl` está configurado em `js/config.js`.

## Campainha (exemplo com Home Assistant)
```yaml
rest_command:
  planknect_doorbell:
    url: "http://IP-DO-AGENTE:8787/doorbell"
    method: POST
    content_type: "application/json"
    payload: '{"secret":"troque-isto","camera":"Entrada","image":"{{ snapshot_url }}"}'
```
