/**
 * Icones em SVG inline.
 *
 * Sao poucos e nao mudam, entao nao vale carregar uma biblioteca inteira de
 * icones para isto. Todos herdam currentColor e o tamanho vem por classe.
 */

type Props = React.SVGProps<SVGSVGElement>;

const base = (props: Props) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const IconeMapa = (p: Props) => (
  <svg {...base(p)}>
    <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
    <path d="M9 4v13M15 6.5v13" />
  </svg>
);

export const IconeKanban = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="10" y="4" width="5" height="10" rx="1.5" />
    <rect x="17" y="4" width="4" height="13" rx="1.5" />
  </svg>
);

export const IconePainel = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 20h18" />
    <rect x="5" y="11" width="3.5" height="9" rx="1" />
    <rect x="10.5" y="6" width="3.5" height="14" rx="1" />
    <rect x="16" y="14" width="3.5" height="6" rx="1" />
  </svg>
);

export const IconeWhatsApp = (p: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.85 9.85 0 0 0 12.04 2Zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
  </svg>
);

export const IconeInstagram = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="3.8" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconeEmail = (p: Props) => (
  <svg {...base(p)}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

export const IconeTelefone = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z" />
  </svg>
);

export const IconeLupa = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </svg>
);

export const IconeAlvo = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconeLocal = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);

export const IconeLua = (p: Props) => (
  <svg {...base(p)}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
  </svg>
);

export const IconeSol = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </svg>
);

export const IconeAlerta = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 3.8 2.8 19.5h18.4L12 3.8Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconeCheck = (p: Props) => (
  <svg {...base(p)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const IconeBaixar = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 17.5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </svg>
);

export const IconeFoguete = (p: Props) => (
  <svg {...base(p)}>
    <path d="M13.5 3.5c3.5 0 7 3.5 7 7 0 3-4.5 7-4.5 7l-4-4s4-4.5 1.5-10Z" />
    <path d="M9.5 15.5 5 11s.8-3.4 4-4.5" />
    <path d="M6.5 17.5c-1 1-1.2 3.5-1.2 3.5s2.5-.2 3.5-1.2" />
  </svg>
);

export const IconeRelogio = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

export const IconeHistorico = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.2 4v4.2h4.2" />
    <path d="M12 7.8V12l2.8 1.7" />
  </svg>
);

export const IconeBloqueado = (p: Props) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.8a4 4 0 1 1 8 0v2.7" />
  </svg>
);

export const IconeFechar = (p: Props) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconeSeta = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconeGlobo = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.4 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.4-3.4-8.5S9.8 5.8 12 3.5Z" />
  </svg>
);

export const IconeSair = (p: Props) => (
  <svg {...base(p)}>
    <path d="M15 4h3.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </svg>
);

export const IconeCarregando = (p: Props) => (
  <svg {...base(p)} className={`animate-spin ${p.className ?? ''}`}>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
  </svg>
);
