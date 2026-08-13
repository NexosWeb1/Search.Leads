/**
 * Verificacao da senha de acesso.
 *
 * A senha nunca fica em texto puro no ambiente: o que vai para a variavel e o
 * hash scrypt dela, gerado por `npm run senha`. Se alguem ler o painel de
 * variaveis do Netlify, leva o hash e nao a senha, e portanto nao pode reusar a
 * mesma senha em outro lugar seu.
 *
 * scrypt e proposital em vez de SHA direto. Ele foi desenhado para ser lento e
 * consumir memoria, o que faz cada tentativa custar cerca de 100 ms. Num sistema
 * de senha unica essa lentidao e a principal defesa contra forca bruta: derruba o
 * ataque de milhoes de tentativas por segundo para algumas dezenas.
 *
 * Roda apenas em runtime Node (rota de login), nunca no middleware, que e Edge e
 * nao tem `node:crypto`.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const TAMANHO_SAL = 16;
const TAMANHO_CHAVE = 64;

/**
 * Separador do formato do hash.
 *
 * Dois-pontos e nao cifrao, que seria a convencao habitual do scrypt e do
 * bcrypt. O motivo e concreto: o hash vive numa variavel de ambiente, e tanto o
 * carregador de .env do Next quanto o painel de variaveis de varios provedores
 * expandem `$algo` como referencia a outra variavel. Com cifrao o hash chega
 * truncado no servidor e a senha certa passa a ser recusada, com uma mensagem
 * que nao ajuda em nada a descobrir o porque.
 */
const SEPARADOR = ':';

/** Gera o hash a guardar em SENHA_ACESSO_HASH. Formato: scrypt:sal:chave */
export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(TAMANHO_SAL);
  const chave = (await scryptAsync(senha.normalize('NFKC'), sal, TAMANHO_CHAVE)) as Buffer;
  return ['scrypt', sal.toString('hex'), chave.toString('hex')].join(SEPARADOR);
}

/**
 * Compara a senha informada com o hash guardado.
 *
 * A comparacao usa timingSafeEqual: comparar com `===` vazaria informacao pelo
 * tempo de resposta, porque a comparacao de strings para no primeiro byte
 * diferente e um atacante poderia descobrir o hash byte a byte.
 */
export async function conferirSenha(senha: string, hashGuardado: string): Promise<boolean> {
  const partes = hashGuardado.trim().split(SEPARADOR);
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

  const [, salHex, chaveHex] = partes;

  let sal: Buffer;
  let esperada: Buffer;
  try {
    sal = Buffer.from(salHex, 'hex');
    esperada = Buffer.from(chaveHex, 'hex');
  } catch {
    return false;
  }

  if (sal.length !== TAMANHO_SAL || esperada.length !== TAMANHO_CHAVE) return false;

  const calculada = (await scryptAsync(
    senha.normalize('NFKC'),
    sal,
    TAMANHO_CHAVE,
  )) as Buffer;

  return timingSafeEqual(calculada, esperada);
}

export interface ForcaSenha {
  aceitavel: boolean;
  problemas: string[];
}

/**
 * Exigencia minima da senha.
 *
 * Como so existe uma senha e ela protege sua carteira de leads inteira, o piso e
 * mais alto do que o de um cadastro comum. Comprimento pesa mais que simbolo:
 * uma frase longa e mais forte e mais facil de lembrar do que oito caracteres
 * com asterisco no meio.
 */
export function avaliarForca(senha: string): ForcaSenha {
  const problemas: string[] = [];

  if (senha.length < 12) problemas.push('precisa de pelo menos 12 caracteres');
  if (!/[a-zA-Z]/.test(senha)) problemas.push('precisa de pelo menos uma letra');
  if (!/[0-9]/.test(senha) && senha.length < 16) {
    problemas.push('precisa de um numero, ou entao de 16 caracteres ou mais');
  }

  const fracas = ['senha', 'password', '123456', 'admin', 'qwerty', 'searchleads'];
  if (fracas.some((f) => senha.toLowerCase().includes(f))) {
    problemas.push('contem uma palavra obvia demais');
  }

  return { aceitavel: problemas.length === 0, problemas };
}
