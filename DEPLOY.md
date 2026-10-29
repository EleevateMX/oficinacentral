# Montar Nuvora en un VPS con Docker

Guía para dejar la oficina en línea 24/7 sin depender de una PC física.
Todo corre en un solo servidor:

- **app**: la oficina (web, chat, mapa, base de datos SQLite).
- **caddy**: HTTPS automático con certificado gratis (Let's Encrypt). Es obligatorio para usar micrófono y cámara.
- **coturn**: servidor TURN. Retransmite audio/video cuando la red de alguien bloquea la conexión directa.

Tiempo estimado: 30–45 minutos la primera vez.

> ¿Sin servidor propio? Usa **[Render](#render-producción-sin-servidor-propio)** (recomendado) o **[Railway](#versión-de-pruebas-en-railway)**.

---

## 1. Qué necesitas

1. **Un VPS con Ubuntu 24.04**, mínimo 2 CPU y 4 GB de RAM (alcanza para ~30 personas). Opciones:
   - Hetzner Cloud **CX22** (~4–5 EUR/mes) — buena relación precio/calidad.
   - DigitalOcean / Vultr / Linode (~6–12 USD/mes) — tienen centros de datos en EE. UU., más cerca de México.
   > Para un equipo en México conviene un centro de datos en EE. UU. (Dallas, Ashburn, Hillsboro, Miami): menos retraso en las llamadas.
2. **Un dominio o subdominio**, por ejemplo `oficina.gtahub.gg`.
3. **Acceso al repositorio** desde el servidor (ver paso 4).

---

## 2. Apuntar el dominio al servidor

En el panel DNS de tu dominio crea un registro:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| A | `oficina` | la IP pública del VPS |

Espera unos minutos y comprueba desde tu computadora: `ping oficina.gtahub.gg` debe responder con la IP del VPS.

---

## 3. Preparar el servidor

Conéctate por SSH (`ssh root@IP-DEL-VPS`) y ejecuta:

```bash
# Actualizar e instalar Docker
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# Firewall: solo los puertos necesarios
apt install -y ufw git
```

> **Importante:** algunos proveedores (Hetzner, DigitalOcean, AWS…) tienen además un *firewall en su panel web*.
> Si lo usas, abre ahí los mismos puertos: 22, 80, 443 (TCP y UDP), 3478 (TCP y UDP) y 49160–49200 (UDP).

---

## 4. Descargar el código

El repositorio es privado, así que el servidor necesita permiso de lectura. La forma más segura es una **deploy key**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oficina -N ""
cat ~/.ssh/oficina.pub
```

Copia esa línea en GitHub → repositorio `oficinacentral` → **Settings → Deploy keys → Add deploy key** (solo lectura). Luego:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-oficina
  HostName github.com
  IdentityFile ~/.ssh/oficina
EOF

git clone git@github-oficina:EleevateMX/oficinacentral.git ~/oficinacentral
cd ~/oficinacentral
bash deploy/firewall.sh
```

---

## 5. Configurar

```bash
cp .env.example .env
openssl rand -hex 32        # copia el resultado para TURN_SECRET
nano .env
```

Rellena:

| Variable | Ejemplo | Nota |
| --- | --- | --- |
| `DOMAIN` | `oficina.gtahub.gg` | el dominio del paso 2 |
| `PUBLIC_IP` | `203.0.113.10` | IP pública del VPS |
| `ADMIN_PASSWORD` | (una contraseña larga) | solo se usa la primera vez |
| `TURN_SECRET` | (lo de `openssl rand -hex 32`) | no lo compartas |
| `OFFICE_NAME`, `OFFICE_THEME` | `HUB`, `gtahub` | nombre y tema iniciales; luego se cambian desde la app |

---

## 6. Encender

```bash
docker compose up -d --build
docker compose ps          # los 3 servicios deben estar "running" / "healthy"
docker compose logs -f app # Ctrl+C para salir
```

Abre `https://oficina.gtahub.gg`, entra con `admin` y la contraseña de `ADMIN_PASSWORD`, y:

1. Cambia tu contraseña en **Preferencias → Cuenta**.
2. En **Preferencias → Marca de la oficina** elige el tema (Nuvora, HUB o personalizado) y sube el logo si quieres.
3. Edita tu perfil (nombre, foto, avatar).
4. Invita al equipo desde **Invitar personas** (o Preferencias → Miembros → Invitaciones). Cada enlace sirve una vez.

### Probar que las llamadas funcionan

Entra con dos personas desde redes distintas (por ejemplo, una con datos del celular), acércate en el mapa y enciende micrófono/cámara.
Si una red bloquea la conexión directa, TURN entra solo; no hay que hacer nada más.

---

## 7. Actualizar a una versión nueva

```bash
cd ~/oficinacentral
git pull
docker compose up -d --build
```

Los datos no se pierden: viven en el volumen `office-data`.

---

## 8. Respaldos

- La app crea **un respaldo diario** de la base de datos en `/data/backups` y guarda los últimos 14 (`BACKUP_KEEP`).
  Ese respaldo vive **en el mismo disco** que la base: si se pierde el servidor, se pierden los dos.
  Por eso conviene activar los [respaldos fuera del servidor](#respaldos-fuera-del-servidor-cloudflare-r2).
- Respaldo manual en cualquier momento: `docker compose exec app node server/cli/backup.js`
- Ver respaldos (locales y en el bucket): `docker compose exec app node server/cli/backup.js --list`
- Copiarlos a tu computadora por SSH (alternativa sin bucket):

  ```bash
  ./deploy/backup-download.sh root@IP-DEL-VPS
  ```

  Además, activa los *snapshots/backups* del proveedor (en Hetzner cuesta ~20 % extra del precio del servidor).

### Respaldos fuera del servidor (Cloudflare R2)

Con `BACKUP_S3_*` configurado, después de cada respaldo diario la app:

1. comprime el respaldo (`.db.gz`) y lo sube a `<bucket>/nuvora/office-<fecha>.db.gz`;
2. sube los **adjuntos del chat** (`/data/uploads`) a `<bucket>/nuvora/uploads/<id>`. Cada adjunto se sube **una sola vez**:
   la app pregunta al bucket cuáles ya tiene y solo manda los nuevos. Los adjuntos no se borran del bucket;
3. borra del bucket los respaldos de la base más viejos, dejando los últimos 30 (`BACKUP_S3_KEEP`).
   Solo toca archivos `office-*.db.gz` directamente dentro del prefijo.

Si la subida falla (sin internet, llave equivocada…) lo reintenta 4 veces con espera creciente (2, 4, 8 y 16 s), lo anota en
el registro (`docker compose logs app | grep respaldo`) y **la app sigue funcionando**; el respaldo local queda igual y
se vuelve a intentar al día siguiente. Funciona con cualquier almacenamiento compatible con S3 (Cloudflare R2, AWS S3,
Backblaze B2, MinIO), sin dependencias extra. R2 y S3 cifran los archivos guardados (*encryption at rest*) de forma automática.

**Configurarlo con Cloudflare R2** (10 GB gratis al mes, sin costo por descargar):

1. En el panel de Cloudflare: **R2 Object Storage → Create bucket**. Nombre, p. ej. `nuvora-respaldos`.
   Déjalo **privado** (no actives el acceso público ni un dominio público).
2. **R2 → Manage API tokens → Create API token** (*Account API token* o *User API token*):
   - Permisos: **Object Read & Write**.
   - *Specify bucket(s)*: **solo** `nuvora-respaldos`.
   - Crea el token y copia **Access Key ID** y **Secret Access Key** (el secreto solo se muestra una vez).
   - Copia también el endpoint S3: `https://<accountid>.r2.cloudflarestorage.com` (aparece en la misma pantalla y en
     *R2 → Overview → Account ID*).
3. En el `.env` del servidor:

   ```bash
   BACKUP_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
   BACKUP_S3_BUCKET=nuvora-respaldos
   BACKUP_S3_ACCESS_KEY=<Access Key ID>
   BACKUP_S3_SECRET_KEY=<Secret Access Key>
   BACKUP_S3_REGION=auto        # en R2 siempre "auto"
   BACKUP_S3_PREFIX=nuvora/     # carpeta dentro del bucket
   BACKUP_S3_KEEP=30            # respaldos de la base que se conservan en el bucket
   ```

   (En Railway, pon las mismas variables en *Variables*.)
4. Aplica los cambios y prueba un respaldo a mano:

   ```bash
   docker compose up -d
   docker compose exec app node server/cli/backup.js           # debe decir "Subido fuera del servidor: …"
   docker compose exec app node server/cli/backup.js --list    # muestra los respaldos del bucket (s3:…)
   ```

   En el panel de R2 verás la carpeta `nuvora/`. Si algo falla, el mensaje dice el motivo (p. ej. `403 SignatureDoesNotMatch`
   = secreto equivocado; `403 AccessDenied` = el token no tiene permiso sobre ese bucket).

Otros proveedores: **AWS S3** `BACKUP_S3_ENDPOINT=https://s3.<región>.amazonaws.com` y `BACKUP_S3_REGION=<región>`;
**Backblaze B2** `https://s3.<región>.backblazeb2.com` (la región va en el endpoint, p. ej. `us-west-004`);
**MinIO** la URL de tu servidor (`https://minio.tudominio.com`) y `BACKUP_S3_REGION=us-east-1`.

**Estado del último respaldo:** se guarda en `/data/backups/estado.json` (hora, tamaño, si la subida salió bien o el error).

### Restaurar un respaldo

`npm run restore` (o `node server/cli/restore.js`) acepta:

| Argumento | Restaura… |
| --- | --- |
| `--latest` | el más reciente del bucket (o el local más reciente si no hay `BACKUP_S3_*`) |
| `s3:nuvora/office-AAAA-MM-DDT….db.gz` | ese objeto del bucket (también vale solo el nombre, sin `nuvora/`) |
| `/data/backups/office-….db` o un `.db.gz` | ese archivo (si pones solo el nombre, lo busca en `/data/backups`) |

Qué hace, en orden:

1. **Se niega a correr si la app está encendida**: revisa el candado `/data/servidor.lock` (la app lo renueva cada 30 s y lo
   borra al apagarse; se ignora si tiene más de 2 minutos) y si responde `http://127.0.0.1:$PORT/api/health`.
   `--force` lo salta (ver Railway abajo).
2. Descarga/descomprime el respaldo y lo verifica con `PRAGMA integrity_check`. Si está dañado, **no cambia nada**.
3. Guarda la base actual como `/data/office.db.antes-de-restaurar-<fecha>` (para deshacer, restaura ese archivo).
4. Reemplaza `office.db` (y borra `office.db-wal`/`-shm` de la base anterior).
5. Con `BACKUP_S3_*`, descarga los adjuntos del chat que falten en `/data/uploads` (`--sin-adjuntos` para omitirlo).
   Si esto falla, la base ya quedó restaurada: vuelve a correr el comando y solo bajará lo que falte.

En el VPS:

```bash
cd ~/oficinacentral
docker compose stop app
docker compose run --rm app node server/cli/restore.js --latest
# o un respaldo local concreto:
# docker compose run --rm app node server/cli/restore.js /data/backups/office-AAAA-MM-DDT....db
docker compose start app
```

### Probar que se puede restaurar

Un respaldo que nunca se probó no es un respaldo. Haz este simulacro cada cierto tiempo (p. ej. cada mes) **en tu computadora**,
sin tocar el servidor:

```bash
git clone <este repositorio> nuvora-simulacro && cd nuvora-simulacro
npm ci && npm run build

# Las mismas BACKUP_S3_* del servidor (puedes crear un token de R2 aparte con solo "Object Read").
export BACKUP_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
export BACKUP_S3_BUCKET=nuvora-respaldos
export BACKUP_S3_ACCESS_KEY=...   BACKUP_S3_SECRET_KEY=...

npm run backup -- --list                                    # ver qué hay en el bucket
DATA_DIR=./simulacro PORT=3999 npm run restore -- --latest  # baja el último, lo verifica y lo deja en ./simulacro

# Enciende una copia de la app con esos datos, en otro puerto y SIN subir respaldos al bucket:
DATA_DIR=./simulacro PORT=3999 BACKUP_EVERY_HOURS=0 BACKUP_S3_ENDPOINT= INSECURE_COOKIES=1 npm start
```

Abre `http://localhost:3999`, entra con tu usuario de siempre y revisa que estén los mensajes, el calendario y los adjuntos
recientes. Después borra la carpeta `./simulacro`. El mismo simulacro se puede hacer en el servidor contra una copia
(`DATA_DIR=/tmp/simulacro`), siempre con otro `PORT` y con `BACKUP_EVERY_HOURS=0`.

Las pruebas automáticas (`npm test`, `tests/backup.test.js`) repiten este camino contra un S3 falso: respaldo → subida →
limpieza → restauración → encender la app y entrar.

---

## 9. Comandos útiles

| Para… | Comando |
| --- | --- |
| Ver estado | `docker compose ps` |
| Ver errores | `docker compose logs --tail=100 app` |
| Reiniciar | `docker compose restart app` |
| Respaldo ahora / ver respaldos | `docker compose exec app node server/cli/backup.js` / `… backup.js --list` |
| Crear/recuperar un admin | `docker compose exec app node server/cli/create-admin.js usuario 'contraseña' "Nombre"` |
| Apagar todo | `docker compose down` (los datos se conservan) |

---

## Problemas comunes

- **El navegador dice que el sitio no es seguro / no carga**: revisa que el registro DNS apunte a la IP correcta y que los puertos 80 y 443 estén abiertos (también en el firewall del panel del proveedor). Mira `docker compose logs caddy`.
- **No se escucha a alguien**: revisa que tenga permiso de micrófono en el navegador y que los puertos 3478 y 49160–49200/UDP estén abiertos. Mira `docker compose logs coturn`.
- **Olvidé la contraseña del admin**: usa el comando de “Crear/recuperar un admin”.


---

## Versión de pruebas en Railway

Sirve para que el equipo pruebe antes de producción. El repositorio ya trae `railway.json` (usa el `Dockerfile` y revisa `/api/health`).

1. En Railway: **New Project → Deploy from GitHub repo** y elige este repositorio. En *Settings → Source* elige la rama que quieras probar.
2. **Disco persistente** (si no, la base de datos se borra en cada actualización): *Add Volume* montado en **`/data`**.
3. **Variables** (*Variables*):

   | Variable | Valor |
   |---|---|
   | `OFFICE_NAME` | `HUB` |
   | `OFFICE_THEME` | `gtahub` |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_PASSWORD` | una contraseña larga (solo se usa la primera vez) |
   | `TRUST_PROXY` | `1` (Railway pone un proxy delante) |
   | `RAILWAY_RUN_UID` | `0` (para poder escribir en el volumen) |
   | `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` | ver el paso 5 |

4. *Settings → Networking → Generate Domain*. Railway da HTTPS, que es obligatorio para micrófono, cámara y compartir pantalla.
5. **Audio, video y pantalla entre redes distintas.** Railway no deja pasar UDP, así que no puede correr `coturn`.
   Sin TURN, la voz y la pantalla funcionan entre la mayoría de las casas, pero pueden fallar en redes de empresa, escuelas o datos móviles.
   La opción recomendada es el TURN de **Cloudflare** (tiene capa gratis):
   - En el panel de Cloudflare: *Realtime → TURN Server → Create*. Copia el **Turn Token ID** y el **API Token**.
   - Ponlos en `CF_TURN_KEY_ID` y `CF_TURN_API_TOKEN`. La app pide credenciales temporales sola y las renueva.
   - Alternativa: cualquier TURN con usuario fijo (p. ej. Metered) en `ICE_SERVERS` como JSON.
6. Entra con `admin` y la contraseña del paso 3. Invita al equipo desde **Preferencias → Miembros → Invitar a varias personas a la vez**.

**Varias transmisiones a la vez:** sin servidor de medios, cada pantalla viaja directo de persona a persona y quien comparte
envía una copia a cada espectador (funciona bien hasta ~6 personas viendo). Para más, usa **LiveKit Cloud** (tiene plan gratis):

1. Crea un proyecto en LiveKit Cloud y copia *URL* (`wss://…livekit.cloud`), *API Key* y *API Secret* (Settings → Keys).
2. En Railway agrega `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET` y vuelve a desplegar.
3. Listo: la app usa LiveKit en automático. Con LiveKit ya no hace falta el TURN de Cloudflare (LiveKit trae el suyo).

**Respaldos:** el respaldo diario se guarda dentro del volumen (`/data/backups`), en el mismo disco que la base.
- Configura las variables `BACKUP_S3_*` (ver [Respaldos fuera del servidor](#respaldos-fuera-del-servidor-cloudflare-r2)) para que
  cada respaldo y los adjuntos lleguen también a Cloudflare R2.
- Como complemento, activa los respaldos del volumen de Railway (*Volume → Backups*, con programación diaria o semanal):
  copian el disco entero, pero se quedan dentro de Railway y se borran si borras el servicio, por eso no reemplazan a R2.
- Desde una consola del servicio: `npm run backup` (respaldo ahora) y `npm run backup -- --list`.
- **Restaurar en Railway:** la consola corre junto a la app encendida, así que hace falta `--force` y reiniciar enseguida:
  `npm run restore -- --latest --force` y luego *Restart* del servicio. Lo que la app guarde entre ambos pasos se pierde
  (avisa al equipo antes); la base que había antes de restaurar queda en `office.db.antes-de-restaurar-<fecha>`.


---

## Servidor de medios LiveKit en el VPS (producción)

Recomendado cuando varias personas transmiten su pantalla a la vez. Cada quien sube su pantalla **una sola vez** y LiveKit la reparte;
además manda una versión ligera a quien tenga mala conexión.

1. En `.env`:
   ```bash
   LIVEKIT_URL=wss://oficina.tudominio.com     # tu mismo DOMAIN, con wss://
   LIVEKIT_API_KEY=$(openssl rand -hex 8)
   LIVEKIT_API_SECRET=$(openssl rand -hex 32)  # mínimo 32 caracteres
   ```
2. Abre los puertos: `sudo bash deploy/firewall.sh` (ya incluye `7881/tcp` y `50000-50200/udp`).
3. Enciende todo con el perfil de LiveKit:
   ```bash
   docker compose --profile livekit up -d --build
   ```
   Caddy pasa `/rtc` a LiveKit, así que no necesitas otro dominio ni otro certificado.
4. Comprueba en la app: al compartir pantalla, en `docker compose logs livekit` aparece `participant active`.

Para volver al modo directo, deja `LIVEKIT_URL` vacío y quita `--profile livekit`.


---

## Avisos de errores y caídas

1. **Errores** (la app falla, se reinicia o hay errores repetidos en el navegador de alguien):
   crea un webhook en un canal privado de Discord (*Editar canal → Integraciones → Webhooks → Nuevo*), copia la URL
   y ponla en `ALERT_WEBHOOK_URL`. También funciona con un webhook de Slack. Los avisos repetidos se agrupan (uno cada 10 minutos).
2. **Caídas** (el servidor completo deja de responder): la app no puede avisar si está apagada, así que usa un monitor externo
   gratuito como **UptimeRobot** o **Better Stack**:
   - Monitor HTTP(s) a `https://tu-dominio/api/health` cada 1–5 minutos (responde `{"ok":true,…}`).
   - Notificación al mismo canal de Discord (ambos servicios aceptan webhooks de Discord) o por correo/SMS.


---

## Render (producción sin servidor propio)

El repositorio trae `render.yaml` (Blueprint): servicio Docker, disco de 5 GB en `/data`, HTTPS, revisión de salud y publicación
solo cuando pasan las pruebas de GitHub. El audio y video van por **LiveKit Cloud** y los respaldos a **Cloudflare R2**.

1. En render.com inicia sesión con GitHub → **New → Blueprint** → elige `EleevateMX/oficinacentral` (rama `main`).
2. Render te pide las variables marcadas como `sync: false`: pega LiveKit, R2, el webhook de Discord y la app de Discord.
   `PUBLIC_URL` es tu dominio con `https://` (o el `onrender.com` mientras no tengas dominio).
3. **Apply**. La primera construcción tarda unos minutos. La contraseña inicial de `admin` está en
   *Environment → ADMIN_PASSWORD* (se generó sola).
4. Dominio propio: *Settings → Custom Domains → Add* `oficina.gtahub.gg` y crea en tu DNS el CNAME que te indique.
5. Si usas Entrar con Discord, agrega en Discord Developer Portal → OAuth2 → Redirects:
   `https://TU-DOMINIO/api/auth/discord/callback`.

### Bot de Discord en Render (opcional)

En *Environment* agrega (todas son opcionales; sin las dos primeras no pasa nada):

| Variable | Qué poner |
|---|---|
| `DISCORD_BOT_TOKEN` | Developer Portal → tu app → **Bot** → *Reset Token* |
| `DISCORD_GUILD_ID` | ID del servidor (Discord → Modo desarrollador → clic derecho al servidor → *Copiar ID*) |
| `DISCORD_PUBLIC_KEY` | Developer Portal → *General Information* → **Public Key** (para los botones de moderación) |
| `DISCORD_GATEWAY` | `1` para roles al instante (activa antes **Server Members Intent** en *Bot → Privileged Gateway Intents*) |
| `MOD_WEBHOOK_URL` | Webhook de un canal privado del equipo, por si no usas bot (reportes sin botones) |

1. Invita el bot con scope `bot` y los permisos Ver canales, Enviar mensajes, Insertar enlaces, Leer el historial y Gestionar mensajes
   (Gestionar canales es opcional, solo para cambiar el tema de un canal):
   `https://discord.com/oauth2/authorize?client_id=TU_CLIENT_ID&scope=bot&permissions=2251799813778448`
2. Con `DISCORD_PUBLIC_KEY` puesta y el servicio ya desplegado, en *General Information → Interactions Endpoint URL* pon
   `https://TU-DOMINIO/api/discord/interactions` y guarda (Discord manda una prueba firmada; si falla, revisa la llave y `PUBLIC_URL`).
3. Entra a **Preferencias → Discord**: mapea roles, elige el canal de cada aviso y usa "Personalizar canal".
   El token nunca se muestra en la app ni en los registros.

Notas: el plan con disco no puede tener varias instancias y cada actualización tiene unos segundos sin servicio (normal con SQLite).
El contenedor arranca como root solo para darle el disco al usuario `node` (`server/launch.js`) y luego baja privilegios.
