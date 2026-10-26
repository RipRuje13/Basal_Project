# Verificación — 4º calendario "Servicios Web" (dominios)

Evidencia de la verificación obligatoria ejecutada en esta iteración (primera
iteración: no existía `sw-review.json`, se implementó design.md desde cero).
El revisor NO necesita re-ejecutar las suites; aquí están los comandos y sus
resultados.

## 1. `node --check` (sintaxis) — todos exit 0

```
node --check src/services/serviciosWeb.service.js    -> exit 0
node --check src/services/calendarios.service.js     -> exit 0
node --check src/ui/js/calendarios.js                -> exit 0
node --check src/ui/js/calendariosDashboard.js       -> exit 0
node --check src/ui/js/dashboard.js                  -> exit 0
node --check src/ui/js/notificaciones.js             -> exit 0
node --check src/ui/js/serviciosWeb.test.js          -> exit 0
```

Salida vacía en todos (sin errores de sintaxis).

## 2. Script de humo `_verify_dominios.js` — exit 0 y limpieza confirmada

`node _verify_dominios.js` -> **EXIT CODE: 0**. Salida (resumen):

```
Conectado a SQLite
  OK  seed crea el calendario servicios_web
  OK  rechaza dominio vacío
  OK  rechaza fecha con formato inválido
  OK  rechaza fecha irreal (2025-13-40)
  OK  rechaza monto negativo
  OK  crearDominio con datos válidos -> id N
  OK  monto '1200.50' se guarda como 1200.5
  OK  monto vacío -> NULL
  OK  obtenerDominios ordena por fecha ASC
  OK  obtenerDominiosPorMes lista el dominio en su mes
  OK  actualizarDominio funciona
  OK  obtenerEventosDominiosParaNotificar shape correcto
  OK  obtenerEventosParaNotificar incluye el evento-dominio (UNION)
TODAS LAS VERIFICACIONES PASARON
Limpieza: dominio de prueba eliminado.
```

Cubre: seed del calendario `servicios_web`; creación de tabla `dominios_web`;
`crearDominio` con dominio+fecha válidos; rechazo de dominio vacío, fecha con
formato inválido, fecha irreal (`2025-13-40`) y monto negativo; `monto` vacío
-> NULL y `'1200.50'` -> `1200.5`; `obtenerDominios` orden fecha ASC;
`obtenerDominiosPorMes`; `actualizarDominio`; shape de
`obtenerEventosDominiosParaNotificar` (`dia_id 'dom-<id>'`, `motivo_origen
'servicios_web'`, `motivo_nombre = dominio`, los 5 campos de ajuste presentes);
y el UNION en `calendariosService.obtenerEventosParaNotificar()`.

El script se envolvió en `try/finally`, usó un nombre con marca de tiempo única
(`__verify__<Date.now()>.test`), eliminó sus filas de prueba y **se borró del
repo tras verificar** (no quedó commiteado). No se tocaron datos reales.

## 3. `node --test` — todo verde

```
node --test src/ui/js/serviciosWeb.test.js
  tests 4  | pass 4  | fail 0        (EXIT 0)

node --test src/ui/js/notificaciones.test.js
  tests 15 | pass 15 | fail 0        (EXIT 0)   (incluye 4 tests nuevos de dominios + regresión)

node --test src/ui/js/dashboard.test.js
  tests 13 | pass 13 | fail 0        (EXIT 0)   (regresión: sin cambios en resultados)
```

- `serviciosWeb.test.js`: `diffEnDiasIso` (signo a-b, inválidos, desbordamiento),
  `colorPorVencimiento` (fronteras -1/0/15 rojo, 16/45 ámbar, 46 verde, inválido
  gris), shape de `construirEventoDominio` (copia de ajuste y contrato
  `ajuste || dominioRow`).
- `notificaciones.test.js`: tests añadidos del disparo de dominio — "Vence hoy
  el dominio ..." (día), singular "en 1 día", borde `hoy+5/antelación=5` -> 1
  aviso "en 5 días", y negativo `hoy+5/antelación=1` -> `[]`. Las ramas
  `departamento` y genérica siguen pasando (regresión).

## 4. Diagnósticos

No hay herramienta de diagnósticos adicional en el entorno; `node --check` y las
suites `node:test` cubren la verificación headless. La verificación de DOM/Electron
(render de tarjeta, cuadrícula, Agenda y notificación nativa) es manual por
requerir `BrowserWindow`/`Notification` (design.md §9.4).
