import { ejecutarAgente, MODELOS } from "../llm.js";
import type { z } from "zod";
import {
  Borradores, ReporteCliente, Respuestas,
  type ActuacionAnalizada, type CausaRaw, type Instancia, type ReporteCausa as EsquemaReporte,
} from "../schemas.js";

type ReporteCausa = z.infer<typeof EsquemaReporte>;
import { BASE } from "./prompts.js";

const ficha = (i: Instancia) => ({ dependencia: i.dependencia, fechaIngreso: i.fechaIngreso, materia: i.materia, tipoAccion: i.tipoAccion, asunto: i.asunto, actores: i.actores, demandados: i.demandados });

/** Reporte para el cliente: el mismo estado del proceso, sin jerga. */
export function reportarAlCliente(causa: CausaRaw, instancia: Instancia, reporte: ReporteCausa, cacheDir: string) {
  return ejecutarAgente({
    agente: "reporte-cliente",
    modelo: MODELOS.reporte,
    esfuerzo: "medium",
    cacheDir,
    schema: ReporteCliente,
    system: `${BASE}

Tu tarea: escribir el mensaje de estado que el estudio envía a su cliente, que no es abogado. Recibes el reporte interno ya verificado.
- Lenguaje llano: explica cada término procesal la primera vez que aparece o evítalo.
- "asunto": la línea de asunto del correo. "parrafos": de tres a cinco párrafos cortos con dónde está el caso, qué pasó últimamente y qué significa para el cliente. "proximosPasos": lo que hará el estudio y lo que se necesita del cliente. "cierre": una frase de cierre.
- No prometas resultados ni fechas que el reporte no fija. Si el reporte dice que algo no consta, dilo con sencillez.
- El campo "cliente" indica cómo identifica el estudio a su cliente; si no coincide con claridad con una de las partes, escribe sin afirmar de qué lado está.`,
    user: JSON.stringify({ numero: causa.numero, cliente: causa.criterio.parte ?? null, proceso: ficha(instancia), reporteInterno: reporte }, null, 2),
  });
}

/** Borradores de escritos a partir de las últimas actuaciones. */
export async function redactarBorradores(causa: CausaRaw, instancia: Instancia, analisis: ActuacionAnalizada[], reporte: ReporteCausa, cacheDir: string) {
  const porId = new Map(analisis.map((a) => [a.id, a]));
  const recientes = [...instancia.actuaciones].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10)
    .map((a) => ({ id: a.id, fecha: a.fecha, tipo: a.tipo, texto: a.texto, analisis: porId.get(a.id) }));
  const salida = await ejecutarAgente({
    agente: "borradores-escritos",
    modelo: MODELOS.reporte,
    esfuerzo: "medium",
    cacheDir,
    schema: Borradores,
    system: `${BASE}

Tu tarea: proponer hasta dos borradores de escritos que el estado actual del proceso justifica presentar, para que un abogado los revise y firme.
- Cada borrador responde a una actuación concreta: pon su id en "actuacionId" y explica en "porQueAhora" por qué conviene presentarlo.
- "texto": el escrito completo en el formato habitual de la práctica ecuatoriana (encabezado dirigido al juez de la causa, identificación del proceso, comparecencia, petición numerada, firma de abogado). Cita solo normas que consten en el expediente recibido.
- Lo que no conste (nombre del abogado, matrícula, casillero, calidad en que comparece el cliente) va entre corchetes, por ejemplo [NOMBRE DEL ABOGADO], y se lista en "datosPorCompletar".
- El campo "cliente" indica cómo identifica el estudio a su cliente. Si no coincide con claridad con una de las partes, redacta desde la posición que ese nombre sugiere y adviértelo en "datosPorCompletar".
- No inventes hechos, fechas ni anexos.`,
    user: JSON.stringify({ numero: causa.numero, cliente: causa.criterio.parte ?? null, proceso: ficha(instancia), reporte, actuacionesRecientes: recientes }, null, 2),
  });
  const ids = new Set(instancia.actuaciones.map((a) => a.id));
  const invalidos = salida.borradores.map((b) => b.actuacionId).filter((id) => !ids.has(id));
  if (invalidos.length) throw new Error(`Un borrador cita actuaciones que no existen: ${invalidos.join(", ")}`);
  return salida.borradores;
}

export const PREGUNTAS = [
  "¿Qué demandados están citados y cuáles faltan?",
  "¿Por qué se anularon o dejaron sin efecto las citaciones anteriores?",
  "¿Qué ha dicho el juez sobre el archivo de la causa?",
  "¿Qué ordenó la última providencia con contenido y a quién?",
  "¿Qué se sabe de la contestación y la reconvención presentadas?",
  "¿Dónde se ha demorado más el proceso y por qué?",
];

/** Respuestas a las preguntas frecuentes del expediente, apoyadas en el resumen de cada actuación. */
export async function responderPreguntas(instancia: Instancia, analisis: ActuacionAnalizada[], reporte: ReporteCausa, cacheDir: string) {
  const porId = new Map(analisis.map((a) => [a.id, a]));
  const indice = [...instancia.actuaciones].sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((a) => ({ id: a.id, fecha: a.fecha, categoria: porId.get(a.id)?.categoria, resumen: porId.get(a.id)?.resumen }));
  const salida = await ejecutarAgente({
    agente: "preguntas-expediente",
    modelo: MODELOS.reporte,
    esfuerzo: "medium",
    cacheDir,
    schema: Respuestas,
    system: `${BASE}

Tu tarea: responder preguntas de un abogado sobre el expediente. Recibes el reporte integral y un índice con el resumen de cada actuación en orden cronológico.
- Una respuesta por pregunta, con la misma redacción de la pregunta en "pregunta".
- Respuestas directas, de un párrafo, con fechas. Si el expediente no permite responder, dilo.
- "actuacionIds": de una a seis actuaciones que sustentan la respuesta, las más relevantes primero.`,
    user: JSON.stringify({ proceso: ficha(instancia), reporte, preguntas: PREGUNTAS, indice }, null, 2),
  });
  const ids = new Set(instancia.actuaciones.map((a) => a.id));
  const validas = salida.respuestas.every((r) => PREGUNTAS.includes(r.pregunta) && r.actuacionIds.every((id) => ids.has(id)));
  if (salida.respuestas.length !== PREGUNTAS.length || !validas) throw new Error("Las respuestas no corresponden a las preguntas o citan actuaciones inexistentes.");
  return salida.respuestas;
}

/** Tiempo de despacho, calculado en código: días entre un escrito de parte y el siguiente auto o providencia. */
export function tiemposDeDespacho(instancia: Instancia, analisis: ActuacionAnalizada[]) {
  const porId = new Map(analisis.map((a) => [a.id, a.categoria]));
  const orden = [...instancia.actuaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const muestras: Array<{ anio: string; dias: number }> = [];
  let pendiente: string | undefined;
  for (const a of orden) {
    const categoria = porId.get(a.id);
    if (categoria === "escrito_de_parte") pendiente ??= a.fecha;
    else if (pendiente && (categoria === "auto_sustanciacion" || categoria === "providencia")) {
      const dias = Math.round((Date.parse(a.fecha) - Date.parse(pendiente)) / 86_400_000);
      if (Number.isFinite(dias) && dias >= 0) muestras.push({ anio: pendiente.slice(0, 4), dias });
      pendiente = undefined;
    }
  }
  const percentil = (xs: number[], p: number) => {
    const o = [...xs].sort((a, b) => a - b);
    return o.length ? o[Math.min(o.length - 1, Math.floor(p * o.length))]! : 0;
  };
  const dias = muestras.map((m) => m.dias);
  const anios = [...new Set(muestras.map((m) => m.anio))].sort();
  return {
    muestras: dias.length,
    medianaDias: percentil(dias, 0.5),
    p90Dias: percentil(dias, 0.9),
    maxDias: dias.length ? Math.max(...dias) : 0,
    porAnio: anios.map((anio) => {
      const delAnio = muestras.filter((m) => m.anio === anio).map((m) => m.dias);
      return { anio, muestras: delAnio.length, medianaDias: percentil(delAnio, 0.5) };
    }),
  };
}
