# Captura de datos del portal

## El CAPTCHA

La búsqueda del portal (`/busqueda-filtros` y `/busqueda-por-juez`) exige un reCAPTCHA "No soy un robot" antes de habilitar el botón BUSCAR. La demo no lo resuelve ni lo evita por otra vía: lo marca una persona. Por eso la captura es un paso manual y único, y los agentes trabajan sobre lo guardado.

Para un producto en operación hay dos caminos legítimos:

1. **Persona en el circuito.** Un asistente del estudio abre la consulta y supera el CAPTCHA; desde ahí la herramienta lee y guarda el expediente. Sirve para un volumen moderado de causas.
2. **Acceso institucional.** Gestionar con el Consejo de la Judicatura un mecanismo de consulta para el estudio. Es el camino para seguimiento automático diario de muchas causas.

## Procedimiento para la demo

1. Abrir el portal, ingresar el criterio de búsqueda y marcar el CAPTCHA.
2. Flujo I: abrir la carpeta de actuaciones de cada instancia y guardar fecha, tipo y texto de cada actuación, y la lista de documentos con su disponibilidad. Los PDF van en `data/real/raw/documentos/`, que no se sube al repositorio.
3. Flujo II: en "Procesos resueltos por juez", aplicar los filtros y guardar el texto de cada resolución.
4. Dejar el resultado en `data/real/raw/causa.json` y `data/real/raw/juez.json` con el formato de `src/schemas.ts`, y correr `npm run validar`.

En `causa.json`, el campo `criterio` recoge lo que el abogado sabe del caso (dependencia esperada, parte que patrocina). El agente lo usa para elegir la carpeta correcta cuando el mismo número tiene varias.

## Lo que no depende de la herramienta

No todos los documentos del expediente están disponibles para descarga: la digitalización de la Función Judicial es progresiva. Un documento ausente en el portal puede existir en el expediente físico y pedirse en la dependencia judicial. El dashboard lista esos documentos por separado y lleva el aviso al cliente.

## Fiscalía

El documento pide revisar también el expediente de la Fiscalía General del Estado, pero el enlace que trae para "Sistemas Fiscalía" es el mismo del portal judicial. Falta el enlace correcto para incorporar esa fuente.
