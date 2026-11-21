// Todo texto visivel do jogo, nos tres idiomas dele (pt-BR, en, es; num idioma que o jogo nao tem, o
// main.js cai no ingles). O modo so emite chaves; o HUD traduz. O codigo de src/jogo/ fica em ASCII.

/** @type {Record<string, Record<string, string>>} */
export const TEXTOS = {
  pt: {
    titulo: 'Tic Tac Toe Deluxe',
    voce: 'Você', cpu: 'CPU', jogador1: 'Ciano', jogador2: 'Magenta',
    suaVez: 'Sua vez', vezDe: 'Vez do {nome}', cpuPensa: 'CPU pensando…',
    venceu: '{nome} venceu!', vocVenceu: 'Você venceu!', vocPerdeu: 'A CPU venceu', empate: 'Empate',
    'bt.dois': '1 ou 2 jogadores', 'bt.reiniciar': 'Recomeçar', 'bt.som': 'Som', 'bt.seguir': 'Continuar ▶',
    classico: 'Clássico 3×3', 'classico.dica': 'Três em linha vencem.',
    grande: 'Grande 5×5', 'grande.dica': 'Tabuleiro 5×5: quatro em linha vencem.',
  },
  en: {
    titulo: 'Tic Tac Toe Deluxe',
    voce: 'You', cpu: 'CPU', jogador1: 'Cyan', jogador2: 'Magenta',
    suaVez: 'Your turn', vezDe: "{nome}'s turn", cpuPensa: 'CPU thinking…',
    venceu: '{nome} wins!', vocVenceu: 'You win!', vocPerdeu: 'CPU wins', empate: 'Draw',
    'bt.dois': '1 or 2 players', 'bt.reiniciar': 'Restart', 'bt.som': 'Sound', 'bt.seguir': 'Continue ▶',
    classico: 'Classic 3×3', 'classico.dica': 'Three in a row wins.',
    grande: 'Big 5×5', 'grande.dica': '5×5 board: four in a row wins.',
  },
  es: {
    titulo: 'Tic Tac Toe Deluxe',
    voce: 'Tú', cpu: 'CPU', jogador1: 'Cian', jogador2: 'Magenta',
    suaVez: 'Tu turno', vezDe: 'Turno de {nome}', cpuPensa: 'La CPU piensa…',
    venceu: '¡{nome} gana!', vocVenceu: '¡Ganaste!', vocPerdeu: 'Gana la CPU', empate: 'Empate',
    'bt.dois': '1 o 2 jugadores', 'bt.reiniciar': 'Reiniciar', 'bt.som': 'Sonido', 'bt.seguir': 'Continuar ▶',
    classico: 'Clásico 3×3', 'classico.dica': 'Tres en línea ganan.',
    grande: 'Grande 5×5', 'grande.dica': 'Tablero 5×5: cuatro en línea ganan.',
  },
};

/**
 * @param {string} lang @param {string} chave @param {Record<string, string|number>} [vars]
 */
export function texto(lang, chave, vars) {
  const tab = TEXTOS[lang] || TEXTOS.pt;
  let s = tab[chave] !== undefined ? tab[chave] : TEXTOS.pt[chave] !== undefined ? TEXTOS.pt[chave] : chave;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace('{' + k + '}', String(v));
  return s;
}
