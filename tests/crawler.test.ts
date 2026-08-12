/**
 * Extracao de contato. Roda sem rede: o HTML e sintetico, mas reproduz os
 * padroes que aparecem em site de comercio pequeno no Brasil.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrairDoHtml,
  handleInstagram,
  buscarContatos,
  extrairDaUrl,
  precisaDeRede,
} from '../src/lib/enrich/crawler';

test('pega e-mail de link mailto', () => {
  const r = extrairDoHtml('<a href="mailto:contato@barbearia.com.br">Fale conosco</a>');
  assert.equal(r.email, 'contato@barbearia.com.br');
  assert.equal(r.status, 'ok');
});

test('mailto tem prioridade sobre e-mail solto no texto', () => {
  const html = `
    <p>duvidas: aleatorio1234@gmail.com</p>
    <a href="mailto:contato@empresa.com.br">e-mail oficial</a>`;
  assert.equal(extrairDoHtml(html).email, 'contato@empresa.com.br');
});

test('pega e-mail solto quando nao ha mailto', () => {
  const r = extrairDoHtml('<p>Escreva para atendimento@clinica.com.br</p>');
  assert.equal(r.email, 'atendimento@clinica.com.br');
});

test('descarta e-mail de infraestrutura de plataforma', () => {
  // Site feito no Wix vem cheio destes, e nenhum e do dono do negocio.
  const html = `
    <script>window.x="abc123@sentry.wixpress.com"</script>
    <a href="mailto:1a2b3c4d5e6f7a8b@wixpress.com">x</a>
    <p>contato@salaobella.com.br</p>`;
  assert.equal(extrairDoHtml(html).email, 'contato@salaobella.com.br');
});

test('descarta e-mail de dominio de exemplo', () => {
  const r = extrairDoHtml('<a href="mailto:seunome@example.com">x</a>');
  assert.equal(r.email, null);
});

test('descarta o que parece e-mail mas e nome de arquivo', () => {
  const r = extrairDoHtml('<img src="sprite@2x.png">');
  assert.equal(r.email, null);
});

test('pega handle do Instagram', () => {
  const r = extrairDoHtml(
    '<a href="https://www.instagram.com/barbeariadoze/">Instagram</a>',
  );
  assert.equal(r.instagram, '@barbeariadoze');
});

test('ignora link de post e pega o do perfil', () => {
  const html = `
    <a href="https://instagram.com/p/Cabc123/">post</a>
    <a href="https://instagram.com/reel/Xyz/">reel</a>
    <a href="https://instagram.com/clinicasorriso">perfil</a>`;
  assert.equal(extrairDoHtml(html).instagram, '@clinicasorriso');
});

test('pega WhatsApp de link wa.me', () => {
  const r = extrairDoHtml('<a href="https://wa.me/5551999508056">Chame no zap</a>');
  assert.equal(r.whatsapp, '5551999508056');
});

test('pega WhatsApp do formato api.whatsapp.com', () => {
  const r = extrairDoHtml(
    '<a href="https://api.whatsapp.com/send?phone=5551999508056&text=oi">zap</a>',
  );
  assert.equal(r.whatsapp, '5551999508056');
});

test('pega pagina do Facebook e ignora widget de compartilhar', () => {
  const html = `
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">compartilhar</a>
    <a href="https://facebook.com/pizzariadonjuan">nossa pagina</a>`;
  assert.equal(extrairDoHtml(html).facebook, 'pizzariadonjuan');
});

test('pagina sem contato nenhum e sucesso, nao falha', () => {
  // A diferenca importa: "li e nao achei" nao e o mesmo que "nao consegui ler".
  const r = extrairDoHtml('<html><body><h1>Bem-vindo</h1></body></html>');
  assert.equal(r.status, 'ok');
  assert.equal(r.email, null);
  assert.ok(r.erro?.includes('nenhum contato'));
});

test('handleInstagram aceita variacoes de URL', () => {
  assert.equal(handleInstagram('instagram.com/loja.oficial'), '@loja.oficial');
  assert.equal(handleInstagram('https://www.instagram.com/loja_1/?hl=pt'), '@loja_1');
  assert.equal(handleInstagram('https://instagram.com/explore/tags/x'), null);
  assert.equal(handleInstagram('https://exemplo.com.br'), null);
});

test('lead sem site nenhum fica marcado como sem fonte', async () => {
  // Nao pode ficar pendente para sempre: voce precisa saber que ali nao ha o
  // que buscar, e nao que a fila travou.
  for (const entrada of [null, '', '   ']) {
    const r = await buscarContatos(entrada);
    assert.equal(r.status, 'sem_fonte');
    assert.equal(r.email, null);
  }
});

test('URL que ja e o Instagram resolve sem baixar nada', async () => {
  const r = await buscarContatos('https://instagram.com/barbeariadoze');
  assert.equal(r.status, 'ok');
  assert.equal(r.instagram, '@barbeariadoze');
});

test('URL invalida falha com motivo, sem lancar excecao', async () => {
  const r = await buscarContatos('http://');
  assert.equal(r.status, 'falhou');
  assert.ok(r.erro);
});

test('rede social e resolvida sem rede, site de verdade exige rede', () => {
  /*
   * Esta distincao sustenta a trava de um acesso por dominio no enriquecimento.
   * Se o Instagram contasse como acesso de rede, a trava gastaria a cota de
   * instagram.com no primeiro lead e adiaria todos os outros. Como
   * instagram.com e o host mais comum entre os leads bons, seriam justamente os
   * melhores a ficar sem enriquecer.
   */
  assert.equal(precisaDeRede('https://instagram.com/loja'), false);
  assert.equal(precisaDeRede('https://facebook.com/loja'), false);
  assert.equal(precisaDeRede('https://wa.me/5551999508056'), false);
  assert.equal(precisaDeRede(null), false);

  assert.equal(precisaDeRede('https://clinicasorriso.com.br'), true);
  assert.equal(precisaDeRede('https://loja.negocio.site'), true);
});

test('extrairDaUrl devolve null quando so da para saber baixando', () => {
  assert.equal(extrairDaUrl('https://clinicasorriso.com.br'), null);

  const social = extrairDaUrl('https://instagram.com/clinicasorriso');
  assert.ok(social);
  assert.equal(social.instagram, '@clinicasorriso');
  assert.equal(social.status, 'ok');
});
