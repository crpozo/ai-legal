// Servidor estático mínimo para ver el dashboard en local. En producción basta
// cualquier hosting de archivos: no hay backend ni base de datos.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".pdf": "application/pdf" };
const PUBLICO = ["/dashboard/", "/data/"];

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (ruta === "/") ruta = "/index.html"; // landing
  if (ruta === "/dashboard/") ruta = "/dashboard/index.html";
  const archivo = path.join(raiz, ruta);
  if (!archivo.startsWith(raiz) || !(ruta === "/index.html" || PUBLICO.some((p) => ruta.startsWith(p))) || ruta.includes("/cache/")) {
    res.writeHead(404).end("No encontrado");
    return;
  }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] ?? "application/octet-stream", "cache-control": "no-store" }).end(cuerpo);
  } catch {
    res.writeHead(404).end("No encontrado");
  }
}).listen(4173, () => console.log("Dashboard en http://localhost:4173"));
