/**
 * Normalizacao de telefone brasileiro.
 *
 * Existe para duas coisas: montar o link wa.me (que exige E.164 sem sinais) e
 * saber se o numero e celular, porque somente celular tem WhatsApp. Numero fixo
 * entra na lista mas nao entra na fila de disparo.
 */

/** DDDs em uso no Brasil. Codigo fora dessa lista e erro de cadastro no Google. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export interface TelefoneBr {
  /** Formato E.164 sem sinais, pronto para wa.me. Ex: 5551999508056 */
  e164: string | null;
  /** Formato legivel. Ex: (51) 99950-8056 */
  formatado: string | null;
  ddd: number | null;
  /** Celular tem 9 digitos e comeca com 9. Somente celular tem WhatsApp. */
  celular: boolean;
  valido: boolean;
  /** Por que foi rejeitado, para o bloco de falha tecnica do dashboard. */
  motivo?: 'vazio' | 'digitos_insuficientes' | 'ddd_invalido' | 'formato_desconhecido';
}

const INVALIDO = (motivo: TelefoneBr['motivo']): TelefoneBr => ({
  e164: null,
  formatado: null,
  ddd: null,
  celular: false,
  valido: false,
  motivo,
});

/**
 * Aceita qualquer coisa que o Google devolva: "(51) 99950-8056",
 * "+55 51 99950-8056", "051999508056", "5199950805 6".
 */
export function normalizarTelefone(entrada: string | null | undefined): TelefoneBr {
  if (!entrada) return INVALIDO('vazio');

  let d = entrada.replace(/\D/g, '');
  if (!d) return INVALIDO('vazio');

  // Descarta o DDI do Brasil quando presente. Cuidado: 55 tambem e um DDD
  // valido (Santa Maria/RS), entao so tratamos como DDI se o que sobra tiver
  // tamanho de numero nacional completo.
  if (d.length >= 12 && d.startsWith('55')) {
    d = d.slice(2);
  }

  // Zero de operadora ou de tronco na frente.
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1);

  if (d.length < 10) return INVALIDO('digitos_insuficientes');
  if (d.length > 11) return INVALIDO('formato_desconhecido');

  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return INVALIDO('ddd_invalido');

  const assinante = d.slice(2);

  // Celular: 9 digitos comecando com 9. Fixo: 8 digitos comecando de 2 a 5.
  const celular = assinante.length === 9 && assinante.startsWith('9');
  const fixo = assinante.length === 8 && /^[2-5]/.test(assinante);

  if (!celular && !fixo) return INVALIDO('formato_desconhecido');

  const meio = celular ? assinante.slice(0, 5) : assinante.slice(0, 4);
  const fim = celular ? assinante.slice(5) : assinante.slice(4);

  return {
    e164: `55${ddd}${assinante}`,
    formatado: `(${ddd}) ${meio}-${fim}`,
    ddd,
    celular,
    valido: true,
  };
}

/** Monta o link do WhatsApp com a mensagem ja preenchida. */
export function linkWhatsApp(e164: string, mensagem: string): string {
  return `https://wa.me/${e164}?text=${encodeURIComponent(mensagem)}`;
}
