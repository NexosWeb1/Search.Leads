'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { clienteNavegador } from '@/lib/auth/supabase';
import { IconeAlerta, IconeBloqueado, IconeCarregando, IconeCheck } from '@/components/icones';

type Modo = 'senha' | 'recuperar';

export function FormularioEntrada() {
  const router = useRouter();
  const parametros = useSearchParams();

  const [modo, setModo] = useState<Modo>('senha');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /**
   * O destino vem da querystring, colocada pelo proxy quando ele barra uma
   * navegacao. So aceitamos caminho interno: um valor comecando com `//` ou com
   * esquema viraria redirecionamento aberto para site de terceiro, que e como se
   * monta phishing em cima de tela de login legitima.
   */
  const bruto = parametros.get('destino') ?? '/';
  const destino = bruto.startsWith('/') && !bruto.startsWith('//') ? bruto : '/';

  const entrar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setErro(null);
    setAviso(null);

    try {
      const supabase = clienteNavegador();

      if (modo === 'recuperar') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/entrar`,
        });
        if (error) throw error;
        setAviso('Se este e-mail tiver conta, o link de redefinicao chega em instantes.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) throw error;

      // replace e nao push: a tela de login nao deve ficar no historico, senao o
      // botao voltar traz de volta para ela ja autenticado.
      router.replace(destino);
      router.refresh();
    } catch (e) {
      setErro(traduzir(e));
      setSenha('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-borda">
          <Image
            src="/logo-nexos.jpg"
            alt=""
            width={56}
            height={56}
            priority
            className="size-12 object-contain"
          />
        </span>
        <h1 translate="no" className="mt-3 text-lg font-semibold text-texto">
          Search Leads
        </h1>
        <p className="mt-1 text-xs text-texto-fraco">
          Esta ferramenta guarda sua carteira de leads e o historico de contato.
        </p>
      </div>

      <form
        onSubmit={entrar}
        className="rounded-xl border border-borda bg-superficie p-4 shadow-[var(--sombra-cartao)]"
      >
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-texto-suave">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          spellCheck={false}
          placeholder="voce@empresa.com.br"
          className="w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2.5 text-sm text-texto placeholder:text-texto-fraco"
        />

        {modo === 'senha' && (
          <>
            <label
              htmlFor="senha"
              className="mb-1.5 mt-3 block text-xs font-medium text-texto-suave"
            >
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Digite a senha…"
              className="w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2.5 text-sm text-texto placeholder:text-texto-fraco"
            />
          </>
        )}

        {erro && (
          <p
            role="alert"
            className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-800 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-900"
          >
            <IconeAlerta className="mt-0.5 size-3.5 shrink-0" />
            <span>{erro}</span>
          </p>
        )}

        {aviso && (
          <p
            role="status"
            className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-marca-50 p-2 text-xs text-marca-800 ring-1 ring-marca-200 dark:bg-marca-800/30 dark:text-marca-200 dark:ring-marca-800"
          >
            <IconeCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>{aviso}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || !email || (modo === 'senha' && !senha)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-marca-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-marca-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
        >
          {enviando ? (
            <>
              <IconeCarregando className="size-4" />
              {modo === 'senha' ? 'Entrando…' : 'Enviando…'}
            </>
          ) : modo === 'senha' ? (
            <>
              <IconeBloqueado className="size-4" />
              Entrar
            </>
          ) : (
            'Enviar link de redefinicao'
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setModo(modo === 'senha' ? 'recuperar' : 'senha');
            setErro(null);
            setAviso(null);
          }}
          className="mt-3 w-full text-center text-[0.6875rem] font-medium text-marca-700 underline-offset-2 hover:underline dark:text-marca-400"
        >
          {modo === 'senha' ? 'Esqueci a senha' : 'Voltar para o login'}
        </button>
      </form>

      <p className="mt-4 text-center text-[0.6875rem] leading-relaxed text-texto-fraco">
        Contas sao criadas no painel do Supabase, em Authentication, Users.
      </p>
    </div>
  );
}

/**
 * O Supabase devolve mensagem em ingles e generica de proposito, para nao
 * revelar se o e-mail existe. Mantemos essa discricao, mas em portugues e
 * dizendo o proximo passo.
 */
function traduzir(erro: unknown): string {
  const bruto = erro instanceof Error ? erro.message : String(erro);

  if (/invalid login credentials/i.test(bruto)) {
    return 'E-mail ou senha incorretos.';
  }
  if (/email not confirmed/i.test(bruto)) {
    return 'Esta conta ainda nao foi confirmada. Procure o e-mail de confirmacao do Supabase.';
  }
  if (/rate limit|too many/i.test(bruto)) {
    return 'Tentativas demais. Espere alguns minutos antes de tentar de novo.';
  }
  if (/nao configurado/i.test(bruto)) {
    return bruto;
  }
  if (/fetch|network/i.test(bruto)) {
    return 'Falha de conexao com o Supabase. Confira a URL do projeto.';
  }
  return bruto;
}
