// Acoes do palco (porte do src/jogo/tec/acoes.js do tic-tac-toe-slime): as pecas sao objetos com
// posicao, escala e alfa animados por curvas. Mesmo contrato da fila (fila.js): o modo so devolve a
// vez quando a fila esvazia.
// Logica pura: o tempo entra por dt.

export { esperar, fazer, juntas } from './fila.js';

/** @typedef {import('./fila.js').Acao} Acao */
/**
 * @typedef {{ id: number|string, jogador: number, casa: number, x: number, y: number, esc: number, alfa: number,
 *   t: number, dados: Record<string, any> }} Peca
 */

export const CURVA = {
  /** @param {number} k */
  linear: (k) => k,
  /** @param {number} k */
  suave: (k) => k * k * (3 - 2 * k),
  /** passa do alvo e volta (a peca que "encaixa") @param {number} k */
  mola: (k) => {
    const c = 2.2;
    const u = k - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },
};

/**
 * Anima de 0 a 1 em `dur` s: fn(k ja com a curva, k cru).
 * @param {number} dur @param {(k: number, cru: number) => void} fn @param {(k: number) => number} [curva]
 * @returns {Acao}
 */
export function animar(dur, fn, curva = CURVA.suave) {
  let t = 0;
  return {
    nome: 'animar',
    passo(dt) {
      t += dt;
      const k = dur <= 0 ? 1 : Math.min(1, t / dur);
      fn(curva(k), k);
      return k >= 1;
    },
  };
}

/**
 * Peca nova no palco (ainda invisivel: quem cria anima a entrada).
 * @param {Map<any, Peca>} pecas
 * @param {{ id: number|string, jogador: number, casa?: number, x: number, y: number, esc?: number, alfa?: number }} o
 * @returns {Peca}
 */
export function criarPeca(pecas, o) {
  /** @type {Peca} */
  const p = {
    id: o.id, jogador: o.jogador, casa: o.casa === undefined ? -1 : o.casa, x: o.x, y: o.y,
    esc: o.esc === undefined ? 0 : o.esc, alfa: o.alfa === undefined ? 1 : o.alfa, t: 0, dados: {},
  };
  pecas.set(o.id, p);
  return p;
}

/**
 * A peca se materializa (cresce com mola).
 * @param {Peca} p @param {number} [dur] @returns {Acao}
 */
export function surgir(p, dur = 0.28) {
  return animar(dur, (k, cru) => { p.esc = k; p.alfa = Math.min(1, cru * 3); }, CURVA.mola);
}

/**
 * Desmaterializa e sai do palco.
 * @param {Map<any, Peca>} pecas @param {Peca} p @param {number} [dur] @returns {Acao}
 */
export function sumir(pecas, p, dur = 0.3) {
  let a0 = -1;
  return animar(dur, (k) => {
    if (a0 < 0) a0 = p.alfa;
    p.alfa = a0 * (1 - k);
    if (k >= 1) pecas.delete(p.id);
  }, CURVA.linear);
}
