/**
 * Teste de integracao do banco, com foco na invariante anti-spam.
 *
 * O cenario central e o que importa: contatar um comercio numa varredura e
 * depois reencontrar o mesmo comercio numa varredura de OUTRO nicho. Ele precisa
 * chegar ja marcado como contatado, fora da fila de disparo, com o historico
 * intacto. Se este arquivo passar a falhar, a ferramenta volta a permitir mandar
 * a mesma mensagem duas vezes para a mesma pessoa.
 *
 * Isolamento: tudo roda num schema proprio do Postgres, criado no inicio e
 * derrubado no fim. Desenvolvimento e producao compartilham o mesmo projeto do
 * Supabase, entao sem isso o teste escreveria na mesma tabela que guarda sua
 * carteira de leads e seu historico de contato.
 *
 * Sem DATABASE_URL configurada, o arquivo inteiro e pulado. Os testes de logica
 * pura (grade, score, telefone, periodo de espera, extracao) continuam rodando
 * offline.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

/*
 * Exige uma conexao Postgres de verdade, e nao apenas a variavel preenchida.
 * Sem esta checagem, um DATABASE_URL sobrando de outra configuracao faria os 16
 * testes falharem com erro de conexao em vez de simplesmente pularem.
 */
const TEM_BANCO = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const SCHEMA_TESTE = `teste_${Date.now().toString(36)}`;

// Precisa vir antes da primeira chamada a db(): a conexao le DB_SCHEMA de forma
// tardia, no primeiro uso.
if (TEM_BANCO) process.env.DB_SCHEMA = SCHEMA_TESTE;

import { normalizarPlace } from '../src/lib/leads/mapear';
import { salvarLeads, listarLeads } from '../src/lib/db/leads';
import { criarBusca } from '../src/lib/db/searches';
import {
  registrarContato,
  historicoContato,
  enviosNoDia,
  atualizarStatus,
} from '../src/lib/contacts/log';
import { db, fecharDb } from '../src/lib/db/index';
import { COOLDOWN_PADRAO } from '../src/lib/contacts/cooldown';
import type { PlaceBruto } from '../src/lib/places/client';

const pular = { skip: TEM_BANCO ? false : 'DATABASE_URL nao configurada' };

function place(id: string, extra: Partial<PlaceBruto> = {}): PlaceBruto {
  return {
    id,
    displayName: { text: `Barbearia ${id}` },
    formattedAddress: 'Rua Teste 100, Porto Alegre, RS',
    postalAddress: {
      locality: 'Porto Alegre',
      sublocality: 'Centro',
      administrativeArea: 'RS',
    },
    location: { latitude: -30.0346, longitude: -51.2177 },
    businessStatus: 'OPERATIONAL',
    nationalPhoneNumber: '(51) 99950-8056',
    rating: 4.6,
    userRatingCount: 180,
    regularOpeningHours: { weekdayDescriptions: ['segunda: 09:00 - 19:00'] },
    ...extra,
  };
}

async function guardar(searchId: string, bruto: PlaceBruto): Promise<void> {
  const lead = normalizarPlace(bruto);
  assert.ok(lead, `o place ${bruto.id} deveria virar lead`);
  await salvarLeads(searchId, [{ lead, distanciaM: 1200 }]);
}

const buscaBarbearia = () =>
  criarBusca({
    nichoId: 'barbearia',
    nichoLabel: 'Barbearia',
    localLabel: 'Porto Alegre, RS',
    centroLat: -30.0346,
    centroLng: -51.2177,
    raioKm: 20,
    celulasTotal: 40,
  });

const buscaSalao = () =>
  criarBusca({
    nichoId: 'salao-beleza',
    nichoLabel: 'Salao de beleza',
    localLabel: 'Porto Alegre, RS',
    centroLat: -30.0346,
    centroLng: -51.2177,
    raioKm: 20,
    celulasTotal: 40,
  });

before(async () => {
  if (!TEM_BANCO) return;
  await db();
});

after(async () => {
  if (!TEM_BANCO) return;
  // Derruba o schema inteiro: nada do teste sobrevive no banco compartilhado.
  const sql = await db();
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA_TESTE} CASCADE`);
  await fecharDb();
});

test('lead novo e salvo, pontuado e classificado', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('novo-1'));

  const { leads, total } = await listarLeads({ searchId: busca });
  assert.equal(total, 1);
  assert.equal(leads[0].placeId, 'novo-1');
  assert.equal(leads[0].temSiteReal, false);
  assert.equal(leads[0].faixa, 'muito_bom');
  assert.equal(leads[0].telefoneE164, '5551999508056');
  assert.equal(leads[0].telefoneCelular, true);
  assert.equal(leads[0].bairro, 'Centro');
  assert.equal(leads[0].status, 'novo');
  assert.equal(leads[0].contato.pode, true);
  assert.equal(leads[0].contato.tipo, 'nunca_contatado');
});

test('quem tem site proprio fica fora da lista por padrao', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('com-site', { websiteUri: 'https://barbearia.com.br' }));
  await guardar(busca, place('sem-site'));

  const padrao = await listarLeads({ searchId: busca });
  assert.equal(padrao.total, 1);
  assert.equal(padrao.leads[0].placeId, 'sem-site');

  const todos = await listarLeads({ searchId: busca, incluirComSite: true });
  assert.equal(todos.total, 2);
});

test('Instagram no campo de site continua entrando como lead', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('insta', { websiteUri: 'https://instagram.com/barbearia' }));

  const { leads } = await listarLeads({ searchId: busca });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].websiteClasse, 'rede_social');
  assert.equal(leads[0].temSiteReal, false);
});

test('ESSENCIAL: contato feito num nicho aparece na varredura de outro', pular, async () => {
  const primeira = await buscaBarbearia();
  await guardar(primeira, place('compartilhado'));

  await registrarContato({
    placeId: 'compartilhado',
    entrega: 'enviado',
    mensagem: 'Oi, vi que voces nao tem site',
    templateId: 'padrao',
    templateNome: 'Abordagem inicial',
  });

  // Semanas depois, outra varredura de outro nicho traz o mesmo comercio.
  const segunda = await buscaSalao();
  await guardar(segunda, place('compartilhado'));

  const { leads } = await listarLeads({ searchId: segunda });
  const lead = leads.find((l) => l.placeId === 'compartilhado');

  assert.ok(lead, 'o comercio precisa aparecer na segunda busca');
  assert.equal(lead.status, 'contatado', 'o status tem de atravessar a nova varredura');
  assert.equal(lead.tentativas, 1);
  assert.ok(lead.ultimoContatoEm, 'a data do contato nao pode ser perdida');
  assert.equal(lead.contato.pode, false, 'nao pode entrar na fila de disparo de novo');
  assert.equal(lead.contato.tipo, 'em_cooldown');
  assert.equal(lead.contato.rotulo, 'Contatado hoje');

  const historico = await historicoContato('compartilhado');
  assert.equal(historico.length, 1);
  assert.equal(historico[0].mensagem, 'Oi, vi que voces nao tem site');
});

test('falha tecnica nao consome tentativa nem inicia cooldown', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('sem-zap', { nationalPhoneNumber: undefined }));

  const r = await registrarContato({ placeId: 'sem-zap', entrega: 'numero_invalido' });
  assert.equal(r.contouTentativa, false);
  assert.equal(r.tentativa, 0);

  const { leads } = await listarLeads({ searchId: busca });
  const lead = leads.find((l) => l.placeId === 'sem-zap');
  assert.ok(lead);
  assert.equal(lead.tentativas, 0);
  assert.equal(lead.status, 'novo');
  assert.equal(
    lead.contato.pode,
    true,
    'o lead precisa voltar para a fila depois de corrigir o telefone',
  );

  const historico = await historicoContato('sem-zap');
  assert.equal(historico.length, 1);
  assert.equal(historico[0].entrega, 'numero_invalido');
});

test('na tentativa configurada o lead vira frio sozinho', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('insistente'));

  for (let i = 0; i < COOLDOWN_PADRAO.maxTentativas; i++) {
    await registrarContato({ placeId: 'insistente', entrega: 'enviado' });
  }

  const { leads } = await listarLeads({ searchId: busca, incluirComSite: true });
  const lead = leads.find((l) => l.placeId === 'insistente');
  assert.ok(lead);
  assert.equal(lead.tentativas, COOLDOWN_PADRAO.maxTentativas);
  assert.equal(lead.status, 'frio');
  assert.equal(lead.contato.pode, false);
  assert.equal(lead.contato.tipo, 'esgotado');
});

test('quem respondeu sai do disparo em massa', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('respondeu-1'));
  await registrarContato({ placeId: 'respondeu-1', entrega: 'enviado' });
  await atualizarStatus({ placeId: 'respondeu-1', status: 'respondeu' });

  const { leads } = await listarLeads({ searchId: busca });
  const lead = leads.find((l) => l.placeId === 'respondeu-1');
  assert.ok(lead);
  assert.equal(lead.contato.pode, false);
  assert.equal(lead.contato.tipo, 'em_negociacao');
  assert.ok(lead.respondeuEm);
});

test('novo envio nao rebaixa quem ja respondeu', pular, async () => {
  const r = await registrarContato({ placeId: 'respondeu-1', entrega: 'enviado' });
  assert.equal(r.statusNovo, 'respondeu');
});

test('perdido guarda o motivo, que alimenta o dashboard', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('perdido-1'));
  await registrarContato({ placeId: 'perdido-1', entrega: 'enviado' });
  await atualizarStatus({
    placeId: 'perdido-1',
    status: 'perdido',
    motivoPerda: 'achou_caro',
  });

  const { leads } = await listarLeads({ searchId: busca, status: ['perdido'] });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].motivoPerda, 'achou_caro');
  assert.equal(leads[0].contato.pode, false, 'perdido nao volta sozinho para a fila');
});

test('o filtro de nunca contatado exclui quem ja recebeu mensagem', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('virgem-1'));
  await guardar(busca, place('usado-1'));
  await registrarContato({ placeId: 'usado-1', entrega: 'enviado' });

  const { leads } = await listarLeads({ searchId: busca, contato: 'nunca' });
  const ids = leads.map((l) => l.placeId);
  assert.ok(ids.includes('virgem-1'));
  assert.ok(!ids.includes('usado-1'));
});

test('falha tecnica com data recuada nao vira cooldown', pular, async () => {
  // Reproduz o estado que quase escapou: registro no historico com data
  // recente, porem zero tentativas. O lead tem de seguir disponivel.
  const busca = await buscaBarbearia();
  await guardar(busca, place('tecnica-datada', { nationalPhoneNumber: undefined }));
  await registrarContato({ placeId: 'tecnica-datada', entrega: 'numero_invalido' });

  const sql = await db();
  await sql`
    UPDATE lead_crm SET ultimo_contato_em = now() - interval '2 days'
    WHERE place_id = 'tecnica-datada'
  `;

  const { leads } = await listarLeads({ searchId: busca });
  const lead = leads.find((l) => l.placeId === 'tecnica-datada');
  assert.ok(lead);
  assert.equal(lead.tentativas, 0);
  assert.equal(lead.contato.tipo, 'nunca_contatado');
  assert.equal(lead.contato.pode, true);

  const disponiveis = await listarLeads({ searchId: busca, contato: 'disponivel' });
  assert.ok(
    disponiveis.leads.some((l) => l.placeId === 'tecnica-datada'),
    'o filtro SQL precisa concordar com avaliarContato',
  );
});

test('o filtro de disponivel concorda com a decisao do cooldown', pular, async () => {
  const { leads } = await listarLeads({ contato: 'disponivel', incluirComSite: true });
  for (const lead of leads) {
    assert.equal(
      lead.contato.pode,
      true,
      `${lead.placeId} entrou no filtro mas o cooldown bloqueia (${lead.contato.tipo})`,
    );
  }
});

test('e o inverso: quem esta liberado passa pelo filtro SQL', pular, async () => {
  // A verificacao nos dois sentidos e o que garante que a contagem exibida bate
  // com a fila de verdade. Um lado sozinho deixa o outro erro passar.
  const todos = await listarLeads({ incluirComSite: true, limite: 2000 });
  const disponiveis = await listarLeads({
    contato: 'disponivel',
    incluirComSite: true,
    limite: 2000,
  });
  const idsDisponiveis = new Set(disponiveis.leads.map((l) => l.placeId));

  for (const lead of todos.leads) {
    if (lead.contato.pode) {
      assert.ok(
        idsDisponiveis.has(lead.placeId),
        `${lead.placeId} esta liberado (${lead.contato.tipo}) mas o filtro SQL o excluiu`,
      );
    }
  }
});

test('somente WhatsApp exige celular, nao aceita fixo', pular, async () => {
  const busca = await buscaBarbearia();
  await guardar(busca, place('fixo-1', { nationalPhoneNumber: '(51) 3232-1010' }));

  const { leads } = await listarLeads({ searchId: busca, somenteWhatsapp: true });
  assert.ok(!leads.some((l) => l.placeId === 'fixo-1'));

  const todos = await listarLeads({ searchId: busca });
  assert.ok(todos.leads.some((l) => l.placeId === 'fixo-1'));
});

test('o contador diario soma apenas envios que sairam', pular, async () => {
  const antes = await enviosNoDia();
  await registrarContato({ placeId: 'novo-1', entrega: 'enviado' });
  await registrarContato({ placeId: 'novo-1', entrega: 'pulado' });
  const depois = await enviosNoDia();
  assert.equal(depois, antes + 1, 'lead pulado nao pode contar como envio');
});

test('comercio fechado definitivamente nao entra como lead', () => {
  // Nao toca no banco, entao roda mesmo sem DATABASE_URL.
  const lead = normalizarPlace(place('fechado', { businessStatus: 'CLOSED_PERMANENTLY' }));
  assert.equal(lead, null);
});

test('reencontrar o comercio atualiza o Google sem apagar o CRM', pular, async () => {
  const busca = await buscaSalao();
  // Agora ele ganhou mais avaliacoes e mudou o telefone.
  await guardar(
    busca,
    place('compartilhado', { userRatingCount: 400, nationalPhoneNumber: '(51) 98888-7777' }),
  );

  const { leads } = await listarLeads({ searchId: busca });
  const lead = leads.find((l) => l.placeId === 'compartilhado');
  assert.ok(lead);
  assert.equal(lead.totalAvaliacoes, 400, 'os dados do Google precisam atualizar');
  assert.equal(lead.telefoneE164, '5551988887777');
  assert.equal(lead.tentativas, 1, 'o historico de contato precisa sobreviver');
  assert.equal(lead.status, 'contatado');
});
