/**
 * Varredura pela linha de comando.
 *
 * Existe para validar o motor de busca e o custo real antes de qualquer tela.
 * Se este script traz leads de verdade e o numero de requisicoes bate com o
 * console do Google Cloud, o nucleo da plataforma esta correto.
 *
 * Uso:
 *   npm run scan -- --nicho clinica-medica --cidade "Porto Alegre, RS" --raio 20
 *   npm run scan -- --nicho barbearia --cidade "Canoas, RS" --raio 8 --max-req 120
 *   npm run scan -- --nicho geral --cidade "Gravatai, RS" --raio 10 --estimar
 *   npm run scan -- --listar-nichos
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

import { acharNicho, NICHOS } from '../src/lib/niches';
import { geocodificar } from '../src/lib/places/client';
import { estimarVarredura, varrer } from '../src/lib/search/runner';
import { listarLeads } from '../src/lib/db/leads';
import { ROTULO_FAIXA } from '../src/lib/scoring/score';

function argumentos(argv: string[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const chave = item.slice(2);
    const proximo = argv[i + 1];
    if (proximo && !proximo.startsWith('--')) {
      mapa.set(chave, proximo);
      i++;
    } else {
      mapa.set(chave, 'true');
    }
  }
  return mapa;
}

const usd = (v: number) => `USD ${v.toFixed(2)}`;

function barra(feitas: number, total: number, largura = 24): string {
  const proporcao = total > 0 ? Math.min(1, feitas / total) : 0;
  const cheias = Math.round(proporcao * largura);
  return `[${'#'.repeat(cheias)}${'.'.repeat(largura - cheias)}]`;
}

async function principal(): Promise<void> {
  const args = argumentos(process.argv.slice(2));

  if (args.has('listar-nichos')) {
    let grupoAtual = '';
    for (const nicho of NICHOS) {
      if (nicho.grupo !== grupoAtual) {
        grupoAtual = nicho.grupo;
        console.log(`\n${grupoAtual}`);
      }
      console.log(`  ${nicho.id.padEnd(24)} ${nicho.label}`);
    }
    console.log();
    return;
  }

  const nichoId = args.get('nicho') ?? 'geral';
  const cidade = args.get('cidade');
  const raioKm = Number(args.get('raio') ?? 10);
  const somenteEstimar = args.has('estimar');

  const nicho = acharNicho(nichoId);
  if (!nicho) {
    console.error(
      `Nicho "${nichoId}" nao existe. Rode com --listar-nichos para ver as opcoes.`,
    );
    process.exit(1);
  }

  if (!cidade) {
    console.error('Falta --cidade. Exemplo: --cidade "Porto Alegre, RS"');
    process.exit(1);
  }

  if (!Number.isFinite(raioKm) || raioKm <= 0 || raioKm > 50) {
    console.error('O --raio precisa ser um numero entre 1 e 50 (km).');
    process.exit(1);
  }

  const estimativa = estimarVarredura(raioKm);
  console.log(`\nNicho    ${nicho.label} (${nicho.types.length} tipos)`);
  console.log(`Local    ${cidade}`);
  console.log(`Raio     ${raioKm} km`);
  console.log(
    `Grade    ${estimativa.celulas} celulas de ${(estimativa.raioCelulaM / 1000).toFixed(1)} km`,
  );
  console.log(
    `Custo    ${usd(estimativa.custoMinimoUsd)} sem subdivisao, ate ${usd(estimativa.custoMaximoUsd)} no pior caso`,
  );
  console.log(`         (a cota gratuita cobre 1.000 requisicoes por mes)\n`);

  if (somenteEstimar) return;

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error(
      'GOOGLE_MAPS_API_KEY nao configurada.\n' +
        'Copie .env.example para .env.local e preencha a chave.\n' +
        'Para so ver a estimativa de custo, rode com --estimar.',
    );
    process.exit(1);
  }

  const locais = await geocodificar(cidade);
  if (locais.length === 0) {
    console.error(`Nao encontrei "${cidade}".`);
    process.exit(1);
  }
  const local = locais[0];
  console.log(`Centro   ${local.label}`);
  console.log(`         ${local.lat.toFixed(5)}, ${local.lng.toFixed(5)}\n`);

  const inicio = Date.now();
  let ultimaLinha = '';

  const resultado = await varrer({
    centro: { lat: local.lat, lng: local.lng },
    raioKm,
    nicho,
    localLabel: local.label,
    maxRequisicoes: args.has('max-req') ? Number(args.get('max-req')) : undefined,
    aoProgredir: (p) => {
      if (p.fase !== 'varrendo') return;
      const linha =
        `${barra(p.celulasFeitas, p.celulasTotal)} ` +
        `${p.celulasFeitas}/${p.celulasTotal} celulas  ` +
        `nivel ${p.nivel}  ${p.encontrados} achados  ` +
        `${p.requisicoes} req  ${usd(p.custoUsd)}`;
      if (linha !== ultimaLinha) {
        process.stdout.write(`\r${linha.padEnd(100)}`);
        ultimaLinha = linha;
      }
    },
  });

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  process.stdout.write('\r'.padEnd(102) + '\r');

  console.log(`Concluida em ${segundos}s\n`);
  console.log(`Comercios no raio     ${resultado.totalNoRaio}`);
  console.log(`Sem site de verdade   ${resultado.totalSemSite}`);
  console.log(`Celulas saturadas     ${resultado.celulasSaturadas}`);
  console.log(`Celulas do cache      ${resultado.celulasEmCache}`);
  console.log(`Requisicoes gastas    ${resultado.requisicoes}`);
  console.log(`Custo estimado        ${usd(resultado.custoUsd)}`);

  if (resultado.avisos.length > 0) {
    console.log('\nAvisos');
    for (const aviso of resultado.avisos) console.log(`  - ${aviso}`);
  }

  const { leads, total } = await listarLeads({
    searchId: resultado.searchId,
    ordenar: 'relevancia',
    limite: 25,
  });

  console.log(`\nMelhores leads (${total} sem site no total)\n`);
  console.log(
    'SCORE  FAIXA          NOME                                TELEFONE          SITUACAO           AVAL',
  );
  console.log('-'.repeat(112));

  for (const lead of leads) {
    const linha = [
      String(lead.score).padStart(5),
      ROTULO_FAIXA[lead.faixa].padEnd(14),
      lead.nome.slice(0, 35).padEnd(35),
      (lead.telefoneFormatado ?? '-').padEnd(17),
      lead.websiteClasse.padEnd(18),
      String(lead.totalAvaliacoes ?? 0).padStart(4),
    ].join(' ');
    console.log(linha);
  }

  console.log(`\nBusca ${resultado.searchId}`);
  console.log('Confira as requisicoes no console do Google Cloud em');
  console.log('  APIs e servicos > Places API (New) > Metricas\n');
}

principal().catch((erro) => {
  console.error('\nFalhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
