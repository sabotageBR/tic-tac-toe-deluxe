// Primitivas de som sintetizado (WebAudio): tom (oscilador com envelope, glide, vibrato, tremolo e
// filtro) e sopro (ruido filtrado). Copia enxuta do src/som/receitas.js do tic-tac-toe-slime (que veio
// do slime-merge): so o que as receitas de src/som/sons.js usam.
//
// Toda receita tem a assinatura (v, t0, p) => duracao em s, com v = { ctx, destino, ruido }:
// - ctx: AudioContext ao vivo (ou o contexto falso dos testes);
// - destino: o no onde a receita liga (o barramento de efeitos);
// - ruido: buffer de ruido branco pronto (opcional; sem ele, um buffer em cache por contexto).
//
// Regras: nada de sorteio do sistema (o ruido usa LCG com semente fixa: o mesmo som sempre); todo
// envelope nasce em 0,0001 e morre em 0,0001 (sem clique); toda fonte para sozinha logo depois do
// envelope.

const MIN = 0.0001;

/** @param {number} m nota MIDI @returns {number} Hz */
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ ruido
const buffers = new WeakMap();

/**
 * Buffer de ruido branco deterministico (1 s, LCG), um por contexto.
 * @param {BaseAudioContext} ctx
 * @returns {AudioBuffer}
 */
export function bufferRuido(ctx) {
  let b = buffers.get(ctx);
  if (!b) {
    const n = Math.max(1, Math.floor(ctx.sampleRate));
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      d[i] = s / 2147483648 - 1;
    }
    buffers.set(ctx, b);
  }
  return b;
}

/** Desloca o comeco do ruido a cada uso (o mesmo ruido repetido soaria igual). */
let giro = 0;
function proximoDeslocamento() {
  giro = (giro + 1) % 997;
  return (giro * 0.2137) % 0.85;
}

/** @typedef {{ ctx: BaseAudioContext, destino: AudioNode, ruido?: AudioBuffer|null }} Via */

// ------------------------------------------------------------------ primitivas
/**
 * Envelope de ganho exponencial sem clique: MIN -> pico (ataque) -> segura -> MIN (queda).
 * @param {AudioParam} param
 * @returns {number} instante do fim
 */
function envelope(param, t0, pico, ataque, queda, segurar = 0) {
  const p = Math.max(MIN * 2, pico);
  param.setValueAtTime(MIN, t0);
  param.exponentialRampToValueAtTime(p, t0 + Math.max(0.001, ataque));
  if (segurar > 0) param.setValueAtTime(p, t0 + ataque + segurar);
  param.exponentialRampToValueAtTime(MIN, t0 + ataque + segurar + Math.max(0.005, queda));
  return t0 + ataque + segurar + queda;
}

/**
 * Curva de frequencia: valor no t0, glide exponencial ate f2, ou pontos [t relativo, Hz].
 * @param {AudioParam} param
 * @param {number} t0
 * @param {{f: number, f2?: number, glide?: number, curva?: [number, number][]}} o
 * @param {number} dur
 */
function curvaFreq(param, t0, o, dur) {
  if (o.curva && o.curva.length) {
    param.setValueAtTime(Math.max(20, o.curva[0][1]), t0 + o.curva[0][0]);
    for (let i = 1; i < o.curva.length; i++) param.exponentialRampToValueAtTime(Math.max(20, o.curva[i][1]), t0 + o.curva[i][0]);
    return;
  }
  param.setValueAtTime(Math.max(20, o.f), t0);
  if (o.f2 && o.f2 !== o.f) param.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + (o.glide || dur));
}

/**
 * @typedef {object} OpTom
 * @property {number} f Hz
 * @property {number} [f2] glide exponencial ate f2 em `glide` s (padrao: a duracao toda)
 * @property {number} [glide]
 * @property {[number, number][]} [curva] pontos [t relativo, Hz] (rampas exponenciais)
 * @property {number} [vol] pico (padrao 0,2)
 * @property {number} [ataque] s (padrao 0,005)
 * @property {number} [segurar] s
 * @property {number} [queda] s (padrao 0,2)
 * @property {OscillatorType} [tipo] padrao 'sine'
 * @property {any} [onda] PeriodicWave (vence o tipo)
 * @property {{f: number, prof: number, fim?: number, atraso?: number}} [vib] vibrato (prof em Hz)
 * @property {{f: number, prof: number}} [trem] tremolo (prof 0..0,5)
 * @property {{tipo?: BiquadFilterType, f: number, f2?: number, glide?: number, curva?: [number, number][], q?: number}} [filtro]
 * @property {AudioNode} [destino]
 */

/**
 * Oscilador com envelope (e glide, vibrato, tremolo e filtro opcionais).
 * @param {Via} v
 * @param {number} t0
 * @param {OpTom} o
 * @returns {number} instante do fim
 */
export function tom(v, t0, o) {
  const { ctx } = v;
  const ataque = o.ataque === undefined ? 0.005 : o.ataque;
  const queda = o.queda === undefined ? 0.2 : o.queda;
  const segurar = o.segurar || 0;
  const dur = ataque + segurar + queda;
  const osc = ctx.createOscillator();
  if (o.onda && typeof osc.setPeriodicWave === 'function') osc.setPeriodicWave(o.onda);
  else osc.type = o.tipo || 'sine';
  curvaFreq(osc.frequency, t0, o, dur);
  const g = ctx.createGain();
  const fim = envelope(g.gain, t0, o.vol === undefined ? 0.2 : o.vol, ataque, queda, segurar);
  /** @type {AudioNode} */
  let ultimo = osc;
  if (o.filtro) {
    const fl = ctx.createBiquadFilter();
    fl.type = o.filtro.tipo || 'lowpass';
    curvaFreq(fl.frequency, t0, o.filtro, dur);
    fl.Q.value = o.filtro.q === undefined ? 0.8 : o.filtro.q;
    ultimo.connect(fl);
    ultimo = fl;
  }
  ultimo.connect(g);
  let saida = /** @type {AudioNode} */ (g);
  const extras = [];
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(o.vib.f, t0);
    const lg = ctx.createGain();
    const atraso = o.vib.atraso || 0;
    lg.gain.setValueAtTime(atraso ? 0 : o.vib.prof, t0);
    if (atraso) lg.gain.linearRampToValueAtTime(o.vib.prof, t0 + atraso + 0.08);
    if (o.vib.fim !== undefined) lg.gain.linearRampToValueAtTime(o.vib.fim, t0 + dur);
    lfo.connect(lg);
    lg.connect(osc.frequency);
    extras.push(lfo);
  }
  if (o.trem) {
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(1 - o.trem.prof, t0);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(o.trem.f, t0);
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(o.trem.prof, t0);
    lfo.connect(lg);
    lg.connect(tg.gain);
    g.connect(tg);
    saida = tg;
    extras.push(lfo);
  }
  saida.connect(o.destino || v.destino);
  osc.start(t0);
  osc.stop(fim + 0.05);
  for (const x of extras) {
    x.start(t0);
    x.stop(fim + 0.05);
  }
  return fim;
}

/**
 * @typedef {object} OpSopro
 * @property {number} [f] centro do filtro, Hz (padrao 1200)
 * @property {number} [f2]
 * @property {number} [glide]
 * @property {[number, number][]} [curva]
 * @property {number} [q] padrao 1
 * @property {BiquadFilterType} [filtro] padrao 'bandpass'
 * @property {number} [vol] padrao 0,2
 * @property {number} [ataque] padrao 0,002
 * @property {number} [segurar]
 * @property {number} [queda] padrao 0,1
 * @property {number} [desloca] comeco no buffer de ruido, s (padrao: gira a cada uso)
 * @property {AudioNode} [destino]
 */

/**
 * Ruido filtrado com envelope.
 * @param {Via} v
 * @param {number} t0
 * @param {OpSopro} o
 * @returns {number} instante do fim
 */
export function sopro(v, t0, o) {
  const { ctx } = v;
  const ataque = o.ataque === undefined ? 0.002 : o.ataque;
  const queda = o.queda === undefined ? 0.1 : o.queda;
  const segurar = o.segurar || 0;
  const dur = ataque + segurar + queda;
  const src = ctx.createBufferSource();
  src.buffer = v.ruido || bufferRuido(ctx);
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = o.filtro || 'bandpass';
  curvaFreq(fl.frequency, t0, { f: o.f === undefined ? 1200 : o.f, f2: o.f2, glide: o.glide, curva: o.curva }, dur);
  fl.Q.value = o.q === undefined ? 1 : o.q;
  const g = ctx.createGain();
  const fim = envelope(g.gain, t0, o.vol === undefined ? 0.2 : o.vol, ataque, queda, segurar);
  src.connect(fl);
  fl.connect(g);
  g.connect(o.destino || v.destino);
  src.start(t0, o.desloca === undefined ? proximoDeslocamento() : o.desloca);
  src.stop(fim + 0.05);
  return fim;
}
