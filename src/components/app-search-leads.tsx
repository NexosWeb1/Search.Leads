'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LeadCompleto } from '@/lib/db/leads';
import type { LocalGeocodificado } from '@/lib/places/client';
import type { ProgressoVarredura, ResultadoVarredura } from '@/lib/search/runner';
import type { Busca, ConsumoDoMes } from '@/lib/db/searches';
import { FILTROS_INICIAIS, filtrosParaQuery, type EstadoFiltros } from '@/lib/filtros';
import { usePreferenciaLocal } from '@/lib/hooks';
import { lerEventos } from '@/lib/sse';
import { ABA_WHATSAPP, linkWhatsApp, type DestinoWhatsApp } from '@/lib/phone/br';
import { preencherTemplate } from '@/lib/formato';
import { PainelBusca } from './sidebar/painel-busca';
import { PainelFiltros } from './sidebar/painel-filtros';
import { ListaLeads } from './leads/lista-leads';
import { DetalheLead } from './leads/detalhe-lead';
import { BuscasAnteriores } from './sidebar/buscas-anteriores';
import { CotaMensal } from './sidebar/cota-mensal';
import { EditorMensagem } from './sidebar/editor-mensagem';
import { ModoDisparo } from './dispatch/modo-disparo';
import { QuadroKanban } from './kanban/quadro-kanban';
import { PainelResultados } from './dashboard/painel-resultados';
import { Abas, type Aba } from './abas';
import { CabecalhoApp } from './cabecalho';
import { IconeAlerta } from './icones';

// O Leaflet toca em `window` no import, entao o mapa nunca pode renderizar no servidor.
const MapaLeads = dynamic(() => import('./map/mapa-leads'), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-superficie-3 text-sm text-texto-fraco">
      Carregando o mapa…
    </div>
  ),
});

const DESTINOS_ZAP = ['web', 'app'] as const;

const MENSAGEM_PADRAO = `Oi! Tudo bem?

Vi o perfil da {{nome}} no Google e notei que voces ainda nao tem um site proprio.

Trabalho criando sites para negocios aqui em {{cidade}} e imaginei que poderia ajudar voces a aparecer melhor nas buscas e receber mais contato pelo Google.

Posso te mandar uns exemplos do que ja fiz? Sem compromisso.`;

export function AppSearchLeads() {
  // Busca
  const [nichoId, setNichoId] = useState('geral');
  const [local, setLocal] = useState<LocalGeocodificado | null>(null);
  const [raioKm, setRaioKm] = useState(10);
  const [buscando, setBuscando] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoVarredura | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoVarredura | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const abortarBusca = useRef<AbortController | null>(null);

  // Dados
  const [leads, setLeads] = useState<LeadCompleto[]>([]);
  const [totalListado, setTotalListado] = useState(0);
  /*
   * Comeca ligado e so e desligado quando a resposta chega. Religar e trabalho
   * dos eventos que provocam recarga (trocar filtro, trocar de busca), nunca do
   * efeito: setState sincrono dentro de efeito gera renderizacao em cascata.
   */
  const [carregandoLeads, setCarregandoLeads] = useState(true);
  const [erroLeads, setErroLeads] = useState<string | null>(null);
  const [buscas, setBuscas] = useState<Busca[]>([]);
  const [consumo, setConsumo] = useState<ConsumoDoMes | null>(null);

  // Filtros e interface
  const [filtros, setFiltros] = useState<EstadoFiltros>(FILTROS_INICIAIS);
  const [aba, setAba] = useState<Aba>('mapa');
  const [destacado, setDestacado] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [leadAberto, setLeadAberto] = useState<LeadCompleto | null>(null);
  const [disparoAberto, setDisparoAberto] = useState(false);
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO);
  const [exportando, setExportando] = useState(false);
  /*
   * Onde abrir o WhatsApp. Fica guardado no navegador porque e caracteristica da
   * maquina, e nao da conta: o mesmo usuario prospecta do computador e responde
   * pelo celular.
   */
  const [destinoZap, trocarDestinoZap] = usePreferenciaLocal<DestinoWhatsApp>(
    'destinoZap',
    'web',
    DESTINOS_ZAP,
  );
  const [enriquecendo, setEnriquecendo] = useState(false);
  const [progressoEnriquecimento, setProgressoEnriquecimento] = useState<{
    feitos: number;
    total: number;
    comContato: number;
  } | null>(null);

  const centro = useMemo(
    () => (local ? { lat: local.lat, lng: local.lng } : null),
    [local],
  );

  /*
   * A recarga e feita por um contador de versao em vez de uma funcao chamada de
   * dentro do efeito. Duas vantagens concretas:
   *
   * 1. O cancelamento por AbortController fica no lugar certo. Sem ele, trocar de
   *    filtro rapido pode fazer a resposta do filtro antigo chegar depois da do
   *    novo e sobrescrever a lista com dados errados.
   * 2. Nenhum setState acontece de forma sincrona no corpo do efeito, so dentro
   *    das promessas, que e o que evita renderizacao em cascata.
   */
  const [versaoLeads, setVersaoLeads] = useState(0);
  const [versaoBuscas, setVersaoBuscas] = useState(0);

  const recarregarLeads = useCallback(() => {
    setCarregandoLeads(true);
    setVersaoLeads((v) => v + 1);
  }, []);

  const recarregarBuscas = useCallback(() => setVersaoBuscas((v) => v + 1), []);

  const queryLeads = filtrosParaQuery(filtros, searchId);

  /*
   * Numero do pedido em voo. Sem ele o indicador de carregamento trava: quando
   * um pedido e substituido por outro, o `finally` do antigo era ignorado, e se
   * o novo nao completasse ninguem mais desligava o "Carregando". Comparando com
   * o contador, o pedido mais recente sempre desliga, aconteca o que acontecer
   * com os anteriores.
   */
  const pedidoLeads = useRef(0);

  useEffect(() => {
    const meu = ++pedidoLeads.current;
    const controle = new AbortController();
    const atual = () => meu === pedidoLeads.current;

    fetch(`/api/leads?${queryLeads}`, { signal: controle.signal })
      .then(async (r) => {
        const dados = await r.json();
        if (!r.ok) throw new Error(dados.erro ?? 'Falha ao carregar leads');
        return dados as { leads: LeadCompleto[]; total: number };
      })
      .then((dados) => {
        if (!atual()) return;
        setLeads(dados.leads);
        setTotalListado(dados.total);
        setErroLeads(null);
      })
      .catch((erro: unknown) => {
        if (!atual() || (erro instanceof Error && erro.name === 'AbortError')) return;
        setErroLeads(erro instanceof Error ? erro.message : 'Falha ao carregar leads');
      })
      .finally(() => {
        if (atual()) setCarregandoLeads(false);
      });

    return () => controle.abort();
  }, [queryLeads, versaoLeads]);

  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;

    fetch('/api/searches', { signal: controle.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: { buscas: Busca[]; consumo: ConsumoDoMes } | null) => {
        if (!ativo || !dados) return;
        setBuscas(dados.buscas);
        setConsumo(dados.consumo);
      })
      .catch(() => {
        // A lista de buscas anteriores nao e critica para a tela funcionar.
      });

    return () => {
      ativo = false;
      controle.abort();
    };
  }, [versaoBuscas]);

  const executarBusca = useCallback(async () => {
    if (!local) return;

    const controle = new AbortController();
    abortarBusca.current = controle;

    setBuscando(true);
    setErroBusca(null);
    setResultado(null);
    setProgresso(null);
    setSelecionados(new Set());

    try {
      const resposta = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controle.signal,
        body: JSON.stringify({
          nichoId,
          lat: local.lat,
          lng: local.lng,
          raioKm,
          localLabel: local.label,
        }),
      });

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(
          [dados.erro, dados.detalhe].filter(Boolean).join('. ') || 'Falha ao buscar',
        );
      }
      if (!resposta.body) throw new Error('Resposta sem corpo');

      for await (const { evento, dados } of lerEventos(resposta.body)) {
        if (evento === 'progresso') {
          /*
           * O identificador da busca NAO e gravado aqui, so ao concluir.
           *
           * Gravar durante o progresso trocava o filtro da lista no meio da
           * varredura e disparava a leitura quando o banco ainda estava vazio,
           * o que resultava em "0 na lista" mesmo com a busca achando centenas.
           */
          setProgresso(dados as ProgressoVarredura);
        } else if (evento === 'concluido') {
          const r = dados as ResultadoVarredura;
          setResultado(r);
          setSearchId(r.searchId);
          /*
           * Recarrega explicitamente em vez de confiar na troca do
           * identificador. Repetir a mesma busca devolve o mesmo id, o React
           * descarta a atualizacao por ser identica, e sem esta chamada a lista
           * ficaria mostrando o resultado anterior.
           */
          recarregarLeads();
        } else if (evento === 'erro') {
          setErroBusca((dados as { mensagem: string }).mensagem);
        }
      }
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'AbortError') {
        setErroBusca('Busca cancelada.');
      } else {
        setErroBusca(erro instanceof Error ? erro.message : 'Falha ao buscar');
      }
    } finally {
      setBuscando(false);
      abortarBusca.current = null;
      recarregarBuscas();
    }
  }, [local, nichoId, raioKm, recarregarBuscas, recarregarLeads]);

  const cancelarBusca = useCallback(() => {
    abortarBusca.current?.abort();
  }, []);

  const trocarFiltros = useCallback((parcial: Partial<EstadoFiltros>) => {
    setCarregandoLeads(true);
    setFiltros((atual) => ({ ...atual, ...parcial }));
  }, []);

  const alternarSelecao = useCallback((placeId: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(placeId)) proximo.delete(placeId);
      else proximo.add(placeId);
      return proximo;
    });
  }, []);

  const mensagemPara = useCallback(
    (lead: LeadCompleto) =>
      preencherTemplate(mensagem, {
        nome: lead.nome,
        bairro: lead.bairro,
        cidade: lead.cidade,
        categoria: lead.tipoLabel,
      }),
    [mensagem],
  );

  /**
   * Envio avulso, fora do modo disparo. Passa pela mesma checagem de cooldown:
   * se o lead ja foi abordado, pede confirmacao mostrando ha quanto tempo.
   */
  const enviarWhatsApp = useCallback(
    async (lead: LeadCompleto) => {
      if (!lead.telefoneE164) return;

      if (!lead.contato.pode) {
        const segue = window.confirm(
          `${lead.nome}\n\n${lead.contato.rotulo}.\n` +
            `Ja foram ${lead.tentativas} ${lead.tentativas === 1 ? 'tentativa' : 'tentativas'}.\n\n` +
            'Mandar mensagem mesmo assim?',
        );
        if (!segue) return;
      }

      const texto = mensagemPara(lead);
      window.open(linkWhatsApp(lead.telefoneE164, texto, destinoZap), ABA_WHATSAPP);

      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: lead.placeId,
          entrega: 'enviado',
          mensagem: texto,
          canal: 'whatsapp',
        }),
      });

      recarregarLeads();
    },
    [mensagemPara, recarregarLeads, destinoZap],
  );

  const abrirDetalhes = useCallback((lead: LeadCompleto) => setLeadAberto(lead), []);

  /**
   * Baixa a planilha via link com `download`, e nao navegando para a URL.
   * Navegar tiraria a pagina do ar por um instante e perderia o estado da tela;
   * o link cumpre a mesma funcao sem sair de onde voce esta.
   */
  const exportar = useCallback(
    (formato: 'csv' | 'xlsx') => {
      setExportando(true);
      try {
        const query = filtrosParaQuery(filtros, searchId, 2000);
        const ancora = document.createElement('a');
        ancora.href = `/api/export?formato=${formato}&${query}`;
        ancora.download = '';
        document.body.appendChild(ancora);
        ancora.click();
        ancora.remove();
      } finally {
        // O navegador cuida do download; nao ha promessa para aguardar.
        setTimeout(() => setExportando(false), 1200);
      }
    },
    [filtros, searchId],
  );

  /**
   * Enriquecimento. A lista e recarregada no fim, e nao a cada lead, para o
   * progresso nao redesenhar centenas de cartoes dezenas de vezes.
   */
  const enriquecer = useCallback(async () => {
    setEnriquecendo(true);
    setProgressoEnriquecimento(null);

    try {
      const resposta = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId, limite: 120 }),
      });
      if (!resposta.body) throw new Error('Resposta sem corpo');

      for await (const { evento, dados } of lerEventos(resposta.body)) {
        if (evento === 'inicio') {
          const d = dados as { total: number };
          setProgressoEnriquecimento({ feitos: 0, total: d.total, comContato: 0 });
        } else if (evento === 'progresso') {
          const d = dados as { feitos: number; total: number; comContato: number };
          setProgressoEnriquecimento(d);
        } else if (evento === 'concluido') {
          const d = dados as { adiados?: number };
          // Rodada que cobriu menos do que parecia precisa dizer isso, senao
          // voce acha que enriqueceu tudo.
          if (d.adiados && d.adiados > 0) {
            setErroLeads(
              `${d.adiados} leads ficaram para a proxima rodada porque compartilham dominio com outros. ` +
                'Clique em "Buscar contatos" de novo para continuar.',
            );
          }
        }
      }
    } catch (erro) {
      setErroLeads(
        erro instanceof Error ? erro.message : 'Falha ao buscar contatos',
      );
    } finally {
      setEnriquecendo(false);
      setProgressoEnriquecimento(null);
      recarregarLeads();
    }
  }, [searchId, recarregarLeads]);

  const leadsDisponiveis = useMemo(
    () => leads.filter((l) => l.contato.pode && l.telefoneE164 && l.telefoneCelular),
    [leads],
  );

  const filaDisparo = useMemo(() => {
    if (selecionados.size > 0) {
      return leads.filter((l) => selecionados.has(l.placeId));
    }
    return leadsDisponiveis;
  }, [leads, selecionados, leadsDisponiveis]);

  const totalEnriquecidos = useMemo(
    () => leads.filter((l) => l.email || l.instagram).length,
    [leads],
  );

  return (
    <div className="flex h-full">
      <aside className="rolagem-fina flex w-[340px] shrink-0 flex-col overflow-y-auto border-r border-borda bg-superficie">
        <CabecalhoApp />

        <PainelBusca
          nichoId={nichoId}
          aoTrocarNicho={setNichoId}
          local={local}
          aoEscolherLocal={setLocal}
          raioKm={raioKm}
          aoTrocarRaio={setRaioKm}
          buscando={buscando}
          progresso={progresso}
          erro={erroBusca}
          aoBuscar={() => void executarBusca()}
          aoCancelar={cancelarBusca}
        />

        <CotaMensal consumo={consumo} />

        <Abas atual={aba} aoTrocar={setAba} />

        <EditorMensagem mensagem={mensagem} aoTrocar={setMensagem} />

        <BuscasAnteriores
          buscas={buscas}
          atual={searchId}
          aoEscolher={(busca) => {
            setCarregandoLeads(true);
            setSearchId(busca.id);
            setLocal({
              label: busca.localLabel,
              lat: busca.centroLat,
              lng: busca.centroLng,
              raioSugeridoKm: null,
            });
            setRaioKm(busca.raioKm);
            setNichoId(busca.nichoId);
            setSelecionados(new Set());
          }}
          aoLimpar={() => {
            setCarregandoLeads(true);
            setSearchId(null);
            setSelecionados(new Set());
          }}
        />

        <PainelFiltros
          filtros={filtros}
          aoTrocarFiltros={trocarFiltros}
          totalListado={totalListado}
          totalNoRaio={resultado?.totalNoRaio ?? 0}
          totalEnriquecidos={totalEnriquecidos}
          selecionados={selecionados.size}
          disponiveisParaDisparo={leadsDisponiveis.length}
          aoExportar={exportar}
          aoAbrirDisparo={() => setDisparoAberto(true)}
          exportando={exportando}
          aoEnriquecer={() => void enriquecer()}
          enriquecendo={enriquecendo}
          progressoEnriquecimento={progressoEnriquecimento}
        />

        {resultado && resultado.avisos.length > 0 && (
          <div className="border-b border-borda p-3">
            <ul className="space-y-1.5">
              {resultado.avisos.map((aviso) => (
                <li
                  key={aviso}
                  className="flex items-start gap-1.5 text-[0.6875rem] text-texto-suave"
                >
                  <IconeAlerta className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  {aviso}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ListaLeads
          leads={leads}
          carregando={carregandoLeads}
          erro={erroLeads}
          selecionados={selecionados}
          destacado={destacado}
          aoAbrirDetalhes={abrirDetalhes}
          aoEnviarWhatsApp={(lead) => void enviarWhatsApp(lead)}
          aoAlternarSelecao={alternarSelecao}
          aoDestacar={setDestacado}
          aoSelecionarTodos={() =>
            setSelecionados(new Set(leadsDisponiveis.map((l) => l.placeId)))
          }
          aoLimparSelecao={() => setSelecionados(new Set())}
        />
      </aside>

      <main id="conteudo" tabIndex={-1} className="relative min-w-0 flex-1">
        {aba === 'mapa' && (
          <MapaLeads
            leads={leads}
            centro={centro}
            raioKm={raioKm}
            destacado={destacado}
            aoSelecionar={abrirDetalhes}
            aoDestacar={setDestacado}
          />
        )}

        {aba === 'kanban' && (
          <QuadroKanban
            leads={leads}
            aoAbrirDetalhes={abrirDetalhes}
            aoAtualizar={recarregarLeads}
          />
        )}

        {aba === 'painel' && <PainelResultados searchId={searchId} />}
      </main>

      {leadAberto && (
        <DetalheLead
          lead={leadAberto}
          mensagem={mensagemPara(leadAberto)}
          aoFechar={() => setLeadAberto(null)}
          aoAtualizar={() => {
            recarregarLeads();
          }}
          aoEnviarWhatsApp={(lead) => void enviarWhatsApp(lead)}
        />
      )}

      {disparoAberto && (
        <ModoDisparo
          fila={filaDisparo}
          montarMensagem={mensagemPara}
          destino={destinoZap}
          aoTrocarDestino={trocarDestinoZap}
          aoFechar={() => {
            setDisparoAberto(false);
            recarregarLeads();
          }}
        />
      )}
    </div>
  );
}
