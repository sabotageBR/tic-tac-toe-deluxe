// Sons do jogo, todos sintetizados (osciladores e ruido filtrado das primitivas de receitas.js): bipes,
// zaps e arpejos digitais. Copia das receitas da Serie Tech do tic-tac-toe-slime (src/som/tec.js) que
// o modelo 9 Classico toca. Contrato: (v, t0, p) => duracao em s, sem sorteio.

import { tom, sopro, hz } from './receitas.js';

const LP = (/** @type {number} */ f, q = 0.7) => ({ f, q });

/** @type {Readonly<Record<string, (v: any, t: number, p?: any) => number>>} */
export const SONS = Object.freeze({
  /** marca colocada (p.j: 1 mais agudo, 2 mais grave) */
  marca(v, t, p = {}) {
    const f = p.j === 2 ? 520 : 780;
    sopro(v, t, { f: 3200, q: 2, vol: 0.12, ataque: 0.001, queda: 0.02 });
    tom(v, t, { f, f2: f * 1.5, glide: 0.05, tipo: 'square', vol: 0.07, ataque: 0.002, queda: 0.09, filtro: LP(2600) });
    return tom(v, t + 0.05, { f: f * 2, tipo: 'sine', vol: 0.06, ataque: 0.002, queda: 0.12 }) - t;
  },
  /** lance recusado (casa ocupada) */
  recusa(v, t) {
    tom(v, t, { f: 150, tipo: 'square', vol: 0.07, ataque: 0.002, queda: 0.07, filtro: LP(900) });
    return tom(v, t + 0.09, { f: 120, tipo: 'square', vol: 0.07, ataque: 0.002, queda: 0.1, filtro: LP(900) }) - t;
  },
  /** vitoria: arpejo que sobe */
  venceu(v, t) {
    let fim = t;
    [72, 76, 79, 84, 88].forEach((m, i) => {
      fim = tom(v, t + i * 0.085, { f: hz(m), tipo: 'square', vol: 0.065, ataque: 0.003, segurar: 0.03, queda: i === 4 ? 0.5 : 0.12, filtro: LP(3000) });
      tom(v, t + i * 0.085, { f: hz(m + 12), tipo: 'sine', vol: 0.04, ataque: 0.003, queda: 0.2 });
    });
    return fim - t;
  },
  /** derrota: desce e desliga */
  perdeu(v, t) {
    tom(v, t, { f: hz(64), tipo: 'sawtooth', vol: 0.06, ataque: 0.004, queda: 0.16, filtro: LP(1600) });
    tom(v, t + 0.15, { f: hz(60), tipo: 'sawtooth', vol: 0.06, ataque: 0.004, queda: 0.16, filtro: LP(1400) });
    return tom(v, t + 0.3, { f: hz(55), f2: hz(43), glide: 0.5, tipo: 'sawtooth', vol: 0.07, ataque: 0.004, queda: 0.55, filtro: { f: 1400, f2: 200, glide: 0.5, q: 1 } }) - t;
  },
  empate(v, t) {
    tom(v, t, { f: hz(67), tipo: 'triangle', vol: 0.08, ataque: 0.003, queda: 0.12 });
    return tom(v, t + 0.14, { f: hz(67), tipo: 'triangle', vol: 0.08, ataque: 0.003, queda: 0.2 }) - t;
  },
  /** o tabuleiro se desmaterializa */
  limpa(v, t) {
    return sopro(v, t, { f: 4200, f2: 300, glide: 0.4, q: 1.4, vol: 0.1, ataque: 0.01, queda: 0.42 }) - t;
  },
  /** botao do HUD */
  botao(v, t) {
    return tom(v, t, { f: 700, f2: 1000, glide: 0.03, tipo: 'square', vol: 0.05, ataque: 0.002, queda: 0.05, filtro: LP(2600) }) - t;
  },
});
