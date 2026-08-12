/**
 * Persistencia e consulta de leads.
 *
 * O upsert atualiza os dados vindos do Google mas nunca toca em `visto_em` nem
 * em `lead_crm`. E isso que garante que reencontrar um comercio numa varredura
 * nova nao apague seu historico de contato com ele.
 */

import type { InArgs, Row } from '@libsql/client';
import { db, agora, bool, int } from './index';
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

/** Grava os leads de uma varredura e os vincula a ela. */
export async function salvarLeads(
  searchId: string,
  itens: Array<{ lead: LeadNormalizado; distanciaM: number }>,
): Promise<void> {
  if (itens.length === 0) return;

  const cliente = await db();
  const ts = agora();

  const comandos: Array<{ sql: string; args: InArgs }> = [];

  for (const { lead, distanciaM } of itens) {
    comandos.push({
      sql: `INSERT INTO leads (
              place_id, nome, endereco, endereco_curto, bairro, cidade, uf, cep,
              lat, lng, telefone_e164, telefone_formatado, telefone_celular,
              telefone_motivo, website_url, website_host, website_classe,
              tem_site_real, nota, total_avaliacoes, tipo_principal, tipo_label,
              status_negocio, maps_uri, tem_horario, score, faixa, score_motivos,
              visto_em, atualizado_em
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
              atualizado_em = excluded.atualizado_em`,
      args: [
        lead.placeId, lead.nome, lead.endereco, lead.enderecoCurto, lead.bairro,
        lead.cidade, lead.uf, lead.cep, lead.lat, lead.lng,
        lead.telefone.e164, lead.telefone.formatado, int(lead.telefone.celular),
        lead.telefone.motivo ?? null,
        lead.site.url, lead.site.host, lead.site.classe, int(lead.site.temSiteReal),
        lead.nota, lead.totalAvaliacoes, lead.tipoPrincipal, lead.tipoLabel,
        lead.statusNegocio, lead.mapsUri, int(lead.temHorario),
        lead.score, lead.faixa, JSON.stringify(lead.motivos), ts, ts,
      ],
    });

    // Garante a linha de CRM para os joins nao precisarem de LEFT JOIN em todo lugar.
    comandos.push({
      sql: `INSERT INTO lead_crm (place_id, status, atualizado_em)
            VALUES (?, 'novo', ?)
            ON CONFLICT (place_id) DO NOTHING`,
      args: [lead.placeId, ts],
    });

    comandos.push({
      sql: `INSERT INTO search_leads (search_id, place_id, distancia_m)
            VALUES (?, ?, ?)
            ON CONFLICT (search_id, place_id) DO UPDATE SET
              distancia_m = excluded.distancia_m`,
      args: [searchId, lead.placeId, distanciaM],
    });
  }

  // Em lote e numa transacao: com 300 leads sao 900 comandos, e um por vez
  // levaria dezenas de segundos.
  const TAMANHO_LOTE = 300;
  for (let i = 0; i < comandos.length; i += TAMANHO_LOTE) {
    await cliente.batch(comandos.slice(i, i + TAMANHO_LOTE), 'write');
  }
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
  const cliente = await db();

  const comandos: Array<{ sql: string; args: InArgs }> = [];
  const TAMANHO_LOTE = 400;

  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const lote = ids.slice(i, i + TAMANHO_LOTE);
    const { rows } = await cliente.execute({
      sql: `SELECT place_id, lat, lng FROM leads
            WHERE place_id IN (${lote.map(() => '?').join(',')})`,
      args: lote,
    });

    for (const linha of rows) {
      const distancia = haversineMeters(centro, {
        lat: Number(linha.lat),
        lng: Number(linha.lng),
      });
      if (distancia > raioM) continue;

      comandos.push({
        sql: `INSERT INTO search_leads (search_id, place_id, distancia_m)
              VALUES (?, ?, ?)
              ON CONFLICT (search_id, place_id) DO UPDATE SET
                distancia_m = excluded.distancia_m`,
        args: [searchId, String(linha.place_id), distancia],
      });
    }
  }

  for (let i = 0; i < comandos.length; i += TAMANHO_LOTE) {
    await cliente.batch(comandos.slice(i, i + TAMANHO_LOTE), 'write');
  }

  return comandos.length;
}

function paraLead(linha: Row, config: ConfigCooldown): LeadCompleto {
  let motivos: LeadCompleto['motivos'] = [];
  if (linha.score_motivos) {
    try {
      motivos = JSON.parse(String(linha.score_motivos));
    } catch {
      motivos = [];
    }
  }

  const status = (linha.status ?? 'novo') as StatusCrm;
  const tentativas = Number(linha.tentativas ?? 0);
  const ultimoContatoEm = linha.ultimo_contato_em ? String(linha.ultimo_contato_em) : null;
  const respondeuEm = linha.respondeu_em ? String(linha.respondeu_em) : null;

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
    telefoneCelular: bool(linha.telefone_celular),
    telefoneMotivo: linha.telefone_motivo ? String(linha.telefone_motivo) : null,
    websiteUrl: linha.website_url ? String(linha.website_url) : null,
    websiteHost: linha.website_host ? String(linha.website_host) : null,
    websiteClasse: String(linha.website_classe) as ClasseSite,
    temSiteReal: bool(linha.tem_site_real),
    nota: linha.nota === null ? null : Number(linha.nota),
    totalAvaliacoes: linha.total_avaliacoes === null ? null : Number(linha.total_avaliacoes),
    tipoLabel: linha.tipo_label ? String(linha.tipo_label) : null,
    mapsUri: linha.maps_uri ? String(linha.maps_uri) : null,
    score: Number(linha.score),
    faixa: String(linha.faixa) as Faixa,
    motivos,
    distanciaM: linha.distancia_m === null || linha.distancia_m === undefined
      ? null
      : Number(linha.distancia_m),
    status,
    motivoPerda: linha.motivo_perda ? String(linha.motivo_perda) : null,
    notas: linha.notas ? String(linha.notas) : null,
    tentativas,
    ultimoContatoEm,
    respondeuEm,
    valorFechado: linha.valor_fechado === null || linha.valor_fechado === undefined
      ? null
      : Number(linha.valor_fechado),
    contato: avaliarContato(
      {
        status,
        tentativas,
        ultimoContatoEm,
        respondeuEm,
        motivoPerda: linha.motivo_perda ? String(linha.motivo_perda) : null,
      },
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

const ORDEM_SQL: Record<Ordenacao, string> = {
  relevancia: 'l.score DESC, l.total_avaliacoes DESC',
  avaliacoes: 'l.total_avaliacoes DESC, l.score DESC',
  distancia: 'sl.distancia_m ASC',
  nome: 'l.nome COLLATE NOCASE ASC',
  status: 'c.status ASC, l.score DESC',
  recente: 'l.atualizado_em DESC',
};

export async function listarLeads(
  filtros: FiltrosLeads = {},
  config: ConfigCooldown = COOLDOWN_PADRAO,
): Promise<{ leads: LeadCompleto[]; total: number }> {
  const cliente = await db();
  const where: string[] = [];
  const args: InArgs = [];

  const join = filtros.searchId
    ? 'JOIN search_leads sl ON sl.place_id = l.place_id AND sl.search_id = ?'
    : 'LEFT JOIN search_leads sl ON 1 = 0';
  if (filtros.searchId) args.push(filtros.searchId);

  if (!filtros.incluirComSite) where.push('l.tem_site_real = 0');

  if (filtros.faixas?.length) {
    where.push(`l.faixa IN (${filtros.faixas.map(() => '?').join(',')})`);
    args.push(...filtros.faixas);
  }

  if (filtros.status?.length) {
    where.push(`c.status IN (${filtros.status.map(() => '?').join(',')})`);
    args.push(...filtros.status);
  }

  // WhatsApp exige celular: numero fixo nao recebe mensagem.
  if (filtros.somenteWhatsapp) {
    where.push('l.telefone_e164 IS NOT NULL AND l.telefone_celular = 1');
  }
  if (filtros.somenteInstagram) where.push('e.instagram IS NOT NULL');
  if (filtros.somenteEmail) where.push('e.email IS NOT NULL');

  if (filtros.busca?.trim()) {
    where.push('(l.nome LIKE ? OR l.bairro LIKE ?)');
    const alvo = `%${filtros.busca.trim()}%`;
    args.push(alvo, alvo);
  }

  // Os estados de contato precisam espelhar exatamente avaliarContato(), senao a
  // contagem da lista discorda da fila de disparo.
  // Derivado da mesma constante que avaliarContato usa, e nao reescrito a mao:
  // duas listas iguais escritas em dois lugares divergem na primeira mudanca.
  const bloqueados = STATUS_FORA_DA_FILA.map((s) => `'${s}'`).join(',');
  switch (filtros.contato) {
    case 'nunca':
      where.push(`c.tentativas = 0 AND c.status NOT IN (${bloqueados})`);
      break;
    case 'disponivel':
      where.push(`c.status NOT IN (${bloqueados})`);
      where.push('c.tentativas < ?');
      args.push(config.maxTentativas);
      /*
       * A condicao de data so vale para quem tem tentativa. Lead com zero
       * tentativas nunca recebeu mensagem, mesmo que tenha data de contato no
       * historico por causa de falha tecnica, e portanto esta liberado.
       * Isto espelha a mesma decisao de avaliarContato: se as duas divergirem,
       * a contagem da lista discorda da contagem do botao de disparo.
       */
      where.push(
        '(c.tentativas = 0 OR c.ultimo_contato_em IS NULL OR c.ultimo_contato_em < ?)',
      );
      args.push(
        new Date(Date.now() - config.diasBloqueio * 86_400_000).toISOString(),
      );
      break;
    case 'contatados':
      where.push('c.tentativas > 0');
      break;
    default:
      break;
  }

  const clausula = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const ordem = ORDEM_SQL[filtros.ordenar ?? 'relevancia'];
  const limite = Math.min(filtros.limite ?? 500, 2000);
  const deslocamento = filtros.deslocamento ?? 0;

  const base = `FROM leads l
      JOIN lead_crm c ON c.place_id = l.place_id
      LEFT JOIN enrichment e ON e.place_id = l.place_id
      ${join}
      ${clausula}`;

  const contagem = await cliente.execute({
    sql: `SELECT COUNT(*) AS n ${base}`,
    args,
  });

  const { rows } = await cliente.execute({
    sql: `SELECT l.*, sl.distancia_m,
                 c.status, c.motivo_perda, c.notas, c.tentativas,
                 c.ultimo_contato_em, c.respondeu_em, c.valor_fechado,
                 e.email, e.instagram, e.status AS status_enriquecimento
          ${base}
          ORDER BY ${ordem}
          LIMIT ? OFFSET ?`,
    args: [...args, limite, deslocamento],
  });

  return {
    total: Number(contagem.rows[0]?.n ?? 0),
    leads: rows.map((linha) => paraLead(linha, config)),
  };
}

export async function carregarLeadsPorIds(
  ids: string[],
  config: ConfigCooldown = COOLDOWN_PADRAO,
): Promise<LeadCompleto[]> {
  if (ids.length === 0) return [];
  const cliente = await db();

  const leads: LeadCompleto[] = [];
  const TAMANHO_LOTE = 400;

  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const lote = ids.slice(i, i + TAMANHO_LOTE);
    const { rows } = await cliente.execute({
      sql: `SELECT l.*, NULL AS distancia_m,
                   c.status, c.motivo_perda, c.notas, c.tentativas,
                   c.ultimo_contato_em, c.respondeu_em, c.valor_fechado,
                   e.email, e.instagram, e.status AS status_enriquecimento
            FROM leads l
            JOIN lead_crm c ON c.place_id = l.place_id
            LEFT JOIN enrichment e ON e.place_id = l.place_id
            WHERE l.place_id IN (${lote.map(() => '?').join(',')})`,
      args: lote,
    });
    leads.push(...rows.map((linha) => paraLead(linha, config)));
  }

  return leads;
}

/**
 * Leads dentro de um circulo, independentemente da busca que os trouxe.
 * Usado pelo cache: quando uma celula ja foi consultada, a lista vem daqui em
 * vez de gastar requisicao na API.
 */
export async function leadsNoCirculo(
  centro: LatLng,
  raioM: number,
  config: ConfigCooldown = COOLDOWN_PADRAO,
): Promise<LeadCompleto[]> {
  const cliente = await db();
  const caixa = boundingBox(centro, raioM);

  const { rows } = await cliente.execute({
    sql: `SELECT l.*, NULL AS distancia_m,
                 c.status, c.motivo_perda, c.notas, c.tentativas,
                 c.ultimo_contato_em, c.respondeu_em, c.valor_fechado,
                 e.email, e.instagram, e.status AS status_enriquecimento
          FROM leads l
          JOIN lead_crm c ON c.place_id = l.place_id
          LEFT JOIN enrichment e ON e.place_id = l.place_id
          WHERE l.lat BETWEEN ? AND ? AND l.lng BETWEEN ? AND ?`,
    args: [caixa.minLat, caixa.maxLat, caixa.minLng, caixa.maxLng],
  });

  // A caixa e um quadrado; o circulo de verdade sai do haversine.
  return rows
    .map((linha) => paraLead(linha, config))
    .filter((l) => haversineMeters(centro, { lat: l.lat, lng: l.lng }) <= raioM);
}
