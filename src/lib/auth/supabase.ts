/**
 * Clientes do Supabase Auth.
 *
 * Sao dois, e a diferenca importa:
 *
 * - `clienteNavegador` roda no browser, na tela de login.
 * - `clienteProxy` roda no proxy (runtime Edge), onde os cookies precisam ser
 *   escritos na resposta que segue adiante.
 *
 * Este arquivo nao pode importar `next/headers`, nem indiretamente. Ele e
 * carregado por um componente de cliente, e `next/headers` so existe no
 * servidor: bastaria a importacao para o build inteiro quebrar, mesmo que a
 * funcao que a usa nunca fosse chamada no navegador. Se um dia um Server
 * Component precisar do usuario, o cliente dele mora em arquivo separado.
 *
 * A chave anonima e publica de proposito: quem protege os dados e a sessao, nao
 * o segredo da chave. A chave de servico (service_role) ignora qualquer politica
 * e nunca deve chegar ao navegador, por isso nao aparece aqui.
 */

import { createBrowserClient, createServerClient } from '@supabase/ssr';
// Somente tipo: e apagado na compilacao e nao arrasta runtime nenhum.
import type { NextRequest, NextResponse } from 'next/server';

export interface ConfigSupabase {
  url: string | undefined;
  chaveAnonima: string | undefined;
  configurado: boolean;
}

export function lerConfigSupabase(): ConfigSupabase {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
  const chaveAnonima = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined;
  return { url, chaveAnonima, configurado: Boolean(url && chaveAnonima) };
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

export function clienteNavegador() {
  const { url, chaveAnonima } = lerConfigSupabase();
  if (!url || !chaveAnonima) {
    throw new Error(
      'Supabase nao configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return createBrowserClient(url, chaveAnonima);
}

/**
 * Para o proxy. Recebe a requisicao e a resposta porque o refresh do token
 * precisa gravar o cookie novo na resposta que continua o fluxo.
 */
export function clienteProxy(requisicao: NextRequest, resposta: NextResponse) {
  const { url, chaveAnonima } = lerConfigSupabase();
  if (!url || !chaveAnonima) return null;

  return createServerClient(url, chaveAnonima, {
    cookies: {
      getAll: () => requisicao.cookies.getAll(),
      setAll: (novos) => {
        for (const { name, value, options } of novos) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });
}
