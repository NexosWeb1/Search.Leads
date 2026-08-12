'use client';

import { useSyncExternalStore } from 'react';
import { IconeAlvo, IconeLua, IconeSol } from './icones';

export function CabecalhoApp() {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-borda p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-marca-600 text-white">
          <IconeAlvo className="size-4.5" />
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

/**
 * O tema mora na classe do elemento html, aplicada por um script no layout antes
 * da primeira pintura. Isso o torna estado de um sistema externo, e nao estado do
 * React, entao a leitura certa e useSyncExternalStore: ele resolve a hidratacao
 * (o servidor usa o snapshot dele) sem precisar de efeito nem de setState.
 */
function inscrever(aoMudar: () => void): () => void {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observador.disconnect();
}

const lerCliente = () => document.documentElement.classList.contains('dark');
// No servidor nao existe classe para ler. O script do layout corrige antes de
// qualquer pintura, entao nao ha piscada.
const lerServidor = () => false;

function BotaoTema() {
  const escuro = useSyncExternalStore(inscrever, lerCliente, lerServidor);

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
