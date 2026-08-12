/**
 * Orquestrador da varredura.
 *
 * Roda em ondas por nivel de subdivisao, e nao numa fila unica. Sao no maximo
 * tres ondas (grade inicial mais duas subdivisoes), e a barreira entre elas
 * simplifica muito o controle: em cada onda sabemos exatamente quantas celulas
 * existem, o progresso na tela fica honesto, e a decisao de subdividir enxerga o
 * resultado completo do nivel anterior.
 */

import { comLimite } from '../async';
import { haversineMeters, clamp, type LatLng } from '../geo';
import {
  buscarCelula,
  estimarCustoUsd,
  OrcamentoBusca,
  PlacesError,
  type PlaceBruto,
} from '../places/client';
import {
  escolherRaioCelula,
  estimarCelulas,
  gerarGrade,
  subdividir,
  RAIO_BUSCA_MAX_M,
  type Celula,
} from './grid';
import { normalizarPlace, type LeadNormalizado } from '../leads/mapear';
import { chaveCelula, gravarCache, lerCache, limparCacheVencido } from '../db/cells';
import { salvarLeads, vincularLeadsExistentes } from '../db/leads';
import { atualizarProgresso, criarBusca, finalizarBusca } from '../db/searches';
import type { Nicho } from '../niches';

export const PROFUNDIDADE_MAX_PADRAO = 2;
export const CONCORRENCIA_PADRAO = 6;

export interface OpcoesVarredura {
  centro: LatLng;
  raioKm: number;
  nicho: Nicho;
  localLabel: string;
  /** Teto de requisicoes. Sem isso uma area muito densa consome a cota do mes. */
  maxRequisicoes?: number;
  concorrencia?: number;
  profundidadeMax?: number;
  usarCache?: boolean;
  aoProgredir?: (p: ProgressoVarredura) => void;
  sinal?: AbortSignal;
}

export interface ProgressoVarredura {
  searchId: string;
  fase: 'preparando' | 'varrendo' | 'salvando' | 'concluida' | 'erro';
  nivel: number;
  celulasTotal: number;
  celulasFeitas: number;
  celulasSaturadas: number;
  celulasEmCache: number;
  encontrados: number;
  requisicoes: number;
  custoUsd: number;
}

export interface ResultadoVarredura {
  searchId: string;
  totalNoRaio: number;
  totalSemSite: number;
  requisicoes: number;
  celulasEmCache: number;
  custoUsd: number;
  celulasSaturadas: number;
  celulasComErro: number;
  /**
   * Tudo o que limitou a varredura fica aqui e vai para a tela. Uma ferramenta
   * que corta cobertura em silencio faz voce acreditar que varreu a cidade
   * inteira quando nao varreu.
   */
  avisos: string[];
}

/** Estimativa mostrada antes de confirmar a busca, para nao gastar as cegas. */
export function estimarVarredura(raioKm: number, alvoCelulas?: number) {
  const raioM = clamp(raioKm * 1000, 500, RAIO_BUSCA_MAX_M);
  const raioCelulaM = escolherRaioCelula(raioM, alvoCelulas);
  const celulas = estimarCelulas(raioM, raioCelulaM);
  return {
    raioCelulaM,
    celulas,
    custoMinimoUsd: estimarCustoUsd(celulas),
    // Se toda celula saturar e for subdividida uma vez, cada uma custa 1 + 7.
    custoMaximoUsd: estimarCustoUsd(celulas * 8),
  };
}

export async function varrer(opcoes: OpcoesVarredura): Promise<ResultadoVarredura> {
  const {
    centro,
    nicho,
    localLabel,
    concorrencia = CONCORRENCIA_PADRAO,
    profundidadeMax = PROFUNDIDADE_MAX_PADRAO,
    usarCache = true,
    aoProgredir,
    sinal,
  } = opcoes;

  const raioM = clamp(opcoes.raioKm * 1000, 500, RAIO_BUSCA_MAX_M);
  const raioCelulaM = escolherRaioCelula(raioM);
  const grade = gerarGrade(centro, raioM, raioCelulaM);

  // Teto padrao: tres vezes a grade inicial. Cabe subdividir cerca de um terco
  // das celulas, o que cobre area urbana densa sem risco de estourar a cota.
  const maxRequisicoes = opcoes.maxRequisicoes ?? Math.min(600, grade.length * 3);
  const orcamento = new OrcamentoBusca(maxRequisicoes);

  await limparCacheVencido();

  const searchId = await criarBusca({
    nichoId: nicho.id,
    nichoLabel: nicho.label,
    localLabel,
    centroLat: centro.lat,
    centroLng: centro.lng,
    raioKm: opcoes.raioKm,
    celulasTotal: grade.length,
  });

  const avisos: string[] = [];
  const brutos = new Map<string, PlaceBruto>();
  const idsSomenteCache = new Set<string>();

  let celulasFeitas = 0;
  let celulasTotal = grade.length;
  let celulasSaturadas = 0;
  let celulasEmCache = 0;
  let celulasComErro = 0;
  let orcamentoEstourou = false;

  const emitir = (fase: ProgressoVarredura['fase'], nivel: number) => {
    aoProgredir?.({
      searchId,
      fase,
      nivel,
      celulasTotal,
      celulasFeitas,
      celulasSaturadas,
      celulasEmCache,
      encontrados: brutos.size + idsSomenteCache.size,
      requisicoes: orcamento.requisicoes,
      custoUsd: orcamento.custoEstimadoUsd,
    });
  };

  emitir('preparando', 0);

  try {
    let onda: Celula[] = grade;

    for (let nivel = 0; nivel <= profundidadeMax && onda.length > 0; nivel++) {
      if (sinal?.aborted) throw new Error('Varredura cancelada');

      const saturadas: Celula[] = [];

      await comLimite(onda, concorrencia, async (celula) => {
        if (sinal?.aborted || orcamento.estourou) return;

        const chave = chaveCelula(celula, nicho.types);

        if (usarCache) {
          const cacheada = await lerCache(chave);
          if (cacheada) {
            celulasEmCache += 1;
            celulasFeitas += 1;
            for (const id of cacheada.placeIds) {
              if (!brutos.has(id)) idsSomenteCache.add(id);
            }
            if (cacheada.saturada) {
              celulasSaturadas += 1;
              saturadas.push(celula);
            }
            emitir('varrendo', nivel);
            return;
          }
        }

        try {
          const { places, saturada } = await buscarCelula(
            celula,
            nicho.types,
            orcamento,
            sinal,
          );

          for (const place of places) {
            if (place.id) {
              brutos.set(place.id, place);
              idsSomenteCache.delete(place.id);
            }
          }

          await gravarCache(
            chave,
            places.map((p) => p.id).filter(Boolean),
            saturada,
          );

          if (saturada) {
            celulasSaturadas += 1;
            saturadas.push(celula);
          }
        } catch (erro) {
          if (erro instanceof PlacesError && erro.status === 429 && orcamento.estourou) {
            orcamentoEstourou = true;
          } else {
            celulasComErro += 1;
            if (erro instanceof PlacesError && erro.fatal) throw erro;
          }
        } finally {
          celulasFeitas += 1;
          emitir('varrendo', nivel);
        }
      });

      await atualizarProgresso(searchId, {
        celulasFeitas,
        celulasSaturadas,
        requisicoes: orcamento.requisicoes,
        custoUsd: orcamento.custoEstimadoUsd,
      });

      if (orcamento.estourou) {
        orcamentoEstourou = true;
        break;
      }

      if (nivel === profundidadeMax) {
        if (saturadas.length > 0) {
          avisos.push(
            `${saturadas.length} celulas ainda estavam cheias no ultimo nivel de subdivisao. ` +
              `Pode haver comercio nao listado nessas areas. Reduza o raio para varrer com mais detalhe.`,
          );
        }
        break;
      }

      onda = saturadas.flatMap(subdividir);
      celulasTotal += onda.length;
      await atualizarProgresso(searchId, { celulasTotal });
    }

    if (orcamentoEstourou) {
      avisos.push(
        `Teto de ${maxRequisicoes} requisicoes atingido, a varredura parou antes de cobrir tudo. ` +
          `Aumente o teto ou reduza o raio.`,
      );
    }
    if (celulasComErro > 0) {
      avisos.push(`${celulasComErro} celulas falharam apos as retentativas e foram puladas.`);
    }

    // Monta o resultado. Os leads vindos da API sao normalizados e gravados; os
    // que vieram do cache ja estao no banco e so precisam ser vinculados.
    emitir('salvando', profundidadeMax);

    const paraSalvar: Array<{ lead: LeadNormalizado; distanciaM: number }> = [];
    let semSite = 0;

    for (const place of brutos.values()) {
      const lead = normalizarPlace(place);
      if (!lead) continue;

      // O circulo desenhado no mapa passa a valer de verdade aqui: as celulas
      // ultrapassam a borda de proposito, para nao abrir buraco na cobertura.
      const distanciaM = haversineMeters(centro, { lat: lead.lat, lng: lead.lng });
      if (distanciaM > raioM) continue;

      paraSalvar.push({ lead, distanciaM });
      if (!lead.site.temSiteReal) semSite += 1;
    }

    await salvarLeads(searchId, paraSalvar);

    const vinculadosDoCache = await vincularLeadsExistentes(
      searchId,
      [...idsSomenteCache],
      centro,
      raioM,
    );

    const totalNoRaio = paraSalvar.length + vinculadosDoCache;

    if (celulasEmCache > 0) {
      avisos.push(
        `${celulasEmCache} de ${celulasFeitas} celulas vieram do cache e nao custaram requisicao.`,
      );
    }

    await finalizarBusca(searchId, {
      status: 'concluida',
      totalNoRaio,
      totalSemSite: semSite,
      requisicoes: orcamento.requisicoes,
      custoUsd: orcamento.custoEstimadoUsd,
      celulasFeitas,
      celulasSaturadas,
    });

    emitir('concluida', profundidadeMax);

    return {
      searchId,
      totalNoRaio,
      totalSemSite: semSite,
      requisicoes: orcamento.requisicoes,
      celulasEmCache,
      custoUsd: orcamento.custoEstimadoUsd,
      celulasSaturadas,
      celulasComErro,
      avisos,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await finalizarBusca(searchId, {
      status: sinal?.aborted ? 'cancelada' : 'erro',
      erro: mensagem,
      requisicoes: orcamento.requisicoes,
      custoUsd: orcamento.custoEstimadoUsd,
      celulasFeitas,
      celulasSaturadas,
    });
    emitir('erro', 0);
    throw erro;
  }
}
