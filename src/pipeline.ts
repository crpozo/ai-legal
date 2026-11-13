import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analizarActuaciones, reportarCausa, seleccionarInstancia } from "./agents/causa.js";
import { redactarBorradores, reportarAlCliente, responderPreguntas, tiemposDeDespacho } from "./agents/extras.js";
import { reportarFiscalia } from "./agents/fiscalia.js";
import { analizarPatrones, diasEnResolver, estadisticas, ficharSentencias } from "./agents/juez.js";
import { resumenDeUso } from "./llm.js";
import { CausaRaw, Dashboard, FiscaliaRaw, JuezRaw } from "./schemas.js";

/**
 * Uso: npm run agentes -- <dataset>      (dataset = carpeta dentro de data/, por defecto "real")
 * Lee data/<dataset>/raw/{causa,juez,fiscalia}.json y escribe data/<dataset>/processed/dashboard.json.
 * Cada flujo corre si su archivo existe, así se puede avanzar con uno mientras se captura el otro.
 */
const dataset = process.argv[2] ?? "real";
const base = path.join("data", dataset);
const cacheDir = path.join(base, "cache");
const leer = (archivo: string) => {
  const ruta = path.join(base, "raw", archivo);
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : undefined;
};

async function flujoCausa(crudo: unknown) {
  const causa = CausaRaw.parse(crudo);
  console.log(`Flujo I · causa ${causa.numero}`);
  const seleccion = await seleccionarInstancia(causa, cacheDir);
  const instancia = causa.instancias.find((i) => i.id === seleccion.instanciaId)!;
  console.log(`  carpeta elegida: ${instancia.dependencia} (confianza ${seleccion.confianza})`);
  const analisis = await analizarActuaciones(instancia, cacheDir);
  console.log(`  ${analisis.length} actuaciones analizadas`);
  const reporte = await reportarCausa(instancia, analisis, cacheDir);
  console.log("  reporte integral listo");
  const [cliente, borradores, preguntas] = await Promise.all([
    reportarAlCliente(causa, instancia, reporte, cacheDir),
    redactarBorradores(causa, instancia, analisis, reporte, cacheDir),
    responderPreguntas(instancia, analisis, reporte, cacheDir),
  ]);
  console.log(`  reporte para el cliente, ${borradores.length} borradores y ${preguntas.length} respuestas listos`);
  const porId = new Map(analisis.map(({ id, ...resto }) => [id, resto]));
  return {
    fuente: causa.fuente,
    numero: causa.numero,
    instancias: causa.instancias.map(({ actuaciones, ...resto }) => ({ ...resto, totalActuaciones: actuaciones.length })),
    seleccion,
    actuaciones: [...instancia.actuaciones]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((a) => ({ ...a, analisis: porId.get(a.id)! })),
    reporte,
    extras: { cliente, borradores, preguntas, despacho: tiemposDeDespacho(instancia, analisis) },
  };
}

async function flujoJuez(crudo: unknown) {
  const juez = JuezRaw.parse(crudo);
  console.log(`Flujo II · juez ${juez.juez.nombre}`);
  const fichas = await ficharSentencias(juez, cacheDir);
  console.log(`  ${fichas.length} resoluciones fichadas`);
  const patrones = await analizarPatrones(juez, fichas, cacheDir);
  console.log("  análisis de patrones listo");
  const porNumero = new Map(fichas.map(({ numero, ...resto }) => [numero, resto]));
  return {
    fuente: juez.fuente,
    juez: juez.juez,
    filtros: juez.filtros,
    procesos: [...juez.procesos]
      .sort((a, b) => b.fechaResolucion.localeCompare(a.fechaResolucion))
      .map((p) => { const { resolucionTexto, ...resto } = p; return { ...resto, dias: diasEnResolver(p), ficha: porNumero.get(p.numero)! }; }),
    estadisticas: estadisticas(juez, fichas),
    patrones,
  };
}

async function flujoFiscalia(crudo: unknown) {
  const fiscalia = FiscaliaRaw.parse(crudo);
  console.log(`Fiscalía · ${fiscalia.consulta.criterio} ${fiscalia.consulta.valor}`);
  const reporte = await reportarFiscalia(fiscalia, cacheDir);
  console.log(`  ${fiscalia.noticias.length} noticias del delito reportadas`);
  return { ...fiscalia, reporte };
}

const causaCruda = leer("causa.json");
const juezCrudo = leer("juez.json");
const fiscaliaCruda = leer("fiscalia.json");
if (!causaCruda && !juezCrudo && !fiscaliaCruda) throw new Error(`No hay datos capturados en ${path.join(base, "raw")}.`);

const salida = Dashboard.parse({
  meta: { dataset, ficticio: dataset === "ejemplo", origen: "agentes", generadoEn: new Date().toISOString() },
  causa: causaCruda ? await flujoCausa(causaCruda) : undefined,
  juez: juezCrudo ? await flujoJuez(juezCrudo) : undefined,
  fiscalia: fiscaliaCruda ? await flujoFiscalia(fiscaliaCruda) : undefined,
  costos: resumenDeUso(),
});

mkdirSync(path.join(base, "processed"), { recursive: true });
const destino = path.join(base, "processed", "dashboard.json");
writeFileSync(destino, JSON.stringify(salida, null, 2));

const { porAgente, totalUsd } = salida.costos;
console.log("\nCosto de la corrida");
for (const a of porAgente) {
  console.log(`  ${a.agente.padEnd(22)} ${a.modelo.padEnd(30)} ${String(a.llamadas).padStart(3)} llamadas (${a.desdeCache} de caché)  $${a.usd.toFixed(4)}`);
}
console.log(`  Total: $${totalUsd.toFixed(4)}  →  ${destino}`);
