/**
 * Testes da autenticacao.
 *
 * Codigo de seguranca e onde bug silencioso custa caro: uma sessao que aceita
 * token forjado nao da erro nenhum, so deixa entrar. Estes casos cobrem
 * exatamente as formas de burlar que importam.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarForca, conferirSenha, gerarHash } from '../src/lib/auth/senha';
import {
  DURACAO_SESSAO_MS,
  criarSessao,
  lerConfigAuth,
  sessaoValida,
} from '../src/lib/auth/sessao';

const SEGREDO = 'segredo-de-teste-com-tamanho-suficiente-1234567890';

test('a senha correta e aceita', async () => {
  const hash = await gerarHash('uma frase longa de teste 123');
  assert.equal(await conferirSenha('uma frase longa de teste 123', hash), true);
});

test('a senha errada e recusada', async () => {
  const hash = await gerarHash('uma frase longa de teste 123');
  assert.equal(await conferirSenha('uma frase longa de teste 124', hash), false);
  assert.equal(await conferirSenha('', hash), false);
  assert.equal(await conferirSenha('uma frase longa de teste 123 ', hash), false);
});

test('o hash e diferente a cada geracao, por causa do sal', async () => {
  // Sal fixo permitiria tabela pre-calculada. Dois hashes da mesma senha
  // precisam ser diferentes e ambos validos.
  const a = await gerarHash('mesma senha longa aqui 1');
  const b = await gerarHash('mesma senha longa aqui 1');
  assert.notEqual(a, b);
  assert.equal(await conferirSenha('mesma senha longa aqui 1', a), true);
  assert.equal(await conferirSenha('mesma senha longa aqui 1', b), true);
});

test('hash corrompido ou em outro formato e recusado sem lancar excecao', async () => {
  for (const invalido of [
    '',
    'nao-e-hash',
    'scrypt:so-duas-partes',
    'bcrypt:aa:bb',
    'scrypt:zz:zz',
    'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(10),
  ]) {
    assert.equal(await conferirSenha('qualquer coisa', invalido), false, invalido);
  }
});

test('ESSENCIAL: o hash nao usa cifrao, que quebraria no arquivo de ambiente', async () => {
  /*
   * O hash vive numa variavel de ambiente, e o carregador de .env do Next
   * expande `$algo` como referencia a outra variavel. Com cifrao no formato, o
   * hash chega truncado no servidor e a senha correta passa a ser recusada, com
   * uma mensagem que nao ajuda a descobrir o motivo. Aconteceu de verdade aqui
   * antes deste teste existir.
   */
  const hash = await gerarHash('uma frase longa de teste 123');
  assert.ok(!hash.includes('$'), `o hash nao pode conter cifrao: ${hash.slice(0, 20)}`);
  assert.equal(hash.split(':').length, 3);
  assert.ok(hash.startsWith('scrypt:'));
});

test('espaco em volta do hash nao atrapalha', async () => {
  // Copiar e colar no painel de variaveis do provedor costuma trazer espaco ou
  // quebra de linha junto.
  const hash = await gerarHash('uma frase longa de teste 123');
  assert.equal(await conferirSenha('uma frase longa de teste 123', `  ${hash}\n`), true);
});

test('a senha e normalizada, para acento digitado de formas diferentes bater', async () => {
  // "ç" pode vir como um ponto de codigo ou como c + cedilha combinante.
  // Sem normalizar, a mesma senha digitada em teclados diferentes falharia.
  const composta = 'senha com caçamba longa';
  const decomposta = 'senha com caçamba longa';
  const hash = await gerarHash(composta);
  assert.equal(await conferirSenha(decomposta, hash), true);
});

test('a sessao recem criada e valida', async () => {
  assert.equal(await sessaoValida(await criarSessao(SEGREDO), SEGREDO), true);
});

test('ESSENCIAL: token assinado com outro segredo e recusado', async () => {
  // Se isto falhar, qualquer pessoa forja uma sessao e entra sem senha.
  const token = await criarSessao('outro-segredo-completamente-diferente');
  assert.equal(await sessaoValida(token, SEGREDO), false);
});

test('ESSENCIAL: token adulterado e recusado', async () => {
  const token = await criarSessao(SEGREDO);
  const [corpo, assinatura] = token.split('.');

  // Troca o conteudo mantendo a assinatura original.
  const forjado = Buffer.from(
    JSON.stringify({ exp: Date.now() + 999_999_999, v: 1 }),
  ).toString('base64url');
  assert.equal(await sessaoValida(`${forjado}.${assinatura}`, SEGREDO), false);

  // Troca a assinatura mantendo o conteudo.
  assert.equal(await sessaoValida(`${corpo}.YWFhYWFh`, SEGREDO), false);
});

test('token expirado e recusado', async () => {
  // Constroi um token com assinatura valida mas ja vencido, que e o cenario de
  // alguem guardar um cookie antigo.
  const { createHmac } = await import('node:crypto');
  const corpo = Buffer.from(
    JSON.stringify({ exp: Date.now() - 1000, v: 1 }),
  ).toString('base64url');
  const assinatura = createHmac('sha256', SEGREDO).update(corpo).digest('base64url');

  assert.equal(await sessaoValida(`${corpo}.${assinatura}`, SEGREDO), false);
});

test('token de versao diferente e recusado', async () => {
  const { createHmac } = await import('node:crypto');
  const corpo = Buffer.from(
    JSON.stringify({ exp: Date.now() + DURACAO_SESSAO_MS, v: 99 }),
  ).toString('base64url');
  const assinatura = createHmac('sha256', SEGREDO).update(corpo).digest('base64url');

  assert.equal(await sessaoValida(`${corpo}.${assinatura}`, SEGREDO), false);
});

test('token malformado e recusado sem lancar excecao', async () => {
  for (const invalido of [
    undefined,
    '',
    'sem-ponto',
    '.',
    '.assinatura',
    'corpo.',
    'a.b.c.d',
    'nao@base64!.nao@base64!',
  ]) {
    assert.equal(await sessaoValida(invalido, SEGREDO), false, String(invalido));
  }
});

test('segredo vazio nunca valida, mesmo com token bem formado', async () => {
  // Protege contra o caso de a variavel de ambiente sumir em producao: sem
  // segredo, nada pode ser aceito.
  const token = await criarSessao(SEGREDO);
  assert.equal(await sessaoValida(token, ''), false);
});

test('a configuracao so e considerada pronta com as duas variaveis', () => {
  const original = { ...process.env };
  try {
    delete process.env.SENHA_ACESSO_HASH;
    delete process.env.SESSAO_SEGREDO;
    assert.equal(lerConfigAuth().configurado, false);

    process.env.SENHA_ACESSO_HASH = 'scrypt:aa:bb';
    assert.equal(lerConfigAuth().configurado, false, 'falta o segredo');

    process.env.SESSAO_SEGREDO = 'x';
    assert.equal(lerConfigAuth().configurado, true);

    // Espaco em branco nao conta como valor preenchido.
    process.env.SESSAO_SEGREDO = '   ';
    assert.equal(lerConfigAuth().configurado, false);
  } finally {
    process.env = original;
  }
});

test('a exigencia de forca recusa senha curta e obvia', () => {
  assert.equal(avaliarForca('123456').aceitavel, false);
  assert.equal(avaliarForca('curta1').aceitavel, false);
  assert.equal(avaliarForca('Prospeccao2026Betim').aceitavel, true);
  // Frase longa passa sem numero, porque comprimento compensa.
  assert.equal(avaliarForca('cavalo bateria grampo correto').aceitavel, true);
});

test('palavra obvia derruba a senha mesmo com tamanho e numero', () => {
  // "MinhaSenha123" tem 13 caracteres e um numero, mas contem "senha". E o tipo
  // de senha que um ataque de dicionario tenta primeiro.
  for (const obvia of ['MinhaSenha123', 'admin123456789', 'qwerty12345678', 'SearchLeads2026']) {
    const r = avaliarForca(obvia);
    assert.equal(r.aceitavel, false, obvia);
    assert.ok(r.problemas.some((p) => p.includes('obvia')), obvia);
  }
});
