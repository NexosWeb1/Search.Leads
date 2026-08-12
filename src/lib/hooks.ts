'use client';

import { useEffect, useRef, useState } from 'react';

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
