/**
 * Enriquecimento em lote, com progresso transmitido na resposta.
 *
 * Duas travas de boa vizinhanca: no maximo quatro paginas ao mesmo tempo, e
 * nunca duas paginas do mesmo dominio numa mesma rodada. Sem a segunda, uma
 * varredura de rede de franquias bateria dezenas de vezes no mesmo servidor.
 */

import { z } from 'zod';
import { db, agora } from '@/lib/db/index';
import { listarLeads } from '@/lib/db/leads';
import { buscarContatos, extrairDaUrl } from '@/lib/enrich/crawler';
import { comLimite } from '@/lib/async';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CONCORRENCIA = 4;

const Corpo = z.object({
  searchId: z.string().nullish(),
  /** Teto de leads por rodada, para a requisicao nao passar do tempo limite. */
  limite: z.number().int().min(1).max(400).optional(),
});

export async function POST(requisicao: Request) {
  let dados: z.infer<typeof Corpo>;
  try {
    dados = Corpo.parse(await requisicao.json().catch(() => ({})));
  } catch (erro) {
    return Response.json({ erro: 'Parametros invalidos', detalhe: String(erro) }, { status: 400 });
  }

  const cliente = await db();

  // Somente leads sem enriquecimento ainda. Repetir os que ja foram seria gastar
  // requisicao de rede para reescrever o mesmo dado.
  const { leads } = await listarLeads({
    searchId: dados.searchId ?? undefined,
    incluirComSite: true,
    limite: dados.limite ?? 120,
  });

  const pendentes = leads.filter((l) => !l.statusEnriquecimento);

  const codificador = new TextEncoder();
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
          // Cliente desconectou.
        }
      };

      let feitos = 0;
      let comContato = 0;
      let adiados = 0;
      const dominiosUsados = new Set<string>();

      enviar('inicio', { total: pendentes.length });

      try {
        await comLimite(pendentes, CONCORRENCIA, async (lead) => {
          if (controle.signal.aborted) return;

          /*
           * O limite de um acesso por dominio vale apenas para quem exige
           * baixar a pagina. Perfil de Instagram, Facebook e link de WhatsApp
           * saem da propria URL, sem rede, e por isso nao consomem a cota do
           * dominio. Isso importa muito aqui: instagram.com e o host mais comum
           * entre os leads bons, e aplicar a trava a eles deixaria justamente os
           * melhores sem enriquecer.
           */
          const semRede = extrairDaUrl(lead.websiteUrl);
          const host = lead.websiteHost;

          if (!semRede && host && dominiosUsados.has(host)) {
            /*
             * Adiado, nao concluido. Nao grava status nenhum de proposito: se
             * gravasse, o filtro de pendentes o excluiria para sempre e este
             * lead nunca mais seria enriquecido, sem ninguem perceber.
             */
            adiados += 1;
            return;
          }

          if (!semRede && host) dominiosUsados.add(host);
          const contatos = semRede ?? (await buscarContatos(lead.websiteUrl));

          await cliente.execute({
            sql: `INSERT INTO enrichment
                    (place_id, email, instagram, facebook, whatsapp, status, erro, buscado_em)
                  VALUES (?,?,?,?,?,?,?,?)
                  ON CONFLICT (place_id) DO UPDATE SET
                    email = excluded.email,
                    instagram = excluded.instagram,
                    facebook = excluded.facebook,
                    whatsapp = excluded.whatsapp,
                    status = excluded.status,
                    erro = excluded.erro,
                    buscado_em = excluded.buscado_em`,
            args: [
              lead.placeId,
              contatos.email,
              contatos.instagram,
              contatos.facebook,
              contatos.whatsapp,
              contatos.status,
              contatos.erro,
              agora(),
            ],
          });

          feitos += 1;
          if (contatos.email || contatos.instagram || contatos.whatsapp) comContato += 1;

          enviar('progresso', {
            feitos,
            total: pendentes.length,
            comContato,
            nome: lead.nome,
          });
        });

        // `adiados` vai para a resposta em vez de sumir: uma rodada que cobriu
        // menos do que parecia precisa dizer isso.
        enviar('concluido', { feitos, total: pendentes.length, comContato, adiados });
      } catch (erro) {
        enviar('erro', {
          mensagem: erro instanceof Error ? erro.message : 'Falha ao enriquecer',
        });
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
      'X-Accel-Buffering': 'no',
    },
  });
}
