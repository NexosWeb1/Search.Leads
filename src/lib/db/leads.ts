/**
 * Persistencia e consulta de leads.
 *
 * O upsert atualiza os dados vindos do Google mas nunca toca em `visto_em` nem
 * em `lead_crm`. E isso que garante que reencontrar um comercio numa varredura
 * nova nao apague seu historico de contato com ele.
 */

import type { Row } from 'postgres';
import { db } from './index';
import { haversineMeters, boundingBox, type LatLng } from '../geo';
import {
  avaliarContato,
  COOLDOWN_PADRAO,
  STATUS_FORA_DA_FILA,
  type ConfigCooldown,
  type EstadoContato,
} from '../contacts/cooldown';
import type { LeadNormalizado } from '../leads/mapear';
import type { Faixa } from '../scoring/score';
import type { ClasseSite } from '../scoring/website';
import type { StatusCrm } from './schema';

export interface LeadCompleto {
  placeId: string;
  nome: string;
  endereco: string | null;
  enderecoCurto: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  lat: number;
  lng: number;
  telefoneE164: string | null;
  telefoneFormatado: string | null;
  telefoneCelular: boolean;
  telefoneMotivo: string | null;
  websiteUrl: string | null;
  websiteHost: string | null;
  websiteClasse: ClasseSite;
  temSiteReal: boolean;
  nota: number | null;
  totalAvaliacoes: number | null;
  tipoLabel: string | null;
  mapsUri: string | null;
  score: number;
  faixa: Faixa;
  motivos: Array<{ texto: string; pontos: number }>;
  distanciaM: number | null;
  // CRM
  status: StatusCrm;
  motivoPerda: string | null;
  notas: string | null;
  tentativas: number;
  ultimoContatoEm: string | null;
  respondeuEm: string | null;
  valorFechado: number | null;
  /** Decisao do cooldown, calculada aqui para a interface nao repetir a regra. */
  contato: EstadoContato;
  // Enriquecimento
  email: string | null;
  instagram: string | null;
  statusEnriquecimento: string | null;
}

/** Postgres devolve timestamptz como Date; a interface trafega ISO. */
function paraIso(valor: unknown): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Colunas do upsert de lead, na ordem usada pela insercao em lote. */
const COLUNAS_LEAD = [
  'place_id', 'nome', 'endereco', 'endereco_curto', 'bairro', 'cidade', 'uf', 'cep',
  'lat', 'lng', 'telefone_e164', 'telefone_formatado', 'telefone_celular',
  'telefone_motivo', 'website_url', 'website_host', 'website_classe',
  'tem_site_real', 'nota', 'total_avaliacoes', 'tipo_principal', 'tipo_label',
  'status_negocio', 'maps_uri', 'tem_horario', 'score', 'faixa', 'score_motivos',
  'atualizado_em',
] as const;

/** Grava os leads de uma varredura e os vincula a ela. */
export async function salvarLeads(
  searchId: string,
  itens: Array<{ lead: LeadNormalizado; distanciaM: number }>,
): Promise<void> {
  if (itens.length === 0) return;

  const sql = await db();
  const ts = new Date();

  const linhas = itens.map(({ lead }) => ({
    place_id: lead.placeId,
    nome: lead.nome,
    endereco: lead.endereco,
    endereco_curto: lead.enderecoCurto,
    bairro: lead.bairro,
    cidade: lead.cidade,
    uf: lead.uf,
    cep: lead.cep,
    lat: lead.lat,
    lng: lead.lng,
    telefone_e164: lead.telefone.e164,
    telefone_formatado: lead.telefone.formatado,
    telefone_celular: lead.telefone.celular,
    telefone_motivo: lead.telefone.motivo ?? null,
    website_url: lead.site.url,
    website_host: lead.site.host,
    website_classe: lead.site.classe,
    tem_site_real: lead.site.temSiteReal,
    nota: lead.nota,
    total_avaliacoes: lead.totalAvaliacoes,
    tipo_principal: lead.tipoPrincipal,
    tipo_label: lead.tipoLabel,
    status_negocio: lead.statusNegocio,
    maps_uri: lead.mapsUri,
    tem_horario: lead.temHorario,
    score: lead.score,
    faixa: lead.faixa,
    score_motivos: JSON.stringify(lead.motivos),
    atualizado_em: ts,
  }));

  const vinculos = itens.map(({ lead, distanciaM }) => ({
    search_id: searchId,
    place_id: lead.placeId,
    distancia_m: distanciaM,
  }));

  const crm = itens.map(({ lead }) => ({ place_id: lead.placeId, atualizado_em: ts }));

  // Em lotes: com centenas de leads, uma ida ao banco por linha levaria minutos.
  const TAMANHO_LOTE = 200;

  await sql.begin(async (tx) => {
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE);

      // `visto_em` fica de fora do UPDATE de proposito: e a data em que o
      // comercio entrou na sua base pela primeira vez.
      await tx`
        INSERT INTO leads ${tx(lote, ...COLUNAS_LEAD)}
        ON CONFLICT (place_id) DO UPDATE SET
          nome = excluded.nome,
          endereco = excluded.endereco,
          endereco_curto = excluded.endereco_curto,
          bairro = excluded.bairro,
          cidade = excluded.cidade,
          uf = excluded.uf,
          cep = excluded.cep,
          lat = excluded.lat,
          lng = excluded.lng,
          telefone_e164 = excluded.telefone_e164,
          telefone_formatado = excluded.telefone_formatado,
          telefone_celular = excluded.telefone_celular,
          telefone_motivo = excluded.telefone_motivo,
          website_url = excluded.website_url,
          website_host = excluded.website_host,
          website_classe = excluded.website_classe,
          tem_site_real = excluded.tem_site_real,
          nota = excluded.nota,
          total_avaliacoes = excluded.total_avaliacoes,
          tipo_principal = excluded.tipo_principal,
          tipo_label = excluded.tipo_label,
          status_negocio = excluded.status_negocio,
          maps_uri = excluded.maps_uri,
          tem_horario = excluded.tem_horario,
          score = excluded.score,
          faixa = excluded.faixa,
          score_motivos = excluded.score_motivos,
          atualizado_em = excluded.atualizado_em
      `;
    }

    for (let i = 0; i < crm.length; i += TAMANHO_LOTE) {
      // Garante a linha de CRM para os joins nao precisarem de LEFT JOIN.
      await tx`
        INSERT INTO lead_crm ${tx(crm.slice(i, i + TAMANHO_LOTE), 'place_id', 'atualizado_em')}
        ON CONFLICT (place_id) DO NOTHING
      `;
    }

    for (let i = 0; i < vinculos.length; i += TAMANHO_LOTE) {
      await tx`
        INSERT INTO search_leads ${tx(
          vinculos.slice(i, i + TAMANHO_LOTE),
          'search_id',
          'place_id',
          'distancia_m',
        )}
        ON CONFLICT (search_id, place_id) DO UPDATE SET
          distancia_m = excluded.distancia_m
      `;
    }
  });
}

/**
 * Vincula a uma varredura leads que ja estavam no banco.
 *
 * Acontece quando uma celula bate no cache: nao gastamos requisicao, mas os
 * comercios daquela celula precisam aparecer no resultado desta busca. Devolve
 * quantos ficaram dentro do raio real.
 */
export async function vincularLeadsExistentes(
  searchId: string,
  ids: string[],
  centro: LatLng,
  raioM: number,
): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = await db();

  const linhas = await sql<{ place_id: string; lat: number; lng: number }[]>`
    SELECT place_id, lat, lng FROM leads WHERE place_id = ANY(${ids})
  `;

  const dentro = linhas
    .map((l) => ({
      search_id: searchId,
      place_id: l.place_id,
      distancia_m: haversineMeters(centro, { lat: Number(l.lat), lng: Number(l.lng) }),
    }))
    .filter((l) => l.distancia_m <= raioM);

  if (dentro.length === 0) return 0;

  const TAMANHO_LOTE = 200;
  for (let i = 0; i < dentro.length; i += TAMANHO_LOTE) {
    await sql`
      INSERT INTO search_leads ${sql(
        dentro.slice(i, i + TAMANHO_LOTE),
        'search_id',
        'place_id',
        'distancia_m',
      )}
      ON CONFLICT (search_id, place_id) DO UPDATE SET
        distancia_m = excluded.distancia_m
    `;
  }

  return dentro.length;
}

function paraLead(linha: Row, config: ConfigCooldown): LeadCompleto {
  // score_motivos e jsonb: o driver ja devolve como objeto.
  const motivos = Array.isArray(linha.score_motivos)
    ? (linha.score_motivos as LeadCompleto['motivos'])
    : [];

  const status = (linha.status ?? 'novo') as StatusCrm;
  const tentativas = Number(linha.tentativas ?? 0);
  const ultimoContatoEm = paraIso(linha.ultimo_contato_em);
  const respondeuEm = paraIso(linha.respondeu_em);
  const motivoPerda = linha.motivo_perda ? String(linha.motivo_perda) : null;

  return {
    placeId: String(linha.place_id),
    nome: String(linha.nome),
    endereco: linha.endereco ? String(linha.endereco) : null,
    enderecoCurto: linha.endereco_curto ? String(linha.endereco_curto) : null,
    bairro: linha.bairro ? String(linha.bairro) : null,
    cidade: linha.cidade ? String(linha.cidade) : null,
    uf: linha.uf ? String(linha.uf) : null,
    lat: Number(linha.lat),
    lng: Number(linha.lng),
    telefoneE164: linha.telefone_e164 ? String(linha.telefone_e164) : null,
    telefoneFormatado: linha.telefone_formatado ? String(linha.telefone_formatado) : null,
    telefoneCelular: Boolean(linha.telefone_celular),
    telefoneMotivo: linha.telefone_motivo ? String(linha.telefone_motivo) : null,
    websiteUrl: linha.website_url ? String(linha.website_url) : null,
    websiteHost: linha.website_host ? String(linha.website_host) : null,
    websiteClasse: String(linha.website_classe) as ClasseSite,
    temSiteReal: Boolean(linha.tem_site_real),
    nota: numeroOuNulo(linha.nota),
    totalAvaliacoes: numeroOuNulo(linha.total_avaliacoes),
    tipoLabel: linha.tipo_label ? String(linha.tipo_label) : null,
    mapsUri: linha.maps_uri ? String(linha.maps_uri) : null,
    score: Number(linha.score),
    faixa: String(linha.faixa) as Faixa,
    motivos,
    distanciaM: numeroOuNulo(linha.distancia_m),
    status,
    motivoPerda,
    notas: linha.notas ? String(linha.notas) : null,
    tentativas,
    ultimoContatoEm,
    respondeuEm,
    valorFechado: numeroOuNulo(linha.valor_fechado),
    contato: avaliarContato(
      { status, tentativas, ultimoContatoEm, respondeuEm, motivoPerda },
      config,
    ),
    email: linha.email ? String(linha.email) : null,
    instagram: linha.instagram ? String(linha.instagram) : null,
    statusEnriquecimento: linha.status_enriquecimento
      ? String(linha.status_enriquecimento)
      : null,
  };
}

export type Ordenacao =
  | 'relevancia'
  | 'avaliacoes'
  | 'distancia'
  | 'nome'
  | 'status'
  | 'recente';

export interface FiltrosLeads {
  searchId?: string;
  /** Por padrao quem ja tem site proprio fica fora: nao e lead. */
  incluirComSite?: boolean;
  faixas?: Faixa[];
  status?: StatusCrm[];
  somenteWhatsapp?: boolean;
  somenteInstagram?: boolean;
  somenteEmail?: boolean;
  /** Filtro de historico: nunca abordado, pronto para follow-up, ou todos. */
  contato?: 'nunca' | 'disponivel' | 'contatados' | 'todos';
  busca?: string;
  ordenar?: Ordenacao;
  limite?: number;
  deslocamento?: number;
}

export async function listarLeads(
  filtros: FiltrosLeads = {},
  config: ConfigCooldown = COOLDOWN_PADRAO,
): Promise<{ leads: LeadCompleto[]; total: number }> {
  const sql = await db();

  /*
   * As condicoes sao montadas como fragmentos do proprio driver, e nao
   * concatenando texto. Assim todo valor continua sendo parametro e nao ha
   * caminho para injecao, mesmo com o filtro de busca livre digitado por voce.
   */
  const condicoes = [];

  if (!filtros.incluirComSite) condicoes.push(sql`l.tem_site_real = false`);

  if (filtros.faixas?.length) condicoes.push(sql`l.faixa = ANY(${filtros.faixas})`);
  if (filtros.status?.length) condicoes.push(sql`c.status = ANY(${filtros.status})`);

  // WhatsApp exige celular: numero fixo nao recebe mensagem.
  if (filtros.somenteWhatsapp) {
    condicoes.push(sql`l.telefone_e164 IS NOT NULL AND l.telefone_celular = true`);
  }
  if (filtros.somenteInstagram) condicoes.push(sql`e.instagram IS NOT NULL`);
  if (filtros.somenteEmail) condicoes.push(sql`e.email IS NOT NULL`);

  if (filtros.busca?.trim()) {
    const alvo = `%${filtros.busca.trim()}%`;
    condicoes.push(sql`(l.nome ILIKE ${alvo} OR l.bairro ILIKE ${alvo})`);
  }

  // Os estados de contato precisam espelhar exatamente avaliarContato(), senao a
  // contagem da lista discorda da fila de disparo.
  const limiteEspera = new Date(Date.now() - config.diasBloqueio * 86_400_000);

  switch (filtros.contato) {
    case 'nunca':
      condicoes.push(
        sql`c.tentativas = 0 AND c.status <> ALL(${[...STATUS_FORA_DA_FILA]})`,
      );
      break;
    case 'disponivel':
      condicoes.push(sql`c.status <> ALL(${[...STATUS_FORA_DA_FILA]})`);
      condicoes.push(sql`c.tentativas < ${config.maxTentativas}`);
      /*
       * A condicao de data so vale para quem tem tentativa. Lead com zero
       * tentativas nunca recebeu mensagem, mesmo que tenha data de contato no
       * historico por causa de falha tecnica, e portanto esta liberado.
       */
      condicoes.push(
        sql`(c.tentativas = 0 OR c.ultimo_contato_em IS NULL OR c.ultimo_contato_em < ${limiteEspera})`,
      );
      break;
    case 'contatados':
      condicoes.push(sql`c.tentativas > 0`);
      break;
    default:
      break;
  }

  const onde = condicoes.length
    ? condicoes.reduce((acc, c) => sql`${acc} AND ${c}`)
    : sql`true`;

  const juncaoBusca = filtros.searchId
    ? sql`JOIN search_leads sl ON sl.place_id = l.place_id AND sl.search_id = ${filtros.searchId}`
    : sql`LEFT JOIN search_leads sl ON false`;

  const ORDENS = {
    relevancia: sql`l.score DESC, l.total_avaliacoes DESC NULLS LAST`,
    avaliacoes: sql`l.total_avaliacoes DESC NULLS LAST, l.score DESC`,
    distancia: sql`sl.distancia_m ASC NULLS LAST`,
    nome: sql`lower(l.nome) ASC`,
    status: sql`c.status ASC, l.score DESC`,
    recente: sql`l.atualizado_em DESC`,
  } as const;

  const ordem = ORDENS[filtros.ordenar ?? 'relevancia'];
  const limite = Math.min(filtros.limite ?? 500, 2000);
  const deslocamento = filtros.deslocamento ?? 0;

  const [contagem] = await sql<{ n: string }[]>`
    SELECT COUNT(*) AS n
    FROM leads l
    JOIN lead_crm c ON c.place_id = l.place_id
    LEFT JOIN enrichment e ON e.place_id = l.place_id
    ${juncaoBusca}
    WHERE ${onde}
  `;

  const linhas = await sql`
    SELECT l.*, sl.distancia_m,
           c.status, c.motivo_perda, c.notas, c.tentativas,
           c.ultimo_contato_em, c.respondeu_em, c.valor_fechado,
           e.email, e.instagram, e.status AS status_enriquecimento
    FROM leads l
    JOIN lead_crm c ON c.place_id = l.place_id
    LEFT JOIN enrichment e ON e.place_id = l.place_id
    ${juncaoBusca}
    WHERE ${onde}
    ORDER BY ${ordem}
    LIMIT ${limite} OFFSET ${deslocamento}
  `;

  return {
    total: Number(contagem?.n ?? 0),
    leads: linhas.map((linha) => paraLead(linha, config)),
  };
}

export async function carregarLeadsPorIds(
  ids: string[],
  config: ConfigCooldown = COOLDOWN_PADRAO,
): Promise<LeadCompleto[]> {
  if (ids.length === 0) return [];
  const sql = await db();

  const linhas = await sql`
    SELECT l.*, NULL::double precision AS distancia_m,
           c.status, c.motivo_perda, c.notas, c.tentativas,
           c.ultimo_contato_em, c.respondeu_em, c.valor_fechado,
           e.email, e.instagram, e.status AS status_enriquecimento
    FROM leads l
    JOIN lead_crm c ON c.place_id = l.place_id
    LEFT JOIN enrichment e ON e.place_id = l.place_id
    WHERE l.place_id = ANY(${ids})
  `;

  return linhas.map((linha) => paraLead(linha, config));
}

/**
 * Leads dentro de um circulo, independentemente da busca que os trouxe.
 * A caixa envolvente e um quadrado; o circulo de verdade sai do haversine.
 */
export async function leadsNoCirculo(
  centro: LatLng,
  raioM: number,
  config: ConfigCooldown = COOLDOWN_PADRAO,
): Promise<LeadCompleto[]> {
  const sql = await db();
  const caixa = boundingBox(centro, raioM);

  const linhas = await sql`
    SELECT l.*, NULL::double precision AS distancia_m,
           c.status, c.motivo_perda, c.notas, c.tentativas,
           c.ultimo_contato_em, c.respondeu_em, c.valor_fechado,
           e.email, e.instagram, e.status AS status_enriquecimento
    FROM leads l
    JOIN lead_crm c ON c.place_id = l.place_id
    LEFT JOIN enrichment e ON e.place_id = l.place_id
    WHERE l.lat BETWEEN ${caixa.minLat} AND ${caixa.maxLat}
      AND l.lng BETWEEN ${caixa.minLng} AND ${caixa.maxLng}
  `;

  return linhas
    .map((linha) => paraLead(linha, config))
    .filter((l) => haversineMeters(centro, { lat: l.lat, lng: l.lng }) <= raioM);
}
