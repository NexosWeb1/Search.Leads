/** Formatacao para exibicao, toda em pt-BR. */

export function formatarDistancia(metros: number | null): string {
  if (metros === null) return '';
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR');
}

export function formatarMoeda(valor: number, moeda: 'BRL' | 'USD' = 'BRL'): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: moeda,
    minimumFractionDigits: 2,
  });
}

export function formatarPorcentagem(parte: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((parte / total) * 100)}%`;
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const FORMATO_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatarData(iso: string | null): string {
  if (!iso) return '';
  return FORMATO_DATA.format(new Date(iso));
}

export function formatarDataHora(iso: string | null): string {
  if (!iso) return '';
  return FORMATO_DATA_HORA.format(new Date(iso));
}

/** "ha 3 dias", "hoje", "ha 2 meses". */
export function tempoRelativo(iso: string | null): string {
  if (!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `ha ${dias} dias`;
  if (dias < 60) return 'ha 1 mes';
  if (dias < 365) return `ha ${Math.floor(dias / 30)} meses`;
  if (dias < 730) return 'ha 1 ano';
  return `ha ${Math.floor(dias / 365)} anos`;
}

/**
 * Substitui as variaveis do template pelos dados do lead.
 * Variavel sem valor vira texto neutro em vez de aparecer crua na mensagem, que
 * seria constrangedor ao enviar.
 */
export function preencherTemplate(
  corpo: string,
  valores: Record<string, string | null | undefined>,
): string {
  return corpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, chave: string) => {
    const valor = valores[chave];
    return valor && valor.trim() ? valor.trim() : '';
  })
    // Um placeholder vazio costuma deixar espaco duplo ou virgula solta.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1');
}

export const VARIAVEIS_TEMPLATE = [
  { chave: 'nome', descricao: 'Nome do comercio' },
  { chave: 'bairro', descricao: 'Bairro' },
  { chave: 'cidade', descricao: 'Cidade' },
  { chave: 'categoria', descricao: 'Ramo do negocio' },
] as const;
