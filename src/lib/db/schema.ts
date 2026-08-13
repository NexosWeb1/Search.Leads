/**
 * Schema do banco, em PostgreSQL.
 *
 * Tres decisoes de modelagem que valem explicacao:
 *
 * 1. `leads` guarda somente o que veio do Google e `lead_crm` guarda somente o
 *    que e seu. Isso nao e purismo: os Termos do Google proibem manter conteudo
 *    de Places por mais de 30 dias, com excecao do place id, que pode ficar para
 *    sempre. Com as tabelas separadas, expirar os dados do Google nao apaga seu
 *    historico de contato, suas notas e seu funil.
 *
 * 2. `leads` tem o place id como chave primaria e a ligacao com as buscas e
 *    muitos-para-muitos via `search_leads`. E isso que faz o historico de
 *    contato grudar no comercio e nao na busca: se voce varrer "barbearia" hoje
 *    e "salao de beleza" no mes que vem, um comercio que aparecer nas duas listas
 *    chega ja marcado como contatado, e voce nao manda mensagem repetida.
 *
 * 3. `contact_log` e append-only. Nunca se sobrescreve uma tentativa: e assim que
 *    o card sabe dizer "3a tentativa" e que voce consegue reler o que mandou
 *    dois meses atras antes de falar de novo.
 *
 * Sobre tipos: datas sao `timestamptz` e nao texto, o que permite comparar e
 * subtrair no proprio banco. Booleanos sao `boolean` de verdade, e nao 0 e 1 como
 * era no SQLite.
 */

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS leads (
    place_id            text PRIMARY KEY,
    nome                text NOT NULL,
    endereco            text,
    endereco_curto      text,
    bairro              text,
    cidade              text,
    uf                  text,
    cep                 text,
    lat                 double precision NOT NULL,
    lng                 double precision NOT NULL,
    telefone_e164       text,
    telefone_formatado  text,
    telefone_celular    boolean NOT NULL DEFAULT false,
    telefone_motivo     text,
    website_url         text,
    website_host        text,
    website_classe      text NOT NULL,
    tem_site_real       boolean NOT NULL DEFAULT false,
    nota                double precision,
    total_avaliacoes    integer,
    tipo_principal      text,
    tipo_label          text,
    status_negocio      text,
    maps_uri            text,
    tem_horario         boolean NOT NULL DEFAULT false,
    score               integer NOT NULL DEFAULT 0,
    faixa               text NOT NULL DEFAULT 'ruim',
    score_motivos       jsonb,
    visto_em            timestamptz NOT NULL DEFAULT now(),
    atualizado_em       timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS ix_leads_faixa ON leads (faixa)`,
  `CREATE INDEX IF NOT EXISTS ix_leads_site ON leads (tem_site_real)`,
  `CREATE INDEX IF NOT EXISTS ix_leads_score ON leads (score DESC)`,
  `CREATE INDEX IF NOT EXISTS ix_leads_atualizado ON leads (atualizado_em)`,
  // Busca por nome sem diferenciar maiuscula. No Postgres nao existe COLLATE
  // NOCASE do SQLite, entao o indice e sobre a versao em minusculas.
  `CREATE INDEX IF NOT EXISTS ix_leads_nome ON leads (lower(nome))`,

  `CREATE TABLE IF NOT EXISTS searches (
    id                  uuid PRIMARY KEY,
    nicho_id            text NOT NULL,
    nicho_label         text NOT NULL,
    local_label         text NOT NULL,
    centro_lat          double precision NOT NULL,
    centro_lng          double precision NOT NULL,
    raio_km             double precision NOT NULL,
    status              text NOT NULL DEFAULT 'rodando',
    erro                text,
    celulas_total       integer NOT NULL DEFAULT 0,
    celulas_feitas      integer NOT NULL DEFAULT 0,
    celulas_saturadas   integer NOT NULL DEFAULT 0,
    requisicoes         integer NOT NULL DEFAULT 0,
    custo_usd           double precision NOT NULL DEFAULT 0,
    total_no_raio       integer NOT NULL DEFAULT 0,
    total_sem_site      integer NOT NULL DEFAULT 0,
    criada_em           timestamptz NOT NULL DEFAULT now(),
    concluida_em        timestamptz
  )`,

  `CREATE INDEX IF NOT EXISTS ix_searches_criada ON searches (criada_em DESC)`,

  `CREATE TABLE IF NOT EXISTS search_leads (
    search_id           uuid NOT NULL REFERENCES searches (id) ON DELETE CASCADE,
    place_id            text NOT NULL REFERENCES leads (place_id) ON DELETE CASCADE,
    distancia_m         double precision NOT NULL,
    PRIMARY KEY (search_id, place_id)
  )`,

  `CREATE INDEX IF NOT EXISTS ix_search_leads_place ON search_leads (place_id)`,

  // Meus dados. Nunca expiram.
  `CREATE TABLE IF NOT EXISTS lead_crm (
    place_id            text PRIMARY KEY REFERENCES leads (place_id) ON DELETE CASCADE,
    status              text NOT NULL DEFAULT 'novo',
    motivo_perda        text,
    valor_fechado       numeric(12,2),
    notas               text,
    tentativas          integer NOT NULL DEFAULT 0,
    primeiro_contato_em timestamptz,
    ultimo_contato_em   timestamptz,
    respondeu_em        timestamptz,
    finalizado_em       timestamptz,
    atualizado_em       timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS ix_crm_status ON lead_crm (status)`,
  `CREATE INDEX IF NOT EXISTS ix_crm_ultimo_contato ON lead_crm (ultimo_contato_em)`,

  `CREATE TABLE IF NOT EXISTS contact_log (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    place_id            text NOT NULL REFERENCES leads (place_id) ON DELETE CASCADE,
    canal               text NOT NULL DEFAULT 'whatsapp',
    template_id         text,
    template_nome       text,
    mensagem            text,
    entrega             text NOT NULL,
    tentativa           integer NOT NULL DEFAULT 1,
    registrado_em       timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS ix_log_place ON contact_log (place_id, registrado_em DESC)`,
  `CREATE INDEX IF NOT EXISTS ix_log_data ON contact_log (registrado_em DESC)`,
  `CREATE INDEX IF NOT EXISTS ix_log_template ON contact_log (template_id)`,

  `CREATE TABLE IF NOT EXISTS enrichment (
    place_id            text PRIMARY KEY REFERENCES leads (place_id) ON DELETE CASCADE,
    email               text,
    instagram           text,
    facebook            text,
    whatsapp            text,
    status              text NOT NULL DEFAULT 'pendente',
    erro                text,
    buscado_em          timestamptz
  )`,

  `CREATE INDEX IF NOT EXISTS ix_enrich_status ON enrichment (status)`,

  // Impede pagar duas vezes pela mesma pergunta ao Google.
  //
  // Guarda os place ids que a celula devolveu, e nao os dados do comercio. Assim
  // um acerto de cache reconstroi a lista lendo a tabela `leads`, sem gastar
  // requisicao. `consultada_em` sustenta o TTL de 30 dias exigido pelos Termos.
  `CREATE TABLE IF NOT EXISTS cell_cache (
    chave               text PRIMARY KEY,
    resultados          integer NOT NULL,
    saturada            boolean NOT NULL DEFAULT false,
    place_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
    consultada_em       timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS templates (
    id                  text PRIMARY KEY,
    nome                text NOT NULL,
    corpo               text NOT NULL,
    padrao              boolean NOT NULL DEFAULT false,
    criado_em           timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    chave               text PRIMARY KEY,
    valor               text NOT NULL
  )`,
];

/** Status possiveis no funil. */
export const STATUS_CRM = [
  'novo',
  'contatado',
  'respondeu',
  'negociando',
  'fechado',
  'perdido',
  'frio',
  'nao_perturbe',
] as const;

export type StatusCrm = (typeof STATUS_CRM)[number];

export const ROTULO_STATUS: Record<StatusCrm, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  respondeu: 'Respondeu',
  negociando: 'Negociando',
  fechado: 'Fechado',
  perdido: 'Perdido',
  frio: 'Frio',
  nao_perturbe: 'Nao perturbe',
};

/** Colunas do Kanban, na ordem. `frio` e `nao_perturbe` ficam fora do quadro. */
export const COLUNAS_KANBAN: StatusCrm[] = [
  'novo',
  'contatado',
  'respondeu',
  'negociando',
  'fechado',
  'perdido',
];

/** Desfecho tecnico de uma tentativa. Nao confundir com o desfecho comercial. */
export const ENTREGAS = ['enviado', 'numero_invalido', 'sem_whatsapp', 'pulado'] as const;
export type Entrega = (typeof ENTREGAS)[number];

export const ROTULO_ENTREGA: Record<Entrega, string> = {
  enviado: 'Enviado',
  numero_invalido: 'Numero invalido',
  sem_whatsapp: 'Sem WhatsApp',
  pulado: 'Pulado',
};

/** Motivos de perda comercial, oferecidos ao mover o card para Perdido. */
export const MOTIVOS_PERDA = [
  'sem_resposta',
  'sem_interesse',
  'achou_caro',
  'ja_tem_fornecedor',
  'fora_do_perfil',
  'outro',
] as const;

export type MotivoPerda = (typeof MOTIVOS_PERDA)[number];

export const ROTULO_MOTIVO_PERDA: Record<MotivoPerda, string> = {
  sem_resposta: 'Nao respondeu',
  sem_interesse: 'Sem interesse',
  achou_caro: 'Achou caro',
  ja_tem_fornecedor: 'Ja tem fornecedor',
  fora_do_perfil: 'Fora do perfil',
  outro: 'Outro',
};
