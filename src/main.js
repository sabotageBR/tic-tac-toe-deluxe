// Liga tudo no Tic Tac Toe Deluxe: o modo (Classico 3x3 ou Grande 5x5, contra a CPU ou 2 jogadores no
// mesmo aparelho), a cena neon, o laco, a entrada, o audio e a camada do portal (core/plataforma.js, que
// cada build troca pela do seu portal; as regras de cada SDK ficam la).
// O modo nunca toca DOM, audio nem SDK: ele empurra eventos e este arquivo os traduz (som, efeitos,
// measure). Unico dono do SDK, do DOM e do save.
// Fluxo do portal: init() no fim da montagem e o laco so depois do handshake (portal.lacoAposInit; sem ele,
// o laco comeca na hora); idioma pelo portal.idioma; gameplayStart no primeiro toque/tecla de cada trecho;
// gameplayStop no fim da partida e no sinal pause do portal; a partida nova (sem tela entre elas), o
// Recomecar, a troca de modo e o 1P/2P sao os pontos naturais do intervalo comercial (gameplayStop ->
// commercialBreak -> o proximo toque manda o gameplayStart). O sinal mute cala o mestre sem mexer no botao
// de som do jogador.
// Portal que exige clique (portal.intervaloSoNoClique): o intervalo NUNCA sai sozinho. So no clique de um
// botao de partida nova (Recomecar, modo, 1P/2P) ou no "Continuar" que aparece entre as partidas
// encadeadas, e no maximo a cada ESPACO_INTERVALO s de jogo; o jogo so congela no onAdStart (o beforeAd
// do SDK), e um break pulado nao pausa nada. Portal que pede pausa no foco (portal.pausaNoBlur): perder o
// foco ou esconder a aba cala o som e congela o jogo (animacoes e a jogada da CPU) ate o foco voltar.

import { lerDepuracao } from './core/depuracao.js';
import { criarLaco, PASSO } from './core/laco.js';
import { criarEntrada } from './core/entrada.js';
import { criarAudio } from './core/audio.js';
import { criarMesa } from './som/mesa.js';
import { portal } from './core/plataforma.js';
import { criarArmazem } from './core/armazenamento.js';
import { vibrar } from './core/haptico.js';
import { criarCena, QUALIDADES } from './render/cena.js';
import { criarQualidade } from './render/qualidade.js';
import { CORES } from './render/kit.js';
import { texto, TEXTOS } from './i18n/textos.js';
import { criarModo } from './jogo/modo.js';

const dep = lerDepuracao();
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
/**
 * Idioma da interface (pt, en ou es): o forcado (?lang, so no teste local) e o do portal
 * (portal.idioma: o getLanguage() ou o getPlatformLocale() do SDK); sem nenhum deles, ou num idioma que o
 * jogo nao tem, ingles. Nunca o do navegador.
 * @param {...any} candidatos
 */
function escolherIdioma(...candidatos) {
  for (const c of candidatos) {
    if (!c) continue;
    const k = String(c).toLowerCase().slice(0, 2);
    if (TEXTOS[k]) return k;
  }
  return 'en';
}
const idiomaAgora = () => escolherIdioma(dep.lang, portal.idioma);
let lang = idiomaAgora();
const T = (/** @type {string} */ k, /** @type {any} */ v) => texto(lang, k, v);
const armazem = criarArmazem();
const toque = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
if (dep.semHud) document.body.classList.add('semhud');
const salvo = armazem.ler('prefs', {}) || {};

/** estado da sessao */
const J = {
  modo: /** @type {ReturnType<typeof criarModo>} */ (/** @type {any} */ (null)),
  regra: dep.regra || String(salvo.regra || ''),
  dois: dep.dois,
  t: 0,
  /** jogando: entre o gameplayStart (toque/tecla) e o gameplayStop (fim da partida, intervalo, pausa) */
  jogou: false,
  /** partidas terminadas na vida (a 1a tem a CPU que deixa ganhar) */
  vistos: Number(salvo.vistos || 0),
};

function salvar() {
  armazem.gravar('prefs', { ...(armazem.ler('prefs', {}) || {}), regra: J.regra, vistos: J.vistos });
}

function novoModo() {
  J.modo = criarModo({
    semente: dep.semente || ((Date.now() / 1000) | 0),
    regra: J.regra,
    doisJogadores: J.dois,
    nivel: dep.nivel >= 0 ? dep.nivel : undefined,
    primeira: dep.primeira || J.vistos === 0,
  });
  J.regra = J.modo.regra;
  montarSubmodos();
  atualizarHud(true);
}

// ------------------------------------------------------------------ cena, audio, laco
const cena = criarCena({ fundo: /** @type {any} */ ($('cFundo')), topo: /** @type {any} */ ($('cTopo')), area: $('area') });
const qualidade = criarQualidade({ niveis: QUALIDADES.length, inicial: dep.qualidade >= 0 ? dep.qualidade : toque ? 1 : 0 });
cena.definirQualidade(qualidade.nivel);
const audio = criarAudio();
const mesa = criarMesa(audio);
audio.definirMudo(!!salvo.mudo);
/** @param {any} e cor do efeito (e.j = jogador) */
const corDe = (e) => CORES[/** @type {0|1|2} */ (e.j || 0)];

function tratarEventos() {
  const ev = J.modo.eventos;
  for (const e of ev) {
    switch (e.tipo) {
      case 'som': mesa.tocar(e.nome, e.p); break;
      case 'faisca': cena.vfx.faisca(e.x, e.y, corDe(e), e.qtd || 8, e.forca || 5); break;
      case 'clarao': cena.vfx.brilho(e.x, e.y, corDe(e), e.r || 1.6); break;
      case 'onda': cena.vfx.onda(e.x, e.y, corDe(e), e.r || 2.4); break;
      case 'tremor': vibrar(60); cena.vfx.tremer(e.forca || 0.5); break;
      case 'fim':
        if (e.vencedor) vibrar([20, 40, 20]);
        J.vistos++;
        salvar();
        break;
      case 'nivel':
        portal.measure('level', `${e.regra || J.regra}-${J.dois ? '2p' : '1p'}`, e.acao);
        // o fim da partida para o jogo; a partida seguinte (sem tela entre elas, ou o Recomecar, ou a
        // troca de modo) e o ponto natural do intervalo; a 1a da sessao nao tem
        if (e.acao !== 'start') pararJogo();
        else {
          const manual = inicioManual;
          inicioManual = false;
          if (partidas++ > 0) intervaloDaPartida(manual);
        }
        break;
      default: break;
    }
  }
  ev.length = 0;
}

let tAuto = 0;
/** @param {number} dt */
function passo(dt) {
  if (emAnuncio || pausaPortal || esperandoClique || pausaFoco) return;
  J.t += dt;
  if (dep.auto) {
    tAuto += dt * 1000;
    if (tAuto >= dep.auto) { tAuto = 0; J.modo.bot(); }
  }
  J.modo.passo(dt);
  cena.passo(dt);
  tratarEventos();
}

/** @param {number} dtReal */
function desenhar(dtReal) {
  cena.desenhar(J.modo, J.t);
  atualizarHud(false);
  if (dep.qualidade < 0 && qualidade.quadro(dtReal)) cena.definirQualidade(qualidade.nivel);
  if (dep.debug) {
    $('debug').hidden = false;
    $('debug').textContent = `fps ${laco.medidas.fps.toFixed(0)} | passo ${laco.medidas.passoMs.toFixed(2)} ms | desenho ${laco.medidas.desenhoMs.toFixed(2)} ms | ${cena.qualidade}`;
  }
}
const laco = criarLaco({ passo, desenhar });

// ------------------------------------------------------------------ SDK: gameplay, intervalo e sinais
/** o jogo esta congelado pelo anuncio */
let emAnuncio = false;
/** um intervalo foi pedido e ainda nao voltou */
let pedindo = false;
/** pausa pedida pelo portal (sinal pause/resume): congela o jogo */
let pausaPortal = false;
/** partidas comecadas nesta sessao (a 1a nao tem intervalo antes) */
let partidas = 0;
/** o portal so aceita o intersticial logo depois de um clique num botao (nunca automatico) */
const soNoClique = !!(/** @type {any} */ (portal).intervaloSoNoClique);
/** o portal pede pausa quando a janela perde o foco */
const pausaNoBlur = !!(/** @type {any} */ (portal).pausaNoBlur);
/** s de jogo entre dois intersticiais, no minimo, quando o intervalo so sai no clique */
const ESPACO_INTERVALO = 180;
/** J.t do ultimo intervalo pedido (o pre-roll do portal conta como o primeiro) */
let ultimoIntervalo = 0;
/** a proxima partida comeca por gesto do jogador (botao ou tecla R), e nao pelo encadeamento */
let inicioManual = false;
/** o "Continuar" entre partidas esta na tela: o jogo espera o clique (so no portal que exige clique) */
let esperandoClique = false;
/** a janela perdeu o foco ou a aba sumiu: o jogo congela e cala (so no portal que pede pausaNoBlur) */
let pausaFoco = false;

/** O jogo parou (fim da partida, intervalo, pausa): o proximo toque ou tecla manda o gameplayStart. */
function pararJogo() {
  if (!J.jogou) return;
  J.jogou = false;
  portal.gameplayStop();
}

/**
 * Intervalo comercial: gameplayStop, o anuncio e a volta. Onde o portal limita a frequencia, o jogo congela
 * ja no pedido; onde o intervalo so sai no clique, o jogo so congela no onAdStart (o beforeAd do SDK): um
 * break pulado nao pausa nada.
 */
async function intervalo() {
  pararJogo();
  if (dep.semAnuncio || pedindo) return;
  pedindo = true;
  ultimoIntervalo = J.t;
  if (!soNoClique) emAnuncio = true;
  await portal.commercialBreak();
  pedindo = false;
  emAnuncio = false;
  // o anuncio pode ter levado o foco: o jogo so volta sozinho se a janela estiver com ele
  if (pausaFoco && !document.hidden && document.hasFocus()) pausarFoco(false);
}

/** Da para pedir o intersticial no clique: ha anuncio, o jogador ja jogou e passou o espaco minimo. */
function intervaloLiberado() {
  return !dep.semAnuncio && !pedindo && portal.temAnuncios && portal.jaJogou && J.t - ultimoIntervalo >= ESPACO_INTERVALO;
}

/**
 * Partida nova (a encadeada, o Recomecar, a troca de modo ou o 1P/2P): o ponto natural do intervalo.
 * Onde o portal limita a frequencia, o intervalo sai em toda partida nova. Onde ele so sai no clique, o
 * botao ja pediu (partidaPorBotao) e a encadeada ganha o "Continuar" quando o intervalo pode sair de fato.
 * @param {boolean} manual a partida veio de um botao ou da tecla R
 */
function intervaloDaPartida(manual) {
  if (!soNoClique) { intervalo(); return; }
  if (!manual && intervaloLiberado()) pedirContinuar();
}

/**
 * Um botao comecou a partida nova (Recomecar, modo, 1P/2P). Onde o intervalo so sai no clique, e aqui (e no
 * "Continuar") que ele sai: logo depois de um clique de verdade (detail > 0: nao o Enter num botao que ficou
 * com o foco), e o botao larga o foco para o teclado voltar ao tabuleiro.
 * @param {MouseEvent} e
 */
function partidaPorBotao(e) {
  inicioManual = true;
  fecharContinuar();
  if (!soNoClique) return;
  try { /** @type {HTMLElement} */ (e.currentTarget).blur(); } catch { /* ignora */ }
  if (e.detail > 0 && intervaloLiberado()) intervalo();
}

/** @type {HTMLButtonElement|null} o "Continuar" entre as partidas encadeadas (criado so quando precisa) */
let btSeguir = null;
function pedirContinuar() {
  if (!btSeguir) {
    const b = document.createElement('button');
    b.id = 'btnSeguir';
    b.className = 'seguir';
    b.hidden = true;
    b.addEventListener('click', () => {
      if (!esperandoClique) return;
      mesa.tocar('botao');
      fecharContinuar();
      if (intervaloLiberado()) intervalo();
    });
    $('area').appendChild(b);
    btSeguir = b;
  }
  pararJogo();
  esperandoClique = true;
  btSeguir.textContent = T('bt.seguir');
  btSeguir.hidden = false;
}
function fecharContinuar() {
  if (!esperandoClique) return;
  esperandoClique = false;
  if (btSeguir) btSeguir.hidden = true;
}

/** Perdeu ou ganhou o foco (portal que pede pausaNoBlur): congela e cala, ou volta. @param {boolean} v */
function pausarFoco(v) {
  if (pausaFoco === v) return;
  pausaFoco = v;
  if (v) pararJogo();
  audio.pausarAba(document.hidden || pausaFoco);
}

portal.onAdStart = () => { emAnuncio = true; audio.mudoParaAnuncio(); };
portal.onAdEnd = () => { audio.voltarDoAnuncio(); };
// sinais do portal (idempotentes): o mudo dele fica por cima do botao de som do jogador (o unmute nunca
// religa o som que ele desligou); a pausa congela o jogo e para o gameplay
portal.onMudoPlataforma = (mudo) => { audio.definirMudoPlataforma(mudo); };
portal.onPausaPlataforma = (pausa) => {
  pausaPortal = pausa;
  if (pausa) pararJogo();
};
document.addEventListener('visibilitychange', () => {
  if (pausaNoBlur) {
    if (document.hidden) pausarFoco(true);
    else if (document.hasFocus()) pausarFoco(false);
  }
  audio.pausarAba(document.hidden || pausaFoco);
});
if (pausaNoBlur) {
  window.addEventListener('blur', () => pausarFoco(true));
  window.addEventListener('focus', () => { if (!document.hidden) pausarFoco(false); });
  // tocar no jogo devolve o foco ao iframe (e o teclado volta a valer) e tira a pausa
  window.addEventListener('pointerdown', () => {
    try { window.focus(); } catch { /* ignora */ }
    pausarFoco(false);
  }, true);
}

// ------------------------------------------------------------------ HUD
let hudChave = '';
function montarSubmodos() {
  const el = $('submodos');
  el.textContent = '';
  for (const s of J.modo.submodos) {
    const b = document.createElement('button');
    b.textContent = T(s.id);
    b.dataset.id = s.id;
    if (s.id === J.regra) b.classList.add('ativo');
    b.addEventListener('click', (e) => {
      if (s.id === J.regra) return;
      J.regra = s.id;
      salvar();
      mesa.tocar('botao');
      novoModo();
      partidaPorBotao(e);
    });
    el.appendChild(b);
  }
  $('btnDois').textContent = J.dois ? '2P' : '1P';
  if (btSeguir) btSeguir.textContent = T('bt.seguir');
  // os rotulos fixos do index.html no idioma do jogo
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  for (const [id, k] of [['btnDois', 'bt.dois'], ['btnReiniciar', 'bt.reiniciar'], ['btnSom', 'bt.som']]) {
    $(id).title = T(k);
    $(id).setAttribute('aria-label', T(k));
  }
}

/** texto da vez mostrado (fica parado enquanto o lance se encena, sem piscar) */
let vezMostrada = '';
/** @param {boolean} forcar */
function atualizarHud(forcar) {
  const h = J.modo.hud();
  const nome = (/** @type {1|2} */ j) => (h.cpu[j] ? T('cpu') : J.dois ? T('jogador' + j) : T('voce'));
  let vez = forcar ? '' : vezMostrada;
  if (h.resultado) {
    const v = /** @type {0|1|2} */ (h.resultado.vencedor);
    vez = !v ? T('empate') : J.dois ? T('venceu', { nome: nome(v) }) : h.cpu[v] ? T('vocPerdeu') : T('vocVenceu');
  } else if (h.estado === 'vez') vez = h.cpu[/** @type {1|2} */ (h.vez)] ? T('cpuPensa') : J.dois ? T('vezDe', { nome: nome(/** @type {1|2} */ (h.vez)) }) : T('suaVez');
  const dica = T(J.regra + '.dica');
  const chave = [h.vez, h.placar[1], h.placar[2], vez, J.dois, h.estado, dica, lang].join('|');
  if (!forcar && chave === hudChave) return;
  hudChave = chave;
  $('dica').textContent = dica;
  $('nome1').textContent = nome(1);
  $('nome2').textContent = nome(2);
  $('pts1').textContent = String(h.placar[1]);
  $('pts2').textContent = String(h.placar[2]);
  $('j1').classList.toggle('da-vez', !h.resultado && h.vez === 1);
  $('j2').classList.toggle('da-vez', !h.resultado && h.vez === 2);
  $('vez').textContent = vez;
  vezMostrada = vez;
}

$('btnReiniciar').addEventListener('click', (e) => { mesa.tocar('botao'); J.modo.reiniciar(); atualizarHud(true); partidaPorBotao(e); });
$('btnDois').addEventListener('click', (e) => { J.dois = !J.dois; mesa.tocar('botao'); novoModo(); partidaPorBotao(e); });
$('btnSom').addEventListener('click', () => {
  audio.definirMudo(!audio.mudo);
  $('btnSom').classList.toggle('mudo', audio.mudo);
  armazem.gravar('prefs', { ...(armazem.ler('prefs', {}) || {}), mudo: audio.mudo });
});
$('btnSom').classList.toggle('mudo', audio.mudo);

// ------------------------------------------------------------------ entrada
function orientar() {
  document.body.dataset.orient = window.innerWidth > window.innerHeight * 1.1 ? 'paisagem' : 'retrato';
}
window.addEventListener('resize', orientar);
orientar();

criarEntrada(window, {
  ponteiro(fase, x, y) {
    if (emAnuncio || pausaPortal || esperandoClique) return;
    const p = cena.paraMundo(x, y);
    if (!p) return;
    // (com a partida decidida, o toque nao volta ao jogo: a proxima comeca depois do intervalo)
    if (fase === 'baixo' && !J.jogou && J.modo.estado !== 'fim') { J.jogou = true; portal.gameplayStart(); }
    J.modo.apontar(p[0], p[1], fase);
  },
  tecla(codigo, baixo) {
    if (baixo && pausaFoco) pausarFoco(false); // tecla chegou: a janela tem o foco de novo
    if (emAnuncio || pausaPortal || esperandoClique) return;
    if (baixo && !J.jogou && codigo !== 'Escape' && J.modo.estado !== 'fim') { J.jogou = true; portal.gameplayStart(); }
    if (baixo && codigo === 'KeyR') { inicioManual = true; J.modo.reiniciar(); atualizarHud(true); return; }
    J.modo.tecla(codigo, baixo);
  },
});

// ------------------------------------------------------------------ inicio
novoModo();
for (let k = 0; k < dep.passos; k++) passo(PASSO);
// um quadro ja desenhado enquanto a SDK conversa com o portal (o laco vem depois)
cena.desenhar(J.modo, J.t);
const conectou = portal.init().then(() => {
  // o idioma do portal so e certo depois do handshake
  const l = idiomaAgora();
  if (l !== lang) { lang = l; montarSubmodos(); atualizarHud(true); }
  portal.gameLoadingFinished();
});
const carregando = $('carregando');
if (carregando) carregando.remove();
if (dep.ganchos) {
  /** @type {any} */ (window).__jogo = {
    J, cena, audio, get laco() { return laco; }, avancar: (/** @type {number} */ n) => { for (let k = 0; k < n; k++) passo(PASSO); cena.desenhar(J.modo, J.t); },
    get emAnuncio() { return emAnuncio; }, get pausaPortal() { return pausaPortal; }, get lang() { return lang; },
    portal, get esperandoClique() { return esperandoClique; }, get pausaFoco() { return pausaFoco; },
    get ultimoIntervalo() { return ultimoIntervalo; }, get pedindo() { return pedindo; },
  };
}
// o laco so comeca depois do handshake da SDK (no portal, quase na hora; fora dele, o modo autonomo); o
// portal sem handshake (lacoAposInit falso) nao segura o jogo: ele comeca ja, e o idioma chega no init
if (portal.lacoAposInit) conectou.then(() => laco.iniciar());
else laco.iniciar();
