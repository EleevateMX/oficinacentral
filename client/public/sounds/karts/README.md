# Sonidos de Karts de oficina (opcional)

El juego genera todos sus sonidos con WebAudio, así que esta carpeta puede quedarse vacía.
Si quieres cambiar alguno por un archivo propio (con licencia libre o hecho por ustedes):

1. Copia aquí los archivos (`.ogg`, `.mp3`, `.wav` o `.m4a`).
2. Crea `sounds.json` en esta misma carpeta con el nombre de cada sonido y su archivo:

```json
{
  "engine": "motor.ogg",
  "boost": "turbo.ogg",
  "finish": "meta.mp3"
}
```

Los que no pongas se siguen generando. Nombres que se pueden reemplazar:

| Nombre | Cuándo suena |
| --- | --- |
| `engine` | Motor (se repite en bucle; el tono sube con la velocidad) |
| `beep`, `go` | Cuenta regresiva y salida |
| `boost`, `mini1`, `mini2` | Turbo del piso y mini turbo del derrape (nivel 1 y 2) |
| `tier` | Cuando el derrape sube de nivel |
| `wall`, `bump` | Choque con la barrera y con otro kart |
| `jump`, `land` | Salto en una rampa y aterrizaje |
| `box`, `roulette`, `item` | Caja de objeto, ruleta y objeto listo |
| `cafe`, `grapa`, `postit`, `hit` | Usar café, disparar una grapa, dejar un post-it y que te peguen |
| `lap`, `final`, `finish` | Vuelta, vuelta final y meta |
| `wrong` | Sentido contrario |

No hay música a propósito: solo el ambiente de la oficina.
