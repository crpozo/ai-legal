/* Tutorial de bienvenida: guía al usuario hacia los procesos ya analizados. */
const CLAVE = "tomos-tutorial-v1";
const visto = { leer: () => { try { return localStorage.getItem(CLAVE) === "1"; } catch { return false; } }, marcar: () => { try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento */ } } };
const T = "<em class='tomos'>Tomos</em>";

// Cada paso puede indicar la vista en la que está su elemento.
const PASOS = [
  { vista: "buscar", sel: ".atajo", titulo: "Empieza aquí", texto: `Abre los procesos que ${T} ya analizó: estado del proceso, alertas, plazos, reportes y documentos.` },
  { vista: "buscar", sel: ".novedades", titulo: "Novedades del expediente", texto: "Toca cualquier actuación para abrir el proceso completo y ver lo que encontró el agente." },
  { vista: "buscar", sel: "#form-buscar", titulo: "Buscador en modo demo", texto: "En esta demo el buscador solo responde con los procesos ya cargados. Para ver resultados reales, entra a los procesos analizados.", final: true },
];

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function montarTutorial({ abrir, forzar = false }) {
  if (!forzar && visto.leer()) return;
  document.querySelector(".tutorial")?.remove();
  const capa = document.createElement("div");
  capa.className = "tutorial";
  capa.innerHTML = `<div class="tut-foco" aria-hidden="true"></div>
    <div class="tut-caja" role="dialog" aria-modal="true" aria-labelledby="tut-titulo">
      <p class="tut-paso"></p><h2 id="tut-titulo"></h2><p class="tut-texto"></p>
      <div class="tut-acciones"><button type="button" class="tut-saltar">Saltar</button><span><button type="button" class="tut-atras">Atrás</button><button type="button" class="tut-sig"></button></span></div>
    </div>`;
  document.body.append(capa);
  const foco = capa.querySelector(".tut-foco"), caja = capa.querySelector(".tut-caja");
  let i = 0, objetivo = null, turno = 0;

  const ubicar = () => {
    if (!objetivo?.isConnected) return;
    const r = objetivo.getBoundingClientRect(), m = 8, vh = innerHeight, vw = innerWidth;
    const alto = Math.min(r.height, vh * 0.42);
    Object.assign(foco.style, { top: `${r.top - m}px`, left: `${r.left - m}px`, width: `${r.width + 2 * m}px`, height: `${alto + 2 * m}px` });
    const ancho = caja.offsetWidth, altoCaja = caja.offsetHeight;
    let top = r.top + alto + 18;
    if (top + altoCaja > vh - 12) top = Math.max(12, r.top - altoCaja - 18);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - ancho / 2), vw - ancho - 12);
    Object.assign(caja.style, { top: `${top}px`, left: `${left}px` });
  };
  const cerrar = () => { turno++; visto.marcar(); capa.remove(); removeEventListener("resize", ubicar); removeEventListener("scroll", ubicar, true); document.removeEventListener("keydown", tecla); };
  const tecla = (ev) => { if (ev.key === "Escape") cerrar(); };

  const ir = async (n, dir = 1) => {
    const mio = ++turno;
    i = n;
    const p = PASOS[i];
    const vistaActual = document.body.dataset.vista;
    const panelActual = document.querySelector(".subtabs [aria-selected='true']")?.dataset.panel;
    if (p.vista && (p.vista !== vistaActual || (p.panel && p.panel !== panelActual))) {
      caja.style.opacity = "0";
      abrir(p.vista, p.panel);
      await espera(450);
      if (mio !== turno) return;
    }
    objetivo = document.querySelector(p.sel);
    if (!objetivo) { // El elemento no existe en estos datos: se salta el paso.
      const sig = i + dir;
      if (sig >= 0 && sig < PASOS.length) return ir(sig, dir);
      return cerrar();
    }
    capa.querySelector(".tut-paso").textContent = `Paso ${i + 1} de ${PASOS.length}`;
    capa.querySelector("#tut-titulo").innerHTML = p.titulo.replace("Tomos", T);
    capa.querySelector(".tut-texto").innerHTML = p.texto;
    capa.querySelector(".tut-sig").textContent = p.final ? "Ver procesos analizados →" : "Siguiente";
    capa.querySelector(".tut-atras").hidden = i === 0;
    // Los elementos altos se alinean arriba (bajo la barra de pestañas fija); el resto, al centro.
    const alto = objetivo.getBoundingClientRect().height;
    if (alto > innerHeight * 0.5) scrollBy({ top: objetivo.getBoundingClientRect().top - 110, behavior: "instant" });
    else objetivo.scrollIntoView({ block: "center", behavior: "instant" });
    await espera(30);
    caja.style.opacity = "1";
    ubicar();
    capa.querySelector(".tut-sig").focus({ preventScroll: true });
  };

  capa.querySelector(".tut-sig").addEventListener("click", () => {
    if (i < PASOS.length - 1) return ir(i + 1, 1);
    cerrar(); abrir("seguimientos");
  });
  capa.querySelector(".tut-atras").addEventListener("click", () => { if (i > 0) ir(i - 1, -1); });
  capa.querySelector(".tut-saltar").addEventListener("click", cerrar);
  addEventListener("resize", ubicar);
  addEventListener("scroll", ubicar, true);
  document.addEventListener("keydown", tecla);
  ir(0);
}
