/**
 * Decide se um lead pode ser abordado agora.
 *
 * Esta e a funcao que impede a ferramenta de virar uma maquina de spam. Toda
 * fila de disparo passa por aqui, e nada entra na fila sem autorizacao desta
 * funcao. O modo disparo pode forcar um lead bloqueado, mas so depois de mostrar
 * na tela a data e o texto da ultima mensagem enviada.
 */

export interface ConfigCooldown {
  /** Dias em que o lead fica intocavel depois de um contato. */
  diasBloqueio: number;
  /**
   * Depois disso o contato anterior e antigo o bastante para valer uma
   * abordagem nova em vez de um follow-up. Nao bloqueia, apenas muda o rotulo e
   * o tom sugerido da mensagem.
   */
  diasContatoAntigo: number;
  /** Tentativas sem nenhuma resposta antes de o lead ser marcado como frio. */
  maxTentativas: number;
  /** Envios por dia a partir do mesmo numero antes de a ferramenta avisar. */
  limiteDiario: number;
}

export const COOLDOWN_PADRAO: ConfigCooldown = {
  diasBloqueio: 15,
  diasContatoAntigo: 45,
  maxTentativas: 3,
  limiteDiario: 40,
};

export type TipoEstadoContato =
  | 'nunca_contatado'
  | 'follow_up'
  | 'reabordagem'
  | 'em_cooldown'
  | 'esgotado'
  | 'em_negociacao'
  | 'bloqueado';

export interface EstadoContato {
  /** Se false, o lead nao entra na fila de disparo. */
  pode: boolean;
  tipo: TipoEstadoContato;
  /** Numero da tentativa que este contato seria. */
  proximaTentativa: number;
  tentativasFeitas: number;
  diasDesdeUltimo: number | null;
  /** Quantos dias faltam para sair do cooldown. */
  diasRestantes: number | null;
  /** Texto curto para a tarja do card. */
  rotulo: string;
}

export interface DadosCrmContato {
  status: string;
  tentativas: number;
  ultimoContatoEm: string | null;
  respondeuEm: string | null;
  motivoPerda?: string | null;
}

/**
 * Status que tiram o lead da fila de disparo em massa, seja para sempre, seja
 * ate voce decidir o contrario movendo o cartao no Kanban.
 *
 * `perdido` esta aqui de proposito. Um lead marcado como perdido recebeu um nao,
 * e mandar mensagem nova quinze dias depois e insistencia, nao follow-up.
 * Tirar o cartao da coluna Perdido devolve ele para a fila, e essa passa a ser
 * uma decisao sua e explicita.
 */
export const STATUS_FORA_DA_FILA = [
  'fechado',
  'nao_perturbe',
  'respondeu',
  'negociando',
  'frio',
  'perdido',
] as const;

const DIA_MS = 86_400_000;

function diasEntre(iso: string, referencia: number): number {
  return Math.floor((referencia - new Date(iso).getTime()) / DIA_MS);
}

export function avaliarContato(
  crm: DadosCrmContato | null,
  config: ConfigCooldown = COOLDOWN_PADRAO,
  referencia: number = Date.now(),
): EstadoContato {
  const nuncaContatado: EstadoContato = {
    pode: true,
    tipo: 'nunca_contatado',
    proximaTentativa: 1,
    tentativasFeitas: 0,
    diasDesdeUltimo: null,
    diasRestantes: null,
    rotulo: 'Nunca contatado',
  };

  if (!crm) return nuncaContatado;

  const tentativasFeitas = crm.tentativas;
  const diasDesdeUltimo = crm.ultimoContatoEm
    ? diasEntre(crm.ultimoContatoEm, referencia)
    : null;

  const base = {
    proximaTentativa: tentativasFeitas + 1,
    tentativasFeitas,
    diasDesdeUltimo,
    diasRestantes: null as number | null,
  };

  // Bloqueio permanente: negocio ja resolvido ou pedido explicito de nao contato.
  if (crm.status === 'fechado') {
    return { ...base, pode: false, tipo: 'bloqueado', rotulo: 'Cliente fechado' };
  }
  if (crm.status === 'nao_perturbe') {
    return { ...base, pode: false, tipo: 'bloqueado', rotulo: 'Nao perturbe' };
  }

  // Ja recebeu um nao. Volta para a fila somente se voce tirar da coluna Perdido.
  if (crm.status === 'perdido') {
    return {
      ...base,
      pode: false,
      tipo: 'bloqueado',
      rotulo: crm.motivoPerda
        ? `Perdido: ${crm.motivoPerda.replace(/_/g, ' ')}`
        : 'Perdido',
    };
  }

  // Ja respondeu: a conversa e manual daqui em diante, disparo em massa passaria
  // por cima de uma negociacao em andamento.
  if (crm.status === 'respondeu' || crm.status === 'negociando') {
    return { ...base, pode: false, tipo: 'em_negociacao', rotulo: 'Em conversa' };
  }

  if (crm.status === 'frio' || tentativasFeitas >= config.maxTentativas) {
    return {
      ...base,
      pode: false,
      tipo: 'esgotado',
      rotulo: `${tentativasFeitas} tentativas, sem resposta`,
    };
  }

  /*
   * Zero tentativas significa que nenhuma mensagem saiu, e sem mensagem nao ha
   * de que esfriar. O caso concreto e a falha tecnica: numero invalido ou sem
   * WhatsApp deixa registro no historico mas nao consome tentativa, e o lead
   * precisa continuar disponivel para quando o telefone for corrigido.
   *
   * Esta checagem vem depois dos bloqueios de status de proposito, para que um
   * lead marcado como "nao perturbe" sem nunca ter sido contatado continue
   * bloqueado. E `tentativas` que manda aqui, nao a data: se as duas fontes
   * discordarem, a lista e a fila de disparo passam a mostrar numeros
   * diferentes.
   */
  if (tentativasFeitas === 0) return nuncaContatado;

  if (diasDesdeUltimo !== null && diasDesdeUltimo < config.diasBloqueio) {
    return {
      ...base,
      pode: false,
      tipo: 'em_cooldown',
      diasRestantes: config.diasBloqueio - diasDesdeUltimo,
      rotulo:
        diasDesdeUltimo === 0
          ? 'Contatado hoje'
          : `Contatado ha ${diasDesdeUltimo} ${diasDesdeUltimo === 1 ? 'dia' : 'dias'}`,
    };
  }

  const antigo =
    diasDesdeUltimo !== null && diasDesdeUltimo >= config.diasContatoAntigo;

  return {
    ...base,
    pode: true,
    tipo: antigo ? 'reabordagem' : 'follow_up',
    rotulo: antigo
      ? `Contato antigo, ha ${diasDesdeUltimo} dias`
      : `Pronto para ${base.proximaTentativa}a tentativa`,
  };
}

/** Data limite antes da qual um contato ja saiu do cooldown. Usada nas queries. */
export function limiteCooldownIso(
  config: ConfigCooldown = COOLDOWN_PADRAO,
  referencia: number = Date.now(),
): string {
  return new Date(referencia - config.diasBloqueio * DIA_MS).toISOString();
}
