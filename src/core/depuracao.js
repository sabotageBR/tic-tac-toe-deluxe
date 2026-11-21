// Parametros de teste na URL. So valem em file://, localhost, 127.0.0.1 e na rede local
// (192.168.x, 10.x: o celular pela Wi-Fi). No portal nada disso existe.
// Unico modulo que le a URL (vigiado por test/estilo.test.js).
//   ?regra=grande      submodo (classico ou grande; sem ele: o ultimo escolhido, ou o classico)
//   ?dois              2 jogadores no mesmo aparelho (sem ele: contra a CPU)
//   ?nivel=0..4        forca da CPU (sem ele: 2)
//   ?semente=123       semente fixa da partida (prints reprodutiveis)
//   ?passos=600        roda N quadros antes do primeiro desenho (prints deterministicos)
//   ?auto=700          joga sozinho (o bot faz a jogada de quem tiver a vez, a cada N ms)
//   ?semanuncio        nao pede intervalo comercial
//   ?lang=pt           forca o idioma (pt, en, es)
//   ?semhud            esconde o HUD (thumb)
//   ?debug             painel de desempenho (ms do passo e do desenho)
//   ?qualidade=0..3    fixa a qualidade do desenho (alta, media, baixa, minima) e desliga a adaptativa
//   ?primeira          perfil novo (a 1a partida da vida, com a CPU que deixa ganhar)
// Em todo endereco local o jogo tambem expoe window.__jogo (os roteiros de prova e de midia o usam).

export function lerDepuracao() {
  const base = {
    local: false, ganchos: false, regra: '', dois: false, nivel: -1, semente: 0, passos: 0, auto: 0,
    semAnuncio: false, lang: '', semHud: false, debug: false, qualidade: -1, primeira: false,
  };
  let local = false;
  try {
    local = location.protocol === 'file:'
      || /^(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(location.hostname);
  } catch {
    local = false;
  }
  if (!local) return base;
  const q = new URLSearchParams(location.search || location.hash.slice(1));
  const num = (/** @type {string} */ k, /** @type {number} */ d) => (q.has(k) ? Number(q.get(k)) || d : 0);
  return Object.assign(base, {
    local: true,
    ganchos: true,
    regra: q.get('regra') || '',
    dois: q.has('dois'),
    nivel: q.has('nivel') ? Math.max(0, Math.min(4, Number(q.get('nivel')) | 0)) : -1,
    semente: num('semente', 1) >>> 0,
    passos: Math.max(0, num('passos', 0) | 0),
    auto: q.has('auto') ? Math.max(120, num('auto', 700)) : 0,
    semAnuncio: q.has('semanuncio'),
    lang: q.get('lang') || '',
    semHud: q.has('semhud'),
    debug: q.has('debug'),
    qualidade: q.has('qualidade') ? Math.max(0, Math.min(3, Number(q.get('qualidade')) | 0)) : -1,
    primeira: q.has('primeira'),
  });
}
