// Jogo da velha classico n x n, k em linha (o 3x3 do Classico e o 5x5 com 4 em linha do Grande): cada
// lance marca uma casa livre. Estado imutavel: aplicar devolve um estado novo e os efeitos (o roteiro
// que o modo encena). Copia do src/jogo/regras/classica.js do tic-tac-toe-slime.

import { vencedor, cheio, livres, outro, linhasAbertas } from './tabuleiro.js';

/**
 * @typedef {{ n: number, k: number, donos: number[], vez: number, lances: number, prox: number,
 *   pecas: Array<{ id: number, jogador: number, casa: number }> }} Estado
 */

/**
 * @param {{ n?: number, k?: number, comeca?: number }} [o]
 * @returns {Estado}
 */
export function inicial(o = {}) {
  const n = o.n || 3;
  return { n, k: o.k || n, donos: new Array(n * n).fill(0), vez: o.comeca || 1, lances: 0, prox: 1, pecas: [] };
}

/** @param {Estado} E */
export function jogadas(E) {
  if (resultado(E)) return [];
  return livres(E.donos).map((casa) => ({ casa }));
}

/** @param {Estado} E @param {{ casa: number }} j */
export function aplicar(E, j) {
  const donos = E.donos.slice();
  donos[j.casa] = E.vez;
  const id = E.prox;
  const F = { ...E, donos, vez: outro(E.vez), lances: E.lances + 1, prox: id + 1, pecas: [...E.pecas, { id, jogador: E.vez, casa: j.casa }] };
  return { E: F, efeitos: [{ tipo: 'marcar', id, casa: j.casa, jogador: E.vez }] };
}

/** @param {Estado} E @returns {{ vencedor: number, linha?: number[] }|null} */
export function resultado(E) {
  const v = vencedor(E.donos, E.n, E.k);
  if (v) return { vencedor: v.jogador, linha: v.linha };
  if (cheio(E.donos)) return { vencedor: 0 };
  return null;
}

/** @param {Estado} E */
export function chave(E) {
  return E.vez + ':' + E.donos.join('');
}

/** @param {Estado} E @param {number} j */
export function avaliar(E, j) {
  return linhasAbertas(E.donos, E.n, E.k, j);
}

export const REGRAS = { id: 'classico', inicial, jogadas, aplicar, resultado, chave, avaliar };
