/**
 * Leitor de eventos do stream da busca.
 *
 * O navegador tem EventSource pronto para isso, mas EventSource so faz GET e a
 * busca precisa de POST com corpo. Entao lemos o stream na mao. O formato e o
 * mesmo do SSE: blocos separados por linha em branco, com `event:` e `data:`.
 */

export interface EventoStream {
  evento: string;
  dados: unknown;
}

export async function* lerEventos(
  corpo: ReadableStream<Uint8Array>,
): AsyncGenerator<EventoStream> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let restante = '';

  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;

      restante += decodificador.decode(value, { stream: true });

      // O ultimo pedaco pode estar cortado no meio; guarda para o proximo ciclo.
      const blocos = restante.split('\n\n');
      restante = blocos.pop() ?? '';

      for (const bloco of blocos) {
        const evento = analisar(bloco);
        if (evento) yield evento;
      }
    }

    const ultimo = analisar(restante);
    if (ultimo) yield ultimo;
  } finally {
    leitor.releaseLock();
  }
}

function analisar(bloco: string): EventoStream | null {
  const linhas = bloco.split('\n');
  let evento = 'message';
  const dados: string[] = [];

  for (const linha of linhas) {
    if (linha.startsWith('event:')) evento = linha.slice(6).trim();
    else if (linha.startsWith('data:')) dados.push(linha.slice(5).trim());
  }

  if (dados.length === 0) return null;

  try {
    return { evento, dados: JSON.parse(dados.join('\n')) };
  } catch {
    return null;
  }
}
