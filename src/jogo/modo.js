// O modo do Tic Tac Toe Deluxe (porte do criarModoTec do tic-tac-toe-slime, o modelo 9 no submodo
// Classico): grade, maquina de vez, CPU, toque e teclado nas casas, o PALCO (pecas com posicao,
// escala e alfa animadas por acoes na fila) e o encadeamento das partidas sem tela no meio (quem
// venceu ganha o feixe, o tabuleiro se desmaterializa e a proxima ja comeca, com a vez do outro).
// Dois submodos: o classico (3x3, 3 em linha) e o grande (5x5, 4 em linha; numeros em docs/).
// Logica pura: o modo nunca toca DOM, audio nem SDK; tudo sai por `eventos`.

import { criarRng } from '../core/rng.js';
import { criarVez } from './vez.js';
import { REGRAS, inicial } from './regras.js';
import { criarGrade } from './grade.js';
import { criarPeca, surgir, sumir, animar, esperar, juntas, CURVA } from './acoes.js';

/**
 * Os submodos: lado do tabuleiro (n), quantas em linha (k), lado da casa no mundo (vao) e o orcamento
 * da busca da CPU (nos). O 5x5 busca menos: o lance cabe num quadro tambem no celular.
 */
export const SUBMODOS = Object.freeze([
  Object.freeze({ id: 'classico', n: 3, k: 3, vao: 3, orcamento: 30000 }),
  Object.freeze({ id: 'grande', n: 5, k: 4, vao: 2, orcamento: 10000 }),
]);

/** Teclado numerico no 3x3: 7 8 9 em cima (casa 0 1 2). */
const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };
/** Segundos entre o fim da partida e o tabuleiro se apagar. */
const COMEMORAR = 2.1;

/**
 * @param {{ semente?: number, regra?: string, doisJogadores?: boolean, nivel?: number, primeira?: boolean }} [o]
 */
export function criarModo(o = {}) {
  const semente = o.semente || 1;
  const rng = criarRng(semente * 7919 + 13);
  const S = SUBMODOS.find((s) => s.id === o.regra) || SUBMODOS[0];
  const sub = S.id;
  const R = REGRAS;
  const geo = criarGrade({ cols: S.n, rows: S.n, vao: S.vao });
  const [cx0, cy0, cx1, cy1] = geo.caixa;
  const janela = [cx0 - 0.8, cy0 - 0.8, cx1 + 0.8, cy1 + 0.8];
  /** @type {any[]} */
  const eventos = [];
  /** o que o desenho le */
  const palco = {
    /** @type {Map<any, import('./acoes.js').Peca>} */
    pecas: new Map(),
    /** tempo do palco (s) */
    t: 0,
    /** 0..1: a partida que acabou se desmaterializa */
    apagar: 0,
  };
  const placar = { 1: 0, 2: 0, 0: 0 };
  let partidas = 0;
  let comeca = 1;
  let hover = -1;
  let cursor = Math.floor((S.n * S.n) / 2);
  let limpando = false;
  let saindo = false;
  const dois = !!o.doisJogadores;
  let primeira = !!o.primeira;
  const nivel = o.nivel === undefined ? 2 : o.nivel;

  /** @param {number} j */
  const cpu = (j) => !dois && j === 2;
  /** @param {number} c */
  const estadoNovo = (c) => inicial({ n: S.n, k: S.k, comeca: c });
  /** @type {any} */
  let vez = null;
  const minhaVez = () => vez.estado === 'vez' && !cpu(vez.E.vez);

  /** @param {any[]} efeitos @returns {import('./acoes.js').Acao[]} */
  function encenar(efeitos) {
    const out = [];
    for (const ef of efeitos) {
      if (ef.tipo !== 'marcar') continue;
      const C = geo.celulas[ef.casa];
      const p = criarPeca(palco.pecas, { id: ef.id, jogador: ef.jogador, casa: ef.casa, x: C.cx, y: C.cy });
      eventos.push({ tipo: 'som', nome: 'marca', p: { j: ef.jogador } });
      eventos.push({ tipo: 'faisca', x: C.cx, y: C.cy, j: ef.jogador, qtd: 8 });
      out.push(surgir(p, 0.26));
    }
    return out;
  }

  function novaVez() {
    vez = criarVez({ R, E: estadoNovo(comeca), rng, eventos, cpu, nivel, poupar: primeira, orcamento: S.orcamento, encenar });
  }

  function partidaNova() {
    eventos.push({ tipo: 'nivel', acao: 'start', regra: sub });
  }

  novaVez();
  partidaNova();

  /** Fim da partida: comemora, desmaterializa tudo e a proxima ja comeca (sem tela). */
  function cuidarDoFim() {
    const res = vez.resultado;
    if (!res) return;
    if (!limpando) {
      placar[/** @type {0|1|2} */ (res.vencedor)]++;
      partidas++;
      if (res.vencedor) {
        eventos.push({ tipo: 'som', nome: cpu(res.vencedor) ? 'perdeu' : 'venceu' });
        // clarao e faiscas em cada casa da linha (o feixe e do desenho)
        for (const i of res.linha || []) {
          const C = geo.celulas[i];
          eventos.push({ tipo: 'clarao', x: C.cx, y: C.cy, j: res.vencedor, r: geo.vao * 0.6 });
          eventos.push({ tipo: 'faisca', x: C.cx, y: C.cy, j: res.vencedor, qtd: 10, forca: 6 });
        }
      } else {
        eventos.push({ tipo: 'som', nome: 'empate' });
      }
      eventos.push({ tipo: 'nivel', acao: res.vencedor === 1 || dois ? 'complete' : 'fail', regra: sub, vencedor: res.vencedor });
      limpando = true;
      return;
    }
    if (vez.tFim > COMEMORAR && vez.filaVazia && !saindo) {
      saindo = true;
      eventos.push({ tipo: 'som', nome: 'limpa' });
      const lista = [animar(0.45, (k) => { palco.apagar = k; }, CURVA.linear)];
      for (const p of palco.pecas.values()) lista.push(sumir(palco.pecas, p, 0.4));
      vez.encenar(juntas(lista), esperar(0.12), {
        nome: 'nova',
        passo() {
          palco.pecas.clear();
          palco.apagar = 0;
          comeca = comeca === 1 ? 2 : 1;
          primeira = false;
          vez.poupar = false;
          vez.reiniciar(estadoNovo(comeca));
          limpando = false;
          saindo = false;
          partidaNova();
          return true;
        },
      });
    }
  }

  /** @param {number} casa */
  function tocarCasa(casa) {
    if (casa < 0 || !minhaVez()) return false;
    const ok = vez.jogar({ casa });
    if (!ok) eventos.push({ tipo: 'som', nome: 'recusa' });
    return ok;
  }

  return {
    regra: sub,
    submodo: S,
    submodos: SUBMODOS,
    janela,
    eventos,
    tabuleiro: geo,
    palco,
    /** @param {number} dt */
    passo(dt) {
      palco.t += dt;
      for (const p of palco.pecas.values()) p.t += dt;
      vez.passo(dt);
      cuidarDoFim();
    },
    /** @param {number} x @param {number} y @param {'baixo'|'mover'|'cima'} fase */
    apontar(x, y, fase) {
      const casa = geo.celulaEm(x, y);
      hover = casa;
      if (casa >= 0) cursor = casa;
      if (fase === 'baixo') tocarCasa(casa);
    },
    /** @param {string} codigo @param {boolean} baixo */
    tecla(codigo, baixo) {
      if (!baixo) return;
      const dig = /^(?:Digit|Numpad)(\d)$/.exec(codigo);
      if (dig) {
        const k = S.n === 3 ? NUMPAD[/** @type {keyof typeof NUMPAD} */ (dig[1])] : undefined;
        if (k !== undefined) { cursor = k; hover = k; tocarCasa(k); }
        return;
      }
      const n = S.n;
      const tot = n * n;
      if (codigo === 'ArrowLeft') cursor = (cursor + tot - 1) % tot;
      else if (codigo === 'ArrowRight') cursor = (cursor + 1) % tot;
      else if (codigo === 'ArrowUp') cursor = (cursor + tot - n) % tot;
      else if (codigo === 'ArrowDown') cursor = (cursor + n) % tot;
      else if (codigo === 'Enter' || codigo === 'NumpadEnter' || codigo === 'Space') { hover = cursor; tocarCasa(cursor); return; }
      else return;
      hover = cursor;
    },
    /** O bot (?auto, testes, roteiros): joga pela pessoa da vez. */
    bot() {
      if (!minhaVez()) return false;
      return vez.jogar(vez.sugerir(1));
    },
    /** Ponto do mundo que faz a jogada j (centro da casa). @param {{ casa: number }} j */
    toque(j) {
      const C = geo.celulas[j.casa];
      return C ? [C.cx, C.cy] : null;
    },
    hud() {
      return {
        regra: sub,
        vez: vez.E.vez,
        cpu: { 1: cpu(1), 2: cpu(2) },
        estado: vez.estado,
        placar: { ...placar },
        partidas,
        resultado: vez.resultado,
        minhaVez: minhaVez(),
      };
    },
    visual() {
      const res = vez.resultado;
      const mv = minhaVez();
      const livre = mv && hover >= 0 && !vez.E.donos[hover];
      return {
        realce: livre ? hover : -1,
        hover,
        corVez: vez.E.vez,
        estado: vez.estado,
        minhaVez: mv,
        tFim: res ? vez.tFim : 0,
        linha: res && res.vencedor && res.linha ? { casas: res.linha, jogador: res.vencedor } : null,
      };
    },
    /** Recomecar: a partida atual some e uma nova comeca (o placar fica). */
    reiniciar() {
      palco.pecas.clear();
      palco.apagar = 0;
      comeca = 1;
      limpando = false;
      saindo = false;
      novaVez();
      partidaNova();
    },
    get estado() { return vez.estado; },
    get E() { return vez.E; },
    /** jogada direta (testes) @param {{ casa: number }} j */
    jogar(j) { return vez.jogar(j); },
  };
}
