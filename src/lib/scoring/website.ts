/**
 * Classifica o que o Google devolve no campo de site.
 *
 * Este arquivo e o coracao comercial da ferramenta. No Brasil e muito comum o
 * comercio preencher o campo "site" do perfil do Google com o link do
 * Instagram, com o site gratuito que o proprio Google gera, ou com a pagina
 * dele no iFood ou no Doctoralia. Nenhum desses casos e ter site: sao os leads
 * mais quentes que existem para uma agencia, porque o dono ja entendeu que
 * precisa de presenca online e resolveu no improviso.
 *
 * Se filtrassemos apenas por "campo de site vazio", perderiamos a maior parte
 * do mercado.
 */

export type ClasseSite =
  | 'sem_site'
  | 'rede_social'
  | 'site_google'
  | 'agendamento'
  | 'marketplace'
  | 'construtor'
  | 'proprio';

export interface AnaliseSite {
  classe: ClasseSite;
  /** Se false, o negocio e lead. Se true, ja tem presenca propria. */
  temSiteReal: boolean;
  url: string | null;
  host: string | null;
  /** Texto curto para mostrar no card. */
  rotulo: string;
}

/** Perfil de rede social usado como se fosse site. */
const REDES = [
  'instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'tiktok.com',
  'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'linkedin.com',
  'wa.me', 'whatsapp.com', 't.me', 'telegram.me', 'pinterest.com',
  // Agregadores de link na bio
  'linktr.ee', 'beacons.ai', 'bio.link', 'linkbio.co', 'lnk.bio',
  'campsite.bio', 'many.link', 'linkme.bio', 'about.me',
];

/** Site gratuito gerado pelo proprio Perfil da Empresa no Google. */
const SITES_GOOGLE = ['negocio.site', 'business.site', 'sites.google.com'];

/**
 * Plataformas de agendamento e diretorios onde o negocio tem apenas uma pagina
 * de perfil. Muito relevante no Brasil para clinicas, saloes e barbearias.
 */
const AGENDAMENTO = [
  'doctoralia.com.br', 'doctoralia.com', 'boaconsulta.com', 'agendarconsulta.com',
  'trinks.com', 'booksy.com', 'belasmarcacoes.com.br', 'appbarber.com.br',
  'zenklub.com.br', 'vittude.com', 'gendo.com.br',
  // Diretorios de empresa
  'guiamais.com.br', 'solutudo.com.br', 'apontador.com.br', 'telelistas.net',
  'econodata.com.br', 'cnpj.biz', 'empresascnpj.com',
];

/** Marketplace: o negocio vende, mas a vitrine e de outro. */
const MARKETPLACES = [
  'ifood.com.br', 'rappi.com.br', 'ubereats.com', 'aiqfome.com', 'goomer.app',
  'mercadolivre.com.br', 'mercadolibre.com', 'shopee.com.br', 'americanas.com.br',
  'magazineluiza.com.br', 'olx.com.br', 'elo7.com.br', 'enjoei.com.br',
  'zapimoveis.com.br', 'vivareal.com.br', 'quintoandar.com.br', 'imovelweb.com.br',
  'webmotors.com.br', 'icarros.com.br', 'booking.com', 'airbnb.com.br', 'airbnb.com',
];

/**
 * Construtor de site ou loja pronta sem dominio proprio. O negocio tem algo no
 * ar, mas em subdominio de terceiro, geralmente template padrao e sem controle.
 */
const CONSTRUTORES = [
  'wixsite.com', 'wix.com', 'weebly.com', 'webnode.com', 'webnode.page',
  'jimdosite.com', 'jimdo.com', 'godaddysites.com', 'squarespace.com',
  'carrd.co', 'canva.site', 'notion.site', 'super.site', 'framer.website',
  'blogspot.com', 'blogspot.com.br', 'wordpress.com', 'tumblr.com', 'medium.com',
  'webflow.io', 'netlify.app', 'vercel.app', 'github.io', 'pages.dev',
  'wordpress.org', 'strikingly.com', 'site123.me', 'ucraft.site',
  // Lojas virtuais em subdominio compartilhado
  'lojaintegrada.com.br', 'mercadoshops.com.br', 'loja2.com.br',
  'catalogo.digital', 'nuvemshop.com.br', 'lojavirtualnuvem.com.br',
  'tray.com.br', 'irroba.com.br', 'dooca.store', 'yampi.io',
];

/** Extrai o host normalizado. Devolve null se a URL for inutilizavel. */
function extrairHost(url: string): string | null {
  try {
    const comEsquema = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(comEsquema).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * Casa o host contra uma lista de dominios.
 * Compara por sufixo de rotulo para que `naoinstagram.com` nao case com
 * `instagram.com`, mas `br.instagram.com` case.
 */
function casaDominio(host: string, dominios: string[]): boolean {
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}

const ROTULOS: Record<ClasseSite, string> = {
  sem_site: 'Sem site',
  rede_social: 'So rede social',
  site_google: 'Site gratis do Google',
  agendamento: 'So perfil em plataforma',
  marketplace: 'So marketplace',
  construtor: 'Site em construtor',
  proprio: 'Tem site proprio',
};

const SEM_SITE: AnaliseSite = {
  classe: 'sem_site',
  temSiteReal: false,
  url: null,
  host: null,
  rotulo: ROTULOS.sem_site,
};

export function analisarSite(websiteUri: string | null | undefined): AnaliseSite {
  if (!websiteUri || !websiteUri.trim()) return SEM_SITE;

  const url = websiteUri.trim();
  const host = extrairHost(url);
  if (!host) return SEM_SITE;

  const monta = (classe: ClasseSite, temSiteReal: boolean): AnaliseSite => ({
    classe,
    temSiteReal,
    url,
    host,
    rotulo: ROTULOS[classe],
  });

  if (casaDominio(host, REDES)) return monta('rede_social', false);
  if (casaDominio(host, SITES_GOOGLE)) return monta('site_google', false);
  if (casaDominio(host, AGENDAMENTO)) return monta('agendamento', false);
  if (casaDominio(host, MARKETPLACES)) return monta('marketplace', false);
  if (casaDominio(host, CONSTRUTORES)) return monta('construtor', false);

  return monta('proprio', true);
}
