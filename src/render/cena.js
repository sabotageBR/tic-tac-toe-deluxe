// A cena (porte do src/render/tec/cena.js do tic-tac-toe-slime): Canvas 2D em duas camadas (fundo +
// tabuleiro | pecas + efeitos) e a camera que enquadra a janela do modo dentro da #area do HUD.
// Nada desenha com canvas 0x0.

import { enquadrar, paraMundo, paraTela, aplicar, deslocada } from './camera.js';
import { criarVfx } from './vfx.js';
import { criarFundo, TEMA } from './fundo.js';
import { desenhoTabuleiro } from './tabuleiro.js';

/** So o dpr muda: o desenho e leve (tracos e sprites). */
export const QUALIDADES = [
  { nome: 'alta', dpr: 2 },
  { nome: 'media', dpr: 1.5 },
  { nome: 'baixa', dpr: 1 },
  { nome: 'minima', dpr: 1 },
];

/**
 * @param {{ fundo: HTMLCanvasElement, topo: HTMLCanvasElement, area: HTMLElement }} el
 */
export function criarCena(el) {
  const ctxFundo = /** @type {CanvasRenderingContext2D} */ (el.fundo.getContext('2d'));
  const ctxTopo = /** @type {CanvasRenderingContext2D} */ (el.topo.getContext('2d'));
  const vfx = criarVfx();
  const fundo = criarFundo();
  let qual = 0;
  let W = 0;
  let H = 0;
  let dpr = 1;
  /** @type {import('./camera.js').Camera|null} */
  let cam = null;

  /** @param {number[]} janela */
  function medir(janela) {
    W = Math.max(0, window.innerWidth | 0);
    H = Math.max(0, window.innerHeight | 0);
    dpr = Math.min(QUALIDADES[qual].dpr, window.devicePixelRatio || 1);
    for (const c of [el.fundo, el.topo]) {
      const w = Math.max(1, Math.round(W * dpr));
      const h = Math.max(1, Math.round(H * dpr));
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    }
    const r = el.area.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) cam = enquadrar(janela, { x: r.left, y: r.top, w: r.width, h: r.height });
  }

  /** @param {any} modo @param {number} t */
  function desenhar(modo, t) {
    medir(modo.janela);
    if (!cam || W < 2 || H < 2) return;
    const vis = modo.visual();
    const [tx, ty] = vfx.tremor;
    const cq = deslocada(cam, tx, ty);
    const g = { ctx: ctxFundo, cam: cq, dpr, t, vis, palco: modo.palco, geo: modo.tabuleiro, W, H, tema: TEMA, vivo: 1 - modo.palco.apagar };
    // fundo e tabuleiro
    fundo.desenhar(ctxFundo, TEMA, W, H, dpr, cam.sx, cam.sy, t);
    aplicar(ctxFundo, cq, dpr);
    desenhoTabuleiro.fundo(g);
    // pecas e efeitos
    ctxTopo.setTransform(1, 0, 0, 1, 0, 0);
    ctxTopo.clearRect(0, 0, el.topo.width, el.topo.height);
    aplicar(ctxTopo, cq, dpr);
    g.ctx = ctxTopo;
    desenhoTabuleiro.topo(g);
    ctxTopo.globalAlpha = 1;
    ctxTopo.globalCompositeOperation = 'source-over';
    vfx.desenhar(ctxTopo, cq, dpr);
  }

  return {
    desenhar,
    vfx,
    /** @param {number} dt */
    passo(dt) { vfx.passo(dt); },
    /** @param {number} px @param {number} py */
    paraMundo(px, py) { return cam ? paraMundo(cam, px, py) : null; },
    /** @param {number} x @param {number} y */
    paraTela(x, y) { return cam ? paraTela(cam, x, y) : null; },
    get camera() { return cam; },
    get qualidade() { return QUALIDADES[qual].nome; },
    /** @param {number} k */
    definirQualidade(k) { qual = Math.max(0, Math.min(QUALIDADES.length - 1, k)); },
    get nivelQualidade() { return qual; },
  };
}
