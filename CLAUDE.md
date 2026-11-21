# CLAUDE.md

Guia do projeto para o Claude Code. Respostas e textos em português.

# Tic Tac Toe Deluxe

Jogo da velha neon para o **californiagames.io** (PlataformaSDK 1.1), com build também para a **Y8** (lá o nome é **Neon
Tic Tac Toe Deluxe**: "Tic Tac Toe Deluxe" já existia), feito a partir do **modelo 9 do
`../tic-tac-toe-slime` no submodo Clássico** (`?modelo=9&regra=classico` lá): grade âmbar de reator sobre o chão em
perspectiva azul, X ciano × O magenta que se materializam, mira com a marca fantasma e o feixe da vitória. HTML + JavaScript
puro: ES modules nativos, sem bundler, sem `npm install`; ferramentas em Node 22.

- **Modos:** Clássico 3×3 (3 em linha) e Grande 5×5 (4 em linha), cada um **1P** (contra a CPU, nível 2) ou **2P** (no
  mesmo aparelho; o botão 1P/2P alterna). Partidas encadeadas sem tela: quem venceu ganha o feixe, o tabuleiro se apaga e a
  próxima começa com a vez do outro. Números da CPU em `docs/calibragem.md`.
- É um projeto novo e enxuto (2026-11-17), não um ramo do tic-tac-toe-slime: só o que o modelo 9 Clássico usa foi copiado
  (e adaptado). Uma correção lá não chega aqui, e vice-versa.

## Como um quadro anda
`core/laco.js` → `modo.passo(1/60)` → o modo empurra eventos em `modo.eventos` (`som`, `faisca`, `clarao`, `lance`, `vez`,
`fim`, `nivel`) → `tratarEventos()` do `main.js` vira áudio, efeitos e `portal.measure` → `cena.desenhar(modo)`. O modo
nunca toca DOM, áudio nem SDK.

## Estrutura
- `src/jogo/` (puro e determinístico: sem DOM, relógio nem `Math.random`; sorteio só por `core/rng.js`): `modo.js`
  (`criarModo`, `SUBMODOS`: grade, vez, CPU, palco, toque/teclado, partidas encadeadas), `regras.js` (n×n, k em linha,
  estado imutável), `tabuleiro.js` (linhas, vencedor), `ia.js` (negamax alfa-beta com **orçamento em nós**, níveis 0–4,
  `poupar` da 1ª partida da vida), `vez.js` (vez → encenando → fim; a CPU pensa 0,45–0,9 s), `fila.js` + `acoes.js`
  (encenação: `surgir`, `sumir`, `animar`), `grade.js` (casa i = r*n + c, r = 0 em cima).
- `src/render/`: `cena.js` (Canvas 2D em duas camadas + câmera), `tabuleiro.js` (o desenho), `kit.js` (traço neon em
  camadas e brilho por sprite: **sem `shadowBlur` no quadro**), `fundo.js` (tema do Clássico do modelo 9, parte parada em
  cache), `vfx.js`, `camera.js`, `qualidade.js` (desce o dpr se o fps cair).
- `src/som/`: `sons.js` (receitas sintetizadas), `receitas.js` (primitivas `tom`/`sopro`), `mesa.js`. Sem arquivos de
  áudio nem música.
- `src/core/`: `plataforma.js` (a camada da PlataformaSDK, cópia do wrapper `californiagames.js` do tic-tac-toe-slime),
  `audio.js`, `armazenamento.js` (prefixo `tttdeluxe.`), `depuracao.js`, `entrada.js`, `laco.js`, `rng.js`, `haptico.js`.
- `src/core/portais/`: `y8.js` + `fila-sdk.js` (o adaptador da Y8, cópias do kit multiportal
  `../distribuicao/kit/src/core/portais/`). Só entram na build da Y8; o empacotador tira a pasta do zip do californiagames.
- `src/i18n/textos.js` (pt, en, es: os três do portal), `src/ui/estilo.css` (HUD neon, fonte monoespaçada do sistema).
- `src/main.js`: único dono da SDK, do áudio, do save e do DOM.

## SDK (regras da doc do portal; ver `../distribuicao/INTEGRACAO.md`)
- `index.html` tem a tag **relativa** `<script src="/sdk/v1/plataforma-sdk.js">` no `<head>`; a SDK nunca vai no zip.
  `npm run servir` a serve de `../../plataforma/frontend/public/sdk` (fora do iframe do portal: modo autônomo, com
  anúncio simulado de 2 s).
- `init()` no fim da montagem; o laço só começa depois do handshake. Idioma só pelo `getLanguage()` (ou `?lang` local).
- `gameplayStart` no primeiro toque/tecla de cada trecho; `gameplayStop` no fim da partida e no sinal `pause`.
- `commercialBreak` em todo ponto natural: a partida nova, o Recomeçar, a troca de modo e o 1P/2P (o portal limita a
  frequência). `pause`/`resume` congelam o jogo; `mute`/`unmute` calam o mestre sem desfazer o botão de som do jogador.
- Métrica: `measure('level', '<submodo>-<1p|2p>', 'start'|'complete'|'fail')`.

## Build da Y8 (`npm run empacotar:y8`)
- Os ids do Developer Portal e o nome da Y8 ficam em `package.json` → `"portais": { "y8": { nome, appId, gameId } }`
  (appId `6b00df6977e93571d5252953`, gameId `294575`; são públicos e vão no bundle). O empacotador grava os ids no
  `export const IDS = {};` do `y8.js`; sem eles o zip sai `-sem-id` (só teste).
- Na montagem (`dist-y8/jogo/`): `src/core/plataforma.js` vira `export { portal, PLATAFORMA } from './portais/y8.js'`; a tag
  da PlataformaSDK vira a do SDK 2-0 do CDN da Y8 (`async`, com `onerror` que dispara `y8sdk.falhou`: com bloqueador o jogo
  segue na hora, sem anúncio); o `<title>` e a tela de carregamento levam o nome da Y8 (o título do HUD fica o do jogo).
  Confere o texto inteiro, comentários inclusive: nenhuma URL além do SDK, nenhum nome de outro portal, nenhum link para fora.
- O `main.js` lê as flags do portal (no californiagames elas não existem e nada muda):
  - `intervaloSoNoClique`: o intersticial **nunca** sai sozinho. Só no clique de verdade (`detail > 0`) em Recomeçar, troca
    de modo ou 1P/2P, ou no botão **"Continuar ▶"** que segura a partida encadeada; sempre com ≥ 180 s de jogo (`J.t`) desde o
    anterior (o pre-roll da Y8 conta como o primeiro) e só depois do primeiro gesto. O jogo só congela no `onAdStart` (o
    `beforeAd`); break pulado não pausa nada;
  - `pausaNoBlur`: `blur` ou aba oculta congelam (passo, CPU, animações) e calam; `focus` ou um toque soltam;
  - `lacoAposInit` falso: o laço começa na hora, e o idioma (`getPlatformLocale`, inglês se o jogo não tem) chega no init.
- Sem vídeo premiado (o jogo não oferece). Ficha para o painel em `../distribuicao/tic-tac-toe-deluxe/y8/ficha.md`.

## Fronteiras vigiadas (`test/estilo.test.js`)
- sem `console.log`; só o `main.js` importa `core/plataforma.js` e só ele fala com a `PlataformaSDK`;
  `localStorage` só no `armazenamento.js` (prefixo `tttdeluxe.`, nunca `clear()`); a URL só na `depuracao.js`; o idioma
  nunca vem do navegador;
- nenhuma URL absoluta e nenhuma marca de outro portal; fora de `core/plataforma.js` e `core/portais/`, nenhum nome de
  portal nem nos comentários (o resto do código vai igual para as duas builds); `jogo/` sem `Math.random`, DOM ou relógio e só importa
  `core/rng.js` de fora; `src/jogo/` em ASCII fora dos comentários (texto visível vai para `src/i18n/textos.js`);
- `gameplayStart` só no `pointerdown`/tecla.

## Comandos
| Comando | O que faz |
|---|---|
| `npm test` | regras (3×3 e 5×5), CPU (nível 4 nunca perde no 3×3; bloqueia e fecha no 5×5; lance rápido), o modo inteiro (os 2 submodos × 1P/2P até o fim, partidas encadeadas, toque, teclado, determinismo), áudio, save, a camada da SDK e as fronteiras |
| `npm run servir` | http://127.0.0.1:5410/ (com a SDK em `/sdk/`); `npm run lan` para o celular |
| `node tools/calibrar.mjs <n> <k> <nivelA> <nivelB> <partidas> [orçamento]` | CPU × CPU (resultados em `docs/calibragem.md`) |
| `npm run empacotar` | `dist-californiagames/tic-tac-toe-deluxe-californiagames-<versão>.zip` (+ `.sha256`), copiado para `../distribuicao/tic-tac-toe-deluxe/californiagames/build/` (`--ensaio`: só monta e confere, sem zip) |
| `npm run empacotar:y8` | `dist-y8/tic-tac-toe-deluxe-y8-<versão>.zip` (+ `.sha256`), copiado para `../distribuicao/tic-tac-toe-deluxe/y8/build/` |
| `npm run verificar:y8` | o zip da Y8 no Chrome headless (`tools/cdp.mjs`, cópia do kit): SDK bloqueado (carrega e joga, sem erro nem pedido externo) e SDK falso no endereço do CDN (ids no init, idioma, intersticial só dentro do clique num botão, pausa no `beforeAd`, break pulado, blur). Fotos em `.tmp/verificar-y8/` |

Portas deste projeto: 5410 (servir). Os irmãos usam 537x–539x, 4390–4395, 9372–9395.

**Parâmetros de teste** (só localhost/LAN; lista no cabeçalho de `src/core/depuracao.js`): `?regra=classico|grande`,
`?dois`, `?nivel=0..4`, `?semente=`, `?passos=N`, `?auto=ms` (o bot joga pela pessoa), `?semanuncio`, `?semhud`,
`?qualidade=0..3`, `?primeira`, `?debug`, `?lang=pt|en|es`. Em endereço local o jogo expõe `window.__jogo` (os roteiros de
`../distribuicao/tic-tac-toe-deluxe/californiagames/` usam).

## Distribuição
`../distribuicao/tic-tac-toe-deluxe/californiagames/`: build, mídias, `ficha.json`/`ficha.md`, `roteiro.mjs` (prova no
host de teste), `roteiro-midias.mjs`, `thumb.mjs`, `notas-doc.md` e `prova/`. Rode as ferramentas de lá
(`node ferramentas/conferir.mjs tic-tac-toe-deluxe`, `node ferramentas/provar.mjs tic-tac-toe-deluxe`).

## Git
Commit e push só com o OK do usuário.
