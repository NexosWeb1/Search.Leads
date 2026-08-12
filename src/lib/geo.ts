/**
 * Matematica geografica usada pelo motor de busca.
 *
 * Em escala de cidade (raios de ate 50 km) a aproximacao plana local e exata
 * o bastante para posicionar celulas de busca, mas a distancia final de cada
 * lead ao centro usa haversine de verdade, porque e ela que decide se o lead
 * esta dentro do circulo desenhado no mapa.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

/** Distancia real entre dois pontos, em metros. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Desloca um ponto por um offset em metros no plano local.
 * `eastM` positivo vai para leste, `northM` positivo vai para norte.
 */
export function offsetMeters(origin: LatLng, eastM: number, northM: number): LatLng {
  const latRad = origin.lat * DEG;
  const dLat = northM / EARTH_RADIUS_M / DEG;
  const dLng = eastM / (EARTH_RADIUS_M * Math.cos(latRad)) / DEG;
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}

/** Caixa envolvente de um circulo, util para consultas no banco e para o zoom do mapa. */
export function boundingBox(center: LatLng, radiusM: number) {
  const sw = offsetMeters(center, -radiusM, -radiusM);
  const ne = offsetMeters(center, radiusM, radiusM);
  return { minLat: sw.lat, minLng: sw.lng, maxLat: ne.lat, maxLng: ne.lng };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
