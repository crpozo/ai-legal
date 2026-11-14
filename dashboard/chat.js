/**
 * Chat de la plataforma. Responde con los análisis ya guardados de los seguimientos:
 * arma una base de conocimiento en el navegador y recupera los pasajes que mejor
 * responden a la pregunta. No llama a ningún modelo; para conectarlo a uno, basta
 * definir CHAT_ENDPOINT y el chat le enviará la pregunta con los pasajes recuperados.
 */
const CHAT_ENDPOINT = null;

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fecha = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const VACIAS = new Set("a al algo ante aqui como con cual cuales cuando de del desde donde el ella ellos en entre era es esa ese eso esta este esto ha han hay la las le les lo los mas me mi muy no nos o para pero por que quien quienes se sea ser si sin sobre son su sus te tiene tienen un una uno unos y ya fue han hace hacer dice dijo sido tras cada otro otra".split(" "));
const raiz = (p) => (p.replace(/(aciones|acion|amente|mente|idades|idad|ados|adas|ado|ada|idos|idas|ido|ida|ando|iendo|ar|er|ir|es|s)$/, "") || p).replace(/[aeio]$/, "");
const fichas = (texto) => plano(texto).split(/[^a-z0-9]+/).filter((p) => p.length > 2 && !VACIAS.has(p)).map(raiz).filter((p) => p.length > 2);

const AMBITOS = {
  proceso: { nombre: "Proceso", pistas: ["caus", "proces", "cit", "demand", "actor", "expedient", "actu", "plaz", "escrit", "reconven", "archiv"] },
  juez: { nombre: "Juez", pistas: ["juez", "tribunal", "sala", "criteri", "resuelv", "resolu", "apel", "habea", "protec", "ponent", "arbitrar", "demor", "tard", "sentenci"] },
  fiscalia: { nombre: "Fiscalía", pistas: ["fiscal", "denunci", "delit", "notici", "sospech", "ndd", "robo", "abus"] },
};

/** Base de conocimiento: pasajes cortos, cada uno con su fuente dentro de la plataforma. */
function construirBase(datos) {
  const base = [];
  const agregar = (ambito, titulo, texto, abrir, extra = {}) => { if (texto) base.push({ ambito, titulo, texto, abrir, peso: 1, ...extra }); };
  const nAct = (id) => String(id).replace(/^.*-(\d+)$/, "$1");

  if (datos.causa) {
    const c = datos.causa, r = c.reporte, e = c.instancias.find((i) => i.id === c.seleccion.instanciaId), origen = `Proceso ${c.numero}`;
    agregar("proceso", "Resumen del caso", r.resumenEjecutivo, "proceso:resumen", { peso: 1.15, origen, clave: "resumen caso causa de que trata como va" });
    agregar("proceso", "Etapa procesal", r.etapaProcesal, "proceso:resumen", { origen, clave: "causa etapa fase procesal" });
    agregar("proceso", "Estado actual", r.estadoActual, "proceso:resumen", { origen, clave: "causa estado actual en que esta pendiente falta" });
    agregar("proceso", "Actuación más reciente", `${r.ultimaActuacion.resumen} ${r.ultimaActuacion.implicaciones}`, "proceso:resumen", { origen, clave: "ultima actuacion reciente novedad ultimo movimiento" });
    agregar("proceso", "Partes del proceso", `Actores: ${e.actores.join("; ")}. Demandados: ${e.demandados.join("; ")}. Se tramita en ${e.dependencia}, ingresó el ${fecha(e.fechaIngreso)}. Materia ${e.materia}, ${e.tipoAccion}, ${e.asunto}.`, "proceso:carpetas", { origen, clave: "partes actores demandados quienes juzgado dependencia donde tramita" });
    agregar("proceso", "Carpeta elegida", c.seleccion.justificacion, "proceso:carpetas", { origen, clave: "carpeta instancia dependencia elegida" });
    agregar("proceso", "Próximos pasos", r.proximosPasos.map((p, i) => `${i + 1}. ${p}`).join("\n"), "proceso:seguimiento", { origen, clave: "causa proximos pasos que hacer siguiente gestion recomendacion" });
    for (const a of r.alertas) agregar("proceso", `Alerta de nivel ${a.nivel}`, a.texto, "proceso:seguimiento", { origen, clave: "alerta riesgo problema", ref: `actuación n.º ${nAct(a.actuacionId)}` });
    for (const p of r.plazos) agregar("proceso", "Plazo", `${p.descripcion} Fecha límite: ${p.fechaLimite}. ${p.base}`, "proceso:seguimiento", { origen, clave: "plazo termino vence vencimiento audiencia fecha limite" });
    for (const h of r.hitos) agregar("proceso", `Hito del ${fecha(h.fecha)}`, h.hito, "proceso:seguimiento", { origen, peso: 0.8, ref: `actuación n.º ${nAct(h.actuacionId)}` });
    if (c.extras) {
      for (const q of c.extras.preguntas) agregar("proceso", q.pregunta, q.respuesta, "proceso:preguntas", { origen, peso: 1.6, clave: q.pregunta, ref: q.actuacionIds.slice(0, 4).map((id) => `n.º ${nAct(id)}`).join(", ") });
      const d = c.extras.despacho;
      agregar("proceso", "Tiempo de despacho del juzgado", `El juzgado tarda una mediana de ${d.medianaDias} días entre un escrito y el siguiente auto o providencia; nueve de cada diez se despachan en ${d.p90Dias} días y el máximo observado es de ${d.maxDias}. Por año: ${d.porAnio.map((y) => `${y.anio}, ${y.medianaDias} días`).join("; ")}. Calculado sobre ${d.muestras} escritos de este expediente.`, "proceso:resumen", { origen, clave: "cuanto tarda demora juzgado despacho tiempo dias" });
      for (const b of c.extras.borradores) agregar("proceso", `Borrador: ${b.titulo}`, b.porQueAhora, "proceso:escritos", { origen, clave: "escrito borrador presentar redactar" });
      agregar("proceso", "Reporte para el cliente", c.extras.cliente.parrafos.join("\n\n"), "proceso:cliente", { origen, peso: 0.7, clave: "cliente explicar informe sencillo" });
    }
    for (const a of c.actuaciones) agregar("proceso", `${fecha(a.fecha)} · ${a.tipo}`, a.analisis.resumen + (a.analisis.requiereAccion ? ` Acción sugerida: ${a.analisis.accionSugerida}` : ""), "proceso:expediente", { origen, peso: 0.55, ref: `actuación n.º ${nAct(a.id)}`, buscar: a.analisis.resumen.slice(0, 40) });
  }

  if (datos.juez) {
    const j = datos.juez, p = j.patrones, s = j.estadisticas, origen = `Juez ${j.juez.nombre}`;
    const procs = (ns) => ns.slice(0, 5).join(", ");
    agregar("juez", "Cómo decide", p.resumenEjecutivo, "juez:resumen", { peso: 1.05, origen, clave: `como decide en general resumen ${j.juez.nombre}` });
    const total = s.total, dec = Object.fromEntries(s.porDecision.map((d) => [d.decision, d.n]));
    agregar("juez", "Cómo resuelve, en números", `De ${total} resoluciones: ${dec.rechaza ?? 0} rechazos, ${dec.inadmite ?? 0} inadmisiones, ${dec.acepta ?? 0} aceptaciones y ${dec.acepta_parcialmente ?? 0} aceptaciones parciales.${s.porApelacion ? ` Frente a la primera instancia: ${s.porApelacion.map((a) => `${a.apelacion} ${a.n}`).join(", ")}.` : ""}${s.porAccion ? ` Por acción: ${s.porAccion.map((a) => `${a.accion}, ${a.aceptadas} de ${a.n} prosperan`).join("; ")}.` : ""}`, "juez:resumen", { origen, peso: 1.3, clave: "cuantas acepta rechaza porcentaje probabilidad ganar prospera estadistica numeros confirma revoca" });
    if (s.tiempos) agregar("juez", "Cuánto tarda en resolver", `${p.lecturaDeTiempos ?? ""} Promedio ${s.tiempos.promedioDias} días, mediana ${s.tiempos.medianaDias}, máximo ${s.tiempos.maxDias}. Anomalías sobre ${s.tiempos.umbralAnomalia} días: ${s.tiempos.anomalias.slice(0, 5).map((a) => `${a.numero} (${a.dias} días)`).join(", ")}.`, "juez:tiempos", { origen, peso: 1.4, clave: "cuanto tarda demora tiempo dias resolver anomalia promedio mediana lento" });
    for (const c of p.criterioPorAccion ?? []) agregar("juez", `Criterio en ${c.accion}`, `${c.criterio}\n\nFundamentos de derecho: ${c.fundamentosDeDerecho}\n\nFundamentos de hecho: ${c.fundamentosDeHecho}`, "juez:resumen", { origen, peso: 1.4, clave: `criterio como resuelve decide ${c.accion} fundamentos derecho hecho`, ref: procs(c.procesos) });
    for (const c of p.criteriosReiterados) agregar("juez", "Criterio reiterado", c.criterio, "juez:criterios", { origen, clave: "juez criterio reiterado regla constante siempre", ref: procs(c.procesos), proc: c.procesos[0] });
    for (const c of p.cambiosDeInterpretacion) agregar("juez", `Cambio de criterio: ${c.tema}`, `Antes: ${c.antes}\n\nDespués: ${c.despues}`, "juez:criterios", { origen, peso: 1.3, clave: "cambio cambiado criterio interpretacion antes despues vario", ref: procs(c.procesos), proc: c.procesos[0] });
    for (const d of p.diferenciasEntreCasosSimilares) agregar("juez", "Diferencia entre casos similares", `${d.descripcion}\n\nUso estratégico: ${d.utilidadEstrategica}`, "juez:criterios", { origen, peso: 1.2, clave: "juez contradiccion contradictorio contradice inconsistencia casos similares distinto diferente", ref: procs(d.procesos), proc: d.procesos[0] });
    for (const d of p.senalesDeArbitrariedad ?? []) agregar("juez", "Señal de arbitrariedad", d.descripcion, "juez:criterios", { origen, peso: 1.3, clave: "juez tribunal es arbitrario arbitrariedad arbitraria trato desigual contradictorio", ref: procs(d.procesos), proc: d.procesos[0] });
    agregar("juez", "Recomendaciones para litigar ante este juez", p.recomendaciones.map((x, i) => `${i + 1}. ${x}`).join("\n"), "juez:estrategia", { origen, peso: 1.3, clave: "recomendacion estrategia como plantear litigar argumentar ganar consejo" });
    agregar("juez", "Limitaciones del análisis", p.limitaciones.map((x) => `- ${x}`).join("\n"), "juez:estrategia", { origen, peso: 0.8, clave: "limitacion confiable fiable ponente" });
    agregar("juez", "Normativa más citada", s.normasMasCitadas.map((n) => `${n.norma} (${n.n})`).join("; "), "juez:resumen", { origen, clave: "norma ley articulo cita normativa" });
    for (const x of j.procesos) agregar("juez", `${x.asunto} · ${fecha(x.fechaResolucion)}`, `${x.ficha.criterioResolucion}${x.ficha.fundamentosDeHecho ? ` Hechos: ${x.ficha.fundamentosDeHecho}` : ""}`, "juez:resoluciones", { origen, peso: 0.5, ref: `proceso ${x.numero}`, proc: x.numero });
  }

  if (datos.fiscalia) {
    const f = datos.fiscalia, r = f.reporte, origen = `Fiscalía · ${f.consulta.persona ?? f.consulta.valor}`;
    agregar("fiscalia", "Resumen de noticias del delito", r.resumenEjecutivo, "fiscalia:noticias", { peso: 1.5, origen, clave: `fiscalia denuncias noticias delito ${f.consulta.persona ?? ""} ${f.consulta.valor}` });
    for (const n of f.noticias) { const a = r.noticias.find((x) => x.numero === n.numero); agregar("fiscalia", `Noticia del delito ${n.numero}${n.delito ? ` · ${n.delito}` : ""}`, `${a?.resumen ?? ""} Qué verificar: ${a?.queVerificar ?? ""}`, "fiscalia:noticias", { origen, clave: `${n.delito ?? ""} denuncia unidad fiscal`, ref: `NDD ${n.numero}` }); }
    for (const a of r.alertas) agregar("fiscalia", `Alerta de nivel ${a.nivel}`, a.texto, "fiscalia:seguimiento", { origen, clave: "alerta riesgo", ref: `NDD ${a.numero}` });
    agregar("fiscalia", "Próximos pasos", r.proximosPasos.map((x, i) => `${i + 1}. ${x}`).join("\n"), "fiscalia:seguimiento", { origen, clave: "proximos pasos que hacer gestion" });
  }

  // Índice: frecuencia de documentos por raíz, para ponderar las palabras poco comunes.
  const df = new Map();
  for (const d of base) {
    d.tTitulo = new Set(fichas(`${d.titulo} ${d.clave ?? ""}`));
    d.tTexto = new Set(fichas(d.texto));
    for (const t of new Set([...d.tTitulo, ...d.tTexto])) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { base, idf: (t) => Math.log(1 + base.length / (1 + (df.get(t) ?? 0))) };
}

function recuperar({ base, idf }, pregunta, vistaActual) {
  const q = [...new Set(fichas(pregunta))];
  if (!q.length) return [];
  const pedido = Object.entries(AMBITOS).filter(([, a]) => a.pistas.some((p) => q.some((t) => t.startsWith(p) || p.startsWith(t)))).map(([id]) => id);
  const puntuar = (d) => {
    let s = 0, aciertos = 0, enTitulos = 0;
    for (const t of q) {
      const enTitulo = d.tTitulo.has(t), enTexto = d.tTexto.has(t);
      if (enTitulo || enTexto) aciertos += 1;
      if (enTitulo) enTitulos += 1;
      s += idf(t) * ((enTitulo ? 3 : 0) + (enTexto ? 1 : 0));
    }
    // Con dos o más palabras, una sola coincidencia no basta: evita responder a preguntas fuera de tema.
    if (!aciertos || (q.length >= 2 && aciertos < 2)) return 0;
    s *= d.peso * (0.4 + aciertos / q.length) * (1 + enTitulos / q.length);
    if (pedido.includes(d.ambito)) s *= 1.4;
    else if (!pedido.length && d.ambito === vistaActual) s *= 1.3;
    return s;
  };
  return base.map((d) => ({ d, s: puntuar(d) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
}

const SUGERIDAS = {
  proceso: ["¿En qué estado está el proceso?", "¿Qué demandados faltan por citar?", "¿Qué plazos están corriendo?", "¿Qué escrito conviene presentar ahora?"],
  juez: ["¿Cómo resuelve este juez las acciones de protección?", "¿Cuánto tarda en resolver?", "¿Ha cambiado de criterio?", "¿Cómo conviene plantear un caso ante él?"],
  fiscalia: ["¿Qué denuncias tiene esta persona?", "¿Qué hay que verificar en la Fiscalía?"],
};

export function montarChat({ datos, abrir, vistaActual }) {
  const conocimiento = construirBase(datos);
  // el ámbito «proceso» lee datos.causa
  const datosDe = (a) => datos[a === "proceso" ? "causa" : a];
  const disponibles = Object.keys(AMBITOS).filter((a) => datosDe(a));
  const raizEl = document.createElement("div");
  raizEl.innerHTML = `
    <button type="button" id="chat-boton" aria-expanded="false" aria-controls="chat-panel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H10l-4 3.5v-3.5H5z"/></svg><span>Pregunta a <em class="tomos">Tomos</em></span>
    </button>
    <section id="chat-panel" role="dialog" aria-label="Chat con Tomos" hidden>
      <header><div><b class="tomos">Tomos</b><small>Responde con tus análisis de casos</small></div><button type="button" id="chat-cerrar" aria-label="Cerrar chat">✕</button></header>
      <div id="chat-mensajes" aria-live="polite"></div>
      <div id="chat-sugeridas"></div>
      <form id="chat-form"><input id="chat-q" type="text" autocomplete="off" placeholder="Pregunta sobre un proceso o un juez…" aria-label="Tu pregunta"><button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg></button></form>
    </section>`;
  document.querySelector(".area").appendChild(raizEl);
  const $ = (s) => raizEl.querySelector(s);
  const mensajes = $("#chat-mensajes");
  const decir = (clase, html) => { const m = document.createElement("div"); m.className = `msj ${clase}`; m.innerHTML = html; mensajes.appendChild(m); mensajes.scrollTop = mensajes.scrollHeight; return m; };
  const parrafos = (t) => t.split(/\n+/).map((x) => `<p>${esc(x)}</p>`).join("");

  const pintarSugeridas = () => {
    const v = vistaActual();
    const lista = SUGERIDAS[v] && datosDe(v) ? SUGERIDAS[v] : disponibles.flatMap((a) => SUGERIDAS[a].slice(0, 2));
    $("#chat-sugeridas").innerHTML = lista.slice(0, 4).map((q) => `<button type="button" class="chip">${esc(q)}</button>`).join("");
  };
  const saludar = () => {
    if (mensajes.children.length) return;
    decir("ia", `<p>Hola. Puedo responder sobre tus análisis guardados: ${disponibles.map((a) => AMBITOS[a].nombre.toLowerCase()).join(", ")}. Cada respuesta indica de dónde sale para que la verifiques.</p>`);
  };

  const responder = async (pregunta) => {
    decir("yo", `<p>${esc(pregunta)}</p>`);
    const espera = decir("ia pensando", `<p><span class="marca-paso"></span>Buscando en tus análisis…</p>`);
    const hallados = recuperar(conocimiento, pregunta, vistaActual());
    if (CHAT_ENDPOINT) {
      try {
        const r = await fetch(CHAT_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pregunta, pasajes: hallados.map(({ d }) => ({ titulo: d.titulo, origen: d.origen, texto: d.texto, ref: d.ref })) }) });
        if (r.ok) { const { respuesta } = await r.json(); espera.remove(); decir("ia", parrafos(respuesta)); return; }
      } catch { /* sin conexión al modelo: se responde con los pasajes */ }
    }
    await new Promise((ok) => setTimeout(ok, 700));
    espera.remove();
    if (!hallados.length || hallados[0].s < 2.2) {
      decir("ia", `<p>No encuentro eso en los análisis guardados. Prueba con el número de proceso, el nombre de una parte o un tema concreto, como una citación, un plazo o un criterio del juez.</p>`);
      return;
    }
    const [mejor, ...resto] = hallados;
    const afines = resto.filter((x) => x.s > mejor.s * 0.72 && x.d.titulo !== mejor.d.titulo).slice(0, 2);
    const fuente = (d) => `<button type="button" class="chip" data-abrir="${esc(d.abrir)}"${d.proc ? ` data-proc="${esc(d.proc)}"` : ""}${d.buscar ? ` data-buscar="${esc(d.buscar)}"` : ""}>${esc(d.origen)}${d.ref ? ` · ${esc(d.ref)}` : ""} →</button>`;
    decir("ia", `<p class="msj-titulo">${esc(mejor.d.titulo)}</p>${parrafos(mejor.d.texto)}${afines.length ? `<p class="msj-titulo">También relacionado</p><ul>${afines.map(({ d }) => `<li><b>${esc(d.titulo)}.</b> ${esc(d.texto.length > 320 ? `${d.texto.slice(0, 320).replace(/\s+\S*$/, "")}…` : d.texto)}</li>`).join("")}</ul>` : ""}<div class="msj-fuentes">${[mejor, ...afines].map(({ d }) => fuente(d)).join("")}</div>`);
  };

  const alternar = (abierto) => {
    $("#chat-panel").hidden = !abierto;
    $("#chat-boton").setAttribute("aria-expanded", String(abierto));
    if (abierto) { saludar(); pintarSugeridas(); $("#chat-q").focus(); }
  };
  $("#chat-boton").addEventListener("click", () => alternar($("#chat-panel").hidden));
  $("#chat-cerrar").addEventListener("click", () => alternar(false));
  $("#chat-form").addEventListener("submit", (ev) => { ev.preventDefault(); const q = $("#chat-q").value.trim(); if (!q) return; $("#chat-q").value = ""; responder(q); });
  $("#chat-sugeridas").addEventListener("click", (ev) => { const b = ev.target.closest(".chip"); if (b) responder(b.textContent); });
  mensajes.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-abrir]");
    if (!b) return;
    const [vista, panel] = b.dataset.abrir.split(":");
    abrir(vista, panel);
    if (b.dataset.proc) document.querySelector(`#contenido [data-proc="${CSS.escape(b.dataset.proc)}"]`)?.click() ?? Object.assign(document.querySelector("#res-q") ?? {}, { value: b.dataset.proc }).dispatchEvent?.(new Event("input"));
    if (b.dataset.buscar) { const q = document.querySelector("#exp-q"); if (q) { q.value = b.dataset.buscar; q.dispatchEvent(new Event("input")); } }
    if (window.matchMedia("(max-width: 820px)").matches) alternar(false);
  });
  return { refrescar: pintarSugeridas };
}
