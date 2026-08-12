'use client';

import {
  ROTULO_ORDENACAO,
  contarFiltrosAtivos,
  type EstadoFiltros,
} from '@/lib/filtros';
import type { Ordenacao } from '@/lib/db/leads';
import { formatarNumero } from '@/lib/formato';
import {
  IconeBaixar,
  IconeCarregando,
  IconeEmail,
  IconeFoguete,
  IconeInstagram,
  IconeLupa,
  IconeWhatsApp,
} from '@/components/icones';

export interface PropsPainelFiltros {
  filtros: EstadoFiltros;
  aoTrocarFiltros: (parcial: Partial<EstadoFiltros>) => void;
  totalListado: number;
  totalNoRaio: number;
  totalEnriquecidos: number;
  selecionados: number;
  disponiveisParaDisparo: number;
  aoExportar: (formato: 'csv' | 'xlsx') => void;
  aoAbrirDisparo: () => void;
  exportando: boolean;
  aoEnriquecer: () => void;
  enriquecendo: boolean;
  progressoEnriquecimento: { feitos: number; total: number; comContato: number } | null;
}

const CONTATO_OPCOES: Array<{
  valor: EstadoFiltros['contato'];
  rotulo: string;
  dica: string;
}> = [
  { valor: 'todos', rotulo: 'Todos', dica: 'Sem filtro de historico' },
  {
    valor: 'nunca',
    rotulo: 'Nunca contatados',
    dica: 'Quem ainda nao recebeu nenhuma mensagem',
  },
  {
    valor: 'disponivel',
    rotulo: 'Liberados',
    dica: 'Nunca contatados mais os que ja sairam do periodo de espera',
  },
  {
    valor: 'contatados',
    rotulo: 'Ja contatados',
    dica: 'Quem ja recebeu ao menos uma mensagem',
  },
];

export function PainelFiltros({
  filtros,
  aoTrocarFiltros,
  totalListado,
  totalNoRaio,
  totalEnriquecidos,
  selecionados,
  disponiveisParaDisparo,
  aoExportar,
  aoAbrirDisparo,
  exportando,
  aoEnriquecer,
  enriquecendo,
  progressoEnriquecimento,
}: PropsPainelFiltros) {
  const ativos = contarFiltrosAtivos(filtros);
  const alvoDisparo = selecionados > 0 ? selecionados : disponiveisParaDisparo;

  return (
    <div className="space-y-3 border-b border-borda p-3">
      <p className="text-xs text-texto-suave">
        <strong className="font-semibold text-texto">{formatarNumero(totalListado)}</strong>{' '}
        na lista
        {totalNoRaio > 0 && (
          <>
            {' '}
            de <strong className="font-semibold">{formatarNumero(totalNoRaio)}</strong> no raio
          </>
        )}
        {totalEnriquecidos > 0 && (
          <>
            {' '}
            &middot; {formatarNumero(totalEnriquecidos)}/{formatarNumero(totalListado)}{' '}
            enriquecidos
          </>
        )}
      </p>

      {enriquecendo ? (
        <p
          className="flex items-center gap-2 rounded-lg bg-superficie-3 p-2 text-[0.6875rem] text-texto-suave"
          role="status"
          aria-live="polite"
        >
          <IconeCarregando className="size-3.5 shrink-0" />
          Buscando contatos
          {progressoEnriquecimento && (
            <>
              {' '}
              {progressoEnriquecimento.feitos}/{progressoEnriquecimento.total} &middot;{' '}
              {progressoEnriquecimento.comContato} achados
            </>
          )}
        </p>
      ) : (
        totalListado > 0 && (
          <button
            type="button"
            onClick={aoEnriquecer}
            title="Abre o site de cada lead e procura e-mail, Instagram e WhatsApp. Respeita robots.txt e nao repete quem ja foi enriquecido."
            className="inline-flex items-center gap-1.5 rounded-md border border-borda px-2 py-1 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-3"
          >
            <IconeLupa className="size-3" />
            Buscar contatos
          </button>
        )
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-texto-fraco">Exportar</span>
        <button
          type="button"
          onClick={() => aoExportar('csv')}
          disabled={exportando || totalListado === 0}
          className="inline-flex items-center gap-1 rounded-md border border-borda px-2 py-1 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-3 disabled:opacity-50"
        >
          <IconeBaixar className="size-3" />
          CSV
        </button>
        <button
          type="button"
          onClick={() => aoExportar('xlsx')}
          disabled={exportando || totalListado === 0}
          className="inline-flex items-center gap-1 rounded-md border border-borda px-2 py-1 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-3 disabled:opacity-50"
        >
          <IconeBaixar className="size-3" />
          Excel
        </button>
      </div>

      <div>
        <label htmlFor="ordenar" className="sr-only">
          Ordenar por
        </label>
        <select
          id="ordenar"
          value={filtros.ordenar}
          onChange={(e) => aoTrocarFiltros({ ordenar: e.target.value as Ordenacao })}
          className="w-full rounded-lg border border-borda-campo bg-superficie px-2.5 py-1.5 text-xs text-texto"
        >
          {(Object.keys(ROTULO_ORDENACAO) as Ordenacao[]).map((chave) => (
            <option key={chave} value={chave}>
              Ordenar: {ROTULO_ORDENACAO[chave]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Alternador
          ativo={filtros.somenteWhatsapp}
          aoClicar={() => aoTrocarFiltros({ somenteWhatsapp: !filtros.somenteWhatsapp })}
          titulo="Somente celulares, que sao os que recebem WhatsApp"
        >
          <IconeWhatsApp className="size-3" />
          WhatsApp
        </Alternador>

        <Alternador
          ativo={filtros.somenteInstagram}
          aoClicar={() => aoTrocarFiltros({ somenteInstagram: !filtros.somenteInstagram })}
          titulo="Somente quem tem Instagram encontrado no enriquecimento"
        >
          <IconeInstagram className="size-3" />
          Instagram
        </Alternador>

        <Alternador
          ativo={filtros.somenteEmail}
          aoClicar={() => aoTrocarFiltros({ somenteEmail: !filtros.somenteEmail })}
          titulo="Somente quem tem e-mail encontrado no enriquecimento"
        >
          <IconeEmail className="size-3" />
          E-mail
        </Alternador>

        <Alternador
          ativo={filtros.incluirComSite}
          aoClicar={() => aoTrocarFiltros({ incluirComSite: !filtros.incluirComSite })}
          titulo="Por padrao quem ja tem site proprio fica fora da lista"
        >
          Incluir quem tem site
        </Alternador>
      </div>

      <div>
        <label htmlFor="contato" className="mb-1 block text-xs font-medium text-texto-suave">
          Historico de contato
        </label>
        <select
          id="contato"
          value={filtros.contato}
          onChange={(e) =>
            aoTrocarFiltros({ contato: e.target.value as EstadoFiltros['contato'] })
          }
          className="w-full rounded-lg border border-borda-campo bg-superficie px-2.5 py-1.5 text-xs text-texto"
        >
          {CONTATO_OPCOES.map((o) => (
            <option key={o.valor} value={o.valor} title={o.dica}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[0.6875rem] text-texto-fraco">
          {CONTATO_OPCOES.find((o) => o.valor === filtros.contato)?.dica}
        </p>
      </div>

      {ativos > 0 && (
        <button
          type="button"
          onClick={() => aoTrocarFiltros({ ...FILTROS_LIMPOS })}
          className="text-xs font-medium text-marca-700 underline-offset-2 hover:underline dark:text-marca-400"
        >
          Limpar {ativos} {ativos === 1 ? 'filtro' : 'filtros'}
        </button>
      )}

      <button
        type="button"
        onClick={aoAbrirDisparo}
        disabled={alvoDisparo === 0}
        title={
          selecionados > 0
            ? `Disparar para os ${selecionados} leads selecionados`
            : `Disparar para os ${disponiveisParaDisparo} leads liberados pelo periodo de espera`
        }
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-marca-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-marca-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
      >
        <IconeFoguete className="size-4" />
        Modo disparo ({alvoDisparo})
      </button>

      {selecionados === 0 && disponiveisParaDisparo === 0 && totalListado > 0 && (
        <p className="text-[0.6875rem] text-texto-fraco">
          Nenhum lead liberado agora. Todos ja foram contatados recentemente ou estao em
          conversa.
        </p>
      )}
    </div>
  );
}

const FILTROS_LIMPOS: Partial<EstadoFiltros> = {
  incluirComSite: false,
  somenteWhatsapp: false,
  somenteInstagram: false,
  somenteEmail: false,
  contato: 'todos',
  busca: '',
};

function Alternador({
  ativo,
  aoClicar,
  titulo,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={titulo}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.6875rem] font-medium transition-colors ${
        ativo
          ? 'border-marca-600 bg-marca-50 text-marca-800 dark:bg-marca-800/30 dark:text-marca-200'
          : 'border-borda text-texto-suave hover:bg-superficie-3'
      }`}
    >
      {children}
    </button>
  );
}
