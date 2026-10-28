# Login animado con pingüino

Proyecto demostrativo hecho con HTML, CSS y JavaScript puro. No requiere npm ni compilación.

## Ejecutar
1. Descomprime la carpeta.
2. Abre `index.html` en un navegador, o sirve la carpeta con una extensión de servidor local.
3. Prueba el campo de contraseña y el botón del ojo.

## Animaciones incluidas
- Respiración y balanceo continuo.
- Contraseña enfocada: el pingüino se tapa los ojos.
- Mostrar contraseña: se asoma con un ojo.
- Validación del formulario: expresión de sorpresa.
- Accesibilidad: respeta `prefers-reduced-motion`.

## Importante
Es una demo visual: no autentica usuarios y no envía credenciales. En `script.js`, reemplaza el bloque de demostración por una petición a tu backend HTTPS. Valida también en el servidor, usa sesiones seguras o tokens según tu arquitectura, y nunca guardes contraseñas en texto plano.

## Usar tu personaje original
El personaje actual está construido con CSS para que el proyecto funcione inmediatamente. Para conservar con exactitud tu diseño profesional, prepara PNG/WebP transparentes separados para `idle`, `cover`, `peek`, `surprised` y `success`, o un spritesheet con los fotogramas. Después se puede reemplazar el dibujo CSS por una capa de imágenes, manteniendo las mismas transiciones de JavaScript.
