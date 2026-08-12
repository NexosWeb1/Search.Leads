'use client';

import { formatarNumero, formatarPorcentagem } from '@/lib/formato';
import { IconeAlerta, IconeCheck, IconeFechar } from '@/components/icones';

/**
 * Pecas do painel.
 *
 * Decisoes de visualizacao que valem registro, porque foram medidas e nao
 * escolhidas por gosto:
 *
 * 1. Cada grafico usa UMA cor. As barras comparam magnitude, e magnitude se le no
 *    comprimento; pintar cada categoria de uma cor diferente nao acrescenta
 *    informacao e enterra o dado que importa.
 *
 * 2. Verde e vermelho jamais carregam sentido sozinhos. Medido em OKLab, o verde
 *    de sucesso e o vermelho de perda ficam a uma distancia de 4,2 sob
 *    deuteranopia no tema claro e 1,1 no escuro: quem tem daltonismo
 *    vermelho-verde nao distingue os dois. Por isso todo bloco de resultado leva
 *    icone e rotulo, e "deu certo" e "deu errado" ficam em cartoes separados com
 *    titulo, nunca como duas fatias da mesma barra.
 *
 * 3. Todo valor aparece escrito ao lado da barra. Alem de ser mais facil de ler,
 *    e o que sustenta as cores de contraste mais baixo no tema claro.
 */

export function Cartao({
  titulo,
  descricao,
  children,
  className = '',
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-borda bg-superficie p-4 shadow-[var(--sombra-cartao)] ${className}`}
    >
      <h3 className="text-sm font-semibold text-texto">{titulo}</h3>
      {descricao && <p className="mt-0.5 text-xs text-texto-fraco">{descricao}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Numero de destaque. Figuras proporcionais, porque nao alinha em coluna. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  tom?: 'neutro' | 'bom' | 'ruim' | 'atencao';
}) {
  const cor =
    tom === 'bom'
      ? 'text-marca-700 dark:text-marca-400'
      : tom === 'ruim'
        ? 'text-red-700 dark:text-red-400'
        : tom === 'atencao'
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-texto';

  return (
    <div className="rounded-xl border border-borda bg-superficie p-3 shadow-[var(--sombra-cartao)]">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-texto-fraco">
        {rotulo}
      </p>
      <p className={`mt-1 text-2xl font-semibold leading-none ${cor}`}>
        {typeof valor === 'number' ? formatarNumero(valor) : valor}
      </p>
      {detalhe && <p className="mt-1 text-[0.6875rem] text-texto-suave">{detalhe}</p>}
    </div>
  );
}

export interface ItemBarra {
  chave: string;
  rotulo: string;
  total: number;
  /** Texto extra a direita, por exemplo a taxa. */
  extra?: string;
}

/**
 * Barras horizontais de magnitude, uma cor so.
 * O valor vem escrito sempre, o que dispensa o leitor de estimar comprimento.
 */
export function BarrasMagnitude({
  itens,
  tom = 'marca',
  vazio = 'Nada aqui ainda.',
}: {
  itens: ItemBarra[];
  tom?: 'marca' | 'perda' | 'tecnica';
  vazio?: string;
}) {
  if (itens.length === 0) {
    return <p className="text-xs text-texto-fraco">{vazio}</p>;
  }

  const maximo = Math.max(...itens.map((i) => i.total), 1);
  const soma = itens.reduce((acc, i) => acc + i.total, 0);

  // Cada tom tem um passo proprio no tema escuro, escolhido para a superficie
  // escura, e nao um clareamento automatico do tom claro.
  const preenchimento =
    tom === 'perda'
      ? 'bg-dado-perda'
      : tom === 'tecnica'
        ? 'bg-dado-tecnica'
        : 'bg-marca-600 dark:bg-marca-500';

  return (
    <ul className="space-y-2">
      {itens.map((item) => (
        <li key={item.chave}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-texto-suave">{item.rotulo}</span>
            <span className="shrink-0 tabular-nums text-texto">
              {formatarNumero(item.total)}
              {item.extra && (
                <span className="ml-1.5 text-texto-fraco">{item.extra}</span>
              )}
              {!item.extra && soma > 0 && (
                <span className="ml-1.5 text-texto-fraco">
                  {formatarPorcentagem(item.total, soma)}
                </span>
              )}
            </span>
          </div>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-superficie-3"
            role="img"
            aria-label={`${item.rotulo}: ${item.total}`}
          >
            <div
              className={`h-full rounded-r-[4px] ${preenchimento}`}
              style={{ width: `${Math.max(2, (item.total / maximo) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface EtapaFunil {
  rotulo: string;
  total: number;
  dica: string;
}

/**
 * Funil.
 *
 * As etapas nao ganham rampa de cor: a posicao e o rotulo ja dizem qual etapa e,
 * e o comprimento ja diz a magnitude. Uma rampa seria codificar a mesma coisa
 * duas vezes. O que o leitor precisa ver e onde as pessoas somem, e isso esta na
 * queda em porcentagem entre uma etapa e a seguinte.
 */
export function Funil({ etapas }: { etapas: EtapaFunil[] }) {
  const topo = Math.max(etapas[0]?.total ?? 0, 1);

  return (
    <ol className="space-y-1">
      {etapas.map((etapa, i) => {
        const anterior = i > 0 ? etapas[i - 1].total : null;
        const passagem =
          anterior && anterior > 0 ? Math.round((etapa.total / anterior) * 100) : null;

        return (
          <li key={etapa.rotulo}>
            {i > 0 && (
              <p className="py-0.5 pl-1 text-[0.625rem] text-texto-fraco">
                {passagem === null ? (
                  '—'
                ) : (
                  <>
                    {passagem}% seguiram
                    {anterior !== null && etapa.total < anterior && (
                      <span className="ml-1">
                        ({formatarNumero(anterior - etapa.total)} pararam aqui)
                      </span>
                    )}
                  </>
                )}
              </p>
            )}

            <div className="flex items-center gap-2" title={etapa.dica}>
              <span className="w-32 shrink-0 truncate text-xs text-texto-suave">
                {etapa.rotulo}
              </span>
              <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-superficie-3">
                <div
                  className="flex h-full items-center justify-end rounded-r-[4px] bg-marca-600 px-1.5 dark:bg-marca-500"
                  style={{ width: `${Math.max(3, (etapa.total / topo) * 100)}%` }}
                >
                  <span className="text-[0.6875rem] font-semibold tabular-nums text-white">
                    {formatarNumero(etapa.total)}
                  </span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Cabecalho de bloco de resultado. O icone e o rotulo carregam o sentido, nao a cor. */
export function SeloResultado({
  tipo,
  children,
}: {
  tipo: 'bom' | 'ruim' | 'atencao';
  children: React.ReactNode;
}) {
  const config = {
    bom: {
      Icone: IconeCheck,
      classe: 'text-marca-700 dark:text-marca-400',
    },
    ruim: {
      Icone: IconeFechar,
      classe: 'text-red-700 dark:text-red-400',
    },
    atencao: {
      Icone: IconeAlerta,
      classe: 'text-amber-700 dark:text-amber-400',
    },
  }[tipo];

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${config.classe}`}>
      <config.Icone className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

/** Medidor de uma razao contra um limite. */
export function Medidor({
  rotulo,
  valor,
  limite,
  aviso,
}: {
  rotulo: string;
  valor: number;
  limite: number;
  aviso?: string;
}) {
  const proporcao = Math.min(1, valor / Math.max(limite, 1));
  const perto = valor >= limite * 0.8;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-texto-suave">{rotulo}</span>
        <span className="tabular-nums text-texto">
          {formatarNumero(valor)}
          <span className="text-texto-fraco"> / {formatarNumero(limite)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie-3">
        <div
          className={`h-full rounded-r-[4px] ${
            perto ? 'bg-dado-tecnica' : 'bg-marca-600 dark:bg-marca-500'
          }`}
          style={{ width: `${proporcao * 100}%` }}
        />
      </div>
      {perto && aviso && (
        <p className="mt-1 text-[0.6875rem] text-amber-700 dark:text-amber-400">{aviso}</p>
      )}
    </div>
  );
}
