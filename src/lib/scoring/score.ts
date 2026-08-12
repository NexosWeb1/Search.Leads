/**
 * Calculo do score e da faixa de cada lead.
 *
 * A regra central: nao ter site pesa muito, mas prova de que o negocio fatura
 * pesa quase tanto. Um comercio sem site e sem nenhuma avaliacao pode ser uma
 * empresa morta; um comercio sem site e com 200 avaliacoes esta faturando bem e
 * deixando dinheiro na mesa. O segundo e o lead que vale a ligacao.
 *
 * Todos os pesos ficam em PESOS_PADRAO para poderem ser ajustados na tela de
 * configuracao sem tocar na logica.
 */

import type { AnaliseSite, ClasseSite } from './website';

export type Faixa = 'muito_bom' | 'bom' | 'intermediario' | 'ruim';

export interface PesosScore {
  /** Quanto vale cada situacao de site. */
  site: Record<ClasseSite, number>;
  telefone: number;
  telefoneCelular: number;
  /** Degraus por volume de avaliacoes: [minimo, pontos]. */
  avaliacoes: Array<[number, number]>;
  /** Degraus por nota: [notaMinima, pontos]. */
  nota: Array<[number, number]>;
  operacional: number;
  horarioCadastrado: number;
}

export const PESOS_PADRAO: PesosScore = {
  site: {
    sem_site: 45,
    rede_social: 45,
    site_google: 40,
    agendamento: 36,
    marketplace: 32,
    construtor: 28,
    proprio: 0,
  },
  telefone: 15,
  telefoneCelular: 5,
  avaliacoes: [
    [200, 25],
    [50, 20],
    [10, 12],
    [1, 5],
  ],
  nota: [
    [4.0, 8],
    [3.0, 4],
  ],
  operacional: 2,
  horarioCadastrado: 3,
};

export const LIMITES_FAIXA = { muito_bom: 80, bom: 60, intermediario: 40 } as const;

/**
 * Teto para quem ja tem site proprio.
 *
 * Sem esta regra o modelo se engana sozinho: os pontos de reputacao e contato
 * somam 58 por si, entao uma clinica com site proprio, 300 avaliacoes e nota 4,9
 * cairia em "intermediario" e apareceria como pin amarelo de oportunidade no
 * mapa. Ela e um otimo negocio e um lead pessimo, e as duas coisas nao podem
 * ocupar a mesma escala.
 *
 * O teto mantem a ordenacao relativa entre quem tem site (util no dia em que
 * voce quiser prospectar redesign), mas garante que ninguem com site proprio
 * saia da faixa ruim.
 */
export const TETO_COM_SITE_PROPRIO = LIMITES_FAIXA.intermediario - 1;

export const ROTULO_FAIXA: Record<Faixa, string> = {
  muito_bom: 'Muito bom',
  bom: 'Bom',
  intermediario: 'Intermediario',
  ruim: 'Ruim',
};

/** Cores dos pins e badges. Quem tem site proprio cai em ruim e fica cinza. */
export const COR_FAIXA: Record<Faixa, string> = {
  muito_bom: '#dc2626',
  bom: '#f97316',
  intermediario: '#eab308',
  ruim: '#9ca3af',
};

export interface EntradaScore {
  site: AnaliseSite;
  temTelefone: boolean;
  telefoneCelular: boolean;
  totalAvaliacoes: number | null;
  nota: number | null;
  operacional: boolean;
  temHorario: boolean;
}

export interface ResultadoScore {
  score: number;
  faixa: Faixa;
  /**
   * Explicacao legivel de como o score foi montado, mostrada no detalhe do
   * lead. Sem isso o score e uma caixa preta e voce nao confia nele.
   */
  motivos: Array<{ texto: string; pontos: number }>;
}

function degrau(valor: number | null, degraus: Array<[number, number]>): number {
  if (valor === null) return 0;
  for (const [minimo, pontos] of degraus) {
    if (valor >= minimo) return pontos;
  }
  return 0;
}

export function faixaDoScore(score: number): Faixa {
  if (score >= LIMITES_FAIXA.muito_bom) return 'muito_bom';
  if (score >= LIMITES_FAIXA.bom) return 'bom';
  if (score >= LIMITES_FAIXA.intermediario) return 'intermediario';
  return 'ruim';
}

export function calcularScore(
  entrada: EntradaScore,
  pesos: PesosScore = PESOS_PADRAO,
): ResultadoScore {
  const motivos: ResultadoScore['motivos'] = [];
  const somar = (texto: string, pontos: number) => {
    if (pontos !== 0) motivos.push({ texto, pontos });
    return pontos;
  };

  let score = 0;

  score += somar(entrada.site.rotulo, pesos.site[entrada.site.classe]);

  if (entrada.temTelefone) {
    score += somar('Telefone disponivel', pesos.telefone);
    if (entrada.telefoneCelular) {
      score += somar('Celular, provavel WhatsApp', pesos.telefoneCelular);
    }
  }

  const pAvaliacoes = degrau(entrada.totalAvaliacoes, pesos.avaliacoes);
  if (pAvaliacoes > 0) {
    score += somar(`${entrada.totalAvaliacoes} avaliacoes no Google`, pAvaliacoes);
  }

  const pNota = degrau(entrada.nota, pesos.nota);
  if (pNota > 0) {
    score += somar(`Nota ${entrada.nota?.toFixed(1)}`, pNota);
  }

  if (entrada.operacional) score += somar('Negocio em operacao', pesos.operacional);
  if (entrada.temHorario) score += somar('Horario cadastrado', pesos.horarioCadastrado);

  // Os tetos entram como ajuste visivel na lista de motivos, e nao como um corte
  // silencioso. Assim a soma dos motivos sempre fecha com o score exibido e o
  // detalhe do lead nunca mostra uma conta que nao bate.
  if (entrada.site.temSiteReal && score > TETO_COM_SITE_PROPRIO) {
    score += somar('Ja tem site proprio, nao e oportunidade', TETO_COM_SITE_PROPRIO - score);
  }

  if (score > 100) {
    score += somar('Teto de 100 pontos', 100 - score);
  }

  score = Math.max(0, Math.round(score));

  return { score, faixa: faixaDoScore(score), motivos };
}
