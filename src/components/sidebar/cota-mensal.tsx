'use client';

import type { ConsumoDoMes } from '@/lib/db/searches';
import { formatarMoeda, formatarNumero } from '@/lib/formato';
import { IconeAlerta } from '@/components/icones';

/**
 * Consumo da cota gratuita do Google no mes.
 *
 * Existe para voce nao precisar abrir o console do Google Cloud para saber se
 * ainda pode rodar uma busca sem pagar. O numero sai das proprias varreduras
 * registradas, e nao de uma estimativa.
 *
 * Os avisos aparecem em duas etapas de proposito: um alerta em 80% ainda da
 * tempo de decidir se vale gastar o resto, e o de 100% avisa que a partir dali
 * cada requisicao sai do bolso.
 */
export function CotaMensal({ consumo }: { consumo: ConsumoDoMes | null }) {
  if (!consumo) return null;

  const proporcao = Math.min(1, consumo.requisicoes / consumo.cotaGratis);
  const estourou = consumo.requisicoes >= consumo.cotaGratis;
  const perto = !estourou && proporcao >= 0.8;

  return (
    <div className="border-b border-borda p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-texto-suave">Cota gratuita do mes</span>
        <span className="font-mono text-xs tabular-nums text-texto">
          {formatarNumero(consumo.requisicoes)}
          <span className="text-texto-fraco">/{formatarNumero(consumo.cotaGratis)}</span>
        </span>
      </div>

      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-superficie-3"
        role="img"
        aria-label={`${consumo.requisicoes} de ${consumo.cotaGratis} requisicoes gratuitas usadas`}
      >
        <div
          className={`h-full rounded-r-[4px] transition-[width] duration-300 ${
            estourou
              ? 'bg-dado-perda'
              : perto
                ? 'bg-dado-tecnica'
                : 'bg-marca-600 dark:bg-marca-500'
          }`}
          style={{ width: `${Math.max(2, proporcao * 100)}%` }}
        />
      </div>

      {estourou ? (
        <p
          role="status"
          className="mt-1.5 flex items-start gap-1.5 text-[0.6875rem] text-red-700 dark:text-red-400"
        >
          <IconeAlerta className="mt-0.5 size-3 shrink-0" />
          <span>
            Cota do mes esgotada. Cada nova busca e cobrada, e ja acumulou{' '}
            {formatarMoeda(consumo.custoAcimaDaCotaUsd, 'USD')}.
          </span>
        </p>
      ) : perto ? (
        <p
          role="status"
          className="mt-1.5 flex items-start gap-1.5 text-[0.6875rem] text-amber-700 dark:text-amber-400"
        >
          <IconeAlerta className="mt-0.5 size-3 shrink-0" />
          <span>
            Restam {formatarNumero(consumo.restantes)} requisicoes gratuitas. Depois
            disso cada mil custa USD 35,00.
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-[0.6875rem] text-texto-fraco">
          Restam {formatarNumero(consumo.restantes)} em {consumo.buscas}{' '}
          {consumo.buscas === 1 ? 'busca' : 'buscas'} feitas. A cota renova dia 1.
        </p>
      )}
    </div>
  );
}
