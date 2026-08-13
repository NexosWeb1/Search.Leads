/**
 * Copia o banco local para o Turso.
 *
 * Existe porque funcao serverless tem disco efemero: hospedar no Netlify sem
 * migrar significaria perder os leads e, pior, todo o historico de contato a
 * cada deploy. Os leads dariam para recomprar rodando a varredura de novo; o
 * historico nao volta de jeito nenhum.
 *
 * Uso:
 *   npm run migrar-turso -- --destino libsql://SEU-BANCO.turso.io --token SEU_TOKEN
 *   npm run migrar-turso -- --destino ... --token ... --so-conferir
 *
 * O comando e idempotente: roda quantas vezes precisar, porque tudo usa
 * INSERT ... ON CONFLICT DO UPDATE.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

import { createClient, type Client, type InValue } from '@libsql/client';
import { SCHEMA } from '../src/lib/db/schema';

/** Ordem importa: `leads` antes do que aponta para ela. */
const TABELAS = [
  'leads',
  'lead_crm',
  'searches',
  'search_leads',
  'contact_log',
  'enrichment',
  'templates',
  'settings',
] as const;

/** Chaves usadas no ON CONFLICT. contact_log tem id autoincremento e vai puro. */
const CHAVES: Record<string, string[] | null> = {
  leads: ['place_id'],
  lead_crm: ['place_id'],
  searches: ['id'],
  search_leads: ['search_id', 'place_id'],
  contact_log: null,
  enrichment: ['place_id'],
  templates: ['id'],
  settings: ['chave'],
};

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function contar(cliente: Client, tabela: string): Promise<number> {
  try {
    const { rows } = await cliente.execute(`SELECT COUNT(*) AS n FROM ${tabela}`);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

async function principal(): Promise<void> {
  const destino = argumento('destino');
  const token = argumento('token');
  const soConferir = process.argv.includes('--so-conferir');

  if (!destino || !token) {
    console.error('\nFaltam parametros.\n');
    console.error('  npm run migrar-turso -- --destino libsql://SEU-BANCO.turso.io --token SEU_TOKEN\n');
    console.error('Para criar o banco no Turso:');
    console.error('  1. turso auth signup');
    console.error('  2. turso db create search-leads');
    console.error('  3. turso db show search-leads --url');
    console.error('  4. turso db tokens create search-leads\n');
    process.exit(1);
  }

  const origemUrl = process.env.DATABASE_URL ?? 'file:./data/leads.db';
  if (!origemUrl.startsWith('file:')) {
    console.error(`\nA origem precisa ser um arquivo local. DATABASE_URL esta em: ${origemUrl}\n`);
    process.exit(1);
  }

  const origem = createClient({ url: origemUrl });
  const alvo = createClient({ url: destino, authToken: token });

  console.log(`\nOrigem : ${origemUrl}`);
  console.log(`Destino: ${destino}\n`);

  console.log('Criando o schema no destino...');
  for (const comando of SCHEMA) await alvo.execute(comando);

  let total = 0;

  for (const tabela of TABELAS) {
    const { rows, columns } = await origem.execute(`SELECT * FROM ${tabela}`);
    if (rows.length === 0) {
      console.log(`  ${tabela.padEnd(14)} vazia`);
      continue;
    }

    if (soConferir) {
      console.log(`  ${tabela.padEnd(14)} ${String(rows.length).padStart(5)} linhas (nada gravado)`);
      total += rows.length;
      continue;
    }

    const colunas = columns.join(', ');
    const marcadores = columns.map(() => '?').join(',');
    const chave = CHAVES[tabela];

    const conflito = chave
      ? ` ON CONFLICT (${chave.join(', ')}) DO UPDATE SET ${columns
          .filter((c) => !chave.includes(c))
          .map((c) => `${c} = excluded.${c}`)
          .join(', ')}`
      : '';

    const sql = `INSERT INTO ${tabela} (${colunas}) VALUES (${marcadores})${conflito}`;

    // Em lotes: uma ida ate o Turso por linha levaria minutos com 500 leads.
    const TAMANHO_LOTE = 100;
    for (let i = 0; i < rows.length; i += TAMANHO_LOTE) {
      const lote = rows.slice(i, i + TAMANHO_LOTE).map((linha) => ({
        sql,
        args: columns.map((c) => (linha as Record<string, InValue>)[c]),
      }));
      await alvo.batch(lote, 'write');
    }

    console.log(`  ${tabela.padEnd(14)} ${String(rows.length).padStart(5)} linhas copiadas`);
    total += rows.length;
  }

  if (soConferir) {
    console.log(`\n${total} linhas seriam copiadas. Rode sem --so-conferir para gravar.\n`);
    return;
  }

  console.log('\nConferindo o destino:');
  for (const tabela of TABELAS) {
    const [a, b] = await Promise.all([contar(origem, tabela), contar(alvo, tabela)]);
    const marca = a === b ? 'ok  ' : 'DIFERE';
    console.log(`  ${marca} ${tabela.padEnd(14)} origem ${a}  destino ${b}`);
  }

  console.log('\nPronto. No Netlify, defina as variaveis:');
  console.log(`  DATABASE_URL=${destino}`);
  console.log('  DATABASE_AUTH_TOKEN=(o token que voce passou aqui)\n');
  console.log('Mantenha o .env.local apontando para o arquivo, para continuar');
  console.log('desenvolvendo sem mexer no banco de producao.\n');
}

principal().catch((erro) => {
  console.error('\nFalhou:', erro instanceof Error ? erro.message : erro, '\n');
  process.exit(1);
});
