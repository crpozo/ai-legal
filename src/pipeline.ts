import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analizarActuaciones, reportarCausa, seleccionarInstancia } from "./agents/causa.js";
import { analizarPatrones, estadisticas, ficharSentencias } from "./agents/juez.js";
import { resumenDeUso } from "./llm.js";
import { CausaRaw, Dashboard, JuezRaw } from "./schemas.js";

/**
 * Uso: npm run agentes -- <dataset>      (dataset = carpeta dentro de data/, por defecto "real")
 * Lee data/<dataset>/raw/{causa,juez}.json y escribe data/<dataset>/processed/dashboard.json.
 */
const dataset = process.argv[2] ?? "real";
const base = path.join("data", dataset);
const cacheDir = path.join(base, "cache");
const leer = (archivo: string) => JSON.parse(readFileSync(path.join(base, "raw", archivo), "utf8"));

const causa = CausaRaw.parse(leer("causa.json"));
const juez = JuezRaw.parse(leer("juez.json"));

console.log(`Flujo I · causa ${causa.numero}`);
const seleccion = await seleccionarInstancia(causa, cacheDir);
const instancia = causa.instancias.find((i) => i.id === seleccion.instanciaId)!;
console.log(`  carpeta elegida: ${instancia.dependencia} (confianza ${seleccion.confianza})`);
const analisis = await analizarActuaciones(instancia, cacheDir);
console.log(`  ${analisis.length} actuaciones analizadas`);
const reporte = await reportarCausa(instancia, analisis, cacheDir);
console.log("  reporte integral listo");

console.log(`Flujo II · juez ${juez.juez.nombre}`);
const fichas = await ficharSentencias(juez, cacheDir);
console.log(`  ${fichas.length} resoluciones fichadas`);
const patrones = await analizarPatrones(juez, fichas, cacheDir);
console.log("  análisis de patrones listo");

const porId = new Map(analisis.map(({ id, ...resto }) => [id, resto]));
const porNumero = new Map(fichas.map(({ numero, ...resto }) => [numero, resto]));

const salida = Dashboard.parse({
  meta: { dataset, ficticio: dataset === "ejemplo", origen: "agentes", generadoEn: new Date().toISOString() },
  causa: {
    fuente: causa.fuente,
    numero: causa.numero,
    instancias: causa.instancias.map(({ actuaciones, ...resto }) => ({ ...resto, totalActuaciones: actuaciones.length })),
    seleccion,
    actuaciones: [...instancia.actuaciones]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((a) => ({ ...a, analisis: porId.get(a.id)! })),
    reporte,
  },
  juez: {
    fuente: juez.fuente,
    juez: juez.juez,
    filtros: juez.filtros,
    procesos: [...juez.procesos]
      .sort((a, b) => b.fechaResolucion.localeCompare(a.fechaResolucion))
      .map(({ resolucionTexto, ...p }) => ({ ...p, ficha: porNumero.get(p.numero)! })),
    estadisticas: estadisticas(fichas),
    patrones,
  },
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
