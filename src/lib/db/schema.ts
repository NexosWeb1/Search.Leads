/**
 * Schema do banco.
 *
 * Duas decisoes de modelagem que valem explicacao:
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
 */

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS leads (
    place_id            TEXT PRIMARY KEY,
    nome                TEXT NOT NULL,
    endereco            TEXT,
    endereco_curto      TEXT,
    bairro              TEXT,
    cidade              TEXT,
    uf                  TEXT,
    cep                 TEXT,
    lat                 REAL NOT NULL,
    lng                 REAL NOT NULL,
    telefone_e164       TEXT,
    telefone_formatado  TEXT,
    telefone_celular    INTEGER NOT NULL DEFAULT 0,
    telefone_motivo     TEXT,
    website_url         TEXT,
    website_host        TEXT,
    website_classe      TEXT NOT NULL,
    tem_site_real       INTEGER NOT NULL DEFAULT 0,
    nota                REAL,
    total_avaliacoes    INTEGER,
    tipo_principal      TEXT,
    tipo_label          TEXT,
    status_negocio      TEXT,
    maps_uri            TEXT,
    tem_horario         INTEGER NOT NULL DEFAULT 0,
    score               INTEGER NOT NULL DEFAULT 0,
    faixa               TEXT NOT NULL DEFAULT 'ruim',
    score_motivos       TEXT,
    visto_em            TEXT NOT NULL,
    atualizado_em       TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS ix_leads_faixa ON leads (faixa)`,
  `CREATE INDEX IF NOT EXISTS ix_leads_site ON leads (tem_site_real)`,
  `CREATE INDEX IF NOT EXISTS ix_leads_score ON leads (score DESC)`,
  `CREATE INDEX IF NOT EXISTS ix_leads_atualizado ON leads (atualizado_em)`,

  `CREATE TABLE IF NOT EXISTS searches (
    id                  TEXT PRIMARY KEY,
    nicho_id            TEXT NOT NULL,
    nicho_label         TEXT NOT NULL,
    local_label         TEXT NOT NULL,
    centro_lat          REAL NOT NULL,
    centro_lng          REAL NOT NULL,
    raio_km             REAL NOT NULL,
    status              TEXT NOT NULL DEFAULT 'rodando',
    erro                TEXT,
    celulas_total       INTEGER NOT NULL DEFAULT 0,
    celulas_feitas      INTEGER NOT NULL DEFAULT 0,
    celulas_saturadas   INTEGER NOT NULL DEFAULT 0,
    requisicoes         INTEGER NOT NULL DEFAULT 0,
    custo_usd           REAL NOT NULL DEFAULT 0,
    total_no_raio       INTEGER NOT NULL DEFAULT 0,
    total_sem_site      INTEGER NOT NULL DEFAULT 0,
    criada_em           TEXT NOT NULL,
    concluida_em        TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS ix_searches_criada ON searches (criada_em DESC)`,

  `CREATE TABLE IF NOT EXISTS search_leads (
    search_id           TEXT NOT NULL,
    place_id            TEXT NOT NULL,
    distancia_m         REAL NOT NULL,
    PRIMARY KEY (search_id, place_id)
  )`,

  `CREATE INDEX IF NOT EXISTS ix_search_leads_place ON search_leads (place_id)`,

  // Meus dados. Nunca expiram.
  `CREATE TABLE IF NOT EXISTS lead_crm (
    place_id            TEXT PRIMARY KEY,
    status              TEXT NOT NULL DEFAULT 'novo',
    motivo_perda        TEXT,
    valor_fechado       REAL,
    notas               TEXT,
    tentativas          INTEGER NOT NULL DEFAULT 0,
    primeiro_contato_em TEXT,
    ultimo_contato_em   TEXT,
    respondeu_em        TEXT,
    finalizado_em       TEXT,
    atualizado_em       TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS ix_crm_status ON lead_crm (status)`,
  `CREATE INDEX IF NOT EXISTS ix_crm_ultimo_contato ON lead_crm (ultimo_contato_em)`,

  `CREATE TABLE IF NOT EXISTS contact_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id            TEXT NOT NULL,
    canal               TEXT NOT NULL DEFAULT 'whatsapp',
    template_id         TEXT,
    template_nome       TEXT,
    mensagem            TEXT,
    entrega             TEXT NOT NULL,
    tentativa           INTEGER NOT NULL DEFAULT 1,
    registrado_em       TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS ix_log_place ON contact_log (place_id, registrado_em DESC)`,
  `CREATE INDEX IF NOT EXISTS ix_log_data ON contact_log (registrado_em DESC)`,
  `CREATE INDEX IF NOT EXISTS ix_log_template ON contact_log (template_id)`,

  `CREATE TABLE IF NOT EXISTS enrichment (
    place_id            TEXT PRIMARY KEY,
    email               TEXT,
    instagram           TEXT,
    facebook            TEXT,
    whatsapp            TEXT,
    status              TEXT NOT NULL DEFAULT 'pendente',
    erro                TEXT,
    buscado_em          TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS ix_enrich_status ON enrichment (status)`,

  // Impede pagar duas vezes pela mesma pergunta ao Google.
  //
  // Guarda os place ids que a celula devolveu, e nao os dados do comercio. Assim
  // um acerto de cache reconstroi a lista lendo a tabela `leads`, sem gastar
  // requisicao. `consultada_em` sustenta o TTL de 30 dias exigido pelos Termos.
  `CREATE TABLE IF NOT EXISTS cell_cache (
    chave               TEXT PRIMARY KEY,
    resultados          INTEGER NOT NULL,
    saturada            INTEGER NOT NULL,
    place_ids           TEXT NOT NULL DEFAULT '[]',
    consultada_em       TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS templates (
    id                  TEXT PRIMARY KEY,
    nome                TEXT NOT NULL,
    corpo               TEXT NOT NULL,
    padrao              INTEGER NOT NULL DEFAULT 0,
    criado_em           TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    chave               TEXT PRIMARY KEY,
    valor               TEXT NOT NULL
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
