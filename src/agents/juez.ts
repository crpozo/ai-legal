import { ejecutarAgente, MODELOS } from "../llm.js";
import { FichaSentencia, PatronesJuez, type JuezRaw } from "../schemas.js";
import { BASE } from "./prompts.js";

type Proceso = JuezRaw["procesos"][number];
const PARALELO = 6;

/** Días entre el ingreso a la dependencia que resuelve y la resolución. */
export function diasEnResolver(p: Proceso): number | undefined {
  if (!p.fechaIngreso) return undefined;
  const dias = Math.round((Date.parse(p.fechaResolucion) - Date.parse(p.fechaIngreso)) / 86_400_000);
  return Number.isFinite(dias) && dias >= 0 ? dias : undefined;
}

/** Agente 4. Una ficha por resolución: llamadas pequeñas y baratas, varias a la vez. */
export async function ficharSentencias(juez: JuezRaw, cacheDir: string): Promise<FichaSentencia[]> {
  const fichas: FichaSentencia[] = new Array(juez.procesos.length);
  let siguiente = 0, hechas = 0;
  const trabajar = async () => {
    while (siguiente < juez.procesos.length) {
      const i = siguiente++;
      const proceso = juez.procesos[i]!;
      const ficha = await ejecutarAgente({
        agente: "ficha-sentencia",
        modelo: MODELOS.extraccion,
        esfuerzo: "low",
        cacheDir,
        schema: FichaSentencia,
        system: `${BASE}

Tu tarea: fichar una resolución judicial para compararla después con otras del mismo juez. El juez estudiado es ${juez.juez.nombre}; las resoluciones son de un tribunal de apelación en garantías jurisdiccionales.
- "decision": cómo quedó la pretensión del accionante tras esta resolución ("acepta" si la acción prospera, "rechaza" si se niega, "inadmite" si no se entra al fondo).
- "apelacion": qué hizo el tribunal con la sentencia de primera instancia: "confirma", "revoca" o "reforma". "no_aplica" si la resolución no decide una apelación.
- "derechosInvocados": derechos constitucionales que el accionante alega vulnerados.
- "fundamentosDeHecho": los hechos que el tribunal da por probados y sobre los que decide, en pocas frases.
- "normativa": cuerpos legales y artículos que la resolución invoca, tal como los cita.
- "jurisprudencia": precedentes y sentencias que cita, con su número. Vacío si no cita ninguno.
- "argumentacion": cómo construye el razonamiento, paso a paso y en pocas frases.
- "pruebas": elementos probatorios que trata como relevantes.
- "motivacion": cómo justifica la decisión.
- "criterioResolucion": la regla que, según esta resolución, decide el caso. Es lo que se comparará entre procesos.
- "citaTextual": el pasaje literal que mejor expresa ese criterio, copiado sin alterar y de no más de 60 palabras.
- "esPonente": "si" cuando el texto identifica al juez estudiado como ponente, "no" cuando identifica a otro, "no_consta" en lo demás.
- "votoSalvado": verdadero solo si el texto registra un voto salvado o concurrente.`,
        user: JSON.stringify(proceso, null, 2),
      });
      fichas[i] = { ...ficha, numero: proceso.numero };
      hechas += 1;
      if (hechas % 20 === 0) console.log(`    ${hechas}/${juez.procesos.length} resoluciones fichadas`);
    }
  };
  await Promise.all(Array.from({ length: PARALELO }, trabajar));
  return fichas;
}

/** Agente 5. Compara las fichas y busca criterios reiterados, cambios y diferencias. */
export async function analizarPatrones(juez: JuezRaw, fichas: FichaSentencia[], cacheDir: string) {
  const porNumero = new Map(juez.procesos.map((p) => [p.numero, p]));
  const stats = estadisticas(juez, fichas);
  const patrones = await ejecutarAgente({
    agente: "patrones-juez",
    modelo: MODELOS.reporte,
    esfuerzo: "medium",
    maxTokens: 21000,
    cacheDir,
    schema: PatronesJuez,
    system: `${BASE}

Tu tarea: estudiar cómo este juez interpreta y aplica el derecho, a partir de las fichas de las resoluciones de segunda instancia en las que intervino. El estudio usará el análisis para preparar su estrategia y, cuando corresponda, para señalar al juez sus propios precedentes.
- "resumenEjecutivo": un párrafo que un socio pueda leer en treinta segundos.
- "criterioPorAccion": para cada tipo de acción con suficientes casos (acción de protección, hábeas corpus, etc.), el criterio con que resuelve y los fundamentos de derecho y de hecho que usa habitualmente.
- "criteriosReiterados": reglas que aplica de forma consistente. "solidez" refleja cuántos procesos la respaldan y qué tan claro es el texto.
- "cambiosDeInterpretacion": temas donde resolvió distinto con el tiempo. Ordena "antes" y "despues" por fecha de resolución.
- "diferenciasEntreCasosSimilares": casos con hechos parecidos y resultados distintos. Explica qué los distingue o, si nada los distingue, dilo: esa es la inconsistencia que el estudio puede invocar.
- "senalesDeArbitrariedad": indicios concretos de trato desigual o de decisiones sin sustento en el propio criterio del tribunal. Vacío si las fichas no los muestran; no lo llenes con sospechas.
- "lecturaDeTiempos": qué dicen las estadísticas de tiempos que recibes (promedio, mediana y anomalías) y si las demoras anómalas se asocian a algún tipo de caso.
- "recomendaciones": cómo conviene plantear un caso ante este juez según lo anterior.
- "limitaciones": lo que la muestra no permite concluir. Las resoluciones son de un tribunal de tres jueces: distingue cuando conste quién es el ponente.
Cada hallazgo lista los números de proceso que lo sustentan, hasta ocho por hallazgo, los más claros primero. Un patrón necesita al menos dos procesos; con menos, va en limitaciones.`,
    user: JSON.stringify(
      {
        juez: juez.juez,
        filtros: juez.filtros,
        estadisticas: stats,
        resoluciones: fichas.map((f) => {
          const p = porNumero.get(f.numero)!;
          return {
            numero: f.numero, fechaResolucion: p.fechaResolucion.slice(0, 10), accion: p.asunto, dias: diasEnResolver(p), resultadoPortal: p.resultadoPortal,
            decision: f.decision, apelacion: f.apelacion, esPonente: f.esPonente, derechos: f.derechosInvocados.slice(0, 4),
            hechos: f.fundamentosDeHecho, criterio: f.criterioResolucion, precedentes: f.jurisprudencia.slice(0, 5),
          };
        }),
      },
      null,
      1,
    ),
  });
  const numeros = new Set(juez.procesos.map((p) => p.numero));
  const citados = [...patrones.criteriosReiterados, ...patrones.cambiosDeInterpretacion, ...patrones.diferenciasEntreCasosSimilares, ...patrones.criterioPorAccion, ...patrones.senalesDeArbitrariedad].flatMap((h) => h.procesos);
  const invalidos = citados.filter((n) => !numeros.has(n));
  if (invalidos.length) throw new Error(`El análisis cita procesos que no existen: ${[...new Set(invalidos)].join(", ")}`);
  return patrones;
}

const percentil = (xs: number[], p: number) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length ? o[Math.min(o.length - 1, Math.floor(p * o.length))]! : 0;
};

/** Conteos y tiempos que no necesitan un modelo: se calculan en código, gratis y sin margen de error. */
export function estadisticas(juez: JuezRaw, fichas: FichaSentencia[]) {
  const porNumero = new Map(juez.procesos.map((p) => [p.numero, p]));
  const cuenta = <K>(claves: K[]) => {
    const m = new Map<K, number>();
    for (const k of claves) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const tiempos = fichas.map((f) => ({ f, p: porNumero.get(f.numero)!, dias: diasEnResolver(porNumero.get(f.numero)!) })).filter((x): x is typeof x & { dias: number } => x.dias !== undefined);
  const dias = tiempos.map((t) => t.dias);
  const q1 = percentil(dias, 0.25), q3 = percentil(dias, 0.75);
  const umbral = Math.round(q3 + 1.5 * (q3 - q1));
  const acciones = [...new Set(juez.procesos.map((p) => p.asunto))];
  return {
    total: fichas.length,
    porDecision: cuenta(fichas.map((f) => f.decision)).map(([decision, n]) => ({ decision, n })),
    normasMasCitadas: cuenta(fichas.flatMap((f) => [...new Set(f.normativa.map((n) => n.norma.trim()))])).slice(0, 8).map(([norma, n]) => ({ norma, n })),
    porApelacion: cuenta(fichas.map((f) => f.apelacion)).map(([apelacion, n]) => ({ apelacion, n })),
    porAccion: acciones.map((accion) => {
      const suyas = fichas.filter((f) => porNumero.get(f.numero)!.asunto === accion);
      return {
        accion, n: suyas.length,
        aceptadas: suyas.filter((f) => f.decision === "acepta" || f.decision === "acepta_parcialmente").length,
        medianaDias: percentil(tiempos.filter((t) => t.p.asunto === accion).map((t) => t.dias), 0.5),
      };
    }).sort((a, b) => b.n - a.n),
    tiempos: {
      muestras: dias.length,
      promedioDias: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 0,
      medianaDias: percentil(dias, 0.5), p90Dias: percentil(dias, 0.9), maxDias: dias.length ? Math.max(...dias) : 0,
      umbralAnomalia: umbral,
      porAnio: [...new Set(tiempos.map((t) => t.p.fechaResolucion.slice(0, 4)))].sort().map((anio) => {
        const xs = tiempos.filter((t) => t.p.fechaResolucion.startsWith(anio)).map((t) => t.dias);
        return { anio, muestras: xs.length, medianaDias: percentil(xs, 0.5) };
      }),
      anomalias: tiempos.filter((t) => t.dias > umbral).sort((a, b) => b.dias - a.dias).slice(0, 15).map((t) => ({ numero: t.f.numero, dias: t.dias, asunto: t.p.asunto })),
    },
  };
}
