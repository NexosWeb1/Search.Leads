# Search Leads

Prospeccao de clientes para quem faz sites. Varre o mapa de uma regiao, acha os
comercios que **nao tem site**, pontua cada um por quanto vale a abordagem, e
guarda o historico de contato para voce nunca falar duas vezes com a mesma pessoa
sem querer.

## Comecando

### 1. Criar o projeto no Supabase

A plataforma usa o Supabase para duas coisas: o banco PostgreSQL e a
autenticacao. Em <https://supabase.com> crie um projeto (o plano gratuito
basta) e pegue tres valores:

| Onde | O que copiar | Variavel |
|---|---|---|
| Project Settings > Database > Connection string > **Transaction pooler** | a string com porta **6543** | `DATABASE_URL` |
| Project Settings > API | Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Project Settings > API | chave **anon public** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Use o **pooler de transacao** (6543), nao a conexao direta (5432). Funcao
serverless abre muitas conexoes curtas, e a direta esgota o limite do banco.

Depois crie sua conta em **Authentication > Users > Add user**, com e-mail e
senha. Nao ha tela de cadastro na aplicacao de proposito: contas nascem no
painel, entao ninguem cria acesso sozinho.

Copie `.env.example` para `.env.local`, preencha, e rode:

```bash
npm install
npm run dev
```

As tabelas sao criadas sozinhas na primeira execucao.

### 2. Conhecer a ferramenta com dados de demonstracao

```bash
npm run semear      # cria 108 leads ficticios em Porto Alegre com historico
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

### 3. Ligar a busca de verdade

Precisa de uma chave da Google Places API:

1. Entre no [Google Cloud Console](https://console.cloud.google.com) e crie um projeto.
2. Em **APIs e servicos**, ative **Places API (New)** e **Geocoding API**.
3. Em **Credenciais**, crie uma chave de API e restrinja a essas duas APIs.
4. Ative o **faturamento** no projeto. E obrigatorio mesmo dentro da cota gratuita.
5. Preencha `GOOGLE_MAPS_API_KEY` no `.env.local`.
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

## Acesso

O login usa **Supabase Auth**, com e-mail e senha. Sua conta e criada no painel
do Supabase, em Authentication > Users > Add user.

Algumas decisoes que valem saber:

- **A tranca cobre as rotas de API, nao so a tela.** Proteger apenas a interface
  seria teatro: `/api/leads` devolve sua carteira inteira e `/api/search` gasta
  sua cota, e nenhuma das duas passa pela tela de login.
- **Nao existe tela de cadastro.** Contas nascem no painel do Supabase. Numa
  ferramenta que guarda carteira de leads, deixar qualquer um criar acesso seria
  o mesmo que nao ter tranca.
- **A validacao e feita no servidor.** O proxy usa `getUser()`, que confere o
  token com o Supabase, e nao `getSession()`, que apenas le o cookie e acredita
  no que esta escrito nele.
- **Em producao, faltar a configuracao bloqueia tudo.** Em desenvolvimento apenas
  avisa. A assimetria evita o acidente de publicar a ferramenta destrancada por
  ter esquecido de definir uma variavel.
- **Esqueceu a senha?** A propria tela de login envia o link de redefinicao por
  e-mail.

## Hospedar no Netlify

Como o banco ja e o Supabase, nao ha migracao a fazer no deploy. Basta definir
as variaveis em Site configuration > Environment variables:

| Variavel | Valor |
|---|---|
| `GOOGLE_MAPS_API_KEY` | a mesma do `.env.local` |
| `DATABASE_URL` | a string do **pooler de transacao** (porta 6543) |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon public |

O `netlify.toml` ja esta no repositorio com o plugin do Next, cabecalhos de
seguranca e `noindex` (a ferramenta e interna, aparecer em busca so atrai
tentativa de acesso).

Um limite de tempo a saber: o Netlify corta funcao em 10 s no plano gratuito. Uma
varredura de raio grande estoura esse tempo mesmo com o teto de requisicoes. Se
acontecer, reduza o raio ou rode `npm run scan` na sua maquina, que nao tem esse
limite, e use a interface hospedada para trabalhar a lista.

### Trazendo o banco SQLite antigo

Se voce ja usava a versao anterior, com `data/leads.db`:

```bash
npm run migrar-supabase -- --so-conferir
npm run migrar-supabase
```

O comando e idempotente e confere as contagens no fim. O arquivo antigo continua
onde estava, como copia de seguranca.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de producao |
| `npm test` | 96 testes; os 16 de banco pulam sem `DATABASE_URL` |
| `npm run typecheck` | Verificacao de tipos |
| `npm run lint` | ESLint |
| `npm run scan -- ...` | Varredura pela linha de comando |
| `npm run semear` | Dados de demonstracao |
| `npm run migrar-supabase` | Traz o banco SQLite antigo para o Supabase |

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
  proxy.ts          tranca: exige sessao valida em pagina e em rota de API
  lib/
    auth/           clientes do Supabase Auth
    search/         grade hexagonal, subdivisao e orquestrador
    places/         client da Places API, field mask e controle de orcamento
    scoring/        score, faixas e classificacao do que e "ter site"
    contacts/        periodo de espera, registro de contato e funil
    enrich/         extracao de contato
    db/             schema, queries e cache de celula
  components/       interface, uma pasta por area
scripts/
  scan.ts             varredura pelo terminal
  semear.ts           dados de demonstracao
  migrar-supabase.ts  traz o banco SQLite antigo
tests/                96 testes; os de logica pura rodam offline
```

## Decisoes que valem saber

**Banco unico para desenvolvimento e producao.** Foi uma escolha consciente, e
ela tem risco: um comando de limpeza durante o desenvolvimento apagaria leads e
historico reais. Por isso existem tres travas.

- `npm run semear` recusa rodar se houver lead real, para nao misturar telefone
  inventado com telefone de verdade no painel. Force com `--misturar`.
- `npm run semear -- --limpar-tudo` recusa se houver lead real. Force com
  `--tenho-certeza`.
- Os testes de banco rodam num schema proprio do Postgres, criado no inicio e
  derrubado no fim, e nunca tocam no `public`.

Se um dia o risco incomodar, crie um segundo projeto no Supabase e aponte o
`.env.local` para ele; nada no codigo muda.

**Dados do Google separados dos seus.** A tabela `leads` guarda so o que veio da
Places API e a `lead_crm` guarda so o que e seu. Nao e purismo: os Termos do
Google proibem manter conteudo de Places por mais de 30 dias, com excecao do place
id. Com as tabelas separadas, expirar os dados do Google nao apaga seu historico
de contato, suas notas e seu funil.

**Credenciais nao vao para o Git.** O `.env.local` e o antigo `data/leads.db`
estao no `.gitignore`. A chave `anon` do Supabase e publica por natureza e vai
para o navegador; a chave `service_role`, que ignora qualquer politica de acesso,
nao aparece em lugar nenhum do projeto.

**Acessibilidade.** Todo par de cor foi medido, nao escolhido por aparencia: o
minimo e 4,5:1 do WCAG 2.2 AA para texto e 3:1 para controle e borda de campo. O
botao do WhatsApp usa texto escuro sobre o verde da marca porque branco sobre
`#25d366` da 1,98:1. No painel, verde e vermelho nunca carregam sentido sozinhos:
sob deuteranopia eles ficam praticamente indistinguiveis, entao todo bloco de
resultado leva icone e rotulo.

## O que ainda nao tem

- **Estado na URL.** Filtro, aba e busca selecionada vivem em memoria; recarregar
  a pagina volta ao inicio e nao da para mandar um link de uma lista filtrada.
- **Multiusuario de verdade.** O Supabase Auth ja suporta varias contas, mas os
  dados nao sao separados por pessoa: todo mundo ve a mesma carteira, e nao da
  para saber quem contatou quem nem restringir quem gasta cota.
- **Politicas de acesso no banco (RLS).** As tabelas sao acessadas por conexao
  direta do servidor, que ja passou pela tranca do proxy. Se um dia a aplicacao
  passar a consultar o banco pelo navegador, RLS vira obrigatorio.
- **Enriquecimento de quem nao tem site nenhum.** Sem URL nao ha de onde extrair
  contato. Buscar o Instagram pelo nome exigiria raspar o Instagram, que bloqueia
  e proibe.
- **Deteccao de site ruim.** Hoje dominio proprio conta como "tem site" e sai da
  lista. Verificar se esse site esta no ar, se e responsivo e se e rapido
  transformaria redesign num nicho novo.
