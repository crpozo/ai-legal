import { ejecutarAgente, MODELOS } from "../llm.js";
import { FichaSentencia, PatronesJuez, type JuezRaw } from "../schemas.js";
import { BASE } from "./prompts.js";

/** Agente 4. Una ficha por resolución: una llamada pequeña y barata por proceso. */
export async function ficharSentencias(juez: JuezRaw, cacheDir: string): Promise<FichaSentencia[]> {
  const fichas: FichaSentencia[] = [];
  for (const proceso of juez.procesos) {
    const ficha = await ejecutarAgente({
      agente: "ficha-sentencia",
      modelo: MODELOS.extraccion,
      esfuerzo: "low",
      cacheDir,
      schema: FichaSentencia,
      system: `${BASE}

Tu tarea: fichar una resolución judicial para compararla después con otras del mismo juez.
- "decision": cómo resolvió la pretensión principal.
- "normativa": cuerpos legales y artículos que la resolución invoca, tal como los cita.
- "jurisprudencia": precedentes y sentencias que cita. Vacío si no cita ninguno.
- "argumentacion": cómo construye el razonamiento, paso a paso y en pocas frases.
- "pruebas": elementos probatorios que trata como relevantes.
- "motivacion": cómo justifica la decisión.
- "criterioResolucion": la regla que, según esta resolución, decide el caso. Es lo que se comparará entre procesos.
- "citaTextual": el pasaje literal que mejor expresa ese criterio, copiado sin alterar.`,
      user: JSON.stringify(proceso, null, 2),
    });
    fichas.push({ ...ficha, numero: proceso.numero });
  }
  return fichas;
}

/** Agente 5. Compara las fichas y busca criterios reiterados, cambios y diferencias. */
export async function analizarPatrones(juez: JuezRaw, fichas: FichaSentencia[], cacheDir: string) {
  const porNumero = new Map(juez.procesos.map((p) => [p.numero, p]));
  const patrones = await ejecutarAgente({
    agente: "patrones-juez",
    modelo: MODELOS.reporte,
    esfuerzo: "high",
    cacheDir,
    schema: PatronesJuez,
    system: `${BASE}

Tu tarea: estudiar cómo este juez interpreta y aplica el derecho, a partir de las fichas de sus resoluciones. El estudio usará el análisis para preparar su estrategia y, cuando corresponda, para señalar al juez sus propios precedentes.
- "criteriosReiterados": reglas que aplica de forma consistente. "solidez" refleja cuántos procesos la respaldan y qué tan claro es el texto.
- "cambiosDeInterpretacion": temas donde resolvió distinto con el tiempo. Ordena "antes" y "despues" por fecha de resolución.
- "diferenciasEntreCasosSimilares": casos con hechos parecidos y resultados distintos. Explica qué los distingue o, si nada los distingue, dilo: esa es la inconsistencia que el estudio puede invocar.
- "recomendaciones": cómo conviene plantear un caso ante este juez según lo anterior.
- "limitaciones": lo que la muestra no permite concluir.
Cada hallazgo lista los números de proceso que lo sustentan. Un patrón necesita al menos dos procesos; con menos, va en limitaciones.`,
    user: JSON.stringify(
      {
        juez: juez.juez,
        filtros: juez.filtros,
        resoluciones: fichas.map((f) => ({ ...f, fechaResolucion: porNumero.get(f.numero)?.fechaResolucion, tipoAccion: porNumero.get(f.numero)?.tipoAccion, asunto: porNumero.get(f.numero)?.asunto })),
      },
      null,
      2,
    ),
  });
  const numeros = new Set(juez.procesos.map((p) => p.numero));
  const citados = [...patrones.criteriosReiterados, ...patrones.cambiosDeInterpretacion, ...patrones.diferenciasEntreCasosSimilares].flatMap((h) => h.procesos);
  const invalidos = citados.filter((n) => !numeros.has(n));
  if (invalidos.length) throw new Error(`El análisis cita procesos que no existen: ${[...new Set(invalidos)].join(", ")}`);
  return patrones;
}

/** Conteos que no necesitan un modelo: se calculan en código, gratis y sin margen de error. */
export function estadisticas(fichas: FichaSentencia[]) {
  const decisiones = new Map<FichaSentencia["decision"], number>();
  const normas = new Map<string, number>();
  for (const f of fichas) {
    decisiones.set(f.decision, (decisiones.get(f.decision) ?? 0) + 1);
    for (const norma of new Set(f.normativa.map((n) => n.norma.trim()))) normas.set(norma, (normas.get(norma) ?? 0) + 1);
  }
  const orden = <K>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total: fichas.length,
    porDecision: orden(decisiones).map(([decision, n]) => ({ decision, n })),
    normasMasCitadas: orden(normas).slice(0, 8).map(([norma, n]) => ({ norma, n })),
  };
}
