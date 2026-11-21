// Fundo neon (porte do src/render/tec/fundo.js do tic-tac-toe-slime, so o tema do Classico do modelo 9):
// escuro com o centro azul, chao em perspectiva com o teto espelhado fraco na cor ambar do reator,
// vinheta e linhas de varredura. A parte parada fica num canvas em cache (refeito so quando a tela
// muda); por quadro so entra o horizonte que respira. Tudo em px CSS (o chamador ja aplicou o dpr).

import { rgba } from './kit.js';

/** @typedef {{ c0: string, c1: string, acento: string }} Tema */

/** O Classico do modelo 9: o azul do Classico tech com o acento ambar da Sobrecarga. */
export const TEMA = Object.freeze({ c0: '#04060f', c1: '#0b1a3a', acento: '#ffab2e' });

export function criarFundo() {
  /** @type {HTMLCanvasElement|null} */
  let cache = null;
  let chave = '';

  /**
   * @param {Tema} tema @param {number} W @param {number} H @param {number} dpr @param {number} cx @param {number} cy centro do tabuleiro (px)
   */
  function montar(tema, W, H, dpr, cx, cy) {
    const c = cache || document.createElement('canvas');
    cache = c;
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = Math.max(W, H) * 0.75;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, tema.c1);
    g.addColorStop(1, tema.c0);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const a = tema.acento;
    // chao em perspectiva na metade de baixo e teto espelhado bem fraco
    const hz = cy;
    x.lineWidth = 1;
    for (const lado of [1, -1]) {
      for (let k = 1; k <= 12; k++) {
        const y = hz + lado * (H * 0.55) * Math.pow(k / 12, 2.2);
        x.strokeStyle = rgba(a, (lado > 0 ? 0.2 : 0.09) * (k / 12));
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(W, y);
        x.stroke();
      }
      for (let k = -14; k <= 14; k++) {
        x.strokeStyle = rgba(a, lado > 0 ? 0.11 : 0.05);
        x.beginPath();
        x.moveTo(cx + k * 12, hz + lado * 4);
        x.lineTo(cx + k * W * 0.16, hz + lado * H * 0.6);
        x.stroke();
      }
    }
    // vinheta
    const v = x.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, R * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.62)');
    x.fillStyle = v;
    x.fillRect(0, 0, W, H);
    // linhas de varredura
    x.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
  }

  return {
    /**
     * @param {CanvasRenderingContext2D} ctx @param {Tema} tema @param {number} W @param {number} H @param {number} dpr
     * @param {number} cx @param {number} cy @param {number} t
     */
    desenhar(ctx, tema, W, H, dpr, cx, cy, t) {
      const k = [tema.acento, tema.c1, W, H, dpr, Math.round(cx), Math.round(cy)].join('|');
      if (k !== chave || !cache) { chave = k; montar(tema, W, H, dpr, cx, cy); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(/** @type {HTMLCanvasElement} */ (cache), 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // o horizonte respira
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.5 + 0.5 * Math.sin(t * 1.3);
      const g = ctx.createLinearGradient(0, cy - 60, 0, cy + 60);
      g.addColorStop(0, rgba(tema.acento, 0));
      g.addColorStop(0.5, rgba(tema.acento, 0.05 + 0.04 * p));
      g.addColorStop(1, rgba(tema.acento, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, cy - 60, W, 120);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
