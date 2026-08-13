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

import type { Row } from 'postgres';
import { db } from '../db/index';
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
  const sql = await db();
  const contouTentativa = contato.entrega === 'enviado';

  return sql.begin(async (tx) => {
    await tx`
      INSERT INTO lead_crm (place_id, status)
      VALUES (${contato.placeId}, 'novo')
      ON CONFLICT (place_id) DO NOTHING
    `;

    /*
     * FOR UPDATE trava a linha ate o fim da transacao. Sem isso, dois envios
     * simultaneos para o mesmo lead leriam `tentativas` antes de qualquer um
     * gravar, e os dois registrariam a mesma tentativa numero N.
     */
    const [atual] = await tx<{ status: StatusCrm; tentativas: number }[]>`
      SELECT status, tentativas FROM lead_crm WHERE place_id = ${contato.placeId} FOR UPDATE
    `;

    const statusAtual = (atual?.status ?? 'novo') as StatusCrm;
    const tentativasAtuais = Number(atual?.tentativas ?? 0);
    const tentativa = contouTentativa ? tentativasAtuais + 1 : tentativasAtuais;

    await tx`
      INSERT INTO contact_log (
        place_id, canal, template_id, template_nome, mensagem, entrega, tentativa
      ) VALUES (
        ${contato.placeId}, ${contato.canal ?? 'whatsapp'},
        ${contato.templateId ?? null}, ${contato.templateNome ?? null},
        ${contato.mensagem ?? null}, ${contato.entrega}, ${tentativa}
      )
    `;

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

    await tx`
      UPDATE lead_crm SET
        status = ${statusNovo},
        tentativas = ${tentativa},
        primeiro_contato_em = COALESCE(primeiro_contato_em, now()),
        ultimo_contato_em = now(),
        atualizado_em = now()
      WHERE place_id = ${contato.placeId}
    `;

    return { tentativa, statusNovo, contouTentativa: true };
  });
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

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v ?? '');

function paraItem(r: Row): ItemHistorico {
  return {
    id: Number(r.id),
    canal: String(r.canal),
    templateId: r.template_id ? String(r.template_id) : null,
    templateNome: r.template_nome ? String(r.template_nome) : null,
    mensagem: r.mensagem ? String(r.mensagem) : null,
    entrega: String(r.entrega) as Entrega,
    tentativa: Number(r.tentativa),
    registradoEm: iso(r.registrado_em),
  };
}

/** Historico completo de um lead, do mais recente para o mais antigo. */
export async function historicoContato(placeId: string): Promise<ItemHistorico[]> {
  const sql = await db();
  const linhas = await sql`
    SELECT * FROM contact_log
    WHERE place_id = ${placeId}
    ORDER BY registrado_em DESC, id DESC
  `;
  return linhas.map(paraItem);
}

/**
 * Quantos envios sairam hoje. Alimenta o contador do modo disparo, que avisa
 * antes de voce passar do limite diario e queimar o numero.
 *
 * O corte usa o fuso do banco. Como o Supabase roda em UTC, "hoje" pode nao
 * bater com o seu dia no Brasil perto da meia-noite; o corte explicito no fuso
 * de Sao Paulo resolve.
 */
export async function enviosNoDia(dia: Date = new Date()): Promise<number> {
  const sql = await db();

  const [linha] = await sql<{ n: string }[]>`
    SELECT COUNT(*) AS n FROM contact_log
    WHERE entrega = 'enviado'
      AND (registrado_em AT TIME ZONE 'America/Sao_Paulo')::date
        = (${dia} AT TIME ZONE 'America/Sao_Paulo')::date
  `;

  return Number(linha?.n ?? 0);
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
  const sql = await db();

  const respondeu = ['respondeu', 'negociando', 'fechado'].includes(mudanca.status);
  const finalizou = ['fechado', 'perdido'].includes(mudanca.status);

  await sql`
    INSERT INTO lead_crm (place_id, status)
    VALUES (${mudanca.placeId}, ${mudanca.status})
    ON CONFLICT (place_id) DO NOTHING
  `;

  await sql`
    UPDATE lead_crm SET
      status = ${mudanca.status},
      motivo_perda = ${mudanca.status === 'perdido' ? (mudanca.motivoPerda ?? null) : null},
      valor_fechado = COALESCE(${mudanca.valorFechado ?? null}, valor_fechado),
      notas = COALESCE(${mudanca.notas ?? null}, notas),
      respondeu_em = ${respondeu ? sql`COALESCE(respondeu_em, now())` : sql`respondeu_em`},
      finalizado_em = ${finalizou ? sql`now()` : sql`NULL`},
      atualizado_em = now()
    WHERE place_id = ${mudanca.placeId}
  `;
}
