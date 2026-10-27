# Montar Nuvora en un VPS con Docker

Guía para dejar la oficina en línea 24/7 sin depender de una PC física.
Todo corre en un solo servidor:

- **app**: la oficina (web, chat, mapa, base de datos SQLite).
- **caddy**: HTTPS automático con certificado gratis (Let's Encrypt). Es obligatorio para usar micrófono y cámara.
- **coturn**: servidor TURN. Retransmite audio/video cuando la red de alguien bloquea la conexión directa.

Tiempo estimado: 30–45 minutos la primera vez.

> ¿Solo quieres una versión de pruebas (dev) rápida? Ve a **[Versión de pruebas en Railway](#versión-de-pruebas-en-railway)** al final.

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
| `OFFICE_NAME`, `OFFICE_THEME` | `GTAHUB`, `gtahub` | nombre y tema iniciales; luego se cambian desde la app |

---

## 6. Encender

```bash
docker compose up -d --build
docker compose ps          # los 3 servicios deben estar "running" / "healthy"
docker compose logs -f app # Ctrl+C para salir
```

Abre `https://oficina.gtahub.gg`, entra con `admin` y la contraseña de `ADMIN_PASSWORD`, y:

1. Cambia tu contraseña en **Preferencias → Cuenta**.
2. En **Preferencias → Marca de la oficina** elige el tema (Nuvora, GTAHUB o personalizado) y sube el logo si quieres.
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

- La app crea **un respaldo diario** de la base de datos y guarda los últimos 14 (`BACKUP_KEEP`).
- Respaldo manual en cualquier momento: `docker compose exec app node server/cli/backup.js`
- Ver respaldos: `docker compose exec app ls -lh /data/backups`
- **Llévate copias fuera del servidor** (desde tu computadora):

  ```bash
  ./deploy/backup-download.sh root@IP-DEL-VPS
  ```

  Además, activa los *snapshots/backups* del proveedor (en Hetzner cuesta ~20 % extra del precio del servidor).

### Restaurar un respaldo

```bash
cd ~/oficinacentral
docker compose stop app
docker compose run --rm --entrypoint sh app -c "cp /data/backups/office-AAAA-MM-DD....db /data/office.db && rm -f /data/office.db-wal /data/office.db-shm"
docker compose start app
```

---

## 9. Comandos útiles

| Para… | Comando |
| --- | --- |
| Ver estado | `docker compose ps` |
| Ver errores | `docker compose logs --tail=100 app` |
| Reiniciar | `docker compose restart app` |
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
   | `OFFICE_NAME` | `GTAHUB` |
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

**Respaldos:** el respaldo diario se guarda dentro del volumen (`/data/backups`). Para bajarlo, usa *Volume → Backups* de Railway
o el comando `npm run backup` desde una consola del servicio.


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
