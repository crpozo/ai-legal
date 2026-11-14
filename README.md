# Tomos · Demo Estudio Jurídico Maya

Agentes de IA que siguen los dos flujos del documento "Demo Estudio Maya" sobre el portal E-SATJE de la Función Judicial del Ecuador, y un dashboard que muestra el resultado.

| Flujo | Qué hace | Agentes |
|---|---|---|
| I. Revisión y actualización de causas | Elige la carpeta correcta del proceso, clasifica cada actuación y redacta el reporte integral: estado, plazos, alertas y próximos pasos | `seleccion-instancia`, `analisis-actuaciones`, `reporte-causa` |
| II. Historial de causas del juez | Ficha cada resolución del juez y compara las fichas: criterios reiterados, cambios de interpretación y diferencias entre casos similares | `ficha-sentencia`, `patrones-juez` |

## Cómo está pensado el costo

La demo se paga una vez y después es gratis.

- **Captura única.** El expediente se consulta una vez y se guarda en `data/<dataset>/raw/`. No hay scraper corriendo.
- **Caché en disco.** Cada respuesta de un agente se guarda en `data/<dataset>/cache/`. Volver a correr sobre los mismos datos no hace ninguna llamada al modelo.
- **Dos niveles de modelo.** Las tareas mecánicas y numerosas (clasificar actuaciones, fichar resoluciones) usan Claude Haiku 5.5. Las dos síntesis que el abogado lee (reporte de la causa y patrones del juez) usan Claude Opus 5.5. Ambos se cambian con `MODEL_EXTRACCION` y `MODEL_REPORTE`.
- **Conteos en código.** Las estadísticas del juez no pasan por un modelo.
- **Sin infraestructura.** El dashboard son archivos estáticos que leen un JSON. No hay servidor, base de datos ni funciones.

El pipeline imprime el costo por agente al terminar y el dashboard lo muestra en "Agentes y costos".

## Uso

Requiere Node 22.

```bash
npm install
cp .env.example .env        # y completar las credenciales del modelo
npm run agentes -- real     # procesa data/real/raw y escribe data/real/processed/dashboard.json
npm run dashboard           # http://localhost:4173
```

`npm run agentes -- ejemplo` procesa el dataset ficticio. `npm run validar` revisa todos los datasets contra los esquemas de `src/schemas.ts`.

El dashboard muestra `data/real` si existe y, si no, `data/ejemplo`. Con `?dataset=ejemplo` se fuerza uno.

## Datos

- `data/ejemplo/` es **ficticio**: partes, juez y procesos inventados para probar el flujo. Su `processed/dashboard.json` es una maqueta escrita a mano y el dashboard lo avisa. Se reemplaza al correr `npm run agentes -- ejemplo`.
- `data/real/` es para la captura del portal. El formato está en `src/schemas.ts` (`CausaRaw` y `JuezRaw`) y el procedimiento en [docs/captura.md](docs/captura.md).

## Salvaguardas

- Cada hito, plazo y alerta cita la actuación que lo sustenta, y cada patrón cita los procesos. El pipeline falla si un agente cita algo que no existe en los datos.
- Los agentes reportan solo lo que consta en el texto. Un plazo que depende de una fecha ausente se marca como no determinable.
- El pie del dashboard lleva el aviso sobre la disponibilidad de documentos, que depende de la Función Judicial.
- Los análisis son apoyo para el abogado, no asesoría jurídica automatizada.
