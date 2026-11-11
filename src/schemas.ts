import { z } from "zod";

/* ───────────── Datos capturados del portal (entrada de los agentes) ───────────── */

export const Fuente = z.object({
  portal: z.string(),
  url: z.string(),
  capturadoEn: z.string(),
  metodo: z.string(),
});

export const Documento = z.object({
  nombre: z.string(),
  disponible: z.boolean(),
  archivo: z.string().optional(),
});

export const Actuacion = z.object({
  id: z.string(),
  fecha: z.string(),
  tipo: z.string(),
  texto: z.string(),
  documentos: z.array(Documento).default([]),
});

export const Instancia = z.object({
  id: z.string(),
  dependencia: z.string(),
  ciudad: z.string().optional(),
  fechaIngreso: z.string(),
  materia: z.string(),
  tipoAccion: z.string(),
  asunto: z.string(),
  actores: z.array(z.string()),
  demandados: z.array(z.string()),
  actuaciones: z.array(Actuacion),
});

export const CausaRaw = z.object({
  fuente: Fuente,
  numero: z.string(),
  /** Lo que el abogado sabe del caso: sirve para elegir la carpeta correcta. */
  criterio: z.object({
    dependenciaEsperada: z.string().optional(),
    parte: z.string().optional(),
    nota: z.string().optional(),
  }),
  instancias: z.array(Instancia).min(1),
});

export const ProcesoJuez = z.object({
  numero: z.string(),
  dependencia: z.string(),
  materia: z.string(),
  tipoAccion: z.string(),
  asunto: z.string(),
  fechaResolucion: z.string(),
  partes: z.string(),
  resolucionTexto: z.string(),
});

export const JuezRaw = z.object({
  fuente: Fuente,
  juez: z.object({ nombre: z.string(), cedula: z.string().optional() }),
  filtros: z.object({
    materia: z.string().optional(),
    tipoAccion: z.string().optional(),
    asunto: z.string().optional(),
    desde: z.string().optional(),
    hasta: z.string().optional(),
  }),
  procesos: z.array(ProcesoJuez).min(1),
});

/* ───────────── Salidas de los agentes ───────────── */

export const Confianza = z.enum(["alta", "media", "baja"]);

/** Agente 1: elige la carpeta (instancia) correcta entre las que devuelve el portal. */
export const SeleccionInstancia = z.object({
  instanciaId: z.string(),
  justificacion: z.string(),
  confianza: Confianza,
  otras: z.array(z.object({ instanciaId: z.string(), relacion: z.string() })),
});

export const CategoriaActuacion = z.enum([
  "auto_sustanciacion",
  "providencia",
  "razon_notificacion",
  "citacion",
  "sentencia",
  "convocatoria_audiencia",
  "archivo",
  "recurso",
  "escrito_de_parte",
  "otro",
]);

/** Agente 2: clasifica y resume cada actuación. */
export const ActuacionAnalizada = z.object({
  id: z.string(),
  categoria: CategoriaActuacion,
  resumen: z.string(),
  disposiciones: z.array(z.string()),
  fechasClave: z.array(z.object({ fecha: z.string(), concepto: z.string() })),
  requiereAccion: z.boolean(),
  accionSugerida: z.string(),
});
export const LoteActuaciones = z.object({ actuaciones: z.array(ActuacionAnalizada) });

/** Agente 3: reporte integral de la causa. Cada afirmación cita actuaciones por id. */
export const ReporteCausa = z.object({
  resumenEjecutivo: z.string(),
  etapaProcesal: z.string(),
  estadoActual: z.string(),
  ultimaActuacion: z.object({
    actuacionId: z.string(),
    resumen: z.string(),
    implicaciones: z.string(),
  }),
  hitos: z.array(z.object({ fecha: z.string(), hito: z.string(), actuacionId: z.string() })),
  plazos: z.array(
    z.object({
      descripcion: z.string(),
      fechaLimite: z.string(),
      base: z.string(),
      actuacionId: z.string(),
    }),
  ),
  alertas: z.array(
    z.object({ nivel: z.enum(["alta", "media", "baja"]), texto: z.string(), actuacionId: z.string() }),
  ),
  proximosPasos: z.array(z.string()),
  documentosNoDisponibles: z.array(z.string()),
});

export const Decision = z.enum(["acepta", "acepta_parcialmente", "rechaza", "inadmite", "otro"]);

/** Agente 4: ficha de una resolución del juez. */
export const FichaSentencia = z.object({
  numero: z.string(),
  decision: Decision,
  normativa: z.array(z.object({ norma: z.string(), articulos: z.array(z.string()) })),
  jurisprudencia: z.array(z.string()),
  argumentacion: z.string(),
  pruebas: z.array(z.string()),
  motivacion: z.string(),
  criterioResolucion: z.string(),
  citaTextual: z.string(),
});

/** Agente 5: patrones entre las resoluciones del juez. */
export const PatronesJuez = z.object({
  resumenEjecutivo: z.string(),
  criteriosReiterados: z.array(
    z.object({ criterio: z.string(), procesos: z.array(z.string()), solidez: Confianza }),
  ),
  cambiosDeInterpretacion: z.array(
    z.object({ tema: z.string(), antes: z.string(), despues: z.string(), procesos: z.array(z.string()) }),
  ),
  diferenciasEntreCasosSimilares: z.array(
    z.object({ descripcion: z.string(), procesos: z.array(z.string()), utilidadEstrategica: z.string() }),
  ),
  recomendaciones: z.array(z.string()),
  limitaciones: z.array(z.string()),
});

/* ───────────── Archivo que lee el dashboard ───────────── */

export const UsoAgente = z.object({
  agente: z.string(),
  modelo: z.string(),
  llamadas: z.number(),
  desdeCache: z.number(),
  tokensEntrada: z.number(),
  tokensSalida: z.number(),
  usd: z.number(),
});

export const Dashboard = z.object({
  meta: z.object({
    dataset: z.string(),
    ficticio: z.boolean(),
    /** "agentes" = generado por el pipeline. "ejemplo-manual" = maqueta escrita a mano. */
    origen: z.enum(["agentes", "ejemplo-manual"]),
    generadoEn: z.string(),
  }),
  causa: z.object({
    fuente: Fuente,
    numero: z.string(),
    instancias: z.array(Instancia.omit({ actuaciones: true }).extend({ totalActuaciones: z.number() })),
    seleccion: SeleccionInstancia,
    actuaciones: z.array(Actuacion.extend({ analisis: ActuacionAnalizada.omit({ id: true }) })),
    reporte: ReporteCausa,
  }).optional(),
  juez: z.object({
    fuente: Fuente,
    juez: JuezRaw.shape.juez,
    filtros: JuezRaw.shape.filtros,
    procesos: z.array(ProcesoJuez.omit({ resolucionTexto: true }).extend({ ficha: FichaSentencia.omit({ numero: true }) })),
    estadisticas: z.object({
      total: z.number(),
      porDecision: z.array(z.object({ decision: Decision, n: z.number() })),
      normasMasCitadas: z.array(z.object({ norma: z.string(), n: z.number() })),
    }),
    patrones: PatronesJuez,
  }).optional(),
  costos: z.object({ porAgente: z.array(UsoAgente), totalUsd: z.number() }),
});

export type CausaRaw = z.infer<typeof CausaRaw>;
export type JuezRaw = z.infer<typeof JuezRaw>;
export type Instancia = z.infer<typeof Instancia>;
export type Actuacion = z.infer<typeof Actuacion>;
export type ActuacionAnalizada = z.infer<typeof ActuacionAnalizada>;
export type FichaSentencia = z.infer<typeof FichaSentencia>;
export type Dashboard = z.infer<typeof Dashboard>;
export type UsoAgente = z.infer<typeof UsoAgente>;
