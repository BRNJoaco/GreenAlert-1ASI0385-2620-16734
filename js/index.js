(function () {
    "use strict";

    // Selectores abreviados
    const $ = function (s, r) { return (r || document).querySelector(s); };
    const $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
    
    const esc = function (s) { 
        return String(s).replace(/[&<>"']/g, function (c) { 
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; 
        }); 
    };

    const coloresSeveridad = { c: "#e5384f", p: "#f5b400", a: "#0f9d58" };
    const estadoReporte = { c: "Crítico", p: "En proceso", a: "Atendido" };
    const iconosTipo = { "Plásticos y PET": "🧴", "Orgánicos": "🍂", "Escombros": "🧱", "Foco infeccioso": "⚠️" };
    const coordenadasCentro = [-12.0977, -77.0365];

    const memoriaLocal = {};
    const store = {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return memoriaLocal[k] || null; } },
        set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { memoriaLocal[k] = v; } }
    };

    const obtenerUsuarios = function () { try { return JSON.parse(store.get("ga_users") || "{}"); } catch (e) { return {}; } };
    const obtenerSesion = function () { try { return JSON.parse(store.get("ga_session") || "null"); } catch (e) { return null; } };

    function mostrarToast(mensaje) {
        const el = $("#toast");
        el.textContent = mensaje;
        el.classList.add("show");
        clearTimeout(mostrarToast.t);
        mostrarToast.t = setTimeout(function () { el.classList.remove("show"); }, 3200);
    }

    /* ==========================================
       APLICACIÓN DE CLASES ES2015
       ========================================== */
    class Reporte {
        constructor(id, tipo, lat, lng, direccion, photo = null, ts = Date.now(), owner = null) {
            this.id = id;
            this.t = tipo;
            this.lat = lat;
            this.lng = lng;
            this.addr = direccion;
            this.photo = photo;
            this.ts = ts;
            this.owner = owner;
            this.conf = +(88 + Math.random() * 7).toFixed(1);
            
            // Propiedades "privadas" simuladas (convención con guion bajo)
            this._severidad = tipo === "Foco infeccioso" ? "Alta" : "Media";
            this._estadoS = tipo === "Foco infeccioso" ? "c" : "p";
            this.eta = tipo === "Foco infeccioso" ? "Prioritario" : "Pendiente de asignación";
        }

        // Getters para acceder a las variables internas de la clase
        get sev() {
            return this._severidad;
        }

        get s() {
            return this._estadoS;
        }

        get when() {
            const m = Math.round((Date.now() - this.ts) / 60000);
            return m < 1 ? "Justo ahora" : m < 60 ? `Hace ${m} min` : m < 1440 ? `Hace ${Math.round(m / 60)} h` : `Hace ${Math.round(m / 1440)} días`;
        }
    }

    let proximoId = 100;
    const reportesData = [];

    // Instanciar objetos de la clase Reporte desde el almacenamiento
    try {
        JSON.parse(store.get("ga_reports") || "[]").forEach(function (r) {
            reportesData.push(new Reporte(r.id, r.t, r.lat, r.lng, r.addr, r.photo, r.ts, r.owner));
            proximoId = Math.max(proximoId, r.id + 1);
        });
    } catch (e) {}

    const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const ATTR = "&copy; OpenStreetMap contributors";
    
    function inicializarMapa(id, opts) {
        const m = L.map(id, opts);
        L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(m);
        return m;
    }
    
    function crearPin(s, sel) {
        return L.divIcon({ className: "", html: '<div class="pin' + (sel ? " sel" : "") + '" style="background:' + coloresSeveridad[s] + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    }

    const mapaPrincipal = inicializarMapa("bigMap", { center: coordenadasCentro, zoom: 12, scrollWheelZoom: false });
    const capaMarcadores = L.layerGroup().addTo(mapaPrincipal);
    let filtroActual = "all";
    let reporteSeleccionado = null;

    function dibujarMarcadores() {
        capaMarcadores.clearLayers();
        reportesData.filter(function (d) { return filtroActual === "all" || d.s === filtroActual; }).forEach(function (d) {
            L.circle([d.lat, d.lng], { radius: d.s === "c" ? 650 : 420, stroke: false, fillColor: coloresSeveridad[d.s], fillOpacity: .14 }).addTo(capaMarcadores);
            const m = L.marker([d.lat, d.lng], { icon: crearPin(d.s, reporteSeleccionado === d.id), title: d.t }).addTo(capaMarcadores);
            m.on("click", function () { seleccionarReporte(d.id); });
        });
    }

    function seleccionarReporte(id) {
        reporteSeleccionado = id;
        const d = reportesData.find(function (x) { return x.id === id; });

        const contenidoFoto = d.photo 
            ? '<img src="' + d.photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" alt="Foto del reporte">' 
            : iconosTipo[d.t];

       $("#panel").innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><span class="tag ' + d.s + '">' + estadoReporte[d.s] + '</span><small style="color:var(--mut)">' + esc(d.when) + '</small></div>' +
            '<h3>' + esc(d.t) + ' en ' + esc(d.addr.split(",")[0]) + '</h3><small style="color:var(--mut)">' + esc(d.addr) + '</small>' +
            '<div class="ph" style="overflow:hidden;">' + contenidoFoto + '</div>' +
            '<div class="row"><span>Clasificación: </span><b>' + esc(d.t) + '</b></div><div class="row"><span>Nivel de severidad: </span><b>' + esc(d.sev) + '</b></div><div class="row"><span>Tiempo estimado de recojo: </span><b>' + esc(d.eta) + '</b></div>' +
            '<div style="display:flex; flex-direction:column; gap:10px; margin-top: 4px;">' +
                '<button class="btn p" id="confirmBtn" style="justify-content:center">Confirmar y apoyar reporte</button>' +
                '<button class="btn" id="shareBtn" style="justify-content:center">Compartir con la cuadrilla municipal</button>' +
            '</div>';

        $("#confirmBtn").onclick = function () {
            if (!obtenerSesion()) { abrirAutenticacion("login", "Inicia sesión para confirmar reportes."); return; }
            this.textContent = "✓ Reporte confirmado";
            this.disabled = true;
            mostrarToast("Gracias por confirmar este reporte");

            // INTEGRACIÓN WEB ANALYTICS: Disparar evento de interacción
            if (typeof gtag === 'function') {
                gtag('event', 'confirmar_reporte', {
                    'event_category': 'Interaccion_Comunidad',
                    'event_label': d.t
                });
            }
        };

        $("#shareBtn").onclick = function () {
            const txt = d.t + " en " + d.addr;
            if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(function () { mostrarToast("Enlace copiado"); }); }
        };

        mapaPrincipal.flyTo([d.lat, d.lng], Math.max(mapaPrincipal.getZoom(), 14), { duration: .6 });
        dibujarMarcadores();
    }

    $("#tabs").addEventListener("click", function (e) {
        const b = e.target.closest("button");
        if (!b) return;
        $$("#tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
        filtroActual = b.dataset.f;
        dibujarMarcadores();
    });

    /* ==========================================
       AUTENTICACIÓN Y MODALES
       ========================================== */
    function abrirModal(id) { $(id).classList.add("show"); }
    function cerrarTodo() { $$(".ov").forEach(function (o) { o.classList.remove("show"); }); }
    $$("[data-close]").forEach(function (b) { b.onclick = cerrarTodo; });

    let modoAutenticacion = "login";
    
    function abrirAutenticacion(m) {
        modoAutenticacion = m || "login";
        const reg = modoAutenticacion === "register";
        $("#nameWrap").hidden = !reg;
        $("#authTitle").textContent = reg ? "Crear cuenta" : "Iniciar sesión";
        abrirModal("#authOv");
    }

    $("#authGo").onclick = function () {
        const mail = $("#aMail").value.trim().toLowerCase(), pass = $("#aPass").value, name = $("#aName").value.trim(), u = obtenerUsuarios();
        if (modoAutenticacion === "register") {
            u[mail] = { name: name, pass: btoa(unescape(encodeURIComponent(pass))) };
            store.set("ga_users", JSON.stringify(u));
        }
        store.set("ga_session", JSON.stringify({ mail: mail, name: u[mail].name }));
        cerrarTodo();
        mostrarToast("Hola, " + u[mail].name.split(" ")[0] + " 👋");
    };

    /* ==========================================
       GESTIÓN DE REPORTES CREADOS
       ========================================== */
    let mapaSeleccion = null, marcadorSeleccion = null, puntoElegido = null;

    function abrirFormularioReporte() {
        if (!obtenerSesion()) { abrirAutenticacion("login"); return; }
        abrirModal("#repOv");
        if (!mapaSeleccion) {
            mapaSeleccion = inicializarMapa("pickMap", { center: coordenadasCentro, zoom: 14 });
            mapaSeleccion.on("click", function (e) { 
                puntoElegido = { lat: e.latlng.lat, lng: e.latlng.lng };
                if (marcadorSeleccion) marcadorSeleccion.setLatLng([puntoElegido.lat, puntoElegido.lng]);
                else marcadorSeleccion = L.marker([puntoElegido.lat, puntoElegido.lng]).addTo(mapaSeleccion);
            });
        }
        setTimeout(function () { mapaSeleccion.invalidateSize(); }, 120);
    }

    $$("[data-report]").forEach(function (b) { b.onclick = abrirFormularioReporte; });

    function guardarYRenderizarReporte(photoDataUrl) {
        const t = $("#rType").value, desc = $("#rDesc").value.trim();
        
        // Creación del nuevo reporte instanciando la clase
        const nuevoReporte = new Reporte(
            proximoId++, 
            t, 
            puntoElegido.lat, 
            puntoElegido.lng, 
            desc || "Reporte ciudadano", 
            photoDataUrl,
            Date.now(),
            obtenerSesion().mail
        );

        reportesData.push(nuevoReporte);
        store.set("ga_reports", JSON.stringify(reportesData.filter(function (x) { return x.owner; })));
        
        cerrarTodo();
        dibujarMarcadores();
        seleccionarReporte(nuevoReporte.id);
        mostrarToast("Reporte enviado exitosamente");

        // INTEGRACIÓN WEB ANALYTICS: Disparar evento de nueva incidencia
        if (typeof gtag === 'function') {
            gtag('event', 'crear_reporte', {
                'event_category': 'Generacion_Datos',
                'event_label': t,
                'value': 1
            });
        }
    }

    $("#repGo").onclick = function () {
        if (!puntoElegido) return;
        const photoInput = $("#rPhoto");
        if (photoInput.files && photoInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function (e) { guardarYRenderizarReporte(e.target.result); };
            reader.readAsDataURL(photoInput.files[0]);
        } else {
            guardarYRenderizarReporte(null);
        }
    };

    dibujarMarcadores();
})();
