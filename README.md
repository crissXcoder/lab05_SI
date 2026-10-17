# Laboratorio 5: UNA Chat Seguro (Seguridad Informática)

**Universidad Nacional de Costa Rica (UNA)**  
*Sede Regional Chorotega - Campus Nicoya*  
*Carrera: Ingeniería en Sistemas de Información*  
*Curso: Seguridad Informática*

---

## 📋 Resumen del Proyecto

Este proyecto implementa y fortalece la seguridad de la aplicación **UNA Chat** (Node.js, Express y Socket.IO), mitigando vulnerabilidades críticas de **Inyección de Scripts (Cross-Site Scripting - XSS)** y proporcionando soporte seguro para la previsualización e inserción de contenido multimedia (imágenes y videos de YouTube embebidos).

---

## 🛡️ Mejoras de Seguridad Implementadas

1. **Corrección de Referencias y Excepciones**:
   - Corrección en `libs/unalib.js` donde los métodos `is_valid_url_image` e `is_valid_yt_video` provocaban `ReferenceError` al invocar una variable `phone` no definida.
2. **Defensa en Profundidad contra Cross-Site Scripting (XSS)**:
   - Sanitización estricta de caracteres HTML reservados (`&`, `<`, `>`, `"`, `'`) en mensajes y nombres de usuarios.
   - Validación rigurosa de formato hexadecimal para colores.
   - Neutralización completa de vectores de inyección basados en tags `<script>`, `javascript:` pseudo-protocols y eventos en línea (ej. `onerror`, `onload`).
3. **Procesamiento Seguro de Multimedia**:
   - Validación de URLs de imágenes mediante la API nativa `URL` verificando extensiones válidas (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`, `.avif`).
   - Validación y extracción exacta del identificador de video (11 caracteres alfanuméricos) en URLs de YouTube (`watch?v=`, `youtu.be/`, `embed/`, `shorts/`).
   - Generación controlada de etiquetas seguras `<img>` e `<iframe>` con atributos protectores (`loading="lazy"`, `allowfullscreen`, sandboxing).

---

## 🧪 Suites de Pruebas Automatizadas

El proyecto cuenta con **tres niveles de pruebas**:

### 1. Pruebas Unitarias (`Mocha`)
Valida de forma aislada las funciones del módulo `libs/unalib.js`:
```bash
npm run test:unit
```

### 2. Pruebas de Integración (`Jest` & `Supertest` & `Socket.IO`)
Valida la integración real entre el backend Node.js (rutas HTTP REST y sockets en tiempo real) y la librería `una-lib`:
```bash
npm run test:integration
```

### 3. Pruebas End-to-End (`Playwright`)
Automatiza el flujo completo de un usuario real en el navegador Chromium, comprobando:
- Envío y renderizado visual completo de URLs de imagen.
- Envío y carga del reproductor embebido de YouTube.
- Detección activa mediante `page.on("dialog")` verificando que un ataque XSS no active ninguna alerta `alert()` y el mensaje se neutralice de forma segura.
```bash
npm run test:e2e
```

### Ejecutar todas las suites:
```bash
npm run test:all
```

---

## 📸 Evidencias del Laboratorio

Las capturas de cada fase se encuentran organizadas en la carpeta `evidencias/` tanto en formato `.png` como en `.jpg`:
- `evidencia_1_script_injection.jpg`: Reproducción del ataque XSS con alert antes de la solución.
- `evidencia_2_pruebas_unitarias.jpg`: Ejecución aprobada de la suite completa de pruebas unitarias.
- `evidencia_3_pruebas_integracion.jpg`: Ejecución aprobada de la suite de pruebas de integración con Jest y Supertest.
- `evidencia_4_pruebas_e2e.jpg`: Ejecución aprobada de las pruebas End-to-End con Playwright en Chromium.
- `evidencia_4_chat_visual.jpg`: Captura del chat en funcionamiento con imagen, video y payload sanitizado.
