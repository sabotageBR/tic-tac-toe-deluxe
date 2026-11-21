// Regras do jogo da velha n x n, k em linha (o 3x3 e o 5x5 com 4 em linha) e a CPU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGRAS, inicial } from '../src/jogo/regras.js';
import { linhas } from '../src/jogo/tabuleiro.js';
import { escolher } from '../src/jogo/ia.js';
import { criarRng } from '../src/core/rng.js';

/** @param {any} E @param {number[]} casas */
const jogar = (E, casas) => casas.reduce((F, casa) => REGRAS.aplicar(F, { casa }).E, E);

test('linhas: 8 no 3x3 e 28 no 5x5 com 4 em linha', () => {
  assert.equal(linhas(3, 3).length, 8);
  assert.equal(linhas(5, 4).length, 28);
});

test('3x3: linha fecha, vez alterna e casa ocupada nao e jogada', () => {
  let E = inicial({ n: 3 });
  assert.equal(REGRAS.jogadas(E).length, 9);
  E = jogar(E, [0, 3, 1, 4]);
  assert.equal(E.vez, 1);
  assert.ok(!REGRAS.jogadas(E).some((j) => j.casa === 0 || j.casa === 4));
  E = jogar(E, [2]);
  assert.deepEqual(REGRAS.resultado(E), { vencedor: 1, linha: [0, 1, 2] });
  assert.equal(REGRAS.jogadas(E).length, 0);
});

test('3x3: velha cheia sem linha e empate', () => {
  const E = jogar(inicial({ n: 3 }), [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.deepEqual(REGRAS.resultado(E), { vencedor: 0 });
});

test('5x5: 3 em linha nao vence, 4 em linha vence (na diagonal tambem)', () => {
  let E = inicial({ n: 5, k: 4, comeca: 2 });
  assert.equal(E.vez, 2);
  E = jogar(E, [0, 4, 6, 9, 12]);
  assert.equal(REGRAS.resultado(E), null);
  E = jogar(E, [14, 18]);
  assert.deepEqual(REGRAS.resultado(E), { vencedor: 2, linha: [0, 6, 12, 18] });
});

test('efeito do lance: marcar a casa com o id da peca', () => {
  const { efeitos } = REGRAS.aplicar(inicial({ n: 3 }), { casa: 4 });
  assert.deepEqual(efeitos, [{ tipo: 'marcar', id: 1, casa: 4, jogador: 1 }]);
});

test('CPU nivel 4 nunca perde no 3x3, comecando ou nao, contra o nivel 0', () => {
  for (let g = 0; g < 40; g++) {
    const rng = criarRng(100 + g);
    const forte = g % 2 ? 2 : 1;
    let E = inicial({ n: 3, comeca: 1 });
    while (!REGRAS.resultado(E)) E = REGRAS.aplicar(E, escolher(REGRAS, E, { nivel: E.vez === forte ? 4 : 0, rng })).E;
    const r = /** @type {any} */ (REGRAS.resultado(E));
    assert.ok(r.vencedor === 0 || r.vencedor === forte, `partida ${g}: venceu o nivel 0`);
  }
});

test('CPU fecha a linha quando pode e tapa a do rival (3x3 e 5x5)', () => {
  const rng = criarRng(5);
  // 3x3: X em 0 e 1, O em 3 e 4, vez do X: fecha em 2
  let E = jogar(inicial({ n: 3 }), [0, 3, 1, 4]);
  assert.equal(escolher(REGRAS, E, { nivel: 4, rng }).casa, 2);
  // 5x5: X tem 6, 7, 8 com o 5 ja tapado pelo O; vez do O, que tem de tapar o 9
  E = jogar(inicial({ n: 5, k: 4 }), [6, 5, 7, 24, 8]);
  assert.equal(escolher(REGRAS, E, { nivel: 2, erro: 0, rng, orcamento: 10000 }).casa, 9);
  // e o X, com a vez, fecha no 9
  E = jogar(inicial({ n: 5, k: 4 }), [6, 5, 7, 24, 8, 20]);
  assert.equal(escolher(REGRAS, E, { nivel: 2, erro: 0, rng, orcamento: 10000 }).casa, 9);
});

test('CPU no 5x5 com o orcamento do modo grande: rapida e sempre com um lance valido', () => {
  const rng = criarRng(9);
  let E = inicial({ n: 5, k: 4 });
  let pior = 0;
  while (!REGRAS.resultado(E)) {
    const t0 = performance.now();
    const j = escolher(REGRAS, E, { nivel: 2, rng, orcamento: 10000 });
    pior = Math.max(pior, performance.now() - t0);
    assert.ok(REGRAS.jogadas(E).some((x) => x.casa === j.casa));
    E = REGRAS.aplicar(E, j).E;
  }
  assert.ok(pior < 250, `lance da CPU levou ${pior.toFixed(0)} ms`);
});
