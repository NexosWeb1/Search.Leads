import type { EstadoContato, TipoEstadoContato } from '@/lib/contacts/cooldown';
import {
  IconeBloqueado,
  IconeCheck,
  IconeHistorico,
  IconeRelogio,
} from '@/components/icones';

/**
 * Tarja que diz, num relance, se voce ja falou com este comercio.
 *
 * E o elemento que impede o desgaste: sem ele voce so descobriria que ja mandou
 * mensagem depois de abrir o WhatsApp e ver a conversa antiga.
 */

const ESTILO: Record<
  TipoEstadoContato,
  { classe: string; Icone: typeof IconeRelogio } | null
> = {
  // Nunca contatado nao ganha tarja: o padrao nao precisa de rotulo, e poluiria
  // a lista inteira logo depois de uma varredura.
  nunca_contatado: null,
  em_cooldown: {
    classe:
      'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900',
    Icone: IconeRelogio,
  },
  follow_up: {
    classe:
      'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-900',
    Icone: IconeHistorico,
  },
  reabordagem: {
    classe:
      'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-900',
    Icone: IconeHistorico,
  },
  em_negociacao: {
    classe:
      'bg-marca-50 text-marca-800 ring-marca-200 dark:bg-marca-800/30 dark:text-marca-200 dark:ring-marca-800',
    Icone: IconeCheck,
  },
  esgotado: {
    classe:
      'bg-superficie-3 text-texto-suave ring-borda dark:bg-superficie-3 dark:text-texto-suave',
    Icone: IconeHistorico,
  },
  bloqueado: {
    classe:
      'bg-superficie-3 text-texto-suave ring-borda dark:bg-superficie-3 dark:text-texto-suave',
    Icone: IconeBloqueado,
  },
};

export function TarjaContato({
  contato,
  className = '',
}: {
  contato: EstadoContato;
  className?: string;
}) {
  const estilo = ESTILO[contato.tipo];
  if (!estilo) return null;

  const { Icone } = estilo;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset ${estilo.classe} ${className}`}
    >
      <Icone className="size-3 shrink-0" />
      {contato.rotulo}
      {contato.tentativasFeitas > 1 && contato.tipo !== 'esgotado' && (
        <span className="opacity-70">({contato.tentativasFeitas}x)</span>
      )}
    </span>
  );
}
