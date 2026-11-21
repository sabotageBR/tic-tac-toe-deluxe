// Fila de acoes da encenacao (copia do src/jogo/gotas.js do tic-tac-toe-slime, so a parte sem fisica).
// Uma acao e { nome, passo(dt) => terminou? }: o modo roda a fila e so devolve a vez quando ela esvazia.
// Logica pura: o tempo entra por dt.

/** @typedef {{ nome: string, passo: (dt: number) => boolean }} Acao */

/** Espera t segundos. @param {number} dur @returns {Acao} */
export function esperar(dur) {
  let t = 0;
  return { nome: 'esperar', passo(dt) { t += dt; return t >= dur; } };
}

/** Roda uma funcao uma vez (passo instantaneo da encenacao). @param {() => void} fn @returns {Acao} */
export function fazer(fn) {
  return { nome: 'fazer', passo() { fn(); return true; } };
}

/**
 * Varias acoes ao mesmo tempo; termina quando todas terminam.
 * @param {Acao[]} lista @returns {Acao}
 */
export function juntas(lista) {
  const vivas = lista.slice();
  return {
    nome: 'juntas',
    passo(dt) {
      for (let k = vivas.length - 1; k >= 0; k--) if (vivas[k].passo(dt)) vivas.splice(k, 1);
      return !vivas.length;
    },
  };
}

/** Fila de acoes em sequencia (a encenacao de um lance). */
export function criarFila() {
  /** @type {Acao[]} */
  const fila = [];
  return {
    /** @param {...Acao} a */
    por(...a) { fila.push(...a); },
    get vazia() { return !fila.length; },
    get tamanho() { return fila.length; },
    limpar() { fila.length = 0; },
    /** @param {number} dt */
    passo(dt) {
      // varias instantaneas no mesmo quadro
      let guarda = 0;
      while (fila.length && guarda++ < 16) {
        if (!fila[0].passo(dt)) return;
        fila.shift();
        dt = 0;
      }
    },
  };
}
