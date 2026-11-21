// Fronteiras do codigo que o portal e o projeto cobram (ver CLAUDE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
/** @param {string} dir @returns {string[]} */
const arquivos = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? arquivos(p) : [p];
});
const src = arquivos(join(raiz, 'src')).filter((p) => /\.(js|css)$/.test(p));
const ler = (/** @type {string} */ p) => readFileSync(p, 'utf8');
const rel = (/** @type {string} */ p) => relative(raiz, p);
/** @param {string} t */
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const html = ler(join(raiz, 'index.html'));

test('sem console.log/info/debug no jogo', () => {
  for (const p of src) assert.ok(!/console\.(log|info|debug)\s*\(/.test(ler(p)), rel(p));
});

test('so src/main.js importa a camada da SDK (core/plataforma.js)', () => {
  for (const p of src) {
    if (rel(p) === 'src/main.js') continue;
    assert.ok(!/plataforma\.js/.test(ler(p)), rel(p));
  }
  assert.ok(/from '\.\/core\/plataforma\.js'/.test(ler(join(raiz, 'src/main.js'))));
});

test('ninguem fala com a PlataformaSDK direto fora da camada dela', () => {
  for (const p of src) {
    if (rel(p) === 'src/core/plataforma.js') continue;
    assert.ok(!/PlataformaSDK/.test(semComentarios(ler(p))), rel(p));
  }
});

test('so o armazenamento toca o localStorage, com o prefixo do jogo e sem clear()', () => {
  for (const p of src) {
    if (rel(p) === 'src/core/armazenamento.js') continue;
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(ler(p)), rel(p));
  }
  const a = ler(join(raiz, 'src/core/armazenamento.js'));
  assert.ok(/PREFIXO_PADRAO = 'tttdeluxe\.'/.test(a));
  assert.ok(!/\.clear\(/.test(a));
});

test('so a depuracao le a URL; o idioma nunca vem do navegador', () => {
  for (const p of src) {
    if (rel(p) === 'src/core/depuracao.js') continue;
    assert.ok(!/location\.(search|hash)|URLSearchParams/.test(ler(p)), rel(p));
    assert.ok(!/navigator\.languages?\b/.test(semComentarios(ler(p))), rel(p));
  }
});

test('logica pura (jogo) nao usa Math.random, DOM nem relogio', () => {
  for (const p of src.filter((x) => /src\/jogo\//.test(x))) {
    const t = semComentarios(ler(p));
    assert.ok(!/Math\.random|document\.|window\.|Date\.now|performance\.now|setTimeout/.test(t), rel(p));
  }
});

test('jogo/ so importa core/rng.js de fora dele (o modo e puro)', () => {
  for (const p of src.filter((x) => /src\/jogo\//.test(x) && x.endsWith('.js'))) {
    for (const [, alvo] of ler(p).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const r = rel(join(p, '..', alvo));
      assert.ok(/^src\/jogo\//.test(r) || r === 'src/core/rng.js', `${rel(p)} importa ${r}`);
    }
  }
});

test('src/jogo/ em ASCII fora dos comentarios (texto com acento vai para o i18n)', () => {
  for (const p of src.filter((x) => /src\/jogo\//.test(x))) {
    assert.ok(!/[^\x00-\x7f]/.test(semComentarios(ler(p))), rel(p));
  }
});

test('gameplayStart so no pointerdown (fase baixo) ou numa tecla', () => {
  const t = ler(join(raiz, 'src/main.js'));
  const chamadas = [...t.matchAll(/gameplayStart\(\)/g)];
  assert.ok(chamadas.length >= 1);
  for (const m of chamadas) {
    const antes = t.slice(Math.max(0, (m.index || 0) - 160), m.index);
    assert.ok(/baixo/.test(antes), 'gameplayStart fora do baixo/tecla: ' + antes.slice(-80));
  }
});

test('nenhuma URL absoluta no jogo; a SDK e a tag relativa no <head>, antes do jogo', () => {
  for (const p of [...src, join(raiz, 'index.html')]) {
    const urls = ler(p).match(/https?:\/\/[^\s"'`)<>]+/g) || [];
    assert.deepEqual(urls, [], rel(p));
  }
  const cabeca = html.split('</head>')[0];
  assert.ok(cabeca.includes('<script src="/sdk/v1/plataforma-sdk.js"></script>'));
  assert.ok(html.indexOf('/sdk/v1/plataforma-sdk.js') < html.indexOf('src/main.js'));
});

test('nenhuma marca de outro portal no jogo', () => {
  for (const p of [...src, join(raiz, 'index.html')]) assert.ok(!/poki|crazygames/i.test(semComentarios(ler(p))), rel(p));
});

test('fora da camada do portal (core/plataforma.js e core/portais/), nenhum nome de portal nem nos comentarios', () => {
  // cada build leva so a camada do seu portal: o resto do codigo vai igual para todas e nao pode citar outra
  for (const p of src) {
    if (rel(p) === 'src/core/plataforma.js' || rel(p).startsWith('src/core/portais/')) continue;
    const m = ler(p).match(/californiagames|plataformasdk|plataforma-sdk|poki|crazygames|\by8\b/i);
    assert.equal(m, null, `${rel(p)}: ${m && m[0]}`);
  }
});

test('index.html pede viewport-fit=cover', () => {
  assert.ok(/viewport-fit=cover/.test(html));
});

test('os textos tem os tres idiomas do californiagames.io (pt, en, es) com as mesmas chaves', async () => {
  const { TEXTOS } = await import('../src/i18n/textos.js');
  const chaves = (/** @type {object} */ o) => Object.keys(o).sort().join('|');
  assert.deepEqual(Object.keys(TEXTOS).sort(), ['en', 'es', 'pt']);
  assert.equal(chaves(TEXTOS.en), chaves(TEXTOS.pt));
  assert.equal(chaves(TEXTOS.es), chaves(TEXTOS.pt));
  // todo submodo tem nome e dica
  const { SUBMODOS } = await import('../src/jogo/modo.js');
  for (const s of SUBMODOS) for (const k of [s.id, s.id + '.dica']) assert.ok(TEXTOS.pt[k], k);
});

test('os sons que o modo pede existem na mesa', async () => {
  const { SONS } = await import('../src/som/sons.js');
  const usados = new Set();
  // as linhas do modo que empurram { tipo: 'som', nome: ... } e os mesa.tocar('...') do main.js
  for (const linha of ler(join(raiz, 'src/jogo/modo.js')).split('\n').filter((l) => l.includes("tipo: 'som'"))) {
    for (const [, n] of linha.matchAll(/'(\w+)'/g)) if (n !== 'som') usados.add(n);
  }
  for (const [, n] of ler(join(raiz, 'src/main.js')).matchAll(/mesa\.tocar\('(\w+)'/g)) usados.add(n);
  assert.ok(usados.size >= 6);
  for (const n of usados) assert.equal(typeof SONS[n], 'function', n);
});
