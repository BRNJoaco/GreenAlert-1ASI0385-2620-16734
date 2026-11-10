(function () {
    "use strict";

    // Devuelve el primer elemento del DOM que coincide con el selector.
    function obtener(selector, raiz) {
        return (raiz || document).querySelector(selector);
    }

    // Devuelve un arreglo con todos los elementos del DOM que coinciden con el selector.
    function obtenerTodos(selector, raiz) {
        return Array.from((raiz || document).querySelectorAll(selector));
    }

    // Reemplaza los caracteres especiales de HTML por entidades para prevenir ataques XSS.
    function escaparHtml(texto) {
        return String(texto).replace(/[&<>"']/g, function (caracter) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[caracter];
        });
    }

    const colores = { c: "#e5384f", p: "#f5b400", a: "#0f9d58" };
    const estados = { c: "Crítico", p: "En proceso", a: "Atendido" };
    const iconos = { "Plásticos y PET": "🧴", "Orgánicos": "🍂", "Escombros": "🧱", "Foco infeccioso": "⚠️" };
    const centro = [-12.0977, -77.0365];

    const memoria = {};
    const almacen = {
        // Lee un valor del localStorage; si no está disponible, lo busca en la memoria temporal.
        obtener: function (clave) {
            try {
                return localStorage.getItem(clave);
            } catch (error) {
                return memoria[clave] || null;
            }
        },
        // Guarda un valor en el localStorage; si no está disponible, lo guarda en la memoria temporal.
        guardar: function (clave, valor) {
            try {
                localStorage.setItem(clave, valor);
            } catch (error) {
                memoria[clave] = valor;
            }
        }
    };

    // Devuelve el objeto de usuarios registrados, indexado por correo.
    function obtenerUsuarios() {
        try {
            return JSON.parse(almacen.obtener("ga_users") || "{}");
        } catch (error) {
            return {};
        }
    }

    // Devuelve los datos de la sesión activa o null si no hay sesión iniciada.
    function obtenerSesion() {
        try {
            return JSON.parse(almacen.obtener("ga_session") || "null");
        } catch (error) {
            return null;
        }
    }

    let temporizadorNotificacion;

    // Muestra un mensaje temporal (toast) en pantalla durante poco más de tres segundos.
    function mostrarNotificacion(texto) {
        const elemento = obtener("#toast");
        elemento.textContent = texto;
        elemento.classList.add("show");
        clearTimeout(temporizadorNotificacion);
        temporizadorNotificacion = setTimeout(function () {
            elemento.classList.remove("show");
        }, 3200);
    }

    const reportes = [
        { id: 1, tipo: "Plásticos y PET", estado: "p", severidad: "Media", latitud: -12.0560, longitud: -77.0840, direccion: "Av. San Marcos, Gonzales", tiempoEstimado: "Pendiente de asignación", cuando: "Justo ahora", confianza: 90.7 },
        { id: 2, tipo: "Foco infeccioso", estado: "c", severidad: "Alta", latitud: -12.0930, longitud: -77.0300, direccion: "Jr. Los Cedros, San Isidro", tiempoEstimado: "Cuadrilla en camino (2 h)", cuando: "Hace 12 min", confianza: 94.2 },
        { id: 3, tipo: "Escombros", estado: "p", severidad: "Media", latitud: -12.0780, longitud: -77.0450, direccion: "Av. Salaverry, Jesús María", tiempoEstimado: "Maquinaria asignada (1 día)", cuando: "Hace 1 h", confianza: 88.5 },
        { id: 4, tipo: "Orgánicos", estado: "a", severidad: "Baja", latitud: -12.1200, longitud: -77.0310, direccion: "Parque Kennedy, Miraflores", tiempoEstimado: "Recogido", cuando: "Ayer", confianza: 91.3 },
        { id: 5, tipo: "Plásticos y PET", estado: "c", severidad: "Alta", latitud: -12.1010, longitud: -77.0120, direccion: "Av. Javier Prado Este", tiempoEstimado: "Pendiente de asignación", cuando: "Hace 25 min", confianza: 92.8 },
        { id: 6, tipo: "Orgánicos", estado: "p", severidad: "Media", latitud: -12.0870, longitud: -77.0520, direccion: "Av. Arequipa, Lince", tiempoEstimado: "Ruta programada (4 h)", cuando: "Hace 3 h", confianza: 86.9 },
        { id: 7, tipo: "Escombros", estado: "a", severidad: "Baja", latitud: -12.1400, longitud: -77.0230, direccion: "Av. Grau, Barranco", tiempoEstimado: "Recogido", cuando: "Hace 2 días", confianza: 89.4 },
        { id: 8, tipo: "Plásticos y PET", estado: "a", severidad: "Baja", latitud: -12.1050, longitud: -77.0600, direccion: "Malecón, Magdalena", tiempoEstimado: "Recogido", cuando: "Hace 3 días", confianza: 93.1 },
        { id: 9, tipo: "Foco infeccioso", estado: "p", severidad: "Alta", latitud: -12.0690, longitud: -77.0230, direccion: "Av. Wilson, Cercado de Lima", tiempoEstimado: "Inspección sanitaria (6 h)", cuando: "Hace 5 h", confianza: 90.0 }
    ];
    let siguienteId = 100;

    // Convierte una marca de tiempo en un texto relativo como "Hace 5 min" o "Hace 2 días".
    function tiempoTranscurrido(marcaTiempo) {
        const minutos = Math.round((Date.now() - marcaTiempo) / 60000);
        if (minutos < 1) return "Justo ahora";
        if (minutos < 60) return "Hace " + minutos + " min";
        if (minutos < 1440) return "Hace " + Math.round(minutos / 60) + " h";
        return "Hace " + Math.round(minutos / 1440) + " días";
    }

    try {
        JSON.parse(almacen.obtener("ga_reports") || "[]").forEach(function (reporte) {
            reporte.cuando = tiempoTranscurrido(reporte.marcaTiempo);
            reportes.push(reporte);
            siguienteId = Math.max(siguienteId, reporte.id + 1);
        });
    } catch (error) {}

    const urlMosaicos = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const atribucion = "&copy; OpenStreetMap contributors";

    // Crea un mapa de Leaflet en el contenedor indicado y le agrega la capa base de OpenStreetMap.
    function crearMapa(idContenedor, opciones) {
        const mapa = L.map(idContenedor, opciones);
        L.tileLayer(urlMosaicos, { maxZoom: 19, attribution: atribucion }).addTo(mapa);
        return mapa;
    }

    // Genera el ícono circular de un marcador, coloreado según el estado y resaltado si está seleccionado.
    function crearPin(estado, seleccionadoPin) {
        return L.divIcon({
            className: "",
            html: '<div class="pin' + (seleccionadoPin ? " sel" : "") + '" style="background:' + colores[estado] + '"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
    }

    const mapaPortada = crearMapa("heroMap", { center: centro, zoom: 13, zoomControl: false, scrollWheelZoom: false });
    reportes.forEach(function (reporte) {
        L.circle([reporte.latitud, reporte.longitud], { radius: reporte.estado === "c" ? 650 : 420, stroke: false, fillColor: colores[reporte.estado], fillOpacity: .16 }).addTo(mapaPortada);
        L.marker([reporte.latitud, reporte.longitud], { icon: crearPin(reporte.estado) }).addTo(mapaPortada);
    });

    const mapaGrande = crearMapa("bigMap", { center: centro, zoom: 12, scrollWheelZoom: false });
    const capaMarcadores = L.layerGroup().addTo(mapaGrande);
    let marcadores = {};
    let filtro = "all";
    let seleccionado = null;

    // Redibuja en el mapa principal los marcadores y zonas de los reportes que cumplen con el filtro activo.
    function dibujarMarcadores() {
        capaMarcadores.clearLayers();
        marcadores = {};
        reportes.filter(function (reporte) {
            return filtro === "all" || reporte.estado === filtro;
        }).forEach(function (reporte) {
            L.circle([reporte.latitud, reporte.longitud], { radius: reporte.estado === "c" ? 650 : 420, stroke: false, fillColor: colores[reporte.estado], fillOpacity: .14 }).addTo(capaMarcadores);
            const marcador = L.marker([reporte.latitud, reporte.longitud], { icon: crearPin(reporte.estado, seleccionado === reporte.id), title: reporte.tipo }).addTo(capaMarcadores);
            marcador.on("click", function () {
                seleccionarReporte(reporte.id);
            });
            marcadores[reporte.id] = marcador;
        });
    }

    // Marca un reporte como seleccionado, muestra su detalle en el panel lateral y centra el mapa en él.
    function seleccionarReporte(id) {
        seleccionado = id;
        const reporte = reportes.find(function (item) {
            return item.id === id;
        });

        const contenidoFoto = reporte.foto
            ? '<img src="' + reporte.foto + '" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" alt="Foto del reporte">'
            : iconos[reporte.tipo];

        obtener("#panel").innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><span class="tag ' + reporte.estado + '">' + estados[reporte.estado] + '</span><small style="color:var(--mut)">' + escaparHtml(reporte.cuando) + '</small></div>' +
            '<h3>' + escaparHtml(reporte.tipo) + ' en ' + escaparHtml(reporte.direccion.split(",")[0]) + '</h3><small style="color:var(--mut)">' + escaparHtml(reporte.direccion) + '</small>' +
            '<div class="ph" style="overflow:hidden;">' + contenidoFoto + '</div>' +
            '<div class="row"><span>Clasificación: </span><b>' + escaparHtml(reporte.tipo) + '</b></div><div class="row"><span>Nivel de severidad: </span><b>' + escaparHtml(reporte.severidad) + '</b></div><div class="row"><span>Tiempo estimado de recojo: </span><b>' + escaparHtml(reporte.tiempoEstimado) + '</b></div>' +
            '<div style="display:flex; flex-direction:column; gap:10px; margin-top: 4px;">' +
            '<button class="btn p" id="confirmBtn" style="justify-content:center">Confirmar y apoyar reporte</button>' +
            '<button class="btn" id="shareBtn" style="justify-content:center">Compartir con la cuadrilla municipal</button>' +
            '</div>';

        const botonConfirmar = obtener("#confirmBtn");
        botonConfirmar.onclick = function () {
            if (!obtenerSesion()) {
                abrirAutenticacion("login", "Inicia sesión para confirmar reportes.");
                return;
            }
            botonConfirmar.textContent = "✓ Reporte confirmado";
            botonConfirmar.disabled = true;
            mostrarNotificacion("Gracias por confirmar este reporte");
        };

        obtener("#shareBtn").onclick = function () {
            const textoCompartir = reporte.tipo + " en " + reporte.direccion + " — https://www.openstreetmap.org/?mlat=" + reporte.latitud + "&mlon=" + reporte.longitud + "#map=17/" + reporte.latitud + "/" + reporte.longitud;
            if (navigator.share) {
                navigator.share({ title: "GreenAlert", text: textoCompartir }).catch(function () {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(textoCompartir).then(function () {
                    mostrarNotificacion("Enlace copiado");
                }, function () {
                    mostrarNotificacion("No se pudo copiar");
                });
            } else {
                mostrarNotificacion("Copia este enlace: " + textoCompartir);
            }
        };

        mapaGrande.flyTo([reporte.latitud, reporte.longitud], Math.max(mapaGrande.getZoom(), 14), { duration: .6 });
        dibujarMarcadores();
    }

    obtener("#tabs").addEventListener("click", function (evento) {
        const boton = evento.target.closest("button");
        if (!boton) return;
        obtenerTodos("#tabs button").forEach(function (otroBoton) {
            otroBoton.classList.toggle("on", otroBoton === boton);
        });
        filtro = boton.dataset.f;
        dibujarMarcadores();
        const visibles = reportes.filter(function (reporte) {
            return filtro === "all" || reporte.estado === filtro;
        });
        if (visibles.length) {
            mapaGrande.fitBounds(visibles.map(function (reporte) {
                return [reporte.latitud, reporte.longitud];
            }), { padding: [50, 50], maxZoom: 14 });
        }
    });

    dibujarMarcadores();
    seleccionarReporte(1);

    const observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (entrada) {
            if (!entrada.isIntersecting) return;
            observador.unobserve(entrada.target);
            const elemento = entrada.target;
            const objetivo = +elemento.dataset.n;
            const prefijo = elemento.dataset.p || "";
            const sufijo = elemento.dataset.s || "";
            const inicio = performance.now();

            // Anima el contador numérico de 0 hasta el valor objetivo en 1.2 segundos con desaceleración.
            function animarContador(tiempo) {
                const progreso = Math.min((tiempo - inicio) / 1200, 1);
                const valor = Math.round(objetivo * (1 - Math.pow(1 - progreso, 3)));
                elemento.textContent = prefijo + (objetivo > 999 ? valor.toLocaleString("en-US") : valor) + sufijo;
                if (progreso < 1) requestAnimationFrame(animarContador);
            }
            animarContador(inicio);
        });
    }, { threshold: .4 });

    obtenerTodos(".num[data-n]").forEach(function (elemento) {
        observador.observe(elemento);
    });

    obtener("#burger").onclick = function () {
        obtener("#menu").classList.toggle("open");
    };
    obtenerTodos("#menu a").forEach(function (enlace) {
        enlace.onclick = function () {
            obtener("#menu").classList.remove("open");
        };
    });

    // Muestra el modal identificado por el selector recibido.
    function abrirModal(selector) {
        obtener(selector).classList.add("show");
    }

    // Cierra todos los modales abiertos.
    function cerrarTodo() {
        obtenerTodos(".ov").forEach(function (modal) {
            modal.classList.remove("show");
        });
    }

    obtenerTodos("[data-close]").forEach(function (boton) {
        boton.onclick = cerrarTodo;
    });
    obtenerTodos(".ov").forEach(function (modal) {
        modal.addEventListener("mousedown", function (evento) {
            if (evento.target === modal) cerrarTodo();
        });
    });
    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape") cerrarTodo();
    });

    let modo = "login";
    let accionPendiente = null;

    // Cambia el formulario de autenticación entre los modos "login" y "register" y actualiza sus textos.
    function establecerModo(nuevoModo) {
        modo = nuevoModo;
        const esRegistro = nuevoModo === "register";
        obtener("#nameWrap").hidden = !esRegistro;
        obtener("#authTitle").textContent = esRegistro ? "Crear cuenta" : "Iniciar sesión";
        obtener("#authGo").textContent = esRegistro ? "Crear cuenta" : "Entrar";
        obtener("#swTxt").textContent = esRegistro ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
        obtener("#swBtn").textContent = esRegistro ? "Inicia sesión" : "Regístrate";
        obtener("#authErr").textContent = "";
    }

    // Abre el modal de autenticación en el modo indicado, con un mensaje opcional, y enfoca el primer campo.
    function abrirAutenticacion(nuevoModo, mensaje) {
        establecerModo(nuevoModo || "login");
        if (mensaje) obtener("#authSub").textContent = mensaje;
        abrirModal("#authOv");
        setTimeout(function () {
            obtener(nuevoModo === "register" ? "#aName" : "#aMail").focus();
        }, 50);
    }

    // Actualiza el texto del botón de autenticación según haya o no una sesión activa.
    function actualizarAutenticacion() {
        const sesion = obtenerSesion();
        obtener("#authBtn").textContent = sesion ? sesion.nombre.split(" ")[0] + " ▾" : "Iniciar sesión";
        if (!sesion) mostrarMenuUsuario(false);
    }

    obtener("#swBtn").onclick = function () {
        establecerModo(modo === "login" ? "register" : "login");
    };
    const menuUsuario = obtener("#uMenu");

    // Muestra u oculta el menú desplegable del usuario y actualiza el atributo aria-expanded.
    function mostrarMenuUsuario(mostrar) {
        menuUsuario.hidden = !mostrar;
        obtener("#authBtn").setAttribute("aria-expanded", String(mostrar));
    }

    obtener("#authBtn").onclick = function (evento) {
        evento.stopPropagation();
        if (obtenerSesion()) {
            mostrarMenuUsuario(menuUsuario.hidden);
        } else {
            abrirAutenticacion("login", "Accede para reportar y seguir tus incidencias.");
        }
    };

    document.addEventListener("click", function () {
        mostrarMenuUsuario(false);
    });
    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape") mostrarMenuUsuario(false);
    });

    obtener("#miReport").onclick = function () {
        mostrarMenuUsuario(false);
        abrirReporte();
    };
    obtener("#miMine").onclick = function () {
        mostrarMenuUsuario(false);
        abrirMisReportes();
    };
    obtener("#miOut").onclick = function () {
        mostrarMenuUsuario(false);
        almacen.guardar("ga_session", "null");
        actualizarAutenticacion();
        mostrarNotificacion("Sesión cerrada");
    };
    obtener("#ctaMine").onclick = abrirMisReportes;

    // Muestra en un modal la lista de reportes creados por el usuario; si no hay sesión, pide iniciarla primero.
    function abrirMisReportes() {
        const sesion = obtenerSesion();
        if (!sesion) {
            accionPendiente = abrirMisReportes;
            abrirAutenticacion("login", "Inicia sesión para ver tus reportes.");
            return;
        }
        const misReportes = reportes.filter(function (reporte) {
            return reporte.propietario === sesion.correo;
        });
        const contenedor = obtener("#mineList");
        if (!misReportes.length) {
            contenedor.innerHTML = '<p class="sub" style="font-size:.9rem;margin:16px 0">Aún no tienes reportes. Marca tu primer punto y aparecerá aquí con su estado.</p><button class="btn p" id="mineNew">Generar reporte</button>';
            obtener("#mineNew").onclick = function () {
                cerrarTodo();
                abrirReporte();
            };
        } else {
            contenedor.innerHTML = misReportes.slice().reverse().map(function (reporte) {
                return '<button class="mi" data-id="' + reporte.id + '"><span class="tag ' + reporte.estado + '">' + estados[reporte.estado] + '</span><b>' + escaparHtml(reporte.tipo) + '</b><small>' + escaparHtml(reporte.direccion) + '</small><small>' + escaparHtml(tiempoTranscurrido(reporte.marcaTiempo)) + '</small></button>';
            }).join("");
            obtenerTodos(".mi", contenedor).forEach(function (boton) {
                boton.onclick = function () {
                    cerrarTodo();
                    filtro = "all";
                    obtenerTodos("#tabs button").forEach(function (otroBoton) {
                        otroBoton.classList.toggle("on", otroBoton.dataset.f === "all");
                    });
                    document.getElementById("mapa").scrollIntoView();
                    seleccionarReporte(+boton.dataset.id);
                };
            });
        }
        abrirModal("#mineOv");
    }

    obtener("#authGo").onclick = function () {
        const correo = obtener("#aMail").value.trim().toLowerCase();
        const clave = obtener("#aPass").value;
        const nombre = obtener("#aName").value.trim();
        const elementoError = obtener("#authErr");
        const usuarios = obtenerUsuarios();

        if (!/^\S+@\S+\.\S+$/.test(correo)) {
            elementoError.textContent = "Escribe un correo válido.";
            return;
        }
        if (clave.length < 6) {
            elementoError.textContent = "La contraseña debe tener al menos 6 caracteres.";
            return;
        }
        if (modo === "register") {
            if (!nombre) {
                elementoError.textContent = "Escribe tu nombre.";
                return;
            }
            if (usuarios[correo]) {
                elementoError.textContent = "Ese correo ya está registrado. Inicia sesión.";
                return;
            }
            usuarios[correo] = { nombre: nombre, clave: btoa(unescape(encodeURIComponent(clave))) };
            almacen.guardar("ga_users", JSON.stringify(usuarios));
        } else if (!usuarios[correo] || usuarios[correo].clave !== btoa(unescape(encodeURIComponent(clave)))) {
            elementoError.textContent = "Correo o contraseña incorrectos.";
            return;
        }
        almacen.guardar("ga_session", JSON.stringify({ correo: correo, nombre: usuarios[correo].nombre }));
        actualizarAutenticacion();
        cerrarTodo();
        mostrarNotificacion("Hola, " + usuarios[correo].nombre.split(" ")[0] + " 👋");
        if (accionPendiente) {
            const accion = accionPendiente;
            accionPendiente = null;
            accion();
        }
    };
    actualizarAutenticacion();

    let mapaSeleccion = null;
    let marcadorSeleccion = null;
    let puntoSeleccionado = null;

    // Abre el modal para crear un reporte e inicializa el mapa de selección de ubicación; exige sesión iniciada.
    function abrirReporte() {
        if (!obtenerSesion()) {
            accionPendiente = abrirReporte;
            abrirAutenticacion("login", "Inicia sesión para enviar un reporte.");
            return;
        }
        abrirModal("#repOv");
        obtener("#repErr").textContent = "";
        if (!mapaSeleccion) {
            mapaSeleccion = crearMapa("pickMap", { center: centro, zoom: 14 });
            mapaSeleccion.on("click", function (evento) {
                establecerPunto(evento.latlng.lat, evento.latlng.lng);
            });
        }
        setTimeout(function () {
            mapaSeleccion.invalidateSize();
        }, 120);
    }

    // Guarda las coordenadas elegidas, mueve (o crea) el marcador en el mapa y muestra la ubicación marcada.
    function establecerPunto(latitud, longitud) {
        puntoSeleccionado = { latitud: latitud, longitud: longitud };
        if (marcadorSeleccion) {
            marcadorSeleccion.setLatLng([latitud, longitud]);
        } else {
            marcadorSeleccion = L.marker([latitud, longitud]).addTo(mapaSeleccion);
        }
        obtener("#rHint").textContent = "Punto marcado: " + latitud.toFixed(5) + ", " + longitud.toFixed(5);
    }

    obtenerTodos("[data-report]").forEach(function (boton) {
        boton.onclick = abrirReporte;
    });

    obtener("#locBtn").onclick = function () {
        const botonUbicacion = obtener("#locBtn");
        if (!navigator.geolocation) {
            obtener("#repErr").textContent = "Tu navegador no permite geolocalización. Toca el mapa.";
            return;
        }
        botonUbicacion.textContent = "Buscando…";
        navigator.geolocation.getCurrentPosition(
            function (posicion) {
                botonUbicacion.textContent = "Usar mi ubicación";
                mapaSeleccion.setView([posicion.coords.latitude, posicion.coords.longitude], 17);
                establecerPunto(posicion.coords.latitude, posicion.coords.longitude);
            },
            function () {
                botonUbicacion.textContent = "Usar mi ubicación";
                obtener("#repErr").textContent = "No pudimos obtener tu ubicación. Toca el mapa para marcarla.";
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    // Crea el reporte con los datos del formulario, lo guarda en el almacenamiento, limpia el formulario y lo muestra en el mapa.
    function guardarYMostrarReporte(fotoUrl) {
        const tipo = obtener("#rType").value;
        const descripcion = obtener("#rDesc").value.trim();
        const nuevoReporte = {
            id: siguienteId++,
            tipo: tipo,
            estado: tipo === "Foco infeccioso" ? "c" : "p",
            severidad: tipo === "Foco infeccioso" ? "Alta" : "Media",
            latitud: puntoSeleccionado.latitud,
            longitud: puntoSeleccionado.longitud,
            direccion: descripcion || "Reporte ciudadano",
            tiempoEstimado: "Pendiente de asignación",
            cuando: "Justo ahora",
            confianza: +(88 + Math.random() * 7).toFixed(1),
            foto: fotoUrl || null
        };
        nuevoReporte.propietario = obtenerSesion().correo;
        nuevoReporte.marcaTiempo = Date.now();
        reportes.push(nuevoReporte);

        almacen.guardar("ga_reports", JSON.stringify(reportes.filter(function (reporte) {
            return reporte.propietario;
        })));

        filtro = "all";
        obtenerTodos("#tabs button").forEach(function (boton) {
            boton.classList.toggle("on", boton.dataset.f === "all");
        });
        cerrarTodo();

        obtener("#rDesc").value = "";
        obtener("#rPhoto").value = "";
        puntoSeleccionado = null;
        if (marcadorSeleccion) {
            mapaSeleccion.removeLayer(marcadorSeleccion);
            marcadorSeleccion = null;
        }

        dibujarMarcadores();
        seleccionarReporte(nuevoReporte.id);
        document.getElementById("mapa").scrollIntoView();
        mostrarNotificacion("Reporte enviado y clasificado como " + tipo);
    }

    obtener("#repGo").onclick = function () {
        if (!puntoSeleccionado) {
            obtener("#repErr").textContent = "Marca la ubicación en el mapa antes de enviar.";
            return;
        }

        const campoFoto = obtener("#rPhoto");
        if (campoFoto.files && campoFoto.files[0]) {
            const lector = new FileReader();
            lector.onload = function (evento) {
                guardarYMostrarReporte(evento.target.result);
            };
            lector.readAsDataURL(campoFoto.files[0]);
        } else {
            guardarYMostrarReporte(null);
        }
    };

})();
