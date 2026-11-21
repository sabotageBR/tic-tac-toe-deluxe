// Servidor estatico minimo (sem dependencias) para jogar e para as ferramentas de teste. Como a origem
// de jogos do californiagames.io, serve a PlataformaSDK em /sdk/ (de ../../plataforma/frontend/public/sdk,
// quando existe): fora de um iframe do portal ela entra no modo autonomo (anuncios simulados, chamadas
// no console). Sem a pasta, /sdk/ da 404 e o jogo roda igual, sem SDK.
// servirPasta(dir) serve uma build montada numa porta livre (tools/verificar-y8.mjs).
// Uso direto: node tools/servir.mjs [porta] [--lan]
//   porta padrao 5410, so 127.0.0.1; com --lan escuta em 0.0.0.0 e mostra o endereco
//   para abrir no celular pela mesma Wi-Fi.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = fileURLToPath(new URL('..', import.meta.url));
export const SDK_DIR = resolve(RAIZ, '..', '..', 'plataforma', 'frontend', 'public', 'sdk');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/**
 * O tratador dos pedidos: arquivos de `raiz`; com `comSdk`, /sdk/ vem de SDK_DIR.
 * @param {string} raiz @param {boolean} comSdk
 */
function tratador(raiz, comSdk) {
  return async (/** @type {any} */ req, /** @type {any} */ res) => {
    try {
      const caminho = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
      let base = resolve(raiz);
      let rel = caminho;
      if (comSdk && caminho.startsWith('/sdk/')) {
        base = SDK_DIR;
        rel = caminho.slice('/sdk'.length);
      }
      let arq = normalize(join(base, rel));
      if (arq !== base && !arq.startsWith(base + sep)) throw new Error('fora');
      if ((await stat(arq)).isDirectory()) arq = join(arq, 'index.html');
      const corpo = await readFile(arq);
      res.writeHead(200, { 'content-type': TIPOS[/** @type {keyof typeof TIPOS} */ (extname(arq))] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(corpo);
    } catch {
      res.writeHead(404);
      res.end('404');
    }
  };
}

/** @param {number} porta @param {string} [host] @returns {Promise<() => Promise<void>>} fecha o servidor */
export function servir(porta, host = '127.0.0.1') {
  const srv = createServer(tratador(RAIZ, true));
  return new Promise((ok, falha) => {
    srv.once('error', falha);
    srv.listen(porta, host, () => ok(() => new Promise((r) => srv.close(() => r()))));
  });
}

/**
 * Serve uma pasta qualquer (uma build montada) numa porta livre de 127.0.0.1, sem a SDK do /sdk/.
 * @param {string} raiz @returns {Promise<{ url: string, porta: number, fechar: () => Promise<void> }>}
 */
export function servirPasta(raiz) {
  const srv = createServer(tratador(raiz, false));
  return new Promise((ok, falha) => {
    srv.once('error', falha);
    srv.listen(0, '127.0.0.1', () => {
      const porta = /** @type {any} */ (srv.address()).port;
      ok({ url: `http://127.0.0.1:${porta}`, porta, fechar: () => new Promise((r) => srv.close(() => r())) });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const porta = Number(args.find((a) => /^\d+$/.test(a))) || 5410;
  await servir(porta, lan ? '0.0.0.0' : '127.0.0.1');
  process.stdout.write(`Tic Tac Toe Deluxe em http://127.0.0.1:${porta}/\n`);
  if (lan) {
    for (const lista of Object.values(networkInterfaces())) {
      for (const n of lista || []) {
        if (n.family === 'IPv4' && !n.internal) process.stdout.write(`  no celular: http://${n.address}:${porta}/\n`);
      }
    }
  }
}
