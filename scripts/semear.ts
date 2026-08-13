/**
 * Dados de demonstracao.
 *
 * Serve a dois propositos: permitir voce conhecer a ferramenta antes de criar a
 * chave da Google Places API, e verificar a interface inteira (mapa, cards,
 * Kanban, painel de resultados) sem gastar requisicao paga.
 *
 * Os leads sao inventados, mas o formato e exatamente o que a Places API
 * devolve, entao passam pelo mesmo caminho de normalizacao, score e persistencia
 * que os dados reais.
 *
 * Uso:
 *   npm run semear
 *   npm run semear -- --limpar        (remove so a demonstracao)
 *   npm run semear -- --limpar-tudo   (zera o banco inteiro)
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

import { db, fecharDb } from '../src/lib/db/index';
import { criarBusca, finalizarBusca } from '../src/lib/db/searches';
import { salvarLeads } from '../src/lib/db/leads';
import { normalizarPlace } from '../src/lib/leads/mapear';
import { atualizarStatus, registrarContato } from '../src/lib/contacts/log';
import { haversineMeters } from '../src/lib/geo';
import type { PlaceBruto } from '../src/lib/places/client';
import type { Entrega, MotivoPerda, StatusCrm } from '../src/lib/db/schema';

const CENTRO = { lat: -30.0346, lng: -51.2177 };

/** Gerador com semente fixa, para o mesmo comando dar sempre o mesmo resultado. */
function rng(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return s / 4_294_967_296;
  };
}

const rnd = rng(20260812);
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(rnd() * lista.length)];
const inteiro = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1));

const BAIRROS = [
  'Centro Historico', 'Moinhos de Vento', 'Cidade Baixa', 'Bom Fim', 'Menino Deus',
  'Petropolis', 'Partenon', 'Tristeza', 'Ipanema', 'Higienopolis', 'Santana', 'Azenha',
];

const NOMES_BARBEARIA = [
  'Barbearia do Ze', 'Barber Shop Vintage', 'Corte Fino', 'Navalha de Ouro',
  'Studio Masculino', 'Barbearia Central', 'Don Barbeiro', 'Old School Barber',
  'Barbearia Imperial', 'Tesoura de Prata', 'Barba Negra', 'Corte e Estilo',
];

const NOMES_CLINICA = [
  'Clinica Vida Plena', 'Centro Medico Sul', 'Clinica Bem Estar', 'Instituto Saude Total',
  'Clinica Sao Lucas', 'Medcenter Porto', 'Clinica Renascer', 'Consultorio Dr. Almeida',
  'Clinica Integrada Vida', 'Nucleo Medico Moinhos',
];

const NOMES_SALAO = [
  'Salao Bella Donna', 'Espaco Beleza', 'Studio Hair', 'Salao Charme',
  'Beauty Place', 'Cabelo e Cia', 'Salao Glamour', 'Atelier da Beleza',
  'Studio W Cabelos', 'Espaco Vaidosa',
];

/**
 * Distribuicao de site que imita o que se ve de verdade no Brasil: a maioria sem
 * nada, uma parte grande com Instagram no campo de site, alguns com o site
 * gratis do Google, e uma minoria com dominio proprio.
 */
const SITES: Array<string | undefined> = [
  undefined, undefined, undefined, undefined, undefined, undefined,
  'https://instagram.com/exemplo',
  'https://instagram.com/exemplo2',
  'https://www.facebook.com/exemplo',
  'https://exemplo.negocio.site/',
  'https://exemplo.business.site',
  'https://exemplo.wixsite.com/meusite',
  'https://www.doctoralia.com.br/exemplo',
  'https://www.ifood.com.br/delivery/exemplo',
  'https://exemplo.com.br',
  'https://www.exemplonegocio.com.br',
];

function ddd(): string {
  return escolher(['51', '51', '51', '51', '54']);
}

function telefone(): string | undefined {
  const sorte = rnd();
  if (sorte < 0.08) return undefined; // sem telefone
  if (sorte < 0.2) return `+55 ${ddd()} 3${inteiro(200, 999)}-${inteiro(1000, 9999)}`; // fixo
  return `+55 ${ddd()} 9${inteiro(1000, 9999)}-${inteiro(1000, 9999)}`; // celular
}

function place(id: string, nome: string, tipo: string, tipoLabel: string): PlaceBruto {
  // Espalha os pontos por area dentro de um raio de cerca de 12 km.
  const distancia = 12_000 * Math.sqrt(rnd());
  const angulo = rnd() * Math.PI * 2;
  const lat = CENTRO.lat + (Math.sin(angulo) * distancia) / 111_320;
  const lng =
    CENTRO.lng +
    (Math.cos(angulo) * distancia) /
      (111_320 * Math.cos((CENTRO.lat * Math.PI) / 180));

  const bairro = escolher(BAIRROS);
  const temAvaliacoes = rnd() > 0.15;

  return {
    id,
    displayName: { text: nome },
    formattedAddress: `Rua ${escolher(['das Flores', 'General Camara', 'dos Andradas', 'Independencia', 'Protasio Alves'])}, ${inteiro(10, 1900)} - ${bairro}, Porto Alegre - RS`,
    shortFormattedAddress: `Rua ${escolher(['das Flores', 'General Camara', 'dos Andradas'])}, ${inteiro(10, 1900)} - ${bairro}`,
    postalAddress: {
      locality: 'Porto Alegre',
      sublocality: bairro,
      administrativeArea: 'RS',
      postalCode: `9${inteiro(1000, 9999)}-${inteiro(100, 999)}`,
    },
    location: { latitude: lat, longitude: lng },
    types: [tipo],
    primaryType: tipo,
    primaryTypeDisplayName: { text: tipoLabel },
    businessStatus: rnd() > 0.03 ? 'OPERATIONAL' : 'CLOSED_TEMPORARILY',
    googleMapsUri: `https://maps.google.com/?cid=${id}`,
    rating: temAvaliacoes ? Number((3 + rnd() * 2).toFixed(1)) : undefined,
    userRatingCount: temAvaliacoes ? inteiro(1, 420) : undefined,
    internationalPhoneNumber: telefone(),
    websiteUri: escolher(SITES),
    regularOpeningHours:
      rnd() > 0.3 ? { weekdayDescriptions: ['segunda: 09:00 - 19:00'] } : undefined,
  };
}

interface Conjunto {
  nichoId: string;
  nichoLabel: string;
  tipo: string;
  tipoLabel: string;
  nomes: readonly string[];
  copias: number;
}

const CONJUNTOS: Conjunto[] = [
  {
    nichoId: 'barbearia',
    nichoLabel: 'Barbearia',
    tipo: 'barber_shop',
    tipoLabel: 'Barbearia',
    nomes: NOMES_BARBEARIA,
    copias: 4,
  },
  {
    nichoId: 'clinica-medica',
    nichoLabel: 'Clinica medica',
    tipo: 'medical_clinic',
    tipoLabel: 'Clinica medica',
    nomes: NOMES_CLINICA,
    copias: 3,
  },
  {
    nichoId: 'salao-beleza',
    nichoLabel: 'Salao de beleza',
    tipo: 'beauty_salon',
    tipoLabel: 'Salao de beleza',
    nomes: NOMES_SALAO,
    copias: 3,
  },
];

/**
 * Rotulo das buscas de demonstracao.
 *
 * Aparece na lista de buscas anteriores, entao voce distingue no olho o que e
 * inventado do que veio do Google. E tambem o que permite apagar so a
 * demonstracao sem encostar nas varreduras reais, que custaram requisicao.
 */
const LOCAL_DEMO = 'Porto Alegre, RS (dados de demonstracao)';

/** Quantos leads reais existem hoje. Sustenta as travas abaixo. */
async function contarReais(): Promise<number> {
  const sql = await db();
  const [linha] = await sql<{ n: string }[]>`
    SELECT COUNT(*) AS n FROM leads WHERE place_id NOT LIKE 'demo-%'
  `;
  return Number(linha?.n ?? 0);
}

/** Apaga somente o que este script criou. Leads reais ficam intactos. */
async function limparDemo(): Promise<void> {
  const sql = await db();

  const [antes] = await sql<{ n: string }[]>`
    SELECT COUNT(*) AS n FROM leads WHERE place_id LIKE 'demo-%'
  `;

  // O ON DELETE CASCADE do schema cuida de search_leads, lead_crm, enrichment e
  // contact_log; apagar o lead ja leva tudo o que aponta para ele.
  await sql`DELETE FROM leads WHERE place_id LIKE 'demo-%'`;
  await sql`DELETE FROM searches WHERE local_label = ${LOCAL_DEMO}`;

  /*
   * Varre buscas que ficaram sem nenhum lead depois da limpeza. Sao restos de
   * demonstracao gerados antes de existir o rotulo LOCAL_DEMO, e enquanto
   * estiverem no banco elas inflam o contador de requisicoes do mes com numeros
   * inventados, o que e pior do que nao ter contador nenhum.
   *
   * O filtro por status concluida protege as varreduras reais que falharam no
   * meio: essas tambem tem zero leads, mas o registro do que foi gasto nelas
   * precisa ser preservado.
   */
  const orfas = await sql`
    DELETE FROM searches
    WHERE status = 'concluida'
      AND id NOT IN (SELECT search_id FROM search_leads)
  `;

  console.log(`${antes?.n ?? 0} leads de demonstracao removidos.`);
  if ((orfas.count ?? 0) > 0) {
    console.log(`${orfas.count} buscas de demonstracao orfas removidas.`);
  }
  console.log('As varreduras reais continuam no banco.');
}

/**
 * Zera o banco inteiro, inclusive o que veio do Google e custou requisicao.
 *
 * Exige `--tenho-certeza` quando ha lead real. A trava existe porque
 * desenvolvimento e producao compartilham o mesmo banco do Supabase: sem ela,
 * um comando digitado por engano apagaria a carteira e, o que e pior, o
 * historico de contato, que nao volta de jeito nenhum.
 */
async function limparTudo(confirmado: boolean): Promise<void> {
  const sql = await db();
  const quantos = await contarReais();

  if (quantos > 0 && !confirmado) {
    console.error(`\nRECUSADO. Existem ${quantos} leads reais neste banco.`);
    console.error('Apagar leva junto o historico de contato deles, que nao volta.\n');
    console.error('Se e isso mesmo que voce quer:');
    console.error('  npm run semear -- --limpar-tudo --tenho-certeza\n');
    console.error('Para remover so a demonstracao:');
    console.error('  npm run semear -- --limpar\n');
    process.exit(1);
  }

  // A ordem importa mesmo com CASCADE: searches primeiro levaria search_leads.
  await sql`DELETE FROM leads`;
  await sql`DELETE FROM searches`;
  await sql`DELETE FROM cell_cache`;

  console.log('Banco zerado.');
  if (quantos > 0) {
    console.log(
      `${quantos} leads reais foram apagados junto, e com eles o historico de contato deles.`,
    );
  }
}

async function principal(): Promise<void> {
  const args = process.argv.slice(2);

  // `--limpar` sozinho e seguro de proposito: apaga so a demonstracao. Zerar o
  // banco inteiro exige pedir explicitamente, porque leva junto varreduras que
  // custaram requisicao paga e o historico de contato delas.
  if (args.includes('--limpar-tudo')) {
    await limparTudo(args.includes('--tenho-certeza'));
    return;
  }

  if (args.includes('--limpar')) {
    await limparDemo();
    if (args.length === 1) return;
  }

  /*
   * Semear no mesmo banco que guarda leads reais mistura telefone inventado com
   * telefone de verdade, e o painel passa a somar os dois. Como aqui
   * desenvolvimento e producao compartilham o banco, isso e facil de fazer sem
   * perceber.
   */
  const reais = await contarReais();
  if (reais > 0 && !args.includes('--misturar')) {
    console.error(`\nRECUSADO. Este banco ja tem ${reais} leads reais.`);
    console.error('Semear misturaria dados inventados com os seus, e o painel de');
    console.error('resultados passaria a somar telefone ficticio com telefone real.\n');
    console.error('Se quiser mesmo assim:');
    console.error('  npm run semear -- --misturar\n');
    process.exit(1);
  }

  // Semear duas vezes duplicaria os dados de demonstracao.
  await limparDemo();

  let totalLeads = 0;
  const idsPorNicho = new Map<string, string[]>();

  for (const conjunto of CONJUNTOS) {
    const searchId = await criarBusca({
      nichoId: conjunto.nichoId,
      nichoLabel: conjunto.nichoLabel,
      localLabel: LOCAL_DEMO,
      centroLat: CENTRO.lat,
      centroLng: CENTRO.lng,
      raioKm: 15,
      celulasTotal: 28,
    });

    const paraSalvar = [];
    const ids: string[] = [];

    for (let copia = 0; copia < conjunto.copias; copia++) {
      for (const nomeBase of conjunto.nomes) {
        const sufixo = copia === 0 ? '' : ` ${escolher(BAIRROS)}`;
        const id = `demo-${conjunto.nichoId}-${copia}-${nomeBase.replace(/\W+/g, '')}`;
        const bruto = place(id, `${nomeBase}${sufixo}`, conjunto.tipo, conjunto.tipoLabel);
        const lead = normalizarPlace(bruto);
        if (!lead) continue;

        const distanciaM = haversineMeters(CENTRO, { lat: lead.lat, lng: lead.lng });
        if (distanciaM > 15_000) continue;

        paraSalvar.push({ lead, distanciaM });
        ids.push(id);
      }
    }

    await salvarLeads(searchId, paraSalvar);
    idsPorNicho.set(conjunto.nichoId, ids);
    totalLeads += paraSalvar.length;

    const semSite = paraSalvar.filter((p) => !p.lead.site.temSiteReal).length;
    await finalizarBusca(searchId, {
      status: 'concluida',
      totalNoRaio: paraSalvar.length,
      totalSemSite: semSite,
      requisicoes: 31,
      custoUsd: (31 * 35) / 1000,
      celulasFeitas: 31,
      celulasSaturadas: 3,
    });

    console.log(
      `${conjunto.nichoLabel}: ${paraSalvar.length} leads, ${semSite} sem site de verdade`,
    );
  }

  // Historico de contato com desfechos variados, para o painel de resultados ter
  // o que mostrar nos blocos de deu certo e deu errado.
  const todos = [...idsPorNicho.values()].flat();
  const dia = 86_400_000;

  const roteiro: Array<{
    quantidade: number;
    entrega: Entrega;
    status?: StatusCrm;
    motivo?: MotivoPerda;
    valor?: number;
    diasAtras: number;
  }> = [
    { quantidade: 4, entrega: 'enviado', status: 'fechado', valor: 2400, diasAtras: 40 },
    { quantidade: 2, entrega: 'enviado', status: 'fechado', valor: 3800, diasAtras: 22 },
    { quantidade: 5, entrega: 'enviado', status: 'negociando', diasAtras: 9 },
    { quantidade: 6, entrega: 'enviado', status: 'respondeu', diasAtras: 5 },
    { quantidade: 5, entrega: 'enviado', status: 'perdido', motivo: 'achou_caro', diasAtras: 30 },
    { quantidade: 4, entrega: 'enviado', status: 'perdido', motivo: 'sem_resposta', diasAtras: 35 },
    { quantidade: 3, entrega: 'enviado', status: 'perdido', motivo: 'ja_tem_fornecedor', diasAtras: 28 },
    { quantidade: 2, entrega: 'enviado', status: 'perdido', motivo: 'sem_interesse', diasAtras: 20 },
    // Contatados recentemente: e este grupo que precisa aparecer bloqueado.
    { quantidade: 14, entrega: 'enviado', diasAtras: 2 },
    // Saiu do periodo de espera: fila de follow-up.
    { quantidade: 7, entrega: 'enviado', diasAtras: 25 },
    // Falhas tecnicas: nao gastam tentativa e voltam para a fila.
    { quantidade: 5, entrega: 'numero_invalido', diasAtras: 6 },
    { quantidade: 3, entrega: 'sem_whatsapp', diasAtras: 4 },
    { quantidade: 4, entrega: 'pulado', diasAtras: 3 },
  ];

  const sql = await db();
  let cursor = 0;

  for (const passo of roteiro) {
    for (let i = 0; i < passo.quantidade && cursor < todos.length; i++, cursor++) {
      const placeId = todos[cursor];

      await registrarContato({
        placeId,
        entrega: passo.entrega,
        canal: 'whatsapp',
        templateId: 'padrao',
        templateNome: 'Abordagem inicial',
        mensagem:
          'Oi! Tudo bem? Vi o perfil de voces no Google e notei que ainda nao tem um site proprio. Trabalho criando sites aqui em Porto Alegre e imaginei que poderia ajudar.',
      });

      // Recua a data do contato, senao tudo cai em "contatado hoje" e nao da
      // para ver o cooldown expirando nem a fila de follow-up funcionando.
      const quando = new Date(Date.now() - passo.diasAtras * dia);
      await sql`UPDATE contact_log SET registrado_em = ${quando} WHERE place_id = ${placeId}`;

      // Somente envio de verdade tem data de contato. Falha tecnica deixa
      // registro no historico mas nao inicia periodo de espera, entao recuar a
      // data dela aqui criaria um estado que a producao nunca produz.
      if (passo.entrega === 'enviado') {
        await sql`
          UPDATE lead_crm
          SET ultimo_contato_em = ${quando}, primeiro_contato_em = ${quando}
          WHERE place_id = ${placeId}
        `;
      }

      if (passo.status) {
        await atualizarStatus({
          placeId,
          status: passo.status,
          motivoPerda: passo.motivo ?? null,
          valorFechado: passo.valor ?? null,
        });
        // A resposta veio depois do contato, nunca antes.
        const respondeu = new Date(Date.now() - (passo.diasAtras - 2) * dia);
        await sql`
          UPDATE lead_crm SET respondeu_em = ${respondeu}
          WHERE place_id = ${placeId} AND respondeu_em IS NOT NULL
        `;
      }
    }
  }

  console.log(`\n${totalLeads} leads no total, ${cursor} com historico de contato.`);
  console.log('Abra http://localhost:3000 e veja o mapa, o Kanban e o Painel.');
  console.log('Para remover so a demonstracao: npm run semear -- --limpar');
}

principal()
  .then(() => fecharDb())
  .then(() => process.exit(0))
  .catch(async (erro) => {
    console.error('Falhou:', erro instanceof Error ? erro.message : erro);
    await fecharDb().catch(() => {});
    process.exit(1);
  });
