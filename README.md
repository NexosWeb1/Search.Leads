# Search Leads

Prospeccao de clientes para quem faz sites. Varre o mapa de uma regiao, acha os
comercios que **nao tem site**, pontua cada um por quanto vale a abordagem, e
guarda o historico de contato para voce nunca falar duas vezes com a mesma pessoa
sem querer.

## Comecando

### 1. Rodar sem chave de API, so para conhecer

Da para ver a ferramenta funcionando com dados de demonstracao, sem gastar nada:

```bash
npm install
npm run semear      # cria 108 leads ficticios em Porto Alegre com historico
npm run dev
```

Abra <http://localhost:3000>. O mapa, o Kanban e o painel de resultados vao estar
populados.

Os leads de demonstracao aparecem como uma busca chamada "Porto Alegre, RS (dados
de demonstracao)", entao voce distingue no olho o que e inventado. Para removelos
sem tocar nas varreduras reais:

```bash
npm run semear -- --limpar        # so a demonstracao
npm run semear -- --limpar-tudo   # zera o banco, inclusive buscas pagas
```

### 2. Ligar a busca de verdade

Precisa de uma chave da Google Places API:

1. Entre no [Google Cloud Console](https://console.cloud.google.com) e crie um projeto.
2. Em **APIs e servicos**, ative **Places API (New)** e **Geocoding API**.
3. Em **Credenciais**, crie uma chave de API e restrinja a essas duas APIs.
4. Ative o **faturamento** no projeto. E obrigatorio mesmo dentro da cota gratuita.
5. Copie `.env.example` para `.env.local` e preencha `GOOGLE_MAPS_API_KEY`.
6. Reinicie o `npm run dev`.

Antes de gastar, confira a estimativa pela linha de comando:

```bash
npm run scan -- --nicho clinica-medica --cidade "Porto Alegre, RS" --raio 20 --estimar
npm run scan -- --listar-nichos
```

Tirando o `--estimar`, o mesmo comando roda a varredura de verdade e imprime os
melhores leads no terminal. Serve para conferir que o motor e o custo estao
certos antes de confiar na tela.

## Quanto custa

Os campos que dao valor ao lead (site, telefone, nota, avaliacoes) sao todos da
SKU **Enterprise** da Places API. A cobranca segue sempre a SKU mais alta do
pedido, entao toda varredura cai nessa faixa.

| | |
|---|---|
| Cota gratuita | 1.000 requisicoes por mes na faixa Enterprise |
| Acima da cota | USD 35,00 por mil requisicoes |
| Por requisicao | ate 20 comercios |
| Varredura de 20 km | cerca de 41 requisicoes, ou USD 1,44 |

Na pratica a cota gratuita cobre entre 15 e 25 varreduras completas por mes.

A sidebar mostra **quanto da cota do mes ja foi usado**, com aviso em 80% e outro
ao esgotar. O numero sai das proprias varreduras registradas, entao voce nao
precisa abrir o console do Google para saber se ainda pode buscar de graca.

Cuidado com uma conta que engana: um teto diario de 200 requisicoes nao garante
que voce fique no gratuito, porque 200 x 30 dias da 6.000, seis vezes a cota. O
teto diario protege contra acidente pontual; quem protege o mes e o contador da
sidebar.

Duas protecoes que valem configurar no Google Cloud:

- **Cotas → Places API (New)**: limite as cotas "per day" (o padrao do Google e
  50.000 por dia, o que seria US$ 1.750 num unico dia).
- **Faturamento → Orcamentos e alertas**: um orcamento de R$ 5 com alerta em 50% e
  100% avisa por e-mail no dia em que qualquer cobranca comecar.

Reduzir o custo: o cache de celula guarda o resultado por 30 dias, entao repetir a
mesma busca no mesmo mes nao paga de novo. A Geocoding API, usada no campo de
cidade, e da faixa Essentials (10.000 gratis por mes) e nao pesa.

## O que a plataforma faz

**Varredura por grade.** O Nearby Search da Places API devolve no maximo 20
resultados e nao tem paginacao, entao uma busca unica num raio de 20 km traria 20
comercios, nao os 112 que a cidade tem. A ferramenta cobre o circulo com uma
grade hexagonal de celulas menores, consulta cada uma, subdivide as que vierem
cheias e deduplica pelo place id. E o que faz a diferenca entre listar uma
amostra e varrer a cidade.

**Score de 0 a 100.** Nao ter site pesa 45 pontos, mas prova de que o negocio
fatura pesa quase tanto: um comercio sem site com 200 avaliacoes no Google esta
deixando dinheiro na mesa e e o lead mais quente que existe. O detalhe do lead
mostra a conta ponto por ponto, sem caixa preta.

**Site improvisado conta como sem site.** No Brasil muito comercio preenche o
campo de site do Google com o Instagram, com o site gratuito que o proprio Google
gera (`.negocio.site`), ou com a pagina dele no iFood e no Doctoralia. Nada disso
e ter site: e um dono que ja entendeu que precisa de presenca online e resolveu no
improviso. Filtrar so por campo vazio perderia a maior parte do mercado.

**Historico que gruda no comercio.** O lead e indexado pelo place id do Google, e
a ligacao com as buscas e muitos-para-muitos. Consequencia pratica: se voce varrer
"barbearia" hoje e "salao de beleza" no mes que vem, um comercio que aparecer nas
duas listas chega ja marcado como contatado, com data e o texto do que voce
mandou.

**Periodo de espera.** Contato com menos de 15 dias bloqueia o lead no disparo.
Entre 15 e 45 dias ele volta como follow-up. Tres tentativas sem resposta marcam
como frio. Quem respondeu sai do disparo em massa. Quem foi marcado como perdido
ou como nao perturbe fica fora ate voce decidir o contrario no Kanban.

**Disparo por link.** A ferramenta nao envia sozinha: abre o WhatsApp com a
mensagem personalizada pronta e voce clica em enviar. Isso e proposital.
Automatizar exigiria API nao oficial, com risco real de banir seu numero. Junto vem
o contador diario, que avisa antes de voce passar de 40 envios e queimar o numero.

**Dois tipos de erro, nunca somados.** Numero invalido e falha *tecnica*: nao gasta
tentativa, nao inicia periodo de espera, e o lead volta para a fila depois do
enriquecimento. Mandou e nao fechou e falha *comercial*, com motivo. Misturar os
dois faria uma lista com telefones ruins parecer uma abordagem ruim.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de producao |
| `npm test` | 96 testes do nucleo (grade, score, telefone, cooldown, banco, crawler) |
| `npm run typecheck` | Verificacao de tipos |
| `npm run lint` | ESLint |
| `npm run scan -- ...` | Varredura pela linha de comando |
| `npm run semear` | Dados de demonstracao |

## Estrutura

```
src/
  app/
    api/
      search/       varredura, com progresso transmitido na resposta
      leads/        listagem com filtros; PATCH move no funil
      contacts/     registra tentativa de contato e conta os envios do dia
      enrich/       crawler de e-mail, Instagram e WhatsApp
      export/       CSV e XLSX
      stats/        agregacao do painel
      geocode/      cidade para coordenada
  lib/
    search/         grade hexagonal, subdivisao e orquestrador
    places/         client da Places API, field mask e controle de orcamento
    scoring/        score, faixas e classificacao do que e "ter site"
    contacts/        periodo de espera, registro de contato e funil
    enrich/         extracao de contato
    db/             schema, queries e cache de celula
  components/       interface, uma pasta por area
scripts/
  scan.ts           varredura pelo terminal
  semear.ts         dados de demonstracao
tests/              96 testes, rodam sem chave de API
```

## Decisoes que valem saber

**Banco em arquivo.** SQLite via libsql, em `data/leads.db`. Os binarios vem
prontos, entao nao precisa de compilador no Windows, e o mesmo codigo aponta para o
Turso depois se voce quiser hospedar, sem trocar uma query.

**Dados do Google separados dos seus.** A tabela `leads` guarda so o que veio da
Places API e a `lead_crm` guarda so o que e seu. Nao e purismo: os Termos do
Google proibem manter conteudo de Places por mais de 30 dias, com excecao do place
id. Com as tabelas separadas, expirar os dados do Google nao apaga seu historico
de contato, suas notas e seu funil.

**O banco nao vai para o Git.** Ele contem telefone e endereco de negocios reais,
e ja esta no `.gitignore` junto com `.env.local`.

**Acessibilidade.** Todo par de cor foi medido, nao escolhido por aparencia: o
minimo e 4,5:1 do WCAG 2.2 AA para texto e 3:1 para controle e borda de campo. O
botao do WhatsApp usa texto escuro sobre o verde da marca porque branco sobre
`#25d366` da 1,98:1. No painel, verde e vermelho nunca carregam sentido sozinhos:
sob deuteranopia eles ficam praticamente indistinguiveis, entao todo bloco de
resultado leva icone e rotulo.

## O que ainda nao tem

- **Estado na URL.** Filtro, aba e busca selecionada vivem em memoria; recarregar
  a pagina volta ao inicio e nao da para mandar um link de uma lista filtrada.
- **Multiusuario.** E de uso individual: sem login, sem separacao por conta.
- **Enriquecimento de quem nao tem site nenhum.** Sem URL nao ha de onde extrair
  contato. Buscar o Instagram pelo nome exigiria raspar o Instagram, que bloqueia
  e proibe.
- **Deteccao de site ruim.** Hoje dominio proprio conta como "tem site" e sai da
  lista. Verificar se esse site esta no ar, se e responsivo e se e rapido
  transformaria redesign num nicho novo.
