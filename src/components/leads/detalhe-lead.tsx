'use client';

import { useEffect, useRef, useState } from 'react';
import type { LeadCompleto } from '@/lib/db/leads';
import type { ItemHistorico } from '@/lib/contacts/log';
import { ROTULO_FAIXA } from '@/lib/scoring/score';
import {
  COLUNAS_KANBAN,
  MOTIVOS_PERDA,
  ROTULO_ENTREGA,
  ROTULO_MOTIVO_PERDA,
  ROTULO_STATUS,
  type MotivoPerda,
  type StatusCrm,
} from '@/lib/db/schema';
import { formatarDataHora, formatarDistancia, tempoRelativo } from '@/lib/formato';
import { useFocoPreso } from '@/lib/hooks';
import { TarjaContato } from './tarja-contato';
import {
  IconeCarregando,
  IconeFechar,
  IconeGlobo,
  IconeLupa,
  IconeTelefone,
  IconeWhatsApp,
} from '@/components/icones';

export function DetalheLead({
  lead,
  mensagem,
  aoFechar,
  aoAtualizar,
  aoEnviarWhatsApp,
}: {
  lead: LeadCompleto;
  mensagem: string;
  aoFechar: () => void;
  aoAtualizar: () => void;
  aoEnviarWhatsApp: (lead: LeadCompleto) => void;
}) {
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [status, setStatus] = useState<StatusCrm>(lead.status);
  const [motivo, setMotivo] = useState<MotivoPerda | ''>(
    (lead.motivoPerda as MotivoPerda) ?? '',
  );
  const [notas, setNotas] = useState(lead.notas ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const painel = useRef<HTMLDivElement>(null);

  useFocoPreso(painel);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/contacts?placeId=${encodeURIComponent(lead.placeId)}`)
      .then((r) => r.json())
      .then((d) => ativo && setHistorico(d.historico ?? []))
      .catch(() => ativo && setHistorico([]));
    return () => {
      ativo = false;
    };
  }, [lead.placeId]);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/leads/${encodeURIComponent(lead.placeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          motivoPerda: status === 'perdido' ? motivo || null : null,
          notas,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? 'Falha ao salvar');
      aoAtualizar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const podeZap = Boolean(lead.telefoneE164 && lead.telefoneCelular);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar detalhes"
        onClick={aoFechar}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${lead.nome}`}
        ref={painel}
        tabIndex={-1}
        className="rolagem-fina contem-rolagem relative flex w-full max-w-md flex-col overflow-y-auto border-l border-borda bg-superficie shadow-[var(--sombra-flutuante)]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borda bg-superficie p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-texto">{lead.nome}</h2>
            <p className="mt-0.5 text-xs text-texto-fraco">
              {lead.tipoLabel ?? 'Ramo nao informado'}
              {lead.distanciaM !== null && ` · ${formatarDistancia(lead.distanciaM)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-texto-fraco transition-colors hover:bg-superficie-3"
          >
            <IconeFechar className="size-4" />
          </button>
        </header>

        <div className="space-y-5 p-4">
          <section>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-texto">
                {lead.score}
              </span>
              <span className="text-sm text-texto-fraco">/ 100</span>
              <span className="ml-auto rounded-md bg-superficie-3 px-2 py-1 text-xs font-semibold text-texto-suave">
                {ROTULO_FAIXA[lead.faixa]}
              </span>
            </div>

            <ul className="mt-2 space-y-1">
              {lead.motivos.map((m) => (
                <li
                  key={m.texto}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="text-texto-suave">{m.texto}</span>
                  <span
                    className={`shrink-0 font-mono tabular-nums ${
                      m.pontos < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-marca-700 dark:text-marca-400'
                    }`}
                  >
                    {m.pontos > 0 ? '+' : ''}
                    {m.pontos}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 rounded-lg bg-superficie-2 p-3">
            <Linha rotulo="Endereco" valor={lead.endereco} />
            <Linha rotulo="Bairro" valor={lead.bairro} />
            {lead.nota !== null && (
              <Linha
                rotulo="Google"
                valor={`${lead.nota.toFixed(1).replace('.', ',')} com ${lead.totalAvaliacoes} avaliacoes`}
              />
            )}
            <div className="flex items-center gap-2 text-xs">
              <IconeTelefone className="size-3.5 shrink-0 text-texto-fraco" />
              {lead.telefoneFormatado ? (
                <>
                  <a
                    href={`tel:+${lead.telefoneE164}`}
                    className="text-texto hover:underline"
                  >
                    {lead.telefoneFormatado}
                  </a>
                  <span className="text-texto-fraco">
                    {lead.telefoneCelular ? '(celular)' : '(fixo, sem WhatsApp)'}
                  </span>
                </>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  Sem telefone
                  {lead.telefoneMotivo && ` (${lead.telefoneMotivo.replace(/_/g, ' ')})`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <IconeGlobo className="size-3.5 shrink-0 text-texto-fraco" />
              {lead.websiteUrl ? (
                <a
                  href={lead.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-texto hover:underline"
                >
                  {lead.websiteHost}
                </a>
              ) : (
                <span className="text-texto-suave">Nenhum site cadastrado no Google</span>
              )}
            </div>
            {lead.email && <Linha rotulo="E-mail" valor={lead.email} />}
            {lead.instagram && <Linha rotulo="Instagram" valor={lead.instagram} />}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-fraco">
                Historico de contato
              </h3>
              <TarjaContato contato={lead.contato} />
            </div>

            {historico === null ? (
              <p className="flex items-center gap-2 text-xs text-texto-fraco">
                <IconeCarregando className="size-3.5" />
                Carregando…
              </p>
            ) : historico.length === 0 ? (
              <p className="text-xs text-texto-fraco">
                Voce ainda nao falou com este comercio.
              </p>
            ) : (
              <ol className="space-y-2">
                {historico.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-borda bg-superficie-2 p-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
                      <span className="font-medium text-texto">
                        {item.tentativa > 0
                          ? `${item.tentativa}a tentativa`
                          : 'Nao enviado'}
                        <span className="ml-1.5 font-normal text-texto-fraco">
                          {ROTULO_ENTREGA[item.entrega]}
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-texto-fraco"
                        title={formatarDataHora(item.registradoEm)}
                      >
                        {tempoRelativo(item.registradoEm)}
                      </span>
                    </div>
                    {item.mensagem && (
                      <p className="mt-1.5 whitespace-pre-wrap border-l-2 border-borda pl-2 text-[0.6875rem] leading-relaxed text-texto-suave">
                        {item.mensagem}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-fraco">
              Funil
            </h3>

            <label htmlFor="status" className="sr-only">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusCrm)}
              className="w-full rounded-lg border border-borda-campo bg-superficie px-2.5 py-2 text-sm text-texto"
            >
              {[...COLUNAS_KANBAN, 'frio', 'nao_perturbe'].map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s as StatusCrm]}
                </option>
              ))}
            </select>

            {status === 'perdido' && (
              <div>
                <label
                  htmlFor="motivo"
                  className="mb-1 block text-xs font-medium text-texto-suave"
                >
                  Motivo da perda
                </label>
                <select
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value as MotivoPerda)}
                  className="w-full rounded-lg border border-borda-campo bg-superficie px-2.5 py-2 text-sm text-texto"
                >
                  <option value="">Escolha um motivo</option>
                  {MOTIVOS_PERDA.map((m) => (
                    <option key={m} value={m}>
                      {ROTULO_MOTIVO_PERDA[m]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[0.6875rem] text-texto-fraco">
                  O motivo alimenta o painel de resultados, que mostra por que os
                  negocios nao fecham.
                </p>
              </div>
            )}

            <div>
              <label
                htmlFor="notas"
                className="mb-1 block text-xs font-medium text-texto-suave"
              >
                Notas
              </label>
              <textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                placeholder="O que voce combinou, quando retornar, o que ele pediu"
                className="w-full resize-y rounded-lg border border-borda-campo bg-superficie px-2.5 py-2 text-xs text-texto placeholder:text-texto-fraco"
              />
            </div>

            {erro && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {erro}
              </p>
            )}
          </section>
        </div>

        <footer className="sticky bottom-0 flex gap-2 border-t border-borda bg-superficie p-4">
          <button
            type="button"
            onClick={() => aoEnviarWhatsApp(lead)}
            disabled={!podeZap}
            title={mensagem.slice(0, 120)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zap px-3 py-2 text-sm font-semibold text-[var(--color-zap-texto)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700"
          >
            <IconeWhatsApp className="size-4" />
            WhatsApp
          </button>
          {lead.mapsUri && (
            <a
              href={lead.mapsUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-borda px-3 py-2 text-texto-suave transition-colors hover:bg-superficie-3"
              title="Abrir no Google Maps"
            >
              <IconeLupa className="size-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-marca-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-marca-800 disabled:opacity-60"
          >
            {salvando && <IconeCarregando className="size-4" />}
            Salvar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <p className="text-xs">
      <span className="text-texto-fraco">{rotulo}: </span>
      <span className="text-texto">{valor}</span>
    </p>
  );
}
