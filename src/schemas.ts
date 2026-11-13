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

/** Noticia del delito tal como la muestra la consulta pública de la Fiscalía (SIAF). */
export const NoticiaDelito = z.object({
  numero: z.string(),
  /** Falso cuando solo se conoce el número y el detalle no se capturó. */
  detalleDisponible: z.boolean(),
  lugar: z.string().optional(),
  fecha: z.string().optional(),
  hora: z.string().optional(),
  digitador: z.string().optional(),
  nroOficio: z.string().optional(),
  tipoIncidente: z.string().optional(),
  delito: z.string().optional(),
  unidad: z.string().optional(),
  numFiscalia: z.string().optional(),
  sujetos: z.array(z.object({ cedula: z.string().optional(), nombre: z.string(), estado: z.string() })),
  vehiculos: z.array(z.object({ marca: z.string(), modelo: z.string(), placa: z.string() })),
});
export type NoticiaDelito = z.infer<typeof NoticiaDelito>;

export const FiscaliaRaw = z.object({
  fuente: Fuente,
  consulta: z.object({ criterio: z.string(), valor: z.string(), persona: z.string().optional() }),
  noticias: z.array(NoticiaDelito),
});
export type FiscaliaRaw = z.infer<typeof FiscaliaRaw>;

export const ReporteFiscalia = z.object({
  resumenEjecutivo: z.string(),
  noticias: z.array(
    z.object({
      numero: z.string(),
      rolDeLaPersona: z.enum(["denunciante", "sospechoso", "victima", "otro", "no_consta"]),
      resumen: z.string(),
      queVerificar: z.string(),
    }),
  ),
  alertas: z.array(z.object({ nivel: z.enum(["alta", "media", "baja"]), texto: z.string(), numero: z.string() })),
  proximosPasos: z.array(z.string()),
  limitaciones: z.array(z.string()),
});
export type ReporteFiscalia = z.infer<typeof ReporteFiscalia>;

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

/** Reporte de estado en lenguaje llano, para enviar al cliente. */
export const ReporteCliente = z.object({
  asunto: z.string(),
  parrafos: z.array(z.string()),
  proximosPasos: z.array(z.string()),
  cierre: z.string(),
});
export type ReporteCliente = z.infer<typeof ReporteCliente>;

/** Borradores de escritos que el expediente justifica presentar ahora. */
export const Borradores = z.object({
  borradores: z.array(
    z.object({
      titulo: z.string(),
      porQueAhora: z.string(),
      actuacionId: z.string(),
      texto: z.string(),
      datosPorCompletar: z.array(z.string()),
    }),
  ),
});
export type Borradores = z.infer<typeof Borradores>;

/** Respuestas a preguntas frecuentes sobre el expediente, con las actuaciones que las sustentan. */
export const Respuestas = z.object({
  respuestas: z.array(z.object({ pregunta: z.string(), respuesta: z.string(), actuacionIds: z.array(z.string()) })),
});
export type Respuestas = z.infer<typeof Respuestas>;

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
    extras: z.object({
      cliente: ReporteCliente,
      borradores: Borradores.shape.borradores,
      preguntas: Respuestas.shape.respuestas,
      despacho: z.object({
        muestras: z.number(),
        medianaDias: z.number(),
        p90Dias: z.number(),
        maxDias: z.number(),
        porAnio: z.array(z.object({ anio: z.string(), muestras: z.number(), medianaDias: z.number() })),
      }),
    }).optional(),
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
  fiscalia: z.object({
    fuente: Fuente,
    consulta: FiscaliaRaw.shape.consulta,
    noticias: z.array(NoticiaDelito),
    reporte: ReporteFiscalia,
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
