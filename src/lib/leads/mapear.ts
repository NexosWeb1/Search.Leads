/**
 * Converte o que a Places API devolve no lead que a plataforma usa.
 *
 * E aqui que o place cru ganha score, faixa e telefone normalizado. Tudo o que
 * vem depois (mapa, cards, disparo, dashboard) consome este formato.
 */

import { normalizarTelefone, type TelefoneBr } from '../phone/br';
import { analisarSite, type AnaliseSite } from '../scoring/website';
import { calcularScore, type Faixa, type PesosScore, type ResultadoScore } from '../scoring/score';
import type { PlaceBruto } from '../places/client';

export interface LeadNormalizado {
  placeId: string;
  nome: string;
  endereco: string | null;
  enderecoCurto: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number;
  lng: number;
  telefone: TelefoneBr;
  site: AnaliseSite;
  nota: number | null;
  totalAvaliacoes: number | null;
  tipoPrincipal: string | null;
  tipoLabel: string | null;
  statusNegocio: string | null;
  mapsUri: string | null;
  temHorario: boolean;
  score: number;
  faixa: Faixa;
  motivos: ResultadoScore['motivos'];
}

/**
 * Devolve null quando o registro nao serve como lead:
 * sem id, sem coordenada, sem nome, ou fechado definitivamente. Comercio
 * encerrado nao e lead, e deixar passar sujaria a contagem e o disparo.
 */
export function normalizarPlace(
  place: PlaceBruto,
  pesos?: PesosScore,
): LeadNormalizado | null {
  if (!place.id || !place.location || !place.displayName?.text) return null;
  if (place.businessStatus === 'CLOSED_PERMANENTLY') return null;

  const telefone = normalizarTelefone(
    place.internationalPhoneNumber ?? place.nationalPhoneNumber,
  );
  const site = analisarSite(place.websiteUri);
  const temHorario = (place.regularOpeningHours?.weekdayDescriptions?.length ?? 0) > 0;
  const nota = place.rating ?? null;
  const totalAvaliacoes = place.userRatingCount ?? null;

  const { score, faixa, motivos } = calcularScore(
    {
      site,
      temTelefone: telefone.valido,
      telefoneCelular: telefone.celular,
      totalAvaliacoes,
      nota,
      operacional: place.businessStatus === 'OPERATIONAL',
      temHorario,
    },
    pesos,
  );

  const postal = place.postalAddress;

  return {
    placeId: place.id,
    nome: place.displayName.text,
    endereco: place.formattedAddress ?? null,
    enderecoCurto: place.shortFormattedAddress ?? null,
    bairro: postal?.sublocality ?? null,
    cidade: postal?.locality ?? null,
    uf: postal?.administrativeArea ?? null,
    cep: postal?.postalCode ?? null,
    lat: place.location.latitude,
    lng: place.location.longitude,
    telefone,
    site,
    nota,
    totalAvaliacoes,
    tipoPrincipal: place.primaryType ?? null,
    tipoLabel: place.primaryTypeDisplayName?.text ?? null,
    statusNegocio: place.businessStatus ?? null,
    mapsUri: place.googleMapsUri ?? null,
    temHorario,
    score,
    faixa,
    motivos,
  };
}
