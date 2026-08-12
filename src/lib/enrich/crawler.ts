/**
 * Enriquecimento de contato.
 *
 * O que o Google entrega e nome, endereco e um telefone. O que fecha negocio
 * costuma ser o Instagram (onde o dono responde) e o e-mail (onde a proposta
 * cabe). Este modulo busca esses dois.
 *
 * Escopo honesto do que da para fazer:
 *
 * - Lead que tem alguma URL: baixamos a pagina e extraimos e-mail, Instagram e
 *   WhatsApp dos links e do texto. Funciona bem.
 * - Lead cuja URL ja e o Instagram: o handle sai da propria URL, sem baixar
 *   nada. O Instagram bloqueia leitura automatizada, e insistir daria erro.
 * - Lead sem URL nenhuma: nao ha de onde extrair. Fica marcado como `sem_fonte`
 *   em vez de ficar eternamente pendente, para voce saber que ali nao ha o que
 *   buscar.
 *
 * Boa vizinhanca nao e opcional: respeitamos robots.txt, identificamos o
 * agente, limitamos o tempo de espera e o tamanho da resposta, e nunca baixamos
 * mais de uma pagina por dominio.
 */

import { normalizarTelefone } from '../phone/br';

const AGENTE = 'SearchLeadsBot/1.0 (prospeccao B2B; contato pelo site que gerou a busca)';
const TIMEOUT_MS = 8_000;
/** Uma pagina inicial passa longe disso; o teto evita baixar um PDF de 40 MB. */
const TAMANHO_MAX_BYTES = 1_500_000;

export interface ContatosEncontrados {
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
  status: 'ok' | 'falhou' | 'sem_fonte';
  erro: string | null;
}

const VAZIO: ContatosEncontrados = {
  email: null,
  instagram: null,
  facebook: null,
  whatsapp: null,
  status: 'sem_fonte',
  erro: null,
};

/**
 * Endereco que parece e-mail mas nao serve para prospectar: arquivo, dominio de
 * exemplo, ou e-mail de infraestrutura de plataforma de site.
 */
const EMAIL_DESCARTAVEL = [
  'example.com', 'example.org', 'dominio.com', 'seudominio', 'email.com',
  'sentry.io', 'wixpress.com', 'wix.com', 'sentry-next.wixpress.com',
  'godaddy.com', 'squarespace.com', 'shopify.com', 'cloudflare.com',
  'jquery.com', 'w3.org', 'schema.org', 'googleapis.com', 'gstatic.com',
];

const EXTENSOES_DE_ARQUIVO = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?|ttf|ico|pdf)$/i;

function emailUtil(bruto: string): string | null {
  const email = bruto.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0];
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return null;
  if (EXTENSOES_DE_ARQUIVO.test(email)) return null;
  const dominio = email.split('@')[1];
  if (EMAIL_DESCARTAVEL.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return null;
  // Hash longo no lugar do usuario e quase sempre e-mail gerado por ferramenta.
  if (/^[0-9a-f]{16,}@/.test(email)) return null;
  return email;
}

/** Handle do Instagram a partir de qualquer formato de link. */
export function handleInstagram(url: string): string | null {
  const casamento = url.match(
    /instagram\.com\/(?!p\/|reel\/|reels\/|explore\/|stories\/|accounts\/)([A-Za-z0-9._]{1,30})/i,
  );
  if (!casamento) return null;
  const handle = casamento[1].replace(/\.$/, '');
  return handle ? `@${handle}` : null;
}

function paginaFacebook(url: string): string | null {
  const casamento = url.match(
    /facebook\.com\/(?!sharer|plugins|tr\?|dialog)([A-Za-z0-9.\-]{2,60})/i,
  );
  return casamento ? casamento[1] : null;
}

function whatsappDeUrl(url: string): string | null {
  const wame = url.match(/wa\.me\/(\d{10,15})/);
  if (wame) return normalizarTelefone(wame[1]).e164;

  const api = url.match(/(?:api|web)\.whatsapp\.com\/(?:send|send\/)?\?[^"']*phone=(\d{10,15})/);
  if (api) return normalizarTelefone(api[1]).e164;

  return null;
}

/**
 * Verifica robots.txt. Em caso de duvida devolve true: um robots inacessivel nao
 * e proibicao, e um site sem robots permite tudo por padrao.
 */
async function permitido(origem: string, sinal: AbortSignal): Promise<boolean> {
  try {
    const resposta = await fetch(`${origem}/robots.txt`, {
      headers: { 'User-Agent': AGENTE },
      signal: sinal,
    });
    if (!resposta.ok) return true;

    const texto = (await resposta.text()).slice(0, 20_000);
    const linhas = texto.split('\n').map((l) => l.trim().toLowerCase());

    let noGrupoGeral = false;
    for (const linha of linhas) {
      if (linha.startsWith('user-agent:')) {
        const agente = linha.slice('user-agent:'.length).trim();
        noGrupoGeral = agente === '*' || agente.includes('searchleads');
        continue;
      }
      if (!noGrupoGeral) continue;
      if (linha.startsWith('disallow:')) {
        const caminho = linha.slice('disallow:'.length).trim();
        // Disallow: / fecha o site inteiro. Regra mais especifica nao nos afeta,
        // porque so lemos a raiz.
        if (caminho === '/') return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Tenta resolver a URL sem tocar na rede.
 *
 * Vale para perfil de rede social e link de WhatsApp, onde o dado esta na
 * propria URL. Baixar essas paginas seria bloqueado de qualquer forma.
 *
 * Devolve `null` quando so ha como saber baixando a pagina. Quem chama usa isso
 * para decidir se precisa gastar uma requisicao de rede, e portanto se precisa
 * respeitar o limite de um acesso por dominio.
 */
export function extrairDaUrl(websiteUri: string | null): ContatosEncontrados | null {
  if (!websiteUri?.trim()) return { ...VAZIO };

  let alvo: URL;
  try {
    alvo = new URL(/^https?:\/\//i.test(websiteUri) ? websiteUri : `https://${websiteUri}`);
  } catch {
    return { ...VAZIO, status: 'falhou', erro: 'URL invalida' };
  }

  const instaDireto = handleInstagram(alvo.href);
  if (instaDireto) return { ...VAZIO, instagram: instaDireto, status: 'ok' };

  const faceDireto = alvo.hostname.includes('facebook.com')
    ? paginaFacebook(alvo.href)
    : null;
  if (faceDireto) return { ...VAZIO, facebook: faceDireto, status: 'ok' };

  const zapDireto = whatsappDeUrl(alvo.href);
  if (zapDireto) return { ...VAZIO, whatsapp: zapDireto, status: 'ok' };

  return null;
}

/** True quando so da para descobrir baixando a pagina. */
export function precisaDeRede(websiteUri: string | null): boolean {
  return extrairDaUrl(websiteUri) === null;
}

export async function buscarContatos(
  websiteUri: string | null,
): Promise<ContatosEncontrados> {
  const semRede = extrairDaUrl(websiteUri);
  if (semRede) return semRede;

  // extrairDaUrl ja garantiu que a URL e valida e precisa de rede.
  const alvo = new URL(
    /^https?:\/\//i.test(websiteUri!) ? websiteUri! : `https://${websiteUri}`,
  );

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    if (!(await permitido(alvo.origin, controle.signal))) {
      return { ...VAZIO, status: 'falhou', erro: 'Bloqueado pelo robots.txt' };
    }

    const resposta = await fetch(alvo.href, {
      headers: {
        'User-Agent': AGENTE,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controle.signal,
      redirect: 'follow',
    });

    if (!resposta.ok) {
      return { ...VAZIO, status: 'falhou', erro: `HTTP ${resposta.status}` };
    }

    const tipo = resposta.headers.get('content-type') ?? '';
    if (!tipo.includes('html') && !tipo.includes('text')) {
      return { ...VAZIO, status: 'falhou', erro: `Tipo nao suportado: ${tipo}` };
    }

    const html = (await resposta.text()).slice(0, TAMANHO_MAX_BYTES);
    return extrairDoHtml(html);
  } catch (erro) {
    const mensagem =
      erro instanceof Error && erro.name === 'AbortError'
        ? 'Tempo esgotado'
        : erro instanceof Error
          ? erro.message
          : 'Falha ao acessar';
    return { ...VAZIO, status: 'falhou', erro: mensagem };
  } finally {
    clearTimeout(relogio);
  }
}

/** Separado para poder ser testado sem rede. */
export function extrairDoHtml(html: string): ContatosEncontrados {
  const resultado: ContatosEncontrados = { ...VAZIO, status: 'ok' };

  // mailto vem primeiro: e um e-mail que alguem colocou de proposito, e nao um
  // endereco que apareceu solto no meio do texto.
  for (const casamento of html.matchAll(/mailto:([^"'\s>?]+)/gi)) {
    const email = emailUtil(casamento[1]);
    if (email) {
      resultado.email = email;
      break;
    }
  }

  if (!resultado.email) {
    for (const casamento of html.matchAll(
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    )) {
      const email = emailUtil(casamento[0]);
      if (email) {
        resultado.email = email;
        break;
      }
    }
  }

  for (const casamento of html.matchAll(/instagram\.com\/[A-Za-z0-9._/]+/gi)) {
    const handle = handleInstagram(casamento[0]);
    if (handle) {
      resultado.instagram = handle;
      break;
    }
  }

  for (const casamento of html.matchAll(/facebook\.com\/[A-Za-z0-9.\-/?=&]+/gi)) {
    const pagina = paginaFacebook(casamento[0]);
    if (pagina) {
      resultado.facebook = pagina;
      break;
    }
  }

  for (const casamento of html.matchAll(
    /(?:wa\.me\/\d{10,15}|(?:api|web)\.whatsapp\.com\/[^"'\s]*phone=\d{10,15})/gi,
  )) {
    const zap = whatsappDeUrl(casamento[0]);
    if (zap) {
      resultado.whatsapp = zap;
      break;
    }
  }

  const achouAlgo =
    resultado.email || resultado.instagram || resultado.facebook || resultado.whatsapp;
  if (!achouAlgo) {
    resultado.status = 'ok';
    resultado.erro = 'Pagina lida, nenhum contato encontrado';
  }

  return resultado;
}
