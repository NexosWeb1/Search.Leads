import { montarResultados } from '@/lib/contacts/funnel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(requisicao: Request) {
  const p = new URL(requisicao.url).searchParams;
  const dias = Number(p.get('dias'));

  try {
    const resultados = await montarResultados({
      searchId: p.get('searchId'),
      dias: Number.isFinite(dias) && dias > 0 ? Math.min(dias, 730) : 90,
    });
    return Response.json(resultados);
  } catch (erro) {
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao montar o painel' },
      { status: 500 },
    );
  }
}
