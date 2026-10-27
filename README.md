# Nuvora — Oficina virtual

Oficina virtual privada estilo Gather: un mapa 2D donde cada persona tiene su avatar, se acerca a otros para hablar
por audio/video, tiene su escritorio decorable, chat, calendario y actividad. **Solo se entra por invitación de un administrador.**

## Marca

El producto es **Nuvora** (identidad del Manual de marca v2: paleta profundo, verde, mandarina, uva y crema; Albert Sans y Public Sans; Nuvi como anfitriona).
Cada oficina elige su tema en **Preferencias → Marca de la oficina**: *Nuvora*, *GTAHUB* (azul índigo y login oscuro) o *Personalizado* (color y logo propios).
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
| `BACKUP_KEEP`, `BACKUP_EVERY_HOURS` | Respaldos automáticos de la base de datos (14 copias, cada 24 h) |
| `TRUST_PROXY=1` | Si está detrás de un proxy (nginx, Caddy…) |
| `INSECURE_COOKIES=1` | Solo para pruebas en producción sin HTTPS |

Notas importantes:

- **HTTPS es obligatorio** para micrófono y cámara fuera de `localhost`. Pon la app detrás de Caddy/nginx con certificado.
- El audio/video es **P2P** (malla). Funciona bien para grupos pequeños por conversación (hasta ~8 personas).
  En redes corporativas estrictas hace falta un servidor **TURN** (por ejemplo coturn), configurado así:
  `ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.tudominio.com:3478","username":"u","credential":"p"}]'`
- Respalda la carpeta `data/` (contiene la base de datos SQLite).

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
- Paquetes de inicio: 12 personajes de **Oficina** y 12 de **GTAHUB**, más los PNG que suban los admins (Preferencias → Personajes).
- Hojas de 96×192 (3 cuadros × 4 direcciones, 32×48 cada uno); `node tools/characters/generate.mjs` exporta galerías y hojas a `docs/personajes/`.
  Para agregar un prediseñado, añade su ficha a `PRESETS` en `shared/sprite.js`.
- **Decorador**: más de 70 objetos de escritorio y de piso (tecnología, gamer y stream, mascotas, comida, plantas, GTAHUB…).
  En **Mi lugar** cada quien elige el modelo y color de su escritorio y su silla. Límite de 30 objetos por escritorio.
