// Mesa de som: cada evento sonoro do jogo vira uma receita sintetizada de sons.js (sem arquivos de
// audio e sem musica). A polifonia fica por conta do audio (no maximo `max` sons por nome ao mesmo tempo).

import { SONS } from './sons.js';

/**
 * @param {ReturnType<typeof import('../core/audio.js').criarAudio>} audio
 */
export function criarMesa(audio) {
  return {
    /**
     * @param {string} nome receita de SONS
     * @param {any} [p] parametros do evento
     * @returns {number} duracao agendada, s (0 se nao tocou)
     */
    tocar(nome, p = {}) {
      const r = SONS[nome];
      return r ? audio.tocarReceita(r, p, { chave: nome, max: 3 }) : 0;
    },
  };
}
