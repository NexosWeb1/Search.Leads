import type { Ordenacao } from '@/lib/db/leads';

/** Estado dos filtros no cliente. Vira query string para /api/leads. */
export interface EstadoFiltros {
  incluirComSite: boolean;
  somenteWhatsapp: boolean;
  somenteInstagram: boolean;
  somenteEmail: boolean;
  contato: 'todos' | 'nunca' | 'disponivel' | 'contatados';
  busca: string;
  ordenar: Ordenacao;
}

export const FILTROS_INICIAIS: EstadoFiltros = {
  incluirComSite: false,
  somenteWhatsapp: false,
  somenteInstagram: false,
  somenteEmail: false,
  contato: 'todos',
  busca: '',
  ordenar: 'relevancia',
};

export const ROTULO_ORDENACAO: Record<Ordenacao, string> = {
  relevancia: 'Relevancia (score)',
  avaliacoes: 'Mais avaliados',
  distancia: 'Mais proximos',
  nome: 'Nome (A-Z)',
  status: 'Status no funil',
  recente: 'Encontrados por ultimo',
};

export function filtrosParaQuery(
  filtros: EstadoFiltros,
  searchId: string | null,
  limite = 500,
): string {
  const p = new URLSearchParams();
  if (searchId) p.set('searchId', searchId);
  if (filtros.incluirComSite) p.set('incluirComSite', 'true');
  if (filtros.somenteWhatsapp) p.set('whatsapp', 'true');
  if (filtros.somenteInstagram) p.set('instagram', 'true');
  if (filtros.somenteEmail) p.set('email', 'true');
  if (filtros.contato !== 'todos') p.set('contato', filtros.contato);
  if (filtros.busca.trim()) p.set('busca', filtros.busca.trim());
  p.set('ordenar', filtros.ordenar);
  p.set('limite', String(limite));
  return p.toString();
}

/** Quantos filtros estao ativos, para o selo no botao de filtros. */
export function contarFiltrosAtivos(filtros: EstadoFiltros): number {
  let n = 0;
  if (filtros.incluirComSite) n++;
  if (filtros.somenteWhatsapp) n++;
  if (filtros.somenteInstagram) n++;
  if (filtros.somenteEmail) n++;
  if (filtros.contato !== 'todos') n++;
  if (filtros.busca.trim()) n++;
  return n;
}
