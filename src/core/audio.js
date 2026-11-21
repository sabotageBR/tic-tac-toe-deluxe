// Infra de audio (WebAudio), versao enxuta da do tic-tac-toe-slime (que veio do slime-merge): um
// barramento de efeitos, mudo do jogador, mudo do portal, anuncio e aba oculta. Os sons sao receitas
// sintetizadas (src/som/sons.js); nao ha arquivos de audio nem musica.
//
// Grafo: fontes -> barramento sfx (0,85) -> compressor leve -> mestre (0,7) -> saida.
// - O contexto so nasce no primeiro gesto (politica de autoplay): os ouvintes de pointerup/keydown/
//   touchend da janela chamam `iniciar()` e tentam de novo se o resume() falhar (iOS).
// - `pronto()`: promessa que resolve (true) quando o primeiro resume() resolveu com o contexto rodando.
//   Nada e agendado antes disso (nem com a aba oculta ou no anuncio).
// - Anuncio: `mudoParaAnuncio()` crava o mestre em 0 NA HORA e suspende o contexto 80 ms depois;
//   `voltarDoAnuncio()` devolve o mestre e retoma.
// - `definirMudo` e o botao de som do jogador (o barramento); `definirMudoPlataforma` e o mute/unmute
//   do portal (o mestre), por cima do mudo do jogador, que continua guardado por baixo.
// - Polifonia: no maximo MAX_VOZES sons ao mesmo tempo e `max` por chave.
// Contexto, janela e agendador injetaveis (testes no Node com contexto falso).

import { bufferRuido } from '../som/receitas.js';

/** Ganhos padrao do barramento e do mestre. */
export const GANHOS = Object.freeze({ sfx: 0.85, mestre: 0.7 });
/** Espera entre zerar o mestre e suspender o contexto no anuncio, ms. */
const ESPERA_SUSPENDER = 80;
/** Sons tocando juntos, no maximo. */
const MAX_VOZES = 32;

/**
 * @typedef {object} OpTocar
 * @property {number} [atraso] s a partir de agora
 * @property {string} [chave] chave da polifonia (a categoria)
 * @property {number} [max] quantos da mesma chave ao mesmo tempo (padrao 4)
 */

/**
 * @param {object} [opcoes]
 * @param {any} [opcoes.Contexto] construtor do AudioContext (padrao AudioContext/webkitAudioContext)
 * @param {any} [opcoes.janela] padrao globalThis.window; null desliga o destrave automatico
 * @param {(fn: () => void, ms: number) => any} [opcoes.agendar] padrao setTimeout
 */
export function criarAudio(opcoes = {}) {
  const g = /** @type {any} */ (globalThis);
  const janela = opcoes.janela !== undefined ? opcoes.janela : g.window || null;
  const agendar = opcoes.agendar || ((/** @type {() => void} */ fn, /** @type {number} */ ms) => setTimeout(fn, ms));

  /** @type {any} */
  let ctx = null;
  /** @type {any} */
  let mestre = null;
  /** @type {any} */
  let sfx = null;
  /** @type {any} */
  let ruidoBuf = null;
  let falhou = false;
  let destravado = false;
  let mudo = false;
  let mudoAnuncio = false;
  let abaOculta = false;
  let mudoPlataforma = false;
  let agendados = 0;
  /** @type {{chave: string, fim: number}[]} */
  let tocando = [];

  /** @type {(v: boolean) => void} */
  let resolverPronto = () => {};
  /** @type {Promise<boolean>} */
  const promessaPronto = new Promise((r) => { resolverPronto = r; });

  const alvoMestre = () => (mudoAnuncio || abaOculta || mudoPlataforma ? 0 : GANHOS.mestre);
  const alvoSfx = () => (mudo ? 0 : GANHOS.sfx);

  function construtor() {
    if (opcoes.Contexto) return opcoes.Contexto;
    try { return g.AudioContext || g.webkitAudioContext || null; } catch { return null; }
  }

  /** Leva um AudioParam ao valor com uma constante de tempo curta. @param {any} param @param {number} valor @param {number} tau */
  function levar(param, valor, tau) {
    try { param.setTargetAtTime(valor, ctx.currentTime, tau); } catch { try { param.value = valor; } catch { /* ignora */ } }
  }

  /** Poe um AudioParam no valor na hora (o getter ja devolve o valor novo). @param {any} param @param {number} valor */
  function cravar(param, valor) {
    const t = ctx.currentTime;
    try { param.cancelScheduledValues(t); } catch { /* ignora */ }
    try { param.value = valor; } catch { /* ignora */ }
    try { param.setValueAtTime(valor, t); } catch { /* ignora */ }
  }

  function garantirContexto() {
    if (ctx || falhou) return;
    const C = construtor();
    if (!C) { falhou = true; resolverPronto(false); return; }
    try {
      try { ctx = new C({ latencyHint: 'interactive' }); } catch { ctx = new C(); }
      mestre = ctx.createGain();
      mestre.gain.value = alvoMestre();
      mestre.connect(ctx.destination);
      // compressor leve: segura os picos quando muita coisa toca junto
      let entrada = mestre;
      try {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 3;
        comp.attack.value = 0.004;
        comp.release.value = 0.2;
        comp.connect(mestre);
        entrada = comp;
      } catch { /* sem compressor */ }
      sfx = ctx.createGain();
      sfx.gain.value = alvoSfx();
      sfx.connect(entrada);
      ruidoBuf = bufferRuido(ctx);
    } catch {
      ctx = null;
      mestre = null;
      sfx = null;
      falhou = true;
      resolverPronto(false);
    }
  }

  /**
   * Pede resume(); quando resolver com o contexto rodando, marca destravado e reaplica o mestre (fora
   * de anuncio e de aba oculta).
   */
  function retomar() {
    if (!ctx) return;
    let p = null;
    try { p = ctx.resume(); } catch { p = null; }
    const concluir = () => {
      if (!ctx || ctx.state !== 'running') return;
      const primeira = !destravado;
      destravado = true;
      if (primeira) resolverPronto(true);
      if (mestre && !mudoAnuncio && !abaOculta) levar(mestre.gain, alvoMestre(), 0.03);
    };
    if (p && typeof p.then === 'function') p.then(concluir, () => {});
    else concluir();
  }

  function suspender() {
    if (!ctx || ctx.state !== 'running') return;
    try {
      const p = ctx.suspend();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* ignora */ }
  }

  function iniciar() {
    garantirContexto();
    if (!ctx || mudoAnuncio || abaOculta) return;
    if (ctx.state !== 'running' || !destravado) retomar();
  }

  function podeTocar() {
    return !!ctx && destravado && !mudoAnuncio && !abaOculta && !mudoPlataforma && !mudo && ctx.state === 'running';
  }

  /** Reserva lugar na polifonia ate `fim` (tempo do contexto). @param {string} chave @param {number} fim @param {number} max */
  function reservar(chave, fim, max) {
    const agora = ctx.currentTime;
    tocando = tocando.filter((x) => x.fim > agora);
    if (tocando.length >= MAX_VOZES) return false;
    let n = 0;
    for (const x of tocando) if (x.chave === chave) n++;
    if (n >= max) return false;
    tocando.push({ chave, fim });
    return true;
  }

  // destrave automatico: outro gesto tenta de novo se o contexto nao esta rodando
  const aoGesto = () => {
    if (ctx && destravado && ctx.state === 'running') return;
    iniciar();
  };
  if (janela && typeof janela.addEventListener === 'function') {
    janela.addEventListener('pointerup', aoGesto, true);
    janela.addEventListener('keydown', aoGesto, true);
    janela.addEventListener('touchend', aoGesto, true);
  }

  return {
    iniciar,
    /** Promessa: true quando o contexto rodou pela primeira vez; false sem WebAudio. */
    pronto: () => promessaPronto,
    podeTocar,
    /**
     * Toca uma receita agora (+ atraso) no barramento de efeitos.
     * @param {(v: any, t0: number, p?: any) => number} receita
     * @param {any} [p]
     * @param {OpTocar} [op]
     * @returns {number} duracao agendada, s (0 se nao tocou)
     */
    tocarReceita(receita, p = {}, op = {}) {
      if (typeof receita !== 'function' || !podeTocar()) return 0;
      const t0 = ctx.currentTime + (op.atraso || 0) + 0.005;
      if (!reservar(op.chave || 'receita', t0 + 0.08, op.max || 4)) return 0;
      try {
        const dur = receita({ ctx, destino: sfx, ruido: ruidoBuf }, t0, p) || 0;
        // a reserva fica com a duracao de verdade
        tocando[tocando.length - 1].fim = t0 + Math.max(0.05, dur);
        agendados++;
        return dur;
      } catch {
        return 0;
      }
    },
    get ctx() { return ctx; },
    get mestre() { return mestre; },
    /** mudo do jogador (o botao de som) */
    get mudo() { return mudo; },
    get destravado() { return destravado; },
    /** mudo pedido pelo portal (mute/unmute) */
    get mudoPlataforma() { return mudoPlataforma; },
    /** true se nada deve sair agora (anuncio, aba oculta, portal ou o jogador) */
    get calado() { return mudoAnuncio || abaOculta || mudoPlataforma || mudo; },
    /** @param {boolean} v o botao de som do jogador */
    definirMudo(v) {
      mudo = !!v;
      if (ctx && sfx) levar(sfx.gain, alvoSfx(), 0.02);
    },
    /** @param {boolean} v cala tudo pelo mestre; nao mexe no mudo do jogador */
    definirMudoPlataforma(v) {
      mudoPlataforma = !!v;
      if (ctx && mestre) levar(mestre.gain, alvoMestre(), 0.03);
    },
    mudoParaAnuncio() {
      mudoAnuncio = true;
      if (!ctx || !mestre) return;
      cravar(mestre.gain, 0);
      agendar(() => { if (mudoAnuncio) suspender(); }, ESPERA_SUSPENDER);
    },
    voltarDoAnuncio() {
      mudoAnuncio = false;
      if (!ctx || !mestre) return;
      // o ganho volta ja: com o contexto parado a rampa so anda quando ele rodar
      levar(mestre.gain, alvoMestre(), 0.03);
      if (!abaOculta) retomar();
    },
    /** @param {boolean} oculta */
    pausarAba(oculta) {
      abaOculta = !!oculta;
      if (!ctx || !mestre) return;
      levar(mestre.gain, alvoMestre(), 0.02);
      if (abaOculta) suspender();
      else if (!mudoAnuncio) retomar();
    },
    /** Retrato para testes e depuracao. */
    estado() {
      let ganho = alvoMestre();
      try { if (mestre) ganho = mestre.gain.value; } catch { /* ignora */ }
      return {
        contexto: ctx ? String(ctx.state) : 'ausente',
        destravado, emAnuncio: mudoAnuncio, oculto: abaOculta, mudo, mudoPlataforma, ganhoMestre: ganho, agendados,
        tocando: tocando.length,
      };
    },
  };
}
