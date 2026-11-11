import { ejecutarAgente, MODELOS } from "../llm.js";
import {
  LoteActuaciones, ReporteCausa, SeleccionInstancia,
  type ActuacionAnalizada, type CausaRaw, type Instancia,
} from "../schemas.js";
import { BASE } from "./prompts.js";

/** Agente 1. El portal puede devolver varias carpetas para un mismo número: elige la correcta. */
export async function seleccionarInstancia(causa: CausaRaw, cacheDir: string) {
  const carpetas = causa.instancias.map(({ actuaciones, ...resto }) => ({
    ...resto,
    totalActuaciones: actuaciones.length,
    ultimaActuacion: actuaciones.map((a) => a.fecha).sort().at(-1) ?? null,
  }));
  const seleccion = await ejecutarAgente({
    agente: "seleccion-instancia",
    modelo: MODELOS.extraccion,
    esfuerzo: "low",
    cacheDir,
    schema: SeleccionInstancia,
    system: `${BASE}

Tu tarea: el portal devolvió varias carpetas (instancias o dependencias) para el mismo número de proceso. Elige la que el estudio debe seguir, guiándote sobre todo por la dependencia judicial que el abogado espera. Si el criterio del abogado no alcanza para decidir, elige la carpeta con actividad más reciente y marca la confianza como baja. En "otras" explica qué relación tiene cada carpeta restante con la elegida.`,
    user: JSON.stringify({ numero: causa.numero, criterioDelAbogado: causa.criterio, carpetas }, null, 2),
  });
  if (!causa.instancias.some((i) => i.id === seleccion.instanciaId)) {
    throw new Error(`El agente eligió una instancia inexistente: ${seleccion.instanciaId}`);
  }
  return seleccion;
}

const LOTE = 20;

/** Agente 2. Clasifica y resume cada actuación, en lotes para gastar pocas llamadas. */
export async function analizarActuaciones(instancia: Instancia, cacheDir: string): Promise<ActuacionAnalizada[]> {
  const resultado: ActuacionAnalizada[] = [];
  for (let i = 0; i < instancia.actuaciones.length; i += LOTE) {
    const lote = instancia.actuaciones.slice(i, i + LOTE);
    const salida = await ejecutarAgente({
      agente: "analisis-actuaciones",
      modelo: MODELOS.extraccion,
      esfuerzo: "low",
      cacheDir,
      schema: LoteActuaciones,
      system: `${BASE}

Tu tarea: clasificar y resumir cada actuación judicial del lote. Devuelve exactamente una entrada por actuación, con el mismo "id".
- "categoria": la que mejor describe la actuación. Usa "escrito_de_parte" para escritos presentados por las partes y "otro" cuando ninguna encaje.
- "resumen": dos o tres frases con lo que pasó.
- "disposiciones": lo que el juez ordena, una por elemento. Vacío si no ordena nada.
- "fechasClave": audiencias, términos o vencimientos que el texto fija, en formato AAAA-MM-DD cuando la fecha consta completa.
- "requiereAccion": verdadero solo si el estudio debe hacer algo a raíz de esta actuación. "accionSugerida" queda vacía cuando es falso.`,
      user: JSON.stringify(
        {
          proceso: { materia: instancia.materia, tipoAccion: instancia.tipoAccion, asunto: instancia.asunto, actores: instancia.actores, demandados: instancia.demandados },
          actuaciones: lote.map(({ id, fecha, tipo, texto }) => ({ id, fecha, tipo, texto })),
        },
        null,
        2,
      ),
    });
    const esperados = new Set(lote.map((a) => a.id));
    const recibidos = new Set(salida.actuaciones.map((a) => a.id));
    if (esperados.size !== recibidos.size || [...esperados].some((id) => !recibidos.has(id))) {
      throw new Error("El análisis de actuaciones no devolvió una entrada por cada actuación del lote.");
    }
    resultado.push(...salida.actuaciones);
  }
  return resultado;
}

/** Agente 3. Reporte integral de la causa a partir del expediente y del análisis previo. */
export async function reportarCausa(instancia: Instancia, analisis: ActuacionAnalizada[], cacheDir: string) {
  const porId = new Map(analisis.map((a) => [a.id, a]));
  const expediente = [...instancia.actuaciones]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((a) => ({
      id: a.id, fecha: a.fecha, tipo: a.tipo, texto: a.texto,
      categoria: porId.get(a.id)?.categoria,
      documentos: a.documentos.map((d) => ({ nombre: d.nombre, disponible: d.disponible })),
    }));
  const reporte = await ejecutarAgente({
    agente: "reporte-causa",
    modelo: MODELOS.reporte,
    esfuerzo: "medium",
    cacheDir,
    schema: ReporteCausa,
    system: `${BASE}

Tu tarea: redactar el reporte integral de seguimiento de la causa. Recibes el expediente en orden cronológico; la última actuación es la más reciente y es la que más importa.
- "resumenEjecutivo": un párrafo que un socio pueda leer en treinta segundos.
- "estadoActual" y "etapaProcesal": dónde está el proceso hoy y qué se espera a continuación.
- "ultimaActuacion": qué dispuso y qué implica para el cliente.
- "hitos": los momentos que cambiaron el curso del proceso, no todas las actuaciones.
- "plazos": solo los que constan en el expediente. "fechaLimite" en AAAA-MM-DD, o "no determinable" con la razón en "base".
- "alertas": riesgos concretos para el cliente, con su nivel.
- "documentosNoDisponibles": documentos que el portal lista pero no permite descargar.
Cada hito, plazo y alerta lleva el "actuacionId" de la actuación que lo sustenta, para que el abogado pueda verificarlo.`,
    user: JSON.stringify(
      {
        proceso: { dependencia: instancia.dependencia, fechaIngreso: instancia.fechaIngreso, materia: instancia.materia, tipoAccion: instancia.tipoAccion, asunto: instancia.asunto, actores: instancia.actores, demandados: instancia.demandados },
        expediente,
      },
      null,
      2,
    ),
  });
  const ids = new Set(instancia.actuaciones.map((a) => a.id));
  const citados = [reporte.ultimaActuacion.actuacionId, ...reporte.hitos.map((h) => h.actuacionId), ...reporte.plazos.map((p) => p.actuacionId), ...reporte.alertas.map((a) => a.actuacionId)];
  const invalidos = citados.filter((id) => !ids.has(id));
  if (invalidos.length) throw new Error(`El reporte cita actuaciones que no existen: ${[...new Set(invalidos)].join(", ")}`);
  return reporte;
}
