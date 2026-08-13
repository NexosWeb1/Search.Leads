/**
 * Tranca da aplicacao.
 *
 * O proxy protege pagina E rota de API. Proteger so a tela seria teatro: as
 * rotas de API sao acessiveis diretamente, e por elas da para listar toda a
 * carteira de leads, gastar sua cota do Google e registrar contatos. Quem quiser
 * abusar nao passa pela tela de login, chama /api/leads direto.
 *
 * Roda em runtime Edge, entao usa Web Crypto. A conferencia de senha, que precisa
 * de scrypt do Node, fica na rota de login.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, exigirAutenticacao, lerConfigAuth, sessaoValida } from '@/lib/auth/sessao';

/** Caminhos que existem justamente para quem ainda nao entrou. */
const PUBLICOS = ['/entrar', '/api/auth/login', '/api/auth/logout'];

export async function proxy(requisicao: NextRequest) {
  const { pathname } = requisicao.nextUrl;

  if (PUBLICOS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const { segredo, configurado } = lerConfigAuth();

  if (!configurado) {
    /*
     * Sem senha configurada: em desenvolvimento libera, em producao bloqueia.
     * Bloquear em producao e o que impede publicar a ferramenta destrancada por
     * ter esquecido de definir uma variavel de ambiente.
     */
    if (!exigirAutenticacao()) return NextResponse.next();

    return respostaNegada(
      requisicao,
      'Autenticacao nao configurada no servidor. Defina SENHA_ACESSO_HASH e SESSAO_SEGREDO.',
    );
  }

  const token = requisicao.cookies.get(COOKIE_SESSAO)?.value;
  if (await sessaoValida(token, segredo!)) return NextResponse.next();

  return respostaNegada(requisicao, 'Sessao expirada ou ausente.');
}

/**
 * API responde 401 em JSON; navegacao vai para a tela de login.
 *
 * Redirecionar uma chamada de API para HTML faria o cliente tentar interpretar
 * uma pagina como JSON e o erro na tela seria incompreensivel.
 */
function respostaNegada(requisicao: NextRequest, motivo: string) {
  if (requisicao.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: motivo }, { status: 401 });
  }

  const destino = requisicao.nextUrl.clone();
  destino.pathname = '/entrar';
  destino.search = '';
  // Guarda para onde a pessoa queria ir, para voltar ao lugar certo apos entrar.
  const alvo = requisicao.nextUrl.pathname + requisicao.nextUrl.search;
  if (alvo && alvo !== '/') destino.searchParams.set('destino', alvo);

  return NextResponse.redirect(destino);
}

export const config = {
  /*
   * Tudo, menos os assets que o proprio Next serve e a logo.
   *
   * O favicon e a logo ficam de fora porque a tela de login precisa deles antes
   * de haver sessao, e porque nao revelam nada.
   */
  matcher: ['/((?!_next/static|_next/image|icon.svg|logo-nexos.jpg|favicon.ico).*)'],
};
