# Implementation Plan — Dashboard con datos reales

Objetivo: reemplazar los valores de plantilla hardcodeados del dashboard por datos reales
leidos de la base de datos vía los servicios existentes, siguiendo EXACTAMENTE el patrón
de Reportes (reportes.js / reportes.html / reportes-fragment.html / reportes.css).

## Decisiones de diseño (grounded en el código leído)

- **Carga del módulo**: el `<script>` embebido en un fragmento inyectado con `innerHTML` NO se
  ejecuta (ver `contentArea.js`, que usa `contentMount.innerHTML = fragmentHtml`). Por eso
  `dashboard.js` se carga como `<script>` estático al final del `<body>` de `index.html`, igual
  que `reportes.js` en `reportes.html`. El módulo usa un `MutationObserver` sobre
  `document.documentElement` ({childList:true, subtree:true}) para esperar su root. Decisión
  tomada porque es el patrón canónico ya usado por reportes.js y compras.js.
- **Root id**: se añade `id="dashboardRoot"` al `div.container-fluid.mt-4` del fragmento (hoy
  ese div no tiene id; sólo el `<h3 id="pageTitle">`). `waitForDashboardRoot()` detecta ese id.
  Elegido por consistencia con `reportesRoot`.
- **Reutilizar estilos**: en vez de duplicar CSS, `index.html` enlazará `../assets/css/reportes.css`
  y el fragmento usará la clase `reporte-chart-wrapper` (altura fija 320px, position:relative) y
  `reporte-vacio` ya definidas. Alternativa descartada: crear dashboard.css nuevo — innecesario,
  reportes.css ya cubre wrapper + estado vacío + card-header, y evita divergencia de paleta.
  Nota: `reportes.css` acota `.card-header` bajo `#reportesRoot`; para que el header del
  dashboard tome el mismo estilo se añade al archivo un selector hermano `#dashboardRoot .card-header`
  con las mismas reglas (único cambio permitido a reportes.css; no altera Reportes).
- **Helpers de charts/paleta**: se clonan desde reportes.js (PALETA, colorEn, coloresPara,
  toNumero, normalizar, contarPor, ordenarMapa, destruirCharts, wrapperDe, mostrarVacio,
  crearChart, opcionesBase). Se copian en dashboard.js (no se importan) porque reportes.js no
  exporta nada (es un script IIFE-like que corre al cargarse); compartir un archivo nuevo sería
  refactor fuera de alcance y la tarea pide explícitamente "clonar" las utilidades.
- **Agregaciones** (en JS sobre los arrays; sin SQL nuevo, confirmado que los servicios ya
  devuelven arrays — `obtenerCompras()` filas crudas, `obtenerProductos()` filas mapeadas):
  - `totalComprasPendientes` = compras donde `normalizar(estatus)` NO es `'entregado'` NI `'cancelado'`.
  - `totalComprasAprobadas` = compras donde `normalizar(estatus) === 'aprobado'`.
  - `totalEquiposInactivos` = productos donde `normalizar(funciona) === 'si'` (decisión explícita del usuario: "Si" = inactivo).
  - `totalEquiposAveriados` = productos donde `normalizar(funciona) === 'no'`.
  - Gráfica `departmentChart` = conteo de productos de almacén por `departamento`
    (`contarPor(productos, p => trim(departamento) || 'Sin departamento')`, orden desc), barras.
  - `movementList` = combinar altas de almacén (`fecha_ingreso`, `'Alta de almacen: {producto} {marca}'`)
    y solicitudes de compra (`fecha_solicitud`, `'Compra {estatus}: {producto} (x{cantidad})'`),
    ordenar por fecha YYYY-MM-DD descendente (comparación lexicográfica), parseo defensivo que
    descarta fechas sin formato `^\d{4}-\d{2}-\d{2}`, mostrar los últimos 8.

## Items

- [ ] 1. Crear `src/ui/js/dashboard.js` con el módulo completo del dashboard.
      Estructura (clonando el estilo de reportes.js):
      (a) `require('../../services/compras.service')` y `require('../../services/almacen.service')`.
      (b) Objeto `chartsActivos = {}` + helpers clonados de reportes.js: `PALETA`, `colorEn`,
          `coloresPara`, `toNumero`, `normalizar`, `contarPor`, `ordenarMapa`, `destruirCharts`,
          `wrapperDe` (usa `.reporte-chart-wrapper`), `mostrarVacio`, `crearChart`, `opcionesBase`.
      (c) `setKpi(id, valor)` idéntico a reportes.js: `el.textContent = Number(valor).toLocaleString('es-MX')`.
      (d) `escaparTexto` / uso de `textContent` para la lista (no interpolar DB en innerHTML).
      (e) `async initDashboard()`: comprueba `#dashboardRoot`; si no existe, return false. Si
          `!window.Chart`, inserta un `.alert.alert-danger` con `root.prepend(...)` y sigue
          rellenando KPIs y lista (degradación elegante: la gráfica muestra aviso, el resto funciona).
          Llama `destruirCharts()` al inicio para soportar re-ejecución. Carga `compras` y `productos`
          en try/catch (default `[]`), normaliza a array. Calcula los 4 KPIs y llama setKpi con los
          ids `totalComprasPendientes`, `totalComprasAprobadas`, `totalEquiposInactivos`,
          `totalEquiposAveriados`. Construye `departmentChart` (barras, misma `opcionesBase`,
          `coloresPara`, estado 'Sin datos' si vacío). Construye la lista de movimientos en
          `ul#movementList` (limpia innerHTML, crea `<li class="list-group-item">` con `textContent`
          + `<small class="text-muted">` para la fecha; si no hay, un `<li>` 'Sin movimientos registrados').
      (f) `waitForDashboardRoot()` con rootId `'dashboardRoot'` idéntico en forma a `waitForReportesRoot`,
          y `if (typeof document !== 'undefined') waitForDashboardRoot();` al final.
      Files: src/ui/js/dashboard.js
      Verify: `node --check "src/ui/js/dashboard.js"` en PowerShell → sin salida / exit code 0.

- [ ] 2. Modificar `src/ui/partials/dashboard-fragment.html`: añadir `id="dashboardRoot"` al
      `div.container-fluid.mt-4`; ELIMINAR por completo la columna de 'Equipos Reparables'
      (todo el bloque `<div class="col-md-4 col-lg-2">` que contiene `#cardEquiposReparables` /
      `#totalEquiposReparables`); cambiar las clases de columna de las 4 tarjetas restantes de
      `col-md-4 col-lg-2` a `col-md-6 col-lg-3` para que queden equilibradas; envolver el
      `<canvas id="departmentChart">` en `<div class="reporte-chart-wrapper">` (altura acotada);
      dejar `ul#movementList` vacío (sin los 4 `<li>` hardcodeados — dashboard.js lo rellena).
      No añadir `<script>` al fragmento (se carga a nivel de página).
      Files: src/ui/partials/dashboard-fragment.html
      Verify: revisar que exista exactamente `id="dashboardRoot"`, que NO exista
      `totalEquiposReparables` ni `cardEquiposReparables`, y que estén los 4 ids KPI
      `totalComprasPendientes`/`totalComprasAprobadas`/`totalEquiposInactivos`/`totalEquiposAveriados`
      y `departmentChart` dentro de `.reporte-chart-wrapper`.
      Comando PowerShell:
      `Select-String -Path "src/ui/partials/dashboard-fragment.html" -Pattern 'dashboardRoot','Reparables','totalComprasPendientes','totalComprasAprobadas','totalEquiposInactivos','totalEquiposAveriados','departmentChart','reporte-chart-wrapper'`
      → 'Reparables' debe dar 0 coincidencias; el resto ≥1.

- [ ] 3. Modificar `src/ui/pages/index.html`: en `<head>` añadir
      `<link rel="stylesheet" href="../assets/css/reportes.css">` (reutilizar estilos de wrapper/vacío/KPI).
      En el `<body>`, añadir `<script src="../assets/vendor/chart.umd.min.js"></script>` ANTES de
      `contentArea.js` (mismo orden que reportes.html: bootstrap bundle → chart → contentArea → app),
      y añadir `<script src="../js/dashboard.js"></script>` tras los demás scripts de contenido.
      Dejar intactos `bootstrap.bundle.min.js`, `contentArea.js`, `app.js`, `compras.js`.
      Files: src/ui/pages/index.html
      Verify: `Select-String -Path "src/ui/pages/index.html" -Pattern 'chart.umd.min.js','dashboard.js','reportes.css'`
      → cada patrón ≥1 coincidencia; y confirmar visualmente que `chart.umd.min.js` aparece antes
      de `contentArea.js` en el archivo.

- [ ] 4. Añadir a `src/ui/assets/css/reportes.css` el selector `#dashboardRoot .card-header` con
      las mismas reglas que `#reportesRoot .card-header` (background `#f4f7fc`, color `#1f3c88`,
      font-weight 600), para que los card-header del dashboard tomen el estilo de paleta. Único
      cambio a este archivo; no modificar reglas existentes.
      Files: src/ui/assets/css/reportes.css
      Verify: `Select-String -Path "src/ui/assets/css/reportes.css" -Pattern 'dashboardRoot'` → ≥1
      coincidencia; y confirmar que las reglas previas de `#reportesRoot` siguen presentes.

- [ ] 5. Verificación integral manual (Electron no tiene tests ni linter; el único script es
      `electron .`). Ejecutar `node --check` sobre los JS tocados y revisar correspondencia 1:1
      de ids entre fragmento y dashboard.js.
      Files: (ninguno — verificación)
      Verify:
      - `node --check "src/ui/js/dashboard.js"` → exit 0.
      - `node --check "src/ui/js/contentArea.js"` → exit 0 (no se tocó, sanity check).
      - Confirmar que cada id que dashboard.js consulta por `getElementById`
        (`dashboardRoot`, `totalComprasPendientes`, `totalComprasAprobadas`, `totalEquiposInactivos`,
        `totalEquiposAveriados`, `departmentChart`, `movementList`) existe en
        dashboard-fragment.html, y que no quedan ids huérfanos de 'Reparables'.
      - (Opcional, si el entorno lo permite) `npm start` y abrir el dashboard: ver 4 KPIs con
        números reales, la gráfica por departamento renderizada (o 'Sin datos' con DB vacía) y la
        lista de últimos movimientos poblada.

## Verificación ejecutada (iteración 1) — resultados

Comandos corridos en Windows PowerShell (no se dejó `npm start` en primer plano):

1. `node --check "src/ui/js/dashboard.js"` → exit 0 (sin errores de sintaxis).
   `node --check "src/ui/js/contentArea.js"` → exit 0 (sanity, no se tocó).
2. `Select-String` sobre `src/ui/pages/index.html`: `reportes.css` en línea 8;
   `chart.umd.min.js` en línea 16 (ANTES de `contentArea.js` en línea 17);
   `dashboard.js` en línea 20 (DESPUÉS de los scripts de contenido).
   Los demás scripts (bootstrap.bundle, app.js, compras.js) quedaron intactos.
3. `Select-String` sobre `dashboard-fragment.html`: 'Reparables' → 0 coincidencias
   (tarjeta y `#totalEquiposReparables`/`#cardEquiposReparables` eliminados). Confirmado
   también que no aparece 'Reparables' en dashboard.js. Los `<h2>` KPI inician en '0'
   (no 18/43/56/21/12). Las 4 tarjetas usan `col-md-6 col-lg-3`.
4. Correspondencia 1:1 ids (fragmento ↔ dashboard.js):
   - `dashboardRoot` (getElementById + waitForDashboardRoot) ↔ `id="dashboardRoot"` en el div raíz.
   - `totalComprasPendientes` (setKpi) ↔ `<h2 id="totalComprasPendientes">`.
   - `totalComprasAprobadas` (setKpi) ↔ `<h2 id="totalComprasAprobadas">`.
   - `totalEquiposInactivos` (setKpi) ↔ `<h2 id="totalEquiposInactivos">`.
   - `totalEquiposAveriados` (setKpi) ↔ `<h2 id="totalEquiposAveriados">`.
   - `departmentChart` (crearChart) ↔ `<canvas id="departmentChart">` dentro de `.reporte-chart-wrapper`.
   - `movementList` (getElementById) ↔ `<ul id="movementList">`.
   Sin ids huérfanos; dashboard.js NO referencia `totalEquiposReparables`.
5. Agregaciones usan nombres de columna exactos: compras → `estatus`, `cantidad`,
   `producto`, `fecha_solicitud`; almacén → `funciona`, `departamento`, `producto`,
   `marca`, `fecha_ingreso`. No se tocaron los servicios ni se escribió SQL nuevo.

Normalización trim+toLowerCase aplicada a `estatus` y `funciona`. Fechas parseadas
defensivamente con `/^\d{4}-\d{2}-\d{2}$/`; las inválidas se descartan. Lista limitada
a los 8 movimientos más recientes; si no hay, muestra 'Sin movimientos registrados'.
Texto dinámico de la lista se asigna con `textContent` (no innerHTML sin escapar).
Workspace no es git: no se hizo commit.

## Notas / supuestos

- No se tocan los servicios (`compras.service.js`, `almacen.service.js`) ni otros fragmentos/módulos.
- `obtenerProductos()` ya devuelve filas mapeadas con `funciona` tal cual ('Si'/'No'); la
  normalización trim+toLowerCase cubre variantes.
- Con DB pequeña (~2 productos, ~4 compras) todo debe seguir funcionando: KPIs en 0+ , gráfica
  con pocas barras o 'Sin datos', lista con pocos elementos.
- `maintainAspectRatio:false` sólo es seguro dentro de `.reporte-chart-wrapper` (altura fija), por
  eso el canvas se envuelve en el item 2.
