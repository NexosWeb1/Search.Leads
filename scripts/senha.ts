/**
 * Gera as duas variaveis de autenticacao.
 *
 * A senha em si nunca e guardada em lugar nenhum: o que sai daqui e o hash
 * scrypt dela e um segredo aleatorio para assinar a sessao. Quem ler as
 * variaveis do servidor leva o hash, nao a senha.
 *
 * Uso:
 *   npm run senha                    (pede a senha sem exibir na tela)
 *   npm run senha -- --so-segredo    (gera so um SESSAO_SEGREDO novo)
 */

import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { avaliarForca, gerarHash } from '../src/lib/auth/senha';

/**
 * Le sem ecoar no terminal.
 *
 * Sem isto a senha ficaria visivel na tela e, pior, no historico do shell se
 * viesse por argumento. Por isso este script nao aceita a senha como parametro.
 */
function perguntarSenha(rotulo: string): Promise<string> {
  return new Promise((resolve) => {
    const leitor = createInterface({ input: stdin, output: stdout, terminal: true });
    const saida = stdout as NodeJS.WriteStream & { muted?: boolean };

    const escreverOriginal = saida.write.bind(saida);
    saida.write = ((pedaco: string, ...resto: unknown[]) => {
      if (saida.muted && typeof pedaco === 'string' && !pedaco.includes(rotulo)) return true;
      return escreverOriginal(pedaco, ...(resto as []));
    }) as typeof saida.write;

    leitor.question(rotulo, (resposta) => {
      saida.muted = false;
      saida.write = escreverOriginal;
      leitor.close();
      escreverOriginal('\n');
      resolve(resposta);
    });

    saida.muted = true;
  });
}

const gerarSegredo = () => randomBytes(48).toString('base64url');

async function principal(): Promise<void> {
  if (process.argv.includes('--so-segredo')) {
    console.log('\nSESSAO_SEGREDO=' + gerarSegredo() + '\n');
    console.log('Trocar este valor derruba todas as sessoes abertas.\n');
    return;
  }

  console.log('\nSenha de acesso da plataforma.');
  console.log('Ela nao aparece enquanto voce digita, e nao fica no historico do shell.\n');
  console.log('Dica: uma frase longa e mais forte e mais facil de lembrar do que');
  console.log('oito caracteres com simbolo no meio.\n');

  const senha = await perguntarSenha('Senha: ');

  const forca = avaliarForca(senha);
  if (!forca.aceitavel) {
    console.error('\nSenha recusada:');
    for (const p of forca.problemas) console.error(`  - ${p}`);
    console.error('\nEsta senha protege sua carteira de leads inteira.\n');
    process.exit(1);
  }

  const confirmacao = await perguntarSenha('Repita a senha: ');
  if (confirmacao !== senha) {
    console.error('\nAs senhas nao batem.\n');
    process.exit(1);
  }

  const hash = await gerarHash(senha);

  console.log('\nCopie estas duas linhas para o .env.local (local) e para as');
  console.log('variaveis de ambiente do Netlify (producao):\n');
  console.log(`SENHA_ACESSO_HASH=${hash}`);
  console.log(`SESSAO_SEGREDO=${gerarSegredo()}`);
  console.log('\nDepois reinicie o servidor.\n');
}

principal().catch((erro) => {
  console.error('\nFalhou:', erro instanceof Error ? erro.message : erro, '\n');
  process.exit(1);
});
