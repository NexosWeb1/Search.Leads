/**
 * Copia o banco SQLite local para o Postgres do Supabase.
 *
 * Roda uma vez, na virada. Depois disso o arquivo `data/leads.db` vira apenas
 * uma copia de seguranca do que existia antes.
 *
 * Os leads dariam para recomprar rodando a varredura de novo, ao custo de
 * requisicao paga. O historico de contato nao volta de jeito nenhum: e o que
 * impede voce de abordar duas vezes a mesma pessoa, e so existe aqui.
 *
 * Uso:
 *   npm run migrar-supabase -- --so-conferir
 *   npm run migrar-supabase
 *   npm run migrar-supabase -- --origem ./caminho/outro.db
 *
 * Idempotente: pode rodar quantas vezes precisar, porque tudo usa
 * INSERT ... ON CONFLICT DO UPDATE.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

import { createClient } from '@libsql/client';
import { db, fecharDb } from '../src/lib/db/index';

/** Ordem importa: `leads` antes do que aponta para ela. */
const TABELAS = [
  'leads',
  'searches',
  'lead_crm',
  'search_leads',
  'contact_log',
  'enrichment',
  'templates',
  'settings',
  'cell_cache',
] as const;

/** Chaves do ON CONFLICT. contact_log tem id gerado e vai sem conflito. */
const CHAVES: Record<string, string[] | null> = {
  leads: ['place_id'],
  searches: ['id'],
  lead_crm: ['place_id'],
  search_leads: ['search_id', 'place_id'],
  contact_log: null,
  enrichment: ['place_id'],
  templates: ['id'],
  settings: ['chave'],
  cell_cache: ['chave'],
};

/** Colunas que eram INTEGER 0/1 no SQLite e viraram boolean no Postgres. */
const BOOLEANOS = new Set([
  'telefone_celular',
  'tem_site_real',
  'tem_horario',
  'saturada',
  'padrao',
]);

/** Colunas que eram TEXT com JSON e viraram jsonb. */
const JSONS = new Set(['score_motivos', 'place_ids']);

/** Colunas que eram TEXT ISO e viraram timestamptz. */
const DATAS = new Set([
  'visto_em',
  'atualizado_em',
  'criada_em',
  'concluida_em',
  'primeiro_contato_em',
  'ultimo_contato_em',
  'respondeu_em',
  'finalizado_em',
  'registrado_em',
  'buscado_em',
  'consultada_em',
]);

/**
 * O `contact_log.id` do SQLite nao viaja: no Postgres a coluna e GENERATED
 * ALWAYS AS IDENTITY e recusa valor vindo de fora. A ordem dos registros e
 * preservada por `registrado_em`, que e o que a interface usa.
 */
const IGNORAR: Record<string, Set<string>> = {
  contact_log: new Set(['id']),
};

function converter(tabela: string, coluna: string, valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;

  if (BOOLEANOS.has(coluna)) return valor === 1 || valor === '1' || valor === true;

  if (JSONS.has(coluna)) {
    if (typeof valor !== 'string') return valor;
    try {
      return JSON.parse(valor);
    } catch {
      return coluna === 'place_ids' ? [] : [];
    }
  }

  if (DATAS.has(coluna)) {
    const d = new Date(String(valor));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return valor;
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function principal(): Promise<void> {
  const soConferir = process.argv.includes('--so-conferir');
  const caminhoOrigem = argumento('origem') ?? './data/leads.db';

  if (!existsSync(resolve(process.cwd(), caminhoOrigem))) {
    console.error(`\nArquivo de origem nao encontrado: ${caminhoOrigem}`);
    console.error('Se o banco antigo ja nao existe, nao ha o que migrar.\n');
    process.exit(1);
  }

  const destino = process.env.DATABASE_URL ?? '';
  if (!/^postgres(ql)?:\/\//.test(destino)) {
    console.error('\nDATABASE_URL precisa ser a string de conexao do Supabase.');
    console.error('Painel > Project Settings > Database > Connection string > Transaction pooler\n');
    process.exit(1);
  }

  const origem = createClient({ url: `file:${caminhoOrigem}` });
  const sql = await db();

  console.log(`\nOrigem : ${caminhoOrigem}`);
  console.log(`Destino: ${destino.replace(/:[^:@]+@/, ':***@')}\n`);

  let total = 0;

  for (const tabela of TABELAS) {
    let linhas;
    try {
      const r = await origem.execute(`SELECT * FROM ${tabela}`);
      linhas = r.rows;
    } catch {
      console.log(`  ${tabela.padEnd(14)} nao existe na origem`);
      continue;
    }

    if (linhas.length === 0) {
      console.log(`  ${tabela.padEnd(14)} vazia`);
      continue;
    }

    if (soConferir) {
      console.log(`  ${tabela.padEnd(14)} ${String(linhas.length).padStart(5)} linhas (nada gravado)`);
      total += linhas.length;
      continue;
    }

    const ignorar = IGNORAR[tabela] ?? new Set<string>();
    const colunas = Object.keys(linhas[0] as object).filter((c) => !ignorar.has(c));

    const registros = linhas.map((linha) => {
      const saida: Record<string, unknown> = {};
      for (const c of colunas) {
        saida[c] = converter(tabela, c, (linha as Record<string, unknown>)[c]);
      }
      return saida;
    });

    const chave = CHAVES[tabela];
    const atualizaveis = chave ? colunas.filter((c) => !chave.includes(c)) : [];

    /*
     * A clausula ON CONFLICT e montada como texto porque o helper de fragmentos
     * do driver nao compoe listas de atribuicao. Usar `unsafe` aqui e seguro e
     * deliberado: tabela e colunas vem das constantes deste arquivo e do schema,
     * nunca de entrada externa. Os VALORES continuam indo como parametro pelo
     * helper de insercao logo acima, que e onde injecao seria possivel.
     */
    const conflito =
      chave && atualizaveis.length > 0
        ? sql.unsafe(
            `ON CONFLICT (${chave.join(', ')}) DO UPDATE SET ` +
              atualizaveis.map((c) => `${c} = excluded.${c}`).join(', '),
          )
        : sql.unsafe('ON CONFLICT DO NOTHING');

    const TAMANHO_LOTE = 200;
    for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
      const lote = registros.slice(i, i + TAMANHO_LOTE);
      await sql`INSERT INTO ${sql(tabela)} ${sql(lote, ...colunas)} ${conflito}`;
    }

    console.log(`  ${tabela.padEnd(14)} ${String(registros.length).padStart(5)} linhas copiadas`);
    total += registros.length;
  }

  if (soConferir) {
    console.log(`\n${total} linhas seriam copiadas. Rode sem --so-conferir para gravar.\n`);
    await origem.close();
    return;
  }

  console.log('\nConferindo:');
  for (const tabela of TABELAS) {
    let na = 0;
    try {
      const r = await origem.execute(`SELECT COUNT(*) AS n FROM ${tabela}`);
      na = Number(r.rows[0]?.n ?? 0);
    } catch {
      continue;
    }
    const [linha] = await sql<{ n: string }[]>`
      SELECT COUNT(*) AS n FROM ${sql(tabela)}
    `;
    const nb = Number(linha?.n ?? 0);
    console.log(`  ${nb >= na ? 'ok    ' : 'DIFERE'} ${tabela.padEnd(14)} origem ${na}  destino ${nb}`);
  }

  await origem.close();

  console.log('\nPronto. O arquivo data/leads.db continua onde estava, como copia');
  console.log('de seguranca. A aplicacao agora le e escreve no Supabase.\n');
}

principal()
  .then(() => fecharDb())
  .then(() => process.exit(0))
  .catch(async (erro) => {
    console.error('\nFalhou:', erro instanceof Error ? erro.message : erro, '\n');
    await fecharDb().catch(() => {});
    process.exit(1);
  });
