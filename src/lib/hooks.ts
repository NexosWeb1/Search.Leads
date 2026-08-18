'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Le o tema atual.
 *
 * O tema mora na classe do elemento html, aplicada por um script no layout antes
 * da primeira pintura, entao e estado de um sistema externo e nao do React. Por
 * isso useSyncExternalStore: ele resolve a hidratacao sozinho, sem efeito nem
 * setState.
 *
 * Existe como hook compartilhado porque dois lugares precisam: o botao que
 * alterna o tema e o mapa, que precisa de cor literal (canvas nao resolve
 * variavel CSS).
 */
function inscreverNoTema(aoMudar: () => void): () => void {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observador.disconnect();
}

export function useTemaEscuro(): boolean {
  return useSyncExternalStore(
    inscreverNoTema,
    () => document.documentElement.classList.contains('dark'),
    // No servidor nao ha classe para ler. O script do layout corrige antes de
    // qualquer pintura, entao nao ha piscada.
    () => false,
  );
}

/*
 * Preferencia guardada no navegador.
 *
 * localStorage e estado de um sistema externo, e nao do React, entao a leitura
 * vai por useSyncExternalStore: ele resolve a hidratacao sozinho, sem efeito nem
 * setState. Ler dentro de um efeito provocaria renderizacao em cascata e,
 * durante a hidratacao, uma divergencia entre o que o servidor mandou e o que o
 * navegador tem guardado.
 *
 * A lista de ouvintes existe para uma aba se atualizar quando ela mesma grava. O
 * evento `storage` do navegador so avisa as OUTRAS abas, nunca a que escreveu.
 */
const ouvintesPreferencia = new Set<() => void>();

export function usePreferenciaLocal<T extends string>(
  chave: string,
  padrao: T,
  validos: readonly T[],
): readonly [T, (valor: T) => void] {
  const inscrever = useCallback((aoMudar: () => void) => {
    ouvintesPreferencia.add(aoMudar);
    window.addEventListener('storage', aoMudar);
    return () => {
      ouvintesPreferencia.delete(aoMudar);
      window.removeEventListener('storage', aoMudar);
    };
  }, []);

  const lerCliente = useCallback((): T => {
    try {
      const bruto = localStorage.getItem(chave);
      return (validos as readonly string[]).includes(bruto ?? '') ? (bruto as T) : padrao;
    } catch {
      // Navegacao privada pode bloquear o acesso. Vale o padrao.
      return padrao;
    }
  }, [chave, padrao, validos]);

  // No servidor nao ha o que ler, entao o padrao. O valor guardado assume logo
  // apos a hidratacao.
  const lerServidor = useCallback(() => padrao, [padrao]);

  const valor = useSyncExternalStore(inscrever, lerCliente, lerServidor);

  const definir = useCallback(
    (novo: T) => {
      try {
        localStorage.setItem(chave, novo);
      } catch {
        // Sem persistencia, mas a escolha vale para esta sessao.
      }
      for (const ouvinte of ouvintesPreferencia) ouvinte();
    },
    [chave],
  );

  return [valor, definir] as const;
}

/** Atrasa o valor para nao disparar uma requisicao a cada tecla digitada. */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);

  return atrasado;
}

const FOCAVEIS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Gerencia o foco de um overlay: leva o foco para dentro ao abrir, prende o Tab
 * no conteudo enquanto estiver aberto, e devolve para onde estava ao fechar.
 *
 * Sem isso, quem navega por teclado continua tabulando pela pagina atras do
 * modal, sem enxergar onde o foco esta. E requisito do WAI-ARIA para dialogo
 * modal, e nao um refinamento.
 */
export function useFocoPreso(
  referencia: React.RefObject<HTMLElement | null>,
  ativo = true,
): void {
  const anterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const caixa = referencia.current;
    if (!caixa) return;

    anterior.current = document.activeElement as HTMLElement | null;

    const focaveis = () =>
      Array.from(caixa.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Foco no primeiro elemento util, nao no proprio container.
    const primeiro = focaveis()[0];
    (primeiro ?? caixa).focus({ preventScroll: true });

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Tab') return;
      const lista = focaveis();
      if (lista.length === 0) return;

      const inicio = lista[0];
      const fim = lista[lista.length - 1];
      const atual = document.activeElement;

      if (evento.shiftKey && (atual === inicio || !caixa.contains(atual))) {
        evento.preventDefault();
        fim.focus();
      } else if (!evento.shiftKey && atual === fim) {
        evento.preventDefault();
        inicio.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      anterior.current?.focus({ preventScroll: true });
    };
  }, [ativo, referencia]);
}

/** Fecha um popover ao clicar fora ou apertar Esc. */
export function useFecharFora(
  ativo: boolean,
  aoFechar: () => void,
  referencia: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!ativo) return;

    const clique = (evento: MouseEvent) => {
      if (!referencia.current?.contains(evento.target as Node)) aoFechar();
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };

    document.addEventListener('mousedown', clique);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', clique);
      document.removeEventListener('keydown', tecla);
    };
  }, [ativo, aoFechar, referencia]);
}
