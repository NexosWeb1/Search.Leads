/**
 * Executa as tarefas com no maximo `limite` em voo ao mesmo tempo.
 *
 * A concorrencia existe por dois motivos: a varredura tem dezenas de chamadas
 * independentes e seria lenta em serie, mas disparar todas de uma vez faz a
 * Places API devolver 429. Seis simultaneas e o ponto onde a varredura fica
 * rapida sem levar throttling.
 *
 * As tarefas recebem o indice para poderem reportar progresso.
 */
export async function comLimite<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const resultados: Array<PromiseSettledResult<R>> = new Array(itens.length);
  let proximo = 0;

  const trabalhador = async (): Promise<void> => {
    while (proximo < itens.length) {
      // JavaScript e mono-thread, entao ler e incrementar aqui nao tem corrida.
      const i = proximo++;
      try {
        resultados[i] = { status: 'fulfilled', value: await tarefa(itens[i], i) };
      } catch (motivo) {
        resultados[i] = { status: 'rejected', reason: motivo };
      }
    }
  };

  const trabalhadores = Array.from(
    { length: Math.max(1, Math.min(limite, itens.length)) },
    trabalhador,
  );

  await Promise.all(trabalhadores);
  return resultados;
}
