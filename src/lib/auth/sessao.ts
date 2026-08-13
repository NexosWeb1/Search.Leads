/**
 * Token de sessao assinado.
 *
 * Usa Web Crypto e nao `node:crypto` de proposito: o middleware do Next roda em
 * runtime Edge, onde os modulos do Node nao existem. Web Crypto esta nos dois
 * ambientes, entao o mesmo codigo verifica a sessao no middleware e na rota.
 *
 * O token nao guarda segredo nenhum, so a data de expiracao, e vem assinado com
 * HMAC. Ou seja: o cliente ve o conteudo mas nao consegue forjar nem esticar o
 * prazo sem a chave. Nao ha estado no servidor, o que importa em serverless,
 * onde nao existe memoria compartilhada entre invocacoes.
 */

export const COOKIE_SESSAO = 'sl_sessao';

/** 30 dias. Ferramenta de uso diario, expirar toda semana so irrita sem ganhar seguranca. */
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

interface Carga {
  /** Expiracao em milissegundos desde a epoca. */
  exp: number;
  /** Versao do formato, para poder invalidar tudo no futuro se precisar. */
  v: number;
}

const VERSAO = 1;

function paraBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto: string): Uint8Array<ArrayBuffer> | null {
  try {
    const preenchido = texto.replace(/-/g, '+').replace(/_/g, '/');
    const binario = atob(preenchido + '='.repeat((4 - (preenchido.length % 4)) % 4));
    // Buffer alocado explicitamente para o tipo sair como Uint8Array<ArrayBuffer>.
    // O Web Crypto so aceita isso, nao a variante respaldada por SharedArrayBuffer.
    const bytes = new Uint8Array(new ArrayBuffer(binario.length));
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Cria um token valido pelo periodo padrao. */
export async function criarSessao(segredo: string): Promise<string> {
  const carga: Carga = { exp: Date.now() + DURACAO_SESSAO_MS, v: VERSAO };
  const corpo = paraBase64Url(new TextEncoder().encode(JSON.stringify(carga)));

  const assinatura = await crypto.subtle.sign(
    'HMAC',
    await chaveHmac(segredo),
    new TextEncoder().encode(corpo),
  );

  return `${corpo}.${paraBase64Url(new Uint8Array(assinatura))}`;
}

/**
 * Confere assinatura e prazo.
 *
 * A verificacao da assinatura vem antes da leitura do conteudo: ler primeiro
 * significaria processar dados nao confiaveis.
 */
export async function sessaoValida(
  token: string | undefined,
  segredo: string,
): Promise<boolean> {
  if (!token || !segredo) return false;

  const ponto = token.indexOf('.');
  if (ponto <= 0) return false;

  const corpo = token.slice(0, ponto);
  const assinatura = deBase64Url(token.slice(ponto + 1));
  if (!assinatura) return false;

  const confere = await crypto.subtle.verify(
    'HMAC',
    await chaveHmac(segredo),
    assinatura,
    new TextEncoder().encode(corpo),
  );
  if (!confere) return false;

  const bytes = deBase64Url(corpo);
  if (!bytes) return false;

  try {
    const carga = JSON.parse(new TextDecoder().decode(bytes)) as Carga;
    return carga.v === VERSAO && typeof carga.exp === 'number' && carga.exp > Date.now();
  } catch {
    return false;
  }
}

export interface ConfigAuth {
  hashSenha: string | undefined;
  segredo: string | undefined;
  /** Falso quando falta configuracao. Em producao isso bloqueia tudo. */
  configurado: boolean;
}

export function lerConfigAuth(): ConfigAuth {
  const hashSenha = process.env.SENHA_ACESSO_HASH?.trim() || undefined;
  const segredo = process.env.SESSAO_SEGREDO?.trim() || undefined;
  return { hashSenha, segredo, configurado: Boolean(hashSenha && segredo) };
}

/**
 * Em producao, faltar configuracao bloqueia o acesso. Em desenvolvimento apenas
 * avisa.
 *
 * A assimetria e intencional: falhar aberto em producao seria publicar a
 * ferramenta sem tranca por esquecimento de uma variavel, que e exatamente o
 * acidente que este modulo existe para evitar. Em desenvolvimento, bloquear
 * atrapalharia sem proteger nada, porque a aplicacao so responde no seu proprio
 * computador.
 */
export function exigirAutenticacao(): boolean {
  return process.env.NODE_ENV === 'production';
}
