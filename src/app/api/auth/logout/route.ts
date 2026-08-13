import { montarCookie } from '../login/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Encerra a sessao apagando o cookie.
 *
 * Como a sessao e um token assinado sem estado no servidor, nao ha o que
 * invalidar do lado de ca: apagar o cookie e o que existe. A consequencia
 * honesta e que um token roubado continua valido ate expirar. Para um sistema de
 * um usuario so, trocar a senha e regerar SESSAO_SEGREDO derruba todas as
 * sessoes de uma vez, que e a saida se isso acontecer.
 */
export async function POST() {
  const resposta = Response.json({ ok: true });
  resposta.headers.append('Set-Cookie', montarCookie('', 0));
  return resposta;
}
