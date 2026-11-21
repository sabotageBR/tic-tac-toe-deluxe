// O modo inteiro (src/jogo/modo.js) rodando sem DOM: cada submodo ate o fim contra a CPU e em 2
// jogadores, as partidas encadeadas sem tela, o placar, os eventos que o main.js traduz (nivel, som,
// faisca), o toque e o teclado, o determinismo por semente e o palco sem NaN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarModo, SUBMODOS } from '../src/jogo/modo.js';

const PASSO = 1 / 60;

/**
 * Roda o modo com o bot jogando pela pessoa ate `n` partidas terminarem (ou o teto de quadros).
 * @param {any} m @param {number} n
 */
function rodar(m, n, teto = 60 * 600) {
  const eventos = [];
  for (let q = 0; q < teto; q++) {
    if (q % 20 === 0) m.bot();
    m.passo(PASSO);
    eventos.push(...m.eventos.splice(0));
    const fins = eventos.filter((e) => e.tipo === 'nivel' && e.acao !== 'start').length;
    if (fins >= n) return eventos;
    for (const p of m.palco.pecas.values()) {
      for (const k of ['x', 'y', 'esc', 'alfa']) assert.ok(Number.isFinite(p[k]), `peca com ${k} = ${p[k]}`);
    }
  }
  throw new Error('as partidas nao acabaram');
}

for (const S of SUBMODOS) {
  for (const dois of [false, true]) {
    test(`${S.id} ${dois ? '2P' : 'contra a CPU'}: 3 partidas encadeadas, placar e eventos`, () => {
      const m = criarModo({ regra: S.id, doisJogadores: dois, semente: 7 });
      assert.equal(m.regra, S.id);
      assert.equal(m.tabuleiro.cols, S.n);
      const ev = rodar(m, 3);
      const niveis = ev.filter((e) => e.tipo === 'nivel');
      // start, fim, start, fim, start, fim (o 1o start sai na criacao: ja estava na fila do modo)
      assert.deepEqual(niveis.map((e) => (e.acao === 'start' ? 's' : 'f')).join(''), 'sfsfsf');
      const h = m.hud();
      assert.equal(h.placar[0] + h.placar[1] + h.placar[2], 3);
      assert.equal(h.partidas, 3);
      assert.equal(h.cpu[2], !dois);
      assert.ok(ev.some((e) => e.tipo === 'som' && e.nome === 'marca'));
      assert.ok(ev.some((e) => e.tipo === 'faisca'));
      if (!dois) for (const e of niveis.filter((x) => x.acao !== 'start')) assert.equal(e.acao, e.vencedor === 1 ? 'complete' : 'fail');
      else for (const e of niveis.filter((x) => x.acao !== 'start')) assert.equal(e.acao, 'complete');
    });
  }
}

test('quem comeca alterna a cada partida', () => {
  const m = criarModo({ regra: 'classico', doisJogadores: true, semente: 3 });
  const quem = [];
  for (let p = 0; p < 3; p++) {
    quem.push(m.E.vez);
    rodar(m, 1);
    // espera a partida nova comecar (o tabuleiro se apaga e volta vazio)
    for (let q = 0; q < 60 * 5 && m.E.lances > 0; q++) { m.passo(PASSO); m.eventos.length = 0; }
  }
  assert.deepEqual(quem, [1, 2, 1]);
});

test('mesma semente, mesma partida (a CPU e deterministica)', () => {
  const lances = (/** @type {number} */ s) => {
    const m = criarModo({ regra: 'grande', semente: s });
    return rodar(m, 1).filter((e) => e.tipo === 'lance').map((e) => e.jogada.casa).join(',');
  };
  assert.equal(lances(11), lances(11));
});

test('toque: casa livre na minha vez joga; casa ocupada e recusada; fora do tabuleiro nao faz nada', () => {
  const m = criarModo({ regra: 'classico', doisJogadores: true });
  const [x, y] = /** @type {number[]} */ (m.toque({ casa: 4 }));
  m.apontar(x, y, 'baixo');
  assert.equal(m.E.donos[4], 1);
  for (let q = 0; q < 60 && m.estado !== 'vez'; q++) m.passo(PASSO);
  m.eventos.length = 0;
  m.apontar(x, y, 'baixo');
  assert.equal(m.E.lances, 1);
  assert.ok(m.eventos.some((e) => e.tipo === 'som' && e.nome === 'recusa'));
  m.apontar(1000, 1000, 'baixo');
  assert.equal(m.E.lances, 1);
});

test('teclado: 1 a 9 no 3x3 (7 8 9 em cima); setas e Enter no 5x5', () => {
  const a = criarModo({ regra: 'classico', doisJogadores: true });
  a.tecla('Numpad7', true);
  assert.equal(a.E.donos[0], 1);
  const b = criarModo({ regra: 'grande', doisJogadores: true });
  b.tecla('ArrowRight', true);
  b.tecla('ArrowDown', true);
  b.tecla('Enter', true);
  assert.equal(b.E.donos[12 + 1 + 5], 1);
});

test('a CPU nao joga pela pessoa e a mira so aparece na casa livre da minha vez', () => {
  const m = criarModo({ regra: 'grande', semente: 2 });
  const [x, y] = /** @type {number[]} */ (m.toque({ casa: 0 }));
  m.apontar(x, y, 'mover');
  assert.equal(m.visual().realce, 0);
  m.apontar(x, y, 'baixo');
  assert.equal(m.visual().realce, -1);
  // a CPU responde sozinha
  for (let q = 0; q < 60 * 3 && !(m.E.lances === 2 && m.estado === 'vez'); q++) m.passo(PASSO);
  assert.equal(m.E.lances, 2);
  assert.equal(m.hud().minhaVez, true);
});

test('reiniciar: tabuleiro vazio, X comeca, placar mantido e um start novo', () => {
  const m = criarModo({ regra: 'classico', doisJogadores: true });
  rodar(m, 1);
  const placar = m.hud().placar;
  m.reiniciar();
  assert.equal(m.E.lances, 0);
  assert.equal(m.E.vez, 1);
  assert.equal(m.palco.pecas.size, 0);
  assert.deepEqual(m.hud().placar, placar);
  assert.ok(m.eventos.some((e) => e.tipo === 'nivel' && e.acao === 'start'));
});

test('submodo desconhecido cai no classico', () => {
  assert.equal(criarModo({ regra: 'xyz' }).regra, 'classico');
});
