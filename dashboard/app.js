const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(iso);
};
const CATEGORIAS = { auto_sustanciacion: "Auto de sustanciación", providencia: "Providencia", razon_notificacion: "Razón de notificación", citacion: "Citación", sentencia: "Sentencia", convocatoria_audiencia: "Convocatoria a audiencia", archivo: "Archivo", recurso: "Recurso", escrito_de_parte: "Escrito de parte", otro: "Otro" };
const DECISIONES = { acepta: "Acepta", acepta_parcialmente: "Acepta parcialmente", rechaza: "Rechaza", inadmite: "Inadmite / improcedente", otro: "Otro" };
const lista = (items, fn = esc) => (items.length ? `<ul>${items.map((i) => `<li>${fn(i)}</li>`).join("")}</ul>` : `<p class="dato">Ninguno.</p>`);
const tarjeta = (titulo, cuerpo, clase = "") => `<section class="tarjeta ${clase}"><h3>${esc(titulo)}</h3>${cuerpo}</section>`;
const cifra = (etiqueta, valor) => `<div class="cifra"><span>${esc(etiqueta)}</span><strong>${esc(valor)}</strong></div>`;
const ref = (id) => `<span class="ref">Actuación ${esc(id)}</span>`;
const procs = (ns) => `<span class="ref">${ns.map(esc).join(" · ")}</span>`;

function vistaCausa({ causa }) {
  const r = causa.reporte;
  const elegida = causa.instancias.find((i) => i.id === causa.seleccion.instanciaId);
  const pendientes = causa.actuaciones.filter((a) => a.analisis.requiereAccion).length;
  return `
    <section class="tarjeta">
      <p class="dato">Proceso <b>${esc(causa.numero)}</b> · ${esc(elegida.materia)} · ${esc(elegida.tipoAccion)}</p>
      <h2>${esc(elegida.actores.join(", "))} c. ${esc(elegida.demandados.join(", "))}</h2>
      <p class="dato">${esc(elegida.dependencia)} · ingreso ${fecha(elegida.fechaIngreso)} · ${esc(elegida.asunto)}</p>
      <p class="destacado" style="margin-top:12px">${esc(r.resumenEjecutivo)}</p>
    </section>
    <div class="cifras">
      ${cifra("Etapa procesal", r.etapaProcesal)}
      ${cifra("Actuaciones", causa.actuaciones.length)}
      ${cifra("Requieren acción", pendientes)}
      ${cifra("Alertas", r.alertas.length)}
    </div>
    <div class="fila">
      ${tarjeta("Última actuación", `<p><span class="fecha">${fecha(causa.actuaciones.find((a) => a.id === r.ultimaActuacion.actuacionId)?.fecha)}</span> ${ref(r.ultimaActuacion.actuacionId)}</p><p>${esc(r.ultimaActuacion.resumen)}</p><p class="dato"><b>Qué implica:</b> ${esc(r.ultimaActuacion.implicaciones)}</p>`)}
      ${tarjeta("Estado actual", `<p>${esc(r.estadoActual)}</p>`)}
    </div>
    <div class="fila">
      ${tarjeta("Alertas", r.alertas.length ? `<ul class="lista">${r.alertas.map((a) => `<li><span class="etiqueta ${esc(a.nivel)}">${esc(a.nivel)}</span> ${esc(a.texto)} ${ref(a.actuacionId)}</li>`).join("")}</ul>` : `<p class="dato">Sin alertas.</p>`)}
      ${tarjeta("Plazos y audiencias", r.plazos.length ? `<ul class="lista">${r.plazos.map((p) => `<li><b>${fecha(p.fechaLimite)}</b> · ${esc(p.descripcion)}<br><span class="dato">${esc(p.base)}</span> ${ref(p.actuacionId)}</li>`).join("")}</ul>` : `<p class="dato">El expediente no fija plazos.</p>`)}
    </div>
    <div class="fila">
      ${tarjeta("Próximos pasos", lista(r.proximosPasos))}
      ${tarjeta("Hitos del proceso", `<ul class="lista">${r.hitos.map((h) => `<li><span class="fecha">${fecha(h.fecha)}</span> · ${esc(h.hito)} ${ref(h.actuacionId)}</li>`).join("")}</ul>`)}
    </div>
    <div class="fila">
      ${tarjeta("Carpeta elegida por la IA", `<p><b>${esc(elegida.dependencia)}</b> <span class="etiqueta ${causa.seleccion.confianza === "alta" ? "baja" : causa.seleccion.confianza === "media" ? "media" : "alta"}">confianza ${esc(causa.seleccion.confianza)}</span></p><p class="dato">${esc(causa.seleccion.justificacion)}</p>${causa.seleccion.otras.length ? `<p class="dato"><b>Otras carpetas del mismo número:</b></p>${lista(causa.seleccion.otras, (o) => `${esc(causa.instancias.find((i) => i.id === o.instanciaId)?.dependencia ?? o.instanciaId)}: ${esc(o.relacion)}`)}` : ""}`)}
      ${tarjeta("Documentos no disponibles en el portal", `${lista(r.documentosNoDisponibles)}<p class="dato" style="margin-top:10px">Que no aparezcan no significa que no existan: se pueden solicitar a la dependencia judicial.</p>`)}
    </div>
    ${tarjeta(`Expediente · ${causa.actuaciones.length} actuaciones, la más reciente primero`, causa.actuaciones.map((a) => `
      <details>
        <summary><span class="fecha">${fecha(a.fecha)}</span><span class="etiqueta">${esc(CATEGORIAS[a.analisis.categoria])}</span><span class="titulo">${esc(a.analisis.resumen)}</span></summary>
        <div class="detalle">
          ${a.analisis.requiereAccion ? `<p class="accion">Acción sugerida: ${esc(a.analisis.accionSugerida)}</p>` : ""}
          ${a.analisis.disposiciones.length ? `<div><b>Disposiciones</b>${lista(a.analisis.disposiciones)}</div>` : ""}
          ${a.analisis.fechasClave.length ? `<div><b>Fechas clave</b>${lista(a.analisis.fechasClave, (f) => `${fecha(f.fecha)} · ${esc(f.concepto)}`)}</div>` : ""}
          <div><b>Texto en el portal</b> · ${esc(a.tipo)} · ${ref(a.id)}<blockquote>${esc(a.texto)}</blockquote></div>
          ${a.documentos.length ? `<div><b>Documentos</b>${lista(a.documentos, (d) => (d.disponible ? (d.archivo ? `<a href="${esc(d.archivo)}">${esc(d.nombre)}</a>` : esc(d.nombre)) : `${esc(d.nombre)} <span class="etiqueta media">no disponible</span>`))}</div>` : ""}
        </div>
      </details>`).join(""), "ancha")}`;
}

function vistaJuez({ juez }) {
  const p = juez.patrones, e = juez.estadisticas, f = juez.filtros;
  const max = (xs) => Math.max(1, ...xs.map((x) => x.n));
  const barras = (xs, etiqueta) => xs.map((x) => `<div class="barra"><span>${esc(etiqueta(x))}</span><span><i style="width:${(100 * x.n) / max(xs)}%"></i></span><span>${x.n}</span></div>`).join("");
  const filtros = [f.materia, f.tipoAccion, f.asunto, f.desde && f.hasta ? `${fecha(f.desde)} a ${fecha(f.hasta)}` : ""].filter(Boolean).map(esc).join(" · ");
  return `
    <section class="tarjeta">
      <p class="dato">Procesos resueltos por juez · ${filtros}</p>
      <h2>${esc(juez.juez.nombre)}</h2>
      <p class="destacado" style="margin-top:12px">${esc(p.resumenEjecutivo)}</p>
    </section>
    <div class="fila">
      ${tarjeta(`Cómo resolvió · ${e.total} procesos`, barras(e.porDecision, (x) => DECISIONES[x.decision]))}
      ${tarjeta("Normativa más citada · procesos que la invocan", barras(e.normasMasCitadas, (x) => x.norma))}
    </div>
    ${tarjeta("Criterios reiterados", p.criteriosReiterados.length ? `<ul class="lista">${p.criteriosReiterados.map((c) => `<li><span class="etiqueta">solidez ${esc(c.solidez)}</span> ${esc(c.criterio)}<br>${procs(c.procesos)}</li>`).join("")}</ul>` : `<p class="dato">La muestra no muestra criterios reiterados.</p>`)}
    <div class="fila">
      ${tarjeta("Cambios de interpretación", p.cambiosDeInterpretacion.length ? `<ul class="lista">${p.cambiosDeInterpretacion.map((c) => `<li><b>${esc(c.tema)}</b><br><span class="dato"><b>Antes:</b> ${esc(c.antes)}</span><br><span class="dato"><b>Después:</b> ${esc(c.despues)}</span><br>${procs(c.procesos)}</li>`).join("")}</ul>` : `<p class="dato">No se detectaron cambios.</p>`)}
      ${tarjeta("Diferencias entre casos similares", p.diferenciasEntreCasosSimilares.length ? `<ul class="lista">${p.diferenciasEntreCasosSimilares.map((d) => `<li>${esc(d.descripcion)}<br><span class="dato"><b>Uso estratégico:</b> ${esc(d.utilidadEstrategica)}</span><br>${procs(d.procesos)}</li>`).join("")}</ul>` : `<p class="dato">No se detectaron diferencias.</p>`)}
    </div>
    <div class="fila">
      ${tarjeta("Recomendaciones para litigar ante este juez", lista(p.recomendaciones))}
      ${tarjeta("Limitaciones del análisis", lista(p.limitaciones))}
    </div>
    ${tarjeta(`Resoluciones analizadas · ${juez.procesos.length}`, juez.procesos.map((x) => `
      <details>
        <summary><span class="fecha">${fecha(x.fechaResolucion)}</span><span class="etiqueta">${esc(DECISIONES[x.ficha.decision])}</span><span class="titulo">${esc(x.asunto)} <span class="ref">${esc(x.numero)}</span></span></summary>
        <div class="detalle">
          <p>${esc(x.partes)} · ${esc(x.dependencia)}</p>
          <div><b>Criterio de resolución</b><p>${esc(x.ficha.criterioResolucion)}</p><blockquote>«${esc(x.ficha.citaTextual)}»</blockquote></div>
          <div><b>Normativa</b>${lista(x.ficha.normativa, (n) => `${esc(n.norma)}${n.articulos.length ? `, art. ${n.articulos.map(esc).join(", ")}` : ""}`)}</div>
          <div><b>Jurisprudencia</b>${lista(x.ficha.jurisprudencia)}</div>
          <div><b>Argumentación</b><p>${esc(x.ficha.argumentacion)}</p></div>
          <div><b>Pruebas</b>${lista(x.ficha.pruebas)}</div>
          <div><b>Motivación</b><p>${esc(x.ficha.motivacion)}</p></div>
        </div>
      </details>`).join(""), "ancha")}`;
}

function vistaAgentes({ costos, meta, causa, juez }) {
  const paso = (titulo, texto) => `<div class="paso"><b>${titulo}</b>${texto}</div>`;
  const n = (v) => v.toLocaleString("es-EC");
  return `
    ${tarjeta("Flujo I · Revisión y actualización de causas", `<div class="flujo">
      ${paso("1 · Captura", "Una persona abre el portal y supera el CAPTCHA. El expediente se guarda una sola vez.")}
      ${paso("2 · Selección de carpeta", "Un agente elige la instancia correcta por la dependencia judicial.")}
      ${paso("3 · Análisis de actuaciones", "Un agente clasifica cada actuación y extrae disposiciones y fechas.")}
      ${paso("4 · Reporte integral", "Un agente redacta estado, plazos, alertas y próximos pasos.")}</div>`)}
    ${tarjeta("Flujo II · Historial de causas del juez", `<div class="flujo">
      ${paso("1 · Captura", "Una persona consulta los procesos resueltos por el juez y supera el CAPTCHA.")}
      ${paso("2 · Ficha por resolución", "Un agente extrae normativa, jurisprudencia, pruebas, motivación y criterio.")}
      ${paso("3 · Estadísticas", "Conteos calculados en código, sin modelo y sin costo.")}
      ${paso("4 · Patrones", "Un agente compara las fichas: criterios reiterados, cambios y diferencias.")}</div>`)}
    ${tarjeta("Costo de la corrida", meta.origen === "agentes" ? `
      <div class="tabla"><table>
        <thead><tr><th>Agente</th><th>Modelo</th><th class="num">Llamadas</th><th class="num">Tokens entrada</th><th class="num">Tokens salida</th><th class="num">USD</th></tr></thead>
        <tbody>${costos.porAgente.map((a) => `<tr><td>${esc(a.agente)}</td><td>${esc(a.modelo)}</td><td class="num">${a.llamadas}</td><td class="num">${n(a.tokensEntrada)}</td><td class="num">${n(a.tokensSalida)}</td><td class="num">$${a.usd.toFixed(4)}</td></tr>`).join("")}
        <tr><td colspan="5"><b>Total de la corrida</b></td><td class="num"><b>$${costos.totalUsd.toFixed(4)}</b></td></tr></tbody>
      </table></div>
      <p class="dato" style="margin-top:10px">Se paga una sola vez: cada respuesta queda en caché en disco y el dashboard es un archivo estático. Volver a abrirlo o volver a correr los agentes sobre los mismos datos no cuesta nada.</p>`
      : `<p class="dato">Esta maqueta se escribió a mano para mostrar el formato. Los agentes todavía no han corrido, así que no hay costo que reportar.</p>`)}
    ${tarjeta("Fuentes", `<ul class="lista">
      <li><b>Causa ${esc(causa.numero)}</b> · ${esc(causa.fuente.portal)} · capturado ${fecha(causa.fuente.capturadoEn)}<br><span class="dato">${esc(causa.fuente.metodo)}</span></li>
      <li><b>${esc(juez.juez.nombre)}</b> · ${esc(juez.fuente.portal)} · capturado ${fecha(juez.fuente.capturadoEn)}<br><span class="dato">${esc(juez.fuente.metodo)}</span></li></ul>`)}`;
}

const VISTAS = [["causa", "Causa", vistaCausa], ["juez", "Juez", vistaJuez], ["agentes", "Agentes y costos", vistaAgentes]];

async function cargar() {
  const pedido = new URLSearchParams(location.search).get("dataset");
  for (const dataset of pedido ? [pedido] : ["real", "ejemplo"]) {
    if (!/^[\w-]+$/.test(dataset)) continue;
    const r = await fetch(`../data/${dataset}/processed/dashboard.json`);
    if (r.ok) return r.json();
  }
  return null;
}

const datos = await cargar();
if (!datos) {
  $("#contenido").innerHTML = `<p class="vacio">No hay datos procesados. Corre <code>npm run agentes</code>.</p>`;
} else {
  const avisos = [];
  if (datos.meta.ficticio) avisos.push("Datos ficticios de ejemplo: las partes, el juez y los procesos no existen.");
  if (datos.meta.origen === "ejemplo-manual") avisos.push("Los análisis de esta vista son una maqueta escrita a mano, no resultados de los agentes.");
  $("#aviso").innerHTML = avisos.length ? `<p class="aviso" role="status">${avisos.map(esc).join(" ")}</p>` : "";
  $("#pie-meta").textContent = `Dataset "${datos.meta.dataset}" · generado ${fecha(datos.meta.generadoEn)}`;
  const mostrar = (id) => {
    const [, , vista] = VISTAS.find(([v]) => v === id) ?? VISTAS[0];
    $("#contenido").innerHTML = vista(datos);
    for (const b of $("#pestanas").children) b.setAttribute("aria-selected", String(b.dataset.vista === id));
    history.replaceState(null, "", `#${id}`);
  };
  $("#pestanas").innerHTML = VISTAS.map(([id, nombre]) => `<button role="tab" data-vista="${id}">${nombre}</button>`).join("");
  $("#pestanas").addEventListener("click", (e) => e.target.dataset.vista && mostrar(e.target.dataset.vista));
  mostrar(VISTAS.some(([v]) => v === location.hash.slice(1)) ? location.hash.slice(1) : "causa");
}
