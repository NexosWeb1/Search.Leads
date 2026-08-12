/**
 * Inicia uma varredura e transmite o progresso na propria resposta.
 *
 * O progresso vai por streaming no POST em vez de um endpoint separado de SSE.
 * Isso evita ter de guardar buscas em andamento numa tabela em memoria, que
 * quebraria no primeiro recarregamento do servidor em desenvolvimento. O cliente
 * le com fetch e um reader de stream, e nao com EventSource, que so faz GET.
 */

import { z } from 'zod';
import { acharNicho } from '@/lib/niches';
import { varrer, estimarVarredura } from '@/lib/search/runner';
import { PlacesError } from '@/lib/places/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Uma varredura grande passa do limite padrao de execucao.
export const maxDuration = 300;

const Corpo = z.object({
  nichoId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  raioKm: z.number().min(0.5).max(50),
  localLabel: z.string().min(1).max(200),
  maxRequisicoes: z.number().int().min(1).max(2000).optional(),
});

export async function POST(requisicao: Request) {
  let dados: z.infer<typeof Corpo>;

  try {
    dados = Corpo.parse(await requisicao.json());
  } catch (erro) {
    return Response.json(
      { erro: 'Parametros invalidos', detalhe: String(erro) },
      { status: 400 },
    );
  }

  const nicho = acharNicho(dados.nichoId);
  if (!nicho) {
    return Response.json({ erro: `Nicho "${dados.nichoId}" nao existe` }, { status: 400 });
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return Response.json(
      {
        erro: 'Chave da Google Places API nao configurada',
        detalhe:
          'Copie .env.example para .env.local, preencha GOOGLE_MAPS_API_KEY e reinicie o servidor.',
      },
      { status: 503 },
    );
  }

  const codificador = new TextEncoder();
  // O abort do cliente (fechar a aba, cancelar a busca) precisa parar a varredura,
  // senao ela continua queimando cota do Google sem ninguem para receber.
  const controle = new AbortController();
  requisicao.signal.addEventListener('abort', () => controle.abort());

  const stream = new ReadableStream({
    async start(controlador) {
      const enviar = (evento: string, carga: unknown) => {
        try {
          controlador.enqueue(
            codificador.encode(`event: ${evento}\ndata: ${JSON.stringify(carga)}\n\n`),
          );
        } catch {
          // Cliente ja desconectou.
        }
      };

      try {
        enviar('estimativa', estimarVarredura(dados.raioKm));

        const resultado = await varrer({
          centro: { lat: dados.lat, lng: dados.lng },
          raioKm: dados.raioKm,
          nicho,
          localLabel: dados.localLabel,
          maxRequisicoes: dados.maxRequisicoes,
          aoProgredir: (p) => enviar('progresso', p),
          sinal: controle.signal,
        });

        enviar('concluido', resultado);
      } catch (erro) {
        const mensagem =
          erro instanceof PlacesError
            ? traduzirErroPlaces(erro)
            : erro instanceof Error
              ? erro.message
              : 'Falha inesperada na varredura';
        enviar('erro', { mensagem });
      } finally {
        controlador.close();
      }
    },
    cancel() {
      controle.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Erro da API do Google em linguagem util, com o que fazer a respeito. */
function traduzirErroPlaces(erro: PlacesError): string {
  switch (erro.status) {
    case 400:
      return `O Google recusou a requisicao. Isso costuma ser tipo de lugar invalido ou raio fora do limite. Detalhe: ${erro.message}`;
    case 401:
    case 403:
      return 'Chave da API recusada. Confira se a Places API (New) esta ativada, se a chave permite essa API e se o faturamento esta ligado no projeto do Google Cloud.';
    case 429:
      return 'Cota do Google atingida. Espere alguns minutos ou aumente o limite no Google Cloud.';
    default:
      return erro.message;
  }
}
