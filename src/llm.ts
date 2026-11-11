import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { UsoAgente } from "./schemas.js";

const BEDROCK = process.env.LLM_PROVIDER === "bedrock";

/**
 * Dos niveles de modelo. La extracción son muchas llamadas pequeñas y mecánicas;
 * el reporte son una o dos llamadas de síntesis donde la calidad sí pesa.
 */
export const MODELOS = {
  extraccion: process.env.MODEL_EXTRACCION ?? (BEDROCK ? "us.anthropic.claude-haiku-5-5" : "claude-haiku-5-5"),
  reporte: process.env.MODEL_REPORTE ?? (BEDROCK ? "us.anthropic.claude-opus-5-5" : "claude-opus-5-5"),
};

/** USD por millón de tokens (entrada, salida). Tarifas de la API de Anthropic. */
const PRECIOS: Array<[RegExp, number, number]> = [
  [/haiku-5-5/, 0.1, 0.5],
  [/sonnet-5-5/, 2, 10],
  [/opus-5-5/, 4, 20],
];

function costoUsd(modelo: string, entrada: number, salida: number): number {
  const fila = PRECIOS.find(([patron]) => patron.test(modelo));
  if (!fila) return 0;
  return (entrada * fila[1] + salida * fila[2]) / 1_000_000;
}

let cliente: Anthropic | undefined;
function getCliente(): Anthropic {
  // En Bedrock se usa el runtime estándar (InvokeModel) y no Mantle: la cuenta
  // de MindfulTech no sirve Haiku 5.5 por Mantle.
  cliente ??= BEDROCK ? (new AnthropicBedrock() as unknown as Anthropic) : new Anthropic();
  return cliente;
}

type Esfuerzo = "low" | "medium" | "high";

interface Registro {
  agente: string;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  desdeCache: boolean;
}
const registros: Registro[] = [];

export interface Llamada<T extends z.ZodType> {
  agente: string;
  modelo: string;
  esfuerzo: Esfuerzo;
  system: string;
  user: string;
  schema: T;
  /** Carpeta del caché en disco. Una corrida repetida con los mismos datos no gasta nada. */
  cacheDir: string;
}

/**
 * Ejecuta un agente: una petición con salida estructurada validada contra `schema`.
 * El resultado se guarda en disco con una llave derivada de todo lo que influye
 * en la respuesta, así la demo se paga una sola vez.
 */
export async function ejecutarAgente<T extends z.ZodType>(l: Llamada<T>): Promise<z.infer<T>> {
  const llave = createHash("sha256")
    .update(JSON.stringify([l.agente, l.modelo, l.esfuerzo, l.system, l.user]))
    .digest("hex")
    .slice(0, 24);
  const archivo = path.join(l.cacheDir, `${l.agente}-${llave}.json`);

  if (existsSync(archivo)) {
    const guardado = JSON.parse(readFileSync(archivo, "utf8"));
    registros.push({ agente: l.agente, modelo: l.modelo, ...guardado.uso, desdeCache: true });
    return l.schema.parse(guardado.salida);
  }

  let respuesta;
  try {
    respuesta = await getCliente().messages.parse({
      model: l.modelo,
      max_tokens: 16000,
      system: l.system,
      messages: [{ role: "user", content: l.user }],
      output_config: { effort: l.esfuerzo, format: zodOutputFormat(l.schema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error("Credenciales del modelo inválidas o ausentes. Revisa .env (ver .env.example).");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error(`Límite de peticiones alcanzado en el agente "${l.agente}". Vuelve a correr: lo ya hecho está en caché.`);
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Error ${error.status} del modelo en el agente "${l.agente}": ${error.message}`);
    }
    throw error;
  }

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El modelo declinó la petición del agente "${l.agente}" (${respuesta.stop_details?.category ?? "sin categoría"}).`);
  }
  if (respuesta.stop_reason === "max_tokens" || respuesta.parsed_output == null) {
    throw new Error(`El agente "${l.agente}" no devolvió una salida completa (stop_reason: ${respuesta.stop_reason}).`);
  }

  const uso = {
    tokensEntrada: respuesta.usage.input_tokens,
    tokensSalida: respuesta.usage.output_tokens,
  };
  mkdirSync(l.cacheDir, { recursive: true });
  writeFileSync(archivo, JSON.stringify({ modelo: l.modelo, uso, salida: respuesta.parsed_output }, null, 2));
  registros.push({ agente: l.agente, modelo: l.modelo, ...uso, desdeCache: false });
  return respuesta.parsed_output as z.infer<T>;
}

/** Resumen de uso por agente. Las llamadas servidas desde caché cuentan con su costo original. */
export function resumenDeUso(): { porAgente: UsoAgente[]; totalUsd: number } {
  const mapa = new Map<string, UsoAgente>();
  for (const r of registros) {
    const fila = mapa.get(r.agente) ?? {
      agente: r.agente, modelo: r.modelo, llamadas: 0, desdeCache: 0, tokensEntrada: 0, tokensSalida: 0, usd: 0,
    };
    fila.llamadas += 1;
    fila.desdeCache += r.desdeCache ? 1 : 0;
    fila.tokensEntrada += r.tokensEntrada;
    fila.tokensSalida += r.tokensSalida;
    fila.usd += costoUsd(r.modelo, r.tokensEntrada, r.tokensSalida);
    mapa.set(r.agente, fila);
  }
  const porAgente = [...mapa.values()].map((f) => ({ ...f, usd: Number(f.usd.toFixed(4)) }));
  return { porAgente, totalUsd: Number(porAgente.reduce((s, f) => s + f.usd, 0).toFixed(4)) };
}
