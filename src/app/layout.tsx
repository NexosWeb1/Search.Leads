import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Search Leads',
  description: 'Encontre comercios sem site na sua regiao e transforme em cliente.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef2f6' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

/**
 * Aplica o tema antes da primeira pintura.
 *
 * Sem isto a pagina pisca branca ao carregar no modo escuro, porque o React so
 * assume o controle depois da hidratacao. O script e minusculo e sincrono de
 * proposito: precisa rodar antes de o navegador desenhar qualquer coisa.
 */
const SCRIPT_TEMA = `
try {
  var salvo = localStorage.getItem('tema');
  var escuro = salvo ? salvo === 'escuro'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (escuro) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * suppressHydrationWarning aqui e obrigatorio, nao preguica.
     *
     * O script abaixo adiciona a classe `dark` no html antes do React hidratar,
     * que e justamente o que evita a pagina piscar branca ao carregar no tema
     * escuro. A consequencia e que o servidor manda uma classe e o cliente tem
     * outra, e o React reclama.
     *
     * O aviso vale so para os atributos deste elemento, nao para os filhos,
     * entao qualquer divergencia de verdade dentro da pagina continua sendo
     * reportada.
     */
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="h-full overflow-hidden antialiased">
        {/*
          Atalho de teclado para saltar a sidebar inteira, que tem dezenas de
          controles antes do mapa. Sem ele, chegar ao conteudo pelo teclado exige
          passar por todos.
        */}
        <a href="#conteudo" className="pular-para-conteudo">
          Pular para o conteudo
        </a>
        {children}
      </body>
    </html>
  );
}
