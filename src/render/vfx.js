// Efeitos por cima do tabuleiro: faiscas, clarao, onda de choque e tremor da camera (porte enxuto do
// src/render/tec/vfx.js do tic-tac-toe-slime). Coordenadas do mundo; o tempo vem de fora e o sorteio e
// um LCG proprio (os prints saem iguais a cada vez).

import { aplicar } from './camera.js';
import { brilho, neon } from './kit.js';

/**
 * @typedef {{ tipo: 'faisca'|'clarao'|'onda', x: number, y: number, vx: number, vy: number, vida: number, total: number, r: number, cor: string }} Part
 */

export function criarVfx() {
  /** @type {Part[]} */
  let parts = [];
  let tremor = 0;
  let semente = 7;
  const rnd = () => {
    semente = (semente * 16807) % 2147483647;
    return semente / 2147483647;
  };

  return {
    /** Faiscas que voam e apagam. @param {number} x @param {number} y @param {string} cor */
    faisca(x, y, cor, qtd = 8, forca = 5) {
      for (let k = 0; k < qtd; k++) {
        const a = rnd() * Math.PI * 2;
        const v = forca * (0.35 + rnd() * 0.9);
        const vida = 0.25 + rnd() * 0.35;
        parts.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida, total: vida, r: 0.05 + rnd() * 0.05, cor });
      }
    },
    /** Clarao curto. @param {number} x @param {number} y */
    brilho(x, y, cor = '#ffffff', r = 1.6) {
      parts.push({ tipo: 'clarao', x, y, vx: 0, vy: 0, vida: 0.32, total: 0.32, r, cor });
    },
    /** Anel de choque que cresce ate r. @param {number} x @param {number} y @param {string} cor */
    onda(x, y, cor, r = 2.4, dur = 0.42) {
      parts.push({ tipo: 'onda', x, y, vx: 0, vy: 0, vida: dur, total: dur, r, cor });
    },
    /** Tremor curto da camera (0..1). */
    tremer(forca = 0.5) { tremor = Math.max(tremor, forca); },
    /** deslocamento da camera em px CSS */
    get tremor() {
      if (tremor <= 0.01) return [0, 0];
      return [(rnd() - 0.5) * 9 * tremor, (rnd() - 0.5) * 9 * tremor];
    },
    /** @param {number} dt */
    passo(dt) {
      for (const p of parts) {
        p.vida -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.tipo === 'faisca') { p.vx *= 1 - 3.5 * dt; p.vy *= 1 - 3.5 * dt; }
      }
      parts = parts.filter((p) => p.vida > 0);
      tremor = Math.max(0, tremor - dt * 2.4);
      if (parts.length > 600) parts.splice(0, parts.length - 600);
    },
    /**
     * @param {CanvasRenderingContext2D} ctx @param {import('./camera.js').Camera} cam @param {number} dpr
     */
    desenhar(ctx, cam, dpr) {
      aplicar(ctx, cam, dpr);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        const k = Math.max(0, p.vida / p.total);
        if (p.tipo === 'faisca') {
          ctx.strokeStyle = p.cor;
          ctx.globalAlpha = k;
          ctx.lineWidth = p.r;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
          ctx.stroke();
        } else if (p.tipo === 'clarao') {
          brilho(ctx, p.x, p.y, p.r * (1.2 - k * 0.4), p.cor, k);
        } else {
          const r = p.r * (1 - k * k);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          neon(ctx, p.cor, 0.05 + 0.1 * k, k);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
    get vazio() { return !parts.length; },
  };
}
