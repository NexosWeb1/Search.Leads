import { Suspense } from 'react';
import type { Metadata } from 'next';
import { FormularioEntrada } from './formulario';

export const metadata: Metadata = { title: 'Entrar | Search Leads' };

export default function PaginaEntrar() {
  return (
    <main className="grid min-h-full place-items-center bg-fundo-app p-4">
      <Suspense>
        <FormularioEntrada />
      </Suspense>
    </main>
  );
}
