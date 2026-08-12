/**
 * Conexao com o banco.
 *
 * Usa libsql em arquivo local. A escolha e proposital: os binarios vem prontos
 * para Windows, entao nao precisa de compilador, e o mesmo codigo aponta para o
 * Turso depois se voce quiser hospedar sem trocar uma linha de query.
 */

import { createClient, type Client } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA } from './schema';

const URL_PADRAO = 'file:./data/leads.db';

/**
 * Em desenvolvimento o Next recarrega os modulos a cada edicao. Sem este cache
 * no globalThis, cada recarga abriria uma conexao nova e o arquivo acabaria
 * travado no Windows.
 */
const cache = globalThis as unknown as {
  __leadsDb?: Client;
  __leadsDbPronto?: Promise<void>;
};

function garantirDiretorio(url: string): void {
  if (!url.startsWith('file:')) return;
  const caminho = resolve(url.slice('file:'.length));
  mkdirSync(dirname(caminho), { recursive: true });
}

function conexao(): Client {
  if (!cache.__leadsDb) {
    const url = process.env.DATABASE_URL ?? URL_PADRAO;
    garantirDiretorio(url);
    cache.__leadsDb = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  return cache.__leadsDb;
}

const TEMPLATE_INICIAL = `Oi! Tudo bem?

Vi o perfil da {{nome}} no Google e notei que voces ainda nao tem um site proprio.

Trabalho criando sites para negocios aqui em {{cidade}} e imaginei que poderia ajudar voces a aparecer melhor nas buscas e receber mais contato pelo Google.

Posso te mandar uns exemplos do que ja fiz? Sem compromisso.`;

async function migrar(cliente: Client): Promise<void> {
  for (const comando of SCHEMA) {
    await cliente.execute(comando);
  }

  // Um template inicial para o modo disparo nao abrir vazio na primeira vez.
  await cliente.execute({
    sql: `INSERT INTO templates (id, nome, corpo, padrao, criado_em)
          VALUES ('padrao', 'Abordagem inicial', ?, 1, ?)
          ON CONFLICT (id) DO NOTHING`,
    args: [TEMPLATE_INICIAL, new Date().toISOString()],
  });
}

/**
 * Devolve a conexao com o schema garantido. A migracao roda uma unica vez por
 * processo, e chamadas concorrentes esperam a mesma promise.
 */
export async function db(): Promise<Client> {
  const cliente = conexao();
  if (!cache.__leadsDbPronto) {
    cache.__leadsDbPronto = migrar(cliente).catch((erro) => {
      // Sem isso, uma migracao que falha deixaria a promise rejeitada em cache e
      // toda chamada seguinte falharia sem nunca tentar de novo.
      cache.__leadsDbPronto = undefined;
      throw erro;
    });
  }
  await cache.__leadsDbPronto;
  return cliente;
}

/**
 * Fecha a conexao e limpa o cache do modulo.
 *
 * No Windows o arquivo do banco fica travado enquanto a conexao esta aberta,
 * entao os testes precisam disto para conseguir apagar o banco temporario.
 */
export function fecharDb(): void {
  cache.__leadsDb?.close();
  cache.__leadsDb = undefined;
  cache.__leadsDbPronto = undefined;
}

export const agora = (): string => new Date().toISOString();

/** SQLite nao tem booleano. */
export const bool = (v: unknown): boolean => v === 1 || v === true || v === '1';
export const int = (v: boolean): number => (v ? 1 : 0);
