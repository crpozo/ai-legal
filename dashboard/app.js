const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(iso);
};
const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s) => String(s ?? "").replace(/\D/g, "");
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const corto = (xs) => (xs.length > 1 ? `${xs[0]} y ${xs.length - 1} más` : xs[0] ?? "");

const CATEGORIAS = { auto_sustanciacion: "Auto de sustanciación", providencia: "Providencia", razon_notificacion: "Razón de notificación", citacion: "Citación", sentencia: "Sentencia", convocatoria_audiencia: "Convocatoria a audiencia", archivo: "Archivo", recurso: "Recurso", escrito_de_parte: "Escrito de parte", otro: "Otro" };
const DECISIONES = { acepta: "Acepta", acepta_parcialmente: "Acepta parcialmente", rechaza: "Rechaza", inadmite: "Inadmite / improcedente", otro: "Otro" };
/** Tabla del paso 8 del flujograma: actuaciones a las que hay que prestar atención. */
const ATENCION = [
  ["auto_sustanciacion", "Auto de sustanciación", "Decisiones y disposiciones del juez"],
  ["providencia", "Providencia", "Instrucciones y disposiciones procesales"],
  ["razon_notificacion", "Razón de notificación", "Si se dejó constancia de una notificación"],
  ["citacion", "Citación", "Estado de la citación a las partes"],
  ["sentencia", "Sentencia", "Decisión judicial sobre el asunto"],
  ["convocatoria_audiencia", "Convocatoria a audiencia", "Fecha y hora de la diligencia"],
  ["archivo", "Archivo de la causa", "Si existe una disposición de archivo"],
  ["recurso", "Recursos", "Apelaciones u otros recursos y su trámite"],
];

const lista = (items, fn = esc) => (items.length ? `<ul>${items.map((i) => `<li>${fn(i)}</li>`).join("")}</ul>` : `<p class="tenue">Ninguno.</p>`);
const bloque = (titulo, cuerpo, { paso = "", clase = "" } = {}) =>
  `<section class="bloque ${clase}"><header><h3>${esc(titulo)}</h3>${paso ? `<span class="paso-ref">${esc(paso)}</span>` : ""}</header>${cuerpo}</section>`;
const cifra = (etiqueta, valor) => `<div class="cifra"><strong>${esc(valor)}</strong><span>${esc(etiqueta)}</span></div>`;
const ref = (id) => `<span class="ref">${esc(String(id).replace(/^.*-(\d+)$/, "Actuación n.º $1"))}</span>`;
const procs = (ns) => `<span class="ref">${ns.map(esc).join(" · ")}</span>`;
const elegidaDe = (causa) => causa.instancias.find((i) => i.id === causa.seleccion.instanciaId);

/* ───────────── Recorrido del agente: los pasos del flujograma del estudio ───────────── */

function recorridoCausa({ causa }) {
  const e = elegidaDe(causa);
  const acts = causa.actuaciones;
  const cuenta = (cat) => acts.filter((a) => a.analisis.categoria === cat).length;
  const conArchivos = acts.filter((a) => a.documentos.some((d) => d.disponible)).length;
  const ultima = acts[0];
  return [
    { titulo: "1. Ingresar al sistema y localizar el proceso", pasos: [
      [1, "Ingresa al portal de consulta de procesos", esc(causa.fuente.portal)],
      [2, "Selecciona la búsqueda avanzada", "Formulario de búsqueda por criterios abierto"],
      [3, "Identifica el proceso con los datos disponibles", `Número de proceso judicial: <b>${esc(causa.numero)}</b>`],
      [4, "Haz clic en BUSCAR y supera el CAPTCHA", "Verificación CAPTCHA completada por el usuario; el agente continúa desde los resultados"],
    ] },
    { titulo: "2. Abrir el proceso y consultar su estado", pasos: [
      [5, "Identifica la causa correcta entre las carpetas", `${plural(causa.instancias.length, "carpeta", "carpetas")} con ese número. Elegida por dependencia judicial: <b>${esc(e.dependencia)}</b> (certeza ${esc(causa.seleccion.confianza)})`],
      [6, "Abre los movimientos del proceso", `Carpeta abierta · ingreso ${fecha(e.fechaIngreso)} · ${esc(e.materia)} · ${esc(e.tipoAccion)}`],
      [7, "Ve a INFORMACIÓN DEL PROCESO", `${plural(acts.length, "actuación registrada", "actuaciones registradas")}`],
      [8, "Revisa las actuaciones, la más reciente primero", ATENCION.map(([cat, nombre]) => `${esc(nombre)}: <b>${cuenta(cat)}</b>`).join(" · ")],
      [9, "Despliega el contenido de cada actuación", `${plural(acts.length, "actuación leída y resumida", "actuaciones leídas y resumidas")}`],
      [10, "Abre «Ver archivos»", `${plural(conArchivos, "actuación tiene", "actuaciones tienen")} archivos en el portal`],
    ] },
    { titulo: "3. Revisar y descargar los documentos del expediente digital", pasos: [
      [11, "Selecciona la actuación y busca el acceso al documento", "Disponibilidad registrada actuación por actuación"],
      [12, "Abre el documento para verificar su contenido", "Contenido verificado contra el texto publicado en cada actuación"],
      [13, "Descarga el documento si el portal lo permite", "Disponibilidad de descarga registrada. Lo que no está en el portal se solicita a la dependencia judicial"],
    ] },
    { titulo: "4. Revisar el estado actualizado del proceso", pasos: [
      [14, "Revisa la actuación más reciente", `${fecha(ultima.fecha)} · ${esc(ultima.tipo)}`],
      [15, "Genera el reporte integral del caso", `Reporte listo · ${plural(causa.reporte.alertas.length, "alerta", "alertas")} · ${plural(acts.filter((a) => a.analisis.requiereAccion).length, "actuación requiere", "actuaciones requieren")} acción`],
    ] },
  ];
}

function recorridoJuez({ juez }) {
  const f = juez.filtros, n = juez.procesos.length, p = juez.patrones;
  return [
    { titulo: "1. Ingresar al sistema y precisar el juez y tipo de proceso", pasos: [
      [1, "Ingresa al módulo de consulta por juez", esc(juez.fuente.portal)],
      [2, "Se abre «Procesos resueltos por juez» (E-SATJE)", "Módulo abierto"],
      [3, "Identifica los campos de búsqueda", "Identificación · Apellidos y nombres · Materia · Tipo de acción · Asunto o delito"],
      [4, "Ingresa la información del juez", `<b>${esc(juez.juez.nombre)}</b>${juez.juez.cedula ? ` · cédula ${esc(juez.juez.cedula)}` : " · búsqueda por nombre"}`],
    ] },
    { titulo: "2. Aplicar filtros para encontrar procesos específicos", pasos: [
      [5, "Completa los filtros principales", [f.materia && `Materia: <b>${esc(f.materia)}</b>`, f.tipoAccion && `Tipo de acción: <b>${esc(f.tipoAccion)}</b>`, f.asunto && `Asunto: <b>${esc(f.asunto)}</b>`].filter(Boolean).join(" · ") || "Sin filtros adicionales"],
      [6, "Define el período de búsqueda", f.desde && f.hasta ? `${fecha(f.desde)} a ${fecha(f.hasta)}` : "Sin período"],
    ] },
    { titulo: "3. Revisar los resultados de los procesos resueltos", pasos: [
      [7, "El sistema presenta los resultados", `${plural(n, "proceso resuelto", "procesos resueltos")}`],
      [8, "Verifica que correspondan al juez y al tipo de proceso", `La IA revisó los ${n}, sin carga para una persona`],
    ] },
    { titulo: "4. Analizar las decisiones del juez", pasos: [
      [9, "Selecciona procesos resueltos de una misma materia", `${plural(n, "resolución fichada", "resoluciones fichadas")}`],
      [10, "Compara los fundamentos jurídicos", "Normativa · Jurisprudencia · Argumentación · Pruebas · Motivación · Resolución"],
      [11, "Genera el reporte de patrones", `${plural(p.criteriosReiterados.length, "criterio reiterado", "criterios reiterados")} · ${plural(p.cambiosDeInterpretacion.length, "cambio de interpretación", "cambios de interpretación")} · ${plural(p.diferenciasEntreCasosSimilares.length, "diferencia", "diferencias")} entre casos similares`],
    ] },
  ];
}

function recorridoFiscalia({ fiscalia }) {
  const n = fiscalia.noticias, conDetalle = n.filter((x) => x.detalleDisponible).length;
  return [
    { titulo: "1. Ingresar a la consulta de noticias del delito", pasos: [
      [1, "Ingresa al enlace oficial de la Fiscalía", esc(fiscalia.fuente.url)],
      [2, "Identifica los campos de búsqueda", "Noticia del delito · Cédula · RUC · Nombres y apellidos · Placa · Número de oficio"],
    ] },
    { titulo: "2. Buscar la noticia del delito", pasos: [
      [3, "Selecciona el criterio y llena la información", `${esc(fiscalia.consulta.criterio)}: <b>${esc(fiscalia.consulta.valor)}</b>`],
      [4, "Haz clic en BUSCAR DENUNCIA", `${plural(n.length, "denuncia desplegada", "denuncias desplegadas")}`],
    ] },
    { titulo: "3. Información que presenta el sistema", pasos: [
      [5, "Selecciona cada registro y abre su detalle", `Detalle leído en ${conDetalle} de ${n.length}`],
      [6, "Verifica los datos de cada noticia", "Número NDD · Provincia y cantón · Fecha · Hora · Delito · Número de oficio · Unidad fiscal · Sujetos involucrados"],
    ] },
  ];
}

const RECORRIDOS = { causa: recorridoCausa, juez: recorridoJuez, fiscalia: recorridoFiscalia };
const TITULOS = { causa: "Revisión y actualización de la causa", juez: "Historial de causas del juez", fiscalia: "Revisión de noticias del delito · Fiscalía" };
const pintarRecorrido = (fases, estado) => `<div class="recorrido">${fases.map((f) => `
  <div class="fase"><h4>${esc(f.titulo)}</h4><ol>${f.pasos.map(([n, que, resultado]) => `
    <li data-estado="${estado}"><span class="marca-paso" aria-hidden="true"></span><div><p><span class="num">Paso ${n}</span>${esc(que)}</p><p class="resultado">${resultado}</p></div></li>`).join("")}
  </ol></div>`).join("")}</div>`;

/* ───────────── Búsqueda ───────────── */

/** Qué flujo responde a la consulta: la causa por número o por parte, el juez por nombre. */
function resolver(datos, consulta) {
  const q = plano(consulta).trim();
  const palabras = q.split(/[^a-z0-9]+/).filter((p) => p.length > 2);
  const contiene = (texto) => palabras.length > 0 && palabras.every((p) => plano(texto).includes(p));
  if (datos.causa) {
    const e = elegidaDe(datos.causa);
    if (digitos(q).length >= 8 && digitos(q) === digitos(datos.causa.numero)) return "causa";
    if (contiene([...e.actores, ...e.demandados].join(" "))) return "causa";
  }
  if (datos.juez && contiene(datos.juez.juez.nombre)) return "juez";
  if (datos.fiscalia) {
    const f = datos.fiscalia, d = digitos(q);
    if (d.length >= 8 && (d === digitos(f.consulta.valor) || f.noticias.some((x) => x.numero === d))) return "fiscalia";
    if (f.consulta.persona && contiene(f.consulta.persona)) return "fiscalia";
  }
  return null;
}

function vistaBuscar(datos) {
  const filas = [];
  if (datos.causa) {
    const c = datos.causa, e = elegidaDe(c), ultima = c.actuaciones[0];
    filas.push(`<button type="button" class="seguimiento" data-q="${esc(c.numero)}">
      <span class="seg-cab"><b>Función Judicial · ${esc(c.numero)}</b><span class="etiqueta alta">${plural(c.reporte.alertas.length, "alerta", "alertas")}</span></span>
      <span class="seg-titulo">${esc(corto(e.actores))} <i>c.</i> ${esc(corto(e.demandados))}</span>
      <span class="tenue">${esc(e.materia)} · ${esc(e.asunto)} · ${esc(e.dependencia)}</span>
      <span class="seg-pie"><span>Última actuación ${fecha(ultima.fecha)}</span><span>${c.actuaciones.length} actuaciones</span><span>${c.actuaciones.filter((a) => a.analisis.requiereAccion && a.fecha >= new Date(Date.parse(ultima.fecha) - 90 * 86_400_000).toISOString()).length} con acción sugerida en los últimos 90 días</span></span>
    </button>`);
  }
  if (datos.fiscalia) {
    const f = datos.fiscalia, delitos = [...new Set(f.noticias.map((x) => x.delito).filter(Boolean))];
    filas.push(`<button type="button" class="seguimiento" data-q="${esc(f.consulta.valor)}">
      <span class="seg-cab"><b>Fiscalía · Cédula ${esc(f.consulta.valor)}</b><span class="etiqueta ${f.reporte.alertas.length ? "alta" : ""}">${plural(f.reporte.alertas.length, "alerta", "alertas")}</span></span>
      <span class="seg-titulo">${esc(f.consulta.persona ?? f.consulta.valor)}</span>
      <span class="tenue">Noticias del delito · ${delitos.map(esc).join(" · ")}</span>
      <span class="seg-pie"><span>${plural(f.noticias.length, "noticia del delito", "noticias del delito")}</span><span>${f.noticias.filter((x) => !x.detalleDisponible).length} con detalle pendiente</span></span>
    </button>`);
  }
  if (datos.juez) {
    const j = datos.juez;
    filas.push(`<button type="button" class="seguimiento" data-q="${esc(j.juez.nombre)}">
      <span class="seg-cab"><b>Juez</b><span class="etiqueta">${plural(j.procesos.length, "resolución", "resoluciones")}</span></span>
      <span class="seg-titulo">${esc(j.juez.nombre)}</span>
      <span class="tenue">${[j.filtros.materia, j.filtros.tipoAccion].filter(Boolean).map(esc).join(" · ")}</span>
      <span class="seg-pie"><span>${plural(j.patrones.criteriosReiterados.length, "criterio reiterado", "criterios reiterados")}</span></span>
    </button>`);
  }
  return `
    <div class="inicio">
    <section class="heroe">
      <h1>¿Qué causa o qué juez quieres revisar?</h1>
      <p class="bajada">Maya consulta el portal, lee cada actuación del expediente y te entrega el estado actualizado del proceso.</p>
      <form id="form-buscar" role="search">
        <input id="q" type="search" autocomplete="off" aria-label="Número de proceso, parte o juez" placeholder="Número de proceso, nombre de una parte o de un juez">
        <button type="submit">Buscar</button>
      </form>
    </section>
    <div id="progreso" aria-live="polite">
      <section class="bloque">
        <header><h3>En seguimiento</h3><span class="ref">${plural(filas.length, "registro", "registros")}</span></header>
        ${filas.join("")}
      </section>
      ${datos.causa ? `<div class="par">
        ${bloque("Novedades", `<ul class="filas novedades">${datos.causa.actuaciones.slice(0, 5).map((a) => `<li><button type="button" class="novedad" data-q="${esc(datos.causa.numero)}"><span class="nov-cab"><time>${fecha(a.fecha)}</time><span class="etiqueta">${esc(CATEGORIAS[a.analisis.categoria])}</span>${a.analisis.requiereAccion ? `<span class="punto" title="Requiere acción"></span>` : ""}</span><span>${esc(a.analisis.resumen)}</span><span class="ref">Causa ${esc(datos.causa.numero)}</span></button></li>`).join("")}</ul>`)}
        ${bloque("Plazos y audiencias", datos.causa.reporte.plazos.length ? `<ul class="filas">${datos.causa.reporte.plazos.map((p) => `<li><span class="etiqueta ${/^\d{4}-/.test(p.fechaLimite) ? "alta" : "media"}">${/^\d{4}-/.test(p.fechaLimite) ? fecha(p.fechaLimite) : "Sin fecha cierta"}</span><p>${esc(p.descripcion)}</p><span class="ref">Causa ${esc(datos.causa.numero)}</span></li>`).join("")}</ul>` : `<p class="tenue">No hay plazos en curso.</p>`)}
      </div>` : ""}
    </div>
    </div>`;
}

/* ───────────── Flujo I · Causa ───────────── */

function vistaCausa(datos) {
  const { causa } = datos;
  const r = causa.reporte, e = elegidaDe(causa), acts = causa.actuaciones;
  const desde = new Date(Date.parse(acts[0].fecha) - 90 * 86_400_000).toISOString();
  const pendientes = acts.filter((a) => a.analisis.requiereAccion && a.fecha >= desde).length;
  const cuenta = (cat) => acts.filter((a) => a.analisis.categoria === cat).length;
  const conArchivos = acts.filter((a) => a.documentos.some((d) => d.disponible)).length;
  const fechaDe = (id) => fecha(acts.find((a) => a.id === id)?.fecha);
  const anios = new Map();
  for (const a of acts) anios.set(a.fecha.slice(0, 4), (anios.get(a.fecha.slice(0, 4)) ?? 0) + 1);
  const porAnio = [...anios].sort(([a], [b]) => a.localeCompare(b));
  const maxAnio = Math.max(1, ...porAnio.map(([, n]) => n));
  const x = causa.extras;
  const nAct = (id) => String(id).replace(/^.*-(\d+)$/, "$1");
  const nivelConfianza = { alta: "baja", media: "media", baja: "alta" }[causa.seleccion.confianza] ?? "media";
  const html = `
    <section class="portada">
      <div class="portada-izq">
        <p class="sobre">Proceso ${esc(causa.numero)}</p>
        <h1>${esc(corto(e.actores))} <i>c.</i> ${esc(corto(e.demandados))}</h1>
        <p class="meta">${esc(e.materia)} · ${esc(e.tipoAccion)} · ${esc(e.asunto)} · ingreso ${fecha(e.fechaIngreso)}</p>
        <p class="meta">${esc(e.dependencia)}</p>
        <div class="cifras">
          ${cifra("Actuaciones leídas", acts.length)}
          ${cifra("Con acción sugerida, últimos 90 días", pendientes)}
          ${cifra("Carpetas del proceso", causa.instancias.length)}
        </div>
      </div>
      <div class="portada-der">
        <header><h2>Reporte integral del caso</h2><span class="paso-ref">Paso 15</span></header>
        <p class="lectura">${esc(r.resumenEjecutivo)}</p>
      </div>
    </section>

    <nav class="subtabs" role="tablist" aria-label="Secciones del caso">
      <button role="tab" data-panel="resumen" aria-selected="true">Resumen</button>
      <button role="tab" data-panel="seguimiento">Alertas y plazos <span>${r.alertas.length}</span></button>
      <button role="tab" data-panel="expediente">Expediente <span>${acts.length}</span></button>
      ${x ? `<button role="tab" data-panel="preguntas">Preguntas</button>
      <button role="tab" data-panel="escritos">Escritos <span>${x.borradores.length}</span></button>
      <button role="tab" data-panel="cliente">Para el cliente</button>` : ""}
      <button role="tab" data-panel="carpetas">Carpetas y documentos</button>
      <button role="tab" data-panel="recorrido">Recorrido del agente</button>
    </nav>

    <div class="panel" data-panel="resumen">
      ${x && x.despacho.muestras ? bloque("Tiempo de despacho del juzgado", `<div class="despacho"><div class="cifras">${cifra("Mediana de días entre un escrito y el siguiente auto", x.despacho.medianaDias)}${cifra("Nueve de cada diez se despachan en (días)", x.despacho.p90Dias)}${cifra("Máximo observado (días)", x.despacho.maxDias)}</div><div class="columnas-anio">${x.despacho.porAnio.map((d) => `<div title="${d.anio}: mediana ${d.medianaDias} días en ${d.muestras} escritos"><span class="pista"><i style="height:${Math.max(3, (100 * d.medianaDias) / Math.max(1, ...x.despacho.porAnio.map((y) => y.medianaDias)))}%"></i></span><b>${d.medianaDias} d</b><small>${d.anio.slice(2)}</small></div>`).join("")}</div></div><p class="tenue">Calculado sobre ${x.despacho.muestras} escritos de parte de este expediente y el primer auto o providencia posterior a cada uno. Es una aproximación: no distingue qué escrito atiende cada providencia.</p>`) : ""}
    <div class="tablero">
      <section class="tesela">
        <h3>Alertas</h3>
        <strong>${r.alertas.length}</strong>
        <p>${plural(r.alertas.filter((a) => a.nivel === "alta").length, "de nivel alto", "de nivel alto")} · ${plural(r.plazos.length, "plazo", "plazos")} con fecha · ${plural(r.proximosPasos.length, "próximo paso", "próximos pasos")}</p>
        <div class="onda" aria-hidden="true">${Array.from({ length: 32 }, (_, k) => `<i style="height:${8 + Math.round(26 * Math.abs(Math.sin(k * 0.45)) * (1 - Math.abs(k - 16) / 20))}px"></i>`).join("")}</div>
      </section>
      ${bloque("Actuaciones a las que prestar atención", `<ul class="atencion">${ATENCION.map(([cat, nombre, que]) => `<li><button type="button" data-cat="${cat}" ${cuenta(cat) ? "" : "disabled"}><span><b>${esc(nombre)}</b><small>${esc(que)}</small></span><strong>${cuenta(cat)}</strong></button></li>`).join("")}</ul>`, { paso: "Paso 8" })}
      ${bloque("Actividad por año", `<p class="gran">${acts.length} <small>actuaciones</small></p><div class="columnas-anio">${porAnio.map(([anio, n]) => `<div title="${anio}: ${n} actuaciones"><span class="pista"><i style="height:${Math.max(3, (100 * n) / maxAnio)}%"></i></span><b>${n}</b><small>${String(anio).slice(2)}</small></div>`).join("")}</div>`, { paso: "Paso 7" })}
    </div>
      <div class="par">
        ${bloque("Etapa y estado del proceso", `<dl class="pares"><dt>Etapa procesal</dt><dd>${esc(r.etapaProcesal)}</dd><dt>Estado actual</dt><dd>${esc(r.estadoActual)}</dd></dl>`, { paso: "Paso 15" })}
        ${bloque("Actuación más reciente", `<p class="tenue">${fechaDe(r.ultimaActuacion.actuacionId)} · ${ref(r.ultimaActuacion.actuacionId)}</p><p>${esc(r.ultimaActuacion.resumen)}</p><p class="implica"><b>Qué implica.</b> ${esc(r.ultimaActuacion.implicaciones)}</p>`, { paso: "Paso 14" })}
      </div>
    </div>

    <div class="panel" data-panel="seguimiento" hidden>
        ${bloque(`Alertas · ${r.alertas.length}`, r.alertas.length ? `<ul class="alertas">${r.alertas.map((a) => `<li class="${esc(a.nivel)}"><span class="etiqueta ${esc(a.nivel)}">${esc(a.nivel)}</span><p>${esc(a.texto)}</p>${ref(a.actuacionId)}</li>`).join("")}</ul>` : `<p class="tenue">Sin alertas.</p>`)}
      <div class="par">
          ${bloque("Plazos y audiencias", r.plazos.length ? `<ul class="filas">${r.plazos.map((p) => `<li><b>${fecha(p.fechaLimite)}</b> ${esc(p.descripcion)}<br><span class="tenue">${esc(p.base)}</span> ${ref(p.actuacionId)}</li>`).join("")}</ul>` : `<p class="tenue">El expediente no fija plazos con fecha cierta.</p>`)}
          ${bloque("Próximos pasos", `<ol class="pasos-sugeridos">${r.proximosPasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`)}
      </div>
        ${bloque("Hitos del proceso", `<ol class="linea-tiempo">${r.hitos.map((h) => `<li><time>${fecha(h.fecha)}</time><p>${esc(h.hito)}</p>${ref(h.actuacionId)}</li>`).join("")}</ol>`)}
    </div>

    <div class="panel" data-panel="expediente" hidden>
    <section class="bloque" id="expediente">
      <header><h3>Expediente · la actuación más reciente primero</h3><span class="paso-ref">Pasos 7–9</span></header>
      <div class="filtros">
        <input id="exp-q" type="search" placeholder="Buscar en las actuaciones" aria-label="Buscar en las actuaciones">
        <label class="check"><input id="exp-accion" type="checkbox"> Solo las que requieren acción</label>
        <div id="exp-cats" class="chips"></div>
      </div>
      <div id="exp-lista"></div>
    </section>
    </div>

    ${x ? `
    <div class="panel" data-panel="preguntas" hidden>
      <div class="columnas">
        <aside class="lateral">
          ${bloque("Pregunta sobre el expediente", `<ul class="preguntas">${x.preguntas.map((q, i) => `<li><button type="button" data-i="${i}">${esc(q.pregunta)}</button></li>`).join("")}</ul>`)}
        </aside>
        <div class="principal"><section class="bloque" id="respuesta"><p class="tenue">Elige una pregunta para ver la respuesta con las actuaciones que la sustentan.</p></section></div>
      </div>
    </div>

    <div class="panel" data-panel="escritos" hidden>
      ${x.borradores.map((b, i) => `
      <section class="bloque escrito">
        <header><h3>${esc(b.titulo)}</h3><span class="etiqueta media">Borrador para revisión</span></header>
        <div class="escrito-cuerpo">
          <pre class="hoja" id="escrito-${i}">${esc(b.texto)}</pre>
          <aside>
            <div class="acciones"><button type="button" data-copiar="escrito-${i}">Copiar texto</button><button type="button" data-descargar="escrito-${i}" data-nombre="${esc(causa.numero)}-escrito-${i + 1}.txt">Descargar</button></div>
            <div><h5>Por qué presentarlo ahora</h5><p>${esc(b.porQueAhora)}</p><p>${ref(b.actuacionId)}</p></div>
            ${b.datosPorCompletar.length ? `<details class="completar" open><summary><span>Recomendación legal antes de presentar</span><span class="etiqueta media">${plural(b.datosPorCompletar.length, "punto", "puntos")}</span></summary>${lista(b.datosPorCompletar)}</details>` : ""}
          </aside>
        </div>
      </section>`).join("")}
    </div>

    <div class="panel" data-panel="cliente" hidden>
      <section class="bloque correo">
        <header><h3>Reporte para el cliente</h3><span class="etiqueta media">Borrador para revisión</span></header>
        <div class="hoja" id="correo-cliente"><p class="asunto"><b>Asunto:</b> ${esc(x.cliente.asunto)}</p>${x.cliente.parrafos.map((t) => `<p>${esc(t)}</p>`).join("")}<p><b>Próximos pasos</b></p><ul>${x.cliente.proximosPasos.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p>${esc(x.cliente.cierre)}</p></div>
        <div class="acciones"><button type="button" data-copiar="correo-cliente">Copiar texto</button><button type="button" data-descargar="correo-cliente" data-nombre="${esc(causa.numero)}-reporte-cliente.txt">Descargar</button></div>
      </section>
    </div>` : ""}

    <div class="panel" data-panel="carpetas" hidden>
      <div class="columnas">
        <div class="principal">
        ${bloque("Carpeta elegida por la IA", `<p><b>${esc(e.dependencia)}</b></p><p><span class="etiqueta ${nivelConfianza}">Certeza de la elección: ${esc(causa.seleccion.confianza)}</span></p><p class="tenue">${{ alta: "La dependencia coincide con la que el estudio indicó.", media: "El estudio no indicó la dependencia; la IA eligió por actividad del expediente. Conviene confirmarla.", baja: "Los datos no alcanzan para decidir; debe confirmarla un abogado." }[causa.seleccion.confianza] ?? ""}</p><p class="tenue"><b>Por qué esta carpeta</b></p><p class="tenue">${esc(causa.seleccion.justificacion)}</p>
          ${causa.seleccion.otras.length ? `<details class="mas"><summary>Otras ${causa.seleccion.otras.length} carpetas con el mismo número</summary><ul class="filas">${causa.seleccion.otras.map((o) => { const i = causa.instancias.find((x) => x.id === o.instanciaId); return `<li><b>${esc(i?.dependencia ?? o.instanciaId)}</b>${i ? ` <span class="ref">${fecha(i.fechaIngreso)} · ${i.totalActuaciones} act.</span>` : ""}<br><span class="tenue">${esc(o.relacion)}</span></li>`; }).join("")}</ul></details>` : ""}`, { paso: "Paso 5" })}
        </div>
        <aside class="lateral">
        ${bloque("Documentos del expediente digital", `<p><b>${conArchivos}</b> de ${acts.length} actuaciones tienen archivos en el portal.</p>${r.documentosNoDisponibles.length ? `<details class="mas"><summary>${plural(r.documentosNoDisponibles.length, "documento no disponible", "documentos no disponibles")} en el portal</summary>${lista(r.documentosNoDisponibles)}</details>` : ""}<p class="descargo">Que un documento no aparezca no significa que no exista: depende de la Función Judicial y puede solicitarse a la dependencia.</p>`, { paso: "Pasos 10–13" })}
        ${bloque("Partes", `<p class="tenue">Actores</p>${lista(e.actores)}<p class="tenue" style="margin-top:10px">Demandados</p>${lista(e.demandados)}`)}
        </aside>
      </div>
    </div>

    <div class="panel" data-panel="recorrido" hidden>
      ${pintarRecorrido(recorridoCausa(datos), "hecho")}
      <p class="descargo">Expediente de la Fiscalía (FGE): consulta pendiente de configurar el acceso al sistema de Fiscalía.</p>
    </div>`;

  const montar = () => {
    const estado = { cat: null, accion: false, q: "", n: 30, id: null };
    const cats = Object.keys(CATEGORIAS).filter((c) => cuenta(c));
    const pintar = () => {
      $("#exp-cats").innerHTML = [[null, "Todas", acts.length], ...cats.map((c) => [c, CATEGORIAS[c], cuenta(c)])]
        .map(([c, nombre, n]) => `<button type="button" class="chip" data-cat="${c ?? ""}" aria-pressed="${estado.cat === c}">${esc(nombre)} <span>${n}</span></button>`).join("");
      const q = plano(estado.q);
      const filtradas = acts.filter((a) => (!estado.id || a.id === estado.id) && (!estado.cat || a.analisis.categoria === estado.cat) && (!estado.accion || a.analisis.requiereAccion) && (!q || plano(`${a.tipo} ${a.analisis.resumen} ${a.texto}`).includes(q)));
      $("#exp-lista").innerHTML = (estado.id ? `<p class="conteo"><button type="button" id="exp-todas" class="chip" aria-pressed="true">Actuación n.º ${nAct(estado.id)} ✕ ver todas</button></p>` : "") + (filtradas.length ? `<p class="tenue conteo">${plural(filtradas.length, "actuación", "actuaciones")}</p>` : `<p class="tenue conteo">Ninguna actuación coincide con el filtro.</p>`) + filtradas.slice(0, estado.n).map((a) => `
        <details class="actuacion">
          <summary><time>${fecha(a.fecha)}</time><span class="etiqueta">${esc(CATEGORIAS[a.analisis.categoria])}</span><span class="titulo">${esc(a.analisis.resumen)}</span>${a.analisis.requiereAccion ? `<span class="punto" title="Requiere acción"></span>` : ""}</summary>
          <div class="detalle">
            ${a.analisis.requiereAccion ? `<p class="accion"><b>Acción sugerida.</b> ${esc(a.analisis.accionSugerida)}</p>` : ""}
            ${a.analisis.disposiciones.length ? `<div><h5>Disposiciones</h5>${lista(a.analisis.disposiciones)}</div>` : ""}
            ${a.analisis.fechasClave.length ? `<div><h5>Fechas clave</h5>${lista(a.analisis.fechasClave, (f) => `${fecha(f.fecha)} · ${esc(f.concepto)}`)}</div>` : ""}
            <div><h5>Texto en el portal · ${esc(a.tipo)} · ${ref(a.id)}</h5><blockquote>${esc(a.texto)}</blockquote></div>
            ${a.documentos.length ? `<div><h5>Documentos</h5>${lista(a.documentos, (d) => (d.disponible ? (d.archivo ? `<a href="${esc(d.archivo)}">${esc(d.nombre)}</a>` : esc(d.nombre)) : `${esc(d.nombre)} <span class="etiqueta media">no disponible</span>`))}</div>` : ""}
          </div>
        </details>`).join("") + (filtradas.length > estado.n ? `<button type="button" id="exp-mas" class="mas-boton">Mostrar ${Math.min(30, filtradas.length - estado.n)} más</button>` : "");
    };
    const abrir = (panel) => {
      for (const b of document.querySelectorAll(".subtabs button")) b.setAttribute("aria-selected", String(b.dataset.panel === panel));
      for (const d of document.querySelectorAll(".panel")) d.hidden = d.dataset.panel !== panel;
    };
    document.querySelector(".subtabs").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) abrir(b.dataset.panel); });
    document.querySelector(".tesela").addEventListener("click", () => abrir("seguimiento"));
    const filtrarPor = (cat) => { estado.cat = cat || null; estado.id = null; estado.n = 30; pintar(); };
    const verActuacion = (id) => {
      Object.assign(estado, { id, cat: null, accion: false, q: "" });
      $("#exp-q").value = ""; $("#exp-accion").checked = false;
      abrir("expediente");
      pintar();
      const d = document.querySelector("#exp-lista details");
      if (d) d.open = true;
      document.querySelector(".subtabs").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    $("#exp-q").addEventListener("input", (ev) => { estado.q = ev.target.value; estado.n = 30; pintar(); });
    $("#exp-accion").addEventListener("change", (ev) => { estado.accion = ev.target.checked; estado.n = 30; pintar(); });
    $("#exp-cats").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) filtrarPor(b.dataset.cat); });
    $("#exp-lista").addEventListener("click", (ev) => {
      if (ev.target.id === "exp-mas") { estado.n += 30; pintar(); }
      if (ev.target.id === "exp-todas") { estado.id = null; pintar(); }
    });
    if (x) {
      let turno = 0;
      document.querySelector(".preguntas").addEventListener("click", async (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        const mio = ++turno, q = x.preguntas[Number(b.dataset.i)];
        for (const o of document.querySelectorAll(".preguntas button")) o.setAttribute("aria-pressed", String(o === b));
        $("#respuesta").innerHTML = `<header><h3>${esc(q.pregunta)}</h3></header><p class="pensando"><span class="marca-paso"></span>Revisando ${acts.length} actuaciones…</p>`;
        await new Promise((ok) => setTimeout(ok, 900));
        if (mio !== turno) return;
        $("#respuesta").innerHTML = `<header><h3>${esc(q.pregunta)}</h3></header><p class="lectura">${esc(q.respuesta)}</p><div><h5>Sustento en el expediente</h5><div class="chips">${q.actuacionIds.map((id) => { const a = acts.find((y) => y.id === id); return `<button type="button" class="chip" data-act="${esc(id)}">${fecha(a?.fecha)} · n.º ${nAct(id)}</button>`; }).join("")}</div></div>`;
      });
      $("#respuesta").addEventListener("click", (ev) => { const b = ev.target.closest("[data-act]"); if (b) verActuacion(b.dataset.act); });
      document.querySelector("#contenido").addEventListener("click", async (ev) => {
        const copiar = ev.target.closest("[data-copiar]"), bajar = ev.target.closest("[data-descargar]");
        if (copiar) {
          const texto = document.getElementById(copiar.dataset.copiar).innerText;
          try { await navigator.clipboard.writeText(texto); copiar.textContent = "Copiado"; } catch { copiar.textContent = "No se pudo copiar"; }
          setTimeout(() => { copiar.textContent = "Copiar texto"; }, 1800);
        }
        if (bajar) {
          const url = URL.createObjectURL(new Blob([document.getElementById(bajar.dataset.descargar).innerText], { type: "text/plain;charset=utf-8" }));
          Object.assign(document.createElement("a"), { href: url, download: bajar.dataset.nombre }).click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      });
    }
    document.querySelector(".atencion").addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      abrir("expediente");
      filtrarPor(b.dataset.cat);
      document.querySelector(".subtabs").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    pintar();
  };
  return { html, montar };
}

/* ───────────── Flujo II · Juez ───────────── */

function vistaJuez(datos) {
  const { juez } = datos;
  const p = juez.patrones, e = juez.estadisticas, f = juez.filtros;
  const max = (xs) => Math.max(1, ...xs.map((x) => x.n));
  const barras = (xs, etiqueta) => xs.map((x) => `<div class="barra"><span>${esc(etiqueta(x))}</span><span><i style="width:${(100 * x.n) / max(xs)}%"></i></span><span>${x.n}</span></div>`).join("");
  const filtros = [f.materia, f.tipoAccion, f.asunto, f.desde && f.hasta ? `${fecha(f.desde)} a ${fecha(f.hasta)}` : ""].filter(Boolean).map(esc).join(" · ");
  const html = `
    <section class="portada">
      <div class="portada-izq">
        <p class="sobre">Procesos resueltos por juez</p>
        <h1>${esc(juez.juez.nombre)}</h1>
        <p class="meta">${filtros}</p>
        <div class="cifras">
          ${cifra("Resoluciones analizadas", e.total)}
          ${cifra("Criterios reiterados", p.criteriosReiterados.length)}
          ${cifra("Cambios de interpretación", p.cambiosDeInterpretacion.length)}
        </div>
      </div>
      <div class="portada-der">
        <header><h2>Cómo decide este juez</h2><span class="paso-ref">Paso 11</span></header>
        <p class="lectura">${esc(p.resumenEjecutivo)}</p>
      </div>
    </section>

    <div class="columnas">
      <div class="principal">
        ${bloque("Criterios reiterados", p.criteriosReiterados.length ? `<ul class="filas">${p.criteriosReiterados.map((c) => `<li><span class="etiqueta">solidez ${esc(c.solidez)}</span> ${esc(c.criterio)}<br>${procs(c.procesos)}</li>`).join("")}</ul>` : `<p class="tenue">La muestra no muestra criterios reiterados.</p>`, { paso: "Paso 11" })}
        ${bloque("Cambios de interpretación", p.cambiosDeInterpretacion.length ? `<ul class="filas">${p.cambiosDeInterpretacion.map((c) => `<li><b>${esc(c.tema)}</b><dl class="pares"><dt>Antes</dt><dd>${esc(c.antes)}</dd><dt>Después</dt><dd>${esc(c.despues)}</dd></dl>${procs(c.procesos)}</li>`).join("")}</ul>` : `<p class="tenue">No se detectaron cambios.</p>`, { paso: "Paso 11" })}
        ${bloque("Diferencias entre casos aparentemente similares", p.diferenciasEntreCasosSimilares.length ? `<ul class="filas">${p.diferenciasEntreCasosSimilares.map((d) => `<li>${esc(d.descripcion)}<p class="implica"><b>Uso estratégico.</b> ${esc(d.utilidadEstrategica)}</p>${procs(d.procesos)}</li>`).join("")}</ul>` : `<p class="tenue">No se detectaron diferencias.</p>`, { paso: "Paso 11" })}
      </div>
      <aside class="lateral">
        ${bloque(`Resolución · ${e.total} procesos`, barras(e.porDecision, (x) => DECISIONES[x.decision]), { paso: "Paso 10" })}
        ${bloque("Normativa más citada", barras(e.normasMasCitadas, (x) => x.norma), { paso: "Paso 10" })}
        ${bloque("Recomendaciones para litigar ante este juez", lista(p.recomendaciones))}
        ${bloque("Limitaciones del análisis", lista(p.limitaciones))}
      </aside>
    </div>

    <section class="bloque">
      <header><h3>Resoluciones analizadas · ${juez.procesos.length}</h3><span class="paso-ref">Pasos 9–10</span></header>
      ${juez.procesos.map((x) => `
      <details class="actuacion">
        <summary><time>${fecha(x.fechaResolucion)}</time><span class="etiqueta">${esc(DECISIONES[x.ficha.decision])}</span><span class="titulo">${esc(x.asunto)} <span class="ref">${esc(x.numero)}</span></span></summary>
        <div class="detalle">
          <p class="tenue">${esc(x.partes)} · ${esc(x.dependencia)}</p>
          <div><h5>Resolución</h5><p>${esc(x.ficha.criterioResolucion)}</p><blockquote>«${esc(x.ficha.citaTextual)}»</blockquote></div>
          <div><h5>Normativa</h5>${lista(x.ficha.normativa, (n) => `${esc(n.norma)}${n.articulos.length ? `, art. ${n.articulos.map(esc).join(", ")}` : ""}`)}</div>
          <div><h5>Jurisprudencia</h5>${lista(x.ficha.jurisprudencia)}</div>
          <div><h5>Argumentación</h5><p>${esc(x.ficha.argumentacion)}</p></div>
          <div><h5>Pruebas</h5>${lista(x.ficha.pruebas)}</div>
          <div><h5>Motivación</h5><p>${esc(x.ficha.motivacion)}</p></div>
        </div>
      </details>`).join("")}
    </section>

    <details class="bloque plegable">
      <summary><h3>Recorrido del agente · los 11 pasos del flujograma</h3></summary>
      ${pintarRecorrido(recorridoJuez(datos), "hecho")}
    </details>`;
  return { html };
}

/* ───────────── Fiscalía · Noticias del delito ───────────── */

const ROLES = { denunciante: "Denunciante", sospechoso: "Sospechoso", victima: "Víctima", otro: "Otro", no_consta: "No consta" };

function vistaFiscalia(datos) {
  const { fiscalia: f } = datos;
  const r = f.reporte;
  const analisis = new Map(r.noticias.map((x) => [x.numero, x]));
  const cuentaRol = (rol) => r.noticias.filter((x) => x.rolDeLaPersona === rol).length;
  const orden = [...f.noticias].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const dato = (etiqueta, valor) => `<div><dt>${etiqueta}</dt><dd>${valor ? esc(valor) : "—"}</dd></div>`;
  const html = `
    <section class="portada">
      <div class="portada-izq">
        <p class="sobre">Fiscalía General del Estado · Noticias del delito</p>
        <h1>${esc(f.consulta.persona ?? f.consulta.valor)}</h1>
        <p class="meta">${esc(f.consulta.criterio)}: ${esc(f.consulta.valor)} · consulta del ${fecha(f.fuente.capturadoEn)}</p>
        <div class="cifras">
          ${cifra("Noticias del delito", f.noticias.length)}
          ${cifra("Como denunciante", cuentaRol("denunciante"))}
          ${cifra("Como sospechoso", cuentaRol("sospechoso"))}
        </div>
      </div>
      <div class="portada-der">
        <header><h2>Reporte de la consulta</h2><span class="paso-ref">Paso 6</span></header>
        <p class="lectura">${esc(r.resumenEjecutivo)}</p>
      </div>
    </section>

    <nav class="subtabs" role="tablist" aria-label="Secciones de la consulta">
      <button role="tab" data-panel="noticias" aria-selected="true">Noticias del delito <span>${f.noticias.length}</span></button>
      <button role="tab" data-panel="seguimiento">Alertas y próximos pasos <span>${r.alertas.length}</span></button>
      <button role="tab" data-panel="recorrido">Recorrido del agente</button>
    </nav>

    <div class="panel" data-panel="noticias">
      ${orden.map((n) => {
        const a = analisis.get(n.numero);
        const [, unidadNombre, unidadResto] = /^(.*?)\s*-\s*Edi\.\s*-\s*(.*)$/.exec(n.unidad ?? "") ?? [null, n.unidad ?? "", ""];
        const fila = (etiqueta, valor, extra = "") => (valor ? `<div><dt>${etiqueta}</dt><dd>${esc(valor)}${extra ? `<small>${esc(extra)}</small>` : ""}</dd></div>` : "");
        const verificar = a.queVerificar.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])/).filter(Boolean);
        const rolClase = a.rolDeLaPersona === "sospechoso" ? "alta" : a.rolDeLaPersona === "no_consta" ? "media" : "baja";
        return `
      <section class="bloque noticia">
        <header>
          <div>
            <p class="sobre">NDD n.º ${esc(n.numero)}${n.fecha ? ` · ${fecha(n.fecha)}` : ""}${n.hora ? ` · ${esc(n.hora.slice(0, 5))}` : ""}</p>
            <h3>${n.detalleDisponible ? esc(n.delito) : "Detalle pendiente de consultar"}</h3>
          </div>
          <span class="rol ${rolClase}"><small>${esc(f.consulta.persona?.split(" ")[0] ?? "La persona")} figura como</small>${n.detalleDisponible ? esc(ROLES[a.rolDeLaPersona]) : "No consta"}</span>
        </header>
        ${n.detalleDisponible ? `
        <div class="noticia-cuerpo">
          <dl class="datos">
            ${fila("Lugar", n.lugar)}
            ${fila("Tipo de incidente", n.tipoIncidente)}
            ${fila("Unidad fiscal", `${unidadNombre}${n.numFiscalia ? ` · Fiscalía n.º ${n.numFiscalia}` : ""}`, unidadResto.replace(/\s*-\s*Dir\.\s*-\s*/, " · ").replace(/\s*-\s*Telef\.\s*-\s*/, " · Tel. "))}
            ${fila("N.º de oficio", n.nroOficio === "SN" ? "Sin número" : n.nroOficio)}
            ${fila("Digitador", n.digitador)}
          </dl>
          <div>
            <h5>Sujetos involucrados</h5>
            <ul class="sujetos">${n.sujetos.map((x) => `<li><span>${esc(x.nombre)}${x.cedula ? `<small>Cédula ${esc(x.cedula)}</small>` : ""}</span><span class="etiqueta ${/sospech/i.test(x.estado) ? "alta" : ""}">${esc(x.estado)}</span></li>`).join("")}</ul>
            ${n.vehiculos.length ? `<h5 style="margin-top:14px">Vehículos</h5><ul class="sujetos">${n.vehiculos.map((v) => `<li><span>${esc(v.marca)}<small>Placa ${esc(v.placa)}</small></span></li>`).join("")}</ul>` : ""}
          </div>
        </div>` : `<p>${esc(a.resumen)}</p>`}
        <div class="verificar"><h5>Qué verificar en la unidad fiscal</h5><ul>${verificar.map((v) => `<li>${esc(v)}</li>`).join("")}</ul></div>
      </section>`; }).join("")}
      <p class="descargo">Una noticia del delito es el registro de una denuncia: no indica el estado ni el resultado de la investigación. Quien figura como sospechoso conserva la presunción de inocencia (art. 76.2 de la Constitución).</p>
    </div>

    <div class="panel" data-panel="seguimiento" hidden>
      ${bloque(`Alertas · ${r.alertas.length}`, r.alertas.length ? `<ul class="alertas">${r.alertas.map((a) => `<li class="${esc(a.nivel)}"><span class="etiqueta ${esc(a.nivel)}">${esc(a.nivel)}</span><p>${esc(a.texto)}</p><span class="ref">NDD ${esc(a.numero)}</span></li>`).join("")}</ul>` : `<p class="tenue">Sin alertas.</p>`)}
      <div class="par">
        ${bloque("Próximos pasos", `<ol class="pasos-sugeridos">${r.proximosPasos.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`)}
        ${bloque("Lo que esta consulta no permite saber", lista(r.limitaciones))}
      </div>
    </div>

    <div class="panel" data-panel="recorrido" hidden>
      ${pintarRecorrido(recorridoFiscalia(datos), "hecho")}
    </div>`;
  const montar = () => {
    document.querySelector(".subtabs").addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      for (const x of document.querySelectorAll(".subtabs button")) x.setAttribute("aria-selected", String(x === b));
      for (const d of document.querySelectorAll(".panel")) d.hidden = d.dataset.panel !== b.dataset.panel;
    });
  };
  return { html, montar };
}

/* ───────────── Arranque ───────────── */

const ICONOS = {
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  causa: '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h6"/>',
  fiscalia: '<path d="M12 3.5 5 6.5v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9v-5z"/><path d="m9.2 12 2 2 3.6-4"/>',
  juez: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="m5 7-2.5 6a2.7 2.7 0 0 0 5 0zM19 7l-2.5 6a2.7 2.7 0 0 0 5 0z"/>',
};
const TODAS = [["buscar", "Buscar", (d) => ({ html: vistaBuscar(d) })], ["causa", "Causa", vistaCausa], ["juez", "Juez", vistaJuez], ["fiscalia", "Fiscalía", vistaFiscalia]];

async function cargar() {
  const pedido = new URLSearchParams(location.search).get("dataset");
  for (const dataset of pedido ? [pedido] : ["real", "ejemplo"]) {
    if (!/^[\w-]+$/.test(dataset)) continue;
    const r = await fetch(`../data/${dataset}/processed/dashboard.json`);
    if (r.ok) return r.json();
  }
  return null;
}

/* Acceso simulado: no hay autenticación real; "Ingresar" abre la app con o sin credenciales. */
const sesion = {
  leer: () => { try { return sessionStorage.getItem("maya-sesion"); } catch { return null; } },
  guardar: (v) => { try { v ? sessionStorage.setItem("maya-sesion", v) : sessionStorage.removeItem("maya-sesion"); } catch { /* sin almacenamiento */ } },
};
function aplicarSesion(correo) {
  $("#login").hidden = Boolean(correo);
  document.querySelector(".area").hidden = !correo;
  if (correo) $("#usuario-inicial").textContent = correo.trim().charAt(0).toUpperCase() || "M";
  else $("#login-correo").focus();
}
$("#form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  // Demo: entra sin exigir credenciales; si no se escribe un correo se usa uno genérico.
  const correo = $("#login-correo").value.trim() || "abogado@estudiomaya.ec";
  $("#login-error").textContent = "";
  const boton = ev.target.querySelector("button");
  boton.disabled = true;
  boton.textContent = "Ingresando…";
  await new Promise((ok) => setTimeout(ok, 800));
  boton.disabled = false;
  boton.textContent = "Ingresar";
  $("#login-clave").value = "";
  sesion.guardar(correo);
  aplicarSesion(correo);
  window.scrollTo(0, 0);
});
$("#salir").addEventListener("click", () => { sesion.guardar(null); aplicarSesion(null); });
aplicarSesion(sesion.leer());

const datos = await cargar();
if (!datos) {
  $("#contenido").innerHTML = `<p class="vacio">No hay datos procesados. Corre <code>npm run agentes</code>.</p>`;
} else {

  // Causa y Juez aparecen cuando el agente ya los encontró (o si se llega por enlace directo).
  const disponibles = TODAS.filter(([id]) => id === "buscar" || datos[id]);
  const encontrados = new Set([location.hash.slice(1)]);
  let vistas = [];
  const pintarPestanas = () => {
    vistas = disponibles.filter(([id]) => id === "buscar" || encontrados.has(id));
    $("#pestanas").innerHTML = vistas.filter(([id]) => id !== "buscar").map(([id, nombre]) => `<button role="tab" data-vista="${id}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONOS[id]}</svg>${nombre}</button>`).join("");
  };
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let corrida = 0;

  const buscar = async (consulta) => {
    const turno = ++corrida;
    const flujo = resolver(datos, consulta);
    const caja = $("#progreso");
    if (!flujo) {
      caja.querySelector(".sin-resultado")?.remove();
      caja.insertAdjacentHTML("afterbegin", `<p class="sin-resultado">No encontramos «${esc(consulta)}» entre las causas y jueces en seguimiento. Verifica el número de proceso o el nombre.</p>`);
      return;
    }
    caja.innerHTML = `<p class="sobre centro">${TITULOS[flujo]} · en curso</p>${pintarRecorrido(RECORRIDOS[flujo](datos), "pendiente")}`;
    caja.scrollIntoView({ behavior: "smooth", block: "start" });
    const items = [...caja.querySelectorAll("li")];
    for (const [i, item] of items.entries()) {
      item.dataset.estado = "activo";
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });
      await espera(420 + 180 * (i % 3));
      if (turno !== corrida || !item.isConnected) return;
      item.dataset.estado = "hecho";
    }
    await espera(700);
    if (turno !== corrida || !items[0].isConnected) return;
    encontrados.add(flujo);
    pintarPestanas();
    mostrar(flujo);
  };

  const mostrar = (pedida) => {
    const [id, , vista] = vistas.find(([v]) => v === pedida) ?? vistas[0];
    corrida++;
    const { html, montar } = vista(datos);
    $("#contenido").innerHTML = html;
    document.body.dataset.vista = id;
    for (const b of $("#pestanas").children) b.setAttribute("aria-selected", String(b.dataset.vista === id));
    history.replaceState(null, "", `#${id}`);
    montar?.();
    if (id === "buscar") {
      $("#form-buscar").addEventListener("submit", (ev) => { ev.preventDefault(); const q = $("#q").value.trim(); if (q) buscar(q); });
      for (const b of document.querySelectorAll(".seguimiento, .novedad")) b.addEventListener("click", () => { $("#q").value = b.dataset.q; buscar(b.dataset.q); });
    }
    window.scrollTo(0, 0);
  };

  pintarPestanas();
  $("#pestanas").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) mostrar(b.dataset.vista); });
  for (const a of document.querySelectorAll(".marca")) a.addEventListener("click", (ev) => { ev.preventDefault(); mostrar("buscar"); });
  $("#buscar-top").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = $("#q-top").value.trim();
    if (!q) return;
    mostrar("buscar");
    $("#q").value = q;
    $("#q-top").value = "";
    buscar(q);
  });
  mostrar(vistas.some(([v]) => v === location.hash.slice(1)) ? location.hash.slice(1) : "buscar");
}
