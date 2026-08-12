import { consumoDoMes, listarBuscas } from '@/lib/db/searches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [buscas, consumo] = await Promise.all([listarBuscas(30), consumoDoMes()]);
    return Response.json({ buscas, consumo });
  } catch (erro) {
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao listar buscas' },
      { status: 500 },
    );
  }
}
