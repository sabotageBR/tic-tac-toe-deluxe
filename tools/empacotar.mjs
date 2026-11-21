// Monta o pacote do jogo para um portal: copia so o jogo (index.html, LICENCAS.txt e src/; as ferramentas, os
// testes e a documentacao ficam fora) para a pasta de montagem, confere e zipa (index.html na raiz do zip).
// Uso: node tools/empacotar.mjs [--alvo=californiagames|y8] [--ensaio]
//   --ensaio monta e confere, sem zip e sem copia para a distribuicao.
//
// californiagames (o padrao, npm run empacotar): dist/ -> dist-californiagames/<slug>-californiagames-<versao>.zip
//   (+ .sha256), copiado para ../distribuicao/<slug>/californiagames/build/ quando ../distribuicao existe.
//   A pasta src/core/portais/ (os adaptadores dos outros portais) fica fora. Recusa (as regras do
//   ValidadorBuild do portal e as da documentacao da SDK): URL absoluta (a SDK e a tag RELATIVA
//   /sdk/v1/plataforma-sdk.js no <head>, e nunca vai no zip), console.log, .map, lixo do sistema, extensao
//   proibida, import quebrado e marca de outro portal.
//
// y8 (npm run empacotar:y8): dist-y8/jogo/ -> dist-y8/<slug>-y8-<versao>.zip (+ .sha256), copiado para
//   ../distribuicao/<slug>/y8/build/. O que muda na montagem:
//   - src/core/plataforma.js passa a reexportar src/core/portais/y8.js (sobre o fila-sdk.js, copias do kit
//     multiportal); a camada da PlataformaSDK nao vai;
//   - os ids do Developer Portal (package.json "portais.y8": appId e gameId) sao gravados no IDS do y8.js.
//     Sem eles o zip sai "-sem-id" (o SDK nao inicia: so para teste);
//   - no index.html, a tag do SDK 2-0 do CDN da Y8 (async, com o onerror que solta o jogo na hora se o script
//     nao carregar) no lugar da tag da PlataformaSDK, e o nome da Y8 ("portais.y8.nome") no <title> e na
//     tela de carregamento. O titulo do HUD fica o do jogo;
//   - confere no texto INTEIRO (comentarios inclusive): nenhuma URL alem da do SDK, nenhum nome de outro
//     portal, nenhum link nem redirecionamento para fora; mais o que o californiagames confere.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { RAIZ } from './servir.mjs';

const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
/** o nome da pasta do jogo (o slug da distribuicao: tic-tac-toe-deluxe) */
const SLUG = basename(RAIZ.replace(/\/$/, ''));
const SDK = '/sdk/v1/plataforma-sdk.js';
const TAG_CG = `<script src="${SDK}"></script>`;
const COMENTARIO_CG = '<!-- californiagames.io: a PlataformaSDK, servida pelo portal na origem dos jogos (nao vai no build). -->';
const SDK_Y8 = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
const TAG_Y8 = `<script src="${SDK_Y8}" async onerror="window.__sdkFalhou=1;window.dispatchEvent(new Event('y8sdk.falhou'))"></script>`;
const PROIBIDAS = new Set(['.sh', '.py', '.php', '.exe', '.jar', '.bat', '.cmd', '.dll', '.so', '.dylib', '.pl', '.rb', '.cgi', '.map']);
const MB = 1024 * 1024;

const ALVOS = {
  californiagames: { montagem: join(RAIZ, 'dist'), saida: join(RAIZ, 'dist-californiagames'), pasta: 'californiagames' },
  y8: { montagem: join(RAIZ, 'dist-y8', 'jogo'), saida: join(RAIZ, 'dist-y8'), pasta: 'y8' },
};

/** @param {string} d @returns {string[]} */
const listar = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? listar(p) : [p];
});
/** @param {string} t */
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const argAlvo = (process.argv.find((a) => a.startsWith('--alvo=')) || '--alvo=californiagames').slice(7);
const ensaio = process.argv.includes('--ensaio');
const A = ALVOS[/** @type {keyof typeof ALVOS} */ (argAlvo)];
if (!A) {
  process.stdout.write(`alvo desconhecido: ${argAlvo} (${Object.keys(ALVOS).join(', ')})\n`);
  process.exit(1);
}
const y8 = argAlvo === 'y8';
const dist = A.montagem;
const falhas = [];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const item of ['index.html', 'LICENCAS.txt', 'src']) cpSync(join(RAIZ, item), join(dist, item), { recursive: true });
// lixo do sistema nunca vai (o portal recusa .DS_Store e __MACOSX)
for (const f of listar(dist)) if (/(^|\/)(\.DS_Store|Thumbs\.db)$/.test(f)) rmSync(f);

/**
 * Troca um trecho que tem de aparecer exatamente uma vez no arquivo da montagem.
 * @param {string} arq @param {string} de @param {string} para
 */
function trocar(arq, de, para) {
  const p = join(dist, arq);
  const t = readFileSync(p, 'utf8');
  if (t.split(de).length !== 2) { falhas.push(`${arq} sem "${de}" (uma vez) para trocar`); return; }
  writeFileSync(p, t.replace(de, para));
}

let semId = false;
if (!y8) {
  // os adaptadores dos outros portais nao vao no zip do californiagames.io
  rmSync(join(dist, 'src/core/portais'), { recursive: true, force: true });
} else {
  const cfg = (pacote.portais && pacote.portais.y8) || {};
  // a camada do portal: a do californiagames sai, o adaptador da Y8 entra
  writeFileSync(join(dist, 'src/core/plataforma.js'),
    '// Build da Y8 (tools/empacotar.mjs): a camada do portal e o adaptador da Y8 (portais/y8.js, sobre o\n'
    + '// portais/fila-sdk.js). Somente src/main.js importa este modulo.\n'
    + "export { portal, PLATAFORMA } from './portais/y8.js';\n");
  const fica = new Set(['y8.js', 'fila-sdk.js']);
  for (const f of readdirSync(join(dist, 'src/core/portais'))) if (!fica.has(f)) rmSync(join(dist, 'src/core/portais', f));
  // os ids do painel
  const ids = Object.fromEntries(['appId', 'gameId'].filter((k) => cfg[k]).map((k) => [k, String(cfg[k])]));
  semId = !ids.appId || !ids.gameId;
  trocar('src/core/portais/y8.js', 'export const IDS = {};', `export const IDS = ${JSON.stringify(ids)};`);
  // o SDK da Y8 no lugar da PlataformaSDK, e o nome da Y8 no titulo e na tela de carregamento
  trocar('index.html', COMENTARIO_CG, '<!-- Y8: o SDK 2-0 do CDN deles (async); se o script nao carregar, o jogo segue na hora, sem anuncios. -->');
  trocar('index.html', TAG_CG, TAG_Y8);
  const nomeY8 = String(cfg.nome || 'Tic Tac Toe Deluxe');
  trocar('index.html', '<title>Tic Tac Toe Deluxe</title>', `<title>${nomeY8}</title>`);
  trocar('index.html', 'aria-label="Tic Tac Toe Deluxe"', `aria-label="${nomeY8}"`);
  trocar('index.html', '<div class="logo">Tic Tac Toe Deluxe</div>', `<div class="logo">${nomeY8}</div>`);
}

const arquivos = listar(dist);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (!/viewport-fit=cover/.test(html)) falhas.push('index.html sem viewport-fit=cover');
// a SDK no <head>, antes dos scripts do jogo
const cabeca = html.split('</head>')[0];
const tag = y8 ? TAG_Y8 : TAG_CG;
const sdk = y8 ? SDK_Y8 : SDK;
if (!cabeca.includes(tag)) falhas.push('a tag da SDK deve ficar no <head>');
if (cabeca.indexOf(sdk) > cabeca.search(/<script[^>]*type="module"/) && /<script[^>]*type="module"/.test(cabeca)) falhas.push('a SDK deve vir antes dos scripts do jogo');
if (y8) {
  const portais = readdirSync(join(dist, 'src/core/portais')).sort().join(',');
  if (portais !== 'fila-sdk.js,y8.js') falhas.push(`src/core/portais/ deve ter so fila-sdk.js e y8.js (tem ${portais})`);
} else if (existsSync(join(dist, 'src/core/portais'))) falhas.push('src/core/portais/ nao vai no zip do californiagames');
for (const p of arquivos) {
  const r = relative(dist, p);
  if (PROIBIDAS.has(extname(p).toLowerCase())) falhas.push(`extensao proibida: ${r}`);
  if (/plataforma-sdk/.test(r)) falhas.push('a SDK nao vai dentro do build');
  if (!/\.(html|js|css)$/.test(p)) continue;
  const t = readFileSync(p, 'utf8');
  for (const u of t.match(/https?:\/\/[^\s"'`)<>]+/g) || []) if (!(y8 && r === 'index.html' && u === SDK_Y8)) falhas.push(`URL absoluta em ${r}: ${u}`);
  if (/console\.(log|info|debug)\s*\(/.test(t)) falhas.push(`console.log em ${r}`);
  if (y8) {
    // no zip da Y8 nem os comentarios citam outro portal, e nada leva o jogador para fora
    const m = t.match(/californiagames|plataformasdk|plataforma-sdk|poki|crazygames/i);
    if (m) falhas.push(`nome de outro portal em ${r}: ${m[0]}`);
    if (/window\.open\s*\(|location\.(href|assign|replace)\b|<a\s[^>]*href/i.test(semComentarios(t))) falhas.push(`link ou redirecionamento para fora em ${r}`);
  } else if (/poki|crazygames|\by8\b/i.test(semComentarios(t))) falhas.push(`marca de outro portal em ${r}`);
  if (p.endsWith('.js')) {
    // sem os comentarios: os tipos do JSDoc citam modulos fora do build
    for (const m of semComentarios(t).matchAll(/(?:import|export)\s*(?:[^'"]*from\s*)?\(?\s*'(\.[^']+)'/g)) {
      if (!existsSync(join(p, '..', m[1]))) falhas.push(`import quebrado em ${r}: ${m[1]}`);
    }
  }
}
if (y8) {
  const t = readFileSync(join(dist, 'src/core/portais/y8.js'), 'utf8');
  if (!semId && !t.includes(`"appId":"${pacote.portais.y8.appId}"`)) falhas.push('o appId nao foi gravado no y8.js');
}
let bruto = 0;
let gz = 0;
for (const p of arquivos) {
  const dados = readFileSync(p);
  bruto += dados.length;
  gz += gzipSync(dados, { level: 9 }).length;
}
if (bruto > 8 * MB) falhas.push(`build acima de 8 MB (${(bruto / MB).toFixed(1)} MB)`);
if (falhas.length) {
  process.stdout.write('FALHOU:\n  ' + falhas.join('\n  ') + '\n');
  process.exit(1);
}
if (ensaio) {
  process.stdout.write(`ensaio ok (${argAlvo}): ${arquivos.length} arquivos, ${(bruto / 1024).toFixed(0)} KB (${(gz / 1024).toFixed(0)} KB gzip) em ${relative(RAIZ, dist)}/, sem zip\n`);
  process.exit(0);
}

const saida = A.saida;
const nome = `${SLUG}-${argAlvo}-${pacote.version}${semId ? '-sem-id' : ''}`;
const zip = join(saida, `${nome}.zip`);
const copia = join(RAIZ, '..', 'distribuicao', SLUG, A.pasta, 'build');
mkdirSync(saida, { recursive: true });
rmSync(zip, { force: true });
const z = spawnSync('zip', ['-qr', '-X', zip, '.'], { cwd: dist, encoding: 'utf8' });
if (z.status !== 0) {
  process.stdout.write('zip falhou: ' + z.stderr + '\n');
  process.exit(1);
}
const teste = spawnSync('unzip', ['-tq', zip], { encoding: 'utf8' });
const lista = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.trim().split('\n');
if (teste.status !== 0 || !lista.includes('index.html') || lista.some((n) => /__MACOSX|\.DS_Store/.test(n))) {
  process.stdout.write('zip invalido, sem index.html na raiz ou com lixo do sistema\n');
  process.exit(1);
}
const sha = createHash('sha256').update(readFileSync(zip)).digest('hex');
writeFileSync(join(saida, `${nome}.sha256`), `${sha}  ${nome}.zip\n`);
if (existsSync(join(RAIZ, '..', 'distribuicao'))) {
  mkdirSync(copia, { recursive: true });
  cpSync(zip, join(copia, `${nome}.zip`));
  cpSync(join(saida, `${nome}.sha256`), join(copia, `${nome}.sha256`));
  process.stdout.write(`copiado para ${copia}\n`);
}
if (semId) process.stdout.write('AVISO: sem appId/gameId em package.json "portais.y8": zip so para teste, o SDK nao inicia\n');
process.stdout.write(`build ok: ${arquivos.length} arquivos, ${(bruto / 1024).toFixed(0)} KB (${(gz / 1024).toFixed(0)} KB gzip)\n`);
process.stdout.write(`${relative(RAIZ, zip)}: ${(statSync(zip).size / 1024).toFixed(0)} KB, sha256 ${sha}\n`);
