// core/audio.js e core/armazenamento.js com um contexto e um storage falsos: o som so sai depois do
// gesto, o mudo do jogador e o do portal sao independentes, o anuncio cala o mestre na hora, e o save
// tem o prefixo do jogo e uma reserva em memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAudio } from '../src/core/audio.js';
import { criarArmazem } from '../src/core/armazenamento.js';
import { SONS } from '../src/som/sons.js';

/** AudioParam falso. */
const param = () => ({
  value: 1,
  setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; },
  linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {},
});
const no = () => ({ connect() {}, gain: param(), frequency: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
class ContextoFalso {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = no(); this.criados = 0; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return no(); }
  createDynamicsCompressor() { return no(); }
  createBiquadFilter() { return { ...no(), type: '' }; }
  createOscillator() { this.criados++; return { ...no(), type: '', start() {}, stop() {}, setPeriodicWave() {} }; }
  createBufferSource() { this.criados++; return { ...no(), buffer: null, loop: false, start() {}, stop() {} }; }
  createBuffer(_c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
}

test('audio: nada toca antes do gesto; depois toca, e os dois mudos sao independentes', async () => {
  const a = criarAudio({ Contexto: ContextoFalso, janela: null, agendar: (fn) => fn() });
  assert.equal(a.tocarReceita(SONS.marca, { j: 1 }), 0);
  a.iniciar();
  assert.equal(await a.pronto(), true);
  assert.ok(a.tocarReceita(SONS.marca, { j: 1 }) > 0);
  a.definirMudo(true);
  assert.equal(a.tocarReceita(SONS.botao), 0);
  a.definirMudoPlataforma(true);
  a.definirMudoPlataforma(false);
  assert.equal(a.mudo, true, 'o unmute do portal nao religa o som do jogador');
  a.definirMudo(false);
  assert.ok(a.tocarReceita(SONS.botao) > 0);
});

test('audio: o anuncio cala o mestre na hora e devolve no fim', async () => {
  const a = criarAudio({ Contexto: ContextoFalso, janela: null, agendar: (fn) => fn() });
  a.iniciar();
  await a.pronto();
  a.mudoParaAnuncio();
  assert.equal(a.estado().ganhoMestre, 0);
  assert.equal(a.tocarReceita(SONS.venceu), 0);
  a.voltarDoAnuncio();
  await Promise.resolve();
  assert.ok(a.estado().ganhoMestre > 0);
});

test('audio: todas as receitas tocam no contexto falso e devolvem a duracao', async () => {
  const a = criarAudio({ Contexto: ContextoFalso, janela: null });
  a.iniciar();
  await a.pronto();
  for (const [nome, r] of Object.entries(SONS)) assert.ok(a.tocarReceita(r, { j: 2 }, { chave: nome }) > 0, nome);
});

test('armazem: prefixo do jogo, JSON e reserva em memoria quando o storage lanca', () => {
  const m = new Map();
  const ls = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
  const a = criarArmazem({ obterLs: () => ls });
  assert.equal(a.gravar('prefs', { regra: 'grande' }), true);
  assert.deepEqual([...m.keys()], ['tttdeluxe.prefs']);
  assert.deepEqual(a.ler('prefs'), { regra: 'grande' });
  const quebrado = criarArmazem({ obterLs: () => { throw new Error('bloqueado'); } });
  assert.equal(quebrado.gravar('prefs', { mudo: true }), false);
  assert.deepEqual(quebrado.ler('prefs'), { mudo: true });
  assert.equal(quebrado.ler('nada', 7), 7);
});
