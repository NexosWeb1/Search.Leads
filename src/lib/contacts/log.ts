/**
 * Registro de tentativas de contato.
 *
 * A tabela e append-only: nenhuma tentativa e sobrescrita. E isso que permite o
 * card dizer "3a tentativa" em vez de apenas "contatado", e permite reler o que
 * voce mandou dois meses atras antes de falar de novo.
 *
 * A regra que separa os dois tipos de fracasso vive aqui:
 *
 * - Envio que deu certo conta tentativa, marca a data e inicia o cooldown.
 * - Falha tecnica (numero invalido, sem WhatsApp, pulado) e registrada mas NAO
 *   consome tentativa e NAO inicia cooldown, porque o lead nunca foi abordado de
 *   verdade. Ele volta para a fila depois que o enriquecimento achar um contato.
 *
 * Misturar os dois inflaria a taxa de "sem resposta" e faria voce achar que a
 * mensagem esta ruim quando na verdade o telefone estava errado.
 */

import { db, agora } from '../db/index';
import { COOLDOWN_PADRAO, type ConfigCooldown } from './cooldown';
import type { Entrega, MotivoPerda, StatusCrm } from '../db/schema';

export interface NovoContato {
  placeId: string;
  canal?: 'whatsapp' | 'telefone' | 'email' | 'instagram';
  templateId?: string | null;
  templateNome?: string | null;
  mensagem?: string | null;
  entrega: Entrega;
}

export interface ResultadoContato {
  /** Numero desta tentativa. Zero quando foi falha tecnica e nada foi consumido. */
  tentativa: number;
  statusNovo: StatusCrm;
  contouTentativa: boolean;
}

export async function registrarContato(
  contato: NovoContato,
  config: ConfigCooldown = COOLDOWN_PADRAO,
): Promise<ResultadoContato> {
  const cliente = await db();
  const ts = agora();
  const contouTentativa = contato.entrega === 'enviado';

  await cliente.execute({
    sql: `INSERT INTO lead_crm (place_id, status, atualizado_em)
          VALUES (?, 'novo', ?)
          ON CONFLICT (place_id) DO NOTHING`,
    args: [contato.placeId, ts],
  });

  const { rows } = await cliente.execute({
    sql: `SELECT status, tentativas FROM lead_crm WHERE place_id = ?`,
    args: [contato.placeId],
  });

  const statusAtual = (rows[0]?.status ?? 'novo') as StatusCrm;
  const tentativasAtuais = Number(rows[0]?.tentativas ?? 0);
  const tentativa = contouTentativa ? tentativasAtuais + 1 : tentativasAtuais;

  await cliente.execute({
    sql: `INSERT INTO contact_log (
            place_id, canal, template_id, template_nome, mensagem,
            entrega, tentativa, registrado_em
          ) VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      contato.placeId,
      contato.canal ?? 'whatsapp',
      contato.templateId ?? null,
      contato.templateNome ?? null,
      contato.mensagem ?? null,
      contato.entrega,
      tentativa,
      ts,
    ],
  });

  if (!contouTentativa) {
    return { tentativa: 0, statusNovo: statusAtual, contouTentativa: false };
  }

  // Nao rebaixa quem ja avancou no funil: um lead que respondeu e recebeu um
  // segundo envio continua em "respondeu".
  const avancaveis: StatusCrm[] = ['novo', 'contatado'];
  let statusNovo = statusAtual;
  if (avancaveis.includes(statusAtual)) {
    statusNovo = tentativa >= config.maxTentativas ? 'frio' : 'contatado';
  }

  await cliente.execute({
    sql: `UPDATE lead_crm SET
            status = ?,
            tentativas = ?,
            primeiro_contato_em = COALESCE(primeiro_contato_em, ?),
            ultimo_contato_em = ?,
            atualizado_em = ?
          WHERE place_id = ?`,
    args: [statusNovo, tentativa, ts, ts, ts, contato.placeId],
  });

  return { tentativa, statusNovo, contouTentativa: true };
}

export interface ItemHistorico {
  id: number;
  canal: string;
  templateId: string | null;
  templateNome: string | null;
  mensagem: string | null;
  entrega: Entrega;
  tentativa: number;
  registradoEm: string;
}

/** Historico completo de um lead, do mais recente para o mais antigo. */
export async function historicoContato(placeId: string): Promise<ItemHistorico[]> {
  const cliente = await db();
  const { rows } = await cliente.execute({
    sql: `SELECT * FROM contact_log WHERE place_id = ? ORDER BY registrado_em DESC, id DESC`,
    args: [placeId],
  });

  return rows.map((r) => ({
    id: Number(r.id),
    canal: String(r.canal),
    templateId: r.template_id ? String(r.template_id) : null,
    templateNome: r.template_nome ? String(r.template_nome) : null,
    mensagem: r.mensagem ? String(r.mensagem) : null,
    entrega: String(r.entrega) as Entrega,
    tentativa: Number(r.tentativa),
    registradoEm: String(r.registrado_em),
  }));
}

/**
 * Quantos envios sairam hoje. Alimenta o contador do modo disparo, que avisa
 * antes de voce passar do limite diario e queimar o numero.
 */
export async function enviosNoDia(dia: Date = new Date()): Promise<number> {
  const cliente = await db();
  const inicio = new Date(dia);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio.getTime() + 86_400_000);

  const { rows } = await cliente.execute({
    sql: `SELECT COUNT(*) AS n FROM contact_log
          WHERE entrega = 'enviado' AND registrado_em >= ? AND registrado_em < ?`,
    args: [inicio.toISOString(), fim.toISOString()],
  });

  return Number(rows[0]?.n ?? 0);
}

export interface MudancaStatus {
  placeId: string;
  status: StatusCrm;
  motivoPerda?: MotivoPerda | null;
  valorFechado?: number | null;
  notas?: string | null;
}

/** Move o lead no funil. Chamado pelo Kanban e pelo detalhe do lead. */
export async function atualizarStatus(mudanca: MudancaStatus): Promise<void> {
  const cliente = await db();
  const ts = agora();

  const respondeu = ['respondeu', 'negociando', 'fechado'].includes(mudanca.status);
  const finalizou = ['fechado', 'perdido'].includes(mudanca.status);

  await cliente.execute({
    sql: `INSERT INTO lead_crm (place_id, status, atualizado_em)
          VALUES (?, ?, ?)
          ON CONFLICT (place_id) DO NOTHING`,
    args: [mudanca.placeId, mudanca.status, ts],
  });

  await cliente.execute({
    sql: `UPDATE lead_crm SET
            status = ?,
            motivo_perda = ?,
            valor_fechado = COALESCE(?, valor_fechado),
            notas = COALESCE(?, notas),
            respondeu_em = ${respondeu ? 'COALESCE(respondeu_em, ?)' : 'respondeu_em'},
            finalizado_em = ${finalizou ? '?' : 'NULL'},
            atualizado_em = ?
          WHERE place_id = ?`,
    args: [
      mudanca.status,
      mudanca.status === 'perdido' ? (mudanca.motivoPerda ?? null) : null,
      mudanca.valorFechado ?? null,
      mudanca.notas ?? null,
      ...(respondeu ? [ts] : []),
      ...(finalizou ? [ts] : []),
      ts,
      mudanca.placeId,
    ],
  });
}
