/**
 * Registro das varreduras.
 *
 * Guardar requisicoes e custo por varredura nao e enfeite: e o que permite
 * conferir o gasto contra o console do Google Cloud e descobrir que uma busca
 * saiu caro antes de a fatura chegar.
 */

import { randomUUID } from 'node:crypto';
import type { Row } from 'postgres';
import { db } from './index';

export type StatusBusca = 'rodando' | 'concluida' | 'erro' | 'cancelada';

export interface Busca {
  id: string;
  nichoId: string;
  nichoLabel: string;
  localLabel: string;
  centroLat: number;
  centroLng: number;
  raioKm: number;
  status: StatusBusca;
  erro: string | null;
  celulasTotal: number;
  celulasFeitas: number;
  celulasSaturadas: number;
  requisicoes: number;
  custoUsd: number;
  totalNoRaio: number;
  totalSemSite: number;
  criadaEm: string;
  concluidaEm: string | null;
}

export interface NovaBusca {
  nichoId: string;
  nichoLabel: string;
  localLabel: string;
  centroLat: number;
  centroLng: number;
  raioKm: number;
  celulasTotal: number;
}

export async function criarBusca(dados: NovaBusca): Promise<string> {
  const sql = await db();
  const id = randomUUID();

  await sql`
    INSERT INTO searches (
      id, nicho_id, nicho_label, local_label, centro_lat, centro_lng,
      raio_km, status, celulas_total
    ) VALUES (
      ${id}, ${dados.nichoId}, ${dados.nichoLabel}, ${dados.localLabel},
      ${dados.centroLat}, ${dados.centroLng}, ${dados.raioKm}, 'rodando',
      ${dados.celulasTotal}
    )
  `;

  return id;
}

export interface ProgressoBusca {
  celulasTotal?: number;
  celulasFeitas?: number;
  celulasSaturadas?: number;
  requisicoes?: number;
  custoUsd?: number;
}

export async function atualizarProgresso(
  id: string,
  progresso: ProgressoBusca,
): Promise<void> {
  const sql = await db();

  /*
   * COALESCE em vez de montar a lista de colunas dinamicamente: um unico
   * comando cobre qualquer combinacao de campos, e o que vier indefinido
   * simplesmente mantem o valor atual.
   */
  await sql`
    UPDATE searches SET
      celulas_total = COALESCE(${progresso.celulasTotal ?? null}, celulas_total),
      celulas_feitas = COALESCE(${progresso.celulasFeitas ?? null}, celulas_feitas),
      celulas_saturadas = COALESCE(${progresso.celulasSaturadas ?? null}, celulas_saturadas),
      requisicoes = COALESCE(${progresso.requisicoes ?? null}, requisicoes),
      custo_usd = COALESCE(${progresso.custoUsd ?? null}, custo_usd)
    WHERE id = ${id}
  `;
}

export async function finalizarBusca(
  id: string,
  dados: {
    status: StatusBusca;
    erro?: string | null;
    totalNoRaio?: number;
    totalSemSite?: number;
    requisicoes?: number;
    custoUsd?: number;
    celulasFeitas?: number;
    celulasSaturadas?: number;
  },
): Promise<void> {
  const sql = await db();

  await sql`
    UPDATE searches SET
      status = ${dados.status},
      erro = ${dados.erro ?? null},
      total_no_raio = ${dados.totalNoRaio ?? 0},
      total_sem_site = ${dados.totalSemSite ?? 0},
      requisicoes = ${dados.requisicoes ?? 0},
      custo_usd = ${dados.custoUsd ?? 0},
      celulas_feitas = ${dados.celulasFeitas ?? 0},
      celulas_saturadas = ${dados.celulasSaturadas ?? 0},
      concluida_em = now()
    WHERE id = ${id}
  `;
}

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v ?? '');

function paraBusca(linha: Row): Busca {
  return {
    id: String(linha.id),
    nichoId: String(linha.nicho_id),
    nichoLabel: String(linha.nicho_label),
    localLabel: String(linha.local_label),
    centroLat: Number(linha.centro_lat),
    centroLng: Number(linha.centro_lng),
    raioKm: Number(linha.raio_km),
    status: String(linha.status) as StatusBusca,
    erro: linha.erro ? String(linha.erro) : null,
    celulasTotal: Number(linha.celulas_total ?? 0),
    celulasFeitas: Number(linha.celulas_feitas ?? 0),
    celulasSaturadas: Number(linha.celulas_saturadas ?? 0),
    requisicoes: Number(linha.requisicoes ?? 0),
    custoUsd: Number(linha.custo_usd ?? 0),
    totalNoRaio: Number(linha.total_no_raio ?? 0),
    totalSemSite: Number(linha.total_sem_site ?? 0),
    criadaEm: iso(linha.criada_em),
    concluidaEm: linha.concluida_em ? iso(linha.concluida_em) : null,
  };
}

export async function listarBuscas(limite = 30): Promise<Busca[]> {
  const sql = await db();
  const linhas = await sql`
    SELECT * FROM searches ORDER BY criada_em DESC LIMIT ${limite}
  `;
  return linhas.map(paraBusca);
}

export async function obterBusca(id: string): Promise<Busca | null> {
  const sql = await db();
  const [linha] = await sql`SELECT * FROM searches WHERE id = ${id}`;
  return linha ? paraBusca(linha) : null;
}

/** Cota gratuita mensal da SKU Enterprise, que e a faixa usada pela varredura. */
export const COTA_GRATIS_MES = 1_000;

export interface ConsumoDoMes {
  requisicoes: number;
  cotaGratis: number;
  restantes: number;
  /** Quanto custaria o que passou da cota, em dolares. */
  custoAcimaDaCotaUsd: number;
  buscas: number;
  /** Mes de referencia, no formato AAAA-MM. */
  mes: string;
}

/**
 * Quanto da cota gratuita ja foi consumido neste mes.
 *
 * Existe para voce nao precisar abrir o console do Google para saber se pode
 * rodar mais uma busca. O numero sai das proprias varreduras registradas, que
 * gravam quantas requisicoes gastaram, entao bate com o que o Google contou.
 *
 * Fica proximo mas nao identico ao console em dois casos: buscas canceladas no
 * meio, e requisicoes que falharam depois das retentativas. Nos dois o Google
 * pode ter contabilizado algo que nao chegou a virar lead.
 */
export async function consumoDoMes(): Promise<ConsumoDoMes> {
  const sql = await db();

  const [linha] = await sql<{ req: string; n: string }[]>`
    SELECT COALESCE(SUM(requisicoes), 0) AS req, COUNT(*) AS n
    FROM searches
    WHERE criada_em >= date_trunc('month', now())
  `;

  const requisicoes = Number(linha?.req ?? 0);
  const excedente = Math.max(0, requisicoes - COTA_GRATIS_MES);
  const agora = new Date();

  return {
    requisicoes,
    cotaGratis: COTA_GRATIS_MES,
    restantes: Math.max(0, COTA_GRATIS_MES - requisicoes),
    custoAcimaDaCotaUsd: (excedente * 35) / 1000,
    buscas: Number(linha?.n ?? 0),
    mes: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`,
  };
}
