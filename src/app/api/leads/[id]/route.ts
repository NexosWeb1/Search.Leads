import { z } from 'zod';
import { atualizarStatus } from '@/lib/contacts/log';
import { carregarLeadsPorIds } from '@/lib/db/leads';
import { MOTIVOS_PERDA, STATUS_CRM } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.object({
  status: z.enum(STATUS_CRM),
  motivoPerda: z.enum(MOTIVOS_PERDA).nullish(),
  valorFechado: z.number().min(0).nullish(),
  notas: z.string().max(4000).nullish(),
});

export async function PATCH(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;

  try {
    const dados = Corpo.parse(await requisicao.json());

    // Perder sem motivo deixa o dashboard sem a informacao que mais importa:
    // por que os negocios nao fecham.
    if (dados.status === 'perdido' && !dados.motivoPerda) {
      return Response.json(
        { erro: 'Informe o motivo da perda' },
        { status: 400 },
      );
    }

    await atualizarStatus({ placeId: id, ...dados });

    const [lead] = await carregarLeadsPorIds([id]);
    return Response.json({ lead });
  } catch (erro) {
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao atualizar lead' },
      { status: 400 },
    );
  }
}

export async function GET(
  _requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const [lead] = await carregarLeadsPorIds([id]);

  if (!lead) return Response.json({ erro: 'Lead nao encontrado' }, { status: 404 });
  return Response.json({ lead });
}
