'use client';

import { useEffect, useState } from 'react';
import type { Resultados } from '@/lib/contacts/funnel';
import { formatarNumero, formatarPorcentagem } from '@/lib/formato';
import {
  BarrasMagnitude,
  Cartao,
  Funil,
  Indicador,
  Medidor,
  SeloResultado,
  type EtapaFunil,
} from './primitivos';
import { IconeAlerta, IconeCarregando, IconePainel } from '@/components/icones';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '1 ano' },
];

export function PainelResultados({ searchId }: { searchId: string | null }) {
  const [dados, setDados] = useState<Resultados | null>(null);
  const [dias, setDias] = useState(30);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [somenteBusca, setSomenteBusca] = useState(false);

  useEffect(() => {
    let ativo = true;
    const p = new URLSearchParams({ dias: String(dias) });
    if (somenteBusca && searchId) p.set('searchId', searchId);

    fetch(`/api/stats?${p}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.erro ?? 'Falha ao carregar o painel');
        return d as Resultados;
      })
      .then((d) => {
        if (!ativo) return;
        setDados(d);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Falha ao carregar o painel');
      })
      .finally(() => ativo && setCarregando(false));

    return () => {
      ativo = false;
    };
  }, [dias, somenteBusca, searchId]);

  if (erro) {
    return (
      <div className="grid size-full place-items-center p-8">
        <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <IconeAlerta className="size-4" />
          {erro}
        </p>
      </div>
    );
  }

  if (carregando && !dados) {
    return (
      <div className="grid size-full place-items-center p-8">
        <p className="flex items-center gap-2 text-sm text-texto-fraco">
          <IconeCarregando className="size-4" />
          Montando o painel…
        </p>
      </div>
    );
  }

  if (!dados) return null;

  const { funil } = dados;

  if (funil.encontrados === 0) {
    return (
      <div className="grid size-full place-items-center p-8 text-center">
        <div>
          <IconePainel className="mx-auto size-8 text-texto-fraco" />
          <p className="mt-2 text-sm font-medium text-texto">Sem dados ainda</p>
          <p className="mt-1 max-w-xs text-xs text-texto-fraco">
            Rode uma busca e comece a mandar mensagens. O painel passa a mostrar o que
            funcionou e o que nao funcionou.
          </p>
        </div>
      </div>
    );
  }

  const etapas: EtapaFunil[] = [
    {
      rotulo: 'Encontrados',
      total: funil.encontrados,
      dica: 'Comercios que a varredura trouxe',
    },
    {
      rotulo: 'Sem site',
      total: funil.semSite,
      dica: 'Inclui quem so tem Instagram ou site gratis do Google',
    },
    {
      rotulo: 'Com WhatsApp',
      total: funil.comWhatsapp,
      dica: 'Sem site e com celular cadastrado, ou seja, contatavel',
    },
    { rotulo: 'Enviados', total: funil.enviados, dica: 'Receberam ao menos uma mensagem' },
    { rotulo: 'Responderam', total: funil.responderam, dica: 'Deram retorno' },
    { rotulo: 'Negociando', total: funil.negociando, dica: 'Conversa em andamento' },
    { rotulo: 'Fechados', total: funil.fechados, dica: 'Viraram cliente' },
  ];

  const taxaResposta = funil.enviados > 0 ? funil.responderam / funil.enviados : 0;
  const taxaFechamento = funil.enviados > 0 ? funil.fechados / funil.enviados : 0;
  const totalFalhasTecnicas = dados.falhasTecnicas.reduce((a, f) => a + f.total, 0);

  return (
    <div className="rolagem-fina size-full overflow-y-auto bg-fundo-app p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-texto">Painel de resultados</h2>
          <p className="text-xs text-texto-fraco">
            O que deu certo, o que deu errado, e por que
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {searchId && (
            <label className="flex items-center gap-1.5 text-xs text-texto-suave">
              <input
                type="checkbox"
                checked={somenteBusca}
                onChange={(e) => {
                  setCarregando(true);
                  setSomenteBusca(e.target.checked);
                }}
                className="size-3.5 accent-[var(--color-marca-600)]"
              />
              Somente a busca atual
            </label>
          )}

          <div
            className="flex gap-0.5 rounded-lg bg-superficie-3 p-0.5"
            role="group"
            aria-label="Periodo"
          >
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                type="button"
                onClick={() => {
                  setCarregando(true);
                  setDias(p.dias);
                }}
                aria-pressed={dias === p.dias}
                className={`rounded-md px-2 py-1 text-[0.6875rem] font-medium transition-colors ${
                  dias === p.dias
                    ? 'bg-superficie text-texto shadow-[var(--sombra-cartao)]'
                    : 'text-texto-suave hover:text-texto'
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador
          rotulo="Fechados"
          valor={funil.fechados}
          detalhe={
            funil.enviados > 0
              ? `${formatarPorcentagem(funil.fechados, funil.enviados)} de quem recebeu`
              : 'Nenhum envio ainda'
          }
          tom="bom"
        />
        <Indicador
          rotulo="Taxa de resposta"
          valor={`${Math.round(taxaResposta * 100)}%`}
          detalhe={`${formatarNumero(funil.responderam)} de ${formatarNumero(funil.enviados)}`}
        />
        <Indicador
          rotulo="Em negociacao"
          valor={funil.negociando}
          detalhe="Conversas abertas agora"
        />
        <Indicador
          rotulo="Perdidos"
          valor={funil.perdidos}
          detalhe="Falha comercial"
          tom="ruim"
        />
        <Indicador
          rotulo="Prontos para follow-up"
          valor={dados.prontosParaFollowUp}
          detalhe="Saiu do periodo de espera"
          tom="atencao"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Cartao
          titulo="Funil"
          descricao="Onde os leads param entre encontrar e fechar"
          className="lg:col-span-2"
        >
          <Funil etapas={etapas} />
        </Cartao>

        <Cartao titulo="Deu certo" descricao="Negocios que fecharam no periodo">
          <div className="space-y-3">
            <p className="text-xs text-texto-suave">
              <SeloResultado tipo="bom">
                {formatarNumero(funil.fechados)}{' '}
                {funil.fechados === 1 ? 'cliente fechado' : 'clientes fechados'}
              </SeloResultado>
              {dados.valorFechado > 0 && (
                <span className="ml-2">
                  somando{' '}
                  {dados.valorFechado.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </span>
              )}
            </p>

            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-texto-fraco">Tempo medio ate a resposta</dt>
                <dd className="mt-0.5 text-sm font-semibold text-texto">
                  {dados.tempoMedioRespostaDias === null
                    ? 'sem dados'
                    : dados.tempoMedioRespostaDias < 1
                      ? 'menos de 1 dia'
                      : `${dados.tempoMedioRespostaDias.toFixed(1).replace('.', ',')} dias`}
                </dd>
              </div>
              <div>
                <dt className="text-texto-fraco">Tentativas ate fechar</dt>
                <dd className="mt-0.5 text-sm font-semibold text-texto">
                  {dados.tentativasMediasAteFechar === null
                    ? 'sem dados'
                    : dados.tentativasMediasAteFechar.toFixed(1).replace('.', ',')}
                </dd>
              </div>
            </dl>

            {taxaFechamento > 0 && (
              <p className="text-[0.6875rem] text-texto-fraco">
                A cada 100 mensagens enviadas, {Math.round(taxaFechamento * 100)} viraram
                cliente.
              </p>
            )}
          </div>
        </Cartao>

        <Cartao
          titulo="Deu errado: comercial"
          descricao="A mensagem chegou e o negocio nao saiu. Isso mede sua abordagem."
        >
          <div className="space-y-3">
            <p className="text-xs">
              <SeloResultado tipo="ruim">
                {formatarNumero(funil.perdidos)}{' '}
                {funil.perdidos === 1 ? 'perdido' : 'perdidos'}
              </SeloResultado>
            </p>
            <BarrasMagnitude
              itens={dados.perdas}
              tom="perda"
              vazio="Nenhuma perda registrada. Mova cartoes para Perdido no Kanban e o motivo aparece aqui."
            />
          </div>
        </Cartao>

        <Cartao
          titulo="Deu errado: tecnico"
          descricao="Problema de dado, nao de proposta. Isso da para recuperar."
        >
          <div className="space-y-3">
            <p className="text-xs">
              <SeloResultado tipo="atencao">
                {formatarNumero(totalFalhasTecnicas)}{' '}
                {totalFalhasTecnicas === 1 ? 'falha' : 'falhas'} de entrega
              </SeloResultado>
            </p>
            <BarrasMagnitude
              itens={dados.falhasTecnicas}
              tom="tecnica"
              vazio="Nenhuma falha de entrega."
            />
            {dados.recuperaveis > 0 && (
              <p className="rounded-lg bg-superficie-2 p-2 text-[0.6875rem] text-texto-suave">
                {formatarNumero(dados.recuperaveis)}{' '}
                {dados.recuperaveis === 1 ? 'lead' : 'leads'} falharam por telefone ruim e
                nunca foram abordados de verdade. Eles nao gastaram tentativa e voltam para
                a fila se o enriquecimento achar outro contato.
              </p>
            )}
          </div>
        </Cartao>

        <Cartao titulo="Ritmo de envio" descricao="Para nao queimar seu numero">
          <div className="space-y-3">
            <Medidor
              rotulo="Hoje"
              valor={dados.ritmo.hoje}
              limite={dados.ritmo.limiteDiario}
              aviso="Perto do limite diario. Volume alto de mensagem fria a partir do mesmo numero e o que faz o WhatsApp bloquear."
            />
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-texto-fraco">Ultimos 7 dias</dt>
                <dd className="mt-0.5 text-sm font-semibold text-texto">
                  {formatarNumero(dados.ritmo.semana)}
                </dd>
              </div>
              <div>
                <dt className="text-texto-fraco">Ultimos 30 dias</dt>
                <dd className="mt-0.5 text-sm font-semibold text-texto">
                  {formatarNumero(dados.ritmo.mes)}
                </dd>
              </div>
            </dl>
          </div>
        </Cartao>

        <Cartao
          titulo="Desempenho por mensagem"
          descricao="Qual abordagem faz as pessoas responderem"
        >
          {dados.templates.length === 0 ? (
            <p className="text-xs text-texto-fraco">
              Nenhum envio no periodo. Assim que voce disparar, a taxa de resposta de cada
              mensagem aparece aqui.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-borda text-left text-texto-fraco">
                    <th scope="col" className="pb-1.5 font-medium">
                      Mensagem
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Enviadas
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Respostas
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Taxa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.templates.map((t) => (
                    <tr key={t.templateId} className="border-b border-borda last:border-0">
                      <td className="max-w-[10rem] truncate py-1.5 text-texto">{t.nome}</td>
                      <td className="py-1.5 text-right tabular-nums text-texto-suave">
                        {formatarNumero(t.enviados)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-texto-suave">
                        {formatarNumero(t.responderam)}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-texto">
                        {Math.round(t.taxa * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao
          titulo="Por nicho"
          descricao="Onde vale gastar a proxima varredura"
          className="lg:col-span-2"
        >
          {dados.nichos.length === 0 ? (
            <p className="text-xs text-texto-fraco">Nenhuma varredura registrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-borda text-left text-texto-fraco">
                    <th scope="col" className="pb-1.5 font-medium">
                      Nicho
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Encontrados
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Sem site
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Contatados
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Fechados
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Aproveitamento
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.nichos.map((n) => (
                    <tr key={n.nicho} className="border-b border-borda last:border-0">
                      <td className="py-1.5 text-texto">{n.nicho}</td>
                      <td className="py-1.5 text-right tabular-nums text-texto-suave">
                        {formatarNumero(n.encontrados)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-texto-suave">
                        {formatarNumero(n.semSite)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-texto-suave">
                        {formatarNumero(n.contatados)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-texto">
                        {formatarNumero(n.fechados)}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-texto">
                        {n.contatados > 0
                          ? formatarPorcentagem(n.fechados, n.contatados)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao
          titulo="Qualidade da lista"
          descricao="Distribuicao dos leads sem site por faixa de score"
          className="lg:col-span-2"
        >
          <BarrasMagnitude itens={dados.faixas.filter((f) => f.total > 0)} />
        </Cartao>
      </div>
    </div>
  );
}
