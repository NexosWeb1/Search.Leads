'use client';

import { useState } from 'react';
import type { Busca } from '@/lib/db/searches';
import { formatarDataHora, formatarMoeda, formatarNumero } from '@/lib/formato';
import { IconeHistorico, IconeSeta } from '@/components/icones';

export function BuscasAnteriores({
  buscas,
  atual,
  aoEscolher,
  aoLimpar,
}: {
  buscas: Busca[];
  atual: string | null;
  aoEscolher: (busca: Busca) => void;
  aoLimpar: () => void;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="border-b border-borda">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-superficie-3"
      >
        <IconeHistorico className="size-3.5 shrink-0 text-texto-fraco" />
        <span className="flex-1 text-xs font-medium text-texto">
          Buscas anteriores
          {buscas.length > 0 && (
            <span className="ml-1 font-normal text-texto-fraco">({buscas.length})</span>
          )}
        </span>
        <IconeSeta
          className={`size-3.5 shrink-0 text-texto-fraco transition-transform ${aberto ? 'rotate-90' : ''}`}
        />
      </button>

      {aberto && (
        <div className="px-3 pb-3">
          {buscas.length === 0 ? (
            <p className="text-[0.6875rem] text-texto-fraco">
              Nenhuma busca ainda. A primeira varredura aparece aqui.
            </p>
          ) : (
            <>
              {atual && (
                <button
                  type="button"
                  onClick={aoLimpar}
                  className="mb-1.5 text-[0.6875rem] font-medium text-marca-700 underline-offset-2 hover:underline dark:text-marca-400"
                >
                  Ver todos os leads, de todas as buscas
                </button>
              )}
              <ul className="rolagem-fina max-h-56 space-y-1 overflow-y-auto">
                {buscas.map((busca) => (
                  <li key={busca.id}>
                    <button
                      type="button"
                      onClick={() => aoEscolher(busca)}
                      className={`w-full rounded-lg border p-2 text-left transition-colors ${
                        atual === busca.id
                          ? 'border-marca-600 bg-marca-50 dark:bg-marca-800/25'
                          : 'border-borda hover:bg-superficie-3'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-texto">
                          {busca.nichoLabel}
                        </span>
                        <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-texto-fraco">
                          {busca.raioKm} km
                        </span>
                      </div>
                      <p className="truncate text-[0.6875rem] text-texto-fraco">
                        {busca.localLabel}
                      </p>
                      <p className="mt-0.5 text-[0.625rem] text-texto-fraco">
                        {busca.status === 'concluida' ? (
                          <>
                            {formatarNumero(busca.totalSemSite)} sem site de{' '}
                            {formatarNumero(busca.totalNoRaio)} &middot;{' '}
                            {formatarMoeda(busca.custoUsd, 'USD')}
                          </>
                        ) : busca.status === 'erro' ? (
                          <span className="text-red-600 dark:text-red-400">
                            Falhou: {busca.erro?.slice(0, 60)}
                          </span>
                        ) : (
                          busca.status
                        )}
                      </p>
                      <p className="text-[0.625rem] text-texto-fraco">
                        {formatarDataHora(busca.criadaEm)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
