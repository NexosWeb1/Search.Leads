'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

import L from 'leaflet';
import 'leaflet.markercluster';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LeadCompleto } from '@/lib/db/leads';
import { COR_FAIXA } from '@/lib/scoring/score';
import { useTemaEscuro } from '@/lib/hooks';

/**
 * Mapa dos leads.
 *
 * Precisa ser carregado com ssr desligado: o Leaflet toca em `window` no proprio
 * import. Os marcadores sao divIcon em CSS, e nao os icones padrao do Leaflet.
 * Isso resolve de uma vez o problema classico de icone quebrado por caminho de
 * imagem no bundler, e deixa a cor da faixa e o anel de "ja contatado" saindo do
 * mesmo tema do resto da interface.
 */

export interface PropsMapa {
  leads: LeadCompleto[];
  centro: { lat: number; lng: number } | null;
  raioKm: number;
  destacado: string | null;
  aoSelecionar: (lead: LeadCompleto) => void;
  aoDestacar: (placeId: string | null) => void;
}

const CENTRO_PADRAO: [number, number] = [-15.78, -47.93];

function iconeDoLead(lead: LeadCompleto): L.DivIcon {
  const tamanho = lead.faixa === 'muito_bom' ? 16 : lead.faixa === 'bom' ? 14 : 12;
  const contatado = lead.tentativas > 0;

  return L.divIcon({
    className: `pin-lead${contatado ? ' pin-lead-contatado' : ''}`,
    html: `<div class="pin-lead-forma" style="background:${COR_FAIXA[lead.faixa]}"></div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
  });
}

function CamadaLeads({
  leads,
  destacado,
  aoSelecionar,
  aoDestacar,
}: Pick<PropsMapa, 'leads' | 'destacado' | 'aoSelecionar' | 'aoDestacar'>) {
  const mapa = useMap();
  const grupoRef = useRef<L.MarkerClusterGroup | null>(null);
  const marcadoresRef = useRef(new Map<string, L.Marker>());

  // Callbacks em ref para que trocar de handler nao obrigue a recriar centenas
  // de marcadores. A escrita vai num efeito, e nao no corpo do componente:
  // mexer em ref durante a renderizacao quebra a renderizacao concorrente.
  const acoesRef = useRef({ aoSelecionar, aoDestacar });

  useEffect(() => {
    acoesRef.current = { aoSelecionar, aoDestacar };
  }, [aoSelecionar, aoDestacar]);

  useEffect(() => {
    const grupo = L.markerClusterGroup({
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      // Acima de 200 marcadores o Leaflet trava ao animar cada um.
      disableClusteringAtZoom: 17,
      chunkedLoading: true,
      iconCreateFunction: (cluster) => {
        const total = cluster.getChildCount();
        const lado = total < 10 ? 32 : total < 100 ? 38 : 44;
        return L.divIcon({
          className: 'cluster-lead',
          html: `<div class="cluster-lead-forma">${total}</div>`,
          iconSize: [lado, lado],
        });
      },
    });

    mapa.addLayer(grupo);
    grupoRef.current = grupo;

    // Copia para variavel local: no momento da limpeza o ref pode ja apontar
    // para outro mapa.
    const marcadores = marcadoresRef.current;

    return () => {
      mapa.removeLayer(grupo);
      grupoRef.current = null;
      marcadores.clear();
    };
  }, [mapa]);

  useEffect(() => {
    const grupo = grupoRef.current;
    if (!grupo) return;

    grupo.clearLayers();
    marcadoresRef.current.clear();

    const marcadores = leads.map((lead) => {
      const marcador = L.marker([lead.lat, lead.lng], {
        icon: iconeDoLead(lead),
        title: lead.nome,
        riseOnHover: true,
      });

      marcador.on('click', () => acoesRef.current.aoSelecionar(lead));
      marcador.on('mouseover', () => acoesRef.current.aoDestacar(lead.placeId));
      marcador.on('mouseout', () => acoesRef.current.aoDestacar(null));
      marcador.bindTooltip(lead.nome, { direction: 'top', offset: [0, -8] });

      marcadoresRef.current.set(lead.placeId, marcador);
      return marcador;
    });

    grupo.addLayers(marcadores);
  }, [leads]);

  // Destaque sincronizado com a lista: passar o mouse no cartao aumenta o pin.
  useEffect(() => {
    const anterior = destacado ? marcadoresRef.current.get(destacado) : null;
    const elemento = anterior?.getElement();
    elemento?.classList.add('pin-lead-destacado');

    return () => {
      elemento?.classList.remove('pin-lead-destacado');
    };
  }, [destacado]);

  return null;
}

/** Reenquadra o mapa quando o centro ou o raio da busca mudam. */
function AjustarEnquadramento({
  centro,
  raioKm,
}: {
  centro: { lat: number; lng: number } | null;
  raioKm: number;
}) {
  const mapa = useMap();
  // Extrair os numeros antes do efeito: o objeto `centro` e recriado a cada
  // renderizacao, e depender dele reenquadraria o mapa sem parar.
  const lat = centro?.lat ?? null;
  const lng = centro?.lng ?? null;

  useEffect(() => {
    if (lat === null || lng === null) return;

    /*
     * `L.latLng().toBounds()` e nao `L.circle().getBounds()`.
     *
     * O getBounds do circulo depende de `this._map` para converter pixel em
     * coordenada, entao um circulo criado solto, so para medir, quebra com
     * "Cannot read properties of undefined". toBounds faz a conta direto na
     * coordenada e funciona sem mapa nenhum.
     *
     * O argumento e o lado da caixa, nao o raio: por isso vezes dois.
     */
    const limites = L.latLng(lat, lng).toBounds(raioKm * 2000);
    mapa.fitBounds(limites, { padding: [24, 24], animate: true });
  }, [mapa, lat, lng, raioKm]);

  return null;
}

/**
 * O container do mapa nasce com tamanho zero quando a sidebar ainda esta
 * montando, e o Leaflet grava esse tamanho. Sem observar o redimensionamento, o
 * mapa fica com tiles cinzas ate o primeiro zoom manual.
 */
function ObservarTamanho() {
  const mapa = useMap();

  useEffect(() => {
    const alvo = mapa.getContainer();
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [mapa]);

  return null;
}

/**
 * Estilo do circulo do raio, com cor literal e nao variavel CSS.
 *
 * O mapa roda com `preferCanvas`, e canvas nao resolve `var(--cor)`: recebe a
 * string crua e cai no preto padrao. Era por isso que o circulo sumia contra o
 * mapa escuro.
 *
 * Os dois passos foram escolhidos para a superficie de cada tema, e nao um
 * clareado do outro. No escuro o traco e mais grosso porque os tiles invertidos
 * tem muito contraste interno e um fio fino se perde no meio das ruas.
 */
const CIRCULO_CLARO = {
  color: '#15803d',
  weight: 2,
  fillColor: '#22c55e',
  fillOpacity: 0.07,
} as const;

const CIRCULO_ESCURO = {
  color: '#4ade80',
  weight: 2.5,
  fillColor: '#22c55e',
  fillOpacity: 0.1,
} as const;

export default function MapaLeads({
  leads,
  centro,
  raioKm,
  destacado,
  aoSelecionar,
  aoDestacar,
}: PropsMapa) {
  const escuro = useTemaEscuro();
  const estiloCirculo = escuro ? CIRCULO_ESCURO : CIRCULO_CLARO;

  const inicial = useMemo<[number, number]>(
    () => (centro ? [centro.lat, centro.lng] : CENTRO_PADRAO),
    // Somente na montagem: o reenquadramento posterior fica com AjustarEnquadramento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <MapContainer
      center={inicial}
      zoom={centro ? 12 : 4}
      className="size-full"
      zoomControl
      preferCanvas
    >
      <TileLayer
        className="tiles-mapa"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      {centro && (
        <Circle
          center={[centro.lat, centro.lng]}
          radius={raioKm * 1000}
          pathOptions={estiloCirculo}
        />
      )}

      <CamadaLeads
        leads={leads}
        destacado={destacado}
        aoSelecionar={aoSelecionar}
        aoDestacar={aoDestacar}
      />
      <AjustarEnquadramento centro={centro} raioKm={raioKm} />
      <ObservarTamanho />
    </MapContainer>
  );
}
