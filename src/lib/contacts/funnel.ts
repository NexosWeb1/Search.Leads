/**
 * Agregacao do painel de resultados.
 *
 * A regra que organiza este arquivo: os dois tipos de fracasso nunca se somam.
 *
 * - Falha tecnica (numero invalido, sem WhatsApp, pulado) e problema de dado.
 *   Sai de `contact_log` e e recuperavel: depois do enriquecimento esses leads
 *   voltam para a fila.
 * - Falha comercial (perdido, com motivo) e problema de proposta ou de perfil.
 *   Sai de `lead_crm`.
 *
 * Se os dois entrassem no mesmo numero, uma lista com telefones ruins pareceria
 * uma abordagem ruim, e voce reescreveria a mensagem quando o problema era o
 * cadastro.
 */

import { db } from '../db/index';
import { COOLDOWN_PADRAO, STATUS_FORA_DA_FILA } from './cooldown';
import { MOTIVOS_PERDA, ROTULO_ENTREGA, ROTULO_MOTIVO_PERDA } from '../db/schema';

export interface FiltroPainel {
  /** Limita a um conjunto de leads de uma varredura. */
  searchId?: string | null;
  /** Dias para tras a considerar nos numeros de periodo. */
  dias?: number;
}

export interface Funil {
  encontrados: number;
  semSite: number;
  comWhatsapp: number;
  enviados: number;
  responderam: number;
  negociando: number;
  fechados: number;
  perdidos: number;
}

export interface Contagem {
  chave: string;
  rotulo: string;
  total: number;
}

export interface DesempenhoTemplate {
  templateId: string;
  nome: string;
  enviados: number;
  responderam: number;
  taxa: number;
}

export interface DesempenhoNicho {
  nicho: string;
  encontrados: number;
  semSite: number;
  contatados: number;
  fechados: number;
}

export interface Resultados {
  funil: Funil;
  faixas: Contagem[];
  perdas: Contagem[];
  falhasTecnicas: Contagem[];
  recuperaveis: number;
  ritmo: { hoje: number; semana: number; mes: number; limiteDiario: number };
  templates: DesempenhoTemplate[];
  nichos: DesempenhoNicho[];
  valorFechado: number;
  tempoMedioRespostaDias: number | null;
  tentativasMediasAteFechar: number | null;
  prontosParaFollowUp: number;
  periodoDias: number;
}

const ROTULO_FAIXA_LOCAL: Record<string, string> = {
  muito_bom: 'Muito bom',
  bom: 'Bom',
  intermediario: 'Intermediario',
  ruim: 'Ruim',
};

export async function montarResultados(filtro: FiltroPainel = {}): Promise<Resultados> {
  const sql = await db();
  const dias = filtro.dias ?? 90;
  const searchId = filtro.searchId ?? null;

  /*
   * Recorte de leads. Quando ha searchId, tudo passa a olhar apenas os leads
   * daquela varredura. O `${searchId} IS NULL OR` deixa o mesmo fragmento servir
   * aos dois casos sem montar SQL diferente.
   */
  const recorteLead = sql`(
    ${searchId}::uuid IS NULL
    OR l.place_id IN (SELECT place_id FROM search_leads WHERE search_id = ${searchId}::uuid)
  )`;

  const recorteCrm = sql`(
    ${searchId}::uuid IS NULL
    OR c.place_id IN (SELECT place_id FROM search_leads WHERE search_id = ${searchId}::uuid)
  )`;

  const desde = sql`now() - ${`${dias} days`}::interval`;
  const bloqueados = [...STATUS_FORA_DA_FILA];

  const [
    [contagensLead],
    [contagensCrm],
    [enviadosLinha],
    [recuperaveisLinha],
    [prontosLinha],
    [ritmoLinha],
    faixasBrutas,
    perdasBrutas,
    tecnicasBrutas,
    templatesBrutos,
    nichosBrutos,
    [agregados],
  ] = await Promise.all([
    sql<{ encontrados: string; sem_site: string; com_whatsapp: string }[]>`
      SELECT
        COUNT(*) AS encontrados,
        COUNT(*) FILTER (WHERE l.tem_site_real = false) AS sem_site,
        COUNT(*) FILTER (
          WHERE l.tem_site_real = false
            AND l.telefone_e164 IS NOT NULL
            AND l.telefone_celular = true
        ) AS com_whatsapp
      FROM leads l WHERE ${recorteLead}
    `,
    sql<{ responderam: string; negociando: string; fechados: string; perdidos: string }[]>`
      SELECT
        COUNT(*) FILTER (WHERE c.respondeu_em IS NOT NULL) AS responderam,
        COUNT(*) FILTER (WHERE c.status = 'negociando') AS negociando,
        COUNT(*) FILTER (WHERE c.status = 'fechado') AS fechados,
        COUNT(*) FILTER (WHERE c.status = 'perdido') AS perdidos
      FROM lead_crm c WHERE ${recorteCrm}
    `,
    sql<{ n: string }[]>`
      SELECT COUNT(DISTINCT cl.place_id) AS n
      FROM contact_log cl
      JOIN leads l ON l.place_id = cl.place_id
      WHERE cl.entrega = 'enviado' AND cl.registrado_em >= ${desde} AND ${recorteLead}
    `,
    // Falhou por dado ruim e nunca chegou a ser abordado de verdade.
    sql<{ n: string }[]>`
      SELECT COUNT(DISTINCT cl.place_id) AS n
      FROM contact_log cl
      JOIN lead_crm c ON c.place_id = cl.place_id
      WHERE cl.entrega IN ('numero_invalido', 'sem_whatsapp')
        AND c.tentativas = 0
        AND c.status NOT IN ('fechado', 'nao_perturbe')
    `,
    sql<{ n: string }[]>`
      SELECT COUNT(*) AS n FROM lead_crm c
      WHERE c.status <> ALL(${bloqueados})
        AND c.tentativas > 0
        AND c.tentativas < ${COOLDOWN_PADRAO.maxTentativas}
        AND c.ultimo_contato_em IS NOT NULL
        AND c.ultimo_contato_em < now() - ${`${COOLDOWN_PADRAO.diasBloqueio} days`}::interval
        AND ${recorteCrm}
    `,
    sql<{ hoje: string; semana: string; mes: string }[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE (registrado_em AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date
        ) AS hoje,
        COUNT(*) FILTER (WHERE registrado_em >= now() - interval '7 days') AS semana,
        COUNT(*) FILTER (WHERE registrado_em >= now() - interval '30 days') AS mes
      FROM contact_log WHERE entrega = 'enviado'
    `,
    sql<{ faixa: string; n: string }[]>`
      SELECT faixa, COUNT(*) AS n FROM leads l
      WHERE l.tem_site_real = false AND ${recorteLead}
      GROUP BY faixa
    `,
    sql<{ motivo_perda: string | null; n: string }[]>`
      SELECT motivo_perda, COUNT(*) AS n FROM lead_crm c
      WHERE c.status = 'perdido' AND ${recorteCrm}
      GROUP BY motivo_perda
    `,
    sql<{ entrega: string; n: string }[]>`
      SELECT entrega, COUNT(*) AS n FROM contact_log
      WHERE entrega <> 'enviado' AND registrado_em >= ${desde}
      GROUP BY entrega
    `,
    sql<{ template_id: string | null; template_nome: string | null; enviados: string; responderam: string }[]>`
      SELECT cl.template_id, cl.template_nome,
             COUNT(*) AS enviados,
             COUNT(*) FILTER (
               WHERE c.respondeu_em IS NOT NULL AND c.respondeu_em > cl.registrado_em
             ) AS responderam
      FROM contact_log cl
      JOIN lead_crm c ON c.place_id = cl.place_id
      WHERE cl.entrega = 'enviado' AND cl.registrado_em >= ${desde}
      GROUP BY cl.template_id, cl.template_nome
      ORDER BY enviados DESC
    `,
    sql<{ nicho: string; encontrados: string; sem_site: string; contatados: string; fechados: string }[]>`
      SELECT s.nicho_label AS nicho,
             COUNT(DISTINCT sl.place_id) AS encontrados,
             COUNT(DISTINCT l.place_id) FILTER (WHERE l.tem_site_real = false) AS sem_site,
             COUNT(DISTINCT c.place_id) FILTER (WHERE c.tentativas > 0) AS contatados,
             COUNT(DISTINCT c.place_id) FILTER (WHERE c.status = 'fechado') AS fechados
      FROM searches s
      JOIN search_leads sl ON sl.search_id = s.id
      JOIN leads l ON l.place_id = sl.place_id
      JOIN lead_crm c ON c.place_id = sl.place_id
      GROUP BY s.nicho_label
      ORDER BY sem_site DESC
      LIMIT 12
    `,
    sql<{ valor: string; dias_resposta: string | null; tentativas_fechar: string | null }[]>`
      SELECT
        COALESCE(SUM(valor_fechado), 0) AS valor,
        AVG(EXTRACT(EPOCH FROM (respondeu_em - primeiro_contato_em)) / 86400)
          FILTER (WHERE respondeu_em IS NOT NULL AND primeiro_contato_em IS NOT NULL)
          AS dias_resposta,
        AVG(tentativas) FILTER (WHERE status = 'fechado' AND tentativas > 0)
          AS tentativas_fechar
      FROM lead_crm c WHERE ${recorteCrm}
    `,
  ]);

  const faixas: Contagem[] = ['muito_bom', 'bom', 'intermediario', 'ruim'].map((chave) => ({
    chave,
    rotulo: ROTULO_FAIXA_LOCAL[chave],
    total: Number(faixasBrutas.find((l) => l.faixa === chave)?.n ?? 0),
  }));

  const perdas: Contagem[] = MOTIVOS_PERDA.map((motivo) => ({
    chave: motivo,
    rotulo: ROTULO_MOTIVO_PERDA[motivo],
    total: Number(perdasBrutas.find((l) => l.motivo_perda === motivo)?.n ?? 0),
  })).filter((p) => p.total > 0);

  const semMotivo = Number(perdasBrutas.find((l) => l.motivo_perda === null)?.n ?? 0);
  if (semMotivo > 0) {
    perdas.push({ chave: 'sem_motivo', rotulo: 'Sem motivo informado', total: semMotivo });
  }

  const falhasTecnicas: Contagem[] = tecnicasBrutas.map((l) => ({
    chave: l.entrega,
    rotulo: ROTULO_ENTREGA[l.entrega as keyof typeof ROTULO_ENTREGA] ?? l.entrega,
    total: Number(l.n),
  }));

  const templates: DesempenhoTemplate[] = templatesBrutos.map((l) => {
    const enviadosT = Number(l.enviados);
    const responderamT = Number(l.responderam ?? 0);
    return {
      templateId: l.template_id ?? 'sem_template',
      nome: l.template_nome ?? 'Mensagem avulsa',
      enviados: enviadosT,
      responderam: responderamT,
      taxa: enviadosT > 0 ? responderamT / enviadosT : 0,
    };
  });

  const nichos: DesempenhoNicho[] = nichosBrutos.map((l) => ({
    nicho: l.nicho,
    encontrados: Number(l.encontrados),
    semSite: Number(l.sem_site),
    contatados: Number(l.contatados),
    fechados: Number(l.fechados),
  }));

  const numero = (v: string | null | undefined): number | null =>
    v === null || v === undefined ? null : Number(v);

  return {
    funil: {
      encontrados: Number(contagensLead?.encontrados ?? 0),
      semSite: Number(contagensLead?.sem_site ?? 0),
      comWhatsapp: Number(contagensLead?.com_whatsapp ?? 0),
      enviados: Number(enviadosLinha?.n ?? 0),
      responderam: Number(contagensCrm?.responderam ?? 0),
      negociando: Number(contagensCrm?.negociando ?? 0),
      fechados: Number(contagensCrm?.fechados ?? 0),
      perdidos: Number(contagensCrm?.perdidos ?? 0),
    },
    faixas,
    perdas,
    falhasTecnicas,
    recuperaveis: Number(recuperaveisLinha?.n ?? 0),
    ritmo: {
      hoje: Number(ritmoLinha?.hoje ?? 0),
      semana: Number(ritmoLinha?.semana ?? 0),
      mes: Number(ritmoLinha?.mes ?? 0),
      limiteDiario: COOLDOWN_PADRAO.limiteDiario,
    },
    templates,
    nichos,
    valorFechado: Number(agregados?.valor ?? 0),
    tempoMedioRespostaDias: numero(agregados?.dias_resposta),
    tentativasMediasAteFechar: numero(agregados?.tentativas_fechar),
    prontosParaFollowUp: Number(prontosLinha?.n ?? 0),
    periodoDias: dias,
  };
}
