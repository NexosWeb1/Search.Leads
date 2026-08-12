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

// InValue e nao InArgs: InArgs e uma uniao de array com objeto, e uniao nao
// aceita espalhamento nem push.
import type { InValue } from '@libsql/client';
import { db } from '../db/index';
import { COOLDOWN_PADRAO } from './cooldown';
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
  /** Contagem de leads em cada faixa de score. */
  faixas: Contagem[];
  /** Perdas comerciais, por motivo. */
  perdas: Contagem[];
  /** Falhas tecnicas, por tipo. Bloco acionavel. */
  falhasTecnicas: Contagem[];
  /** Leads que falharam por dado ruim e podem voltar para a fila. */
  recuperaveis: number;
  ritmo: { hoje: number; semana: number; mes: number; limiteDiario: number };
  templates: DesempenhoTemplate[];
  nichos: DesempenhoNicho[];
  valorFechado: number;
  tempoMedioRespostaDias: number | null;
  tentativasMediasAteFechar: number | null;
  /** Saiu do periodo de espera e esta pronto para a proxima tentativa. */
  prontosParaFollowUp: number;
  periodoDias: number;
}

const DIA_MS = 86_400_000;
const iso = (dias: number) => new Date(Date.now() - dias * DIA_MS).toISOString();

/**
 * Recorte de leads. Quando ha searchId, tudo passa a olhar apenas os leads
 * daquela varredura.
 */
function recorte(searchId?: string | null): { sql: string; args: InValue[] } {
  if (!searchId) return { sql: '', args: [] };
  return {
    sql: ' AND place_id IN (SELECT place_id FROM search_leads WHERE search_id = ?)',
    args: [searchId],
  };
}

async function umNumero(sql: string, args: InValue[] = []): Promise<number> {
  const cliente = await db();
  const { rows } = await cliente.execute({ sql, args });
  return Number(rows[0]?.n ?? 0);
}

export async function montarResultados(filtro: FiltroPainel = {}): Promise<Resultados> {
  const cliente = await db();
  const dias = filtro.dias ?? 90;
  const desde = iso(dias);
  const r = recorte(filtro.searchId);

  const [
    encontrados,
    semSite,
    comWhatsapp,
    enviados,
    responderam,
    negociando,
    fechados,
    perdidos,
    recuperaveis,
    prontos,
    hoje,
    semana,
    mes,
  ] = await Promise.all([
    umNumero(`SELECT COUNT(*) AS n FROM leads WHERE 1=1${r.sql}`, r.args),
    umNumero(`SELECT COUNT(*) AS n FROM leads WHERE tem_site_real = 0${r.sql}`, r.args),
    umNumero(
      `SELECT COUNT(*) AS n FROM leads
       WHERE tem_site_real = 0 AND telefone_e164 IS NOT NULL AND telefone_celular = 1${r.sql}`,
      r.args,
    ),
    umNumero(
      `SELECT COUNT(DISTINCT place_id) AS n FROM contact_log
       WHERE entrega = 'enviado' AND registrado_em >= ?${r.sql}`,
      [desde, ...r.args],
    ),
    umNumero(
      `SELECT COUNT(*) AS n FROM lead_crm WHERE respondeu_em IS NOT NULL${r.sql}`,
      r.args,
    ),
    umNumero(`SELECT COUNT(*) AS n FROM lead_crm WHERE status = 'negociando'${r.sql}`, r.args),
    umNumero(`SELECT COUNT(*) AS n FROM lead_crm WHERE status = 'fechado'${r.sql}`, r.args),
    umNumero(`SELECT COUNT(*) AS n FROM lead_crm WHERE status = 'perdido'${r.sql}`, r.args),
    // Falhou por dado ruim e nunca chegou a ser abordado de verdade.
    umNumero(
      `SELECT COUNT(DISTINCT cl.place_id) AS n FROM contact_log cl
       JOIN lead_crm c ON c.place_id = cl.place_id
       WHERE cl.entrega IN ('numero_invalido', 'sem_whatsapp')
         AND c.tentativas = 0
         AND c.status NOT IN ('fechado', 'nao_perturbe')`,
    ),
    umNumero(
      `SELECT COUNT(*) AS n FROM lead_crm
       WHERE status NOT IN ('fechado','nao_perturbe','respondeu','negociando','frio')
         AND tentativas > 0 AND tentativas < ?
         AND ultimo_contato_em IS NOT NULL AND ultimo_contato_em < ?${r.sql}`,
      [COOLDOWN_PADRAO.maxTentativas, iso(COOLDOWN_PADRAO.diasBloqueio), ...r.args],
    ),
    umNumero(
      `SELECT COUNT(*) AS n FROM contact_log WHERE entrega = 'enviado' AND registrado_em >= ?`,
      [new Date(new Date().setHours(0, 0, 0, 0)).toISOString()],
    ),
    umNumero(
      `SELECT COUNT(*) AS n FROM contact_log WHERE entrega = 'enviado' AND registrado_em >= ?`,
      [iso(7)],
    ),
    umNumero(
      `SELECT COUNT(*) AS n FROM contact_log WHERE entrega = 'enviado' AND registrado_em >= ?`,
      [iso(30)],
    ),
  ]);

  const faixasBrutas = await cliente.execute({
    sql: `SELECT faixa, COUNT(*) AS n FROM leads WHERE tem_site_real = 0${r.sql} GROUP BY faixa`,
    args: r.args,
  });

  const ROTULO_FAIXA_LOCAL: Record<string, string> = {
    muito_bom: 'Muito bom',
    bom: 'Bom',
    intermediario: 'Intermediario',
    ruim: 'Ruim',
  };

  const faixas: Contagem[] = ['muito_bom', 'bom', 'intermediario', 'ruim'].map((chave) => ({
    chave,
    rotulo: ROTULO_FAIXA_LOCAL[chave],
    total: Number(faixasBrutas.rows.find((l) => String(l.faixa) === chave)?.n ?? 0),
  }));

  const perdasBrutas = await cliente.execute({
    sql: `SELECT motivo_perda, COUNT(*) AS n FROM lead_crm
          WHERE status = 'perdido'${r.sql}
          GROUP BY motivo_perda`,
    args: r.args,
  });

  const perdas: Contagem[] = MOTIVOS_PERDA.map((motivo) => ({
    chave: motivo,
    rotulo: ROTULO_MOTIVO_PERDA[motivo],
    total: Number(
      perdasBrutas.rows.find((l) => String(l.motivo_perda) === motivo)?.n ?? 0,
    ),
  })).filter((p) => p.total > 0);

  const semMotivo = Number(
    perdasBrutas.rows.find((l) => l.motivo_perda === null)?.n ?? 0,
  );
  if (semMotivo > 0) {
    perdas.push({ chave: 'sem_motivo', rotulo: 'Sem motivo informado', total: semMotivo });
  }

  const tecnicasBrutas = await cliente.execute({
    sql: `SELECT entrega, COUNT(*) AS n FROM contact_log
          WHERE entrega <> 'enviado' AND registrado_em >= ?
          GROUP BY entrega`,
    args: [desde],
  });

  const falhasTecnicas: Contagem[] = tecnicasBrutas.rows.map((l) => {
    const chave = String(l.entrega);
    return {
      chave,
      rotulo: ROTULO_ENTREGA[chave as keyof typeof ROTULO_ENTREGA] ?? chave,
      total: Number(l.n),
    };
  });

  const templatesBrutos = await cliente.execute({
    sql: `SELECT cl.template_id, cl.template_nome,
                 COUNT(*) AS enviados,
                 SUM(CASE WHEN c.respondeu_em IS NOT NULL
                            AND c.respondeu_em > cl.registrado_em
                          THEN 1 ELSE 0 END) AS responderam
          FROM contact_log cl
          JOIN lead_crm c ON c.place_id = cl.place_id
          WHERE cl.entrega = 'enviado' AND cl.registrado_em >= ?
          GROUP BY cl.template_id, cl.template_nome
          ORDER BY enviados DESC`,
    args: [desde],
  });

  const templates: DesempenhoTemplate[] = templatesBrutos.rows.map((l) => {
    const enviadosT = Number(l.enviados);
    const responderamT = Number(l.responderam ?? 0);
    return {
      templateId: l.template_id ? String(l.template_id) : 'sem_template',
      nome: l.template_nome ? String(l.template_nome) : 'Mensagem avulsa',
      enviados: enviadosT,
      responderam: responderamT,
      taxa: enviadosT > 0 ? responderamT / enviadosT : 0,
    };
  });

  const nichosBrutos = await cliente.execute({
    sql: `SELECT s.nicho_label AS nicho,
                 COUNT(DISTINCT sl.place_id) AS encontrados,
                 COUNT(DISTINCT CASE WHEN l.tem_site_real = 0 THEN l.place_id END) AS sem_site,
                 COUNT(DISTINCT CASE WHEN c.tentativas > 0 THEN c.place_id END) AS contatados,
                 COUNT(DISTINCT CASE WHEN c.status = 'fechado' THEN c.place_id END) AS fechados
          FROM searches s
          JOIN search_leads sl ON sl.search_id = s.id
          JOIN leads l ON l.place_id = sl.place_id
          JOIN lead_crm c ON c.place_id = sl.place_id
          GROUP BY s.nicho_label
          ORDER BY sem_site DESC
          LIMIT 12`,
  });

  const nichos: DesempenhoNicho[] = nichosBrutos.rows.map((l) => ({
    nicho: String(l.nicho),
    encontrados: Number(l.encontrados),
    semSite: Number(l.sem_site),
    contatados: Number(l.contatados),
    fechados: Number(l.fechados),
  }));

  const agregados = await cliente.execute({
    sql: `SELECT
            COALESCE(SUM(valor_fechado), 0) AS valor,
            AVG(CASE WHEN respondeu_em IS NOT NULL AND primeiro_contato_em IS NOT NULL
                     THEN (julianday(respondeu_em) - julianday(primeiro_contato_em))
                END) AS dias_resposta,
            AVG(CASE WHEN status = 'fechado' AND tentativas > 0 THEN tentativas END) AS tentativas_fechar
          FROM lead_crm WHERE 1=1${r.sql}`,
    args: r.args,
  });

  const linha = agregados.rows[0];

  return {
    funil: {
      encontrados,
      semSite,
      comWhatsapp,
      enviados,
      responderam,
      negociando,
      fechados,
      perdidos,
    },
    faixas,
    perdas,
    falhasTecnicas,
    recuperaveis,
    ritmo: { hoje, semana, mes, limiteDiario: COOLDOWN_PADRAO.limiteDiario },
    templates,
    nichos,
    valorFechado: Number(linha?.valor ?? 0),
    tempoMedioRespostaDias:
      linha?.dias_resposta === null || linha?.dias_resposta === undefined
        ? null
        : Number(linha.dias_resposta),
    tentativasMediasAteFechar:
      linha?.tentativas_fechar === null || linha?.tentativas_fechar === undefined
        ? null
        : Number(linha.tentativas_fechar),
    prontosParaFollowUp: prontos,
    periodoDias: dias,
  };
}
