/**
 * Tranca da aplicacao.
 *
 * O proxy protege pagina E rota de API. Proteger so a tela seria teatro: as
 * rotas de API sao acessiveis diretamente, e por elas da para listar toda a
 * carteira de leads, gastar sua cota do Google e registrar contatos. Quem quiser
 * abusar nao passa pela tela de login, chama /api/leads direto.
 *
 * Aqui tambem acontece a renovacao do token do Supabase. Por isso a resposta e
 * criada antes da verificacao e devolvida no fim: se o cliente gravar um cookie
 * novo durante o getUser, ele precisa viajar de volta ao navegador.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  autenticacaoDesligada,
  clienteProxy,
  exigirAutenticacao,
  lerConfigSupabase,
} from '@/lib/auth/supabase';

/** Caminhos que existem justamente para quem ainda nao entrou. */
const PUBLICOS = ['/entrar', '/api/auth'];

export async function proxy(requisicao: NextRequest) {
  const { pathname } = requisicao.nextUrl;

  if (PUBLICOS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Precisa existir antes da checagem para receber o cookie renovado.
  const resposta = NextResponse.next({ request: requisicao });

  if (autenticacaoDesligada()) {
    /*
     * Aviso a cada pedido de pagina, de proposito. Uma tranca desligada em
     * silencio e como nao ter tranca: o aviso repetido no terminal existe para
     * voce nao esquecer que ela esta assim.
     */
    if (!pathname.startsWith('/api/')) {
      console.warn(
        '[Search Leads] AUTH_DESLIGADA=true: a plataforma esta SEM TRANCA. ' +
          'Remova essa variavel do .env.local ao terminar de configurar o banco.',
      );
    }
    return resposta;
  }

  if (!lerConfigSupabase().configurado) {
    if (!exigirAutenticacao()) return resposta;
    return negar(
      requisicao,
      'Supabase nao configurado no servidor. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const supabase = clienteProxy(requisicao, resposta);
  if (!supabase) return negar(requisicao, 'Supabase nao configurado.');

  /*
   * getUser e nao getSession: getSession apenas le o cookie e confia no que
   * esta escrito nele, enquanto getUser valida o token contra o servidor do
   * Supabase. Para decidir acesso, so a validacao serve.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return resposta;

  return negar(requisicao, 'Sessao expirada ou ausente.');
}

/**
 * API responde 401 em JSON; navegacao vai para a tela de login.
 *
 * Redirecionar uma chamada de API para HTML faria o cliente tentar interpretar
 * uma pagina como JSON e o erro na tela seria incompreensivel.
 */
function negar(requisicao: NextRequest, motivo: string) {
  if (requisicao.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: motivo }, { status: 401 });
  }

  const destino = requisicao.nextUrl.clone();
  destino.pathname = '/entrar';
  destino.search = '';

  const alvo = requisicao.nextUrl.pathname + requisicao.nextUrl.search;
  if (alvo && alvo !== '/') destino.searchParams.set('destino', alvo);

  return NextResponse.redirect(destino);
}

export const config = {
  /*
   * Tudo, menos os assets que o proprio Next serve e a logo.
   *
   * O icone e a logo ficam de fora porque a tela de login precisa deles antes de
   * haver sessao, e porque nao revelam nada.
   */
  matcher: ['/((?!_next/static|_next/image|icon.svg|logo-nexos.jpg|favicon.ico).*)'],
};
