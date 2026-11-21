// Prova o zip da Y8 (npm run empacotar:y8) no Chrome headless pelo DevTools Protocol (tools/cdp.mjs), nos dois
// cenarios que a revisao da Y8 cobra. O zip e aberto em .tmp/verificar-y8/jogo/ e servido numa porta livre.
// A) SDK bloqueado (--host-resolver-rules leva cdn.y8.com a 127.0.0.1:9: o caso do bloqueador de anuncio), no
//    desktop e no retrato do celular: o jogo fica de pe em menos de 3 s, um clique numa casa joga, nenhum pedido
//    externo alem do SDK, nenhum erro no console; sem anuncio, o Recomecar nao congela nada e o "Continuar"
//    nunca aparece.
// B) SDK falso servido no endereco do CDN (Fetch.fulfillRequest), com y8.sdk() -> init, getPlatformLocale ('es')
//    e showAd, emitindo y8sdk.ready: o init recebe o appId e o gameId do package.json; o idioma vira 'es'; o
//    intersticial NUNCA sai sozinho (nem antes de jogar, nem antes de 180 s de jogo, nem entre partidas
//    encadeadas) e so e pedido DENTRO do clique num botao (Recomecar, ou o "Continuar" entre as partidas); o
//    jogo so congela e cala no beforeAd e volta no adBreakDone; o break pulado nao congela; perder o foco
//    congela e cala, e o foco de volta solta.
// Fotos em .tmp/verificar-y8/. Uso: node tools/verificar-y8.mjs [caminho do zip]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { abrirChrome, espera } from './cdp.mjs';
import { RAIZ, servirPasta } from './servir.mjs';

const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
const IDS = pacote.portais.y8;
const zip = resolve(process.argv[2] || join(RAIZ, 'dist-y8', `tic-tac-toe-deluxe-y8-${pacote.version}.zip`));
const tmp = join(RAIZ, '.tmp', 'verificar-y8');
const pasta = join(tmp, 'jogo');
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });
const u = spawnSync('unzip', ['-q', '-o', zip, '-d', pasta], { encoding: 'utf8' });
if (u.status !== 0) { process.stdout.write(`nao abriu ${zip}: ${u.stderr}\n`); process.exit(1); }
const srv = await servirPasta(pasta);

/** @type {string[]} */
const falhas = [];
/** @type {string[]} */
const notas = [];
const exigir = (/** @type {boolean} */ ok, /** @type {string} */ msg) => { if (!ok) falhas.push(msg); };

/** SDK falso: registra init e showAd (com o evento em curso no pedido) e fotografa o jogo em cada etapa do anuncio. */
const SDK_FALSO = `(() => {
  const reg = (window.__y8 = { chamadas: [] });
  const jogo = () => window.__jogo;
  const foto = () => { const j = jogo(); return j ? { emAnuncio: j.emAnuncio, t: j.J.t, calado: j.audio.estado().emAnuncio } : null; };
  const sdk = {
    init(a, b) { reg.chamadas.push({ f: 'init', appId: a && a.appId, gameId: b && b.gameId, autoLogin: a && a.autoLogin }); },
    getPlatformLocale() { return Promise.resolve('es'); },
    showAd(p) {
      const ev = window.event;
      const alvo = ev && ev.target && ev.target.closest ? ev.target.closest('button') : null;
      const r = { f: 'showAd', type: p.type, evento: ev ? ev.type : null, botao: alvo ? alvo.id : null, detalhe: ev ? ev.detail : null, pedido: foto() };
      reg.chamadas.push(r);
      const pula = !!window.__y8pular;
      setTimeout(() => {
        if (pula) { r.pulado = true; p.adBreakDone({ breakStatus: 'frequencyCapped' }); setTimeout(() => { r.depois = foto(); }, 200); return; }
        r.antesDoBefore = foto();
        p.beforeAd();
        r.noBefore = foto();
        setTimeout(() => {
          r.antesDoFim = foto();
          p.afterAd();
          p.adBreakDone({ breakStatus: 'viewed' });
          setTimeout(() => { r.depois = foto(); }, 300);
        }, 1200);
      }, 150);
    },
  };
  window.y8 = { sdk: () => sdk, emitReadyEvent() { dispatchEvent(new Event('y8sdk.ready')); } };
  setTimeout(() => dispatchEvent(new Event('y8sdk.ready')), 30);
})();`;

/** Abre a pagina e espera o jogo de pe (ganchos, sem a tela de carregamento, laco andando). Devolve os ms. */
async function abrir(ch, query = '') {
  const t0 = Date.now();
  await ch.cmd('Page.navigate', { url: `${srv.url}/index.html${query}` });
  for (let k = 0; k < 100; k++) {
    await espera(50);
    try {
      if (await ch.avaliar("!!window.__jogo && !document.getElementById('carregando') && window.__jogo.J.t > 0")) return Date.now() - t0;
    } catch { /* a pagina ainda esta carregando */ }
  }
  return -1;
}
const ler = (ch, expr) => ch.avaliar(expr);
/** clica no centro de uma casa do tabuleiro */
async function clicarCasa(ch, casa) {
  const p = await ler(ch, `(() => { const j = window.__jogo; const w = j.J.modo.toque({ casa: ${casa} }); return j.cena.paraTela(w[0], w[1]); })()`);
  await ch.clicar(Math.round(p[0]), Math.round(p[1]));
}
/** clica no centro de um elemento */
async function clicarEm(ch, seletor) {
  const r = await ler(ch, `(() => { const b = document.querySelector(${JSON.stringify(seletor)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  await ch.clicar(Math.round(r[0]), Math.round(r[1]));
}
const anuncios = (ch) => ler(ch, "window.__y8 ? window.__y8.chamadas.filter((c) => c.f === 'showAd') : []");
/** pedidos fora do servidor local e do CDN da Y8 */
const externos = (ch) => ch.rede.filter((x) => !/^(data|blob|about|chrome):/.test(x)).filter((x) => { const h = new URL(x).host; return h !== `127.0.0.1:${srv.porta}` && h !== 'cdn.y8.com'; });

// ------------------------------------------------------------------ A) SDK bloqueado
for (const tela of [{ l: 1280, a: 720 }, { l: 390, a: 844, toque: true, escala: 2 }]) {
  const rot = `A ${tela.l}x${tela.a}`;
  const ch = await abrirChrome({ largura: tela.l, altura: tela.a, toque: !!tela.toque, escala: tela.escala || 1, args: ['--host-resolver-rules=MAP cdn.y8.com 127.0.0.1:9'] });
  try {
    const ms = await abrir(ch);
    exigir(ms >= 0 && ms < 3000, `${rot}: o jogo nao ficou de pe em 3 s (${ms} ms)`);
    await espera(300);
    const e = await ler(ch, '({ falhou: window.__sdkFalhou === 1, pronto: window.__jogo.portal.sdkPronto, anuncios: window.__jogo.portal.temAnuncios, lang: window.__jogo.lang })');
    exigir(e.falhou && !e.anuncios, `${rot}: o SDK bloqueado nao foi tratado (${JSON.stringify(e)})`);
    await clicarCasa(ch, 4);
    await espera(700);
    const jogada = await ler(ch, '({ dono: window.__jogo.J.modo.E.donos[4], jogou: window.__jogo.J.jogou, lances: window.__jogo.J.modo.E.lances })');
    exigir(jogada.dono === 1 && jogada.jogou, `${rot}: o clique na casa do meio nao jogou (${JSON.stringify(jogada)})`);
    // sem anuncio: o Recomecar com 200 s de jogo nao congela nada e o "Continuar" nunca aparece
    await ler(ch, 'window.__jogo.J.t = 200');
    await clicarEm(ch, '#btnReiniciar');
    const t1 = await ler(ch, 'window.__jogo.J.t');
    await espera(500);
    const d = await ler(ch, '({ t: window.__jogo.J.t, emAnuncio: window.__jogo.emAnuncio, pedindo: window.__jogo.pedindo, seguir: !!document.getElementById("btnSeguir") })');
    exigir(d.t > t1 && !d.emAnuncio && !d.pedindo && !d.seguir, `${rot}: sem SDK o Recomecar mexeu no jogo (${JSON.stringify(d)})`);
    writeFileSync(join(tmp, `a-${tela.l}x${tela.a}.png`), await ch.print());
    for (const x of externos(ch)) falhas.push(`${rot}: pedido externo ${x}`);
    for (const x of ch.erros) falhas.push(`${rot}: erro no console: ${String(x).slice(0, 200)}`);
    notas.push(`${rot}: de pe em ${ms} ms, SDK bloqueado tratado (temAnuncios ${e.anuncios}), o clique jogou a casa 4, ${ch.erros.length} erros no console, pedidos: ${[...new Set(ch.rede.map((x) => new URL(x).host))].join(', ')}`);
  } finally {
    await ch.fechar();
  }
}

// ------------------------------------------------------------------ B) SDK falso no endereco do CDN
{
  const rot = 'B';
  const ch = await abrirChrome({ largura: 1280, altura: 720, interceptar: { padrao: '*cdn.y8.com*', corpo: SDK_FALSO } });
  try {
    const ms = await abrir(ch);
    exigir(ms >= 0, `${rot}: o jogo nao ficou de pe`);
    let lang = '';
    for (let k = 0; k < 40 && lang !== 'es'; k++) { await espera(100); lang = await ler(ch, 'window.__jogo.lang'); }
    const init = await ler(ch, "window.__y8 && window.__y8.chamadas.find((c) => c.f === 'init')");
    exigir(!!init && init.appId === IDS.appId && init.gameId === IDS.gameId, `${rot}: o init nao recebeu os ids (${JSON.stringify(init)})`);
    exigir(lang === 'es', `${rot}: o idioma do getPlatformLocale nao valeu (${lang})`);
    const pronto = await ler(ch, '({ pronto: window.__jogo.portal.sdkPronto, anuncios: window.__jogo.portal.temAnuncios })');
    exigir(pronto.pronto && pronto.anuncios, `${rot}: SDK falso nao ficou pronto (${JSON.stringify(pronto)})`);
    notas.push(`${rot}: init ${JSON.stringify(init)}, idioma ${lang}`);

    // nada antes de jogar, nem com 200 s no relogio
    await ler(ch, 'window.__jogo.J.t = 200');
    await clicarEm(ch, '#btnReiniciar');
    await espera(400);
    exigir((await anuncios(ch)).length === 0, `${rot}: intersticial antes de o jogador jogar`);
    // joga uma casa; o Recomecar antes de 180 s de jogo nao pede
    await ler(ch, 'window.__jogo.J.t = 5');
    await clicarCasa(ch, 4);
    await espera(400);
    await clicarEm(ch, '#btnReiniciar');
    await espera(400);
    exigir((await anuncios(ch)).length === 0, `${rot}: intersticial antes de 180 s de jogo`);
    // com 200 s de jogo, o clique no Recomecar pede DENTRO do clique; o jogo so congela no beforeAd
    await ler(ch, 'window.__jogo.J.t = 200');
    await clicarEm(ch, '#btnReiniciar');
    await espera(2000);
    let lista = await anuncios(ch);
    const a1 = lista[0];
    exigir(lista.length === 1, `${rot}: o Recomecar com 200 s de jogo deveria pedir 1 intersticial (pediu ${lista.length})`);
    if (a1) {
      exigir(a1.type === 'next' && a1.evento === 'click' && a1.botao === 'btnReiniciar' && a1.detalhe > 0, `${rot}: o pedido nao saiu dentro do clique no Recomecar (${JSON.stringify(a1)})`);
      exigir(a1.pedido && !a1.pedido.emAnuncio && !a1.antesDoBefore.emAnuncio && !a1.antesDoBefore.calado, `${rot}: o jogo congelou ou calou ANTES do beforeAd`);
      exigir(a1.noBefore && a1.noBefore.emAnuncio && a1.noBefore.calado, `${rot}: o jogo nao congelou e calou no beforeAd (${JSON.stringify(a1.noBefore)})`);
      exigir(a1.antesDoFim && a1.antesDoFim.t === a1.noBefore.t, `${rot}: o jogo andou durante o anuncio`);
      exigir(a1.depois && !a1.depois.emAnuncio && !a1.depois.calado, `${rot}: o jogo nao voltou depois do adBreakDone (${JSON.stringify(a1.depois)})`);
      notas.push(`${rot}: intersticial 1 no clique em #${a1.botao} (evento ${a1.evento}, detail ${a1.detalhe}); no pedido emAnuncio=${a1.pedido.emAnuncio}, no beforeAd emAnuncio=${a1.noBefore.emAnuncio} calado=${a1.noBefore.calado}, J.t parado em ${a1.noBefore.t.toFixed(2)} durante o anuncio, depois emAnuncio=${a1.depois.emAnuncio}`);
    }
    const tVolta = await ler(ch, 'window.__jogo.J.t');
    await espera(300);
    exigir((await ler(ch, 'window.__jogo.J.t')) > tVolta, `${rot}: o jogo nao voltou a andar depois do anuncio`);
    // logo em seguida, outro Recomecar nao pede (180 s)
    await clicarEm(ch, '#btnReiniciar');
    await espera(500);
    exigir((await anuncios(ch)).length === 1, `${rot}: dois intersticiais em menos de 180 s`);
    // perder o foco congela e cala; o foco de volta solta
    await ler(ch, "dispatchEvent(new Event('blur'))");
    const f0 = await ler(ch, '({ t: window.__jogo.J.t, pausa: window.__jogo.pausaFoco, oculto: window.__jogo.audio.estado().oculto })');
    await espera(800);
    const f1 = await ler(ch, 'window.__jogo.J.t');
    exigir(f0.pausa && f0.oculto && f1 === f0.t, `${rot}: perder o foco nao congelou e calou (${JSON.stringify(f0)}, t depois ${f1})`);
    await ler(ch, "dispatchEvent(new Event('focus'))");
    await espera(400);
    const f2 = await ler(ch, '({ t: window.__jogo.J.t, pausa: window.__jogo.pausaFoco, oculto: window.__jogo.audio.estado().oculto })');
    exigir(!f2.pausa && !f2.oculto && f2.t > f1, `${rot}: o foco de volta nao soltou o jogo (${JSON.stringify(f2)})`);
    notas.push(`${rot}: blur congelou (J.t parado em ${f0.t.toFixed(2)} por 800 ms) e calou (audio oculto=${f0.oculto}); focus soltou`);
    for (const x of externos(ch)) falhas.push(`${rot}: pedido externo ${x}`);
    for (const x of ch.erros) falhas.push(`${rot}: erro no console: ${String(x).slice(0, 200)}`);
  } finally {
    await ch.fechar();
  }
}

// ------------------------------------------------------------------ B2) partidas encadeadas (o bot joga pela pessoa)
{
  const rot = 'B2';
  const ch = await abrirChrome({ largura: 1280, altura: 720, interceptar: { padrao: '*cdn.y8.com*', corpo: SDK_FALSO } });
  try {
    await abrir(ch, '?auto=150&nivel=0');
    for (let k = 0; k < 40; k++) { await espera(100); if (await ler(ch, 'window.__jogo.portal.temAnuncios')) break; }
    // o primeiro gesto (uma seta) liga o gameplay; o bot faz as jogadas
    await ch.tecla('ArrowLeft');
    // varias partidas encadeadas antes de 180 s: nem intersticial nem "Continuar"
    let vistos = 0;
    for (let k = 0; k < 120; k++) {
      await espera(250);
      vistos = await ler(ch, 'window.__jogo.J.modo.hud().partidas');
      if (vistos >= 3) break;
    }
    exigir(vistos >= 3, `${rot}: o bot nao terminou 3 partidas (${vistos})`);
    exigir((await anuncios(ch)).length === 0 && !(await ler(ch, 'window.__jogo.esperandoClique')), `${rot}: intersticial ou "Continuar" antes de 180 s`);
    // passados 180 s de jogo, a partida encadeada seguinte espera o "Continuar" (sem anuncio sozinho)
    await ler(ch, 'window.__jogo.J.t = window.__jogo.ultimoIntervalo + 200');
    let esperando = false;
    for (let k = 0; k < 80 && !esperando; k++) { await espera(150); esperando = await ler(ch, 'window.__jogo.esperandoClique'); }
    exigir(esperando, `${rot}: o "Continuar" nao apareceu entre as partidas depois de 180 s`);
    const c0 = await ler(ch, '({ t: window.__jogo.J.t, texto: document.getElementById("btnSeguir").textContent, visivel: !document.getElementById("btnSeguir").hidden })');
    await espera(1500);
    const c1 = await ler(ch, 'window.__jogo.J.t');
    exigir(c0.visivel && c1 === c0.t, `${rot}: com o "Continuar" na tela o jogo andou (${JSON.stringify(c0)}, t depois ${c1})`);
    exigir((await anuncios(ch)).length === 0, `${rot}: o intersticial saiu sem o clique no "Continuar"`);
    writeFileSync(join(tmp, 'b2-continuar.png'), await ch.print());
    await clicarEm(ch, '#btnSeguir');
    await espera(2000);
    let lista = await anuncios(ch);
    const a = lista[0];
    exigir(lista.length === 1 && a.evento === 'click' && a.botao === 'btnSeguir', `${rot}: o "Continuar" nao pediu o intersticial dentro do clique (${JSON.stringify(lista)})`);
    exigir(a && a.noBefore && a.noBefore.emAnuncio && a.depois && !a.depois.emAnuncio, `${rot}: pausa do anuncio errada no "Continuar"`);
    exigir(!(await ler(ch, 'window.__jogo.esperandoClique')), `${rot}: o "Continuar" ficou na tela`);
    notas.push(`${rot}: ${vistos} partidas encadeadas sem anuncio; depois de 180 s o "Continuar" (${c0.texto}) segurou o jogo (J.t parado) e o intersticial saiu so no clique em #${a && a.botao}`);
    // break pulado (limite de frequencia da Y8): nada congela
    await ler(ch, "window.__y8pular = true; window.__congelou = false; window.__amostra = setInterval(() => { if (window.__jogo.emAnuncio || window.__jogo.audio.estado().emAnuncio) window.__congelou = true; }, 5)");
    await ler(ch, 'window.__jogo.J.t = window.__jogo.ultimoIntervalo + 200');
    esperando = false;
    for (let k = 0; k < 80 && !esperando; k++) { await espera(150); esperando = await ler(ch, 'window.__jogo.esperandoClique'); }
    exigir(esperando, `${rot}: o segundo "Continuar" nao apareceu`);
    await clicarEm(ch, '#btnSeguir');
    await espera(800);
    lista = await anuncios(ch);
    const p = lista[1];
    const congelou = await ler(ch, 'window.__congelou');
    exigir(lista.length === 2 && p.pulado && !congelou && p.depois && !p.depois.emAnuncio, `${rot}: o break pulado congelou ou calou o jogo (${JSON.stringify(p)}, congelou ${congelou})`);
    notas.push(`${rot}: break pulado (frequencyCapped, sem beforeAd) nao congelou nem calou o jogo`);
    // em todo o roteiro, todo pedido saiu dentro de um clique num botao
    for (const x of lista) exigir(x.evento === 'click' && !!x.botao, `${rot}: pedido fora de um clique num botao (${JSON.stringify(x)})`);
    for (const x of externos(ch)) falhas.push(`${rot}: pedido externo ${x}`);
    for (const x of ch.erros) falhas.push(`${rot}: erro no console: ${String(x).slice(0, 200)}`);
  } finally {
    await ch.fechar();
  }
}

await srv.fechar();
for (const n of notas) process.stdout.write(`  ${n}\n`);
process.stdout.write(falhas.length ? `FALHA (${falhas.length}):\n${falhas.map((f) => `  - ${f}`).join('\n')}\n` : `ok: ${zip}\n`);
process.exit(falhas.length ? 1 : 0);
