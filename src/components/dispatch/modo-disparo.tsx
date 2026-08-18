'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LeadCompleto } from '@/lib/db/leads';
import type { Entrega } from '@/lib/db/schema';
import { ABA_WHATSAPP, linkWhatsApp, type DestinoWhatsApp } from '@/lib/phone/br';
import { formatarNumero, tempoRelativo } from '@/lib/formato';
import { useFocoPreso } from '@/lib/hooks';
import { TarjaContato } from '@/components/leads/tarja-contato';
import {
  IconeAlerta,
  IconeBloqueado,
  IconeCheck,
  IconeFechar,
  IconeSeta,
  IconeWhatsApp,
} from '@/components/icones';

/**
 * Envio sequencial de WhatsApp.
 *
 * A ferramenta abre a conversa com a mensagem pronta e voce aperta Enter. O
 * ultimo passo continua sendo seu, e isso nao e falta de recurso.
 *
 * Enviar sozinho so seria possivel por dois caminhos, e nenhum serve aqui. A API
 * oficial da Meta exige opt-in do destinatario e template aprovado, o que
 * prospeccao fria nao tem por definicao. As bibliotecas nao oficiais funcionam,
 * mas violam os Termos e o banimento atinge o numero, que aqui e o comercial,
 * com as conversas de clientes dentro; alem disso precisariam de um servidor
 * permanente segurando a sessao, incompativel com funcao serverless.
 *
 * O que da para eliminar sao os passos intermediarios, e isso esta feito: a
 * conversa abre direto, sempre na mesma aba, com o texto preenchido.
 *
 * As protecoes que importam ficam aqui: contador diario, aviso de lead ja
 * abordado com o texto da ultima mensagem, e registro automatico de cada
 * tentativa.
 */

interface Props {
  fila: LeadCompleto[];
  montarMensagem: (lead: LeadCompleto) => string;
  destino: DestinoWhatsApp;
  aoTrocarDestino: (destino: DestinoWhatsApp) => void;
  aoFechar: () => void;
}

export function ModoDisparo({
  fila,
  montarMensagem,
  destino,
  aoTrocarDestino,
  aoFechar,
}: Props) {
  const [indice, setIndice] = useState(0);
  const [enviados, setEnviados] = useState(0);
  const [pulados, setPulados] = useState(0);
  const [enviadosHoje, setEnviadosHoje] = useState<number | null>(null);
  const [limiteDiario, setLimiteDiario] = useState(40);
  const [ocupado, setOcupado] = useState(false);
  const painel = useRef<HTMLDivElement>(null);

  useFocoPreso(painel);

  /*
   * O texto e o aviso de bloqueio sao derivados do lead atual, e nao copiados
   * para o estado por um efeito. Guardar apenas o que voce editou, por lead,
   * resolve duas coisas de uma vez: nao ha renderizacao em cascata, e voltar um
   * lead na fila nao apaga o ajuste que voce tinha feito no texto dele.
   */
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [forcados, setForcados] = useState<Set<string>>(new Set());

  const lead = fila[indice] as LeadCompleto | undefined;
  const acabou = indice >= fila.length;

  const texto = lead
    ? (edicoes[lead.placeId] ?? montarMensagem(lead))
    : '';
  const confirmandoBloqueado = Boolean(
    lead && !lead.contato.pode && !forcados.has(lead.placeId),
  );

  const setTexto = (valor: string) => {
    if (!lead) return;
    setEdicoes((atual) => ({ ...atual, [lead.placeId]: valor }));
  };

  useEffect(() => {
    fetch('/api/contacts')
      .then((r) => r.json())
      .then((d) => {
        setEnviadosHoje(d.enviadosHoje ?? 0);
        setLimiteDiario(d.limiteDiario ?? 40);
      })
      .catch(() => setEnviadosHoje(0));
  }, []);

  const registrar = useCallback(
    async (entrega: Entrega, mensagem?: string) => {
      if (!lead) return;
      setOcupado(true);
      try {
        const resposta = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: lead.placeId,
            entrega,
            canal: 'whatsapp',
            mensagem,
          }),
        });
        const dados = await resposta.json();
        if (typeof dados.enviadosHoje === 'number') setEnviadosHoje(dados.enviadosHoje);
      } catch {
        // O contato ja foi aberto no WhatsApp; perder o registro e ruim mas nao
        // deve travar a fila. O lead segue como nao contatado e reaparece depois.
      } finally {
        setOcupado(false);
        setIndice((i) => i + 1);
      }
    },
    [lead],
  );

  const enviar = useCallback(() => {
    if (!lead?.telefoneE164 || ocupado) return;
    window.open(linkWhatsApp(lead.telefoneE164, texto, destino), ABA_WHATSAPP);
    setEnviados((n) => n + 1);
    void registrar('enviado', texto);
  }, [lead, texto, ocupado, registrar, destino]);

  const pular = useCallback(() => {
    setPulados((n) => n + 1);
    void registrar('pulado');
  }, [registrar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        aoFechar();
        return;
      }
      // Enter sozinho tem de continuar quebrando linha no textarea.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!confirmandoBloqueado) enviar();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar, enviar, confirmandoBloqueado]);

  const passouDoLimite = enviadosHoje !== null && enviadosHoje >= limiteDiario;

  const restantes = useMemo(() => fila.length - indice, [fila.length, indice]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Modo disparo"
        ref={painel}
        tabIndex={-1}
        className="contem-rolagem flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-[var(--sombra-flutuante)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-borda p-4">
          <div>
            <h2 className="text-sm font-semibold text-texto">Modo disparo</h2>
            <p className="text-[0.6875rem] text-texto-fraco">
              {acabou
                ? 'Fila concluida'
                : `Lead ${indice + 1} de ${formatarNumero(fila.length)}`}
              {enviadosHoje !== null && (
                <>
                  {' '}
                  &middot; {enviadosHoje}/{limiteDiario} enviados hoje
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-8 place-items-center rounded-lg text-texto-fraco transition-colors hover:bg-superficie-3"
          >
            <IconeFechar className="size-4" />
          </button>
        </header>

        {passouDoLimite && !acabou && (
          <p className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <IconeAlerta className="mt-0.5 size-4 shrink-0" />
            <span>
              Voce ja mandou {enviadosHoje} mensagens hoje. Passar disso a partir do mesmo
              numero e o que costuma fazer o WhatsApp bloquear a conta. Vale continuar
              amanha.
            </span>
          </p>
        )}

        {acabou ? (
          <div className="p-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-marca-100 text-marca-700 dark:bg-marca-800/40 dark:text-marca-300">
              <IconeCheck className="size-6" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-texto">Fila concluida</h3>
            <p className="mt-1 text-xs text-texto-suave">
              {enviados} {enviados === 1 ? 'mensagem enviada' : 'mensagens enviadas'}
              {pulados > 0 && `, ${pulados} ${pulados === 1 ? 'pulado' : 'pulados'}`}.
            </p>
            <p className="mt-2 text-[0.6875rem] text-texto-fraco">
              Todos ficaram registrados e entram em periodo de espera, entao nao vao
              reaparecer na proxima busca.
            </p>
            <button
              type="button"
              onClick={aoFechar}
              className="mt-4 rounded-lg bg-marca-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-marca-800"
            >
              Fechar
            </button>
          </div>
        ) : !lead ? null : (
          <>
            <div className="rolagem-fina flex-1 space-y-3 overflow-y-auto p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-texto">{lead.nome}</h3>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-texto-fraco">
                    {lead.score}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-texto-fraco">
                  {lead.enderecoCurto ?? lead.endereco}
                </p>
                <p className="mt-1 text-xs text-texto-suave">{lead.telefoneFormatado}</p>
                <div className="mt-1.5">
                  <TarjaContato contato={lead.contato} />
                </div>
              </div>

              {confirmandoBloqueado && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                  <p className="flex items-start gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                    <IconeBloqueado className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Voce ja falou com este comercio {tempoRelativo(lead.ultimoContatoEm)}
                      {lead.tentativas > 0 && `, em ${lead.tentativas} ${lead.tentativas === 1 ? 'tentativa' : 'tentativas'}`}
                      . Mandar de novo agora pode soar como insistencia.
                    </span>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={pular}
                      className="flex-1 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
                    >
                      Pular este
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForcados((atual) => new Set(atual).add(lead.placeId))
                      }
                      className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                      Mandar mesmo assim
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="texto-disparo"
                  className="mb-1 block text-xs font-medium text-texto-suave"
                >
                  Mensagem
                </label>
                <textarea
                  id="texto-disparo"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={8}
                  className="rolagem-fina w-full resize-y rounded-lg border border-borda-campo bg-superficie-2 p-2.5 text-xs leading-relaxed text-texto"
                />
                <p className="mt-1 text-[0.6875rem] text-texto-fraco">
                  Ctrl + Enter abre o WhatsApp e avanca. Esc fecha.
                </p>

                <div className="mt-3 flex items-center gap-2 rounded-lg bg-superficie-2 p-2">
                  <label
                    htmlFor="destino-zap"
                    className="text-[0.6875rem] font-medium text-texto-suave"
                  >
                    Abrir em
                  </label>
                  <select
                    id="destino-zap"
                    value={destino}
                    onChange={(e) => aoTrocarDestino(e.target.value as DestinoWhatsApp)}
                    className="rounded-md border border-borda-campo bg-superficie px-2 py-1 text-[0.6875rem] text-texto"
                  >
                    <option value="web">WhatsApp Web, direto na conversa</option>
                    <option value="app">Aplicativo, passando pelo wa.me</option>
                  </select>
                  <span className="text-[0.6875rem] text-texto-fraco">
                    {destino === 'web'
                      ? 'Sempre na mesma aba'
                      : 'Escolha esta se usa o celular'}
                  </span>
                </div>
              </div>
            </div>

            <footer className="flex items-center gap-2 border-t border-borda p-4">
              <button
                type="button"
                onClick={pular}
                disabled={ocupado}
                className="rounded-lg border border-borda px-3 py-2 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-3 disabled:opacity-50"
              >
                Pular
              </button>

              <button
                type="button"
                onClick={() => void registrar('sem_whatsapp')}
                disabled={ocupado}
                title="Registra falha tecnica. Nao gasta tentativa e o lead volta para a fila depois."
                className="rounded-lg border border-borda px-3 py-2 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-3 disabled:opacity-50"
              >
                Numero nao serve
              </button>

              <button
                type="button"
                onClick={enviar}
                disabled={ocupado || confirmandoBloqueado || !lead.telefoneE164}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zap px-4 py-2 text-sm font-semibold text-[var(--color-zap-texto)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700"
              >
                <IconeWhatsApp className="size-4" />
                Enviar
                <IconeSeta className="size-3.5" />
              </button>
            </footer>

            <div className="border-t border-borda px-4 py-2 text-[0.6875rem] text-texto-fraco">
              {restantes} {restantes === 1 ? 'restante' : 'restantes'} &middot; {enviados}{' '}
              {enviados === 1 ? 'aberto' : 'abertos'} nesta sessao &middot; falta apertar
              Enter no WhatsApp
            </div>
          </>
        )}
      </div>
    </div>
  );
}
