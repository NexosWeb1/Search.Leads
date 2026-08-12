'use client';

import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { LeadCompleto } from '@/lib/db/leads';
import {
  COLUNAS_KANBAN,
  MOTIVOS_PERDA,
  ROTULO_MOTIVO_PERDA,
  ROTULO_STATUS,
  type MotivoPerda,
  type StatusCrm,
} from '@/lib/db/schema';
import { formatarNumero, tempoRelativo } from '@/lib/formato';
import { useFocoPreso } from '@/lib/hooks';
import { IconeAlerta, IconeKanban } from '@/components/icones';

/**
 * Quadro do funil.
 *
 * Mover um cartao para Perdido abre a escolha do motivo antes de gravar. Sem
 * isso, o painel de resultados fica sabendo que voce perdeu 40 negocios mas nao
 * por que, que e justamente a informacao que muda sua abordagem.
 */

const COR_COLUNA: Record<StatusCrm, string> = {
  novo: 'border-t-slate-400',
  contatado: 'border-t-sky-500',
  respondeu: 'border-t-marca-500',
  negociando: 'border-t-amber-500',
  fechado: 'border-t-marca-700',
  perdido: 'border-t-red-500',
  frio: 'border-t-slate-300',
  nao_perturbe: 'border-t-slate-300',
};

export function QuadroKanban({
  leads,
  aoAbrirDetalhes,
  aoAtualizar,
}: {
  leads: LeadCompleto[];
  aoAbrirDetalhes: (lead: LeadCompleto) => void;
  aoAtualizar: () => void;
}) {
  const [arrastando, setArrastando] = useState<LeadCompleto | null>(null);
  const [pedindoMotivo, setPedindoMotivo] = useState<LeadCompleto | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Um arrasto so comeca depois de 6 px, senao um clique no cartao para abrir o
  // detalhe seria interpretado como arrasto.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const porColuna = useMemo(() => {
    const mapa = new Map<StatusCrm, LeadCompleto[]>(
      COLUNAS_KANBAN.map((c) => [c, [] as LeadCompleto[]]),
    );
    for (const lead of leads) {
      // frio e nao_perturbe nao tem coluna: aparecem agrupados em Contatado para
      // nao criarem duas colunas quase sempre vazias.
      const coluna: StatusCrm =
        lead.status === 'frio' || lead.status === 'nao_perturbe'
          ? 'contatado'
          : lead.status;
      mapa.get(coluna)?.push(lead);
    }
    return mapa;
  }, [leads]);

  const mover = async (lead: LeadCompleto, status: StatusCrm, motivo?: MotivoPerda) => {
    setErro(null);
    try {
      const resposta = await fetch(`/api/leads/${encodeURIComponent(lead.placeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, motivoPerda: motivo ?? null }),
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro ?? 'Falha ao mover o lead');
      }
      aoAtualizar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao mover o lead');
    }
  };

  const aoSoltar = (evento: DragEndEvent) => {
    setArrastando(null);
    const destino = evento.over?.id as StatusCrm | undefined;
    const lead = leads.find((l) => l.placeId === evento.active.id);
    if (!destino || !lead || lead.status === destino) return;

    if (destino === 'perdido') {
      setPedindoMotivo(lead);
      return;
    }
    void mover(lead, destino);
  };

  const aoIniciar = (evento: DragStartEvent) => {
    setArrastando(leads.find((l) => l.placeId === evento.active.id) ?? null);
  };

  if (leads.length === 0) {
    return (
      <div className="grid size-full place-items-center p-8 text-center">
        <div>
          <IconeKanban className="mx-auto size-8 text-texto-fraco" />
          <p className="mt-2 text-sm font-medium text-texto">Nenhum lead no funil</p>
          <p className="mt-1 text-xs text-texto-fraco">
            Rode uma busca e os leads aparecem aqui, comecando na coluna Novo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col">
      {erro && (
        <p
          role="alert"
          className="flex items-center gap-2 border-b border-red-200 bg-red-50 p-2.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
        >
          <IconeAlerta className="size-4 shrink-0" />
          {erro}
        </p>
      )}

      <DndContext sensors={sensores} onDragStart={aoIniciar} onDragEnd={aoSoltar}>
        <div className="rolagem-fina flex flex-1 gap-3 overflow-x-auto p-4">
          {COLUNAS_KANBAN.map((coluna) => (
            <Coluna
              key={coluna}
              status={coluna}
              leads={porColuna.get(coluna) ?? []}
              aoAbrirDetalhes={aoAbrirDetalhes}
            />
          ))}
        </div>

        <DragOverlay>
          {arrastando && (
            <div className="w-64 rotate-1 rounded-lg border border-marca-500 bg-superficie p-2.5 shadow-[var(--sombra-flutuante)]">
              <p className="truncate text-xs font-semibold text-texto">
                {arrastando.nome}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pedindoMotivo && (
        <DialogoMotivo
          lead={pedindoMotivo}
          aoCancelar={() => setPedindoMotivo(null)}
          aoConfirmar={(motivo) => {
            const lead = pedindoMotivo;
            setPedindoMotivo(null);
            void mover(lead, 'perdido', motivo);
          }}
        />
      )}
    </div>
  );
}

function Coluna({
  status,
  leads,
  aoAbrirDetalhes,
}: {
  status: StatusCrm;
  leads: LeadCompleto[];
  aoAbrirDetalhes: (lead: LeadCompleto) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-xl border border-t-4 bg-superficie-2 transition-colors ${COR_COLUNA[status]} ${
        isOver ? 'border-marca-500 bg-marca-50 dark:bg-marca-800/20' : 'border-borda'
      }`}
    >
      <header className="flex items-baseline justify-between gap-2 p-2.5">
        <h3 className="text-xs font-semibold text-texto">{ROTULO_STATUS[status]}</h3>
        <span className="font-mono text-[0.6875rem] tabular-nums text-texto-fraco">
          {formatarNumero(leads.length)}
        </span>
      </header>

      <div className="rolagem-fina flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5">
        {leads.map((lead) => (
          <CartaoKanban key={lead.placeId} lead={lead} aoAbrir={aoAbrirDetalhes} />
        ))}
        {leads.length === 0 && (
          <p className="px-1 py-4 text-center text-[0.6875rem] text-texto-fraco">
            Arraste um lead para ca
          </p>
        )}
      </div>
    </section>
  );
}

function CartaoKanban({
  lead,
  aoAbrir,
}: {
  lead: LeadCompleto;
  aoAbrir: (lead: LeadCompleto) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.placeId,
  });

  /*
   * O arrasto fica no article e a abertura do detalhe fica num botao de verdade
   * dentro dele, com o nome do lead como rotulo.
   *
   * Antes o article inteiro tinha onClick, o que nao e operavel por teclado:
   * quem nao usa mouse simplesmente nao conseguia abrir o detalhe de um lead a
   * partir do Kanban. Separar as duas coisas resolve sem atrapalhar o arrasto,
   * que segue sendo por ponteiro.
   */
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-lg border border-borda bg-superficie p-2.5 shadow-[var(--sombra-cartao)] transition-opacity active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => aoAbrir(lead)}
          className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-texto underline-offset-2 hover:underline"
        >
          {lead.nome}
        </button>
        <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-texto-fraco">
          {lead.score}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[0.6875rem] text-texto-fraco">
        {lead.bairro ?? lead.cidade ?? ''}
      </p>
      {lead.ultimoContatoEm && (
        <p className="mt-1 text-[0.625rem] text-texto-fraco">
          Contato {tempoRelativo(lead.ultimoContatoEm)}
          {lead.tentativas > 1 && ` · ${lead.tentativas}x`}
        </p>
      )}
      {lead.motivoPerda && (
        <p className="mt-1 text-[0.625rem] text-red-600 dark:text-red-400">
          {ROTULO_MOTIVO_PERDA[lead.motivoPerda as MotivoPerda] ?? lead.motivoPerda}
        </p>
      )}
    </article>
  );
}

function DialogoMotivo({
  lead,
  aoCancelar,
  aoConfirmar,
}: {
  lead: LeadCompleto;
  aoCancelar: () => void;
  aoConfirmar: (motivo: MotivoPerda) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoPerda>('sem_resposta');
  const painel = useRef<HTMLDivElement>(null);

  useFocoPreso(painel);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Motivo da perda"
        ref={painel}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-4 shadow-[var(--sombra-flutuante)]"
      >
        <h3 className="text-sm font-semibold text-texto">Por que perdeu?</h3>
        <p className="mt-0.5 text-xs text-texto-fraco">{lead.nome}</p>

        <div className="mt-3 space-y-1.5">
          {MOTIVOS_PERDA.map((m) => (
            <label
              key={m}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-borda px-2.5 py-2 text-xs text-texto transition-colors has-checked:border-marca-600 has-checked:bg-marca-50 dark:has-checked:bg-marca-800/25"
            >
              <input
                type="radio"
                name="motivo"
                value={m}
                checked={motivo === m}
                onChange={() => setMotivo(m)}
                className="accent-[var(--color-marca-600)]"
              />
              {ROTULO_MOTIVO_PERDA[m]}
            </label>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={aoCancelar}
            className="flex-1 rounded-lg border border-borda px-3 py-2 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-3"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => aoConfirmar(motivo)}
            className="flex-1 rounded-lg bg-marca-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-marca-800"
          >
            Marcar como perdido
          </button>
        </div>
      </div>
    </div>
  );
}
