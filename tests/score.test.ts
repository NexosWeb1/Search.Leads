import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularScore,
  faixaDoScore,
  TETO_COM_SITE_PROPRIO,
  type EntradaScore,
} from '../src/lib/scoring/score';
import { analisarSite } from '../src/lib/scoring/website';

function entrada(parcial: Partial<EntradaScore> = {}): EntradaScore {
  return {
    site: analisarSite(null),
    temTelefone: true,
    telefoneCelular: true,
    totalAvaliacoes: 0,
    nota: null,
    operacional: true,
    temHorario: false,
    ...parcial,
  };
}

test('sem site, celular e muitas avaliacoes da o lead mais quente', () => {
  const r = calcularScore(
    entrada({ totalAvaliacoes: 240, nota: 4.7, temHorario: true }),
  );
  assert.equal(r.faixa, 'muito_bom');
  assert.ok(r.score >= 90, `score ${r.score}`);
});

test('quem tem site proprio cai na faixa ruim, por melhor que seja o negocio', () => {
  // O caso que revelou o problema: sem o teto, os pontos de reputacao e contato
  // somavam 58 sozinhos e a clinica virava pin amarelo de oportunidade no mapa.
  const r = calcularScore(
    entrada({
      site: analisarSite('https://clinicasorriso.com.br'),
      totalAvaliacoes: 300,
      nota: 4.9,
      temHorario: true,
    }),
  );
  assert.equal(r.faixa, 'ruim');
  assert.equal(r.score, TETO_COM_SITE_PROPRIO);
});

test('o teto do site proprio aparece como motivo e a conta fecha', () => {
  const r = calcularScore(
    entrada({
      site: analisarSite('https://clinicasorriso.com.br'),
      totalAvaliacoes: 300,
      nota: 4.9,
      temHorario: true,
    }),
  );
  const ajuste = r.motivos.find((m) => m.pontos < 0);
  assert.ok(ajuste, 'o corte precisa ficar visivel no detalhe do lead');
  assert.equal(
    r.motivos.reduce((acc, m) => acc + m.pontos, 0),
    r.score,
  );
});

test('negocio com site fraco ainda ordena acima de negocio com site forte', () => {
  // O teto comprime, mas nao achata: isso preserva a ordenacao para o dia em que
  // voce quiser prospectar redesign de site ruim.
  const fraco = calcularScore(
    entrada({ site: analisarSite('https://x.com.br'), totalAvaliacoes: 0, nota: null }),
  );
  const forte = calcularScore(
    entrada({ site: analisarSite('https://y.com.br'), totalAvaliacoes: 300, nota: 4.9 }),
  );
  assert.ok(forte.score > fraco.score);
  assert.equal(forte.faixa, 'ruim');
  assert.equal(fraco.faixa, 'ruim');
});

test('Instagram no campo de site pontua igual a nao ter site', () => {
  const comum = { totalAvaliacoes: 120, nota: 4.5, temHorario: true };
  const vazio = calcularScore(entrada({ site: analisarSite(null), ...comum }));
  const insta = calcularScore(
    entrada({ site: analisarSite('https://instagram.com/loja'), ...comum }),
  );
  assert.equal(vazio.score, insta.score);
});

test('volume de avaliacoes separa negocio ativo de negocio parado', () => {
  const parado = calcularScore(entrada({ totalAvaliacoes: 0 }));
  const movimentado = calcularScore(entrada({ totalAvaliacoes: 250 }));

  assert.ok(
    movimentado.score - parado.score >= 25,
    'a diferenca precisa ser grande o bastante para reordenar a lista',
  );
});

test('sem telefone perde os pontos de contato', () => {
  const com = calcularScore(entrada({ temTelefone: true, telefoneCelular: true }));
  const sem = calcularScore(entrada({ temTelefone: false, telefoneCelular: false }));
  assert.equal(com.score - sem.score, 20);
});

test('fixo vale menos que celular', () => {
  const celular = calcularScore(entrada({ temTelefone: true, telefoneCelular: true }));
  const fixo = calcularScore(entrada({ temTelefone: true, telefoneCelular: false }));
  assert.ok(celular.score > fixo.score);
});

test('o score nunca sai da faixa de 0 a 100', () => {
  const maximo = calcularScore(
    entrada({ totalAvaliacoes: 99_999, nota: 5, temHorario: true }),
  );
  assert.ok(maximo.score <= 100, `score ${maximo.score}`);

  const minimo = calcularScore(
    entrada({
      site: analisarSite('https://site.com.br'),
      temTelefone: false,
      telefoneCelular: false,
      totalAvaliacoes: null,
      nota: null,
      operacional: false,
    }),
  );
  assert.ok(minimo.score >= 0);
});

test('os motivos explicam o score e nao ficam vazios', () => {
  const r = calcularScore(entrada({ totalAvaliacoes: 80, nota: 4.2 }));
  assert.ok(r.motivos.length >= 4);
  const soma = r.motivos.reduce((acc, m) => acc + m.pontos, 0);
  assert.equal(soma, r.score, 'a soma dos motivos precisa fechar com o score');
});

test('as faixas casam com os limites', () => {
  assert.equal(faixaDoScore(100), 'muito_bom');
  assert.equal(faixaDoScore(80), 'muito_bom');
  assert.equal(faixaDoScore(79), 'bom');
  assert.equal(faixaDoScore(60), 'bom');
  assert.equal(faixaDoScore(59), 'intermediario');
  assert.equal(faixaDoScore(40), 'intermediario');
  assert.equal(faixaDoScore(39), 'ruim');
  assert.equal(faixaDoScore(0), 'ruim');
});
