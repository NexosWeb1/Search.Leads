import { geocodificar, PlacesError } from '@/lib/places/client';

export const runtime = 'nodejs';

export async function GET(requisicao: Request) {
  const consulta = new URL(requisicao.url).searchParams.get('q')?.trim();

  if (!consulta || consulta.length < 3) {
    return Response.json({ locais: [] });
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return Response.json(
      { erro: 'Chave da Google Maps API nao configurada' },
      { status: 503 },
    );
  }

  try {
    const locais = await geocodificar(consulta);
    return Response.json({ locais });
  } catch (erro) {
    const status = erro instanceof PlacesError ? erro.status : 500;
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao localizar' },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
