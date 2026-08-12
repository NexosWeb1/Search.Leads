/**
 * Registro das varreduras.
 *
 * Guardar requisicoes e custo por varredura nao e enfeite: e o que permite
 * conferir o gasto contra o console do Google Cloud e descobrir que uma busca
 * saiu caro antes de a fatura chegar.
 */

import { randomUUID } from 'node:crypto';
import { db, agora } from './index';

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
  const cliente = await db();
  const id = randomUUID();

  await cliente.execute({
    sql: `INSERT INTO searches (
            id, nicho_id, nicho_label, local_label, centro_lat, centro_lng,
            raio_km, status, celulas_total, criada_em
          ) VALUES (?,?,?,?,?,?,?,'rodando',?,?)`,
    args: [
      id, dados.nichoId, dados.nichoLabel, dados.localLabel,
      dados.centroLat, dados.centroLng, dados.raioKm,
      dados.celulasTotal, agora(),
    ],
  });

  return id;
}

export interface ProgressoBusca {
  celulasTotal?: number;
  celulasFeitas?: number;
  celulasSaturadas?: number;
  requisicoes?: number;
  custoUsd?: number;
}

const COLUNAS_PROGRESSO: Record<keyof ProgressoBusca, string> = {
  celulasTotal: 'celulas_total',
  celulasFeitas: 'celulas_feitas',
  celulasSaturadas: 'celulas_saturadas',
  requisicoes: 'requisicoes',
  custoUsd: 'custo_usd',
};

export async function atualizarProgresso(
  id: string,
  progresso: ProgressoBusca,
): Promise<void> {
  const entradas = Object.entries(progresso).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return;

  const cliente = await db();
  const sets = entradas.map(
    ([chave]) => `${COLUNAS_PROGRESSO[chave as keyof ProgressoBusca]} = ?`,
  );

  await cliente.execute({
    sql: `UPDATE searches SET ${sets.join(', ')} WHERE id = ?`,
    args: [...entradas.map(([, v]) => v as number), id],
  });
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
  const cliente = await db();
  await cliente.execute({
    sql: `UPDATE searches SET
            status = ?, erro = ?, total_no_raio = ?, total_sem_site = ?,
            requisicoes = ?, custo_usd = ?, celulas_feitas = ?,
            celulas_saturadas = ?, concluida_em = ?
          WHERE id = ?`,
    args: [
      dados.status,
      dados.erro ?? null,
      dados.totalNoRaio ?? 0,
      dados.totalSemSite ?? 0,
      dados.requisicoes ?? 0,
      dados.custoUsd ?? 0,
      dados.celulasFeitas ?? 0,
      dados.celulasSaturadas ?? 0,
      agora(),
      id,
    ],
  });
}

function paraBusca(linha: Record<string, unknown>): Busca {
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
    criadaEm: String(linha.criada_em),
    concluidaEm: linha.concluida_em ? String(linha.concluida_em) : null,
  };
}

export async function listarBuscas(limite = 30): Promise<Busca[]> {
  const cliente = await db();
  const { rows } = await cliente.execute({
    sql: `SELECT * FROM searches ORDER BY criada_em DESC LIMIT ?`,
    args: [limite],
  });
  return rows.map((r) => paraBusca(r as unknown as Record<string, unknown>));
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
  const cliente = await db();
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();

  const { rows } = await cliente.execute({
    sql: `SELECT COALESCE(SUM(requisicoes), 0) AS req, COUNT(*) AS n
          FROM searches WHERE criada_em >= ?`,
    args: [inicio],
  });

  const requisicoes = Number(rows[0]?.req ?? 0);
  const excedente = Math.max(0, requisicoes - COTA_GRATIS_MES);

  return {
    requisicoes,
    cotaGratis: COTA_GRATIS_MES,
    restantes: Math.max(0, COTA_GRATIS_MES - requisicoes),
    custoAcimaDaCotaUsd: (excedente * 35) / 1000,
    buscas: Number(rows[0]?.n ?? 0),
    mes: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`,
  };
}

export async function obterBusca(id: string): Promise<Busca | null> {
  const cliente = await db();
  const { rows } = await cliente.execute({
    sql: `SELECT * FROM searches WHERE id = ?`,
    args: [id],
  });
  const linha = rows[0];
  return linha ? paraBusca(linha as unknown as Record<string, unknown>) : null;
}
