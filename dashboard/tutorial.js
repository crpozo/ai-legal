/* Tutorial de la demo: recorre la plataforma y muestra los hallazgos más interesantes de los procesos ya analizados. */
const CLAVE = "tomos-tutorial-v1";
const visto = { leer: () => { try { return localStorage.getItem(CLAVE) === "1"; } catch { return false; } }, marcar: () => { try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento */ } } };
const T = "<em class='tomos'>Tomos</em>";

// Cada paso puede abrir una vista (y una pestaña interna) antes de resaltar su elemento.
const PASOS = [
  { vista: "buscar", sel: ".atajo", titulo: "Empieza aquí", texto: `En esta demo ya hay procesos y jueces analizados por ${T}. Te mostramos lo más interesante en un minuto.` },
  { vista: "buscar", sel: ".novedades", titulo: "Novedades del expediente", texto: "Las últimas actuaciones, ya leídas y clasificadas por la IA. El punto rojo marca las que requieren que hagas algo." },
  { vista: "causa", panel: "resumen", sel: ".portada .cifras", titulo: "424 actuaciones leídas", texto: `Una acción colusoria que se tramita desde 2020. ${T} recorrió las 8 carpetas del proceso y leyó cada actuación, algo que a mano toma días.` },
  { vista: "causa", panel: "resumen", sel: ".portada-der", titulo: "El proceso en un párrafo", texto: "El reporte integral resume etapa, estado y lo que falta, con cada afirmación enlazada a la actuación de donde sale." },
  { vista: "causa", panel: "seguimiento", sel: '.panel[data-panel="seguimiento"] .alertas li', titulo: "Caso interesante: riesgo de archivo", texto: "La citación de dos demandados fue cuestionada otra vez y el juez ya advirtió el archivo por falta de impulso. La IA lo detectó y lo marcó como alerta alta." },
  { vista: "causa", panel: "escritos", sel: '.panel[data-panel="escritos"] .bloque', titulo: "Escritos listos para revisar", texto: "Con base en el estado del proceso, la IA redactó 2 borradores, como insistir en el oficio a la Tenencia Política, con lo que debes confirmar antes de presentarlos." },
  { vista: "causa", panel: "cliente", sel: '.panel[data-panel="cliente"] .bloque', titulo: "Reporte para tu cliente", texto: "El mismo análisis en lenguaje llano, listo para enviar. Tu cliente deja de preguntar cómo va su juicio." },
  { vista: "juez", panel: "resumen", sel: ".portada .cifras", titulo: "Cómo decide un tribunal", texto: "190 resoluciones de garantías constitucionales en la Corte Provincial de Pichincha: solo 24% de las acciones prosperan y la mediana para resolver es de 99 días." },
  { vista: "juez", panel: "resumen", sel: ".tesela", titulo: "Patrones que nadie ve a mano", texto: "Criterios que el tribunal repite, cambios de criterio en el tiempo y diferencias entre casos similares, cada uno con las resoluciones que lo prueban." },
  { vista: "juez", panel: "criterios", sel: '.panel[data-panel="criterios"] .bloque:nth-child(3)', titulo: "Caso interesante: mismos hechos, distinto resultado", texto: "Pares de casos casi idénticos resueltos en sentidos opuestos. Es un argumento que puedes invocar al plantear tu caso." },
  { sel: "#chat-boton", titulo: "Pregunta a Tomos", texto: `Consulta en un chat lo que ya está analizado: quién falta por citar, cómo resuelve el juez, qué plazos corren. El buscador está en modo demo y solo responde con estos procesos.`, final: true },
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
