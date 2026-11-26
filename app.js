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
  const SERVIDOR_POR_DEFECTO = 'wss://broker.hivemq.com:8884/mqtt';
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
    { nombre: 'Casa', modo: 'demo', codigo: '', servidor: SERVIDOR_POR_DEFECTO, avisos: false, letraGrande: false },
    leerPrefs()
  );

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
        c.subscribe([b + 'conexion', b + 'estado', b + 'historial'], { qos: 1 });
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
  };

  const EN_CAMINO = ['conectando', 'reconectando', 'esperando'];

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

    if (st.pendiente && RESPUESTA_ESPERADA[st.pendiente.cmd](nuevo.estado)) {
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
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(VAPID_PUBLICA) });
    }
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
        ${conEnlace ? '<button type="button" class="enlace" data-accion="conectar">Revisar el código</button>' : ''}
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
      case 'sin_servidor':
        return aviso('wifiOff', 'Sin internet', 'Este teléfono no llega al servidor. Revisa tus datos o tu WiFi: la app se vuelve a conectar sola.');
      case 'alarma_fuera':
        return aviso('wifiOff', 'Tu alarma no está conectada',
          `Revisa que esté enchufada y que su WiFi funcione. La app busca el código <strong>${esc(prefs.codigo)}</strong>.`, true);
      default:
        return '';
    }
  }

  // La tarjeta negra protagonista: estado, radar y accesos rápidos
  function heroe(a) {
    const real = prefs.modo === 'real';
    const viejo = real && (st.conexion === 'alarma_fuera' || st.conexion === 'sin_servidor');
    let clase = 'heroe--' + a.estado;
    let centro = icono('escudo');
    let titulo = '';
    let texto = '';

    switch (a.estado) {
      case 'desarmada':
        titulo = 'Desarmada';
        texto = 'No está vigilando. Ármala antes de salir.';
        break;
      case 'armando':
        titulo = 'Armándose';
        if (viejo) {
          texto = 'Se estaba armando cuando se perdió la conexión.';
        } else {
          texto = 'Sal de la zona del sensor antes de que empiece a vigilar.';
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
        texto = `${a.ultimo ? cuando(a.ultimo) + ' · ' : ''}${a.sirena ? 'La sirena está sonando.' : 'La sirena ya se apagó, pero sigue en alarma.'}`;
        break;
    }
    if (viejo) {
      clase = 'heroe--desarmada';
      texto += ' Es el último estado conocido.';
    }

    const sensor = a.sensor
      ? `<span class="punto punto--peligro"></span>Sensor: ve movimiento`
      : `<span class="punto"></span>Sensor: quieto`;

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
        <span class="pastilla-vidrio">${sensor}</span>
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
    const apagada = real && (st.conexion === 'alarma_fuera' || st.conexion === 'sin_servidor');
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

  function detalles(a) {
    return `<section class="grupo">
      <h2 class="rotulo-seccion">Detalles</h2>
      <div class="mosaico">
        ${ficha('persona', 'Sensor', a.sensor ? 'Ve movimiento' : 'Quieto', a.sensor ? 'peligro' : '')}
        ${ficha('reloj', 'Última detección', a.ultimo ? cuando(a.ultimo) : 'Ninguna')}
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
        </div>
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

      <p class="pie">Mi Alarma · versión ${VERSION} · prototipo</p>`;
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
      <p class="hoja-texto">Escribe el mismo código que pusiste en el ESP32, en la línea <code>CODIGO_ALARMA</code>.</p>
      <div class="campo">
        <label for="inCodigo">Código de la alarma</label>
        <input id="inCodigo" name="codigo" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
               placeholder="casa-4q8z2w" value="${esc(prefs.codigo)}" aria-describedby="ayCodigo errCodigo">
        <p class="campo-ayuda" id="ayCodigo">Letras minúsculas, números y guiones. Mínimo 6.</p>
        <p class="campo-error" id="errCodigo" hidden></p>
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
    if (v.tagName === 'INPUT' && v.type === 'checkbox') v.checked = n.hasAttribute('checked');
    parcharHijos(v, n);
  }

  const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  let vistaDibujada = null;

  function render() {
    const [clase, texto] = chipDe();
    pintar($('#chip'), `<span class="chip-cuerpo"><span class="punto ${clase}"></span>${texto}</span><span class="sr">. Toca para cambiar la conexión</span>`);

    const sonando = !!(st.alarma && st.alarma.estado === 'alarma');
    document.title = sonando ? '¡Alarma! · Mi Alarma' : 'Mi Alarma';
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
    El teclado del iPhone tapa la parte de abajo sin achicar la pantalla.
    visualViewport dice cuánto se ve de verdad: con eso se calcula cuánto
    ocupa el teclado y la hoja se sube justo encima (ver .hoja en estilos.css).
  */
  function ajustarTeclado() {
    const vv = window.visualViewport;
    if (!vv) return;
    const teclado = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const raiz = document.documentElement;
    raiz.style.setProperty('--teclado', `${teclado}px`);
    raiz.style.setProperty('--alto-visible', `${Math.round(vv.height)}px`);
    raiz.toggleAttribute('data-teclado', teclado > 0);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ajustarTeclado);
    window.visualViewport.addEventListener('scroll', ajustarTeclado);
    ajustarTeclado();
  }

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
      const codigo = inCodigo.value.trim().toLowerCase();
      const servidor = inServidor.value.trim() || SERVIDOR_POR_DEFECTO;
      let ok = true;

      if (!/^[a-z0-9-]{6,40}$/.test(codigo)) {
        marcarError(inCodigo, 'errCodigo', 'El código solo lleva letras minúsculas, números y guiones, y mínimo 6.');
        ok = false;
      } else {
        marcarError(inCodigo, 'errCodigo', '');
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
