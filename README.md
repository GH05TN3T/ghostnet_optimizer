# GhostNet Optimizer

Optimizador para Windows 10/11 al estilo Velotic: debloat, tweaks reversibles, modo gaming con medidores en vivo, planes de energía editables y limpieza. Uso personal. Hecho con **Tauri 2 + React/TypeScript + SCSS** y un backend en Rust que ejecuta PowerShell.

## Páginas

| Página | Qué hace |
|---|---|
| **Inicio** | Medidores en vivo (CPU, RAM, disco, GPU), red con ping y jitter, info del sistema, almacenamiento y acciones rápidas |
| **Gaming** | Modo juego (Máximo rendimiento + liberar RAM, y vuelve a tu plan al salir), juegos detectados de Steam/Epic/Rockstar/FiveM con optimización por juego (GPU dedicada, pantalla completa real, prioridad alta), ajustes de GPU por marca y ajustes para juegos |
| **Apps** | 78 apps con instalación y desinstalación en un clic vía winget, por categorías |
| **Debloat** | Detecta y desinstala ~48 apps preinstaladas (Copilot, OneDrive, Teams, Xbox, Clipchamp...) |
| **Limpieza** | Temporales, caché de Windows Update, volcados, shaders, navegadores, Discord, caché de FiveM, papelera y programas de inicio |
| **Optimización** | Puntuación 0–100, mantenimiento, tweaks recomendados por sección, resumen del sistema en vivo y "Aplicar todo" con punto de restauración |
| **Tweaks** | 66 interruptores en tarjetas por categoría, con "Detalles" que muestra exactamente qué cambia, revertir todo y aplicar recomendados |
| **Comprimir** | CompactOS, limpieza de WinSxS, quitar hiberfil.sys y el almacenamiento reservado |
| **Energía** | Planes de energía, estado en vivo, detalles del plan editables y ajustes adicionales (hibernación, inicio rápido, USB, PCIe) |

`Ctrl + K` abre el buscador de páginas y ajustes.

## Conseguir el .exe sin instalar nada (GitHub Actions)

1. Sube esta carpeta a un repositorio de GitHub (puede ser privado).
2. Pestaña **Actions** → **Compilar instalador** → **Run workflow**.
3. Cuando termine (~10 min la primera vez), descarga el artefacto **GhostNet-Optimizer-setup** (abajo del todo de la página de la compilación): es un zip con el instalador `.exe` dentro.

## Compilar en tu PC

Requisitos (una sola vez):

- [Node.js 20+](https://nodejs.org)
- [Rust](https://rustup.rs) (`rustup` con el toolchain MSVC)
- *Visual Studio Build Tools* con "Desarrollo para el escritorio con C++" (Rust lo pide al instalarse)
- WebView2 (ya viene con Windows 10/11 actualizado)

```bash
npm install
npm run app:dev     # modo desarrollo (abre la terminal como ADMINISTRADOR)
npm run app:build   # genera el instalador en src-tauri/target/release/bundle/nsis/
```

En desarrollo la app no pide administrador sola (Cargo no puede lanzar un exe elevado), por eso hay que abrir la terminal como administrador. La versión compilada pide permisos al abrirse.

## Estructura

```
src/                    React + TS
  pages/                Una página por sección
  components/           UI (toggle, medidores, paleta Ctrl+K...)
  lib/api.ts            Tipos y llamadas a Rust
  lib/store.tsx         Estado compartido (tweaks, medidores, toasts)
  styles/main.scss      Tema negro/blanco
src-tauri/
  tweaks.json           Catálogo de tweaks (edítalo para añadir los tuyos)
  src/ps.rs             Ejecuta PowerShell oculto (archivo .ps1 temporal)
  src/tweaks.rs         Genera los scripts de comprobar / aplicar / revertir
  src/bloat.rs          Catálogo de apps y desinstalación
  src/power.rs          powercfg
  src/cleanup.rs        Escaneo y borrado de basura
  src/startup.rs        Programas de inicio (mismo método que el Administrador de tareas)
  src/system.rs         Medidores, info del equipo, liberar RAM, punto de restauración
```

## Añadir un tweak

Añade un objeto a `src-tauri/tweaks.json`. Hay cuatro tipos de acción y se pueden combinar:

```jsonc
{
  "id": "mi_tweak",
  "name": "Nombre visible",
  "desc": "Qué hace y qué consecuencias tiene.",
  "category": "rendimiento",          // privacidad | interfaz | sistema | rendimiento | seguridad
  "recommended": false,               // entra en "Aplicar recomendados" y en la puntuación
  "reboot": false,                    // muestra la etiqueta "Requiere reinicio"
  "risk": "high",                     // opcional: etiqueta "Riesgo"
  "reg":   [{ "path": "HKCU\\...", "name": "Valor", "value": 0, "type": "DWord", "default": 1 }],
  "svc":   [{ "name": "Servicio", "start": "Disabled", "default": "Manual" }],
  "tasks": [{ "path": "\\Microsoft\\Windows\\...\\", "name": "Tarea" }],
  "ps":    { "check": "...", "apply": "...", "revert": "..." }
}
```

- En `reg`, si no pones `default`, al revertir se **borra** el valor (vuelve al comportamiento por defecto de Windows).
- `check` debe devolver `$true` cuando el tweak está aplicado.
- `cargo test` (dentro de `src-tauri`) comprueba que el JSON es válido y que los scripts generados tienen llaves y comillas equilibradas.

## Seguridad

- Todo se ejecuta en local; la app no se conecta a Internet.
- El frontend solo envía IDs; los scripts están dentro del binario.
- La limpieza nunca toca rutas relativas o cortas (si falta una variable de entorno, la categoría se salta) y se salta los archivos en uso.
- No cierra procesos críticos de Windows (csrss, lsass, svchost, dwm...).
- La categoría **Seguridad** pide confirmación antes de mostrarse.
