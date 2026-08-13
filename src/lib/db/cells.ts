/**
 * Cache de celula.
 *
 * Sem isso, repetir a mesma busca duas vezes no mesmo dia paga duas vezes pela
 * mesma resposta. Como cada requisicao custa cerca de 3,5 centavos de dolar e a
 * cota gratuita e de mil por mes, isso e dinheiro de verdade.
 *
 * O cache guarda apenas os place ids devolvidos. Um acerto reconstroi a lista
 * lendo a tabela `leads`, que e onde os dados de verdade estao. O TTL de 30 dias
 * nao e escolha de performance: e o prazo maximo que os Termos do Google
 * permitem manter conteudo de Places em cache.
 */

import { createHash } from 'node:crypto';
import { db } from './index';
import type { Celula } from '../search/grid';

export const TTL_CACHE_DIAS = 30;

/**
 * A chave inclui o nicho porque a mesma coordenada consultada com types
 * diferentes devolve conjuntos diferentes. Arredondar em 5 casas decimais
 * (cerca de 1 metro) garante que a grade regenerada bata com a anterior.
 */
export function chaveCelula(celula: Celula, types: readonly string[]): string {
  const bruto = [
    celula.centro.lat.toFixed(5),
    celula.centro.lng.toFixed(5),
    Math.round(celula.raioM),
    [...types].sort().join(','),
  ].join('|');
  return createHash('sha1').update(bruto).digest('hex').slice(0, 20);
}

export interface CelulaCacheada {
  placeIds: string[];
  saturada: boolean;
}

/** Devolve null quando nao ha cache valido e a celula precisa ir para a API. */
export async function lerCache(chave: string): Promise<CelulaCacheada | null> {
  const sql = await db();

  const [linha] = await sql<{ place_ids: unknown; saturada: boolean }[]>`
    SELECT place_ids, saturada FROM cell_cache
    WHERE chave = ${chave}
      AND consultada_em >= now() - ${`${TTL_CACHE_DIAS} days`}::interval
  `;

  if (!linha) return null;

  // place_ids e jsonb: o driver ja entrega como array.
  const placeIds = Array.isArray(linha.place_ids) ? (linha.place_ids as string[]) : [];
  return { placeIds, saturada: Boolean(linha.saturada) };
}

export async function gravarCache(
  chave: string,
  placeIds: string[],
  saturada: boolean,
): Promise<void> {
  const sql = await db();

  await sql`
    INSERT INTO cell_cache (chave, resultados, saturada, place_ids, consultada_em)
    VALUES (${chave}, ${placeIds.length}, ${saturada}, ${JSON.stringify(placeIds)}::jsonb, now())
    ON CONFLICT (chave) DO UPDATE SET
      resultados = excluded.resultados,
      saturada = excluded.saturada,
      place_ids = excluded.place_ids,
      consultada_em = excluded.consultada_em
  `;
}

/**
 * Remove cache vencido. Chamado no inicio de cada varredura para a tabela nao
 * crescer sem limite e para nao servir dado fora do prazo dos Termos.
 */
export async function limparCacheVencido(): Promise<number> {
  const sql = await db();
  const removidas = await sql`
    DELETE FROM cell_cache
    WHERE consultada_em < now() - ${`${TTL_CACHE_DIAS} days`}::interval
  `;
  return removidas.count ?? 0;
}
