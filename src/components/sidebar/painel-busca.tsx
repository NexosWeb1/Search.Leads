'use client';

import { useEffect, useRef, useState } from 'react';
import { nichosPorGrupo } from '@/lib/niches';
import { useDebounce, useFecharFora } from '@/lib/hooks';
import { formatarMoeda } from '@/lib/formato';
import type { LocalGeocodificado } from '@/lib/places/client';
import type { ProgressoVarredura } from '@/lib/search/runner';
import {
  IconeAlerta,
  IconeCarregando,
  IconeLocal,
  IconeLupa,
} from '@/components/icones';

export interface PropsPainelBusca {
  nichoId: string;
  aoTrocarNicho: (id: string) => void;
  local: LocalGeocodificado | null;
  aoEscolherLocal: (local: LocalGeocodificado | null) => void;
  raioKm: number;
  aoTrocarRaio: (km: number) => void;
  buscando: boolean;
  progresso: ProgressoVarredura | null;
  erro: string | null;
  aoBuscar: () => void;
  aoCancelar: () => void;
}

export function PainelBusca({
  nichoId,
  aoTrocarNicho,
  local,
  aoEscolherLocal,
  raioKm,
  aoTrocarRaio,
  buscando,
  progresso,
  erro,
  aoBuscar,
  aoCancelar,
}: PropsPainelBusca) {
  const grupos = nichosPorGrupo();

  return (
    <div className="space-y-3 border-b border-borda p-3">
      <div>
        <label htmlFor="nicho" className="sr-only">
          Nicho
        </label>
        <select
          id="nicho"
          value={nichoId}
          onChange={(e) => aoTrocarNicho(e.target.value)}
          disabled={buscando}
          className="w-full rounded-lg border border-borda-campo bg-superficie px-2.5 py-2 text-sm text-texto disabled:opacity-60"
        >
          {grupos.map(({ grupo, nichos }) => (
            <optgroup key={grupo} label={grupo}>
              {nichos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <CampoLocal local={local} aoEscolher={aoEscolherLocal} desabilitado={buscando} />

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="raio" className="text-xs font-medium text-texto-suave">
            Raio
          </label>
          <span className="font-mono text-xs tabular-nums text-texto">{raioKm} km</span>
        </div>
        <input
          id="raio"
          type="range"
          min={1}
          max={50}
          step={1}
          value={raioKm}
          onChange={(e) => aoTrocarRaio(Number(e.target.value))}
          disabled={buscando}
          className="w-full accent-[var(--color-marca-600)] disabled:opacity-60"
        />
      </div>

      {buscando ? (
        <div className="space-y-2">
          <BarraProgresso progresso={progresso} />
          <button
            type="button"
            onClick={aoCancelar}
            className="w-full rounded-lg border border-borda px-3 py-2 text-sm font-medium text-texto-suave transition-colors hover:bg-superficie-3"
          >
            Cancelar busca
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={aoBuscar}
          disabled={!local}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-marca-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-marca-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
        >
          <IconeLupa className="size-4" />
          Buscar leads sem site
        </button>
      )}

      {erro && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-800 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-900"
        >
          <IconeAlerta className="mt-0.5 size-4 shrink-0" />
          <span>{erro}</span>
        </p>
      )}
    </div>
  );
}

function BarraProgresso({ progresso }: { progresso: ProgressoVarredura | null }) {
  const total = progresso?.celulasTotal ?? 0;
  const feitas = progresso?.celulasFeitas ?? 0;
  const proporcao = total > 0 ? Math.min(1, feitas / total) : 0;

  return (
    <div
      className="rounded-lg bg-superficie-3 p-2.5"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-texto">
          <IconeCarregando className="size-3.5" />
          {progresso?.fase === 'salvando' ? 'Salvando' : 'Varrendo o mapa'}
        </span>
        <span className="font-mono tabular-nums text-texto-suave">
          {feitas}/{total || '?'}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-borda">
        <div
          className="h-full rounded-full bg-marca-600 transition-[width] duration-300"
          style={{ width: `${proporcao * 100}%` }}
        />
      </div>

      <p className="mt-1.5 text-[0.6875rem] text-texto-fraco">
        {progresso?.encontrados ?? 0} comercios encontrados
        {progresso && progresso.requisicoes > 0 && (
          <>
            {' '}
            &middot; {progresso.requisicoes} requisicoes &middot;{' '}
            {formatarMoeda(progresso.custoUsd, 'USD')}
          </>
        )}
      </p>
    </div>
  );
}

/** Campo de cidade com sugestoes vindas da Geocoding API. */
function CampoLocal({
  local,
  aoEscolher,
  desabilitado,
}: {
  local: LocalGeocodificado | null;
  aoEscolher: (local: LocalGeocodificado | null) => void;
  desabilitado: boolean;
}) {
  const [texto, setTexto] = useState(local?.label ?? '');
  const [sugestoes, setSugestoes] = useState<LocalGeocodificado[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const consulta = useDebounce(texto, 400);
  useFecharFora(aberto, () => setAberto(false), caixa);

  // Quando o local ja esta escolhido e o texto bate, nao ha o que sugerir. Isto e
  // derivado na renderizacao em vez de limpado dentro do efeito: efeito que
  // chama setState de forma sincrona provoca renderizacao em cascata.
  const consultaValida = Boolean(consulta && consulta.length >= 3 && consulta !== local?.label);
  const sugestoesVisiveis = consultaValida ? sugestoes : [];

  useEffect(() => {
    if (!consultaValida) return;

    const controle = new AbortController();

    fetch(`/api/geocode?q=${encodeURIComponent(consulta)}`, { signal: controle.signal })
      .then(async (r) => {
        const dados = await r.json();
        if (!r.ok) throw new Error(dados.erro ?? 'Falha ao localizar');
        return dados;
      })
      .then((dados: { locais: LocalGeocodificado[] }) => {
        // O erro anterior e limpo aqui, na resposta, e nao no corpo do efeito.
        setErro(null);
        setSugestoes(dados.locais);
        setAberto(dados.locais.length > 0);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        setErro(e instanceof Error ? e.message : 'Falha ao localizar');
      })
      .finally(() => setCarregando(false));

    return () => controle.abort();
  }, [consulta, consultaValida]);

  const escolher = (sugestao: LocalGeocodificado) => {
    setTexto(sugestao.label);
    setSugestoes([]);
    setAberto(false);
    aoEscolher(sugestao);
  };

  return (
    <div ref={caixa} className="relative">
      <label htmlFor="local" className="sr-only">
        Cidade ou regiao
      </label>
      <div className="relative">
        <IconeLocal className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" />
        <input
          id="local"
          type="text"
          value={texto}
          disabled={desabilitado}
          placeholder="Cidade, bairro ou endereco…"
          autoComplete="off"
          onChange={(e) => {
            setTexto(e.target.value);
            // O indicador de carregando e ligado aqui, no evento, e desligado
            // quando a resposta chega. Ligar dentro do efeito seria setState
            // sincrono em efeito.
            if (e.target.value.trim().length >= 3) setCarregando(true);
            if (local) aoEscolher(null);
          }}
          onFocus={() => sugestoesVisiveis.length > 0 && setAberto(true)}
          className="w-full rounded-lg border border-borda-campo bg-superficie py-2 pl-8 pr-8 text-sm text-texto placeholder:text-texto-fraco disabled:opacity-60"
        />
        {carregando && (
          <IconeCarregando className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" />
        )}
      </div>

      {erro && <p className="mt-1 text-[0.6875rem] text-red-600 dark:text-red-400">{erro}</p>}

      {aberto && sugestoesVisiveis.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-borda bg-superficie py-1 shadow-[var(--sombra-flutuante)]">
          {sugestoesVisiveis.map((s) => (
            <li key={`${s.lat},${s.lng}`}>
              <button
                type="button"
                onClick={() => escolher(s)}
                className="block w-full px-2.5 py-1.5 text-left text-xs text-texto transition-colors hover:bg-superficie-3"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
