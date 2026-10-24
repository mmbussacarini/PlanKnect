# PlanKnect TV na Samsung (Tizen), sem trocar o sistema

A Samsung da sala roda **o mesmo app da LG**, instalado como um app normal da TV. O sistema dela fica como está, e o app só se soma à tela inicial.

## A TV encontrada na rede (24/10)

| Item | Valor |
|---|---|
| Modelo | Samsung **QA75Q60BAWXXY** (Q60B 75", linha 2022) |
| Sistema | **Tizen** (Samsung Smart TV, API local 2.0.25) |
| Tela | 3840×2160 (4K) |
| Rede | Wi-Fi, IP **192.168.1.x**, MAC xx:xx:xx:xx:xx:xx |
| Modo desenvolvedor | desligado |
| Recursos | voz, teclado sincronizado com o celular, gamepad, AirPlay, Spotify Connect |

**Apps instalados** (já configurados no dock do PlanKnect):

| App | Id Tizen |
|---|---|
| Netflix | `3201907018807` |
| YouTube | `111299001912` |
| Prime Video | `3201910019365` |
| Disney+ | `3201901017640` |
| Spotify | `3201606009684` |
| Apple TV | `3201807016597` |
| Foxtel | `3201910019449` |

O "TV Room" que aparece na rede é a **soundbar Bose 700**, não uma TV. A LG não apareceu: deve estar desligada ou noutra rede.

## O que já está pronto no código

- `js/core.js` reconhece a Samsung (`window.tizen`):
  - registra os botões coloridos;
  - trata o **Voltar** da Samsung (código 10009);
  - abre os apps com `tizen.application.launch`;
  - usa os **ícones oficiais** instalados na TV no dock;
  - lê o modelo da TV para o pareamento.
- `js/config.js`: cada app tem o id da LG (`id`) e o da Samsung (`samsung`). Na Samsung, o último lugar do dock é o **Spotify**.
- `tizen/config.xml`: o pacote Samsung, com as permissões para abrir apps, usar o controle e acessar a internet.
- `tools/build-tizen.sh`: monta o `.wgt`, assina e instala na TV.

## Estado no Mac (24/10)

- Tizen Studio 6.1 (linha de comando) em `~/tizen-studio`, com `sdb` e `tizen`. Sem as extensões Samsung: o gerenciador de pacotes falha no Mac com chip Apple e apaga ferramentas, então não deve ser usado.
- Java 8 portátil em `~/tizen-java` (o Tizen não funciona com Java 17).
- Perfil de assinatura **PlanKnect**, com certificado de autor próprio (a senha está em `~/tizen-studio-data/planknect-cert-password.txt`) e o distribuidor padrão do Tizen.
- Pacote pronto: `dist/tizen/PlanKnect.wgt`.
- Se a TV recusar a assinatura padrão na instalação, precisaremos do certificado Samsung (conta Samsung + DUID da TV).

## Como instalar (uma vez)

1. **Modo desenvolvedor na TV:** abra **Apps**, digite `1 2 3 4 5` no controle (ou no teclado da tela), ligue **Developer mode**, coloque o IP do Mac (`192.168.1.x`) e reinicie a TV.
2. **No Mac:** instale o **Tizen Studio** e, no Package Manager, a extensão **Samsung TV** e o **Samsung Certificate Extension**.
3. **Certificado Samsung:** no Certificate Manager, crie um perfil do tipo **Samsung** e **TV**, entre com a conta Samsung e adicione o **DUID** da TV (aparece quando o Tizen Studio conecta na TV). Dê o nome `PlanKnect` ao perfil.
4. **Instalar e abrir:**
   ```bash
   tools/build-tizen.sh PlanKnect 192.168.1.x
   ```
5. O PlanKnect aparece na barra de apps da Samsung. Para abrir sozinho quando a TV liga, use as configurações de inicialização da Samsung ou o SmartThings (abaixo).

O modo desenvolvedor e o certificado de desenvolvimento servem para a **nossa TV**. Para clientes, o caminho é publicar na Samsung Seller Office (loja de apps da Samsung).

## Diferenças em relação à LG

| Recurso | LG (webOS) | Samsung (Tizen) |
|---|---|---|
| App, telas, pareamento por QR, dados | igual | igual |
| Abrir Netflix etc. | ✓ (deep link no Netflix e YouTube) | ✓ (abre o app; deep link a testar) |
| **Aviso por cima do Netflix** | serviço em segundo plano (a testar) | **não**: apps web da Samsung não aparecem por cima de outros apps. O aviso vai para o Nest Hub e para o celular |
| Ligar a TV e abrir o app de longe | agente local (Wake-on-LAN) | **SmartThings, pela nuvem**, sem agente (abaixo) |
| Voz | ditado do teclado (a testar) | botão de voz do controle (Bixby/Alexa); para o PlanKnect, o celular |

## O que a Samsung traz a mais: SmartThings

A Q60B é um aparelho **SmartThings**, e isso resolve pela nuvem o que na LG exige o agente de casa:
- **Abrir o PlanKnect na TV pelo planknect.com:** `POST https://api.smartthings.com/v1/devices/{tvId}/commands` com `{"commands":[{"component":"main","capability":"custom.launchapp","command":"launchApp","arguments":["PKnectTV01.PlanKnect"]}]}`.
- **Ligar e desligar** (com "Ligar com o celular" ativo na TV): capability `switch`, comandos `on` e `off`.
- **Rotinas:** às 6h45, o PlanKnect liga a TV e abre a rotina da manhã, tudo pela nuvem.
- **Eletrodomésticos Samsung** (se houver) aparecem na aba Casa, do mesmo jeito que os da LG ThinQ.

**Para o Lovable:**
- "Conectar SmartThings" em Configurações → Casa: OAuth do SmartThings, ou Personal Access Token para começar, com os escopos `r:devices:*` e `x:devices:*`.
- Guardar o `deviceId` da TV.
- Expor `POST /tv/samsung/launch` e `POST /tv/samsung/power` para as rotinas e para o botão "Abrir PlanKnect na TV".
