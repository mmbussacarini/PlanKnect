# PlanKnect — TV e Google Nest Hub

O PlanKnect na sala e na cozinha: agenda da família, tarefas e projetos, missões das crianças, listas de compras, deals, reuniões e o **Alfred** (o assistente com voz britânica). Os dados vêm de [planknect.com](https://planknect.com). A TV ou o Hub só mostram e enviam ações, com a permissão dada em planknect.com.

![Início na TV](screenshots/tv-home.png)

| Onde | Como instala | Guia |
|---|---|---|
| **Samsung** (Tizen 2018+) | App da TV, pelo modo desenvolvedor (não troca o sistema) | [tv/README.md](tv/README.md#samsung-tizen) |
| **LG** (webOS) | App da TV, pelo Developer Mode | [tv/README.md](tv/README.md#lg-webos) |
| **Google Nest Hub** | Nada para instalar: abre por Cast | [google-nest/README.md](google-nest/README.md) |

**Abrir no Nest Hub agora:** [https://mmbussacarini.github.io/PlanKnect/google-nest/](https://mmbussacarini.github.io/PlanKnect/google-nest/) (no Chrome do Android ou do computador).

## Estrutura

```
app/            o app web (o mesmo código roda na LG, na Samsung e no Nest Hub)
  index.html      TV (1920×1080, controle remoto)
  nest-hub.html   Nest Hub (1024×600, toque)
tv/lg/          pacote LG: appinfo.json, serviço de avisos, build-lg.sh
tv/samsung/     pacote Samsung: config.xml, build-tizen.sh
google-nest/    página “Mostrar no Nest Hub” + manter sempre ligado (Mac/Linux)
agent/          agente da casa (opcional): rotinas, LG ThinQ, campainha e “entrar na reunião” no computador
docs/           manual de uso, contrato da API do PlanKnect e notas técnicas
screenshots/    capturas de tela
```

## O que tem

- **Início:** relógio, próximo compromisso, agenda de hoje, clima, missões, mercado, jantar, recado e apps (Netflix, YouTube, Disney+, Prime, Spotify).
- **Agenda:** por pessoa, por semana e só a família.
- **Missões:** cartões por criança, enviar para aprovação, **pote de estrelas** da semana e prêmio.
- **Listas:** marcar como comprado, adicionar rápido e QR da lista para o celular.
- **Tarefas:** prioridades, projeto com cor em cada tarefa, detalhe completo (subtarefas, comentários, outras do projeto) e detalhe do projeto (saúde, atrasadas, próximas, pessoas).
- **Deals:** funil do Deal Room, valores, próximo passo, documentos, contatos e atividade.
- **Sala de reunião:** reunião atual ou próxima, QR do Meet, **Entrar no computador**, transcrição ao vivo e insights do Knect Meeting, tarefas sugeridas por projeto, fundo para câmera e aviso para a família.
- **Modo Computador** (Samsung): o computador pelo HDMI numa janela, com agenda, tarefas, deals, linha do tempo e o Alfred em volta.
- **Alfred:** resumo do dia, sugestões, “precisa de você”, comandos por texto ou voz (o PlanKnect propõe e você confirma) e memória.
- **Avisos por cima:** reunião com timer, adiar e entrar, campainha e recados da família.
- **Nest Hub:** hoje, lista, missões, tarefas, jantar com receita passo a passo, timers, clima, recados e moldura de fotos.

Mais no [manual de uso](docs/USO.md).

| | |
|---|---|
| ![Alfred](screenshots/tv-alfred.png) | ![Missões](screenshots/tv-missoes.png) |
| ![Tarefas](screenshots/tv-tarefas.png) | ![Deals](screenshots/tv-deals.png) |
| ![Sala de reunião](screenshots/tv-reuniao.png) | ![Modo Computador](screenshots/tv-computador.png) |
| ![Nest Hub — hoje](screenshots/nest-hoje.png) | ![Nest Hub — missões](screenshots/nest-missoes.png) |

## Primeira vez: conectar ao PlanKnect

1. Abra o app (na TV ou no Hub). Aparece um **QR**.
2. Aponte o celular e aprove em planknect.com. Também dá para usar o código mostrado na tela.
3. Em planknect.com › **Configurações › Dispositivos › Conteúdo e conexões**, escolha o que essa tela pode ver (calendários, missões, tarefas, listas, deals) e o que pode **editar**. A edição vem desligada.

Para experimentar sem conta: abra `app/index.html?demo=1`. Os dados de demonstração são fictícios.
