'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTemaEscuro } from '@/lib/hooks';
import { IconeLua, IconeSair, IconeSol } from './icones';

export function CabecalhoApp() {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-borda p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {/*
          A marca e preta sobre fundo branco, entao vai numa pastilha clara em vez
          de solta na sidebar: no tema escuro ela sumiria, e no claro encostaria
          no fundo sem limite definido. A pastilha resolve os dois e mantem o
          arquivo original intocado.
        */}
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-borda">
          <Image
            src="/logo-nexos.jpg"
            alt=""
            width={36}
            height={36}
            priority
            className="size-8 object-contain"
          />
        </span>
        <div className="min-w-0">
          <h1 translate="no" className="truncate text-sm font-semibold text-texto">
            Search Leads
          </h1>
          <p className="truncate text-[0.6875rem] text-texto-fraco">
            Quem nao tem site ainda nao te conhece
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <BotaoTema />
        <BotaoSair />
      </div>
    </header>
  );
}

function BotaoSair() {
  const [saindo, setSaindo] = useState(false);

  const sair = async () => {
    setSaindo(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      /*
       * Recarregamento completo, e nao navegacao do router.
       *
       * O lint prefere router.push por causa da experiencia de aplicacao unica,
       * e para navegacao comum ele esta certo. Aqui a excecao e deliberada: sair
       * precisa garantir que nada sobreviva, nem o estado React com a carteira
       * de leads em memoria, nem o cache de payload do roteador, que poderia
       * devolver uma tela autenticada ao apertar voltar.
       */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/entrar';
    }
  };

  return (
    <button
      type="button"
      onClick={() => void sair()}
      disabled={saindo}
      title="Sair da plataforma"
      aria-label="Sair da plataforma"
      className="grid size-8 shrink-0 place-items-center rounded-lg border border-borda text-texto-suave transition-colors hover:bg-superficie-3 disabled:opacity-60"
    >
      <IconeSair className="size-4" />
    </button>
  );
}

function BotaoTema() {
  const escuro = useTemaEscuro();

  const alternar = () => {
    const proximo = !escuro;
    document.documentElement.classList.toggle('dark', proximo);
    try {
      localStorage.setItem('tema', proximo ? 'escuro' : 'claro');
    } catch {
      // Navegacao privada pode bloquear o localStorage. O tema so nao persiste.
    }
  };

  return (
    <button
      type="button"
      onClick={alternar}
      title={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      aria-label={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      className="grid size-8 shrink-0 place-items-center rounded-lg border border-borda text-texto-suave transition-colors hover:bg-superficie-3"
    >
      {escuro ? <IconeSol className="size-4" /> : <IconeLua className="size-4" />}
    </button>
  );
}
