(function () {
    "use strict";

    // Selectores abreviados
    var $ = function (s, r) { return (r || document).querySelector(s) };
    var $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)) };
    
    // Utilidad para escapar texto y prevenir XSS
    var esc = function (s) { 
        return String(s).replace(/[&<>"']/g, function (c) { 
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] 
        }) 
    };

    var COL = { c: "#e5384f", p: "#f5b400", a: "#0f9d58" };
    var ST = { c: "Crítico", p: "En proceso", a: "Atendido" };
    var ICON = { "Plásticos y PET": "🧴", "Orgánicos": "🍂", "Escombros": "🧱", "Foco infeccioso": "⚠️" };
    var CENTER = [-12.0977, -77.0365];

    // Almacenamiento local con respaldo en memoria
    var mem = {};
    var store = {
        get: function (k) { try { return localStorage.getItem(k) } catch (e) { return mem[k] || null } },
        set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) { mem[k] = v } }
    };

    var users = function () { try { return JSON.parse(store.get("ga_users") || "{}") } catch (e) { return {} } };
    var session = function () { try { return JSON.parse(store.get("ga_session") || "null") } catch (e) { return null } };

    // Función de notificaciones Toast
    function toast(t) {
        var el = $("#toast");
        el.textContent = t;
        el.classList.add("show");
        clearTimeout(toast.t);
        toast.t = setTimeout(function () { el.classList.remove("show") }, 3200);
    }


    var data = [
        { id: 1, t: "Plásticos y PET", s: "p", sev: "Media", lat: -12.0560, lng: -77.0840, addr: "Av. San Marcos, Gonzales", eta: "Pendiente de asignación", when: "Justo ahora", conf: 90.7 },
        { id: 2, t: "Foco infeccioso", s: "c", sev: "Alta", lat: -12.0930, lng: -77.0300, addr: "Jr. Los Cedros, San Isidro", eta: "Cuadrilla en camino (2 h)", when: "Hace 12 min", conf: 94.2 },
        { id: 3, t: "Escombros", s: "p", sev: "Media", lat: -12.0780, lng: -77.0450, addr: "Av. Salaverry, Jesús María", eta: "Maquinaria asignada (1 día)", when: "Hace 1 h", conf: 88.5 },
        { id: 4, t: "Orgánicos", s: "a", sev: "Baja", lat: -12.1200, lng: -77.0310, addr: "Parque Kennedy, Miraflores", eta: "Recogido", when: "Ayer", conf: 91.3 },
        { id: 5, t: "Plásticos y PET", s: "c", sev: "Alta", lat: -12.1010, lng: -77.0120, addr: "Av. Javier Prado Este", eta: "Pendiente de asignación", when: "Hace 25 min", conf: 92.8 },
        { id: 6, t: "Orgánicos", s: "p", sev: "Media", lat: -12.0870, lng: -77.0520, addr: "Av. Arequipa, Lince", eta: "Ruta programada (4 h)", when: "Hace 3 h", conf: 86.9 },
        { id: 7, t: "Escombros", s: "a", sev: "Baja", lat: -12.1400, lng: -77.0230, addr: "Av. Grau, Barranco", eta: "Recogido", when: "Hace 2 días", conf: 89.4 },
        { id: 8, t: "Plásticos y PET", s: "a", sev: "Baja", lat: -12.1050, lng: -77.0600, addr: "Malecón, Magdalena", eta: "Recogido", when: "Hace 3 días", conf: 93.1 },
        { id: 9, t: "Foco infeccioso", s: "p", sev: "Alta", lat: -12.0690, lng: -77.0230, addr: "Av. Wilson, Cercado de Lima", eta: "Inspección sanitaria (6 h)", when: "Hace 5 h", conf: 90.0 }
    ];
    var nextId = 100;

    function ago(ts) {
        var m = Math.round((Date.now() - ts) / 60000);
        return m < 1 ? "Justo ahora" : m < 60 ? "Hace " + m + " min" : m < 1440 ? "Hace " + Math.round(m / 60) + " h" : "Hace " + Math.round(m / 1440) + " días";
    }

    try {
        JSON.parse(store.get("ga_reports") || "[]").forEach(function (r) {
            r.when = ago(r.ts);
            data.push(r);
            nextId = Math.max(nextId, r.id + 1);
        });
    } catch (e) {}


    var TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", ATTR = "&copy; OpenStreetMap contributors";
    
    function mk(id, opts) {
        var m = L.map(id, opts);
        L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(m);
        return m;
    }
    
    function pin(s, sel) {
        return L.divIcon({ className: "", html: '<div class="pin' + (sel ? " sel" : "") + '" style="background:' + COL[s] + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    }

    // Mapa Hero
    var hero = mk("heroMap", { center: CENTER, zoom: 13, zoomControl: false, scrollWheelZoom: false });
    data.forEach(function (d) {
        L.circle([d.lat, d.lng], { radius: d.s === "c" ? 650 : 420, stroke: false, fillColor: COL[d.s], fillOpacity: .16 }).addTo(hero);
        L.marker([d.lat, d.lng], { icon: pin(d.s) }).addTo(hero);
    });

    // Mapa Principal (Explorador)
    var big = mk("bigMap", { center: CENTER, zoom: 12, scrollWheelZoom: false });
    var layer = L.layerGroup().addTo(big), markers = {}, filter = "all", selected = null;

    function draw() {
        layer.clearLayers();
        markers = {};
        data.filter(function (d) { return filter === "all" || d.s === filter }).forEach(function (d) {
            L.circle([d.lat, d.lng], { radius: d.s === "c" ? 650 : 420, stroke: false, fillColor: COL[d.s], fillOpacity: .14 }).addTo(layer);
            var m = L.marker([d.lat, d.lng], { icon: pin(d.s, selected === d.id), title: d.t }).addTo(layer);
            m.on("click", function () { select(d.id) });
            markers[d.id] = m;
        });
    }

    function select(id) {
        selected = id;
        var d = data.find(function (x) { return x.id === id });

        var phContent = d.photo 
            ? '<img src="' + d.photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" alt="Foto del reporte">' 
            : ICON[d.t];

       $("#panel").innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><span class="tag ' + d.s + '">' + ST[d.s] + '</span><small style="color:var(--mut)">' + esc(d.when) + '</small></div>' +
            '<h3>' + esc(d.t) + ' en ' + esc(d.addr.split(",")[0]) + '</h3><small style="color:var(--mut)">' + esc(d.addr) + '</small>' +
            '<div class="ph" style="overflow:hidden;">' + phContent + '</div>' +
            '<div class="row"><span>Clasificación: </span><b>' + esc(d.t) + '</b></div><div class="row"><span>Nivel de severidad: </span><b>' + esc(d.sev) + '</b></div><div class="row"><span>Tiempo estimado de recojo: </span><b>' + esc(d.eta) + '</b></div>' +
            '<div style="display:flex; flex-direction:column; gap:10px; margin-top: 4px;">' +
                '<button class="btn p" id="confirmBtn" style="justify-content:center">Confirmar y apoyar reporte</button>' +
                '<button class="btn" id="shareBtn" style="justify-content:center">Compartir con la cuadrilla municipal</button>' +
            '</div>';

        $("#confirmBtn").onclick = function () {
            if (!session()) { openAuth("login", "Inicia sesión para confirmar reportes."); return }
            this.textContent = "✓ Reporte confirmado";
            this.disabled = true;
            toast("Gracias por confirmar este reporte");
        };

        $("#shareBtn").onclick = function () {
            var txt = d.t + " en " + d.addr + " — https://www.openstreetmap.org/?mlat=" + d.lat + "&mlon=" + d.lng + "#map=17/" + d.lat + "/" + d.lng;
            if (navigator.share) { navigator.share({ title: "GreenAlert", text: txt }).catch(function () {}) }
            else if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(function () { toast("Enlace copiado") }, function () { toast("No se pudo copiar") }) }
            else toast("Copia este enlace: " + txt);
        };

        big.flyTo([d.lat, d.lng], Math.max(big.getZoom(), 14), { duration: .6 });
        draw();
    }

    $("#tabs").addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        $$("#tabs button").forEach(function (x) { x.classList.toggle("on", x === b) });
        filter = b.dataset.f;
        draw();
        var v = data.filter(function (d) { return filter === "all" || d.s === filter });
        if (v.length) big.fitBounds(v.map(function (d) { return [d.lat, d.lng] }), { padding: [50, 50], maxZoom: 14 });
    });

    draw();
    select(1);

    var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            var el = e.target, n = +el.dataset.n, p = el.dataset.p || "", s = el.dataset.s || "", t0 = performance.now();
            (function step(t) {
                var k = Math.min((t - t0) / 1200, 1), v = Math.round(n * (1 - Math.pow(1 - k, 3)));
                el.textContent = p + (n > 999 ? v.toLocaleString("en-US") : v) + s;
                if (k < 1) requestAnimationFrame(step)
            })(t0);
        })
    }, { threshold: .4 });

    $$(".num[data-n]").forEach(function (el) { io.observe(el) });

    /* ==========================================
       NAVEGACIÓN MÓVIL (Menú Responsive)
       ========================================== */
    $("#burger").onclick = function () { $("#menu").classList.toggle("open") };
    $$("#menu a").forEach(function (a) { a.onclick = function () { $("#menu").classList.remove("open") } });

    /* ==========================================
       MODALES Y AUTENTICACIÓN
       ========================================== */
    function openModal(id) { $(id).classList.add("show") }
    function closeAll() { $$(".ov").forEach(function (o) { o.classList.remove("show") }) }

    $$("[data-close]").forEach(function (b) { b.onclick = closeAll });
    $$(".ov").forEach(function (o) { o.addEventListener("mousedown", function (e) { if (e.target === o) closeAll() }) });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll() });

    var mode = "login";
    function setMode(m) {
        mode = m;
        var reg = m === "register";
        $("#nameWrap").hidden = !reg;
        $("#authTitle").textContent = reg ? "Crear cuenta" : "Iniciar sesión";
        $("#authGo").textContent = reg ? "Crear cuenta" : "Entrar";
        $("#swTxt").textContent = reg ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
        $("#swBtn").textContent = reg ? "Inicia sesión" : "Regístrate";
        $("#authErr").textContent = "";
    }

    function openAuth(m, msg) {
        setMode(m || "login");
        if (msg) $("#authSub").textContent = msg;
        openModal("#authOv");
        setTimeout(function () { $(m === "register" ? "#aName" : "#aMail").focus() }, 50);
    }

    function refreshAuth() {
        var s = session();
        $("#authBtn").textContent = s ? s.name.split(" ")[0] + " ▾" : "Iniciar sesión";
        if (!s) menu(false);
    }

    $("#swBtn").onclick = function () { setMode(mode === "login" ? "register" : "login") };
    var um = $("#uMenu");

    function menu(show) {
        um.hidden = !show;
        $("#authBtn").setAttribute("aria-expanded", String(show));
    }

    $("#authBtn").onclick = function (e) {
        e.stopPropagation();
        if (session()) menu(um.hidden);
        else openAuth("login", "Accede para reportar y seguir tus incidencias.");
    };

    document.addEventListener("click", function () { menu(false) });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") menu(false) });

    $("#miReport").onclick = function () { menu(false); openReport() };
    $("#miMine").onclick = function () { menu(false); openMine() };
    $("#miOut").onclick = function () { menu(false); store.set("ga_session", "null"); refreshAuth(); toast("Sesión cerrada") };
    $("#ctaMine").onclick = openMine;

    function openMine() {
        var s = session();
        if (!s) { openAuth.after = openMine; openAuth("login", "Inicia sesión para ver tus reportes."); return }
        var l = data.filter(function (d) { return d.owner === s.mail }), box = $("#mineList");
        if (!l.length) {
            box.innerHTML = '<p class="sub" style="font-size:.9rem;margin:16px 0">Aún no tienes reportes. Marca tu primer punto y aparecerá aquí con su estado.</p><button class="btn p" id="mineNew">Generar reporte</button>';
            $("#mineNew").onclick = function () { closeAll(); openReport() };
        } else {
            box.innerHTML = l.slice().reverse().map(function (d) { return '<button class="mi" data-id="' + d.id + '"><span class="tag ' + d.s + '">' + ST[d.s] + '</span><b>' + esc(d.t) + '</b><small>' + esc(d.addr) + '</small><small>' + esc(ago(d.ts)) + '</small></button>' }).join("");
            $$(".mi", box).forEach(function (b) {
                b.onclick = function () {
                    closeAll(); filter = "all";
                    $$("#tabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.f === "all") });
                    document.getElementById("mapa").scrollIntoView();
                    select(+b.dataset.id);
                }
            });
        }
        openModal("#mineOv");
    }

    $("#authGo").onclick = function () {
        var mail = $("#aMail").value.trim().toLowerCase(), pass = $("#aPass").value, name = $("#aName").value.trim(), err = $("#authErr"), u = users();
        if (!/^\S+@\S+\.\S+$/.test(mail)) { err.textContent = "Escribe un correo válido."; return }
        if (pass.length < 6) { err.textContent = "La contraseña debe tener al menos 6 caracteres."; return }
        if (mode === "register") {
            if (!name) { err.textContent = "Escribe tu nombre."; return }
            if (u[mail]) { err.textContent = "Ese correo ya está registrado. Inicia sesión."; return }
            u[mail] = { name: name, pass: btoa(unescape(encodeURIComponent(pass))) };
            store.set("ga_users", JSON.stringify(u));
        } else {
            if (!u[mail] || u[mail].pass !== btoa(unescape(encodeURIComponent(pass)))) { err.textContent = "Correo o contraseña incorrectos."; return }
        }
        store.set("ga_session", JSON.stringify({ mail: mail, name: u[mail].name }));
        refreshAuth();
        closeAll();
        toast("Hola, " + u[mail].name.split(" ")[0] + " 👋");
        if (openAuth.after) { var f = openAuth.after; openAuth.after = null; f() }
    };
    refreshAuth();

    /* ==========================================
       GESTIÓN DE REPORTES Y PROCESAMIENTO DE IMAGEN
       ========================================== */
    var pick = null, pickMarker = null, pt = null;

    function openReport() {
        if (!session()) { openAuth.after = openReport; openAuth("login", "Inicia sesión para enviar un reporte."); return }
        openModal("#repOv");
        $("#repErr").textContent = "";
        if (!pick) {
            pick = mk("pickMap", { center: CENTER, zoom: 14 });
            pick.on("click", function (e) { setPt(e.latlng.lat, e.latlng.lng) });
        }
        setTimeout(function () { pick.invalidateSize() }, 120);
    }

    function setPt(lat, lng) {
        pt = { lat: lat, lng: lng };
        if (pickMarker) pickMarker.setLatLng([lat, lng]);
        else pickMarker = L.marker([lat, lng]).addTo(pick);
        $("#rHint").textContent = "Punto marcado: " + lat.toFixed(5) + ", " + lng.toFixed(5);
    }

    $$("[data-report]").forEach(function (b) { b.onclick = openReport });

    $("#locBtn").onclick = function () {
        if (!navigator.geolocation) { $("#repErr").textContent = "Tu navegador no permite geolocalización. Toca el mapa."; return }
        this.textContent = "Buscando…";
        var b = this;
        navigator.geolocation.getCurrentPosition(
            function (p) {
                b.textContent = "Usar mi ubicación";
                pick.setView([p.coords.latitude, p.coords.longitude], 17);
                setPt(p.coords.latitude, p.coords.longitude);
            },
            function () {
                b.textContent = "Usar mi ubicación";
                $("#repErr").textContent = "No pudimos obtener tu ubicación. Toca el mapa para marcarla.";
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    function saveAndRenderReport(photoDataUrl) {
        var t = $("#rType").value, desc = $("#rDesc").value.trim();
        var d = {
            id: nextId++, t: t, s: t === "Foco infeccioso" ? "c" : "p", sev: t === "Foco infeccioso" ? "Alta" : "Media",
            lat: pt.lat, lng: pt.lng, addr: desc || "Reporte ciudadano", eta: "Pendiente de asignación",
            when: "Justo ahora", conf: +(88 + Math.random() * 7).toFixed(1),
            photo: photoDataUrl || null
        };
        d.owner = session().mail;
        d.ts = Date.now();
        data.push(d);

        // Guardar reportes creados por usuarios
        store.set("ga_reports", JSON.stringify(data.filter(function (x) { return x.owner })));
        
        filter = "all";
        $$("#tabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.f === "all") });
        closeAll();
        
        // Limpiar campos del formulario
        $("#rDesc").value = "";
        $("#rPhoto").value = "";
        pt = null;
        if (pickMarker) { pick.removeLayer(pickMarker); pickMarker = null }
        
        draw();
        select(d.id);
        document.getElementById("mapa").scrollIntoView();
        toast("Reporte enviado y clasificado como " + t);
    }

    $("#repGo").onclick = function () {
        if (!pt) { $("#repErr").textContent = "Marca la ubicación en el mapa antes de enviar."; return }
        
        var photoInput = $("#rPhoto");
        if (photoInput.files && photoInput.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                saveAndRenderReport(e.target.result);
            };
            reader.readAsDataURL(photoInput.files[0]);
        } else {
            saveAndRenderReport(null);
        }
    };

})();