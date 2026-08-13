'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { IconeAlerta, IconeBloqueado, IconeCarregando } from '@/components/icones';

export function FormularioEntrada() {
  const router = useRouter();
  const parametros = useSearchParams();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /**
   * O destino vem da querystring, colocada pelo middleware quando ele barra uma
   * navegacao. So aceitamos caminho interno: um valor comecando com `//` ou com
   * esquema viraria redirecionamento aberto para site de terceiro, que e como se
   * monta phishing em cima de tela de login legitima.
   */
  const bruto = parametros.get('destino') ?? '/';
  const destino = bruto.startsWith('/') && !bruto.startsWith('//') ? bruto : '/';

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        setErro([dados.erro, dados.detalhe].filter(Boolean).join(' ') || 'Nao foi possivel entrar');
        setSenha('');
        return;
      }

      // replace e nao push: a tela de login nao deve ficar no historico do
      // navegador, senao o botao voltar traz de volta para ela ja autenticado.
      router.replace(destino);
      router.refresh();
    } catch {
      setErro('Falha de conexao com o servidor.');
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
        onSubmit={enviar}
        className="rounded-xl border border-borda bg-superficie p-4 shadow-[var(--sombra-cartao)]"
      >
        <label htmlFor="senha" className="mb-1.5 block text-xs font-medium text-texto-suave">
          Senha de acesso
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          autoFocus
          autoComplete="current-password"
          spellCheck={false}
          placeholder="Digite a senha…"
          className="w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2.5 text-sm text-texto placeholder:text-texto-fraco"
        />

        {erro && (
          <p
            role="alert"
            className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-800 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-900"
          >
            <IconeAlerta className="mt-0.5 size-3.5 shrink-0" />
            <span>{erro}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || senha.length === 0}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-marca-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-marca-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
        >
          {enviando ? (
            <>
              <IconeCarregando className="size-4" />
              Entrando…
            </>
          ) : (
            <>
              <IconeBloqueado className="size-4" />
              Entrar
            </>
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-[0.6875rem] leading-relaxed text-texto-fraco">
        Esqueceu a senha? Gere uma nova com <code className="font-mono">npm run senha</code> e
        troque a variavel SENHA_ACESSO_HASH no servidor.
      </p>
    </div>
  );
}
