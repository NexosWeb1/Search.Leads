'use client';

import { useState } from 'react';
import { VARIAVEIS_TEMPLATE } from '@/lib/formato';
import { IconeSeta, IconeWhatsApp } from '@/components/icones';

/**
 * Editor do template de WhatsApp.
 *
 * Fica recolhido por padrao para nao ocupar a sidebar, mas mostra um trecho da
 * mensagem atual: a pior forma de errar aqui e disparar dezenas de mensagens sem
 * lembrar o que estava escrito.
 */
export function EditorMensagem({
  mensagem,
  aoTrocar,
}: {
  mensagem: string;
  aoTrocar: (texto: string) => void;
}) {
  const [aberto, setAberto] = useState(false);

  const inserir = (chave: string) => {
    aoTrocar(`${mensagem}{{${chave}}}`);
  };

  return (
    <div className="border-b border-borda">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-superficie-3"
      >
        <IconeWhatsApp className="size-3.5 shrink-0 text-zap" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-texto">Mensagem do WhatsApp</span>
          {!aberto && (
            <span className="block truncate text-[0.6875rem] text-texto-fraco">
              {mensagem.replace(/\s+/g, ' ').slice(0, 48)}…
            </span>
          )}
        </span>
        <IconeSeta
          className={`size-3.5 shrink-0 text-texto-fraco transition-transform ${aberto ? 'rotate-90' : ''}`}
        />
      </button>

      {aberto && (
        <div className="space-y-2 px-3 pb-3">
          <label htmlFor="mensagem" className="sr-only">
            Texto da mensagem
          </label>
          <textarea
            id="mensagem"
            value={mensagem}
            onChange={(e) => aoTrocar(e.target.value)}
            rows={9}
            className="rolagem-fina w-full resize-y rounded-lg border border-borda-campo bg-superficie-2 p-2 font-mono text-[0.6875rem] leading-relaxed text-texto"
          />

          <div>
            <p className="mb-1 text-[0.6875rem] text-texto-fraco">
              Clique para inserir. Variavel sem valor some da mensagem.
            </p>
            <div className="flex flex-wrap gap-1">
              {VARIAVEIS_TEMPLATE.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  onClick={() => inserir(v.chave)}
                  title={v.descricao}
                  className="rounded-md border border-borda px-1.5 py-0.5 font-mono text-[0.625rem] text-texto-suave transition-colors hover:bg-superficie-3"
                >
                  {`{{${v.chave}}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
