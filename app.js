/*
  Mi Alarma · app del teléfono (PWA)

  Habla con el ESP32 por MQTT (un servidor de mensajes gratuito):
    seguridad/<código>/estado     ← el ESP32 publica cómo está (JSON, retenido)
    seguridad/<código>/historial  ← sus últimos 15 eventos (JSON, retenido)
    seguridad/<código>/conexion   ← "en_linea" / "desconectada" (retenido)
    seguridad/<código>/cmd        → la app manda: armar · desarmar · probar

  Sin código, la app funciona en «modo demostración»: simula la alarma
  completa para poder mostrarla sin tener las piezas.
*/
'use strict';

(function () {
  const VERSION = '0.1.0';
  // Servidor privado (EMQX Cloud): pide usuario (el código) y contraseña, y cada
  // alarma solo puede ver sus propios mensajes.
  const SERVIDOR_POR_DEFECTO = 'wss://d0f1e1f1.ala.us-east-1.emqxsl.com:8084/mqtt';
  const SERVIDOR_PUBLICO = 'wss://broker.hivemq.com:8884/mqtt'; // el de las primeras pruebas, sin contraseña
  // Clave pública VAPID para los avisos push. La privada está SOLO en el ESP32.
  const VAPID_PUBLICA = 'BNg-CiMbkg8YUMRybTuJ_go0YIAGGwKJCg62iQKR6rVweDR-i0zs0IAFPz1icFT5fhaHcoSZjuteW8mZ2cQ_CG0';
  const CLAVE_PREFS = 'mi-alarma:prefs';
  const DEMO = { armadoS: 10, sirenaS: 10, sensorS: 5 };
  const ESPERA_RESPUESTA_MS = 7000; // si la alarma no contesta un comando
  const ESPERA_ALARMA_MS = 6000;    // si el servidor no sabe nada de la alarma
  const VISTAS = ['inicio', 'historial', 'ajustes'];
  const ESTADOS = ['desarmada', 'armando', 'vigilando', 'alarma'];

  const $ = (s) => document.querySelector(s);

  /* ---------- Íconos: un solo juego (Lucide), trazo 2 y puntas redondas ---------- */

  const ESCUDO = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>';
  const BOCINA = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
  const I = {
    escudo: ESCUDO,
    escudoCheck: ESCUDO + '<path d="m9 12 2 2 4-4"/>',
    escudoAlerta: ESCUDO + '<path d="M12 8v4"/><path d="M12 16h.01"/>',
    persona: '<circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
    volumen: BOCINA + '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    volumenX: BOCINA + '<path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    campana: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    enviar: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    casa: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    historial: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    letra: '<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>',
    reiniciar: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    derecha: '<path d="m9 18 6-6-6-6"/>',
    adelante: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    descargar: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    diagonal: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  };

  function icono(nombre, clase) {
    return `<svg class="ic${clase ? ' ' + clase : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${I[nombre] || I.info}</svg>`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Preferencias: viven solo en este teléfono ---------- */

  function leerPrefs() {
    try { return JSON.parse(localStorage.getItem(CLAVE_PREFS)) || {}; } catch (e) { return {}; }
  }

  const prefs = Object.assign(
    { nombre: 'Casa', modo: 'demo', codigo: '', clave: '', servidor: SERVIDOR_POR_DEFECTO, avisos: false, letraGrande: false },
    leerPrefs()
  );
  // Quien venía usando el servidor público pasa al privado (ahí está ahora su alarma)
  if (prefs.servidor === SERVIDOR_PUBLICO) prefs.servidor = SERVIDOR_POR_DEFECTO;
  const pideClave = () => prefs.servidor !== SERVIDOR_PUBLICO;

  function guardarPrefs() {
    try { localStorage.setItem(CLAVE_PREFS, JSON.stringify(prefs)); } catch (e) { /* sin almacenamiento: la app sigue funcionando */ }
  }

  /* ---------- Estado de la app ---------- */

  // conexion: demo · conectando · esperando · en_linea · alarma_fuera · sin_servidor
  const st = { vista: 'inicio', conexion: 'demo', alarma: null, historial: [], pendiente: null };

  const EVENTOS = {
    movimiento: { titulo: 'Movimiento detectado', icono: 'persona', tono: 'peligro' },
    armada: { titulo: 'Empezó a vigilar', icono: 'escudoCheck', tono: 'ok' },
    desarmada: { titulo: 'Alarma desarmada', icono: 'escudo', tono: '' },
    encendida: { titulo: 'La alarma se encendió', icono: 'power', tono: '' },
    prueba: { titulo: 'Prueba de sirena', icono: 'volumen', tono: '' },
  };

  /* ---------- Fechas y horas ---------- */

  const fmtHora = new Intl.DateTimeFormat('es-HN', { hour: 'numeric', minute: '2-digit' });
  const fmtDia = new Intl.DateTimeFormat('es-HN', { weekday: 'long', day: 'numeric', month: 'long' });

  function inicioDelDia(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function etiquetaDia(ms) {
    const hoy = inicioDelDia(Date.now());
    const dia = inicioDelDia(ms);
    if (dia === hoy) return 'Hoy';
    if (dia === inicioDelDia(hoy - 1)) return 'Ayer';
    const s = fmtDia.format(ms);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function cuando(seg) {
    if (!seg) return 'Hora desconocida';
    const ms = seg * 1000;
    return `${etiquetaDia(ms)}, ${fmtHora.format(ms)}`;
  }

  function senal(rssi) {
    if (typeof rssi !== 'number') return '—';
    const txt = rssi >= -60 ? 'Buena' : rssi >= -72 ? 'Regular' : 'Débil';
    return `${txt} (${rssi} dBm)`;
  }

  function segundosRestantes(a) {
    if (!a || !a.armandoHasta) return 0;
    return Math.max(0, Math.ceil((a.armandoHasta - Date.now()) / 1000));
  }

  /* ---------- Sonido (solo en la demostración: el de verdad lo hace la alarma) ---------- */

  const sonido = (function () {
    let ctx = null;
    let osc = null;
    let cambio = null;
    let fin = null;

    function asegurar() {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { return null; }
      return ctx;
    }

    function detener() {
      clearInterval(cambio);
      clearTimeout(fin);
      if (osc) {
        try { osc.stop(); } catch (e) { /* ya estaba parado */ }
        osc.disconnect();
        osc = null;
      }
    }

    function tocar(segundos, dosTonos) {
      const c = asegurar();
      if (!c) return;
      detener();
      const volumen = c.createGain();
      volumen.gain.value = 0.05;
      volumen.connect(c.destination);
      osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = dosTonos ? 1800 : 2000;
      osc.connect(volumen);
      osc.start();
      if (dosTonos) {
        let alto = true;
        cambio = setInterval(() => {
          alto = !alto;
          if (osc) osc.frequency.value = alto ? 1800 : 1200;
        }, 400);
      }
      fin = setTimeout(detener, segundos * 1000);
    }

    return { asegurar, tocar, detener };
  })();

  /* ---------- Modo demostración: la misma lógica del ESP32, simulada ---------- */

  const demo = {
    estado: 'desarmada',
    armandoHasta: 0,
    sensorHasta: 0,
    alarmaDesde: 0,
    ultimo: 0,
    historial: [],

    reiniciar() {
      const ahora = Math.floor(Date.now() / 1000);
      const m = 60;
      const h = 3600;
      this.estado = 'desarmada';
      this.armandoHasta = 0;
      this.sensorHasta = 0;
      this.alarmaDesde = 0;
      this.ultimo = ahora - (3 * h + 14 * m);
      this.historial = [
        { t: ahora - (3 * h + 12 * m), e: 'desarmada' },
        { t: ahora - (3 * h + 14 * m), e: 'movimiento' },
        { t: ahora - (5 * h + 41 * m), e: 'armada' },
        { t: ahora - (20 * h + 7 * m), e: 'desarmada' },
        { t: ahora - (29 * h + 3 * m), e: 'armada' },
        { t: ahora - (30 * h + 26 * m), e: 'encendida' },
      ];
    },

    evento(e) {
      this.historial.unshift({ t: Math.floor(Date.now() / 1000), e });
      if (this.historial.length > 15) this.historial.length = 15;
    },

    sirenaSonando() {
      return this.estado === 'alarma' && Date.now() - this.alarmaDesde < DEMO.sirenaS * 1000;
    },

    foto() {
      return {
        estado: this.estado,
        sensor: Date.now() < this.sensorHasta ? 1 : 0,
        armandoHasta: this.estado === 'armando' ? this.armandoHasta : 0,
        rssi: -58,
        telegram: 1,
        sirena: this.sirenaSonando() ? 1 : 0,
        ultimo: this.ultimo,
      };
    },

    publicar() {
      st.historial = this.historial.slice();
      aplicarEstado(this.foto());
    },

    comando(cmd) {
      if (cmd === 'armar' && this.estado === 'desarmada') {
        this.estado = 'armando';
        this.armandoHasta = Date.now() + DEMO.armadoS * 1000;
      } else if (cmd === 'desarmar' && this.estado !== 'desarmada') {
        this.estado = 'desarmada';
        this.armandoHasta = 0;
        sonido.detener();
        this.evento('desarmada');
      } else if (cmd === 'probar' && this.estado === 'desarmada') {
        this.evento('prueba');
        sonido.tocar(1, false);
      }
      this.publicar();
    },

    mover() {
      const ahora = Date.now();
      this.sensorHasta = ahora + DEMO.sensorS * 1000;
      if (this.estado === 'vigilando' || (this.estado === 'alarma' && !this.sirenaSonando())) {
        this.estado = 'alarma';
        this.alarmaDesde = ahora;
        this.ultimo = Math.floor(ahora / 1000);
        this.evento('movimiento');
        sonido.tocar(DEMO.sirenaS, true);
      } else if (this.estado === 'armando') {
        nota('El sensor vio a alguien, pero la alarma todavía se está armando.');
      } else if (this.estado === 'desarmada') {
        nota('El sensor vio a alguien, pero la alarma está desarmada: no sonó.');
      }
      this.publicar();
    },

    tick() {
      let cambio = false;
      if (this.estado === 'armando' && Date.now() >= this.armandoHasta) {
        this.estado = 'vigilando';
        this.armandoHasta = 0;
        this.evento('armada');
        cambio = true;
      }
      const f = this.foto();
      if (st.alarma && (st.alarma.sensor !== f.sensor || st.alarma.sirena !== f.sirena)) cambio = true;
      if (cambio) this.publicar();
    },
  };

  /* ---------- Conexión real con el ESP32 (MQTT) ---------- */
  /*
    conexion: demo · conectando · reconectando · esperando · en_linea · alarma_fuera · sin_servidor

    Al salir de la app el teléfono corta la conexión para ahorrar batería.
    Al volver:
      - se reconecta de inmediato (no se espera a descubrir que se cortó),
      - se sigue mostrando el último estado conocido, con «Actualizando…»,
      - los botones funcionan: la orden espera y sale apenas hay conexión,
      - «Sin internet» solo aparece si de verdad no se pudo en GRACIA_MS.
  */
  const GRACIA_MS = 10000;
  const CLAVE_ULTIMO = 'mi-alarma:ultimo';

  let cliente = null;
  let esperaAlarma = null;
  let gracia = null;
  let ordenEnEspera = null;
  const base = () => `seguridad/${prefs.codigo}/`;

  // Lo último que se supo de la alarma, para mostrarlo al instante al abrir la app
  function guardarUltimo() {
    if (prefs.modo !== 'real' || !st.alarma) return;
    try {
      localStorage.setItem(CLAVE_ULTIMO, JSON.stringify({ codigo: prefs.codigo, alarma: st.alarma, historial: st.historial }));
    } catch (e) { /* sin almacenamiento: solo se pierde el arranque rápido */ }
  }

  function leerUltimo() {
    try {
      const u = JSON.parse(localStorage.getItem(CLAVE_ULTIMO));
      if (u && u.codigo === prefs.codigo && u.alarma && ESTADOS.includes(u.alarma.estado)) return u;
    } catch (e) { /* nada guardado */ }
    return null;
  }

  function cancelarPendiente() {
    if (st.pendiente) {
      clearTimeout(st.pendiente.timer);
      st.pendiente = null;
    }
    ordenEnEspera = null;
  }

  let generacion = 0;   // cada conectar() nuevo deja sin efecto a los anteriores
  let intentos = [];
  let refuerzo = null;

  function desconectar() {
    generacion++;
    clearTimeout(esperaAlarma);
    clearTimeout(gracia);
    clearTimeout(refuerzo);
    intentos.forEach((c) => { try { c.end(true); } catch (e) { /* ya estaba cerrado */ } });
    intentos = [];
    cliente = null;
  }

  // Se cortó la conexión: se reintenta en silencio y solo después de GRACIA_MS se avisa
  function empezarGracia(este) {
    if (st.conexion !== 'reconectando' && st.conexion !== 'conectando') {
      st.conexion = 'reconectando';
      render();
    }
    clearTimeout(gracia);
    gracia = setTimeout(() => {
      if (este === cliente && !este.connected) {
        st.conexion = 'sin_servidor';
        render();
      }
    }, GRACIA_MS);
  }

  // reanudar: volver a conectar sin borrar lo que se ve ni la orden que espera
  function conectar(opciones = {}) {
    const reanudar = !!opciones.reanudar;
    desconectar();
    if (!reanudar) cancelarPendiente();

    if (prefs.modo !== 'real' || !prefs.codigo) {
      prefs.modo = 'demo';
      st.conexion = 'demo';
      demo.publicar();
      return;
    }

    sonido.detener();

    if (!reanudar) {
      const ultimo = leerUltimo();
      st.alarma = ultimo ? ultimo.alarma : null;
      st.historial = ultimo ? ultimo.historial : [];
    }

    if (!window.mqtt) {
      st.conexion = 'sin_servidor';
      render();
      return;
    }

    if (pideClave() && !prefs.clave) {
      st.conexion = 'sin_permiso';
      render();
      return;
    }

    st.conexion = st.alarma ? 'reconectando' : 'conectando';
    render();

    const gen = generacion;
    const b = base();
    let ganador = null;

    // Abre un intento de conexión. Si hay dos a la vez, gana el primero que conecte.
    const intentar = () => {
      let c;
      try {
        c = window.mqtt.connect(prefs.servidor, {
          clientId: 'app-' + Math.random().toString(16).slice(2, 10),
          username: pideClave() ? prefs.codigo : undefined,
          password: pideClave() ? prefs.clave : undefined,
          clean: true,
          keepalive: 20,
          // El servidor gratuito a veces no contesta un intento: mejor rendirse
          // rápido y reintentar (el siguiente casi siempre entra en ~1 s)
          reconnectPeriod: 500,
          connectTimeout: 3000,
        });
      } catch (e) {
        return null;
      }
      intentos.push(c);

      c.on('connect', () => {
        if (gen !== generacion) return;
        if (ganador && ganador !== c) {
          try { c.end(true); } catch (e) { /* nada */ }
          return;
        }
        if (!ganador) {
          ganador = c;
          cliente = c;
          clearTimeout(refuerzo);
          intentos.filter((o) => o !== c).forEach((o) => { try { o.end(true); } catch (e) { /* nada */ } });
          intentos = [c];
        }
        clearTimeout(gracia);
        c.subscribe([b + 'conexion', b + 'estado', b + 'historial', b + 'vapid'], { qos: 1 });
        registrarTelefono(c); // se repite en cada conexión: si la alarma lo olvidó, lo vuelve a anotar
        if (ordenEnEspera) {
          c.publish(b + 'cmd', ordenEnEspera, { qos: 1, retain: false });
          ordenEnEspera = null;
        }
        if (st.conexion !== 'en_linea') {
          st.conexion = 'esperando';
          render();
        }
        clearTimeout(esperaAlarma);
        esperaAlarma = setTimeout(() => {
          if (gen === generacion && st.conexion === 'esperando') {
            st.conexion = 'alarma_fuera';
            render();
          }
        }, ESPERA_ALARMA_MS);
      });

      c.on('message', (tema, datos) => {
        if (gen !== generacion || c !== cliente || !tema.startsWith(b)) return;
        recibir(tema.slice(b.length), datos.toString());
      });

      c.on('error', (err) => {
        // 4 = usuario o contraseña incorrectos · 5 = no autorizado (también en MQTT 5: 134/135)
        if (gen !== generacion || !err || ![4, 5, 134, 135].includes(err.code)) return;
        desconectar();
        st.conexion = 'sin_permiso';
        render();
      });

      c.on('offline', () => {
        if (gen === generacion && ganador === c) empezarGracia(c);
      });

      c.on('close', () => {
        if (gen !== generacion || ganador !== c) return;
        if (st.conexion === 'en_linea' || st.conexion === 'esperando') empezarGracia(c);
      });

      return c;
    };

    const primero = intentar();
    if (!primero) {
      st.conexion = 'sin_servidor';
      render();
      return;
    }
    cliente = primero; // mientras tanto, las órdenes quedan esperando en este
    empezarGracia(primero);

    // Si en 1.2 s no conectó, se abre un segundo intento en paralelo
    refuerzo = setTimeout(() => {
      if (gen === generacion && !ganador) intentar();
    }, 1200);
  }

  function recibir(tema, texto) {
    if (tema === 'vapid') {
      // Cada alarma puede tener sus propias claves de avisos: si cambió, se vuelve a suscribir
      if (/^[A-Za-z0-9_-]{80,}$/.test(texto)) {
        st.vapid = texto;
        if (prefs.avisos && prefs.vapidUsada && prefs.vapidUsada !== texto) {
          suscribirAvisos().catch(() => { /* se reintenta al abrir la app */ });
        }
      }
      return;
    }
    if (tema === 'conexion') {
      st.conexion = texto === 'en_linea' ? 'en_linea' : 'alarma_fuera';
      render();
    } else if (tema === 'estado') {
      let d;
      try { d = JSON.parse(texto); } catch (e) { return; }
      aplicarEstado({
        estado: d.estado,
        sensor: d.sensor ? 1 : 0,
        armandoHasta: d.estado === 'armando' && d.restante ? Date.now() + d.restante * 1000 : 0,
        rssi: typeof d.rssi === 'number' ? d.rssi : null,
        telegram: d.telegram ? 1 : 0,
        sirena: d.sirena ? 1 : 0,
        ultimo: d.ultimo || 0,
        avisos: d.avisos || 0,
        ultimoAviso: d.ultimoAviso || 0,
        motivo: typeof d.motivo === 'string' ? d.motivo : '',
        fw: typeof d.fw === 'string' ? d.fw : '',
        ota: typeof d.ota === 'string' ? d.ota : '',
        sens: ['alta', 'normal', 'baja'].includes(d.sens) ? d.sens : '',
        radar: d.radar ? 1 : 0,
        doble: d.doble === undefined ? null : (d.doble ? 1 : 0),
        pirN: typeof d.pirN === 'number' ? d.pirN : null,
        pirUlt: typeof d.pirHace === 'number' ? (d.pirHace >= 0 ? Date.now() - d.pirHace * 1000 : 0) : null,
        radarUlt: typeof d.radarHace === 'number' ? (d.radarHace >= 0 ? Date.now() - d.radarHace * 1000 : 0) : null,
        encendida: typeof d.seg === 'number' ? Date.now() - d.seg * 1000 : null,
        radarN: typeof d.radarN === 'number' ? d.radarN : null,
        calentando: d.calentando ? 1 : 0,
      });
    } else if (tema === 'historial') {
      try {
        const h = JSON.parse(texto);
        if (Array.isArray(h)) {
          st.historial = h.filter((ev) => ev && typeof ev.e === 'string');
          guardarUltimo();
          render();
        }
      } catch (e) { /* mensaje dañado: se ignora */ }
    }
  }

  const RESPUESTA_ESPERADA = {
    armar: (e) => e === 'armando' || e === 'vigilando',
    desarmar: (e) => e === 'desarmada',
    probar: () => true,
    'aviso-prueba': () => true,
    actualizar: () => true,
  };

  const EN_CAMINO = ['conectando', 'reconectando', 'esperando'];
  const SIN_ALARMA = ['alarma_fuera', 'sin_servidor', 'sin_permiso'];

  function enviar(cmd) {
    if (prefs.modo !== 'real') {
      demo.comando(cmd);
      return;
    }
    if (st.pendiente) return;

    const conectado = !!(cliente && cliente.connected);
    if (!cliente || (!conectado && !EN_CAMINO.includes(st.conexion)) || st.conexion === 'alarma_fuera') {
      nota('La alarma no está conectada. Revisa que esté enchufada y con WiFi.', 'error');
      return;
    }

    // Conectado: sale ya. Reconectando: espera y sale apenas haya conexión.
    if (conectado) cliente.publish(base() + 'cmd', cmd, { qos: 1, retain: false });
    else ordenEnEspera = cmd;

    st.pendiente = {
      cmd,
      timer: setTimeout(() => {
        const nuncaSalio = ordenEnEspera !== null;
        st.pendiente = null;
        ordenEnEspera = null; // una orden vieja nunca debe llegar tarde a la alarma
        nota(nuncaSalio
          ? 'No se pudo conectar con la alarma. Revisa tu internet e inténtalo otra vez.'
          : 'La alarma no respondió. Revisa que esté encendida y con WiFi.', 'error');
        render();
      }, ESPERA_RESPUESTA_MS + (conectado ? 0 : GRACIA_MS)),
    };
    render();
  }

  function aplicarEstado(nuevo) {
    if (!ESTADOS.includes(nuevo.estado)) return;
    const antes = st.alarma;
    st.alarma = nuevo;

    if (st.pendiente && (RESPUESTA_ESPERADA[st.pendiente.cmd] || (() => true))(nuevo.estado)) {
      clearTimeout(st.pendiente.timer);
      st.pendiente = null;
    }

    const entro = nuevo.estado === 'alarma' && (!antes || antes.estado !== 'alarma');
    const otraVez = antes && antes.estado === 'alarma' && nuevo.estado === 'alarma' &&
      nuevo.ultimo && nuevo.ultimo !== antes.ultimo;
    if (entro || otraVez) avisarAlarma(nuevo);

    render();
    guardarUltimo();
    if (entro || otraVez) golpeAlarma();
  }

  /* ---------- Avisos ---------- */

  let notaTimer = null;

  function nota(texto, tipo) {
    const el = $('#nota');
    el.textContent = texto;
    el.className = 'nota' + (tipo === 'error' ? ' nota--error' : '');
    el.dataset.visible = '';
    clearTimeout(notaTimer);
    notaTimer = setTimeout(() => { delete el.dataset.visible; }, tipo === 'error' ? 6000 : 3500);
  }

  function avisarAlarma(a) {
    const hora = a.ultimo ? fmtHora.format(a.ultimo * 1000) : '';
    try { if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 900]); } catch (e) { /* sin vibración */ }

    if (st.vista !== 'inicio') nota(`¡Movimiento detectado${hora ? ' · ' + hora : ''}! Ve a Inicio para apagar la alarma.`, 'error');

    if (prefs.avisos && document.visibilityState !== 'visible' && 'Notification' in window &&
        Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((r) => r.showNotification('¡Movimiento detectado!', {
          body: `${prefs.nombre}${hora ? ' · ' + hora : ''}. Abre la app para apagar la alarma.`,
          tag: 'alarma',
          renotify: true,
          icon: 'iconos/icon-192.png',
          badge: 'iconos/insignia-96.png',
        }))
        .catch(() => {});
    }
  }

  /* ---------- Avisos push: llegan aunque la app esté cerrada ----------
     El teléfono le pide a Apple o Google una «dirección de aviso» y la app se la
     anota a la alarma por MQTT (push/alta). Cuando hay alarma, el ESP32 manda el
     aviso firmado con su clave VAPID directo a esa dirección. Sin servidor propio. */

  function claveABytes(b64url) {
    const relleno = '='.repeat((4 - (b64url.length % 4)) % 4);
    const binario = atob((b64url + relleno).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binario, (c) => c.charCodeAt(0));
  }

  async function suscribirAvisos() {
    const clave = st.vapid || VAPID_PUBLICA;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && prefs.vapidUsada && prefs.vapidUsada !== clave) {
      // Suscrito con la clave de otra alarma: hay que darse de baja y volver a suscribirse
      if (cliente && cliente.connected) cliente.publish(base() + 'push/baja', sub.endpoint, { qos: 1 });
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) });
    }
    prefs.vapidUsada = clave;
    prefs.pushDireccion = sub.endpoint;
    guardarPrefs();
    registrarTelefono(cliente);
  }

  async function desactivarAvisos() {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          if (prefs.modo === 'real' && cliente && cliente.connected) {
            cliente.publish(base() + 'push/baja', sub.endpoint, { qos: 1 });
          }
          await sub.unsubscribe();
        }
      }
    } catch (e) { /* ya no estaba suscrito */ }
    prefs.pushDireccion = '';
  }

  // Se llama en cada conexión: si la alarma se reinició o lo olvidó, lo vuelve a anotar
  function registrarTelefono(c) {
    if (prefs.modo !== 'real' || !prefs.avisos || !prefs.pushDireccion || !c || !c.connected) return;
    c.publish(base() + 'push/alta', prefs.pushDireccion, { qos: 1 });
  }

  // El aviso llega sin contenido, igual que uno de verdad. Esta marca le dice al
  // service worker que es de prueba, para que no muestre «¡Alerta!».
  function marcarPrueba() {
    if (!('caches' in window)) return Promise.resolve();
    return caches.open('mi-alarma-datos')
      .then((c) => c.put('prueba-aviso', new Response(String(Date.now()))))
      .catch(() => {});
  }

  function textoActualizacion(a) {
    const ota = (a && a.ota) || '';
    if (ota === 'buscando') return 'Buscando una versión nueva…';
    if (ota === 'al_dia') return 'Está al día.';
    if (ota.startsWith('descargando')) {
      const pct = ota.split(':')[1];
      return `Descargando${pct ? ' ' + pct + ' %' : '…'} No la desconectes.`;
    }
    if (ota === 'listo') return 'Instalada. Se está reiniciando…';
    if (ota === 'armada') return 'Desármala para poder actualizarla.';
    if (ota === 'error') return 'No se pudo actualizar. Inténtalo más tarde.';
    return '';
  }

  function textoUltimoAviso(a) {
    if (!a || !a.ultimoAviso) return '';
    if (a.ultimoAviso === 201) return 'El último aviso se entregó bien.';
    if (a.ultimoAviso === -1) return 'El último aviso no salió: la alarma todavía no sabía la hora.';
    return `El último aviso no se entregó (código ${a.ultimoAviso}${a.motivo ? ' · ' + esc(a.motivo) : ''}).`;
  }

  const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------- Pantallas ---------- */

  // El botón fuerte lleva el texto a la izquierda y un círculo con el ícono a la derecha
  function boton({ cmd, accion, texto, tipo, ic, deshabilitado }) {
    const attr = cmd ? `data-cmd="${cmd}"` : `data-accion="${accion}"`;
    const fuerte = tipo === 'fuerte' || tipo === 'peligro';
    const interior = fuerte
      ? `<span>${texto}</span><span class="boton-circulo">${icono(ic || 'adelante', 'ic--20')}</span>`
      : `${ic ? icono(ic, 'ic--20') : ''}<span>${texto}</span>`;
    return `<button type="button" class="boton boton--${tipo}" ${attr}${deshabilitado ? ' disabled' : ''}>${interior}</button>`;
  }

  function titular(titulo, sub) {
    return `<section class="titular">
      <h1 class="titular-texto">${esc(titulo)}</h1>
      ${sub ? `<p class="titular-sub">${sub}</p>` : ''}
    </section>`;
  }

  function aviso(ic, titulo, texto, conEnlace) {
    return `<section class="aviso">
      <span class="aviso-icono">${icono(ic, 'ic--20')}</span>
      <div class="aviso-cuerpo">
        <h2 class="aviso-titulo">${titulo}</h2>
        <p class="aviso-texto">${texto}</p>
        ${conEnlace ? '<button type="button" class="enlace" data-accion="conectar">Revisar la conexión</button>' : ''}
      </div>
    </section>`;
  }

  function avisoConexion() {
    // Si ya se sabe algo de la alarma, reconectar no merece un aviso: basta «Actualizando…» arriba
    if (EN_CAMINO.includes(st.conexion) && st.alarma) return '';
    switch (st.conexion) {
      case 'conectando':
      case 'reconectando':
        return aviso('wifi', 'Conectando…', `Buscando el servidor para hablar con <strong>${esc(prefs.codigo)}</strong>.`);
      case 'esperando':
        return aviso('wifi', 'Buscando tu alarma…', `Código <strong>${esc(prefs.codigo)}</strong>.`);
      case 'sin_permiso':
        return prefs.clave
          ? aviso('wifiOff', 'La contraseña no es correcta', 'El servidor no aceptó el código y la contraseña. Revísalos: distinguen mayúsculas y minúsculas.', true)
          : aviso('wifiOff', 'Falta la contraseña', 'Escribe la contraseña de tu alarma para conectarte.', true);
      case 'sin_servidor':
        return aviso('wifiOff', 'Sin internet', 'Este teléfono no llega al servidor. Revisa tus datos o tu WiFi: la app se vuelve a conectar sola.');
      case 'alarma_fuera':
        return aviso('wifiOff', 'Tu alarma no está conectada',
          `Revisa que esté enchufada y que su WiFi funcione. ¿Cambiaste de WiFi o de casa? Conecta tu celular a la red que empieza con <strong>«MiAlarma»</strong> (la contraseña es tu código: <strong>${esc(prefs.codigo)}</strong>) y elige tu WiFi nuevo.`, true);
      default:
        return '';
    }
  }

  // La tarjeta negra protagonista: estado, radar y accesos rápidos
  function heroe(a) {
    const real = prefs.modo === 'real';
    const viejo = real && SIN_ALARMA.includes(st.conexion);
    let clase = 'heroe--' + a.estado;
    let centro = icono('escudo');
    let titulo = '';
    let texto = '';

    switch (a.estado) {
      case 'desarmada':
        titulo = 'Desarmada';
        texto = !viejo && a.calentando
          ? 'Recién encendida: el sensor tarda un minuto en estar listo. Puedes armarla igual.'
          : 'No está vigilando. Ármala antes de salir.';
        break;
      case 'armando':
        titulo = 'Armándose';
        if (viejo) {
          texto = 'Se estaba armando cuando se perdió la conexión.';
        } else {
          texto = a.calentando
            ? 'El sensor se está preparando: tarda un minuto después de enchufarla. Empieza a vigilar solo.'
            : 'Sal de la zona del sensor antes de que empiece a vigilar.';
          centro = `<span class="cuenta"><span data-cuenta>${segundosRestantes(a)}</span><small>s</small></span>`;
        }
        break;
      case 'vigilando':
        centro = icono('escudoCheck');
        titulo = 'Vigilando';
        texto = 'Te avisa si alguien pasa frente al sensor.';
        break;
      case 'alarma':
        centro = icono('escudoAlerta');
        titulo = '¡Movimiento detectado!';
        texto = a.sirena ? 'La sirena está sonando.' : 'La sirena ya se apagó, pero sigue en alarma.';
        break;
    }
    if (viejo) {
      clase = 'heroe--desarmada';
      texto += ' Es el último estado conocido.';
    }

    // En vez de lo que ve el sensor: desde cuándo está así la alarma
    const desde = desdeCuando(a);
    const pastilla = desde
      ? `<span class="pastilla-vidrio">${icono('reloj')}<span class="pastilla-texto">${desde}</span></span>`
      : '<span></span>';

    // Accesos rápidos; durante la alarma no se muestran, para que «Apagar alarma» quede a la vista
    const accionesRapidas = [];
    if (a.estado === 'desarmada' && !st.pendiente) {
      accionesRapidas.push(`<button type="button" class="accion" data-cmd="probar"${viejo ? ' disabled' : ''}>
        <span class="accion-circulo">${icono('volumen')}</span><span>Probar sirena</span></button>`);
    }
    if (!real && a.estado !== 'alarma') {
      accionesRapidas.push(`<button type="button" class="accion" data-accion="simular">
        <span class="accion-circulo">${icono('persona')}</span><span>Simular persona</span></button>`);
    }

    return `<section class="heroe ${clase}">
      <div class="heroe-arriba">
        ${pastilla}
        <a class="circulo circulo--blanco" href="#historial" aria-label="Ver el historial">${icono('diagonal', 'ic--20')}</a>
      </div>
      <div class="radar" aria-hidden="true">
        <span class="radar-anillo"></span><span class="radar-anillo"></span><span class="radar-anillo"></span>
        <span class="radar-centro">${centro}</span>
      </div>
      <div class="heroe-texto">
        <h2 class="heroe-titulo">${titulo}</h2>
        <p class="heroe-sub">${texto}</p>
      </div>
      ${accionesRapidas.length ? `<div class="heroe-acciones">${accionesRapidas.join('')}</div>` : ''}
    </section>`;
  }

  // Un solo botón fuerte: armar, desarmar o apagar
  function acciones(a) {
    const real = prefs.modo === 'real';
    // Mientras reconecta los botones siguen activos: la orden espera y sale apenas conecta
    const apagada = real && SIN_ALARMA.includes(st.conexion);
    const ocupado = !!st.pendiente;
    const deshabilitado = apagada || ocupado || !a;
    let principal;

    if (ocupado) {
      principal = boton({ cmd: st.pendiente.cmd, texto: 'Enviando a la alarma…', tipo: 'fuerte', ic: 'reloj', deshabilitado: true });
    } else if (!a || a.estado === 'desarmada') {
      principal = boton({ cmd: 'armar', texto: 'Armar alarma', tipo: 'fuerte', ic: 'adelante', deshabilitado });
    } else if (a.estado === 'alarma') {
      principal = boton({ cmd: 'desarmar', texto: 'Apagar alarma', tipo: 'peligro', ic: 'volumenX', deshabilitado });
    } else {
      principal = boton({ cmd: 'desarmar', texto: 'Desarmar alarma', tipo: 'fuerte', ic: 'x', deshabilitado });
    }

    const ayuda = apagada ? '<p class="ayuda">Los botones se activan cuando la alarma esté conectada.</p>' : '';
    return `<div class="acciones">${principal}${ayuda}</div>`;
  }

  function ficha(ic, etiqueta, valor, tono) {
    return `<div class="ficha">
      <span class="ficha-icono${tono ? ' ficha-icono--' + tono : ''}">${icono(ic)}</span>
      <span class="ficha-etiqueta">${etiqueta}</span>
      <span class="ficha-valor">${valor}</span>
    </div>`;
  }

  // «Desde las 10:32 p. m.»: el último evento que llevó a la alarma al estado actual
  function desdeCuando(a) {
    let seg = 0;
    if (a.estado === 'alarma') {
      seg = a.ultimo;
    } else if (a.estado === 'vigilando' || a.estado === 'desarmada') {
      const buscado = a.estado === 'vigilando' ? ['armada'] : ['desarmada', 'encendida'];
      const ev = st.historial.find((e) => buscado.includes(e.e) && e.t);
      seg = ev ? ev.t : 0;
    }
    if (!seg) return '';
    const ms = seg * 1000;
    const hora = fmtHora.format(ms);
    const articulo = hora.startsWith('1:') ? 'la' : 'las';
    const dia = etiquetaDia(ms);
    if (dia === 'Hoy') return `Desde ${articulo} ${hora}`;
    return `Desde ${dia === 'Ayer' ? 'ayer' : dia.toLowerCase()}, ${hora}`;
  }

  function fichaAvisos(a) {
    if (prefs.modo !== 'real') return 'Demostración';
    if (!a.avisos) return 'Desactivados';
    return `${a.avisos} ${a.avisos === 1 ? 'teléfono' : 'teléfonos'}`;
  }

  function detalles(a) {
    return `<section class="grupo">
      <h2 class="rotulo-seccion">Detalles</h2>
      <div class="mosaico">
        ${ficha('reloj', 'Última detección', a.ultimo ? cuando(a.ultimo) : 'Ninguna')}
        ${ficha('campana', 'Avisos', fichaAvisos(a))}
        ${ficha(typeof a.rssi === 'number' ? 'wifi' : 'wifiOff', 'Señal WiFi', senal(a.rssi))}
        ${ficha('enviar', 'Telegram', a.telegram ? 'Activado' : 'Sin configurar')}
      </div>
    </section>`;
  }

  function filaEvento(ev, conDia) {
    const info = EVENTOS[ev.e] || { titulo: ev.e, icono: 'info', tono: '' };
    const hora = !ev.t ? 'Hora desconocida' : conDia ? cuando(ev.t) : fmtHora.format(ev.t * 1000);
    return `<div class="fila">
      <span class="fila-icono${info.tono ? ' fila-icono--' + info.tono : ''}">${icono(info.icono)}</span>
      <span class="fila-texto"><span class="fila-titulo">${esc(info.titulo)}</span></span>
      <span class="fila-valor fila-valor--suave">${hora}</span>
    </div>`;
  }

  function ultimos() {
    const h = st.historial.slice(0, 3);
    if (!h.length) return '';
    return `<section class="grupo">
      <h2 class="rotulo-seccion">Últimos eventos</h2>
      <div class="lista">${h.map((ev) => filaEvento(ev, true)).join('')}</div>
      <a class="enlace" href="#historial">Ver todo el historial ${icono('derecha', 'ic--20')}</a>
    </section>`;
  }

  function vacio(ic, titulo, texto) {
    return `<section class="vacio">
      <span class="vacio-icono">${icono(ic)}</span>
      <h2 class="vacio-titulo">${titulo}</h2>
      <p class="vacio-texto">${texto}</p>
    </section>`;
  }

  function eventosDeHoy() {
    const n = st.historial.filter((ev) => ev.t && etiquetaDia(ev.t * 1000) === 'Hoy').length;
    if (!n) return 'Sin eventos hoy';
    return `${n} ${n === 1 ? 'evento' : 'eventos'} hoy`;
  }

  function vistaInicio() {
    const a = st.alarma;
    const real = prefs.modo === 'real';
    const partes = [titular(prefs.nombre, eventosDeHoy() + (real ? '' : ' · datos de ejemplo'))];

    if (real && st.conexion !== 'en_linea') partes.push(avisoConexion());

    if (a) {
      partes.push(`<div class="principal">${heroe(a)}${acciones(a)}</div>`);
    } else if (real) {
      partes.push(vacio('escudo', 'Esperando a tu alarma', 'Cuando la alarma se conecte, aquí vas a ver si está vigilando.'));
    }

    if (a) partes.push(detalles(a));
    partes.push(ultimos());

    return partes.join('');
  }

  function vistaHistorial() {
    const h = st.historial;
    const cabeza = titular('Historial', 'Lo que ha pasado con tu alarma');
    if (!h.length) {
      const sinAlarma = prefs.modo === 'real' && st.conexion !== 'en_linea';
      return cabeza + vacio('historial', 'Todavía no hay eventos',
        sinAlarma ? 'Cuando la alarma se conecte, aquí vas a ver lo que ha pasado.'
                  : 'Cuando la alarma se arme o detecte movimiento, va a aparecer aquí.');
    }

    const grupos = [];
    let actual = null;
    h.forEach((ev) => {
      const dia = ev.t ? etiquetaDia(ev.t * 1000) : 'Sin fecha';
      if (!actual || actual.dia !== dia) {
        actual = { dia, eventos: [] };
        grupos.push(actual);
      }
      actual.eventos.push(ev);
    });

    const pie = prefs.modo === 'demo'
      ? 'Datos de ejemplo del modo demostración.'
      : 'La alarma guarda sus últimos 15 eventos.';

    return cabeza + grupos.map((g) => `<section class="grupo">
        <h2 class="rotulo-seccion">${esc(g.dia)}</h2>
        <div class="lista">${g.eventos.map((ev) => filaEvento(ev, false)).join('')}</div>
      </section>`).join('') + `<p class="pie">${pie}</p>`;
  }

  const SENSIBILIDADES = [
    { valor: 'alta', titulo: 'Alta', texto: 'Suena con la primera detección. Puede dar alguna falsa alarma.' },
    { valor: 'normal', titulo: 'Normal (recomendada)', texto: 'Dos detecciones seguidas, o unos segundos de movimiento.' },
    { valor: 'baja', titulo: 'Baja', texto: 'Tres detecciones seguidas. Para lugares con cortinas, sol o mascotas.' },
  ];

  function sensibilidadActual() {
    if (prefs.modo !== 'real') return prefs.sensDemo || 'normal';
    return (st.alarma && st.alarma.sens) || '';
  }

  // «hace 3 min», «hace un momento»…
  function haceTexto(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 10) return 'hace un momento';
    if (s < 60) return `hace ${s} s`;
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) { const h = Math.round(s / 3600); return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`; }
    const d = Math.round(s / 86400); return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  }

  // Ajustes → Sensores: si el sensor de calor y el radar están trabajando (se actualiza en vivo)
  function seccionSensores() {
    const a = st.alarma;
    if (prefs.modo !== 'real' || !a || a.pirN == null) return '';
    const fuera = SIN_ALARMA.includes(st.conexion);
    const estado = (vivo, n, ult) => {
      if (fuera) return 'Sin conexión con la alarma: no se puede revisar ahora.';
      if (vivo) return 'Funcionando · está viendo movimiento ahora.';
      if (n > 0) return `Funcionando · detectó ${haceTexto(ult)} · ${n} ${n === 1 ? 'vez' : 'veces'} desde que se encendió.`;
      return `No ha detectado nada desde que se encendió${a.encendida ? ' (' + haceTexto(a.encendida) + ')' : ''}. Pasa frente a él para probarlo.`;
    };
    const fila = (ic, titulo, sub) => `
          <div class="fila">
            <span class="fila-icono">${icono(ic)}</span>
            <span class="fila-texto"><span class="fila-titulo">${titulo}</span><span class="fila-sub">${sub}</span></span>
          </div>`;
    const filas = fila('persona', 'Sensor de calor', estado(a.sensor, a.pirN, a.pirUlt)) +
      (a.radarN != null ? fila('wifi', 'Radar', estado(a.radar, a.radarN, a.radarUlt)) : '');
    return `<section class="grupo">
        <h2 class="rotulo-seccion">Sensores</h2>
        <div class="lista">${filas}
        </div>
        <p class="ayuda-lista">Se actualiza en vivo: pasa frente a la alarma y mira cómo cambia. Si uno nunca detecta nada, revisa sus cables.</p>
      </section>`;
  }

  function seccionSensor() {
    const real = prefs.modo === 'real';
    const actual = sensibilidadActual();
    if (real && !actual) return ''; // la alarma todavía no la informa (versión vieja o sin conexión)
    const deshabilitado = real && (st.conexion !== 'en_linea' || !!st.pendiente);
    const filas = SENSIBILIDADES.map((s) => `
          <label class="fila" for="sens-${s.valor}">
            <span class="fila-texto"><span class="fila-titulo">${s.titulo}</span><span class="fila-sub">${s.texto}</span></span>
            <input type="radio" class="opcion" name="sens" id="sens-${s.valor}" value="${s.valor}"${actual === s.valor ? ' checked' : ''}${deshabilitado ? ' disabled' : ''}>
          </label>`).join('');
    // Doble confirmación (sensor de calor + radar): solo si la alarma la informa (2.2 en adelante)
    const a = st.alarma;
    const filaDoble = real && a && a.doble != null ? `
        <div class="lista">
          <label class="fila" for="swDoble">
            <span class="fila-texto"><span class="fila-titulo">Doble confirmación</span><span class="fila-sub">${a.radarN
              ? 'Suena solo si el sensor de calor y el radar ven movimiento a la vez.'
              : 'Ojo: el radar no ha detectado nada desde que se encendió la alarma. Revisa que esté conectado o apaga esto.'}</span></span>
            <input type="checkbox" role="switch" class="interruptor" id="swDoble"${a.doble ? ' checked' : ''}${deshabilitado ? ' disabled' : ''}>
          </label>
        </div>` : '';
    return `<section class="grupo">
        <h2 class="rotulo-seccion">Sensibilidad del sensor</h2>
        <div class="lista" role="radiogroup" aria-label="Sensibilidad del sensor">${filas}
        </div>${filaDoble}
        <p class="ayuda-lista">Si a veces no te detecta, súbela. Si da falsas alarmas, bájala. También ayuda que el sensor vea pasar a la gente de lado, no de frente.</p>
      </section>`;
  }

  function vistaAjustes() {
    const real = prefs.modo === 'real';
    const a = st.alarma;
    const telegram = !a ? 'Se sabrá cuando la alarma se conecte' : a.telegram ? 'Activado en la alarma' : 'Sin configurar';
    const subAvisos = !real
      ? 'En la demostración, solo con la app abierta'
      : prefs.avisos ? 'Te llegan aunque la app esté cerrada' : 'Para enterarte aunque la app esté cerrada';
    const conPush = real && prefs.avisos;
    const telefonos = a && a.avisos ? `La alarma avisa a ${a.avisos} ${a.avisos === 1 ? 'teléfono' : 'teléfonos'}. ` : '';
    const ayudaAvisos = conPush
      ? `${telefonos}${textoUltimoAviso(a)}`
      : 'Actívalos para que te llegue una notificación cuando la alarma detecte a alguien.';

    return `
      ${titular('Ajustes', 'Tu alarma y este teléfono')}

      <section class="grupo">
        <h2 class="rotulo-seccion">Tu alarma</h2>
        <div class="lista">
          <button type="button" class="fila" data-accion="nombre">
            <span class="fila-icono">${icono('casa')}</span>
            <span class="fila-texto"><span class="fila-titulo">Nombre</span><span class="fila-sub">${esc(prefs.nombre)}</span></span>
            ${icono('derecha', 'ic--20 fila-flecha')}
          </button>
          <button type="button" class="fila" data-accion="conectar">
            <span class="fila-icono">${icono(real ? 'wifi' : 'escudo')}</span>
            <span class="fila-texto"><span class="fila-titulo">Conexión</span><span class="fila-sub">${real ? 'Código ' + esc(prefs.codigo) : 'Modo demostración'}</span></span>
            ${icono('derecha', 'ic--20 fila-flecha')}
          </button>
          ${real && a && a.fw ? `<div class="fila">
            <span class="fila-icono">${icono('descargar')}</span>
            <span class="fila-texto"><span class="fila-titulo">Programa de la alarma</span><span class="fila-sub">Versión ${esc(a.fw)}${textoActualizacion(a) ? ' · ' + textoActualizacion(a) : ''}</span></span>
          </div>` : ''}
        </div>
        ${real && a && a.fw && st.conexion === 'en_linea'
          ? boton({ cmd: 'actualizar', texto: 'Buscar actualización', tipo: 'suave', ic: 'descargar',
                    deshabilitado: !!st.pendiente || (a.ota || '').startsWith('descargando') })
          : ''}
      </section>

      <section class="grupo">
        <h2 class="rotulo-seccion">Avisos</h2>
        <div class="lista">
          <label class="fila" for="swAvisos">
            <span class="fila-icono">${icono('campana')}</span>
            <span class="fila-texto"><span class="fila-titulo">Avisos en este teléfono</span><span class="fila-sub">${subAvisos}</span></span>
            <input type="checkbox" role="switch" class="interruptor" id="swAvisos"${prefs.avisos ? ' checked' : ''}>
          </label>
          <div class="fila">
            <span class="fila-icono">${icono('enviar')}</span>
            <span class="fila-texto"><span class="fila-titulo">Avisos por Telegram</span><span class="fila-sub">${telegram}</span></span>
          </div>
        </div>
        ${ayudaAvisos ? `<p class="ayuda-lista">${ayudaAvisos}</p>` : ''}
        ${conPush ? boton({ accion: 'aviso-prueba', texto: 'Mandarme un aviso de prueba', tipo: 'suave', ic: 'campana', deshabilitado: !!st.pendiente }) : ''}
      </section>

      ${seccionSensores()}

      ${seccionSensor()}

      <section class="grupo">
        <h2 class="rotulo-seccion">Pantalla</h2>
        <div class="lista">
          <label class="fila" for="swLetra">
            <span class="fila-icono">${icono('letra')}</span>
            <span class="fila-texto"><span class="fila-titulo">Letra más grande</span><span class="fila-sub">Agranda toda la app en este teléfono</span></span>
            <input type="checkbox" role="switch" class="interruptor" id="swLetra"${prefs.letraGrande ? ' checked' : ''}>
          </label>
        </div>
      </section>

      ${real ? '' : `<section class="grupo">${boton({ accion: 'reiniciar-demo', texto: 'Reiniciar la demostración', tipo: 'suave', ic: 'reiniciar' })}</section>`}

      <p class="pie">BloK · versión ${VERSION} · prototipo</p>`;
  }

  /* ---------- Hojas (lo que se llena sube desde abajo) ---------- */

  let focoAnterior = null;
  let cierreTimer = null;

  function abrirHoja(titulo, cuerpo) {
    clearTimeout(cierreTimer);
    focoAnterior = document.activeElement;
    const h = $('#hoja');
    const velo = $('#velo');
    h.innerHTML = `<div class="hoja-arrastre" data-arrastre>
        <div class="hoja-asa" aria-hidden="true"></div>
        <div class="hoja-cabeza">
          <h2 class="hoja-titulo" id="hojaTitulo">${titulo}</h2>
          <button type="button" class="hoja-cerrar" data-accion="cerrar-hoja" aria-label="Cerrar">${icono('x')}</button>
        </div>
      </div>${cuerpo}`;
    velo.hidden = false;
    h.hidden = false;
    h.style.transform = '';
    void h.offsetHeight; // fija la posición de abajo para que la subida se anime
    h.dataset.abierta = '';
    velo.dataset.abierto = '';
    document.body.classList.add('con-hoja');
    const primero = h.querySelector('input');
    (primero || h.querySelector('.hoja-cerrar')).focus({ preventScroll: true });
  }

  // Baja por el mismo camino por el que subió; «inmediato» la quita sin animar
  function cerrarHoja(inmediato) {
    const h = $('#hoja');
    const velo = $('#velo');
    if (h.hidden || !('abierta' in h.dataset)) return;
    delete h.dataset.abierta;
    delete velo.dataset.abierto;
    h.classList.remove('arrastrando');
    h.style.transform = '';
    velo.style.opacity = '';
    document.body.classList.remove('con-hoja');
    const terminar = () => {
      h.hidden = true;
      velo.hidden = true;
      h.innerHTML = '';
    };
    clearTimeout(cierreTimer);
    if (inmediato === true) terminar();
    else cierreTimer = setTimeout(terminar, 520);
    if (focoAnterior && focoAnterior.isConnected) focoAnterior.focus({ preventScroll: true });
  }

  /*
    Arrastrar la hoja hacia abajo para cerrarla (skill «apple-design»):
    sigue al dedo 1:1, resiste si la suben (rubber-band), mide la velocidad
    al soltar y proyecta hasta dónde llegaría con ese impulso.
  */
  let arrastre = null;

  function rubberband(exceso, dimension, constante = 0.55) {
    return (exceso * dimension * constante) / (dimension + constante * Math.abs(exceso));
  }

  // Función de proyección de Apple (Designing Fluid Interfaces): velocidad en px/s → distancia en px
  function proyectar(velocidad, desaceleracion = 0.998) {
    return (velocidad / 1000) * desaceleracion / (1 - desaceleracion);
  }

  function empezarArrastre(e) {
    const h = $('#hoja');
    if (arrastre || !e.target.closest('[data-arrastre]') || e.target.closest('button, a, input')) return;
    arrastre = { id: e.pointerId, y0: e.clientY, dy: 0, alto: h.offsetHeight, historia: [{ y: e.clientY, t: e.timeStamp }] };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* sin captura igual funciona dentro de la hoja */ }
    h.classList.add('arrastrando');
  }

  function moverArrastre(e) {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    let dy = e.clientY - arrastre.y0;
    if (dy < 0) dy = -rubberband(-dy, arrastre.alto); // hacia arriba: resiste
    arrastre.dy = dy;
    arrastre.historia.push({ y: e.clientY, t: e.timeStamp });
    if (arrastre.historia.length > 6) arrastre.historia.shift();
    $('#hoja').style.transform = `translateY(${dy}px)`;
    $('#velo').style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / arrastre.alto));
  }

  function soltarArrastre(e) {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const h = $('#hoja');
    const historia = arrastre.historia;
    const a = historia[0];
    const b = historia[historia.length - 1];
    const velocidad = ((b.y - a.y) / Math.max(1, b.t - a.t)) * 1000; // px/s, positiva hacia abajo
    const destino = arrastre.dy + proyectar(velocidad);
    const cerrar = arrastre.dy > 0 && (destino > arrastre.alto * 0.5 || velocidad > 800);
    arrastre = null;
    h.classList.remove('arrastrando');
    if (cerrar) {
      cerrarHoja();
    } else {
      h.style.transform = ''; // vuelve a su lugar desde donde está, con la curva del cajón
      $('#velo').style.opacity = '';
    }
  }

  function hojaNombre() {
    abrirHoja('Nombre de la alarma', `<form class="formulario" id="formNombre" novalidate>
      <div class="campo">
        <label for="inNombre">Nombre</label>
        <input id="inNombre" name="nombre" maxlength="24" autocomplete="off" value="${esc(prefs.nombre)}" aria-describedby="ayNombre errNombre">
        <p class="campo-ayuda" id="ayNombre">Por ejemplo: Casa, Tienda, Bodega.</p>
        <p class="campo-error" id="errNombre" hidden></p>
      </div>
      <div class="formulario-botones">
        <button type="submit" class="boton boton--fuerte"><span>Guardar nombre</span><span class="boton-circulo">${icono('adelante', 'ic--20')}</span></button>
      </div>
    </form>`);
  }

  function hojaConexion() {
    const real = prefs.modo === 'real';
    abrirHoja('Conectar con tu alarma', `<form class="formulario" id="formConexion" novalidate>
      <p class="hoja-texto">Escribe el código y la contraseña de tu alarma. Son los mismos para toda tu familia.</p>
      <div class="campo">
        <label for="inCodigo">Código de la alarma</label>
        <input id="inCodigo" name="codigo" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
               placeholder="casa-4q8z2w" value="${esc(prefs.codigo)}" aria-describedby="ayCodigo errCodigo">
        <p class="campo-ayuda" id="ayCodigo">Letras minúsculas, números y guiones. Mínimo 6.</p>
        <p class="campo-error" id="errCodigo" hidden></p>
      </div>
      <div class="campo">
        <label for="inClave">Contraseña de la alarma</label>
        <input id="inClave" name="clave" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false"
               value="${esc(prefs.clave || '')}" aria-describedby="ayClave errClave">
        <p class="campo-ayuda" id="ayClave">Distingue mayúsculas y minúsculas.</p>
        <p class="campo-error" id="errClave" hidden></p>
      </div>
      <details class="avanzado">
        <summary>Servidor (avanzado)</summary>
        <div class="campo">
          <label for="inServidor">Dirección del servidor MQTT</label>
          <input id="inServidor" name="servidor" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
                 inputmode="url" value="${esc(prefs.servidor)}" aria-describedby="errServidor">
          <p class="campo-error" id="errServidor" hidden></p>
        </div>
      </details>
      <div class="formulario-botones">
        <button type="submit" class="boton boton--fuerte"><span>Conectar con mi alarma</span><span class="boton-circulo">${icono('adelante', 'ic--20')}</span></button>
        ${real ? '<button type="button" class="boton boton--suave" data-accion="usar-demo">Usar el modo demostración</button>' : ''}
      </div>
    </form>`);
  }

  function marcarError(input, idError, mensaje) {
    const err = document.getElementById(idError);
    if (mensaje) {
      input.setAttribute('aria-invalid', 'true');
      err.textContent = mensaje;
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.hidden = true;
    }
  }

  /* ---------- Dibujar ---------- */

  function chipDe() {
    switch (st.conexion) {
      case 'demo': return ['punto--accion', 'Demostración'];
      case 'en_linea': return ['punto--ok', 'En línea'];
      case 'alarma_fuera': return ['punto--aviso', 'Sin conexión'];
      case 'sin_servidor': return ['punto--aviso', 'Sin internet'];
      case 'sin_permiso': return ['punto--aviso', 'Revisa la contraseña'];
      case 'reconectando':
      case 'esperando': return ['punto--cargando', st.alarma ? 'Actualizando…' : 'Conectando…'];
      default: return ['punto--cargando', 'Conectando…'];
    }
  }

  /*
    Actualizar sin redibujar: en vez de borrar la pantalla y pintarla de nuevo,
    se compara con lo nuevo y solo se cambia lo que cambió. Así los elementos
    siguen siendo los mismos y las transiciones de CSS pueden animar el cambio
    (la tarjeta que pasa a rojo, el botón que cambia de color…), y no se pierde
    el foco ni el toque en curso.
  */
  const plantilla = document.createElement('template');

  function pintar(contenedor, html) {
    plantilla.innerHTML = html;
    parcharHijos(contenedor, plantilla.content);
  }

  function parcharHijos(viejo, nuevo) {
    const antes = Array.from(viejo.childNodes);
    const despues = Array.from(nuevo.childNodes);
    despues.forEach((n, i) => {
      const v = antes[i];
      if (!v) {
        viejo.appendChild(n);
      } else if (v.nodeType !== n.nodeType || v.nodeName !== n.nodeName) {
        viejo.replaceChild(n, v);
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        parcharElemento(v, n);
      } else if (v.nodeValue !== n.nodeValue) {
        v.nodeValue = n.nodeValue;
      }
    });
    for (let i = antes.length - 1; i >= despues.length; i--) viejo.removeChild(antes[i]);
  }

  function parcharElemento(v, n) {
    Array.from(v.attributes).forEach((a) => { if (!n.hasAttribute(a.name)) v.removeAttribute(a.name); });
    Array.from(n.attributes).forEach((a) => { if (v.getAttribute(a.name) !== a.value) v.setAttribute(a.name, a.value); });
    if (v.tagName === 'INPUT' && (v.type === 'checkbox' || v.type === 'radio')) v.checked = n.hasAttribute('checked');
    parcharHijos(v, n);
  }

  const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  let vistaDibujada = null;

  function render() {
    const [clase, texto] = chipDe();
    pintar($('#chip'), `<span class="chip-cuerpo"><span class="punto ${clase}"></span>${texto}</span><span class="sr">. Toca para cambiar la conexión</span>`);

    const sonando = !!(st.alarma && st.alarma.estado === 'alarma');
    document.title = sonando ? '¡Alarma! · BloK' : 'BloK';
    $('#insigniaInicio').hidden = !sonando;
    document.querySelectorAll('.pestana').forEach((p) => {
      if (p.dataset.vista === st.vista) p.setAttribute('aria-current', 'page');
      else p.removeAttribute('aria-current');
    });
    $('#indicador').style.transform = `translateX(${VISTAS.indexOf(st.vista) * 100}%)`;

    const html =
      st.vista === 'historial' ? vistaHistorial() :
      st.vista === 'ajustes' ? vistaAjustes() :
      vistaInicio();
    const c = $('#contenido');

    if (vistaDibujada === st.vista) {
      pintar(c, html);
    } else {
      // Otra pestaña: aparece al instante (como en iOS, sin empujón de lado).
      // Solo la primera vez que se abre la app, el contenido entra escalonado.
      const primeraVez = vistaDibujada === null;
      c.innerHTML = html;
      vistaDibujada = st.vista;
      if (primeraVez) {
        c.classList.add('entrada');
        setTimeout(() => c.classList.remove('entrada'), 700);
        // El indicador de las pestañas se coloca sin animar y desde ahí ya se desliza
        requestAnimationFrame(() => requestAnimationFrame(() => $('#indicador').classList.add('listo')));
      }
    }
  }

  // Cada número nuevo de la cuenta regresiva entra desde abajo
  function actualizarCuentas() {
    const s = String(segundosRestantes(st.alarma));
    document.querySelectorAll('[data-cuenta]').forEach((el) => {
      if (el.textContent === s) return;
      el.textContent = s;
      if (!menosMovimiento.matches && el.animate) {
        el.animate(
          [{ opacity: 0.3, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
        );
      }
    });
  }

  // Al entrar en alarma, el centro del radar da un golpe: el cambio de estado no pasa desapercibido
  function golpeAlarma() {
    const centro = document.querySelector('.heroe .radar-centro');
    if (!centro || menosMovimiento.matches || !centro.animate) return;
    centro.animate(
      [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    );
  }

  function aplicarLetra() {
    document.documentElement.classList.toggle('letra-grande', !!prefs.letraGrande);
  }

  /* ---------- Navegación entre pestañas ---------- */

  function vistaDelEnlace() {
    const v = location.hash.slice(1);
    return VISTAS.includes(v) ? v : 'inicio';
  }

  window.addEventListener('hashchange', () => {
    const nueva = vistaDelEnlace();
    const cambio = nueva !== st.vista;
    st.vista = nueva;
    cerrarHoja(true);
    render();
    if (cambio) window.scrollTo(0, 0);
  });

  /* ---------- Toques, formularios e interruptores ---------- */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-cmd], [data-accion]');
    if (!el || el.disabled) return;
    if (prefs.modo === 'demo') sonido.asegurar(); // el navegador solo deja sonar después de un toque

    if (el.dataset.cmd) {
      enviar(el.dataset.cmd);
      return;
    }

    switch (el.dataset.accion) {
      case 'simular':
        demo.mover();
        break;
      case 'aviso-prueba':
        marcarPrueba().then(() => {
          enviar('aviso-prueba');
          nota('Pedido enviado. Cierra la app: en unos segundos te llega el aviso.');
        });
        break;
      case 'conectar':
        hojaConexion();
        break;
      case 'nombre':
        hojaNombre();
        break;
      case 'cerrar-hoja':
        cerrarHoja();
        break;
      case 'usar-demo':
        prefs.modo = 'demo';
        guardarPrefs();
        cerrarHoja();
        conectar();
        nota('Modo demostración activado.');
        break;
      case 'reiniciar-demo':
        sonido.detener();
        demo.reiniciar();
        demo.publicar();
        nota('La demostración volvió a empezar.');
        break;
    }
  });

  $('#velo').addEventListener('click', () => cerrarHoja());

  /*
    Medidas de la pantalla en iPhone.
    - El teclado tapa la parte de abajo sin achicar la pantalla. visualViewport
      dice cuánto se ve de verdad: con eso se calcula cuánto ocupa el teclado y
      la hoja se sube justo encima (ver .hoja en estilos.css).
    - Con la app instalada, el iPhone a veces se queda con medidas viejas al
      volver de otra app o después de usar el teclado, y la barra de pestañas
      queda flotando a media pantalla. Por eso, sin teclado, la barra se pega
      al borde de abajo de lo que se ve (--desfase-abajo). Y si la pantalla
      quedó encogida, se le obliga a medirse de nuevo (curarPantalla).
  */
  const instalada = navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const altoMaximo = new Map(); // ancho de la pantalla → alto más grande visto sin teclado
  let ultimaCura = 0;
  let curasSeguidas = 0;
  let desfaseAbajo = 0;

  function escribiendo() {
    const a = document.activeElement;
    return !!a && a.matches(
      'textarea, select, [contenteditable="true"], ' +
      'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"])'
    );
  }

  // Esconder y volver a mostrar la página obliga al iPhone a medirla otra vez
  function curarPantalla() {
    const y = window.scrollY;
    const hoja = document.getElementById('hoja');
    const yHoja = hoja ? hoja.scrollTop : 0;
    document.body.style.display = 'none';
    void document.body.offsetHeight;
    document.body.style.display = '';
    void document.body.offsetHeight;
    window.scrollTo(0, y);
    if (hoja) hoja.scrollTop = yHoja;
  }

  function ajustarPantalla() {
    const vv = window.visualViewport;
    const raiz = document.documentElement;
    const tecleando = escribiendo();
    const sinZoom = !vv || Math.abs(vv.scale - 1) < 0.01;

    if (instalada && !tecleando && sinZoom) {
      const ancho = window.innerWidth;
      const maximo = Math.max(altoMaximo.get(ancho) || 0, window.innerHeight);
      altoMaximo.set(ancho, maximo);
      if (window.innerHeight >= maximo - 4) {
        curasSeguidas = 0;
      } else if (curasSeguidas < 3 && Date.now() - ultimaCura > 500) {
        curasSeguidas++;
        ultimaCura = Date.now();
        curarPantalla();
      }
    }
    if (!vv) return;

    const alto = window.innerHeight;
    const teclado = Math.max(0, Math.round(alto - vv.height - vv.offsetTop));
    // Mientras la página rebota al final del scroll, no se mueve la barra
    const y = window.scrollY;
    const rebotando = y < 0 || y + alto > document.documentElement.scrollHeight + 1;
    if (tecleando || !sinZoom) {
      desfaseAbajo = 0;
    } else if (!rebotando) {
      const d = Math.round(vv.offsetTop + vv.height - alto);
      desfaseAbajo = Math.abs(d) < 2 ? 0 : d;
    }
    raiz.style.setProperty('--teclado', `${teclado}px`);
    raiz.style.setProperty('--alto-visible', `${Math.round(vv.height)}px`);
    raiz.style.setProperty('--desfase-abajo', `${desfaseAbajo}px`);
    raiz.style.setProperty('--desfase-arriba', `${sinZoom ? Math.max(0, Math.round(vv.offsetTop)) : 0}px`);
    raiz.toggleAttribute('data-teclado', teclado > 0);
  }

  // Al volver a la app el iPhone tarda un poco en acomodarse: se mide varias veces
  let reajustes = [];
  function reajustarPronto() {
    reajustes.forEach(clearTimeout);
    reajustes = [0, 150, 400, 1000].map((ms) => setTimeout(ajustarPantalla, ms));
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ajustarPantalla);
    window.visualViewport.addEventListener('scroll', ajustarPantalla);
  }
  window.addEventListener('resize', reajustarPronto);
  window.addEventListener('orientationchange', reajustarPronto);
  window.addEventListener('pageshow', reajustarPronto);
  window.addEventListener('focus', reajustarPronto);
  document.addEventListener('focusout', reajustarPronto);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reajustarPronto();
  });
  ajustarPantalla();

  const hojaEl = $('#hoja');
  hojaEl.addEventListener('pointerdown', empezarArrastre);
  hojaEl.addEventListener('pointermove', moverArrastre);
  hojaEl.addEventListener('pointerup', soltarArrastre);
  hojaEl.addEventListener('pointercancel', soltarArrastre);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarHoja();
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    e.preventDefault();

    if (f.id === 'formNombre') {
      const input = f.elements.nombre;
      const nombre = input.value.trim();
      if (!nombre) {
        marcarError(input, 'errNombre', 'Escribe un nombre para la alarma.');
        input.focus();
        return;
      }
      prefs.nombre = nombre;
      guardarPrefs();
      cerrarHoja();
      render();
      nota('Nombre guardado.');
    }

    if (f.id === 'formConexion') {
      const inCodigo = f.elements.codigo;
      const inServidor = f.elements.servidor;
      const inClave = f.elements.clave;
      const clave = inClave.value.trim();
      const codigo = inCodigo.value.trim().toLowerCase();
      const servidor = inServidor.value.trim() || SERVIDOR_POR_DEFECTO;
      let ok = true;

      if (!/^[a-z0-9-]{6,40}$/.test(codigo)) {
        marcarError(inCodigo, 'errCodigo', 'El código solo lleva letras minúsculas, números y guiones, y mínimo 6.');
        ok = false;
      } else {
        marcarError(inCodigo, 'errCodigo', '');
      }

      if (servidor !== SERVIDOR_PUBLICO && !clave) {
        marcarError(inClave, 'errClave', 'Escribe la contraseña de la alarma.');
        ok = false;
      } else {
        marcarError(inClave, 'errClave', '');
      }

      if (!/^wss?:\/\/[^\s]+$/.test(servidor)) {
        marcarError(inServidor, 'errServidor', 'La dirección empieza con wss:// (por ejemplo wss://broker.hivemq.com:8884/mqtt).');
        f.querySelector('.avanzado').open = true;
        ok = false;
      } else if (location.protocol === 'https:' && servidor.startsWith('ws://')) {
        marcarError(inServidor, 'errServidor', 'Desde una página segura (https) la dirección tiene que empezar con wss://.');
        f.querySelector('.avanzado').open = true;
        ok = false;
      } else {
        marcarError(inServidor, 'errServidor', '');
      }

      if (!ok) {
        (f.querySelector('[aria-invalid="true"]') || inCodigo).focus();
        return;
      }

      prefs.modo = 'real';
      prefs.codigo = codigo;
      prefs.clave = clave;
      prefs.servidor = servidor;
      guardarPrefs();
      cerrarHoja();
      conectar();
      nota(`Conectando con «${codigo}»…`);
    }
  });

  document.addEventListener('change', async (e) => {
    if (e.target.id === 'swLetra') {
      prefs.letraGrande = e.target.checked;
      guardarPrefs();
      aplicarLetra();
      return;
    }

    if (e.target.id === 'swDoble') {
      enviar('doble:' + (e.target.checked ? '1' : '0'));
      nota(e.target.checked ? 'Doble confirmación activada: suena con el sensor de calor y el radar.' : 'Doble confirmación apagada: suena solo con el sensor de calor.');
      return;
    }

    if (e.target.name === 'sens') {
      const valor = e.target.value;
      if (prefs.modo !== 'real') {
        prefs.sensDemo = valor;
        guardarPrefs();
        render();
      } else {
        enviar('sens:' + valor);
      }
      nota(`Sensibilidad: ${valor}.`);
      return;
    }

    if (e.target.id !== 'swAvisos') return;

    if (!e.target.checked) {
      await desactivarAvisos();
      prefs.avisos = false;
      guardarPrefs();
      render();
      return;
    }

    const puedePush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!puedePush) {
      e.target.checked = false;
      nota(esIOS()
        ? 'En iPhone, primero agrega la app a la pantalla de inicio. Después activa los avisos desde ahí.'
        : 'Este navegador no permite avisos.', 'error');
      return;
    }

    let permiso = Notification.permission;
    if (permiso === 'default') {
      try { permiso = await Notification.requestPermission(); } catch (err) { permiso = 'denied'; }
    }
    if (permiso !== 'granted') {
      prefs.avisos = false;
      guardarPrefs();
      nota('El teléfono no dio permiso para avisos. Puedes activarlo en los ajustes del teléfono.', 'error');
      render();
      return;
    }

    prefs.avisos = true;
    if (prefs.modo === 'real') {
      try {
        await suscribirAvisos();
        nota('Listo: te avisaremos aunque la app esté cerrada.');
      } catch (err) {
        prefs.avisos = false;
        nota('No se pudieron activar los avisos en este teléfono. Inténtalo otra vez.', 'error');
      }
    } else {
      nota('Listo. En la demostración los avisos llegan solo con la app abierta.');
    }
    guardarPrefs();
    render();
  });

  /*
    Al volver a la app: si estuvo fuera más de un momento, el teléfono ya cortó
    la conexión aunque la app no lo sepa. Se reconecta de una vez, sin borrar
    lo que se ve ni la orden que esté esperando.
  */
  let ocultaDesde = 0;

  function reanudarSiHaceFalta(forzar) {
    if (prefs.modo !== 'real') return;
    if (forzar || !cliente || !cliente.connected) conectar({ reanudar: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ocultaDesde = Date.now();
      return;
    }
    const fuera = ocultaDesde ? Date.now() - ocultaDesde : 0;
    ocultaDesde = 0;
    reanudarSiHaceFalta(fuera > 1500);
  });

  window.addEventListener('pageshow', (e) => { if (e.persisted) reanudarSiHaceFalta(true); });
  window.addEventListener('online', () => reanudarSiHaceFalta(false));

  /* ---------- Arranque ---------- */

  aplicarLetra();
  demo.reiniciar();
  st.vista = vistaDelEnlace();
  conectar();

  setInterval(() => {
    if (prefs.modo === 'demo') demo.tick();
    actualizarCuentas();
  }, 500);

  const origenSeguro = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && origenSeguro) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });

    // Avisos ya activados (o activados en una versión anterior): se asegura la
    // suscripción push. Con el permiso ya dado no hace falta tocar nada.
    if (prefs.modo === 'real' && prefs.avisos && 'PushManager' in window &&
        'Notification' in window && Notification.permission === 'granted') {
      suscribirAvisos().catch(() => { /* se reintenta la próxima vez que se abra */ });
    }
  }
})();
