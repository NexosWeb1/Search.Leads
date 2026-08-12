import { listarLeads, type FiltrosLeads, type Ordenacao } from '@/lib/db/leads';
import { STATUS_CRM, type StatusCrm } from '@/lib/db/schema';
import type { Faixa } from '@/lib/scoring/score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAIXAS: Faixa[] = ['muito_bom', 'bom', 'intermediario', 'ruim'];
const ORDENACOES: Ordenacao[] = [
  'relevancia',
  'avaliacoes',
  'distancia',
  'nome',
  'status',
  'recente',
];

/** Le uma lista separada por virgula e descarta valores que nao existem. */
function lista<T extends string>(bruto: string | null, validos: readonly T[]): T[] | undefined {
  if (!bruto) return undefined;
  const itens = bruto
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => (validos as readonly string[]).includes(s));
  return itens.length ? itens : undefined;
}

export function filtrosDaUrl(url: URL): FiltrosLeads {
  const p = url.searchParams;
  const ordenar = p.get('ordenar');
  const contato = p.get('contato');

  return {
    searchId: p.get('searchId') ?? undefined,
    incluirComSite: p.get('incluirComSite') === 'true',
    faixas: lista<Faixa>(p.get('faixas'), FAIXAS),
    status: lista<StatusCrm>(p.get('status'), STATUS_CRM),
    somenteWhatsapp: p.get('whatsapp') === 'true',
    somenteInstagram: p.get('instagram') === 'true',
    somenteEmail: p.get('email') === 'true',
    contato:
      contato === 'nunca' || contato === 'disponivel' || contato === 'contatados'
        ? contato
        : undefined,
    busca: p.get('busca') ?? undefined,
    ordenar: ORDENACOES.includes(ordenar as Ordenacao)
      ? (ordenar as Ordenacao)
      : 'relevancia',
    limite: p.get('limite') ? Number(p.get('limite')) : undefined,
    deslocamento: p.get('deslocamento') ? Number(p.get('deslocamento')) : undefined,
  };
}

export async function GET(requisicao: Request) {
  try {
    const { leads, total } = await listarLeads(filtrosDaUrl(new URL(requisicao.url)));
    return Response.json({ leads, total });
  } catch (erro) {
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao listar leads' },
      { status: 500 },
    );
  }
}
