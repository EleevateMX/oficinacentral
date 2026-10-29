# Sonidos de Zombies en la oficina (opcional)

El juego ya trae sonidos hechos por código. Si quieres usar audios propios (por ejemplo, de tu licencia de Motion Array), ponlos en esta carpeta y enlístalos en `sounds.json`. Los que no estén en la lista siguen sonando con los de código.

1. Copia aquí los archivos (`.mp3`, `.ogg`, `.wav`, `.m4a` o `.webm`). Usa nombres sin espacios ni acentos.
2. Edita `sounds.json`: cada nombre de sonido va con un archivo o con una lista. Si hay varios, el juego escoge uno al azar cada vez.
3. Vuelve a publicar la oficina (los archivos van con la app, así que no hace falta tocar permisos).

```json
{
  "groan": ["groan1.mp3", "groan2.mp3", "groan3.mp3"],
  "roar": "roar.mp3",
  "ambient": "ambient.mp3",
  "stapler": "shot-stapler.mp3"
}
```

## Nombres que usa el juego

| Nombre | Cuándo suena |
| --- | --- |
| `groan` | Quejidos de los zombis (suenan desde donde está cada uno) |
| `roar` | Rugido de un jefe y aviso de horda de jefe |
| `ambient` | Fondo en bucle (se repite sin fin; mejor si es largo y sin cortes) |
| `heartbeat` | Latido durante las hordas de jefe |
| `step` | Tus pasos |
| `stapler` | Disparo de la grapadora |
| `shotgun` | Disparo de la escopeta de café |
| `nail` | Disparo de la clavadora |
| `reload` | Recargar |
| `empty` | Sin balas |
| `hitmark` | Le diste a un zombi |
| `splat` | Zombi derrotado |
| `bossdie` | Jefe derrotado |
| `hurt` | Te pegaron |
| `slam` | Golpe al piso del jefe |
| `spit` | Escupitajo de café |
| `paper` | Hojas de la impresora |
| `pick` | Recoger botín o levantar a un compañero |
| `buy` | Compra en la tienda |
| `horn` | Empieza una horda |
| `clear` | Horda superada |
| `gameover` | Fin de la partida |

Consejos: archivos cortos (menos de 2 s, salvo `ambient`), sin silencio al inicio y a volumen parecido entre sí. El volumen general y el de efectos se ajustan en **Opciones** dentro del juego.
