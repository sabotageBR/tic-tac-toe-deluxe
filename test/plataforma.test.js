// O wrapper da PlataformaSDK (src/core/plataforma.js, o mesmo do tic-tac-toe-slime) contra uma SDK falsa: a ordem do ciclo de
// vida, o recompensado na forma de objeto, o onStart que cala, os sinais do portal e o idioma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCalifornia } from '../src/core/plataforma.js';

/** SDK falsa: registra as chamadas; o anuncio chama o onStart (se `exibe`) e resolve. */
function sdkFalsa({ idioma = 'es', exibe = true, recompensa = true, adblock = false } = {}) {
  const chamadas = [];
  const ouvintes = {};
  const s = {
    chamadas,
    init: () => { chamadas.push('init'); return Promise.resolve(); },
    gameLoadingStart: () => chamadas.push('gameLoadingStart'),
    gameLoadingFinished: () => chamadas.push('gameLoadingFinished'),
    gameplayStart: () => chamadas.push('gameplayStart'),
    gameplayStop: () => chamadas.push('gameplayStop'),
    commercialBreak: (onStart) => { chamadas.push('commercialBreak'); if (exibe && onStart) onStart(); return Promise.resolve(); },
    rewardedBreak: (op) => {
      chamadas.push(['rewardedBreak', typeof op === 'object' && op ? op.size : typeof op]);
      if (op && typeof op.onStart === 'function') op.onStart();
      return Promise.resolve(recompensa);
    },
    measure: (...a) => chamadas.push(['measure', ...a]),
    getLanguage: () => idioma,
    isAdBlocked: () => adblock,
    on: (ev, cb) => { ouvintes[ev] = cb; },
    emitir: (ev) => ouvintes[ev] && ouvintes[ev](),
  };
  return s;
}

test('init: liga os sinais, chama init e gameLoadingStart, e le o idioma do portal', async () => {
  const s = sdkFalsa({ idioma: 'pt-BR' });
  const c = criarCalifornia({ obterSdk: () => s });
  assert.equal(c.idioma, 'pt-BR'); // ja antes do handshake (o ?lang= do iframe)
  await c.init();
  assert.deepEqual(s.chamadas.slice(0, 2), ['init', 'gameLoadingStart']);
  assert.equal(c.sdkPronto, true);
  assert.equal(c.limitarIntervalos, false);
  assert.equal(c.lacoAposInit, true);
});

test('gameplayStart nunca antes do gameLoadingFinished, e uma vez so', async () => {
  const s = sdkFalsa();
  const c = criarCalifornia({ obterSdk: () => s });
  await c.init();
  c.gameplayStart();
  c.gameplayStart();
  c.gameLoadingFinished();
  const ciclo = s.chamadas.filter((x) => typeof x === 'string' && x.startsWith('game'));
  assert.deepEqual(ciclo, ['gameLoadingStart', 'gameLoadingFinished', 'gameplayStart']);
});

test('commercialBreak: gameplayStop antes, cala no onStart e devolve o som no fim', async () => {
  const s = sdkFalsa();
  const c = criarCalifornia({ obterSdk: () => s });
  const audio = [];
  c.onAdStart = () => audio.push('mudo');
  c.onAdEnd = () => audio.push('som');
  await c.init();
  c.gameplayStart();
  assert.equal(await c.commercialBreak(), true);
  const i = s.chamadas.indexOf('commercialBreak');
  assert.equal(s.chamadas[i - 1], 'gameplayStop');
  assert.deepEqual(audio, ['mudo', 'som']);
  assert.equal(c.emAnuncio, false);
});

test('commercialBreak sem anuncio exibido: nada de mudo', async () => {
  const s = sdkFalsa({ exibe: false });
  const c = criarCalifornia({ obterSdk: () => s });
  let mudo = 0;
  c.onAdStart = () => mudo++;
  await c.init();
  await c.commercialBreak();
  assert.equal(mudo, 0);
});

test('rewardedBreak sempre na forma de objeto (medium por padrao); premio so com true', async () => {
  const s = sdkFalsa();
  const c = criarCalifornia({ obterSdk: () => s });
  let mudo = 0;
  c.onAdStart = () => mudo++;
  await c.init();
  assert.equal(await c.rewardedBreak(), true);
  assert.deepEqual(s.chamadas.find((x) => Array.isArray(x) && x[0] === 'rewardedBreak'), ['rewardedBreak', 'medium']);
  assert.equal(mudo, 1);
  const s2 = sdkFalsa({ recompensa: false });
  const c2 = criarCalifornia({ obterSdk: () => s2 });
  await c2.init();
  assert.equal(await c2.rewardedBreak('large'), false);
});

test('sinais do portal viram onPausaPlataforma e onMudoPlataforma', async () => {
  const s = sdkFalsa();
  const c = criarCalifornia({ obterSdk: () => s });
  const log = [];
  c.onPausaPlataforma = (v) => log.push(['pausa', v]);
  c.onMudoPlataforma = (v) => log.push(['mudo', v]);
  await c.init();
  for (const ev of ['pause', 'mute', 'unmute', 'resume']) s.emitir(ev);
  assert.deepEqual(log, [['pausa', true], ['mudo', true], ['mudo', false], ['pausa', false]]);
});

test('bloqueador de anuncios: temAnuncios falso (o botao do premio some)', async () => {
  const s = sdkFalsa({ adblock: true });
  const c = criarCalifornia({ obterSdk: () => s });
  await c.init();
  assert.equal(c.bloqueador, true);
  assert.equal(c.temAnuncios, false);
});

test('sem SDK (o script nao carregou): tudo segue sem anuncios e sem erro', async () => {
  const c = criarCalifornia({ obterSdk: () => undefined });
  await c.init();
  c.gameLoadingFinished();
  c.gameplayStart();
  c.measure('a', 'b', 'c');
  assert.equal(await c.commercialBreak(), false);
  assert.equal(await c.rewardedBreak(), false);
  assert.equal(c.temAnuncios, false);
  assert.equal(c.idioma, '');
});
