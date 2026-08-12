/**
 * Estes casos protegem a regra comercial mais importante da ferramenta: um
 * comercio que colocou o Instagram no campo de site NAO tem site, e precisa
 * continuar sendo tratado como lead quente. Se este arquivo passar a falhar,
 * a plataforma comeca a descartar justamente os melhores clientes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisarSite } from '../src/lib/scoring/website';

test('campo vazio e sem site', () => {
  for (const entrada of [null, undefined, '', '   ']) {
    const r = analisarSite(entrada);
    assert.equal(r.classe, 'sem_site');
    assert.equal(r.temSiteReal, false);
  }
});

test('perfil de rede social nao conta como site', () => {
  const casos = [
    'https://www.instagram.com/barbeariadozeca',
    'instagram.com/clinicasorriso/',
    'https://facebook.com/pizzariadonjuan',
    'https://www.linktr.ee/salaobella',
    'https://beacons.ai/petshop',
    'https://wa.me/5551999998888',
  ];
  for (const url of casos) {
    const r = analisarSite(url);
    assert.equal(r.temSiteReal, false, url);
    assert.equal(r.classe, 'rede_social', url);
  }
});

test('site gratuito do Google e lead, nao site', () => {
  for (const url of [
    'https://barbearia-do-ze.negocio.site/',
    'https://clinica.business.site',
    'https://sites.google.com/view/oficina',
  ]) {
    const r = analisarSite(url);
    assert.equal(r.temSiteReal, false, url);
    assert.equal(r.classe, 'site_google', url);
  }
});

test('plataforma de agendamento e apenas perfil', () => {
  for (const url of [
    'https://www.doctoralia.com.br/joao-silva/dermatologista/porto-alegre',
    'https://trinks.com/salao-bella',
  ]) {
    const r = analisarSite(url);
    assert.equal(r.temSiteReal, false, url);
    assert.equal(r.classe, 'agendamento', url);
  }
});

test('marketplace nao e presenca propria', () => {
  for (const url of [
    'https://www.ifood.com.br/delivery/porto-alegre-rs/pizzaria',
    'https://lista.mercadolivre.com.br/loja',
  ]) {
    const r = analisarSite(url);
    assert.equal(r.temSiteReal, false, url);
    assert.equal(r.classe, 'marketplace', url);
  }
});

test('construtor em subdominio de terceiro ainda e lead', () => {
  for (const url of [
    'https://joaosilva.wixsite.com/meusite',
    'https://minhaloja.lojaintegrada.com.br',
    'https://loja.mercadoshops.com.br',
    'https://empresa.blogspot.com',
  ]) {
    const r = analisarSite(url);
    assert.equal(r.temSiteReal, false, url);
    assert.equal(r.classe, 'construtor', url);
  }
});

test('dominio proprio e site de verdade', () => {
  for (const url of [
    'https://clinicasorriso.com.br',
    'http://www.barbeariadoze.com',
    'https://oficinasilva.com.br/servicos',
  ]) {
    const r = analisarSite(url);
    assert.equal(r.temSiteReal, true, url);
    assert.equal(r.classe, 'proprio', url);
  }
});

test('dominio parecido nao e confundido com rede social', () => {
  // O casamento e por sufixo de rotulo, entao isto precisa ser site proprio.
  for (const url of [
    'https://naoinstagram.com.br',
    'https://meuinstagram.com.br',
    'https://facebook.com.br.golpe.net',
  ]) {
    const r = analisarSite(url);
    assert.equal(r.temSiteReal, true, url);
  }
});

test('subdominio de rede social ainda e rede social', () => {
  const r = analisarSite('https://br.instagram.com/loja');
  assert.equal(r.classe, 'rede_social');
});

test('url sem esquema e aceita', () => {
  const r = analisarSite('clinicasorriso.com.br');
  assert.equal(r.temSiteReal, true);
  assert.equal(r.host, 'clinicasorriso.com.br');
});

test('www e removido do host', () => {
  const r = analisarSite('https://www.exemplo.com.br');
  assert.equal(r.host, 'exemplo.com.br');
});
