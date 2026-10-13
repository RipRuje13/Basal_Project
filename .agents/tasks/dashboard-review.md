# Dashboard con datos reales de compras y almacén

El cambio reemplaza los valores de plantilla hardcodeados del dashboard por datos reales leídos vía los servicios existentes (`compras.service`, `almacen.service`), siguiendo el patrón canónico de Reportes. Se añaden cuatro KPIs (Compras Pendientes, Compras Aprobadas, Equipos Inactivos, Equipos Averiados), una gráfica de barras de inventario por departamento y una lista de últimos movimientos que combina altas de almacén y solicitudes de compra. La tarjeta "Equipos Reparables" se eliminó por decisión del usuario y el grid quedó en cuatro columnas equilibradas. El módulo se carga como script a nivel de página y espera su root con un `MutationObserver`, porque los fragmentos inyectados con `innerHTML` no ejecutan sus `<script>`.

Watch for: nada bloqueante. La semántica de los KPIs replica las decisiones explícitas del usuario (confirmed), los nombres de columna coinciden con el esquema (confirmed), y el texto dinámico de la lista se asigna con `textContent` sin interpolación insegura (confirmed).

**Verdict**: APPROVED

## High-level view

Los cuatro KPIs implementan exactamente la semántica pedida: Pendientes es el complemento de `entregado`/`cancelado`, Aprobadas es igualdad estricta con `aprobado`, Inactivos mapea `funciona === 'si'` (decisión invertida del usuario) y Averiados mapea `funciona === 'no'`. Toda comparación pasa por `normalizar()` (trim + lowercase), así que variantes de capitalización o espacios no rompen el conteo.

La gráfica `departmentChart` cuenta productos de almacén por departamento con la misma paleta, `opcionesBase` y estado "Sin datos" que Reportes. Si `window.Chart` no está disponible, el dashboard degrada: inserta un aviso y sigue poblando KPIs y lista. El patrón destroy/recreate evita el error "Canvas is already in use" al re-ejecutar.

La lista de movimientos combina altas (`fecha_ingreso`) y compras (`fecha_solicitud`), descarta fechas que no cumplan `^\d{4}-\d{2}-\d{2}$`, ordena descendente y muestra las 8 más recientes, con fallback "Sin movimientos registrados". El texto de cada entrada se construye con `textContent`, cerrando el vector de inyección desde datos de la DB.

La carga sigue el contrato de Reportes: `id="dashboardRoot"` en el fragmento, `chart.umd.min.js` antes de los scripts de contenido en `index.html`, `dashboard.js` tras ellos, y `reportes.css` reutilizado (con un selector hermano `#dashboardRoot .card-header` que no altera las reglas de Reportes). Servicios y otras páginas quedan intactos.

<details>
<summary>Issues (0)</summary>

Sin hallazgos bloqueantes ni accionables.

</details>

<details>
<summary>Details</summary>

### Semántica de los cuatro KPIs

Las cuatro agregaciones corren en JS sobre los arrays que ya devuelven los servicios, sin SQL nuevo. Compras Pendientes se calcula como el complemento de los estados terminales (`e !== 'entregado' && e !== 'cancelado'`), que es la lectura correcta de la decisión del usuario "todo lo que no esté entregado o cancelado estará pendiente" — incluye `aprobado`, `pendiente`, cualquier estado futuro y filas con estatus vacío (confirmed). Compras Aprobadas usa igualdad estricta con `aprobado` (confirmed). Equipos Inactivos mapea `funciona === 'si'` y Equipos Averiados `funciona === 'no'`, respetando la inversión explícita del usuario ("lo que esté en funciona sí estará como inactivo, lo que esté como no como averiado") y la eliminación del estado reparable (confirmed). Todas las comparaciones pasan por `normalizar()`, que aplica `(valor ?? '').toString().trim().toLowerCase()`, de modo que `'Sí '`, `'SI'` o `'si'` se tratan igual.

### Gráfica por departamento y degradación sin Chart.js

`departmentChart` reusa `contarPor` + `ordenarMapa` idénticos a reportes.js, con orden descendente y el mismo criterio "Sin departamento" para valores vacíos. La paleta, `coloresPara` y `opcionesBase` (con `maintainAspectRatio:false`) se clonaron tal cual; el canvas vive dentro de `.reporte-chart-wrapper` (altura fija 320px), condición necesaria para que `maintainAspectRatio:false` no haga crecer el canvas. Cuando no hay datos se muestra el estado `reporte-vacio` "Sin datos".

El dashboard mejora sobre reportes.js en un punto: si `window.Chart` falta, reportes.js hace `return false` y aborta todo el render; el dashboard marca `chartDisponible = false`, inserta el aviso y continúa poblando los KPIs y la lista. Es una degradación más útil para una pantalla principal (confirmed, comparando ambos `init`).

### Lista de movimientos y seguridad del texto

```
productos ─(fecha_ingreso)→ "Alta de almacen: {producto} {marca}"  ┐
                                                                    ├─ sort(fecha desc) ─ slice(0,8)
compras  ─(fecha_solicitud)→ "Compra {estatus}: {producto} (x{n})" ┘
```

Las fechas se validan contra `^\d{4}-\d{2}-\d{2}$` y las que no cumplen se descartan, así que el orden lexicográfico descendente es equivalente al cronológico. Cada `<li>` recibe su contenido por `textContent` y la fecha va en un `<small>` también por `textContent`; no hay `innerHTML` con datos de la DB, lo que cierra el vector de inyección aunque un producto o estatus contenga caracteres HTML (confirmed). Cuando no hay movimientos, se inserta un único `<li>` "Sin movimientos registrados".

### Correspondencia de ids y patrón de carga

Cada `getElementById` de dashboard.js tiene su contraparte en el fragmento: `dashboardRoot`, `totalComprasPendientes`, `totalComprasAprobadas`, `totalEquiposInactivos`, `totalEquiposAveriados`, `departmentChart` (dentro de `.reporte-chart-wrapper`) y `movementList`. La búsqueda de `Reparables`/`totalEquiposReparables`/`cardEquiposReparables` en todo `src/ui` dio cero coincidencias, confirmando que la tarjeta y sus ids se eliminaron sin dejar referencias huérfanas (confirmed). Las cuatro tarjetas usan `col-md-6 col-lg-3`, un grid equilibrado para cuatro elementos. En `index.html`, `chart.umd.min.js` aparece antes de `contentArea.js` y `dashboard.js` después de los scripts de contenido, con `reportes.css` enlazado en el `<head>`; `bootstrap.bundle`, `app.js` y `compras.js` quedaron intactos (confirmed).

### Nombres de columna contra el esquema

Las columnas que consume el dashboard existen en los `SELECT` de los servicios: compras expone `estatus`, `cantidad`, `producto`, `fecha_solicitud`; almacén expone `funciona`, `departamento`, `producto`, `marca`, `fecha_ingreso` (confirmed contra `compras.service.js` y `almacen.service.js`). No se tocaron los servicios ni se escribió SQL nuevo.

### Verificación

El coder dejó evidencia en el plan: `node --check` sobre dashboard.js y contentArea.js con exit 0, barridos `Select-String` del fragmento e index.html, y la correspondencia 1:1 de ids. Como spot-check puntual reejecuté `node --check "src/ui/js/dashboard.js"` (exit 0) y el barrido de `Reparables` en `src/ui` (0 coincidencias); ambos coinciden con lo reportado. No hay suite de tests ni linter en el proyecto Electron, por lo que la verificación integral de render queda sujeta a `npm start`, fuera del alcance automatizable.

</details>

<details>
<summary>Mapa de archivos</summary>

- `src/ui/js/dashboard.js` (nuevo) — módulo del dashboard: helpers clonados de reportes.js, cuatro KPIs, gráfica por departamento, lista de movimientos, `MutationObserver` sobre el root.
- `src/ui/partials/dashboard-fragment.html` — `id="dashboardRoot"`, tarjeta Reparables eliminada, cuatro columnas `col-md-6 col-lg-3`, canvas envuelto en `.reporte-chart-wrapper`, `ul#movementList` vacío.
- `src/ui/pages/index.html` — enlace a `reportes.css`, `chart.umd.min.js` antes de los scripts de contenido, `dashboard.js` al final.
- `src/ui/assets/css/reportes.css` — selector hermano `#dashboardRoot .card-header` añadido sin alterar reglas existentes.

Diff: cambios locales en el workspace (no es repo git).

</details>
