import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { CausaRaw, Dashboard, FiscaliaRaw, JuezRaw } from "./schemas.js";

/** Valida cada dataset de data/ contra los esquemas: lo capturado y lo que lee el dashboard. */
let errores = 0;
for (const dataset of readdirSync("data")) {
  const revisar = (relativo: string, schema: { safeParse: (v: unknown) => { success: boolean; error?: { message: string } } }) => {
    const archivo = path.join("data", dataset, relativo);
    if (!existsSync(archivo)) return console.log(`· ${archivo}: no existe todavía`);
    const r = schema.safeParse(JSON.parse(readFileSync(archivo, "utf8")));
    if (r.success) return console.log(`✓ ${archivo}`);
    errores += 1;
    console.error(`✗ ${archivo}\n${r.error?.message}`);
  };
  revisar("raw/causa.json", CausaRaw);
  revisar("raw/juez.json", JuezRaw);
  revisar("raw/fiscalia.json", FiscaliaRaw);
  revisar("processed/dashboard.json", Dashboard);
}
process.exit(errores ? 1 : 0);
