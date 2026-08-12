import { listarLeads } from '@/lib/db/leads';
import { gerarCsv, gerarXlsx, nomeArquivo } from '@/lib/export/planilha';
import { filtrosDaUrl } from '../leads/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(requisicao: Request) {
  const url = new URL(requisicao.url);
  const formato = url.searchParams.get('formato') === 'xlsx' ? 'xlsx' : 'csv';

  try {
    // Exporta exatamente o que os filtros da tela mostram, so que sem o teto de
    // paginacao: nada pior do que exportar e receber 500 de 900 leads.
    const { leads } = await listarLeads({ ...filtrosDaUrl(url), limite: 2000 });

    if (formato === 'xlsx') {
      const conteudo = await gerarXlsx(leads);
      return new Response(new Uint8Array(conteudo), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${nomeArquivo('xlsx')}"`,
        },
      });
    }

    return new Response(gerarCsv(leads), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivo('csv')}"`,
      },
    });
  } catch (erro) {
    return Response.json(
      { erro: erro instanceof Error ? erro.message : 'Falha ao exportar' },
      { status: 500 },
    );
  }
}
