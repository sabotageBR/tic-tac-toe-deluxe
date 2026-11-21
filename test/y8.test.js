// O adaptador da Y8 (src/core/portais/y8.js, sobre o fila-sdk.js; copia do kit multiportal) contra um SDK
// falso: os ids no init, o SDK bloqueado que solta o jogo na hora, o idioma do subdominio, o intervalo so no
// clique, a pausa no foco, o calar so no beforeAd e o premio so no adViewed. Os testes sao os do kit
// (jogos/distribuicao/kit/test/portais.test.js), mais o gancho que o tools/empacotar.mjs usa para gravar os ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarPortalY8 } from '../src/core/portais/y8.js';

function y8Falso({ viu = true, pulado = false } = {}) {
  const ouvintes = {};
  const janela = { addEventListener: (ev, fn) => { (ouvintes[ev] ||= []).push(fn); } };
  const log = [];
  const sdkObj = {
    init: (a, b) => log.push(`init:${a.appId}:${b && b.gameId}`),
    getPlatformLocale: () => Promise.resolve('es'),
    showAd: (p) => {
      log.push(`showAd:${p.type}`);
      if (pulado) { p.adBreakDone({ breakStatus: 'frequencyCapped' }); return; }
      p.beforeAd();
      if (p.type === 'reward') p.beforeReward(() => { if (viu) p.adViewed(); else p.adDismissed(); });
      p.afterAd();
      p.adBreakDone({ breakStatus: 'viewed' });
    },
  };
  const y8 = { sdk: () => sdkObj, emitReadyEvent: () => (ouvintes['y8sdk.ready'] || []).forEach((f) => f()) };
  return { janela, y8, log };
}

test('y8: sem appId o SDK nao inicia e nao ha anuncio', async () => {
  const f = y8Falso();
  const p = criarPortalY8({ obterSdk: () => f.y8, ids: {}, janela: f.janela });
  await p.init();
  assert.equal(p.sdkPronto, false);
  assert.equal(p.temAnuncios, false);
  assert.equal(f.log.length, 0);
});

test('y8: SDK bloqueado (onerror da tag) segue na hora, sem esperar o prazo do init', async () => {
  const f = y8Falso();
  const ja = criarPortalY8({ obterSdk: () => undefined, ids: { appId: 'a1', gameId: 'g1' }, janela: { ...f.janela, __sdkFalhou: 1 } });
  const t0 = Date.now();
  await ja.init();
  assert.ok(Date.now() - t0 < 500);
  assert.equal(ja.temAnuncios, false);
  ja.gameplayStart();
  assert.equal(await ja.commercialBreak(), false, 'sem SDK nao ha intervalo');
  const ouvintes = {};
  const janela = { addEventListener: (ev, fn) => { (ouvintes[ev] ||= []).push(fn); } };
  const depois = criarPortalY8({ obterSdk: () => undefined, ids: { appId: 'a1', gameId: 'g1' }, janela });
  const t1 = Date.now();
  const pronto = depois.init();
  setTimeout(() => (ouvintes['y8sdk.falhou'] || []).forEach((fn) => fn()), 20);
  await pronto;
  assert.ok(Date.now() - t1 < 500);
  assert.equal(depois.temAnuncios, false);
});

test('y8: init com os ids, idioma do subdominio, intervalo so no clique, pausa no foco e laco sem handshake', async () => {
  const f = y8Falso();
  const p = criarPortalY8({ obterSdk: () => f.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: f.janela });
  await p.init();
  assert.equal(p.sdkPronto, true);
  assert.deepEqual(f.log, ['init:a1:g1']);
  assert.equal(p.idioma, 'es');
  assert.equal(p.intervaloSoNoClique, true);
  assert.equal(p.pausaNoBlur, true);
  assert.equal(p.lacoAposInit, false);
  assert.equal(p.temAnuncios, true);
});

test('y8: intervalo recusado antes de jogar; cala so no beforeAd; break pulado nao cala; premio so no adViewed', async () => {
  const f = y8Falso();
  const p = criarPortalY8({ obterSdk: () => f.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: f.janela });
  const ev = [];
  p.onAdStart = () => ev.push('cala');
  p.onAdEnd = () => ev.push('volta');
  await p.init();
  assert.equal(await p.commercialBreak(), false, 'antes do primeiro gameplayStart nao ha intervalo');
  p.gameplayStart();
  assert.equal(await p.commercialBreak(), true);
  assert.deepEqual(ev, ['cala', 'volta']);
  assert.ok(f.log.includes('showAd:next'));
  assert.equal(await p.rewardedBreak('small'), true);
  const g = y8Falso({ pulado: true });
  const q = criarPortalY8({ obterSdk: () => g.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: g.janela });
  const ev2 = [];
  q.onAdStart = () => ev2.push('cala');
  await q.init();
  q.gameplayStart();
  await q.commercialBreak();
  assert.deepEqual(ev2, [], 'break pulado pelo limite de frequencia nao cala o jogo');
  const h = y8Falso({ viu: false });
  const r = criarPortalY8({ obterSdk: () => h.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: h.janela });
  await r.init();
  assert.equal(await r.rewardedBreak(), false, 'fechou o video: sem premio');
});

test('y8: o fonte tem o gancho dos ids uma vez so (o tools/empacotar.mjs grava os do package.json nele)', () => {
  const t = readFileSync(new URL('../src/core/portais/y8.js', import.meta.url), 'utf8');
  assert.equal(t.split('export const IDS = {};').length, 2);
  const pacote = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const ids = pacote.portais && pacote.portais.y8;
  assert.ok(ids && /^[0-9a-f]{24}$/.test(ids.appId) && /^\d+$/.test(ids.gameId), 'package.json "portais.y8" com appId e gameId');
  assert.ok(ids.nome, 'package.json "portais.y8.nome": o nome do jogo na Y8');
});
