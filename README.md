# Optimizador

Optimizador para Windows 10/11 al estilo Velotic: debloat, tweaks reversibles, modo gaming con medidores en vivo, planes de energía editables y limpieza. Uso personal. Hecho con **Tauri 2 + React/TypeScript + SCSS** y un backend en Rust que ejecuta PowerShell.

## Páginas

| Página | Qué hace |
|---|---|
| **Inicio** | Medidores de CPU/RAM/GPU, gráficos de CPU y red, unidades, ficha del equipo, liberar RAM, punto de restauración |
| **Optimización** | Puntuación del PC (0–100), recomendaciones con botón de aplicar una por una, y "Optimizar todo" (crea antes un punto de restauración) |
| **Tweaks** | 63 interruptores en Privacidad, Interfaz, Sistema, Rendimiento y Seguridad (riesgo). Cada uno lee el estado real de Windows y se puede revertir |
| **Debloat** | Detecta y desinstala ~48 apps preinstaladas (Copilot, OneDrive, Teams, Xbox, Clipchamp, promocionales...) |
| **Gaming** | Medidores en vivo, uso por núcleo, procesos que más RAM usan (con botón de cerrar), ajustes para juegos y **Modo juego** (Máximo rendimiento + liberar RAM; al salir vuelve tu plan anterior) |
| **Energía** | Planes de energía, añadir Máximo rendimiento, y editar sus ajustes (CPU mín/máx, turbo, suspensión, USB, PCIe) con vista previa antes de guardar |
| **Limpieza** | Temporales, caché de Windows Update, volcados, shaders, navegadores, Discord, **caché de FiveM**, papelera; programas de inicio; CompactOS y limpieza de WinSxS |

`Ctrl + K` abre el buscador de páginas y ajustes.

## Conseguir el .exe sin instalar nada (GitHub Actions)

1. Sube esta carpeta a un repositorio de GitHub (puede ser privado).
2. Pestaña **Actions** → **Compilar instalador** → **Run workflow**.
3. Cuando termine (~10 min la primera vez), descarga el artefacto **Optimizador-setup**: dentro está el instalador `.exe`.

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
