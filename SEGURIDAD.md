# Revisión de seguridad — HUB / MeDed Friends

**Fecha:** 29 oct 2026
**Alcance:** servidor (REST, tiempo real, Hotel, archivos, push, Discord) y moderación.

## Resumen

La base estaba bien: acceso solo por invitación, contraseñas cifradas, verificación en dos pasos y archivos que no se ejecutan. Aun así encontramos huecos reales y los cerramos:

| # | Qué pasaba | Gravedad | Estado |
|---|---|---|---|
| 1 | Una persona podía mandar miles de reacciones o eventos por segundo y le llegaban a **toda** la oficina. Eso la saturaba para todos. | Alta | Arreglado |
| 2 | No había cómo silenciar, sacar, suspender, bloquear ni reportar. | Alta | Agregado |
| 3 | Cualquier miembro veía el correo de los demás. | Media | Arreglado |
| 4 | Las notificaciones push aceptaban cualquier dirección, así que el servidor podía terminar haciendo peticiones a direcciones internas. | Media | Arreglado |
| 5 | El inicio de sesión no se bloqueaba por cuenta ni tenía un freno global. | Media | Arreglado |
| 6 | No había límites en chat, saludos, anuncios, eventos, contraseña ni subidas. Se podía llenar el disco. | Media | Arreglado |
| 7 | Cualquiera podía llamarse "Admin" o usar caracteres invisibles para parecerse a otra persona. | Media | Arreglado |
| 8 | Faltaban encabezados de seguridad y la revisión de origen contra páginas ajenas. | Baja-Media | Arreglado |
| 9 | Un error dentro de un evento en vivo reiniciaba todo el servidor. | Media | Arreglado |
| 10 | La conexión en vivo aceptaba mensajes de hasta 1 MB. | Baja-Media | Ahora 200 KB |
| 11 | Datos mal formados daban "error 500". | Baja | Arreglado |

## Qué puedes hacer ahora como admin

**En la tarjeta de una persona:**
- **Bloquear** (cualquiera): dejas de ver sus mensajes, DMs, saludos, llamadas y su chat. No se puede bloquear a un admin.
- **Reportar** (cualquiera): llega a los admins al instante.
- **Silenciar** (solo admins): 15 min, 1 h o 1 día. La persona se queda sin chat, sin micrófono y sin anuncios.
- **Sacar** (solo admins): se desconecta y no puede volver a entrar en 5 min.
- **Suspender** (solo admins): 1 día, 7 días o permanente. No puede entrar.

**En el chat:** cada mensaje tiene un botón 🚩 para reportarlo. El texto se guarda como evidencia.

**En Preferencias → Moderación:** ves los reportes (nuevos, revisados y descartados) y las sanciones activas.

Todo queda anotado en **Seguridad → Registro de actividad**.

## Límites que ahora protegen la oficina

- **Conexión en vivo:** hay un límite por conexión. Quien insiste en mandar de más se desconecta solo. Caminar, jugar y hablar no se ven afectados.
- **Pestañas y conexiones:** máximo 8 pestañas por persona y 100 conexiones por IP.
- **Mensajes:** 12 cada 10 s y máximo 15 menciones por mensaje.
- **Saludos:** 1 cada 10 s.
- **Anuncios:** 5 cada 10 min.
- **Eventos:** 20 por hora y 300 invitados por evento.
- **Archivos:** 60 por hora y 500 MB al día.
- **Inicio de sesión:** después de 5 fallos hay que esperar, de 15 s hasta 15 min, por cuenta y por red. Además hay un tope global, y el servidor tarda lo mismo en responder exista o no el usuario.

## Revisado y sin problemas

- **Texto peligroso en nombres o mensajes:** no se ejecuta.
- **Archivos HTML o SVG subidos:** se descargan aislados.
- **Rutas de admin:** ninguna funciona para un miembro. Se revisan todas de forma automática.
- **Hotel:** el cálculo de caminos tiene tope y las salas miden máximo 40×40.
- **Pisos de admins, salas cerradas y teletransporte:** se revisan en el servidor.

## Recomendaciones

1. **Pon Cloudflare delante de Render.** Es gratis y protege contra ataques grandes de tráfico. Si lo haces, define `TRUST_CF=1` en Render.
2. **Respaldos:** confirma en Seguridad → Respaldos que la copia fuera del servidor está activa, y prueba una restauración una vez.
3. **Exige verificación en dos pasos a los admins.**
4. **No publiques enlaces de invitación** en canales abiertos.
5. **Revisa los reportes a diario** al principio. Si algo legítimo se llega a frenar, todos los límites se pueden ajustar con variables de entorno.

## Variables opcionales (Render → Environment)

Los valores por omisión van entre paréntesis.

- **Conexión en vivo:** `SOCKET_BURST` (80), `SOCKET_RATE` (25), `SOCKET_ABUSE_DROPS` (300), `SOCKET_MAX_BYTES` (200000).
- **Conexiones:** `MAX_SOCKETS_PER_USER` (8), `MAX_SOCKETS_PER_IP` (100), `HANDSHAKES_PER_IP_PER_MIN` (120).
- **Peticiones e inicio de sesión:** `REST_BURST` (240), `REST_RATE` (6), `LOGIN_PER_SEC` (10).
- **Archivos:** `FILES_PER_HOUR` (60), `UPLOAD_MB_PER_DAY` (500).
- **Sin valor por omisión:** `PUSH_ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, `CSP_CONNECT_EXTRA`, `TRUST_CF`.
- **`CSP_MODE`:** `enforce`, `report-only` u `off`.
