/**
 * Geracao das planilhas de export.
 *
 * Dois detalhes que fazem diferenca no Excel em portugues:
 *
 * 1. O CSV sai com BOM de UTF-8. Sem ele o Excel do Windows abre "Barbearia" e
 *    mostra "Barbearia" com acento quebrado.
 * 2. O separador e ponto e virgula, porque no Excel em pt-BR a virgula e
 *    separador decimal e o arquivo abriria tudo numa coluna so.
 */

import ExcelJS from 'exceljs';
import type { LeadCompleto } from '../db/leads';
import { ROTULO_FAIXA } from '../scoring/score';
import { ROTULO_STATUS } from '../db/schema';

interface Coluna {
  cabecalho: string;
  largura: number;
  valor: (lead: LeadCompleto) => string | number | null;
}

const COLUNAS: Coluna[] = [
  { cabecalho: 'Nome', largura: 38, valor: (l) => l.nome },
  { cabecalho: 'Score', largura: 8, valor: (l) => l.score },
  { cabecalho: 'Faixa', largura: 15, valor: (l) => ROTULO_FAIXA[l.faixa] },
  { cabecalho: 'Situacao do site', largura: 22, valor: (l) => rotuloSite(l) },
  { cabecalho: 'Site', largura: 32, valor: (l) => l.websiteUrl },
  { cabecalho: 'Telefone', largura: 18, valor: (l) => l.telefoneFormatado },
  { cabecalho: 'WhatsApp', largura: 16, valor: (l) => (l.telefoneCelular ? 'Sim' : 'Nao') },
  {
    cabecalho: 'Link do WhatsApp',
    largura: 34,
    valor: (l) => (l.telefoneE164 && l.telefoneCelular ? `https://wa.me/${l.telefoneE164}` : null),
  },
  { cabecalho: 'E-mail', largura: 26, valor: (l) => l.email },
  { cabecalho: 'Instagram', largura: 24, valor: (l) => l.instagram },
  { cabecalho: 'Endereco', largura: 44, valor: (l) => l.endereco },
  { cabecalho: 'Bairro', largura: 20, valor: (l) => l.bairro },
  { cabecalho: 'Cidade', largura: 20, valor: (l) => l.cidade },
  { cabecalho: 'UF', largura: 6, valor: (l) => l.uf },
  { cabecalho: 'Ramo', largura: 22, valor: (l) => l.tipoLabel },
  { cabecalho: 'Nota', largura: 8, valor: (l) => l.nota },
  { cabecalho: 'Avaliacoes', largura: 12, valor: (l) => l.totalAvaliacoes },
  {
    cabecalho: 'Distancia (km)',
    largura: 14,
    valor: (l) => (l.distanciaM === null ? null : Number((l.distanciaM / 1000).toFixed(2))),
  },
  { cabecalho: 'Status', largura: 16, valor: (l) => ROTULO_STATUS[l.status] },
  { cabecalho: 'Tentativas', largura: 12, valor: (l) => l.tentativas },
  {
    cabecalho: 'Ultimo contato',
    largura: 18,
    valor: (l) => (l.ultimoContatoEm ? l.ultimoContatoEm.slice(0, 10) : null),
  },
  { cabecalho: 'Pode contatar', largura: 14, valor: (l) => (l.contato.pode ? 'Sim' : 'Nao') },
  { cabecalho: 'Historico', largura: 28, valor: (l) => l.contato.rotulo },
  { cabecalho: 'Google Maps', largura: 34, valor: (l) => l.mapsUri },
  { cabecalho: 'Latitude', largura: 12, valor: (l) => l.lat },
  { cabecalho: 'Longitude', largura: 12, valor: (l) => l.lng },
];

function rotuloSite(lead: LeadCompleto): string {
  const mapa: Record<LeadCompleto['websiteClasse'], string> = {
    sem_site: 'Sem site',
    rede_social: 'So rede social',
    site_google: 'Site gratis do Google',
    agendamento: 'So perfil em plataforma',
    marketplace: 'So marketplace',
    construtor: 'Site em construtor',
    proprio: 'Tem site proprio',
  };
  return mapa[lead.websiteClasse];
}

function celulaCsv(valor: string | number | null): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  // Aspas duplas viram duas aspas; qualquer separador ou quebra exige aspas.
  if (/[";\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function gerarCsv(leads: LeadCompleto[]): string {
  const linhas = [
    COLUNAS.map((c) => celulaCsv(c.cabecalho)).join(';'),
    ...leads.map((lead) => COLUNAS.map((c) => celulaCsv(c.valor(lead))).join(';')),
  ];
  // O ﻿ e o BOM que faz o Excel reconhecer UTF-8.
  return `﻿${linhas.join('\r\n')}\r\n`;
}

export async function gerarXlsx(leads: LeadCompleto[]): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  livro.creator = 'Search Leads';
  livro.created = new Date();

  const aba = livro.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  aba.columns = COLUNAS.map((c) => ({
    header: c.cabecalho,
    key: c.cabecalho,
    width: c.largura,
  }));

  const cabecalho = aba.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF16A34A' },
  };
  cabecalho.alignment = { vertical: 'middle' };
  cabecalho.height = 22;

  for (const lead of leads) {
    aba.addRow(COLUNAS.map((c) => c.valor(lead)));
  }

  aba.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUNAS.length },
  };

  const saida = await livro.xlsx.writeBuffer();
  return Buffer.from(saida);
}

export function nomeArquivo(extensao: string): string {
  const agora = new Date();
  const carimbo = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0'),
  ].join('-');
  return `leads-${carimbo}.${extensao}`;
}
