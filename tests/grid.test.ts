/**
 * O teste que mais importa no projeto.
 *
 * Se a grade deixar um buraco, a plataforma perde leads em silencio: a busca
 * termina com sucesso, mostra 90 comercios e voce nunca descobre que existiam
 * 110. Nao da erro, nao da aviso, so falta cliente.
 *
 * A verificacao e direta: sorteia milhares de pontos dentro do circulo de busca
 * e exige que cada um caia dentro de alguma celula. O sorteio usa gerador com
 * semente fixa para o teste nunca ficar intermitente.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escolherRaioCelula,
  estimarCelulas,
  gerarGrade,
  subdividir,
} from '../src/lib/search/grid';
import { haversineMeters, type LatLng } from '../src/lib/geo';

/** Gerador com semente fixa: mesmo sorteio em toda execucao. */
function aleatorio(semente: number): () => number {
  let estado = semente;
  return () => {
    estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return estado / 4_294_967_296;
  };
}

/** Pontos distribuidos por area dentro do circulo (raiz no raio, senao adensa no centro). */
function pontosNoCirculo(centro: LatLng, raioM: number, quantidade: number): LatLng[] {
  const rnd = aleatorio(20260812);
  const pontos: LatLng[] = [];
  for (let i = 0; i < quantidade; i++) {
    const distancia = raioM * Math.sqrt(rnd());
    const angulo = rnd() * Math.PI * 2;
    const norte = Math.sin(angulo) * distancia;
    const leste = Math.cos(angulo) * distancia;
    pontos.push({
      lat: centro.lat + norte / 111_320,
      lng: centro.lng + leste / (111_320 * Math.cos((centro.lat * Math.PI) / 180)),
    });
  }
  return pontos;
}

const PORTO_ALEGRE: LatLng = { lat: -30.0346, lng: -51.2177 };

for (const raioKm of [2, 5, 10, 20, 35, 50]) {
  test(`grade de ${raioKm} km cobre o circulo inteiro`, () => {
    const raioM = raioKm * 1000;
    const raioCelula = escolherRaioCelula(raioM);
    const grade = gerarGrade(PORTO_ALEGRE, raioM, raioCelula);

    assert.ok(grade.length > 0, 'a grade nao pode sair vazia');

    const amostras = pontosNoCirculo(PORTO_ALEGRE, raioM, 4000);
    let descobertos = 0;

    for (const ponto of amostras) {
      const coberto = grade.some(
        (celula) => haversineMeters(celula.centro, ponto) <= celula.raioM,
      );
      if (!coberto) descobertos++;
    }

    assert.equal(
      descobertos,
      0,
      `${descobertos} de ${amostras.length} pontos ficaram fora de toda celula`,
    );
  });
}

test('a estimativa de celulas fica proxima da grade real', () => {
  for (const raioKm of [5, 10, 20, 40]) {
    const raioM = raioKm * 1000;
    const raioCelula = escolherRaioCelula(raioM);
    const real = gerarGrade(PORTO_ALEGRE, raioM, raioCelula).length;
    const estimado = estimarCelulas(raioM, raioCelula);

    // A estimativa alimenta o aviso de custo antes de confirmar a busca, entao
    // errar por mais que o dobro enganaria voce sobre quanto vai gastar.
    assert.ok(
      real <= estimado * 2 && estimado <= real * 2,
      `raio ${raioKm} km: estimado ${estimado}, real ${real}`,
    );
  }
});

test('grade de 20 km contem toda a area da grade de 5 km', () => {
  // Consequencia pratica: ampliar o raio nunca pode perder um lead que o raio
  // menor achava.
  const grade5 = gerarGrade(PORTO_ALEGRE, 5000, escolherRaioCelula(5000));
  const grade20 = gerarGrade(PORTO_ALEGRE, 20000, escolherRaioCelula(20000));

  const amostras = pontosNoCirculo(PORTO_ALEGRE, 5000, 2000);
  for (const ponto of amostras) {
    const em5 = grade5.some((c) => haversineMeters(c.centro, ponto) <= c.raioM);
    const em20 = grade20.some((c) => haversineMeters(c.centro, ponto) <= c.raioM);
    assert.ok(!em5 || em20, 'ponto coberto no raio 5 ficou descoberto no raio 20');
  }
});

test('as 7 filhas cobrem a celula que foi subdividida', () => {
  const grade = gerarGrade(PORTO_ALEGRE, 10_000, 3000);
  const pai = grade[0];
  const filhas = subdividir(pai);

  assert.equal(filhas.length, 7);
  assert.ok(filhas.every((f) => f.nivel === pai.nivel + 1));
  assert.ok(filhas.every((f) => f.paiId === pai.id));

  const amostras = pontosNoCirculo(pai.centro, pai.raioM, 4000);
  let descobertos = 0;
  for (const ponto of amostras) {
    if (!filhas.some((f) => haversineMeters(f.centro, ponto) <= f.raioM)) {
      descobertos++;
    }
  }
  assert.equal(descobertos, 0, `${descobertos} pontos do pai ficaram sem filha`);
});

test('subdividir duas vezes continua cobrindo', () => {
  const grade = gerarGrade(PORTO_ALEGRE, 10_000, 3000);
  const pai = grade[0];
  const netas = subdividir(pai).flatMap(subdividir);

  assert.equal(netas.length, 49);

  const amostras = pontosNoCirculo(pai.centro, pai.raioM, 4000);
  let descobertos = 0;
  for (const ponto of amostras) {
    if (!netas.some((f) => haversineMeters(f.centro, ponto) <= f.raioM)) {
      descobertos++;
    }
  }
  assert.equal(descobertos, 0, `${descobertos} pontos ficaram sem neta`);
});

test('o raio da celula respeita a faixa util', () => {
  // Celula grande satura sempre; celula pequena multiplica o custo.
  assert.equal(escolherRaioCelula(1000), 1200, 'piso de 1,2 km');
  assert.equal(escolherRaioCelula(500_000), 5000, 'teto de 5 km');

  const vinteKm = escolherRaioCelula(20_000);
  assert.ok(vinteKm > 3000 && vinteKm < 4000, `esperava cerca de 3,5 km, veio ${vinteKm}`);
});

test('nenhuma celula nasce longe demais do centro', () => {
  const raioM = 20_000;
  const raioCelula = escolherRaioCelula(raioM);
  const grade = gerarGrade(PORTO_ALEGRE, raioM, raioCelula);

  for (const celula of grade) {
    const distancia = haversineMeters(PORTO_ALEGRE, celula.centro);
    assert.ok(
      distancia <= raioM + raioCelula + 1,
      `celula a ${Math.round(distancia)} m, limite ${raioM + raioCelula}`,
    );
  }
});

test('a grade vem ordenada do centro para a borda', () => {
  const grade = gerarGrade(PORTO_ALEGRE, 20_000, escolherRaioCelula(20_000));
  let anterior = -1;
  for (const celula of grade) {
    const distancia = haversineMeters(PORTO_ALEGRE, celula.centro);
    assert.ok(distancia >= anterior - 1, 'a ordem do centro para a borda quebrou');
    anterior = distancia;
  }
});
