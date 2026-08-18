/**
 * Conexao com o Postgres do Supabase.
 *
 * Duas configuracoes aqui nao sao preferencia, sao exigencia do ambiente:
 *
 * 1. `prepare: false`. A string de conexao usa o pooler de transacao do Supabase
 *    (porta 6543), que e o modo indicado para funcao serverless. Modo transacao
 *    nao suporta prepared statement, e deixar ligado produz um erro obscuro que
 *    so aparece em producao, depois do deploy.
 *
 * 2. Poucas conexoes por instancia. Cada invocacao serverless abre o proprio
 *    processo; um pool grande em muitas instancias esgota o limite do banco.
 */

import postgres from 'postgres';
import { SCHEMA } from './schema';

/**
 * Em desenvolvimento o Next recarrega os modulos a cada edicao. Sem este cache
 * no globalThis, cada recarga abriria um pool novo e as conexoes se acumulariam
 * ate o Supabase recusar.
 */
const cache = globalThis as unknown as {
  __sl_sql?: postgres.Sql;
  __sl_pronto?: Promise<void>;
};

function urlDoBanco(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL nao configurada. Copie a string de conexao do Supabase ' +
        '(Project Settings > Database > Connection string > Transaction pooler) ' +
        'para o .env.local.',
    );
  }
  return url;
}

/**
 * Schema alternativo do Postgres.
 *
 * Existe por causa de uma decisao consciente: desenvolvimento e producao usam o
 * mesmo projeto do Supabase. Sem isolamento, um teste automatizado escreveria e
 * apagaria dados na mesma tabela que guarda sua carteira e seu historico de
 * contato. Com DB_SCHEMA definido, tudo acontece num schema separado que pode
 * ser derrubado inteiro sem tocar no `public`.
 */
function schemaAlvo(): string | undefined {
  const nome = process.env.DB_SCHEMA?.trim();
  if (!nome) return undefined;
  // So identificador simples, porque este valor entra em DDL.
  if (!/^[a-z_][a-z0-9_]*$/i.test(nome)) {
    throw new Error(`DB_SCHEMA invalido: ${nome}`);
  }
  return nome;
}

function conexao(): postgres.Sql {
  if (!cache.__sl_sql) {
    const url = urlDoBanco();
    const schema = schemaAlvo();

    cache.__sl_sql = postgres(url, {
      // Exigido pelo pooler de transacao. Ver comentario no topo.
      prepare: false,
      max: Number(process.env.DB_MAX_CONEXOES ?? 5),
      idle_timeout: 20,
      connect_timeout: 15,
      // O Supabase usa certificado proprio na cadeia; `require` cifra sem exigir
      // que o certificado esteja no armazenamento local.
      ssl: url.includes('localhost') ? false : 'require',
      onnotice: () => {},
      connection: {
        ...(schema ? { search_path: `${schema},public` } : {}),
        /*
         * Teto por comando. Sem ele, uma consulta que trava fica pendurada para
         * sempre e a tela nao mostra erro nenhum, so um carregamento eterno.
         * Com o teto vira um erro legivel, que da para diagnosticar.
         */
        statement_timeout: Number(process.env.DB_TIMEOUT_MS ?? 30000),
      },
    });
  }
  return cache.__sl_sql;
}

async function migrar(sql: postgres.Sql): Promise<void> {
  const schema = schemaAlvo();
  if (schema) {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await sql.unsafe(`SET search_path TO ${schema}, public`);
  }

  /*
   * Caminho rapido: se a tabela principal ja existe, o schema esta montado e nao
   * ha o que fazer.
   *
   * Isso importa mais do que parece. Sem a checagem, todo inicio de processo
   * dispara mais de vinte comandos DDL, um por vez, contra um banco do outro
   * lado da rede. Em serverless isso acontece a cada partida a frio, some com o
   * tempo de resposta da primeira requisicao e ainda pega lock de tabela a toa.
   */
  const [pronto] = await sql<{ existe: boolean }[]>`
    SELECT to_regclass(${(schema ?? 'public') + '.leads'}) IS NOT NULL AS existe
  `;
  if (pronto?.existe) return;

  for (const comando of SCHEMA) {
    await sql.unsafe(comando);
  }

  await sql`
    INSERT INTO templates (id, nome, corpo, padrao, criado_em)
    VALUES ('padrao', 'Abordagem inicial', ${TEMPLATE_INICIAL}, true, now())
    ON CONFLICT (id) DO NOTHING
  `;
}

const TEMPLATE_INICIAL = `Oi! Tudo bem?

Vi o perfil da {{nome}} no Google e notei que voces ainda nao tem um site proprio.

Trabalho criando sites para negocios aqui em {{cidade}} e imaginei que poderia ajudar voces a aparecer melhor nas buscas e receber mais contato pelo Google.

Posso te mandar uns exemplos do que ja fiz? Sem compromisso.`;

/**
 * Devolve a conexao com o schema garantido.
 *
 * A migracao roda uma vez por processo e chamadas concorrentes esperam a mesma
 * promise. Todo o DDL usa IF NOT EXISTS, entao rodar varias vezes e inofensivo,
 * inclusive com varias instancias serverless subindo ao mesmo tempo.
 */
export async function db(): Promise<postgres.Sql> {
  const sql = conexao();

  if (!cache.__sl_pronto) {
    cache.__sl_pronto = migrar(sql).catch((erro) => {
      // Sem isto, uma migracao que falha deixaria a promise rejeitada em cache e
      // toda chamada seguinte falharia sem nunca tentar de novo.
      cache.__sl_pronto = undefined;
      throw erro;
    });
  }

  await cache.__sl_pronto;
  return sql;
}

/** Fecha o pool. Usado pelos scripts de linha de comando ao terminar. */
export async function fecharDb(): Promise<void> {
  if (cache.__sl_sql) {
    await cache.__sl_sql.end({ timeout: 5 });
    cache.__sl_sql = undefined;
    cache.__sl_pronto = undefined;
  }
}

export const agora = (): string => new Date().toISOString();
