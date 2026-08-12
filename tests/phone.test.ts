/**
 * O telefone errado quebra duas coisas: o link do WhatsApp nao abre, e o lead
 * entra na fila de disparo para depois falhar. Estes casos cobrem os formatos
 * que a Places API realmente devolve no Brasil.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkWhatsApp, normalizarTelefone } from '../src/lib/phone/br';

test('celular em formato internacional', () => {
  const r = normalizarTelefone('+55 51 99950-8056');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5551999508056');
  assert.equal(r.celular, true);
  assert.equal(r.ddd, 51);
  assert.equal(r.formatado, '(51) 99950-8056');
});

test('celular em formato nacional', () => {
  const r = normalizarTelefone('(51) 99950-8056');
  assert.equal(r.e164, '5551999508056');
  assert.equal(r.celular, true);
});

test('celular so com digitos', () => {
  assert.equal(normalizarTelefone('51999508056').e164, '5551999508056');
});

test('fixo e valido mas nao e celular', () => {
  const r = normalizarTelefone('+55 51 3232-1010');
  assert.equal(r.valido, true);
  assert.equal(r.celular, false);
  assert.equal(r.e164, '555132321010');
  assert.equal(r.formatado, '(51) 3232-1010');
});

test('zero de tronco na frente e descartado', () => {
  assert.equal(normalizarTelefone('051999508056').e164, '5551999508056');
});

test('DDD 55 nao e confundido com o DDI 55', () => {
  // Santa Maria (RS) usa DDD 55. Sem o cuidado no corte do DDI, este numero
  // perderia dois digitos e viraria invalido.
  const r = normalizarTelefone('+55 55 99123-4567');
  assert.equal(r.valido, true);
  assert.equal(r.ddd, 55);
  assert.equal(r.e164, '5555991234567');
});

test('DDD inexistente e rejeitado com motivo', () => {
  const r = normalizarTelefone('(20) 99999-9999');
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'ddd_invalido');
});

test('numero curto e rejeitado', () => {
  const r = normalizarTelefone('3232-1010');
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'digitos_insuficientes');
});

test('vazio e rejeitado', () => {
  for (const entrada of [null, undefined, '', 'sem numero']) {
    const r = normalizarTelefone(entrada);
    assert.equal(r.valido, false);
    assert.equal(r.e164, null);
  }
});

test('celular precisa comecar com 9', () => {
  // 8 digitos comecando com 8 nao e formato valido no Brasil atual.
  const r = normalizarTelefone('5188887777');
  assert.equal(r.valido, false);
});

test('link do WhatsApp escapa a mensagem', () => {
  const link = linkWhatsApp('5551999508056', 'Oi, tudo bem? Vi a Padaria & Cia');
  assert.ok(link.startsWith('https://wa.me/5551999508056?text='));
  assert.ok(link.includes('%26'), 'o e comercial precisa ir escapado');
  assert.ok(!link.includes(' '), 'nao pode sobrar espaco cru na URL');
});
