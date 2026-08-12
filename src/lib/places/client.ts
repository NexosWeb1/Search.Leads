/**
 * Client da Google Places API (New).
 *
 * Sobre custo, que aqui e decisao de arquitetura e nao detalhe:
 *
 * Os campos que dao valor ao lead (websiteUri, telefone, nota, avaliacoes) sao
 * todos da SKU Enterprise, e a cobranca segue sempre a SKU mais alta presente no
 * field mask. Ou seja, ja que pagamos Enterprise por causa do websiteUri, incluir
 * campos Essentials e Pro no mesmo mask nao custa nada a mais, e por isso o mask
 * abaixo e generoso.
 *
 * O que nao se faz: pedir places.reviews. Isso sobe para Enterprise + Atmosphere,
 * uma SKU mais cara, e nao precisamos de resenha para prospectar.
 *
 * Preco em 2026: Nearby Search Enterprise custa USD 35,00 por mil requisicoes,
 * com 1.000 requisicoes gratuitas por mes (a cota Enterprise). Cada requisicao
 * devolve ate 20 lugares, entao a cota gratuita da cerca de 20 mil comercios por mes.
 */

import type { Celula } from '../search/grid';

const ENDPOINT_NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';
const ENDPOINT_GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';

/** Teto da propria API: nenhuma chamada devolve mais que isso. */
export const MAX_RESULTADOS_POR_CHAMADA = 20;

export const PRECO_NEARBY_ENTERPRISE_POR_MIL_USD = 35;
export const COTA_GRATIS_ENTERPRISE_MES = 1_000;

const FIELD_MASK = [
  // Essentials, gratis dentro da nossa SKU
  'places.location',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.postalAddress',
  'places.types',
  // Pro
  'places.id',
  'places.displayName',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.googleMapsUri',
  // Enterprise, o que realmente queremos
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours.weekdayDescriptions',
].join(',');

export interface PlaceBruto {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  postalAddress?: {
    addressLines?: string[];
    locality?: string;
    sublocality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

export class PlacesError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo?: string,
  ) {
    super(message);
    this.name = 'PlacesError';
  }

  /** Erro de chave, cota ou faturamento nao melhora com retentativa: aborta a varredura. */
  get fatal(): boolean {
    return this.status === 400 || this.status === 401 || this.status === 403;
  }
}

/**
 * Controla quanto uma varredura pode gastar.
 *
 * Existe porque celula saturada gera subdivisao, subdivisao gera mais 7
 * requisicoes, e sem teto uma busca no centro de Sao Paulo poderia consumir a
 * cota do mes inteiro numa tacada.
 */
export class OrcamentoBusca {
  private gastas = 0;

  constructor(readonly maxRequisicoes: number) {}

  get requisicoes(): number {
    return this.gastas;
  }

  get restantes(): number {
    return Math.max(0, this.maxRequisicoes - this.gastas);
  }

  get custoEstimadoUsd(): number {
    return (this.gastas * PRECO_NEARBY_ENTERPRISE_POR_MIL_USD) / 1000;
  }

  get estourou(): boolean {
    return this.gastas >= this.maxRequisicoes;
  }

  registrar(): void {
    this.gastas += 1;
  }
}

/** Estima em dolares o custo de uma varredura, para mostrar antes de confirmar. */
export function estimarCustoUsd(requisicoes: number): number {
  return (requisicoes * PRECO_NEARBY_ENTERPRISE_POR_MIL_USD) / 1000;
}

function chave(): string {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) {
    throw new PlacesError(
      'GOOGLE_MAPS_API_KEY nao configurada. Copie .env.example para .env.local e preencha a chave.',
      401,
    );
  }
  return k;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function comRetentativa<T>(
  operacao: () => Promise<T>,
  tentativas = 3,
): Promise<T> {
  let ultimo: unknown;

  for (let i = 0; i < tentativas; i++) {
    try {
      return await operacao();
    } catch (erro) {
      ultimo = erro;
      if (erro instanceof PlacesError && erro.fatal) throw erro;
      if (i < tentativas - 1) {
        // Espera crescente com jitter para nao sincronizar as retentativas das
        // celulas que rodam em paralelo.
        await dormir(500 * 2 ** i + Math.random() * 300);
      }
    }
  }

  throw ultimo;
}

export interface RespostaCelula {
  places: PlaceBruto[];
  /**
   * Veio o maximo que a API entrega. Nao significa que existem exatamente 20
   * comercios ali, significa que existem 20 ou mais e nao sabemos quantos.
   * E o gatilho para subdividir a celula.
   */
  saturada: boolean;
}

/**
 * Consulta uma celula. `types` vazio faz a API devolver todos os tipos, o que
 * traz muito ruido, por isso a busca geral usa a lista curada de niches.ts.
 */
export async function buscarCelula(
  celula: Celula,
  types: string[],
  orcamento: OrcamentoBusca,
  sinal?: AbortSignal,
): Promise<RespostaCelula> {
  if (orcamento.estourou) {
    throw new PlacesError('Teto de requisicoes da varredura atingido', 429);
  }
  orcamento.registrar();

  const corpo = {
    includedTypes: types.length > 0 ? types : undefined,
    maxResultCount: MAX_RESULTADOS_POR_CHAMADA,
    rankPreference: 'POPULARITY',
    languageCode: 'pt-BR',
    regionCode: 'BR',
    locationRestriction: {
      circle: {
        center: { latitude: celula.centro.lat, longitude: celula.centro.lng },
        radius: celula.raioM,
      },
    },
  };

  return comRetentativa(async () => {
    const resposta = await fetch(ENDPOINT_NEARBY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': chave(),
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(corpo),
      signal: sinal,
    });

    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new PlacesError(
        `Places respondeu ${resposta.status}: ${texto.slice(0, 400)}`,
        resposta.status,
        texto,
      );
    }

    const dados = (await resposta.json()) as { places?: PlaceBruto[] };
    const places = dados.places ?? [];

    return { places, saturada: places.length >= MAX_RESULTADOS_POR_CHAMADA };
  });
}

export interface LocalGeocodificado {
  label: string;
  lat: number;
  lng: number;
  /** Sugestao de raio a partir do viewport devolvido pelo Google. */
  raioSugeridoKm: number | null;
}

/**
 * Cidade digitada para coordenada. Usa a Geocoding API, que e SKU Essentials:
 * USD 5,00 por mil com 10.000 gratis por mes, ou seja, irrelevante no custo.
 */
export async function geocodificar(
  consulta: string,
  sinal?: AbortSignal,
): Promise<LocalGeocodificado[]> {
  const url = new URL(ENDPOINT_GEOCODE);
  url.searchParams.set('address', consulta);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('key', chave());

  const resposta = await fetch(url, { signal: sinal });
  if (!resposta.ok) {
    throw new PlacesError(`Geocoding respondeu ${resposta.status}`, resposta.status);
  }

  const dados = (await resposta.json()) as {
    status: string;
    error_message?: string;
    results?: Array<{
      formatted_address: string;
      geometry: {
        location: { lat: number; lng: number };
        bounds?: {
          northeast: { lat: number; lng: number };
          southwest: { lat: number; lng: number };
        };
      };
    }>;
  };

  if (dados.status === 'ZERO_RESULTS') return [];
  if (dados.status !== 'OK') {
    throw new PlacesError(
      `Geocoding: ${dados.status} ${dados.error_message ?? ''}`.trim(),
      400,
    );
  }

  return (dados.results ?? []).map((r) => {
    let raioSugeridoKm: number | null = null;
    if (r.geometry.bounds) {
      const { northeast: ne, southwest: sw } = r.geometry.bounds;
      // Metade da diagonal da caixa da cidade, arredondada, e um raio inicial
      // que costuma cobrir a mancha urbana sem exagerar.
      const alturaKm = (ne.lat - sw.lat) * 111;
      const larguraKm =
        (ne.lng - sw.lng) * 111 * Math.cos((((ne.lat + sw.lat) / 2) * Math.PI) / 180);
      raioSugeridoKm = Math.round(Math.hypot(alturaKm, larguraKm) / 2);
    }
    return {
      label: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      raioSugeridoKm,
    };
  });
}
