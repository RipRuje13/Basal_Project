# Sistema de Inventario SIN — Basal Project

Aplicación de escritorio (Electron) para la gestión de **compras** y **almacén de equipos** de la organización. Permite registrar solicitudes de compra, administrar el inventario de equipos con historial y fotografías, filtrar la información y exportarla a Excel y PDF.

## Tecnologías

- **Electron** — aplicación de escritorio multiplataforma.
- **SQLite** (`sqlite3`) — base de datos local en `data/inventario.db`.
- **Bootstrap 5** + **Bootstrap Icons** — interfaz de usuario.
- **Chart.js** — gráficas del módulo de reportes.

## Estructura del proyecto

```
src/
├── main/              # Proceso principal de Electron
│   ├── index.js       # Arranque, handlers IPC (exportar Excel/PDF)
│   └── window.js      # Creación de la ventana
├── database/
│   └── connection.js  # Conexión a SQLite
├── services/          # Acceso a datos (CRUD)
│   ├── compras.service.js
│   └── almacen.service.js
└── ui/
    ├── pages/         # Páginas HTML (index, compras, almacen, reportes)
    ├── partials/      # Navbar y fragmentos de contenido
    ├── js/            # Lógica de cada vista
    └── assets/        # CSS y librerías (Bootstrap, Chart.js)
```

## Requisitos previos

- [Node.js](https://nodejs.org/) (incluye npm).

## Instalación

```bash
npm install
```

> Nota: `sqlite3` es un módulo nativo. Si aparece un error de compatibilidad con la versión de Electron, reconstruye los binarios nativos:
>
> ```bash
> npx electron-rebuild
> ```

## Ejecución

```bash
npm start
```

## Funcionalidades

### Navegación
- Barra de navegación con resaltado automático de la sección activa (Inicio, Compras, Almacén, Reportes).
- Barras de desplazamiento vertical y horizontal que aparecen cuando el contenido no cabe en la ventana.

### Compras
- Registro, edición y eliminación de solicitudes de compra.
- Campo **Mes de Cotización** con los 12 meses del año.
- Filtros por texto, estatus, departamento, unidad de negocio y mes de cotización.
- Botón **Mensual** que filtra las compras por el mes de cotización seleccionado.
- **Paginación** de 10 registros por página.
- **Exportación** de la tabla a **Excel** y **PDF**:
  - Sin filtros activos: exporta todos los registros.
  - Con uno o varios filtros activos: exporta exactamente lo que se muestra en ese momento.

### Almacén
- Inventario de equipos con marca, modelo, número de serie, código de etiqueta, ubicación y estado.
- Historial de usuarios, ubicaciones y fechas por equipo.
- Gestión de fotografías por equipo (almacenadas en `data/almacen-fotos/`).

### Reportes
- Indicadores (KPIs) y gráficas con Chart.js.

## Datos locales

La base de datos SQLite (`data/inventario.db`) y las fotografías (`data/almacen-fotos/`) contienen información local y **no se versionan** en Git (ver `.gitignore`). La tabla de compras y la de almacén se crean automáticamente la primera vez que se ejecuta la aplicación.

## Licencia

ISC
