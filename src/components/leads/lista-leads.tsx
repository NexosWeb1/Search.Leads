'use client';

import type { LeadCompleto } from '@/lib/db/leads';
import { formatarNumero } from '@/lib/formato';
import { CartaoLead, type AcoesCartao } from './cartao-lead';
import { IconeAlerta, IconeCarregando, IconeLupa } from '@/components/icones';

interface Props extends AcoesCartao {
  leads: LeadCompleto[];
  carregando: boolean;
  erro: string | null;
  selecionados: Set<string>;
  destacado: string | null;
  aoSelecionarTodos: () => void;
  aoLimparSelecao: () => void;
}

export function ListaLeads({
  leads,
  carregando,
  erro,
  selecionados,
  destacado,
  aoSelecionarTodos,
  aoLimparSelecao,
  ...acoes
}: Props) {
  if (erro) {
    return (
      <div className="p-3">
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-900"
        >
          <IconeAlerta className="mt-0.5 size-4 shrink-0" />
          {erro}
        </p>
      </div>
    );
  }

  if (carregando && leads.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-xs text-texto-fraco">
        <IconeCarregando className="size-4" />
        Carregando os leads…
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="p-6 text-center">
        <IconeLupa className="mx-auto size-7 text-texto-fraco" />
        <p className="mt-2 text-xs font-medium text-texto">Nenhum lead na lista</p>
        <p className="mt-1 text-[0.6875rem] text-texto-fraco">
          Escolha um nicho e uma cidade acima e rode uma busca. Se ja buscou, tente
          afrouxar os filtros.
        </p>
      </div>
    );
  }

  return (
    <section className="p-3" aria-labelledby="titulo-lista-leads">
      {/* O h2 fecha o salto de h1 (cabecalho) para h3 (cartao) na sidebar. */}
      <h2 id="titulo-lista-leads" className="sr-only">
        Leads encontrados
      </h2>
      <div className="mb-2 flex items-center justify-between text-[0.6875rem] text-texto-fraco">
        <span>
          {selecionados.size > 0
            ? `${formatarNumero(selecionados.size)} selecionados`
            : `${formatarNumero(leads.length)} na lista`}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={aoSelecionarTodos}
            className="font-medium text-marca-700 underline-offset-2 hover:underline dark:text-marca-400"
          >
            Selecionar liberados
          </button>
          {selecionados.size > 0 && (
            <button
              type="button"
              onClick={aoLimparSelecao}
              className="font-medium text-texto-suave underline-offset-2 hover:underline"
            >
              Limpar
            </button>
          )}
        </span>
      </div>

      {/*
        content-visibility deixa o navegador pular o layout dos cartoes fora da
        tela. Com 500 leads na lista isso e o que mantem a rolagem fluida sem
        precisar virtualizar. `contain-intrinsic-size` reserva a altura estimada
        para a barra de rolagem nao pular.
      */}
      <div className="space-y-2 [&>*]:[contain-intrinsic-size:auto_9rem] [&>*]:[content-visibility:auto]">
        {leads.map((lead) => (
          <CartaoLead
            key={lead.placeId}
            lead={lead}
            selecionado={selecionados.has(lead.placeId)}
            destacado={destacado === lead.placeId}
            {...acoes}
          />
        ))}
      </div>
    </section>
  );
}
