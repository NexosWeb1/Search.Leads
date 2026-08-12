/**
 * Divisao do circulo de busca em celulas.
 *
 * Por que isso existe: o Nearby Search da Places API devolve no maximo 20
 * resultados e nao tem paginacao. Uma unica chamada num raio de 20 km traria 20
 * comercios, nao os 112 que a cidade tem. A saida e cobrir o circulo com muitas
 * celulas pequenas, consultar cada uma e deduplicar pelo place id.
 *
 * O empacotamento e hexagonal (rede triangular) porque e o que cobre o plano
 * com menos circulos: cerca de 21% de sobreposicao, contra 57% de uma grade
 * quadrada. Menos sobreposicao significa menos requisicoes e menos custo.
 */

import { haversineMeters, offsetMeters, clamp, type LatLng } from '../geo';

export interface Celula {
  id: string;
  centro: LatLng;
  raioM: number;
  /** 0 e a grade inicial. 1 e 2 sao subdivisoes de celula saturada. */
  nivel: number;
  paiId: string | null;
}

/**
 * Numero de celulas necessarias e aproximadamente 1.209 * (R/r)^2.
 *
 * Vem de: area do circulo dividida pela area do hexagono de Voronoi de cada
 * celula. Com espacamento d = r*raiz(3), o hexagono tem area (raiz(3)/2)*d^2 =
 * 2.598*r^2, e pi/2.598 = 1.209.
 */
const FATOR_COBERTURA = 1.209;

/** Fora desta faixa nao vale a pena: celula grande satura, celula pequena custa caro. */
const RAIO_CELULA_MIN_M = 1_200;
const RAIO_CELULA_MAX_M = 5_000;

/** Limite duro da propria API. */
export const RAIO_BUSCA_MAX_M = 50_000;

/**
 * Escolhe o raio da celula para que a grade caia perto de `alvoCelulas`.
 *
 * O alvo de 40 e um meio de campo: celulas de cerca de 3,5 km num raio de 20 km,
 * grandes o bastante para nao explodir o numero de requisicoes e pequenas o
 * bastante para que a maioria nao sature em area urbana comum.
 */
export function escolherRaioCelula(raioBuscaM: number, alvoCelulas = 40): number {
  const ideal = raioBuscaM * Math.sqrt(FATOR_COBERTURA / alvoCelulas);
  return Math.round(clamp(ideal, RAIO_CELULA_MIN_M, RAIO_CELULA_MAX_M));
}

/** Quantas celulas a grade vai ter, para estimar custo antes de gastar. */
export function estimarCelulas(raioBuscaM: number, raioCelulaM: number): number {
  return Math.max(1, Math.ceil(FATOR_COBERTURA * (raioBuscaM / raioCelulaM) ** 2));
}

/**
 * Gera a grade que cobre o circulo de busca.
 *
 * Uma celula entra se o centro dela estiver a no maximo R + r do centro da
 * busca. Essa e a condicao exata de cobertura: qualquer ponto dentro do circulo
 * esta a no maximo r do centro de rede mais proximo, e esse centro esta por
 * consequencia a no maximo R + r da origem. Apertar mais do que isso abre buraco
 * na borda e faz voce perder lead.
 */
export function gerarGrade(centro: LatLng, raioBuscaM: number, raioCelulaM: number): Celula[] {
  const r = raioCelulaM;
  const dx = r * Math.sqrt(3);
  const dy = r * 1.5;
  const alcance = raioBuscaM + r;

  const maxLinha = Math.ceil(alcance / dy);
  const maxColuna = Math.ceil(alcance / dx) + 1;

  const celulas: Celula[] = [];

  for (let linha = -maxLinha; linha <= maxLinha; linha++) {
    // Linhas impares deslocam meia coluna: e isso que forma a rede triangular.
    const deslocamento = (linha & 1) === 0 ? 0 : dx / 2;
    const norte = linha * dy;

    for (let coluna = -maxColuna; coluna <= maxColuna; coluna++) {
      const leste = coluna * dx + deslocamento;

      // Descarte barato antes do haversine.
      if (Math.hypot(leste, norte) > alcance) continue;

      const pontoCentral = offsetMeters(centro, leste, norte);
      if (haversineMeters(centro, pontoCentral) > alcance) continue;

      celulas.push({
        id: `c0_${linha}_${coluna}`,
        centro: pontoCentral,
        raioM: r,
        nivel: 0,
        paiId: null,
      });
    }
  }

  // Do centro para a borda: as areas mais densas aparecem primeiro e o progresso
  // na tela fica util desde o comeco.
  celulas.sort(
    (a, b) => haversineMeters(centro, a.centro) - haversineMeters(centro, b.centro),
  );

  return celulas;
}

/**
 * Quebra uma celula saturada em 7 filhas.
 *
 * Sete circulos de raio r/2 cobrem exatamente um circulo de raio r quando os
 * seis externos ficam a distancia r*raiz(3)/2 do centro. Esse e o recobrimento
 * otimo conhecido, e nele a cobertura e apenas tangente: por isso o raio das
 * filhas leva uma folga de 4%, senao um erro de arredondamento abre uma fresta.
 */
export function subdividir(celula: Celula): Celula[] {
  const raioFilha = celula.raioM * 0.52;
  const distancia = (celula.raioM * Math.sqrt(3)) / 2;
  const nivel = celula.nivel + 1;

  const filhas: Celula[] = [
    {
      id: `${celula.id}_f0`,
      centro: celula.centro,
      raioM: raioFilha,
      nivel,
      paiId: celula.id,
    },
  ];

  for (let i = 0; i < 6; i++) {
    const angulo = (i * Math.PI) / 3;
    filhas.push({
      id: `${celula.id}_f${i + 1}`,
      centro: offsetMeters(
        celula.centro,
        Math.cos(angulo) * distancia,
        Math.sin(angulo) * distancia,
      ),
      raioM: raioFilha,
      nivel,
      paiId: celula.id,
    });
  }

  return filhas;
}
