// Camada unica de contato com a PlataformaSDK do californiagames.io (SDK 1.1), copia do wrapper do
// tic-tac-toe-slime (src/core/californiagames.js, que veio do slime-voley). Somente src/main.js importa
// este modulo (test/estilo.test.js). O index.html carrega a SDK pela tag RELATIVA
// <script src="/sdk/v1/plataforma-sdk.js"> no <head>: o portal a serve na origem dos jogos; ela nunca vai
// no zip (no teste local, tools/servir.mjs a serve de ../../plataforma/frontend/public/sdk).
//
// Regras da documentacao da SDK (pagina /developers/sdk do portal):
// - init() o quanto antes e gameLoadingStart() junto. O main.js chama o init() no fim da montagem, e o
//   laco so comeca depois do handshake (lacoAposInit): a SDK so espera o bem-vindo do portal por 1,5 s
//   desde o init(); passou disso, cai no modo autonomo;
// - gameLoadingFinished() uma vez so; gameplayStart() nunca antes dele (este modulo garante a ordem);
// - gameplayStop() antes de todo intervalo; nada de gameplayStart() durante um anuncio;
// - commercialBreak(onStart) em todo ponto natural (aqui, a partida nova): o PORTAL aplica o limite de
//   frequencia (limitarIntervalos = false);
// - rewardedBreak SEMPRE na forma de objeto ({ size, onStart }); premio so com true (o jogo nao tem
//   recompensado hoje: fica pronto para quando tiver);
// - o onStart so roda se o anuncio for mesmo exibido: e nele que o jogo cala (onAdStart);
// - sinais do portal: pause/resume -> onPausaPlataforma, mute/unmute -> onMudoPlataforma. Podem
//   chegar repetidos (o main.js trata como idempotentes) e nunca desfazem a pausa nem o mudo do jogador;
// - idioma por getLanguage() ('pt-BR' | 'en' | 'es'), nunca pelo navegador; antes do handshake ela
//   ja le o ?lang= que o portal poe na URL do iframe;
// - isAdBlocked(): sem anuncio possivel, temAnuncios fica falso.
// A SDK ja tem prazo proprio (modo autonomo em 1,5 s, resposta em 60 s) e fila antes do handshake;
// aqui so guardamos a existencia de cada metodo (o jogo roda igual se o script nao carregar).

/**
 * @typedef {Object} Portal
 * @property {() => Promise<void>} init   resolve no handshake (ou no modo autonomo); nunca rejeita
 * @property {() => void} gameLoadingFinished
 * @property {() => void} gameplayStart
 * @property {() => void} gameplayStop
 * @property {() => Promise<boolean>} commercialBreak   true se o intervalo foi pedido a SDK
 * @property {(tamanho?: 'small'|'medium'|'large') => Promise<boolean>} rewardedBreak   true so com premio
 * @property {(categoria: string, oque: string, acao: string) => void} measure
 * @property {(params: Record<string, string>) => Promise<string>} shareableURL
 * @property {(nome: string) => string} getURLParam
 * @property {boolean} sdkPronto    so leitura
 * @property {boolean} temAnuncios  so leitura: SDK pronta e sem bloqueador
 * @property {boolean} jaJogou      so leitura: houve gameplayStart nesta sessao
 * @property {boolean} emAnuncio    so leitura
 * @property {boolean} jogando      so leitura: entre gameplayStart e gameplayStop
 * @property {boolean} bloqueador   so leitura
 * @property {(() => void)|null} onAdStart   o anuncio entrou na tela: calar o jogo aqui (sincrono)
 * @property {(() => void)|null} onAdEnd
 * @property {((mudo: boolean) => void)|null} onMudoPlataforma   o portal pede mudo (mute/unmute)
 * @property {((pausa: boolean) => void)|null} onPausaPlataforma   o portal pede pausa (pause/resume)
 * @property {string} idioma        idioma do portal ('pt-BR' | 'en' | 'es'; '' sem SDK)
 * @property {boolean} limitarIntervalos   o jogo limita os intervalos por conta propria (aqui nunca)
 * @property {boolean} lacoAposInit       o laco so comeca depois do init()
 */

/** @param {unknown} v */
const limparCampo = (v) => String(v ?? '').replace(/[/^]/g, '-');

/**
 * @typedef {Object} OpcoesCalifornia
 * @property {() => any} [obterSdk]   a PlataformaSDK, ou nada
 */

/**
 * @param {OpcoesCalifornia} [opcoes]
 * @returns {Portal}
 */
export function criarCalifornia({ obterSdk = () => /** @type {any} */ (globalThis).PlataformaSDK } = {}) {
  let pronto = false;
  let carregou = false;
  let jogando = false;
  let jaJogou = false;
  let emAnuncio = false;
  /** @type {Promise<void>|null} */
  let promessaInit = null;

  /** @returns {any} */
  function sdk() {
    try {
      const s = obterSdk();
      return s && (typeof s === 'object' || typeof s === 'function') ? s : null;
    } catch {
      return null;
    }
  }

  /**
   * Chama um metodo da SDK, se existir; devolve o resultado (ou undefined).
   * @param {string} nome
   * @param {...any} args
   */
  function chamar(nome, ...args) {
    const s = sdk();
    if (!s) return undefined;
    try {
      return typeof s[nome] === 'function' ? s[nome](...args) : undefined;
    } catch {
      return undefined;
    }
  }

  /** @param {Function|null} fn @param {...any} args */
  function avisar(fn, ...args) {
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch {
      /* ignora */
    }
  }

  /** Idioma do portal ('pt-BR' | 'en' | 'es'); '' sem SDK. */
  function lerIdioma() {
    const l = chamar('getLanguage');
    return typeof l === 'string' ? l : '';
  }

  function init() {
    if (promessaInit) return promessaInit;
    // os sinais do portal: o main.js pausa, retoma e cala (sem desfazer a escolha do jogador)
    chamar('on', 'pause', () => avisar(california.onPausaPlataforma, true));
    chamar('on', 'resume', () => avisar(california.onPausaPlataforma, false));
    chamar('on', 'mute', () => avisar(california.onMudoPlataforma, true));
    chamar('on', 'unmute', () => avisar(california.onMudoPlataforma, false));
    const pedido = chamar('init');
    chamar('gameLoadingStart');
    promessaInit = Promise.resolve(pedido)
      .catch(() => undefined)
      .then(() => {
        pronto = !!sdk();
        const l = lerIdioma();
        if (l) california.idioma = l;
      });
    return promessaInit;
  }

  function gameLoadingFinished() {
    if (carregou) return;
    carregou = true;
    chamar('gameLoadingFinished');
  }

  function gameplayStart() {
    if (jogando || emAnuncio) return;
    gameLoadingFinished(); // o loading sai antes do primeiro start
    jogando = true;
    jaJogou = true;
    chamar('gameplayStart');
  }

  function gameplayStop() {
    if (!jogando) return;
    jogando = false;
    chamar('gameplayStop');
  }

  /**
   * gameplayStop, pede o anuncio com o onStart (que cala o jogo) e espera a resposta.
   * @param {(onStart: () => void) => any} pedir
   * @param {any} reserva   resultado na excecao ou na rejeicao
   */
  async function rodarAnuncio(pedir, reserva) {
    gameplayStop();
    emAnuncio = true;
    let calou = false;
    const onStart = () => {
      if (calou) return;
      calou = true;
      avisar(california.onAdStart);
    };
    let resultado = reserva;
    try {
      resultado = await pedir(onStart);
    } catch {
      resultado = reserva;
    }
    emAnuncio = false;
    if (calou) avisar(california.onAdEnd);
    return resultado;
  }

  /** Intervalo comercial num ponto natural; o portal decide se exibe. true se foi pedido. */
  async function commercialBreak() {
    const s = sdk();
    if (emAnuncio || !s || typeof s.commercialBreak !== 'function') return false;
    await rodarAnuncio((onStart) => s.commercialBreak(onStart), undefined);
    return true;
  }

  /**
   * Video recompensado, so por escolha do jogador. Sempre na forma de objeto.
   * @param {'small'|'medium'|'large'} [tamanho]   o valor do premio (padrao: medium)
   */
  async function rewardedBreak(tamanho = 'medium') {
    const s = sdk();
    if (emAnuncio || !s || typeof s.rewardedBreak !== 'function') return false;
    const r = await rodarAnuncio((onStart) => s.rewardedBreak({ size: tamanho, onStart }), false);
    return r === true;
  }

  /**
   * Metrica propria do jogo (os nomes ficam fixos depois de publicados).
   * @param {string} categoria @param {string} oque @param {string} acao
   */
  function measure(categoria, oque, acao) {
    if (emAnuncio) return;
    chamar('measure', limparCampo(categoria), limparCampo(oque), limparCampo(acao));
  }

  /** @param {Record<string, string>} params @returns {Promise<string>} */
  function shareableURL(params) {
    const p = chamar('shareableURL', params);
    return Promise.resolve(p).then((u) => (typeof u === 'string' ? u : ''), () => '');
  }

  /** @param {string} nome */
  function getURLParam(nome) {
    const v = chamar('getURLParam', nome);
    return typeof v === 'string' ? v : '';
  }

  const california = {
    init,
    gameLoadingFinished,
    gameplayStart,
    gameplayStop,
    commercialBreak,
    rewardedBreak,
    measure,
    shareableURL,
    getURLParam,
    get sdkPronto() { return pronto; },
    /** da para pedir anuncio: SDK pronta e sem bloqueador (o botao do premio some com ele) */
    get temAnuncios() { return pronto && !california.bloqueador; },
    get jaJogou() { return jaJogou; },
    get emAnuncio() { return emAnuncio; },
    get jogando() { return jogando; },
    get bloqueador() { return chamar('isAdBlocked') === true; },
    /** @type {(() => void)|null} */
    onAdStart: null,
    /** @type {(() => void)|null} */
    onAdEnd: null,
    /** @type {((mudo: boolean) => void)|null} */
    onMudoPlataforma: null,
    /** @type {((pausa: boolean) => void)|null} */
    onPausaPlataforma: null,
    idioma: lerIdioma(),
    /** o portal limita a frequencia: o jogo pede o intervalo em todo ponto natural */
    limitarIntervalos: false,
    /** o main.js so comeca o laco depois do init() (o handshake nao disputa a thread com o desenho) */
    lacoAposInit: true,
  };
  return /** @type {any} */ (california);
}

/** Instancia do jogo: usa globalThis.PlataformaSDK. */
export const portal = criarCalifornia();
