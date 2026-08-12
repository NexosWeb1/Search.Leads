import { z } from 'zod';
import { enviosNoDia, historicoContato, registrarContato } from '@/lib/contacts/log';
import { ENTREGAS } from '@/lib/db/schema';
import { COOLDOWN_PADRAO } from '@/lib/contacts/cooldown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.object({
  placeId: z.string().min(1),
  entrega: z.enum(ENTREGAS),
  canal: z.enum(['whatsapp', 'telefone', 'email', 'instagram']).optional(),
  mensagem: z.string().max(4000).optional(),
  templateId: z.string().optional(),
  templateNome: z.string().optional(),
});

export async function POST(requisicao: Request) {
  try {
    const dados = Corpo.parse(await requisicao.json());
    const resultado = await registrarContato(dados);
    const enviadosHoje = await enviosNoDia();

    return Response.json({
      ...resultado,
      enviadosHoje,
      limiteDiario: COOLDOWN_PADRAO.limiteDiario,
      // O aviso sobe junto com a resposta para o modo disparo poder mostrar na
      // hora, sem precisar de outra requisicao.
      passouDoLimite: enviadosHoje >= COOLDOWN_PADRAO.limiteDiario,
    });
  } catch (erro) {
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao registrar contato' },
      { status: 400 },
    );
  }
}

/** Historico de um lead, e o contador do dia quando nao vem placeId. */
export async function GET(requisicao: Request) {
  const placeId = new URL(requisicao.url).searchParams.get('placeId');

  try {
    if (!placeId) {
      const enviadosHoje = await enviosNoDia();
      return Response.json({
        enviadosHoje,
        limiteDiario: COOLDOWN_PADRAO.limiteDiario,
      });
    }
    return Response.json({ historico: await historicoContato(placeId) });
  } catch (erro) {
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao ler historico' },
      { status: 500 },
    );
  }
}
