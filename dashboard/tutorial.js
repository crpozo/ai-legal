/* Tutorial de bienvenida: guía al usuario hacia los procesos ya analizados. */
const CLAVE = "tomos-tutorial-v1";
const visto = { leer: () => { try { return localStorage.getItem(CLAVE) === "1"; } catch { return false; } }, marcar: () => { try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento */ } } };

const PASOS = [
  { sel: ".atajo", titulo: "Empieza aquí", texto: "Abre los procesos que Tomos ya analizó: estado de la causa, alertas, plazos, reportes y documentos." },
  { sel: ".novedades", titulo: "Novedades del expediente", texto: "Toca cualquier actuación para abrir la causa completa y ver lo que encontró el agente." },
  { sel: "#form-buscar", titulo: "Buscador en modo demo", texto: "En esta demo el buscador solo responde con los procesos ya cargados. Para ver resultados reales, entra a los procesos analizados.", final: true },
];

export function montarTutorial({ abrir, forzar = false }) {
  if (!forzar && visto.leer()) return;
  const pasos = PASOS.filter((p) => document.querySelector(p.sel));
  if (!pasos.length) return;
  document.querySelector(".tutorial")?.remove();
  const capa = document.createElement("div");
  capa.className = "tutorial";
  capa.innerHTML = `<div class="tut-foco" aria-hidden="true"></div>
    <div class="tut-caja" role="dialog" aria-modal="true" aria-labelledby="tut-titulo">
      <p class="tut-paso"></p><h2 id="tut-titulo"></h2><p class="tut-texto"></p>
      <div class="tut-acciones"><button type="button" class="tut-saltar">Saltar</button><button type="button" class="tut-sig"></button></div>
    </div>`;
  document.body.append(capa);
  const foco = capa.querySelector(".tut-foco"), caja = capa.querySelector(".tut-caja");
  let i = 0, objetivo = null;

  const ubicar = () => {
    if (!objetivo?.isConnected) return;
    const r = objetivo.getBoundingClientRect(), m = 8;
    Object.assign(foco.style, { top: `${r.top - m}px`, left: `${r.left - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
    const ancho = caja.offsetWidth, alto = caja.offsetHeight, vw = innerWidth, vh = innerHeight;
    let top = r.bottom + 18;
    if (top + alto > vh - 12) top = Math.max(12, r.top - alto - 18);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - ancho / 2), vw - ancho - 12);
    Object.assign(caja.style, { top: `${top}px`, left: `${left}px` });
  };
  const cerrar = () => { visto.marcar(); capa.remove(); removeEventListener("resize", ubicar); removeEventListener("scroll", ubicar, true); document.removeEventListener("keydown", tecla); };
  const tecla = (ev) => { if (ev.key === "Escape") cerrar(); };
  const pintar = () => {
    const p = pasos[i];
    objetivo = document.querySelector(p.sel);
    capa.querySelector(".tut-paso").textContent = `Paso ${i + 1} de ${pasos.length}`;
    capa.querySelector("#tut-titulo").textContent = p.titulo;
    capa.querySelector(".tut-texto").textContent = p.texto;
    const ultimo = i === pasos.length - 1;
    capa.querySelector(".tut-sig").textContent = ultimo ? "Ver procesos analizados →" : "Siguiente";
    objetivo.scrollIntoView({ block: "center", behavior: "instant" });
    requestAnimationFrame(ubicar);
    capa.querySelector(".tut-sig").focus({ preventScroll: true });
  };
  capa.querySelector(".tut-sig").addEventListener("click", () => {
    if (i < pasos.length - 1) { i++; pintar(); return; }
    cerrar(); abrir("seguimientos");
  });
  capa.querySelector(".tut-saltar").addEventListener("click", cerrar);
  foco.addEventListener("click", () => { if (pasos[i].sel === ".atajo") { cerrar(); abrir("seguimientos"); } });
  addEventListener("resize", ubicar);
  addEventListener("scroll", ubicar, true);
  document.addEventListener("keydown", tecla);
  pintar();
}
