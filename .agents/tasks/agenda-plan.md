# Plan de implementación — Panel "Agenda" en Inicio

Reemplaza el panel "Últimos Movimientos" de la página de Inicio por un panel
"Agenda" que muestra SOLO pendientes, en dos subsecciones visualmente separadas
dentro de la misma tarjeta (col-lg-4): (1) avisos de calendarios de la semana
actual lun–vie, (2) actividades pendientes. Cada ítem es clicable y navega a su
página.

## Decisiones de diseño (tomadas aquí, documentadas)

- **Sin dependencias nuevas.** Se reutiliza el stack existente: SQLite vía los
  servicios, IIFE en el renderer, `node:test` para pruebas. No se toca
  `package.json`.
- **Testabilidad de fechas (patrón del repo).** El cálculo de semana y el filtro
  de eventos se extraen a **funciones puras** exportadas con el guard
  `if (typeof module !== 'undefined' && module.exports)` al final de la IIFE,
  idéntico a `src/ui/js/notificaciones.js`. Un `.test.js` las prueba con
  `node --test` (ya se verificó que ese harness corre en este entorno y que
  requerir un JS del renderer no rompe aunque cargue el servicio). Los efectos de
  DOM/servicios siguen detrás de `typeof document !== 'undefined'`, que ya es como
  arranca `dashboard.js`.
- **Ventana de la semana = "de hoy en adelante dentro de la semana lun–vie".**
  Se calcula el lunes y el viernes de la semana que contiene a HOY. Un evento
  entra si su fecha (cadena `'YYYY-MM-DD'`) cumple `fecha >= max(hoy, lunes)` y
  `fecha <= viernes`. Es decir: nunca se muestran días ya pasados de esta semana,
  ni sábado/domingo, ni días de otra semana. Comparación SIEMPRE por cadena
  `'YYYY-MM-DD'` (orden lexicográfico == orden cronológico) para evitar desfases
  de zona horaria; los Date solo se usan para derivar lunes/viernes con
  `new Date(anio, mes-1, dia)` (constructor local, sin UTC).
  - lunes = retroceder `(getDay()+6)%7` días desde hoy.
  - viernes = lunes + 4 días.
- **Orden de actividades pendientes.** Primero por prioridad Alta > Media > Baja
  (peso 0/1/2; prioridad desconocida o vacía va al final, peso 3). Desempate:
  **más antiguas primero** dentro de la misma prioridad. `obtenerActividades()`
  llega ordenado por `id DESC`; como el id es autoincremental, menor id = más
  antigua, así que el desempate es por `id ASC`.
- **Máximo 5 actividades visibles.** Si hay más de 5 pendientes tras ordenar, se
  muestran 5 y una línea final `y N más…` (N = total − 5), no clicable.
- **Escapado.** Todo texto derivado de datos de usuario (motivo, departamento,
  título) se pasa por un `escaparHtml` local (copia exacta del de `compras.js`:
  reemplaza `& < > "`). Los list-items se construyen con `innerHTML` para poder
  pintar el puntito de color; por eso el escapado es obligatorio.
- **Color del puntito (avisos).** Si el día trae `color_valor` (hex ya validado
  por el servicio con `/^#[0-9a-f]{6}$/`), se pinta un `<span>` con
  `style="background-color: <hex>"`. El hex NO se escapa (no es texto libre y ya
  está validado), igual que en `calendariosDashboard.js`. Si no hay color, no se
  pinta puntito.
- **Degradación por fuente.** Cada subsección se arma dentro de su propio
  `try/catch`; si una fuente falla, se registra en consola y la otra subsección
  igual se pinta. Si ambas quedan vacías, el panel muestra
  `Sin pendientes para esta semana`. Nunca se rompe la gráfica, los KPIs ni los
  calendarios (el panel Agenda vive en su propia función, aislado de `initDashboard`).
- **Contenedor.** Se renombra el header a "Agenda" y se sustituye
  `<ul id="movementList">` por `<div id="agendaLista">` (dos subsecciones las
  inyecta el JS). Se actualiza `dashboard.js` para apuntar al nuevo id.

## Formato exacto de cada texto

**Avisos de calendario** (ordenados por fecha ascendente). `diaSemana` se deriva
de la fecha con nombres en español: Lunes, Martes, Miércoles, Jueves, Viernes.

- Calendario de compras (`clave !== 'mantenimientos'`), motivo = `motivo_nombre`:
  - Si la fecha es HOY → `Hoy: {motivo}`
  - Otro día de la semana → `{DiaSemana}: {motivo}`  (p.ej. `Jueves: Subir requisición a QVC`)
- Calendario `mantenimientos` (el `motivo_nombre` ES el departamento):
  - Si la fecha es HOY → `Hoy — Mantenimiento: {departamento}`
  - Otro día → `{DiaSemana} — Mantenimiento: {departamento}`  (p.ej. `Jueves — Mantenimiento: Sistemas Informáticos`)

**Actividades pendientes** (estatus != 'Hecho'):
- `[{Prioridad}] {Título} — {Estatus}`  (p.ej. `[Alta] Cambiar tóner RH — En progreso`)
- Línea de desbordamiento (no clicable): `y {N} más…`

## Nombres de las funciones puras de fecha a extraer (en dashboard.js)

Definidas en el nivel superior de la IIFE y exportadas vía `module.exports`:

1. `limitesSemana(fechaIso)` → `{ lunes: 'YYYY-MM-DD', viernes: 'YYYY-MM-DD' }`.
   Recibe la fecha de hoy como cadena `'YYYY-MM-DD'`, deriva lunes/viernes de esa
   semana con constructor local. Función pura (no llama `new Date()` sin args).
2. `eventoEntraEnAgenda(fechaEventoIso, hoyIso)` → `boolean`. True si
   `fechaEventoIso` está en `[max(hoyIso, lunes), viernes]`, usando
   `limitesSemana(hoyIso)` y comparación de cadenas. Rechaza fechas que no pasen
   el regex `^\d{4}-\d{2}-\d{2}$`.
3. `nombreDiaSemana(fechaIso)` → `string` ('Lunes'..'Domingo'), para el prefijo
   del texto del aviso. Pura, constructor local.
4. `pesoPrioridad(prioridad)` → `number` (Alta=0, Media=1, Baja=2, otro=3), para
   el orden de actividades.

(El `escaparHtml` local y `fechaHoyIso()` —helper que devuelve la fecha local de
hoy como `'YYYY-MM-DD'`, el único punto que usa `new Date()` sin args— quedan en
la IIFE pero no necesitan exportarse; opcionalmente se exporta `pesoPrioridad`
para probar el orden.)

---

# Pasos

- [ ] 1. Reescribir la tarjeta derecha del dashboard-fragment: header "Agenda" y
      contenedor `#agendaLista`.
      Dentro de `#dashboardContent` → `col-lg-4` → `#movementsCard`: cambiar el
      texto del `.card-header` de "Últimos Movimientos" a "Agenda" y reemplazar
      `<ul id="movementList" class="list-group"></ul>` por
      `<div id="agendaLista"></div>`. Mantener intactos `id="movementsCard"`,
      la clase `card`, la columna `col-lg-4` y el `.card-body`. NO tocar
      `#chartCard`, `#dashboardCards` ni `#dashboardCalendarios`.
      Files: src/ui/partials/dashboard-fragment.html
      Verify: `node -e "const h=require('fs').readFileSync('src/ui/partials/dashboard-fragment.html','utf8'); if(!h.includes('>Agenda<')||!h.includes('id=\"agendaLista\"')||h.includes('movementList')) throw new Error('fragment mal'); console.log('ok')"`
      — imprime `ok` (confirma header renombrado, contenedor nuevo y que ya no
      queda `movementList`). Luego arrancar la app con `npm start` y confirmar que
      Inicio carga sin errores en consola y la tarjeta muestra el header "Agenda".

- [ ] 2. En dashboard.js, agregar los `require` de los dos servicios nuevos y el
      `escaparHtml` local.
      Dentro de la IIFE, junto a los require existentes, añadir
      `const calendariosService = require('../../services/calendarios.service');`
      y `const actividadesService = require('../../services/actividades.service');`.
      Agregar la función `escaparHtml(valor)` copiada textualmente de
      `src/ui/js/compras.js` (reemplaza `& < > "`).
      Files: src/ui/js/dashboard.js
      Verify: `node -e "require('./src/ui/js/dashboard.js'); console.log('carga ok')"`
      — imprime `carga ok` sin lanzar (confirma que los require resuelven y la
      IIFE no ejecuta efectos de DOM bajo node).

- [ ] 3. En dashboard.js, agregar las funciones puras de fecha/orden en el nivel
      superior de la IIFE.
      Implementar `fechaHoyIso()`, `limitesSemana(fechaIso)`,
      `nombreDiaSemana(fechaIso)`, `eventoEntraEnAgenda(fechaEventoIso, hoyIso)` y
      `pesoPrioridad(prioridad)` según las firmas de la sección "funciones puras".
      Usar constructor local `new Date(anio, mes-1, dia)` y comparación por
      cadena; `fechaHoyIso()` es el único con `new Date()` sin args.
      Files: src/ui/js/dashboard.js
      Verify: cubierto por el paso 6 (test unitario). Mientras tanto,
      `node -e "require('./src/ui/js/dashboard.js'); console.log('ok')"` sigue
      cargando sin error.

- [ ] 4. En dashboard.js, reemplazar `renderMovimientos` por `renderAgenda` y
      actualizar su llamada en `initDashboard`.
      Eliminar la función `renderMovimientos` y su invocación
      `renderMovimientos(compras, productos);` al final de `initDashboard`.
      Crear `async function renderAgenda()` que:
      (a) localice `#agendaLista` (si no existe, return);
      (b) subsección "Avisos de la semana": `try` → recorrer
      `calendariosService.obtenerCalendarios()`, por cada calendario
      `obtenerDiasPorCalendario(cal.clave)`, filtrar con
      `eventoEntraEnAgenda(dia.fecha, fechaHoyIso())`, componer el texto según
      `cal.clave` y el formato de la sección "Formato exacto", guardar
      `{ fecha, html, color_valor, destino: './calendarios.html' }`; ordenar por
      `fecha` ascendente (cadena); `catch` → consola + lista vacía de esa fuente;
      (c) subsección "Actividades pendientes": `try` →
      `actividadesService.obtenerActividades()`, filtrar `estatus !== 'Hecho'`,
      ordenar por `pesoPrioridad(prioridad)` y desempate `id` ascendente, tomar 5,
      componer `[Prioridad] Título — Estatus` (título escapado),
      `destino: './actividades.html'`; si hay más de 5, añadir ítem no clicable
      `y N más…`; `catch` → consola + vacío;
      (d) pintar en `#agendaLista` dos bloques con subtítulo (p.ej.
      `<h6>Avisos de la semana</h6>` y `<h6>Actividades pendientes</h6>`), cada
      ítem como `list-group-item list-group-item-action` con `data-destino` y
      `style="cursor:pointer"`; puntito de color con `color_valor` cuando exista;
      texto de cada ítem vía `escaparHtml`;
      (e) si AMBAS subsecciones quedan vacías, pintar un único
      `list-group-item` con `Sin pendientes para esta semana`.
      Llamar `renderAgenda();` donde antes estaba `renderMovimientos(...)`.
      `renderAgenda` NO debe lanzar hacia `initDashboard` (su cuerpo va envuelto o
      cada fuente en try/catch) para no afectar KPIs/gráfica/calendarios.
      Files: src/ui/js/dashboard.js
      Verify: `npm start` → Inicio: la tarjeta "Agenda" muestra las dos
      subsecciones (o "Sin pendientes para esta semana"), KPIs y gráfica siguen
      pintando, la sección Calendarios mensual sigue intacta, consola sin errores.

- [ ] 5. En dashboard.js, agregar el listener delegado de navegación y el
      `module.exports` de prueba.
      Registrar un listener delegado sobre `#agendaLista` (o dentro de
      `renderAgenda` tras pintar) que en `click` tome
      `e.target.closest('[data-destino]')` y, si tiene `data-destino`, haga
      `window.location.href = destino`. Al final de la IIFE, antes de cerrarla,
      añadir el guard de exportación:
      `if (typeof module !== 'undefined' && module.exports) { module.exports = { limitesSemana, eventoEntraEnAgenda, nombreDiaSemana, pesoPrioridad }; }`
      (mismo patrón que notificaciones.js). Mantener
      `if (typeof document !== 'undefined') { waitForDashboardRoot(); }`.
      Files: src/ui/js/dashboard.js
      Verify: `npm start` → clic en un aviso navega a Calendarios y clic en una
      actividad navega a Actividades; `node -e "const m=require('./src/ui/js/dashboard.js'); console.log(typeof m.limitesSemana, typeof m.eventoEntraEnAgenda)"`
      imprime `function function`.

- [ ] 6. Crear el test unitario de las funciones puras de fecha/orden.
      Nuevo archivo `src/ui/js/dashboard.test.js` con `node:test` + `node:assert`,
      siguiendo `src/ui/js/notificaciones.test.js`. Requerir
      `./dashboard.js` y sus exports. Casos mínimos:
      - `limitesSemana('2024-06-12')` (miércoles) → lunes `'2024-06-10'`,
        viernes `'2024-06-14'`.
      - `limitesSemana('2024-06-10')` (lunes) → lunes `'2024-06-10'`.
      - `limitesSemana('2024-06-14')` (viernes) → viernes `'2024-06-14'`.
      - Cruce de mes/año: `limitesSemana('2025-01-01')` (miércoles) → lunes
        `'2024-12-30'`, viernes `'2025-01-03'`.
      - `eventoEntraEnAgenda('2024-06-12','2024-06-12')` → true (hoy).
      - `eventoEntraEnAgenda('2024-06-11','2024-06-12')` → false (ayer, ya pasó).
      - `eventoEntraEnAgenda('2024-06-14','2024-06-12')` → true (viernes).
      - `eventoEntraEnAgenda('2024-06-15','2024-06-12')` → false (sábado).
      - `eventoEntraEnAgenda('2024-06-17','2024-06-12')` → false (otra semana).
      - `eventoEntraEnAgenda('fecha-mala','2024-06-12')` → false.
      - `nombreDiaSemana('2024-06-13')` → 'Jueves'.
      - Orden por `pesoPrioridad`: `['Baja','Alta','Media'].map(pesoPrioridad)`
        → `[2,0,1]`; `pesoPrioridad('')` → 3.
      Files: src/ui/js/dashboard.test.js
      Verify: `node --test src/ui/js/dashboard.test.js` → todos los subtests `ok`,
      exit code 0.

- [ ] 7. Verificación de regresión y limpieza.
      Correr la suite completa de tests del repo y confirmar que la app arranca.
      Files: (ninguno)
      Verify: `node --test src/ui/js/` → todas las pruebas (notificaciones +
      dashboard) pasan; `npm start` arranca sin errores de consola en Inicio.
      Eliminar cualquier archivo temporal creado durante la verificación.

## Notas / posibles huecos

- Si al implementar se decide conservar el id `movementList` en vez de
  `agendaLista`, actualizar en consecuencia el paso 1 (regex de verificación) y el
  selector en `renderAgenda`. El plan asume el rename a `agendaLista`.
- `obtenerDiasPorCalendario` devuelve TODOS los días del calendario; el filtro por
  semana se hace en memoria con `eventoEntraEnAgenda`. Es aceptable para el volumen
  esperado (pocos días por calendario) y mantiene la lógica de fecha en funciones
  puras testeables.
- Requerir `dashboard.js` desde el test abre la conexión SQLite (efecto del
  `require` del servicio), igual que ocurre hoy con `notificaciones.test.js`; es
  tolerado por node y no afecta el resultado de las pruebas puras.

## Resultados de verificación (iteración 1, headless)

Entorno sin GUI (no se pudo correr `npm start`; se verificó por carga/require y
pruebas unitarias en su lugar).

1. `node --check src/ui/js/dashboard.js` → **OK** (sin errores de sintaxis).
2. Fragmento HTML: el header dice `>Agenda<`, existe `id="agendaLista"` y ya no
   queda `movementList` (verificado por búsqueda de texto).
3. `node --test src/ui/js/dashboard.test.js` → **13/13 pass** (funciones puras de
   fecha/orden: lunes/miércoles/viernes/domingo, cruce de mes/año 2025-01-01→
   lunes 2024-12-30/viernes 2025-01-03, pertenencia a la agenda hoy/ayer/viernes/
   sábado/otra-semana/fecha-inválida, `nombreDiaSemana`, `pesoPrioridad`).
4. Suite renderer completa `node --test src/ui/js/notificaciones.test.js
   src/ui/js/dashboard.test.js` → **24/24 pass** (sin regresiones en
   notificaciones).
5. Script temporal (ya borrado) con los servicios reales confirmó:
   `obtenerActividades()` → array (len 0), `obtenerCalendarios()` → array (len 3),
   `obtenerDiasPorCalendario(clave)` → array (len 21). No se tocaron datos reales.
6. `node -e` sobre el `module.exports` de dashboard.js imprime
   `function function function function` para las 4 funciones puras exportadas.

Nota de alcance: se siguió el plan y se renombró el contenedor a `id="agendaLista"`
y el selector en `renderAgenda`. El listener de navegación es delegado sobre
`#agendaLista` y se registra una sola vez (guard con `dataset.listenerAgenda`) por
si `initDashboard`/`renderAgenda` vuelve a ejecutarse. Los ítems clicables son
`<button>` con `list-group-item-action` (semántica accesible para elementos
accionables); el ítem "y N más…" es un `<span>` no clicable.
