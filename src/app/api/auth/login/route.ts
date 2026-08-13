import { z } from 'zod';
import { conferirSenha } from '@/lib/auth/senha';
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_MS,
  criarSessao,
  exigirAutenticacao,
  lerConfigAuth,
} from '@/lib/auth/sessao';

// Precisa de Node: scrypt nao existe no runtime Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.object({ senha: z.string().min(1).max(200) });

/**
 * Freio de tentativas por instancia.
 *
 * Vale dizer o que isto e e o que nao e: em serverless cada instancia tem a
 * propria memoria, entao um atacante distribuido contorna. A defesa de verdade e
 * o scrypt, que faz cada tentativa custar cerca de 100 ms de CPU e derruba forca
 * bruta de milhoes para dezenas por segundo. Este contador e uma camada barata
 * em cima disso, util contra script ingenuo.
 */
const TENTATIVAS_MAX = 8;
const JANELA_MS = 10 * 60 * 1000;
const tentativas = new Map<string, { total: number; ate: number }>();

function bloqueado(chave: string): number {
  const registro = tentativas.get(chave);
  if (!registro) return 0;
  if (Date.now() > registro.ate) {
    tentativas.delete(chave);
    return 0;
  }
  if (registro.total < TENTATIVAS_MAX) return 0;
  return Math.ceil((registro.ate - Date.now()) / 1000);
}

function registrarFalha(chave: string): void {
  const registro = tentativas.get(chave);
  if (registro && Date.now() <= registro.ate) {
    registro.total += 1;
  } else {
    tentativas.set(chave, { total: 1, ate: Date.now() + JANELA_MS });
  }
}

function identificar(requisicao: Request): string {
  const encaminhado = requisicao.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return requisicao.headers.get('x-nf-client-connection-ip') ?? 'desconhecido';
}

export async function POST(requisicao: Request) {
  const { hashSenha, segredo, configurado } = lerConfigAuth();

  if (!configurado) {
    if (!exigirAutenticacao()) {
      return Response.json(
        {
          erro: 'Autenticacao nao configurada',
          detalhe:
            'Rode `npm run senha` e preencha SENHA_ACESSO_HASH e SESSAO_SEGREDO no .env.local.',
        },
        { status: 503 },
      );
    }
    return Response.json({ erro: 'Autenticacao nao configurada no servidor' }, { status: 503 });
  }

  const quem = identificar(requisicao);
  const espera = bloqueado(quem);
  if (espera > 0) {
    return Response.json(
      {
        erro: `Tentativas demais. Tente de novo em ${Math.ceil(espera / 60)} minutos.`,
      },
      { status: 429 },
    );
  }

  let senha: string;
  try {
    senha = Corpo.parse(await requisicao.json()).senha;
  } catch {
    return Response.json({ erro: 'Informe a senha' }, { status: 400 });
  }

  if (!(await conferirSenha(senha, hashSenha!))) {
    registrarFalha(quem);
    // Mensagem generica de proposito: nao confirma nem nega nada alem do erro.
    return Response.json({ erro: 'Senha incorreta' }, { status: 401 });
  }

  tentativas.delete(quem);

  const resposta = Response.json({ ok: true });
  resposta.headers.append(
    'Set-Cookie',
    montarCookie(await criarSessao(segredo!), DURACAO_SESSAO_MS / 1000),
  );
  return resposta;
}

export function montarCookie(valor: string, maxAgeSegundos: number): string {
  const partes = [
    `${COOKIE_SESSAO}=${valor}`,
    'Path=/',
    'HttpOnly',
    // Lax e nao Strict: com Strict, chegar por link externo mostraria a tela de
    // login mesmo com sessao valida. Lax ja barra o essencial de CSRF.
    'SameSite=Lax',
    `Max-Age=${maxAgeSegundos}`,
  ];
  // Secure exige HTTPS, que nao existe em http://localhost.
  if (process.env.NODE_ENV === 'production') partes.push('Secure');
  return partes.join('; ');
}
