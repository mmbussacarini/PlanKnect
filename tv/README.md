# PlanKnect na TV

O mesmo app (`../app`) roda na **Samsung** e na **LG**. Ele entra como um app normal da TV: o sistema continua o mesmo e o PlanKnect aparece junto com Netflix, YouTube etc.

## Samsung (Tizen)

Testado na Samsung QA75Q60B (2022). Serve para Samsung Tizen de 2018 em diante.

### 1. Preparar o computador (uma vez)
1. Instale o **Tizen Studio** (só a CLI basta) e o **Java 8**.
   No Mac com chip Apple, instale a CLI sem o Package Manager e use um Java 8 portátil (veja `docs/SAMSUNG_TIZEN.md`).
2. Crie o certificado de autor:
   ```bash
   tizen certificate -a planknect -p <senha> -c BR -o PlanKnect
   tizen security-profiles add -n PlanKnect -a ~/tizen-studio-data/keystore/author/planknect.p12 -p <senha>
   ```

### 2. Ligar o modo desenvolvedor na TV (uma vez)
1. Na TV, abra **Apps**. No controle, digite **1 2 3 4 5**. Se o controle não tiver números, use o teclado numérico do app **SmartThings** no celular.
2. Ligue **Developer mode**, coloque o **IP do computador** e confirme.
3. **Desligue a TV da tomada** por 10 segundos e ligue de novo.

### 3. Instalar
```bash
cd tv/samsung
./build-tizen.sh PlanKnect <IP-da-TV>
```
O PlanKnect aparece em **Apps**. Para deixá-lo na tela inicial, segure OK sobre ele e escolha **Adicionar à tela inicial**.

### Na Samsung tem também
- **Modo Computador:** o HDMI numa janela, com o PlanKnect em volta. Use o botão Entrada ou Ajustes › Computador está no.
- **Entrar na reunião no computador:** precisa do `agent/computer-helper.js` rodando no computador ligado à TV. Configure em `app/js/config.local.js`:
  ```js
  PK.config.computer = { url: 'http://<IP-do-computador>:8788', secret: '<segredo>' };
  ```
  e no computador: `PK_SECRET=<segredo> node agent/computer-helper.js`.
- **Microfone:** a Samsung **não libera** o microfone do controle para apps. Para falar com o Alfred, ligue uma **webcam USB com microfone** na TV.

## LG (webOS)

### 1. Preparar
1. Instale a CLI: `npm i -g @webos-tools/cli`.
2. Na TV, instale o app **Developer Mode** (LG Content Store), entre com a conta LG Developer, ligue **Dev Mode Status** e **Key Server**.
3. Registre a TV: `ares-setup-device` (IP da TV, porta 9922, usuário `prisoner`), depois `ares-novacom --device tv --getkey` com a passphrase mostrada na TV.

### 2. Instalar
```bash
cd tv/lg
./build-lg.sh tv
```

### Na LG tem também
- **Avisos por cima de qualquer app**, até sobre a Netflix: vêm do serviço `tv/lg/service`, instalado junto.
- **Botões coloridos** do controle: vermelho = Início, verde = Agenda, amarelo = Missões, azul = Listas.
- **Microfone:** o ditado do teclado da LG e um microfone USB funcionam com o Alfred.
- O **Modo Computador** (HDMI numa janela) é só na Samsung, porque a LG não tem API pública para isso.
- O Developer Mode da LG expira a cada 50 horas. Renove no app Developer Mode ou use o agente (`agent/`).

## Controle remoto

| Tecla | Faz |
|---|---|
| Setas / OK | navegar / abrir |
| Voltar | fechar / voltar |
| Vermelho · Verde · Amarelo · Azul | Início · Agenda · Missões · Listas |
| Microfone (LG) | Alfred ouvindo |
| Botão **Alfred** no topo | resumo do dia, sugestões e conversa |
| Botões **Reunião** e **Computador** no topo | Sala de reunião e Modo Computador |

## Atualizações

O app confere `version.json` a cada 2 minutos e recarrega sozinho quando há versão nova. Na TV, as atualizações chegam ao reinstalar com o build. No Nest Hub chegam sozinhas, porque ele abre a versão hospedada.
