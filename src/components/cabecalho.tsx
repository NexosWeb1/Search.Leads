'use client';

import Image from 'next/image';
import { useTemaEscuro } from '@/lib/hooks';
import { IconeLua, IconeSol } from './icones';

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
      <BotaoTema />
    </header>
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
