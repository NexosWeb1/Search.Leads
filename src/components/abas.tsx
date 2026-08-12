'use client';

import { IconeKanban, IconeMapa, IconePainel } from './icones';

export type Aba = 'mapa' | 'kanban' | 'painel';

const ABAS: Array<{ id: Aba; rotulo: string; Icone: typeof IconeMapa }> = [
  { id: 'mapa', rotulo: 'Mapa', Icone: IconeMapa },
  { id: 'kanban', rotulo: 'Kanban', Icone: IconeKanban },
  { id: 'painel', rotulo: 'Painel', Icone: IconePainel },
];

export function Abas({ atual, aoTrocar }: { atual: Aba; aoTrocar: (aba: Aba) => void }) {
  return (
    <div className="border-b border-borda p-3" role="tablist" aria-label="Visualizacao">
      <div className="flex gap-1 rounded-lg bg-superficie-3 p-1">
        {ABAS.map(({ id, rotulo, Icone }) => {
          const ativa = atual === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => aoTrocar(id)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                ativa
                  ? 'bg-superficie text-texto shadow-[var(--sombra-cartao)]'
                  : 'text-texto-suave hover:text-texto'
              }`}
            >
              <Icone className="size-3.5" />
              {rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
