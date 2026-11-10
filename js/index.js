(function () {
    "use strict";

    // Selectores abreviados
    const $ = function (s, r) { return (r || document).querySelector(s); };
    const $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
    
    // Utilidad para escapar texto y prevenir XSS
    const esc = function (s) { 
        return String(s).replace(/[&<>"']/g, function (c) { 
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; 
        }); 
    };

    const coloresSeveridad = { c: "#e5384f", p: "#f5b400", a: "#0f9d58" };
    const estadoReporte = { c: "Crítico", p: "En proceso", a: "Atendido" };
    const iconosTipo = { "Plásticos y PET": "🧴", "Orgánicos": "🍂", "Escombros": "🧱", "Foco infeccioso": "⚠️" };
    const coordenadasCentro = [-12.0977, -77.0365];

    // Almacenamiento local con respaldo en memoria
    const memoriaLocal = {};
    const store = {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return memoriaLocal[k] || null; } },
        set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { memoriaLocal[k] = v; } }
    };

    const obtenerUsuarios = function () { try { return JSON.parse(store.get("ga_users") || "{}"); } catch (e) { return {}; } };
    const obtenerSesion = function () { try { return JSON.parse(store.get("ga_session") || "null"); } catch (e) { return null; } };

    // Función de notificaciones Toast
    function mostrarToast(mensaje) {
        const el = $("#toast");
        if (!el) return;
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
            
            // Propiedades simuladas
            this._severidad = tipo === "Foco infeccioso" ? "Alta" : "Media";
            this._estadoS = tipo === "Foco infeccioso" ? "c" : "p";
            this.eta = tipo === "Foco infeccioso" ? "Prioritario" : "Pendiente de asignación";
        }

        get sev() { return this._severidad; }
        get s() { return this._estadoS; }

        get when() {
            const m = Math.round((Date.now() - this.ts) / 60000);
            return m < 1 ? "Justo ahora" : m < 60 ? `Hace ${m} min` : m < 1440 ? `Hace ${Math.round(m / 60)} h` : `Hace ${Math.round(m / 1440)} días`;
        }
    }

    let proximoId = 100;
    const reportesData = [];

    // Instanciar objetos de la clase Reporte desde el almacenamiento local
    try {
        JSON.parse(store.get("ga_reports") || "[]").forEach(function (r) {
            reportesData.push(new Reporte(r.id, r.t, r.lat, r.lng, r.addr, r.photo, r.ts, r.owner));
            proximoId = Math.max(proximoId, r.id + 1);
        });
    } catch (e) {}

    // Carga inicial de datos de prueba base (si el almacenamiento está vacío)
    if (reportesData.length === 0) {
        const datosPrueba = [
            { id: 1, t: "Plásticos y PET", lat: -12.0560, lng: -77.0840, addr: "Av. San Marcos, Gonzales" },
            { id: 2, t: "Foco infeccioso", lat: -12.0930, lng: -77.0300, addr: "Jr. Los Cedros, San Isidro" },
            { id: 3, t: "Escombros", lat: -12.0780, lng: -77.0450, addr: "Av. Salaverry, Jesús María" },
            { id: 4, t: "Orgánicos", lat: -12.1200, lng: -77.0310, addr: "Parque Kennedy, Miraflores" },
            { id: 5, t: "Plásticos y PET", lat: -12.1010, lng: -77.0120, addr: "Av. Javier Prado Este" },
            { id: 6, t: "Orgánicos", lat: -12.0870, lng: -77.0520, addr: "Av. Arequipa, Lince" },
            { id: 7, t: "Escombros", lat: -12.1400, lng: -77.0230, addr: "Av. Grau, Barranco" }
        ];
        datosPrueba.forEach(d => reportesData.push(new Reporte(d.id, d.t, d.lat, d.lng, d.addr, null, Date.now() - (Math.random() * 86400000))));
        proximoId = 8;
    }

    const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const ATTR = "&copy; OpenStreetMap contributors";
    
    function inicializarMapa(id, opts) {
        const el = document.getElementById(id);
        if (!el) return null;
        const m = L.map(id, opts);
        L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(m);
        return m;
    }
    
    function crearPin(s, sel) {
        return L.divIcon({ className: "", html: '<div class="pin' + (sel ? " sel" : "") + '" style="background:' + coloresSeveridad[s] + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    }

    // Mapa Hero
    const mapaHero = inicializarMapa("heroMap", { center: coordenadasCentro, zoom: 13, zoomControl: false, scrollWheelZoom: false });
    if (mapaHero) {
        reportesData.forEach(function (d) {
            L.circle([d.lat, d.lng], { radius: d.s === "c" ? 650 : 420, stroke: false, fillColor: coloresSeveridad[d.s], fillOpacity: .16 }).addTo(mapaHero);
            L.marker([d.lat, d.lng], { icon: crearPin(d.s) }).addTo(mapaHero);
        });
    }

    // Mapa Principal (Explorador)
    const mapaPrincipal = inicializarMapa("bigMap", { center: coordenadasCentro, zoom: 12, scrollWheelZoom: false });
    let capaMarcadores = null;
    if (mapaPrincipal) capaMarcadores = L.layerGroup().addTo(mapaPrincipal);
    
    let filtroActual = "all";
    let reporteSeleccionado = null;

    function dibujarMarcadores() {
        if (!capaMarcadores) return;
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
        if (!d) return;

        const contenidoFoto = d.photo 
            ? '<img src="' + d.photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" alt="Foto del reporte">' 
            : iconosTipo[d.t];

        const panel = $("#panel");
        if (panel) {
            panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><span class="tag ' + d.s + '">' + estadoReporte[d.s] + '</span><small style="color:var(--mut)">' + esc(d.when) + '</small></div>' +
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

                // Evento Web Analytics
                if (typeof gtag === 'function') {
                    gtag('event', 'confirmar_reporte', {
                        'event_category': 'Interaccion_Comunidad',
                        'event_label': d.t
                    });
                }
            };

            $("#shareBtn").onclick = function () {
                const txt = d.t + " en " + d.addr + " — https://www.openstreetmap.org/?mlat=" + d.lat + "&mlon=" + d.lng + "#map=17/" + d.lat + "/" + d.lng;
                if (navigator.share) { navigator.share({ title: "GreenAlert", text: txt }).catch(function () {}); }
                else if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(function () { mostrarToast("Enlace copiado"); }, function () { mostrarToast("No se pudo copiar"); }); }
                else mostrarToast("Copia este enlace: " + txt);
            };
        }

        if (mapaPrincipal) {
            mapaPrincipal.flyTo([d.lat, d.lng], Math.max(mapaPrincipal.getZoom(), 14), { duration: .6 });
        }
        dibujarMarcadores();
    }

    if ($("#tabs")) {
        $("#tabs").addEventListener("click", function (e) {
            const b = e.target.closest("button");
            if (!b) return;
            $$("#tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
            filtroActual = b.dataset.f;
            dibujarMarcadores();
            const v = reportesData.filter(function (d) { return filtroActual === "all" || d.s === filtroActual; });
            if (v.length && mapaPrincipal) mapaPrincipal.fitBounds(v.map(function (d) { return [d.lat, d.lng]; }), { padding: [50, 50], maxZoom: 14 });
        });
    }

    // Efecto contador en números (Interseccion Observer)
    const observadorInterseccion = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
            if (!e.isIntersecting) return;
            observadorInterseccion.unobserve(e.target);
            const el = e.target, n = +el.dataset.n, p = el.dataset.p || "", s = el.dataset.s || "", t0 = performance.now();
            (function step(t) {
                const k = Math.min((t - t0) / 1200, 1), v = Math.round(n * (1 - Math.pow(1 - k, 3)));
                el.textContent = p + (n > 999 ? v.toLocaleString("en-US") : v) + s;
                if (k < 1) requestAnimationFrame(step);
            })(t0);
        });
    }, { threshold: .4 });

    $$(".num[data-n]").forEach(function (el) { observadorInterseccion.observe(el); });

    // Menú móvil responsive
    if ($("#burger")) {
        $("#burger").onclick = function () { $("#menu").classList.toggle("open"); };
        $$("#menu a").forEach(function (a) { a.onclick = function () { $("#menu").classList.remove("open"); }; });
    }

    /* ==========================================
       AUTENTICACIÓN Y MODALES (COMPLETO)
       ========================================== */
    function abrirModal(id) { $(id).classList.add("show"); }
    function cerrarTodo() { $$(".ov").forEach(function (o) { o.classList.remove("show"); }); }

    $$("[data-close]").forEach(function (b) { b.onclick = cerrarTodo; });
    $$(".ov").forEach(function (o) { o.addEventListener("mousedown", function (e) { if (e.target === o) cerrarTodo(); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarTodo(); });

    let modoAutenticacion = "login";
    
    function establecerModoAuth(m) {
        modoAutenticacion = m;
        const reg = m === "register";
        if ($("#nameWrap")) $("#nameWrap").hidden = !reg;
        if ($("#authTitle")) $("#authTitle").textContent = reg ? "Crear cuenta" : "Iniciar sesión";
        if ($("#authGo")) $("#authGo").textContent = reg ? "Crear cuenta" : "Entrar";
        if ($("#swTxt")) $("#swTxt").textContent = reg ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
        if ($("#swBtn")) $("#swBtn").textContent = reg ? "Inicia sesión" : "Regístrate";
        if ($("#authErr")) $("#authErr").textContent = "";
    }

    function abrirAutenticacion(m, msg) {
        establecerModoAuth(m || "login");
        if (msg && $("#authSub")) $("#authSub").textContent = msg;
        abrirModal("#authOv");
        setTimeout(function () { 
            const el = $(modoAutenticacion === "register" ? "#aName" : "#aMail");
            if (el) el.focus(); 
        }, 50);
    }

    if ($("#authBtn")) {
        $("#authBtn").onclick = function (e) {
            e.stopPropagation();
            if (obtenerSesion()) {
                const um = $("#uMenu");
                if (um) {
                    um.hidden = !um.hidden;
                    this.setAttribute("aria-expanded", String(!um.hidden));
                }
            } else {
                abrirAutenticacion("login", "Accede para reportar y seguir tus incidencias.");
            }
        };
    }

    if ($("#swBtn")) {
        $("#swBtn").onclick = function () { establecerModoAuth(modoAutenticacion === "login" ? "register" : "login"); };
    }

    if ($("#authGo")) {
        $("#authGo").onclick = function () {
            const mailEl = $("#aMail"), passEl = $("#aPass"), nameEl = $("#aName"), err = $("#authErr");
            const mail = mailEl ? mailEl.value.trim().toLowerCase() : "";
            const pass = passEl ? passEl.value : "";
            const name = nameEl ? nameEl.value.trim() : "";
            const u = obtenerUsuarios();

            if (err) err.textContent = "";

            if (!/^\S+@\S+\.\S+$/.test(mail)) { if(err) err.textContent = "Escribe un correo válido."; return; }
            if (pass.length < 6) { if(err) err.textContent = "La contraseña debe tener al menos 6 caracteres."; return; }
            
            if (modoAutenticacion === "register") {
                if (!name) { if(err) err.textContent = "Escribe tu nombre."; return; }
                if (u[mail]) { if(err) err.textContent = "Ese correo ya está registrado. Inicia sesión."; return; }
                u[mail] = { name: name, pass: btoa(unescape(encodeURIComponent(pass))) };
                store.set("ga_users", JSON.stringify(u));
            } else {
                if (!u[mail] || u[mail].pass !== btoa(unescape(encodeURIComponent(pass)))) { 
                    if(err) err.textContent = "Correo o contraseña incorrectos."; 
                    return; 
                }
            }
            
            store.set("ga_session", JSON.stringify({ mail: mail, name: u[mail].name }));
            refrescarEstadoAuth();
            cerrarTodo();
            mostrarToast("Hola, " + u[mail].name.split(" ")[0] + " 👋");
            
            if (abrirAutenticacion.after) { 
                const f = abrirAutenticacion.after; 
                abrirAutenticacion.after = null; 
                f(); 
            }
        };
    }

    if ($("#miOut")) {
        $("#miOut").onclick = function () { 
            if ($("#uMenu")) $("#uMenu").hidden = true;
            store.set("ga_session", "null"); 
            refrescarEstadoAuth(); 
            mostrarToast("Sesión cerrada"); 
        };
    }

    if ($("#miMine")) $("#miMine").onclick = function () { if ($("#uMenu")) $("#uMenu").hidden = true; abrirMisReportes(); };
    if ($("#ctaMine")) $("#ctaMine").onclick = abrirMisReportes;
    if ($("#miReport")) $("#miReport").onclick = function () { if ($("#uMenu")) $("#uMenu").hidden = true; abrirFormularioReporte(); };

    function abrirMisReportes() {
        const s = obtenerSesion();
        if (!s) { abrirAutenticacion.after = abrirMisReportes; abrirAutenticacion("login", "Inicia sesión para ver tus reportes."); return; }
        
        const l = reportesData.filter(function (d) { return d.owner === s.mail; });
        const box = $("#mineList");
        if (box) {
            if (!l.length) {
                box.innerHTML = '<p class="sub" style="font-size:.9rem;margin:16px 0">Aún no tienes reportes. Marca tu primer punto y aparecerá aquí con su estado.</p><button class="btn p" id="mineNew">Generar reporte</button>';
                $("#mineNew").onclick = function () { cerrarTodo(); abrirFormularioReporte(); };
            } else {
                box.innerHTML = l.slice().reverse().map(function (d) { 
                    return '<button class="mi" data-id="' + d.id + '"><span class="tag ' + d.s + '">' + estadoReporte[d.s] + '</span><b>' + esc(d.t) + '</b><small>' + esc(d.addr) + '</small><small>' + esc(d.when) + '</small></button>'; 
                }).join("");
                $$(".mi", box).forEach(function (b) {
                    b.onclick = function () {
                        cerrarTodo(); filtroActual = "all";
                        $$("#tabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.f === "all"); });
                        const mapaDOM = document.getElementById("mapa");
                        if (mapaDOM) mapaDOM.scrollIntoView();
                        seleccionarReporte(+b.dataset.id);
                    };
                });
            }
        }
        abrirModal("#mineOv");
    }

    function refrescarEstadoAuth() {
        const s = obtenerSesion();
        const authBtn = $("#authBtn");
        if (authBtn) {
            authBtn.textContent = s ? s.name.split(" ")[0] + " ▾" : "Iniciar sesión";
        }
        if (!s && $("#uMenu")) {
            $("#uMenu").hidden = true;
        }
    }
    
    document.addEventListener("click", function () { if ($("#uMenu")) $("#uMenu").hidden = true; });
    refrescarEstadoAuth();

    /* ==========================================
       GESTIÓN DE REPORTES CREADOS
       ========================================== */
    let mapaSeleccion = null, marcadorSeleccion = null, puntoElegido = null;

    function abrirFormularioReporte() {
        if (!obtenerSesion()) { abrirAutenticacion.after = abrirFormularioReporte; abrirAutenticacion("login", "Inicia sesión para enviar un reporte."); return; }
        abrirModal("#repOv");
        if ($("#repErr")) $("#repErr").textContent = "";
        if (!mapaSeleccion) {
            mapaSeleccion = inicializarMapa("pickMap", { center: coordenadasCentro, zoom: 14 });
            if (mapaSeleccion) {
                mapaSeleccion.on("click", function (e) { establecerPuntoSeleccion(e.latlng.lat, e.latlng.lng); });
            }
        }
        if (mapaSeleccion) {
            setTimeout(function () { mapaSeleccion.invalidateSize(); }, 120);
        }
    }

    function establecerPuntoSeleccion(lat, lng) {
        puntoElegido = { lat: lat, lng: lng };
        if (marcadorSeleccion) marcadorSeleccion.setLatLng([lat, lng]);
        else if (mapaSeleccion) marcadorSeleccion = L.marker([lat, lng]).addTo(mapaSeleccion);
        if ($("#rHint")) $("#rHint").textContent = "Punto marcado: " + lat.toFixed(5) + ", " + lng.toFixed(5);
    }

    $$("[data-report]").forEach(function (b) { b.onclick = abrirFormularioReporte; });

    if ($("#locBtn")) {
        $("#locBtn").onclick = function () {
            if (!navigator.geolocation) { if ($("#repErr")) $("#repErr").textContent = "Tu navegador no permite geolocalización. Toca el mapa."; return; }
            this.textContent = "Buscando…";
            const b = this;
            navigator.geolocation.getCurrentPosition(
                function (p) {
                    b.textContent = "Usar mi ubicación";
                    if (mapaSeleccion) mapaSeleccion.setView([p.coords.latitude, p.coords.longitude], 17);
                    establecerPuntoSeleccion(p.coords.latitude, p.coords.longitude);
                },
                function () {
                    b.textContent = "Usar mi ubicación";
                    if ($("#repErr")) $("#repErr").textContent = "No pudimos obtener tu ubicación. Toca el mapa para marcarla.";
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        };
    }

    function guardarYRenderizarReporte(photoDataUrl) {
        const t = $("#rType") ? $("#rType").value : "Foco infeccioso";
        const desc = $("#rDesc") ? $("#rDesc").value.trim() : "";
        
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
        
        filtroActual = "all";
        $$("#tabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.f === "all"); });
        cerrarTodo();
        
        if ($("#rDesc")) $("#rDesc").value = "";
        if ($("#rPhoto")) $("#rPhoto").value = "";
        puntoElegido = null;
        if (marcadorSeleccion && mapaSeleccion) { mapaSeleccion.removeLayer(marcadorSeleccion); marcadorSeleccion = null; }
        if ($("#rHint")) $("#rHint").textContent = "Toca el mapa o usa el botón para ubicarte";
        
        dibujarMarcadores();
        seleccionarReporte(nuevoReporte.id);
        const mapaDOM = document.getElementById("mapa");
        if (mapaDOM) mapaDOM.scrollIntoView();
        mostrarToast("Reporte enviado exitosamente");

        // Evento Web Analytics
        if (typeof gtag === 'function') {
            gtag('event', 'crear_reporte', {
                'event_category': 'Generacion_Datos',
                'event_label': t,
                'value': 1
            });
        }
    }

    if ($("#repGo")) {
        $("#repGo").onclick = function () {
            if (!puntoElegido) { if ($("#repErr")) $("#repErr").textContent = "Marca la ubicación en el mapa antes de enviar."; return; }
            const photoInput = $("#rPhoto");
            if (photoInput && photoInput.files && photoInput.files[0]) {
                const reader = new FileReader();
                reader.onload = function (e) { guardarYRenderizarReporte(e.target.result); };
                reader.readAsDataURL(photoInput.files[0]);
            } else {
                guardarYRenderizarReporte(null);
            }
        };
    }

    dibujarMarcadores();
    if (reportesData.length > 0) seleccionarReporte(reportesData[0].id);

})();

```
