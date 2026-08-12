/**
 * Estes casos sao a garantia contra spam. Se falharem, a ferramenta volta a
 * permitir mandar mensagem duas vezes para o mesmo comercio, que e exatamente o
 * que desgasta o contato e queima o numero.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarContato,
  COOLDOWN_PADRAO,
  type DadosCrmContato,
} from '../src/lib/contacts/cooldown';

const AGORA = new Date('2026-08-12T12:00:00.000Z').getTime();
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

function crm(parcial: Partial<DadosCrmContato> = {}): DadosCrmContato {
  return {
    status: 'novo',
    tentativas: 0,
    ultimoContatoEm: null,
    respondeuEm: null,
    ...parcial,
  };
}

test('lead sem historico pode ser abordado', () => {
  const r = avaliarContato(crm(), COOLDOWN_PADRAO, AGORA);
  assert.equal(r.pode, true);
  assert.equal(r.tipo, 'nunca_contatado');
  assert.equal(r.proximaTentativa, 1);
});

test('lead sem registro nenhum tambem pode', () => {
  const r = avaliarContato(null, COOLDOWN_PADRAO, AGORA);
  assert.equal(r.pode, true);
  assert.equal(r.tipo, 'nunca_contatado');
});

test('contatado hoje fica bloqueado', () => {
  const r = avaliarContato(
    crm({ status: 'contatado', tentativas: 1, ultimoContatoEm: diasAtras(0) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.pode, false);
  assert.equal(r.tipo, 'em_cooldown');
  assert.equal(r.rotulo, 'Contatado hoje');
  assert.equal(r.diasRestantes, 15);
});

test('contatado ha 3 dias segue bloqueado e mostra o tempo', () => {
  const r = avaliarContato(
    crm({ status: 'contatado', tentativas: 1, ultimoContatoEm: diasAtras(3) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.pode, false);
  assert.equal(r.rotulo, 'Contatado ha 3 dias');
  assert.equal(r.diasRestantes, 12);
});

test('no dia 14 ainda bloqueia e no dia 15 libera', () => {
  const dia14 = avaliarContato(
    crm({ status: 'contatado', tentativas: 1, ultimoContatoEm: diasAtras(14) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(dia14.pode, false);

  const dia15 = avaliarContato(
    crm({ status: 'contatado', tentativas: 1, ultimoContatoEm: diasAtras(15) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(dia15.pode, true);
  assert.equal(dia15.tipo, 'follow_up');
  assert.equal(dia15.proximaTentativa, 2);
});

test('contato muito antigo vira reabordagem e nao follow-up', () => {
  const r = avaliarContato(
    crm({ status: 'contatado', tentativas: 1, ultimoContatoEm: diasAtras(60) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.pode, true);
  assert.equal(r.tipo, 'reabordagem');
});

test('tres tentativas sem resposta esgotam o lead', () => {
  const r = avaliarContato(
    crm({ status: 'contatado', tentativas: 3, ultimoContatoEm: diasAtras(90) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.pode, false);
  assert.equal(r.tipo, 'esgotado');
  assert.equal(r.rotulo, '3 tentativas, sem resposta');
});

test('quem respondeu sai do disparo em massa', () => {
  for (const status of ['respondeu', 'negociando']) {
    const r = avaliarContato(
      crm({ status, tentativas: 1, ultimoContatoEm: diasAtras(40), respondeuEm: diasAtras(38) }),
      COOLDOWN_PADRAO,
      AGORA,
    );
    assert.equal(r.pode, false, status);
    assert.equal(r.tipo, 'em_negociacao', status);
  }
});

test('cliente fechado e nao perturbe ficam bloqueados para sempre', () => {
  for (const status of ['fechado', 'nao_perturbe']) {
    const r = avaliarContato(
      crm({ status, tentativas: 2, ultimoContatoEm: diasAtras(400) }),
      COOLDOWN_PADRAO,
      AGORA,
    );
    assert.equal(r.pode, false, status);
    assert.equal(r.tipo, 'bloqueado', status);
  }
});

test('lead perdido nao volta sozinho para a fila', () => {
  // Quem disse "achou caro" recebeu um nao. Reaparecer no disparo quinze dias
  // depois e insistencia, e era justamente o desgaste a evitar. Volta so se o
  // cartao sair da coluna Perdido, que e uma decisao explicita.
  const r = avaliarContato(
    crm({
      status: 'perdido',
      tentativas: 1,
      ultimoContatoEm: diasAtras(30),
      motivoPerda: 'achou_caro',
    }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.pode, false);
  assert.equal(r.tipo, 'bloqueado');
  assert.equal(r.rotulo, 'Perdido: achou caro');
});

test('status frio bloqueia mesmo com poucas tentativas', () => {
  const r = avaliarContato(
    crm({ status: 'frio', tentativas: 1, ultimoContatoEm: diasAtras(200) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.pode, false);
  assert.equal(r.tipo, 'esgotado');
});

test('bloqueio permanente vence o cooldown de tempo', () => {
  // Um lead fechado contatado hoje precisa aparecer como fechado, e nao como
  // "espere 15 dias", senao a tarja do card mente sobre o motivo.
  const r = avaliarContato(
    crm({ status: 'fechado', tentativas: 1, ultimoContatoEm: diasAtras(0) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.tipo, 'bloqueado');
});

test('zero tentativas com data de contato ainda conta como nunca contatado', () => {
  // Este e o estado que uma falha tecnica produz: existe registro no historico
  // (por isso pode haver data), mas nenhuma mensagem saiu. Se isto virasse
  // cooldown, a lista e a fila de disparo passariam a contar coisas diferentes.
  const r = avaliarContato(
    crm({ status: 'novo', tentativas: 0, ultimoContatoEm: diasAtras(2) }),
    COOLDOWN_PADRAO,
    AGORA,
  );
  assert.equal(r.pode, true);
  assert.equal(r.tipo, 'nunca_contatado');
});

test('nao perturbe sem nenhuma tentativa continua bloqueado', () => {
  // O bloqueio de status precisa vencer a regra de zero tentativas, senao um
  // lead que pediu para nao ser incomodado voltaria para a fila.
  for (const status of ['nao_perturbe', 'fechado']) {
    const r = avaliarContato(
      crm({ status, tentativas: 0, ultimoContatoEm: null }),
      COOLDOWN_PADRAO,
      AGORA,
    );
    assert.equal(r.pode, false, status);
    assert.equal(r.tipo, 'bloqueado', status);
  }
});

test('o cooldown e configuravel', () => {
  const agressivo = { ...COOLDOWN_PADRAO, diasBloqueio: 3 };
  const r = avaliarContato(
    crm({ status: 'contatado', tentativas: 1, ultimoContatoEm: diasAtras(5) }),
    agressivo,
    AGORA,
  );
  assert.equal(r.pode, true);
});
