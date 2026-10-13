# Sección de reportes con gráficas Chart.js (offline) para compras y almacén

Agrega una página de reportes que renderiza 9 gráficas (Chart.js servido localmente desde `assets/vendor/chart.umd.min.js`) más una fila de 4 KPIs, alimentadas por los servicios existentes `compras.service` y `almacen.service`. El fragmento `reportes-fragment.html` aporta el marcado (KPIs, dos secciones Compras/Almacén, un `<canvas>` por gráfica dentro de `.reporte-chart-wrapper`); `reportes.js` carga los datos, agrega en memoria y dibuja. El JS replica el patrón de inicialización diferida del resto de la app (`init…()` + `waitFor…Root()` con `MutationObserver`) para arrancar cuando el fragmento se inyecta en `#contentArea`. Los estilos nuevos viven en `reportes.css` siguiendo la paleta azul/dorado de la aplicación.

Watch for: no hay cambios en servicios ni en otros fragmentos, y no se agregaron tests (confirmed — alineado con lo pedido). El diff no pudo obtenerse por git (el workspace no es un repo git), por lo que la revisión se hizo leyendo los archivos de la implementación contra el esquema y el patrón de carga; la evidencia de verificación del coder (node --check, correspondencia canvas-id, etc.) no fue contrastada directamente pero los puntos que cubre se verificaron por lectura y concuerdan.

**Verdict**: APPROVED

## High-level view

Las agregaciones usan exactamente los nombres de columna que exponen los servicios. `obtenerCompras()` devuelve `cantidad`, `producto`, `departamento`, `unidad_negocio`, `estatus`, `fecha_solicitud`; `obtenerProductos()` devuelve `departamento`, `funciona`, `producto`. Cada acceso en `reportes.js` (`sumarPor(compras,'departamento','cantidad')`, `c.unidad_negocio`, `c.estatus`, `c.fecha_solicitud`, `p.funciona`, `p.departamento`) coincide con esas columnas. No hay riesgo de columna inexistente.

Los 9 `canvas` id y los 4 KPI id del JS existen una sola vez en el fragmento con el mismo nombre, y no hay ids referenciados que falten ni canvas huérfanos. La fila de KPIs y las 9 gráficas requeridas están completas (depto que más solicita, productos más/menos comprados, estatus, unidad de negocio, tendencia mensual, averías por depto, estado de funcionamiento, inventario por depto).

La carga sigue el patrón de la app: `reportes.html` incluye `chart.umd.min.js` antes de los scripts de contenido, y el fragmento termina con `<script src="../js/reportes.js">`. `waitForReportesRoot()` con `MutationObserver` espera a `reportesRoot` y llama `initReportes()`, igual que `compras.js`.

La robustez está cubierta: estado "Sin datos" por gráfica, destrucción/recreación de instancias de Chart en re-init, parseo defensivo de cantidades (`toNumero`) y fechas (`mesDeFecha` con regex y retorno null), y un fallback visible si `window.Chart` no existe.

No se tocaron servicios, otros fragmentos ni otras páginas, y no se añadieron tests.

<details>
<summary>Issues (0)</summary>

Sin hallazgos bloqueantes ni accionables.

</details>

<details>
<summary>Details</summary>

### Nombres de columna contra el esquema

El punto de mayor riesgo era un desajuste de columna, y no lo hay. `compras.service.obtenerCompras()` selecciona explícitamente `cantidad, producto, departamento, unidad_negocio, colaborador, fecha_solicitud, estatus, codigo, notas` de `comprasdb`; `reportes.js` solo lee `cantidad`, `producto`, `departamento`, `unidad_negocio`, `estatus` y `fecha_solicitud`, todas presentes. En almacén, `obtenerProductos()` selecciona entre otras `producto, departamento, funciona`; `reportes.js` solo usa `funciona` y `departamento` (y cuenta filas para el inventario). Las agregaciones (`sumarPor`, `contarPor`) acceden por nombre de campo exacto, sin alias ni transformaciones que puedan divergir del esquema.

`fecha_solicitud` proviene de un `<input type="date">` en el formulario de compras, que emite `YYYY-MM-DD`. `mesDeFecha` extrae `YYYY-MM` con `^(\d{4})-(\d{2})` y devuelve `null` si no parsea, así que una fecha ausente o malformada simplemente no suma a la tendencia mensual en lugar de romperla.

### Correspondencia canvas-id y cobertura de las 9 gráficas + KPIs

```
reportes.js (crearChart / getElementById)   reportes-fragment.html (<canvas id>)
  chartDeptSolicita        ──────────────▶   chartDeptSolicita
  chartProductosMas        ──────────────▶   chartProductosMas
  chartProductosMenos      ──────────────▶   chartProductosMenos
  chartEstatus             ──────────────▶   chartEstatus
  chartUnidadNegocio       ──────────────▶   chartUnidadNegocio
  chartTendenciaMensual    ──────────────▶   chartTendenciaMensual
  chartAverias             ──────────────▶   chartAverias
  chartFuncionamiento      ──────────────▶   chartFuncionamiento
  chartInventarioDept      ──────────────▶   chartInventarioDept
  kpiTotalSolicitudes / kpiTotalUnidades / kpiTotalAlmacen / kpiTotalNoFuncionales (setKpi)
```

Cada id aparece exactamente una vez en el fragmento, dentro de su propio `.reporte-chart-wrapper`, y no hay ids referenciados por el JS que falten en el HTML ni canvas en el HTML sin consumidor en el JS. Las 9 gráficas requeridas y los 4 KPIs están todos presentes.

### Patrón de carga diferida

`reportes.js` reproduce la convención de `compras.js`: `require('../../services/compras.service')` y `require('../../services/almacen.service')` al tope, una función `initReportes()` que arranca cuando `#reportesRoot` existe, y `waitForReportesRoot()` que llama `initReportes()` inmediatamente si el nodo ya está o monta un `MutationObserver` sobre `document.documentElement` (`childList`+`subtree`) que se desconecta al encontrarlo. Esto encaja con el flujo de `contentArea`/`app.js` que inyecta el fragmento en `#contentArea`.

En `reportes.html` el orden de scripts es correcto: `chart.umd.min.js` se carga antes de `contentArea.js`, `app.js` y `reportes.js`, de modo que `window.Chart` está disponible cuando corre `initReportes()`. El build UMD confirma `"undefined"!=typeof window&&(window.Chart=Tn)`, por lo que la referencia global `window.Chart` del código es correcta. El fragmento cierra con `<script src="../js/reportes.js">`, de forma que al inyectarse por segunda vez el observer vuelve a disparar la init.

### Robustez de render

`initReportes()` empieza llamando `destruirCharts()`, que recorre `chartsActivos` y hace `destroy()` de cada instancia antes de recrearlas; esto evita el "Canvas is already in use" si el fragmento se re-inyecta. `crearChart()` centraliza la decisión de dibujar vs. mostrar vacío: con `tieneDatos === false` reemplaza el contenido del wrapper por `<div class="reporte-vacio">Sin datos</div>`, así cada gráfica degrada de forma independiente cuando su serie queda vacía. Las cantidades pasan por `toNumero` (NaN/no-finito → 0) y las claves se normalizan/trimean antes de agrupar, por lo que valores sucios no generan categorías basura ni sumas NaN.

El fallback de librería ausente es explícito: si `window.Chart` no existe, se antepone un `alert alert-danger` dentro de `#reportesRoot` y la init retorna sin intentar dibujar, en lugar de lanzar un error no capturado. Los dos `await` de datos están envueltos en try/catch que registran y continúan con arreglos vacíos, de modo que una falla en compras no impide pintar las gráficas de almacén y viceversa.

### Alcance del cambio

El cambio se limita a la página/fragmento de reportes y sus assets (`reportes.html`, `reportes-fragment.html`, `reportes.js`, `reportes.css`) más el vendor de Chart.js. Los servicios `compras.service` y `almacen.service` se consumen tal cual, sin modificaciones, y no hay señales de cambios en otros fragmentos o páginas. No se añadieron tests, consistente con lo solicitado.

</details>

<details>
<summary>Archivos</summary>

- `src/ui/pages/reportes.html` — orden de scripts con `chart.umd.min.js` antes del contenido y `reportes.js`.
- `src/ui/partials/reportes-fragment.html` — marcado de KPIs y 9 canvases bajo `#reportesRoot`.
- `src/ui/js/reportes.js` — carga de datos, agregaciones por columna del esquema, render Chart.js, patrón `init/waitForRoot`.
- `src/ui/assets/css/reportes.css` — estilos de KPIs, wrappers de gráfica y estado vacío.
- `src/ui/assets/vendor/chart.umd.min.js` — Chart.js UMD servido localmente (expone `window.Chart`).

Nota: el workspace no es un repositorio git, por lo que no fue posible generar un `git diff`; la revisión se basó en la lectura de los archivos de la implementación contra el esquema de los servicios y el patrón de carga existente.

</details>
