(function () {
  // Carga el navbar y el content dinámicamente usando fetch.
  // Requiere: navbar.html y archivos content (dashboard/compras/equipos/almacen/reportes) como fragmentos.

  const NAV_URL = "../partials/navbar.html";

  async function loadHtml(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar: ${url} (${res.status})`);
    return await res.text();
  }

  function getPageFromLocation() {
    const page = (
      window.location.pathname.split("/").pop() || "index.html"
    ).toLowerCase();
    // Mapeo a fragmentos
    if (page === "compras.html") return "compras";
    if (page === "equipos.html") return "equipos";
    if (page === "almacen.html") return "almacen";
    if (page === "reportes.html") return "reportes";
    return "dashboard";
  }

  const titleMap = {
    dashboard: "Dashboard",
    compras: "Compras",
    equipos: "Equipos",
    almacen: "Almacén",
    reportes: "Reportes",
  };

  async function bootstrapContent() {
    const page = getPageFromLocation();

    // 1) navbar
    const navbarHtml = await loadHtml(NAV_URL);
    const navbarMount = document.getElementById("navbarMount");
    if (navbarMount) navbarMount.innerHTML = navbarHtml;

    // 2) contenido
    const contentUrlMap = {
      dashboard: "../partials/dashboard-fragment.html",
      compras: "../partials/compras-fragment.html",
      equipos: "../partials/equipos-fragment.html",
      almacen: "../partials/almacen-fragment.html",
      reportes: "../partials/reportes-fragment.html",
    };

    const contentMount = document.getElementById("contentArea");
    if (!contentMount) return;

    const fragmentUrl = contentUrlMap[page];
    if (!fragmentUrl) return;

    const fragmentHtml = await loadHtml(fragmentUrl);
    contentMount.innerHTML = fragmentHtml;

    // También quitamos cualquier navbar

    // 3) título
    const pageTitleEl = document.getElementById("pageTitle");
    if (pageTitleEl)
      pageTitleEl.textContent = titleMap[page] || pageTitleEl.textContent;
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootstrapContent().catch((err) => {
      console.error("Error bootstrap contentArea:", err);
      const contentMount = document.getElementById("contentArea");
      if (contentMount)
        contentMount.innerHTML = `<div class="alert alert-danger">Error cargando contenido.</div>`;
    });

    document.addEventListener("click", (e) => {
      if (e.target.id === "btnAgregar") {
        const modal = document.getElementById("registroNuevoModal");

        if (!modal) return;

        modal.style.display = "flex";
      }
    });

    document.addEventListener("click", (e) => {
      if (e.target.id === "btnCerrarModal") {
        const modal = document.getElementById("registroNuevoModal");

        if (!modal) return;

        modal.style.display = "none";
      }
    });

    document.addEventListener("click", (e) => {
      const modal = document.getElementById("registroNuevoModal");

      if (!modal) return;

      if (e.target === modal) {
        modal.style.display = "none";
      }
    });

    // ==========================================
    // ACCIÓN: EDITAR REGISTRO DE LA TABLA
    // ==========================================
    document.addEventListener("click", (e) => {
      // Buscamos si el clic fue en el botón de editar (o dentro de su ícono)
      const btnEditar = e.target.closest(".btn-editar-fila");
      
      if (btnEditar) {
        const modal = document.getElementById("registroNuevoModal");
        if (!modal) return;

        // 1. Encontrar la fila (<tr>) a la que pertenece el botón
        const fila = btnEditar.closest("tr");
        
        // 2. Mapear los datos de las celdas al formulario
        // Buscamos elementos dentro de la fila que tengan el atributo data-campo
        const celdas = fila.querySelectorAll("[data-campo]");
        
        celdas.forEach(celda => {
          const nombreCampo = celda.getAttribute("data-campo");
          // Buscamos un input/select/textarea en el formulario con el mismo name o id
          const inputFormulario = modal.querySelector(`[name="${nombreCampo}"]`) || modal.querySelector(`#${nombreCampo}`);
          
          if (inputFormulario) {
            // Seteamos el valor de la celda en el input
            inputFormulario.value = celda.textContent.trim();
          }
        });

        // 3. Opcional: Cambiar el título del modal para simular edición
        const legendModal = modal.querySelector("legend span");
        if (legendModal) legendModal.textContent = "Editar Solicitud";

        // 4. Mostrar el modal
        modal.style.display = "flex";
      }
    });

    // ==========================================
    // ACCIÓN: ELIMINAR REGISTRO (MAQUETADO)
    // ==========================================
    document.addEventListener("click", (e) => {
      const btnEliminar = e.target.closest(".btn-eliminar-fila");
      
      if (btnEliminar) {
        // Confirmación nativa solo para simular la interacción por ahora
        const fila = btnEliminar.closest("tr");
        if (confirm("¿Estás seguro de que deseas eliminar este registro?")) {
          fila.style.transition = "all 0.3s ease";
          fila.style.opacity = "0";
          setTimeout(() => fila.remove(), 300); // Lo borra visualmente del DOM
        }
      }
    });

    // REFACTORIZACIÓN PEQUEÑA: Al cerrar el modal, restaurar el título original a "Nueva Solicitud"
    document.addEventListener("click", (e) => {
      if (e.target.id === "btnCerrarModal" || e.target.id === "registroNuevoModal") {
        const modal = document.getElementById("registroNuevoModal");
        const legendModal = modal?.querySelector("legend span");
        if (legendModal) legendModal.textContent = "Nueva Solicitud";
        
        // También es buena práctica limpiar el formulario al cerrar si así lo deseas
        const form = modal?.querySelector("form");
        if (form && e.target.id === "btnCerrarModal") form.reset(); 
      }
    });
  });
})();
