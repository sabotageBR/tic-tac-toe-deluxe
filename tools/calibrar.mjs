// CPU contra CPU nas regras do jogo (sem DOM): vitorias de quem comeca e do segundo, empates, lances por
// partida e o tempo de cada lance. Quem comeca alterna a cada partida, como no jogo.
// Uso: node tools/calibrar.mjs <n> <k> <nivelA> <nivelB> <partidas> [orcamento]
//   ex.: node tools/calibrar.mjs 5 4 2 2 40 10000   (o Grande 5x5, nivel padrao)
import { REGRAS, inicial } from '../src/jogo/regras.js';
import { escolher } from '../src/jogo/ia.js';
import { criarRng } from '../src/core/rng.js';

const [n = 3, k = 3, na = 2, nb = 2, N = 40, orcamento = 30000] = process.argv.slice(2).map(Number);
const res = { comeca: 0, segundo: 0, empate: 0 };
let lances = 0;
let tMax = 0;
let tTot = 0;
let jogadas = 0;
for (let g = 0; g < N; g++) {
  const rng = criarRng(1000 + g);
  const comeca = g % 2 ? 2 : 1;
  let E = inicial({ n, k, comeca });
  while (!REGRAS.resultado(E)) {
    const t0 = performance.now();
    const j = escolher(REGRAS, E, { nivel: E.vez === 1 ? na : nb, rng, orcamento });
    const dt = performance.now() - t0;
    tMax = Math.max(tMax, dt);
    tTot += dt;
    jogadas++;
    E = REGRAS.aplicar(E, j).E;
  }
  const r = /** @type {any} */ (REGRAS.resultado(E));
  lances += E.lances;
  if (!r.vencedor) res.empate++;
  else if (r.vencedor === comeca) res.comeca++;
  else res.segundo++;
}
process.stdout.write(`${n}x${n}, ${k} em linha, nivel ${na} x ${nb}, orcamento ${orcamento}: comeca ${res.comeca} / segundo ${res.segundo} / empate ${res.empate}; `
  + `${(lances / N).toFixed(1)} lances por partida; lance da CPU ${(tTot / jogadas).toFixed(1)} ms (max ${tMax.toFixed(0)})\n`);
