'use client';

import { memo } from 'react';
import type { LeadCompleto } from '@/lib/db/leads';
import { ROTULO_FAIXA, type Faixa } from '@/lib/scoring/score';
import { formatarDistancia } from '@/lib/formato';
import { TarjaContato } from './tarja-contato';
import {
  IconeGlobo,
  IconeInstagram,
  IconeLupa,
  IconeTelefone,
  IconeWhatsApp,
} from '@/components/icones';

const ESTILO_FAIXA: Record<Faixa, string> = {
  muito_bom:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-900',
  bom: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900',
  intermediario:
    'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300 dark:ring-yellow-900',
  ruim: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};

export interface AcoesCartao {
  aoAbrirDetalhes: (lead: LeadCompleto) => void;
  aoEnviarWhatsApp: (lead: LeadCompleto) => void;
  aoAlternarSelecao: (placeId: string) => void;
  aoDestacar: (placeId: string | null) => void;
}

interface Props extends AcoesCartao {
  lead: LeadCompleto;
  selecionado: boolean;
  destacado: boolean;
}

function CartaoLeadBase({
  lead,
  selecionado,
  destacado,
  aoAbrirDetalhes,
  aoEnviarWhatsApp,
  aoAlternarSelecao,
  aoDestacar,
}: Props) {
  const podeZap = Boolean(lead.telefoneE164 && lead.telefoneCelular);
  const bloqueado = !lead.contato.pode;

  return (
    <article
      onMouseEnter={() => aoDestacar(lead.placeId)}
      onMouseLeave={() => aoDestacar(null)}
      className={`group rounded-xl border bg-superficie p-3 shadow-[var(--sombra-cartao)] transition-colors ${
        destacado ? 'border-marca-500 ring-1 ring-marca-500' : 'border-borda'
      } ${bloqueado ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selecionado}
          onChange={() => aoAlternarSelecao(lead.placeId)}
          className="mt-1 size-4 shrink-0 accent-[var(--color-marca-600)]"
          aria-label={`Selecionar ${lead.nome}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-texto" title={lead.nome}>
              {lead.nome}
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold ring-1 ring-inset ${ESTILO_FAIXA[lead.faixa]}`}
              >
                {ROTULO_FAIXA[lead.faixa]}
              </span>
              <span
                className="w-6 text-right font-mono text-xs tabular-nums text-texto-fraco"
                title={`Score ${lead.score} de 100`}
              >
                {lead.score}
              </span>
            </div>
          </div>

          <p className="mt-0.5 truncate text-xs text-texto-fraco">
            {lead.enderecoCurto ?? lead.endereco ?? 'Endereco nao informado'}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-suave">
            {lead.telefoneFormatado ? (
              <span className="inline-flex items-center gap-1">
                <IconeTelefone className="size-3.5 text-texto-fraco" />
                {lead.telefoneFormatado}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <IconeTelefone className="size-3.5" />
                Sem telefone
              </span>
            )}

            {lead.totalAvaliacoes !== null && lead.totalAvaliacoes > 0 && (
              <span title="Avaliacoes no Google">
                {lead.nota?.toFixed(1).replace('.', ',')} ({lead.totalAvaliacoes})
              </span>
            )}

            {lead.distanciaM !== null && (
              <span className="text-texto-fraco">{formatarDistancia(lead.distanciaM)}</span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-md bg-superficie-3 px-1.5 py-0.5 text-[0.6875rem] text-texto-suave"
              title={lead.websiteUrl ?? 'Nenhum site cadastrado no Google'}
            >
              <IconeGlobo className="size-3" />
              {rotuloSite(lead)}
            </span>

            {lead.instagram && (
              <span className="inline-flex items-center gap-1 rounded-md bg-superficie-3 px-1.5 py-0.5 text-[0.6875rem] text-texto-suave">
                <IconeInstagram className="size-3" />
                Instagram
              </span>
            )}

            <TarjaContato contato={lead.contato} />
          </div>

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => aoEnviarWhatsApp(lead)}
              disabled={!podeZap}
              title={
                podeZap
                  ? bloqueado
                    ? `${lead.contato.rotulo}. Abrir mesmo assim pede confirmacao.`
                    : 'Abrir conversa no WhatsApp'
                  : lead.telefoneE164
                    ? 'Telefone fixo nao recebe WhatsApp'
                    : 'Sem telefone cadastrado'
              }
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zap px-2 py-1.5 text-xs font-semibold text-[var(--color-zap-texto)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
            >
              <IconeWhatsApp className="size-3.5" />
              WhatsApp
            </button>

            <button
              type="button"
              onClick={() => aoAbrirDetalhes(lead)}
              className="rounded-lg border border-borda px-2 py-1.5 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-3"
            >
              Detalhes
            </button>

            {lead.mapsUri && (
              <a
                href={lead.mapsUri}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir no Google Maps"
                className="inline-flex items-center justify-center rounded-lg border border-borda px-2 py-1.5 text-texto-suave transition-colors hover:bg-superficie-3"
              >
                <IconeLupa className="size-3.5" />
                <span className="sr-only">Abrir no Google Maps</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function rotuloSite(lead: LeadCompleto): string {
  switch (lead.websiteClasse) {
    case 'sem_site':
      return 'Sem site';
    case 'rede_social':
      return 'So rede social';
    case 'site_google':
      return 'Site gratis do Google';
    case 'agendamento':
      return 'So perfil em plataforma';
    case 'marketplace':
      return 'So marketplace';
    case 'construtor':
      return 'Site em construtor';
    case 'proprio':
      return lead.websiteHost ?? 'Tem site';
  }
}

/**
 * A lista chega a centenas de cartoes e o hover no mapa muda estado a cada
 * movimento do mouse. Sem memo, cada movimento redesenharia a lista inteira.
 */
export const CartaoLead = memo(CartaoLeadBase);
