# Implementation Plan — Reportes con gráficas (presupuesto y logística)

Contexto verificado durante la exploración:
- App Electron con `nodeIntegration`. Los JS de UI usan `require('../../services/*.service')` directamente (sin IPC). DB SQLite vía `sqlite3` (callbacks), conectada en `src/database/connection.js`.
- Patrón de carga: `src/ui/js/contentArea.js` hace `fetch` de `src/ui/partials/reportes-fragment.html` y lo inyecta en `#contentArea` de `src/ui/pages/reportes.html`. Cada módulo tiene su JS con `initXxx()` + `waitForXxxRoot()` usando un `MutationObserver` sobre `document.documentElement` (`{childList:true, subtree:true}`). Referencia canónica: `src/ui/js/compras.js` (busca `#purchaseForm`); `src/ui/js/almacen.js` sigue el mismo patrón.
- Servicios a usar tal cual (NO escribir SQL nuevo): `compras.service.js` → `obtenerCompras()` devuelve `Promise<Array>` con columnas `id, cantidad, producto, departamento, unidad_negocio, colaborador, fecha_solicitud, estatus, codigo, notas`. `almacen.service.js` → `obtenerProductos()` devuelve `Promise<Array>` ya mapeado con `id, producto, marca, modelo, departamento, funciona, ubicacion, usuario_actual, fecha_ingreso, ...`.
- Bootstrap 5 servido local desde `src/ui/assets/vendor/bootstrap.min.css` y `bootstrap.bundle.min.js`. NO hay CDN para offline. NO existe librería de gráficas todavía.
- NO hay scripts de build/test/lint en `package.json` (solo `start: electron .`). Node v22 está disponible en el entorno. Por tanto la verificación automatizable es: `node --check` de los JS creados/modificados, verificación del archivo descargado de Chart.js (banner + tamaño), y un smoke test manual abriendo la página Reportes.
- `.agents/tasks/` no existía; este plan lo crea.

Decisiones de diseño (tomadas por el planificador, grounded en el código):
- **Librería de gráficas: Chart.js v4 UMD minificada, local.** Es la opción pedida y la más simple de servir offline con un solo `<script>` que expone `window.Chart`. Alternativa (D3) descartada por complejidad innecesaria para gráficas estándar.
- **Toda la agregación se hace en JavaScript en `reportes.js`** sobre los arrays devueltos por los servicios, sin tocar SQL. Mantiene los servicios intactos y evita acoplar lógica de reportes a la capa de datos.
- **Root del fragmento: elemento con `id="reportesRoot"`.** `waitForReportesRoot()` espera ese id (coherente con `#purchaseForm` en compras y `#almacenForm` en almacén).
- **Sin dependencia de bootstrap-icons CDN** en reportes.html (compras.html la usa, pero el requisito offline manda). Los títulos de card son texto; nada depende de iconos.
- **Paleta coherente** definida una vez en `reportes.js` (azules + dorado/acento), reutilizada en todas las gráficas.
- **Canvas con wrapper de altura fija + `maintainAspectRatio:false`** para controlar la altura dentro de las cards del grid Bootstrap.

Orden por dependencia: 1 (asset) → 2 (CSS) → 3 (fragment) → 4 (page carga scripts) → 5 (JS lógica) → 6 (robustez/estado vacío) → 7 (verificación integral). Cada paso deja el repo en estado ejecutable.

---

- [ ] 1. Descargar Chart.js v4 UMD minificado como asset local offline.
      Descargar la build desde `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js` y guardarla en `src/ui/assets/vendor/chart.umd.min.js`. NO dejar un placeholder: debe ser el JS real.
      Files: `src/ui/assets/vendor/chart.umd.min.js`
      Verify: el archivo existe, pesa ~200 KB (entre ~150 KB y ~260 KB), empieza con el banner de licencia de Chart.js (`/*! * Chart.js v4...`) y contiene la factoría UMD (`typeof exports`/`typeof define`). Confirmar que NO es una página de error HTML:
      ```powershell
      $f = "src/ui/assets/vendor/chart.umd.min.js"
      (Get-Item $f).Length            # esperado ~200000
      (Get-Content $f -TotalCount 1)  # debe contener "Chart.js v4"
      Select-String -Path $f -Pattern "<html" -Quiet  # debe ser False
      ```

- [ ] 2. Crear `src/ui/assets/css/reportes.css` con estilos coherentes al proyecto.
      Siguiendo el estilo de `compras.css`/`almacen.css`. Debe definir: wrapper de altura fija para los canvas (p.ej. `.reporte-chart-wrapper { position: relative; height: 320px; }`), estilo de las KPI cards (número grande centrado, `.kpi-valor`, `.kpi-label`), y el mensaje de estado vacío (`.reporte-vacio`, texto centrado y atenuado). Reutilizar clases de Bootstrap para el resto.
      Files: `src/ui/assets/css/reportes.css`
      Verify: archivo creado; se enlaza en el paso 4 y su efecto (altura fija de canvas, KPIs legibles) se confirma en el smoke test del paso 7.

- [ ] 3. Reemplazar `src/ui/partials/reportes-fragment.html` por el panel de reportes completo (markup estático; los datos los rellena `reportes.js`).
      Estructura exacta: `<div class="container-fluid mt-4" id="reportesRoot">` como root que espera el observer; dentro `<h3 class="mb-4" id="pageTitle">Reportes</h3>`.
      Luego una **fila de KPIs** (`<div class="row g-3 mb-4">` con 4 `col-12 col-sm-6 col-xl-3`), cada una una card Bootstrap con un `<span>` de valor y un label. IDs de valor: `kpiTotalSolicitudes`, `kpiTotalUnidades`, `kpiTotalAlmacen`, `kpiTotalNoFuncionales`.
      Luego las **9 gráficas**, cada una en su card (`card` con `card-header` título y `card-body` que contiene `<div class="reporte-chart-wrapper"><canvas id="..."></canvas></div>`), distribuidas en filas Bootstrap `row g-4` con `col-12 col-lg-6` para emparejar. IDs de canvas EXACTOS (deben coincidir con el paso 5):
      - `chartDeptSolicita` — Departamento que más material solicita
      - `chartProductosMas` — Productos más comprados
      - `chartProductosMenos` — Productos menos comprados
      - `chartEstatus` — Compras por estatus
      - `chartUnidadNegocio` — Compras por unidad de negocio
      - `chartTendenciaMensual` — Tendencia mensual de compras
      - `chartAverias` — Departamento con más averías / equipos no funcionales
      - `chartFuncionamiento` — Estado de funcionamiento del inventario
      - `chartInventarioDept` — Inventario por departamento
      Al final del fragmento, incluir `<script src="../js/reportes.js"></script>` (igual que los demás fragmentos). NO incluir el `<script>` de Chart.js aquí (va en la página, paso 4).
      Files: `src/ui/partials/reportes-fragment.html`
      Verify: `node --check` no aplica a HTML; validar en el smoke test del paso 7 que las 9 cards y los 4 KPIs se renderizan. Confirmación estructural rápida: el fragmento contiene `id="reportesRoot"` y los 9 ids de canvas listados.

- [ ] 4. Modificar `src/ui/pages/reportes.html` para cargar Chart.js (global) y el CSS/JS de reportes en el orden correcto.
      Añadir en `<head>`: `<link rel="stylesheet" href="../assets/css/reportes.css">` después del CSS de Bootstrap. En el `<body>`, añadir `<script src="../assets/vendor/chart.umd.min.js"></script>` ANTES de `../js/contentArea.js` para que `window.Chart` exista cuando corra `reportes.js` (que es inyectado por el fragmento tras el fetch). Mantener el orden actual de `bootstrap.bundle.min.js`, `contentArea.js`, `app.js`. NO añadir el link a bootstrap-icons CDN (requisito offline).
      Files: `src/ui/pages/reportes.html`
      Verify: smoke test del paso 7; antes de ello, confirmar que la página referencia `chart.umd.min.js` y `reportes.css`.

- [ ] 5. Crear `src/ui/js/reportes.js` con `initReportes()` + `waitForReportesRoot()` y toda la lógica de datos/gráficas.
      Patrón idéntico a `compras.js`/`almacen.js`: `require('../../services/compras.service')` y `require('../../services/almacen.service')` arriba; `waitForReportesRoot()` comprueba `document.getElementById('reportesRoot')` y, si no existe, usa `MutationObserver(document.documentElement, {childList:true, subtree:true})` hasta que aparezca y entonces llama a `initReportes()`; al final del archivo, `if (typeof document !== 'undefined') waitForReportesRoot();`.
      `initReportes()` debe: (a) comprobar `window.Chart`; si falta, pintar un mensaje de error elegante en `#reportesRoot` y salir; (b) `await` ambos servicios con try/catch (fallo → mensaje legible por tarjeta); (c) calcular KPIs y rellenar los spans; (d) construir cada gráfica. Guardar las instancias Chart en un objeto/mapa y, al inicio de `initReportes()`, **destruir** cualquier instancia previa (`chart.destroy()`) para evitar el error de canvas reutilizado si `initReportes()` corre más de una vez.
      Helpers defensivos: `toNumero(v)` (parseo de `cantidad`, `Number` con fallback 0, ignora null/strings no numéricos), `normalizar(v)` (`(v??'').toString().trim().toLowerCase()`), `mesDeFecha(fecha_solicitud)` (toma `YYYY-MM` de un texto `YYYY-MM-DD`, devuelve null si no parsea), y una paleta de colores compartida.
      **Agregaciones concretas (nombres de columna EXACTOS):**
      - `chartDeptSolicita` (barras verticales): agrupar `comprasdb` por `departamento`, sumar `cantidad` (`toNumero`); ordenar desc; top N (N=10).
      - `chartProductosMas` (barras horizontales, `indexAxis:'y'`): agrupar por `producto`, sumar `cantidad`; desc; top 10.
      - `chartProductosMenos` (barras): agrupar por `producto`, sumar `cantidad`; excluir productos con suma 0 o sin nombre; asc; bottom 10.
      - `chartEstatus` (doughnut): contar filas por `estatus` (categorías esperadas: "Por Solicitar", "Solicitado", "Aprobado", "Entregado", "Cancelado"; cualquier otro valor se agrupa por su texto tal cual).
      - `chartUnidadNegocio` (pie): agrupar por `unidad_negocio`, sumar `cantidad`.
      - `chartTendenciaMensual` (line): agrupar por `mesDeFecha(fecha_solicitud)` → `YYYY-MM`, sumar `cantidad`; ordenar las claves cronológicamente (orden lexicográfico de `YYYY-MM` sirve).
      - `chartAverias` (barras): sobre `almacendb`, contar NO funcionales por `departamento` usando heurística: un item es "no funcional" cuando `normalizar(funciona)` está vacío o ∈ {"no","no funciona","averiado","descompuesto"} (es decir, NO indica que funciona). Ordenar desc.
      - `chartFuncionamiento` (doughnut): contar `almacendb` por el valor **normalizado** de `funciona` (agrupar por el texto normalizado tal cual, para reflejar los valores reales de la DB).
      - `chartInventarioDept` (barras): contar productos de `almacendb` por `departamento`.
      **KPIs:** `kpiTotalSolicitudes` = nº filas de compras; `kpiTotalUnidades` = suma de `cantidad`; `kpiTotalAlmacen` = nº filas de almacén; `kpiTotalNoFuncionales` = nº de items no funcionales (misma heurística que `chartAverias`).
      Cada gráfica usa `new Chart(ctx, {... options:{ responsive:true, maintainAspectRatio:false }})`.
      Files: `src/ui/js/reportes.js`
      Verify: `node --check "src/ui/js/reportes.js"` termina sin errores de sintaxis. (El `require('electron')`/servicios solo cargan en runtime de Electron; `--check` valida sintaxis sin ejecutar.)

- [ ] 6. Añadir manejo de estado vacío por gráfica dentro de `reportes.js` (parte del mismo archivo del paso 5; se lista aparte para verificarlo explícitamente).
      Antes de instanciar cada Chart, si su dataset agregado queda vacío (sin claves/valores), en lugar de crear la gráfica escribir "Sin datos" dentro del `.reporte-chart-wrapper` correspondiente (reemplazando el canvas por un `<div class="reporte-vacio">Sin datos</div>` o superponiendo el mensaje). Los KPIs sin datos muestran `0`. Nada debe lanzar excepción con DB vacía.
      Files: `src/ui/js/reportes.js`
      Verify: `node --check "src/ui/js/reportes.js"` pasa; comportamiento de "Sin datos" se confirma en el smoke test del paso 7 (ver escenario de DB vacía).

- [ ] 7. Verificación integral (smoke test manual, única forma real de ejecutar la UI de Electron en este proyecto).
      No hay runner de tests ni build; el único script es `npm start` (`electron .`). Pasos:
      1. `node --check` de los archivos JS tocados: `node --check "src/ui/js/reportes.js"` (esperado: sin salida/código 0).
      2. Verificar el asset Chart.js como en el paso 1 (banner + tamaño + no-HTML).
      3. `npm start` para abrir la app; navegar a Reportes. Confirmar que: la fila de 4 KPIs muestra números; las 9 cards renderizan sus canvas con datos reales de `inventario.db`; no hay errores en la consola del renderer (DevTools); los canvas respetan la altura fija del wrapper; la paleta es consistente y legible.
      4. Robustez: con pocos/ningún dato (o inspeccionando una categoría vacía), las gráficas afectadas muestran "Sin datos" en vez de romper; navegar fuera y volver a Reportes no produce el error de "Canvas is already in use" (confirma la destrucción/recreación de instancias).
      Files: ninguno (verificación).
      Verify: `node --check` pasa, el asset es válido, y el smoke test confirma los 4 KPIs + 9 gráficas renderizando sin errores de consola, con estados vacíos y re-navegación sin fallos.

## Notas y supuestos
- Supuesto: el entorno de implementación puede ejecutar `npm start` (Electron) para el smoke test; si no, el implementador debe reportar que la verificación de UI quedó pendiente y dejar `node --check` + validación del asset como verificación mínima ejecutada.
- Supuesto: los valores reales de `funciona` en `almacendb` varían; por eso `chartFuncionamiento` agrupa por el valor normalizado real y la heurística de "no funcional" (paso 5) cubre los casos conocidos sin asumir un conjunto cerrado.
- No se modifican los servicios ni se añade SQL: toda la agregación vive en `reportes.js`.
