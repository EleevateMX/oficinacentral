# Nuvora — Oficina virtual

Oficina virtual privada estilo Gather: un mapa 2D donde cada persona tiene su avatar, se acerca a otros para hablar
por audio/video, tiene su escritorio decorable, chat, calendario y actividad. **Solo se entra por invitación de un administrador.**

## Marca

El producto es **Nuvora** (identidad del Manual de marca v2: paleta profundo, verde, mandarina, uva y crema; Albert Sans y Public Sans; Nuvi como anfitriona).
Cada oficina elige su tema en **Preferencias → Marca de la oficina**: *Nuvora*, *HUB* (tema `gtahub`: login oscuro) o *Personalizado* (color y logo propios).
La firma “by nuvora” se mantiene en el inicio de sesión.

## Qué incluye

- **Login privado** y registro únicamente con enlace de invitación (un solo uso, con fecha de expiración y rol).
- **Mapa 2D** con avatares pixel-art, movimiento con WASD/flechas o clic (camina solo hasta el punto), “Ir a” una persona,
  reacciones (teclas 1–6), estados (Activo / Ocupado / Ausente) y varios **pisos**.
- **Audio y video por cercanía (WebRTC)**:
  - en el **pasillo** hablas con quien esté a 3 casillas o menos;
  - en el **escritorio** de alguien hablas con quien esté en ese escritorio;
  - en un **área privada** (sala de juntas, departamento cerrado) hablan todos los que estén dentro.
  - Compartir pantalla, indicador de quién habla, selección de micrófono/cámara/bocinas, HD, supresión de ruido y eco.
- **Escritorios**: cada persona reclama uno y lo **decora** con el Decorador (monitores, plantas, comida, figuras…),
  con colores, deshacer/rehacer y límite de objetos.
- **Editor de oficina (admins)**: mover, rotar, recolorear o borrar cualquier mueble; colocar muebles nuevos;
  **dibujar áreas/departamentos** (nombre, alfombra, privada o no) y **crear pisos** conforme crece el equipo.
- **Chat**: canales (#general, #social), mensajes directos, @menciones, formato (negritas, cursiva, código, enlaces), saludos 👋.
- **Calendario** semanal con línea de “ahora”, reuniones con invitados y sala (botón para ir a la sala), recordatorios.
- **Actividad**: saludos, menciones e invitaciones, con filtro de no leídas.
- **Perfil**: foto, avatar personalizable, nombre, zona horaria (muestra la hora local), estado personalizado.
- **App instalable (PWA) y notificaciones push**: se instala en Android, iPhone/iPad (iOS 16.4+, desde Safari:
  Compartir → Agregar a inicio) y escritorio. En **Preferencias → Notificaciones** cada dispositivo activa avisos que llegan
  aunque la app esté cerrada: mensajes directos, @menciones (o todos los mensajes si así lo eliges), saludos, invitaciones
  y recordatorios del calendario (5 min antes y al empezar). Si tienes la app abierta y a la vista, no se manda push.
  El service worker solo se registra en la versión compilada y requiere HTTPS (o `localhost`).
- **Preferencias**: general (modo claro/oscuro), calendario, audio, video, reuniones, notificaciones, privacidad,
  rendimiento, cuenta (cambiar contraseña) y, para admins, **Miembros** (roles, desactivar acceso, restablecer contraseña)
  e **Invitaciones**.

## Requisitos

- Node.js **22.5 o superior** (usa el SQLite integrado de Node, sin dependencias nativas).

## Uso en local

```bash
npm install
ADMIN_PASSWORD='una-contraseña-segura' npm run dev
```

- Abre http://localhost:5173 (Vite) — la API corre en el puerto 3000.
- En el primer arranque se crea el usuario **admin** (o el de `ADMIN_USERNAME`). Si no defines `ADMIN_PASSWORD`,
  se genera una contraseña aleatoria y se muestra en la consola.
- Desde **Preferencias → Miembros → Invitaciones** (o el botón “Invitar personas”) creas enlaces de invitación.

Crear o recuperar un administrador desde la terminal:

```bash
npm run create-admin -- usuario 'contraseña-segura' "Nombre visible"
```

## Producción

> **Para montarlo en un VPS con Docker (HTTPS + TURN incluidos) sigue [`DEPLOY.md`](DEPLOY.md).**

Sin Docker:

```bash
npm install
npm run build
NODE_ENV=production PORT=3000 node server/index.js
```

Variables de entorno:

| Variable | Para qué sirve |
| --- | --- |
| `PORT` | Puerto HTTP (por defecto 3000) |
| `DATA_DIR` | Carpeta de la base de datos (por defecto `./data`) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_EMAIL` | Primer administrador (solo si no hay usuarios) |
| `OFFICE_NAME`, `OFFICE_THEME` | Nombre y tema inicial de la oficina (`nuvora`, `gtahub` o `custom`). Después se cambian en Preferencias → Marca de la oficina |
| `TURN_SECRET`, `TURN_URLS` | Servidor TURN propio (coturn) con credenciales temporales |
| `ICE_SERVERS` | JSON con servidores STUN/TURN fijos (alternativa a lo anterior) |
| `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` | TURN de Cloudflare con credenciales temporales (para Railway u otros hostings sin UDP) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Servidor de medios LiveKit (propio o LiveKit Cloud). Vacío = conexión directa P2P |
| `ALERT_WEBHOOK_URL` | Webhook de Discord o Slack para avisos de errores, reinicios y caídas |
| `BIRTHDAY_WEBHOOK_URL` | Webhook de Discord o Slack donde se anuncia cada mañana (9:00) quién cumple años |
| `OFFICE_TIMEZONE` | Zona horaria de la oficina para el aviso de cumpleaños (por defecto `America/Mexico_City`) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_URL` | Entrar con Discord (vincular cuenta, entrar o aceptar invitación) |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | Bot de Discord (opcional): roles de Discord → placas/admin/VIP en el HUB y avisos a canales. Sin estas dos, la integración no hace nada. Ver [Bot de Discord](#bot-de-discord) |
| `DISCORD_PUBLIC_KEY` | Llave pública de la app de Discord: activa los botones del canal de moderación (endpoint `/api/discord/interactions`) |
| `DISCORD_GATEWAY` | `1` = roles al instante por el Gateway (requiere *Server Members Intent*). Sin esto se sincroniza cada `DISCORD_SYNC_MINUTES` (15) |
| `MOD_WEBHOOK_URL` | Webhook de un canal privado de moderación: reportes y sanciones cuando no hay bot (sin botones) |
| `IP_HASH_SALT` | Opcional: sal para el hash de IPs (baneo por IP). Si falta, se genera una y se guarda en la base de datos |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notificaciones push (Web Push). Si faltan las llaves, se generan solas la primera vez y se guardan en la base de datos. `VAPID_SUBJECT` es un contacto `mailto:` o `https://` (por omisión `mailto:` + `ADMIN_EMAIL`) |
| `ANTHROPIC_API_KEY` | Llave de la API de Claude para el resumen de reuniones con IA ("📝 Tomar notas" en las salas). Vacío = función desactivada. El admin también puede apagarla en Preferencias → Marca de la oficina |
| `AI_MODEL` | Opcional: modelo de Claude para los resúmenes (por defecto `claude-sonnet-5-5`) |
| `TRUST_PROXY` | `1` si hay un proxy delante (Railway, Caddy) para leer bien la IP de quien entra |
| `BACKUP_KEEP`, `BACKUP_EVERY_HOURS` | Respaldos automáticos de la base de datos (14 copias, cada 24 h) |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` | Copia de cada respaldo (y de los adjuntos del chat) en un almacenamiento compatible con S3: Cloudflare R2, AWS S3, Backblaze B2, MinIO. Vacío = desactivado. Ver [`DEPLOY.md`](DEPLOY.md#respaldos-fuera-del-servidor-cloudflare-r2) |
| `BACKUP_S3_REGION`, `BACKUP_S3_PREFIX`, `BACKUP_S3_KEEP` | Región (`auto` para R2), carpeta dentro del bucket (`nuvora/`) y cuántos respaldos guardar ahí (30) |
| `TRUST_PROXY=1` | Si está detrás de un proxy (nginx, Caddy…) |
| `INSECURE_COOKIES=1` | Solo para pruebas en producción sin HTTPS |

Notas importantes:

- **HTTPS es obligatorio** para micrófono y cámara fuera de `localhost`. Pon la app detrás de Caddy/nginx con certificado.
- El audio/video es **P2P** (malla). Funciona bien para grupos pequeños por conversación (hasta ~8 personas).
  En redes corporativas estrictas hace falta un servidor **TURN** (por ejemplo coturn), configurado así:
  `ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.tudominio.com:3478","username":"u","credential":"p"}]'`
- Respalda la carpeta `data/` (contiene la base de datos SQLite y los adjuntos en `data/uploads/`), o configura `BACKUP_S3_*`.
  `npm run backup` crea un respaldo ahora, `npm run backup -- --list` lista los respaldos y
  `npm run restore -- <archivo | s3:clave | --latest>` restaura uno (con la app apagada).

## Estructura

```
server/          API (Express), tiempo real (Socket.IO), base de datos (node:sqlite)
  api.js         rutas REST: auth, invitaciones, usuarios, chat, calendario, mapa
  realtime.js    presencia, movimiento y señalización WebRTC
  world.js       pisos, áreas, objetos y escritorios (con validación de permisos)
shared/          código usado por servidor y cliente
  map.js         plantillas de pisos, reglas de conversación, caminos
  catalog.js     catálogo de muebles y decoraciones
client/src/      interfaz (React + Vite)
  lib/render.js  dibujo del mapa y avatares en canvas (pixel-art generado por código)
  lib/media.js   audio/video WebRTC por cercanía
  components/    pantallas: mapa, chat, calendario, actividad, perfil, preferencias, decorador
```

## Personajes y decoración

- Avatares chibi en pixel-art armados **por piezas**: 13 peinados, 5 ojos, 4 bocas, vello facial, 11 prendas, pantalón/short/falda,
  gorra o sombrero, lentes, audífonos y extras. **Cualquier color** en cada pieza (más de 15 millones de combinaciones de piezas).
- Paquetes de inicio: 12 personajes de **Oficina** y 12 de **HUB**, más los PNG que suban los admins (Preferencias → Personajes).
- Hojas de 96×192 (3 cuadros × 4 direcciones, 32×48 cada uno); `node tools/characters/generate.mjs` exporta galerías y hojas a `docs/personajes/`.
  Para agregar un prediseñado, añade su ficha a `PRESETS` en `shared/sprite.js`.
- **Decorador**: más de 70 objetos de escritorio y de piso (tecnología, gamer y stream, mascotas, comida, plantas, marca HUB, salas gamer…).
  En **Mi lugar** cada quien elige el modelo y color de su escritorio y su silla. Límite de 30 objetos por escritorio.

## Mapa y departamentos

- Plantilla **Oficina recreativa** (predeterminada en instalaciones nuevas): salas temáticas de la comunidad con letreros
  que dicen su nombre: **Charla General**, **Roleplay** (taberna), **League of Legends**, **Valorant**, **Minecraft**, Juegos,
  Torneos (escenario), Música y Karaoke, Cine y Anime, Stream, Arte y Diseño, Estudio / Tareas, Sala VIP 1:1, Café, Jardín,
  Coworking (escritorios para reclamar), cabinas privadas y Recepción con el elevador al Hotel.
- Plantilla **Oficina HQ** (archivada para admins, y disponible al crear un piso): sala de reuniones, jardín con
  estanque, salas de staff, cocina, Dirección, Mapping / Design, Engineering, Marketing, tres salas chicas de cristal,
  Staff / Orgs, lounge, Dev Oeste/Este, sala de reuniones sur, recepción con entrada, zona de descanso y sala de juegos (65 escritorios).
- Esquinas recortadas, paredes de cristal, sombras de muros y formas curvas (estanques, plazas y jardines) para que no se vea cuadrado.
  Las alfombras de cada área pueden ser **redondeadas, ovaladas o rectas**.
- **Líderes de departamento**: el admin los asigna en Editar oficina → Áreas. El líder, desde el Decorador → Departamento,
  coloca muebles y decoración dentro de su área, cambia su alfombra y su forma, y puede activar **"Que mi equipo también decore"**
  para que quienes tienen escritorio ahí añadan decoración (cada quien mueve solo lo suyo). Nadie toca el escritorio de otra persona.
  Límite de 150 objetos por departamento.
- **Marca en el salón**: banderines, estandartes, neón con el nombre de la oficina, logo en el piso, pósters, luces, globos,
  banderitas de escritorio y astas con bandera. Si no se les elige color toman los del tema (rosa, amarillo y negro en HUB;
  verde y mandarina en Nuvora) y los muros llevan una franja del color de la marca.

## Trabajo diario en la oficina

- **Pantalla compartida** como uso principal: calidad *Texto nítido*, *Equilibrada* o *Juegos y video* (hasta 60 fps), audio de la PC,
  ancho de banda repartido entre quienes ven, vista en grande con pantalla completa y ventana flotante, y proyección en vivo sobre la TV o
  la pantalla gigante de la sala.
- **Transmisiones al estilo Discord**: varias personas pueden transmitir a la vez; cada quien elige qué ver (botón *Ver*),
  en grande o en mosaico de hasta 4, con contador de espectadores, volumen por transmisión y dibujo encima.
  Con LiveKit configurado, el servidor reparte las pantallas y solo te llegan las que ves.
- **En turno**: cada quien marca en qué turno o servidor está (los define el admin en Marca de la oficina → Turnos).
- **Salas apartadas**: una reunión del calendario con sala muestra "Ocupada" o la próxima hora en el mapa.
- **Pizarrón** compartido en vivo y **tablero de anuncios** (tecla **X** junto al objeto, o clic).
- **Invitaciones en lote**: pega una lista o sube un CSV y descarga los enlaces.
- **Ambiente**: luz según la hora, música suave en zonas de descanso y pasos (Preferencias → Ambiente).
- **Celular**: barra de pestañas abajo, chat con lista y conversación, controles compactos y zoom con dos dedos.

## Pruebas

```bash
npm test          # pruebas del servidor y de los mapas (node:test)
npm run test:e2e  # prueba en navegador con Playwright
```

GitHub Actions corre ambas en cada push y pull request (`.github/workflows/ci.yml`).

## Seguridad

- **Verificación en dos pasos** (app de autenticación) con 10 códigos de respaldo. En *Seguridad* un admin puede exigirla a todos los administradores.
  Si alguien pierde su teléfono, otro admin la quita desde *Miembros*, o en el servidor: `npm run reset-2fa -- <usuario>`.
- **Registro de actividad** (Preferencias → Seguridad): invitaciones, cambios de rol, cuentas desactivadas, contraseñas restablecidas,
  pisos, áreas, líderes, logos, objetos borrados por admins, inicios de sesión de admins y los fallidos. Exportable a CSV.

## Discord y turnos

- **Entrar con Discord**: cada quien vincula su Discord en *Cuenta* y entra con un clic; una invitación también se puede aceptar con Discord.
  Sigue siendo solo por invitación: un Discord sin vincular no entra. Si la persona tiene verificación en dos pasos, se pide igual.
  Configura en Discord Developer Portal → OAuth2 la redirección `https://TU-DOMINIO/api/auth/discord/callback`.
- **Reporte de turnos** (Marca de la oficina → Reporte de turnos): horas por persona y turno (esta semana, la pasada, este mes, el pasado),
  número de veces y días, exportable a CSV. Cuenta el tiempo "En turno" mientras la persona está conectada.

## Bot de Discord

Opcional y apagado mientras no existan `DISCORD_BOT_TOKEN` y `DISCORD_GUILD_ID`. Se configura en **Preferencias → Discord** (solo admins).

- **Roles de Discord → HUB.** Cada rol (y el boost del servidor) puede dar placas, rol de admin, un tema, VIP del Hotel o
  "Moderador de HUB" (modera a miembros desde Discord y el HUB, nunca a admins ni la configuración). Se leen al entrar,
  cada 15 min y, con `DISCORD_GATEWAY=1`, al momento. Lo que da Discord queda marcado: si quitan el rol, solo se quita eso.
  Dar admin por un rol pide confirmar con tu código de verificación en dos pasos, y Discord nunca le quita el admin al primer admin.
  Opción "Solo miembros del Discord pueden entrar" (apagada por defecto).
- **Avisos a canales.** Streamer en vivo, bienvenidas, cumpleaños (el webhook queda de respaldo), eventos del calendario,
  eventos del Hotel, logros (apagado por defecto) y registro de moderación. Todo sale **sin menciones** (`allowed_mentions` vacío).
- **Personalizar canal.** Pone el tema de un canal y publica y fija un mensaje de bienvenida (reglas, enlaces al HUB y a MeDed Friends,
  cómo vincular Discord). Revisa los permisos del bot y dice cuáles faltan. No crea ni borra canales o roles.
- **Moderación desde Discord.** Cada reporte llega al canal privado con dónde está la persona y botones: *Sacar*, *Silenciar 15 min*,
  *Silenciar voz*, *Banear 1 día*, *Banear + IP* y *Descartar*. Solo funcionan para admins del HUB con Discord vinculado o el rol mapeado
  como "Moderador de HUB". Todo queda en el registro de actividad.
- **Baneo por IP y silencio de voz.** Desde la tarjeta de la persona: "Silenciar en voz" (sin micrófono, el chat sigue),
  "Sacar de la sala/voz" y "Banear también su IP". Las IPs se guardan como hash con sal; nunca se muestran completas.

Cómo crear el bot (Discord Developer Portal, `discord.com/developers/applications`):

1. Abre la misma aplicación de "Entrar con Discord" (o crea una). En **Bot** → *Reset Token* → cópialo en `DISCORD_BOT_TOKEN`.
   Para roles al instante activa **Server Members Intent** (Privileged Gateway Intents) y pon `DISCORD_GATEWAY=1`.
2. Invítalo con scope `bot` y permisos: Ver canales, Enviar mensajes, Insertar enlaces, Leer el historial, Gestionar mensajes (para fijar)
   y, opcional, Gestionar canales (para el tema). Enlace:
   `https://discord.com/oauth2/authorize?client_id=TU_CLIENT_ID&scope=bot&permissions=2251799813778448`
   (Preferencias → Discord lo arma por ti).
3. Modo desarrollador en Discord → clic derecho al servidor → *Copiar ID* → `DISCORD_GUILD_ID`.
4. Botones de moderación: en *General Information* copia la **Public Key** en `DISCORD_PUBLIC_KEY` y en
   **Interactions Endpoint URL** pon `https://TU-DOMINIO/api/discord/interactions` (Discord lo valida al guardar).
5. Reinicia el servicio y entra a Preferencias → Discord.

## App de escritorio

En `desktop/` está la app para Windows y macOS (Electron). Abre la oficina en su propia ventana y añade lo que el navegador
no puede hacer mientras juegas:

- **Elegir oficina** la primera vez (p. ej. `oficina.gtahub.gg`); se cambia en la bandeja → *Cambiar oficina…*.
  Solo navega dentro de esa dirección; los demás enlaces se abren en el navegador.
- **Atajos globales** (funcionan con el juego en primer plano): silenciar/activar con **Ctrl+Shift+M** y
  **mantener para hablar** con la tecla <kbd>`</kbd> (debajo de Esc) o un botón lateral del ratón. Se configuran en
  la bandeja → *Configuración…*. Si el gancho de teclado no carga, queda solo el modo de alternar.
- **Compartir pantalla con audio de la PC**: selector propio de pantallas y ventanas. En Windows 11 y macOS 14.2+
  se excluyen las voces de la oficina del audio compartido (evita eco).
- **Bandeja del sistema**: abrir, silenciar, cambiar oficina, iniciar con el sistema y salir. Cerrar la ventana la deja en la bandeja.

```bash
cd desktop
npm install
npm start            # abre la app en modo desarrollo
npm run dist:win     # instalador NSIS en desktop/dist (desde Windows)
npm run dist:mac     # .dmg arm64 y x64 en desktop/dist (desde macOS)
npm run icons        # regenera los íconos desde el logo
```

GitHub Actions (`.github/workflows/desktop.yml`) genera el instalador de Windows y los `.dmg` de macOS cuando cambia
`desktop/` (o a mano con *Run workflow*) y los deja como artefactos; no publica releases.

Notas:

- **Firma de código**: los instaladores salen **sin firmar** (Windows) y con **firma ad-hoc** (macOS). Windows mostrará
  SmartScreen y macOS pedirá *clic derecho → Abrir* (o `xattr -dr com.apple.quarantine /Applications/Nuvora.app`).
  Para producción: en Windows un certificado de firma de código (OV/EV o Azure Trusted Signing) con `CSC_LINK` y
  `CSC_KEY_PASSWORD`; en macOS un certificado *Developer ID Application* (`CSC_LINK`/`CSC_KEY_PASSWORD`), quitar
  `"identity": "-"`, activar `hardenedRuntime` con entitlements de micrófono/cámara y notarizar con `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID`. Todos van como *secrets* del workflow.
- **Audio del sistema en macOS**: requiere macOS 13 o superior. En 14.2+ Chromium usa CoreAudio Tap y macOS pide el permiso
  *Grabación de audio del sistema* (la app ya declara `NSAudioCaptureUsageDescription`); en 13–14.1 usa ScreenCaptureKit.
  En macOS 12 o anterior no hay audio del sistema (alternativa: un dispositivo virtual como BlackHole).
  Sin firma de Developer ID, macOS puede volver a pedir los permisos tras cada actualización.
- **Mantener para hablar en macOS** necesita el permiso de *Accesibilidad* (Ajustes del Sistema → Privacidad y seguridad).
  En Windows, si el juego corre como administrador, la app también debe abrirse como administrador para escuchar las teclas.
- El micrófono se abre y cierra en cada pulsación (igual que el botón de la barra), así que puede haber una pequeña
  demora al empezar a hablar.
- Las notificaciones de Windows funcionan con la app instalada (el instalador registra el AppUserModelID `mx.nuvora.desktop`).
