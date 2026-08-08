# 📅 Mi Horario

Página web que aísla **solo tu horario** a partir de una foto/captura que contiene los horarios de varios compañeros, y te lo ordena en una vista de calendario semanal.

## Cómo funciona

1. **Escribe tu nombre** en el paso 1.
2. **Sube una captura** del horario completo (puede incluir a tus compañeros).
3. **Reconocer (OCR):** la imagen se lee en tu navegador con [Tesseract.js](https://tesseract.projectnaptha.com/). No se envía nada a ningún servidor.
4. **Revisa el texto** detectado (el OCR no es 100% perfecto) y pulsa **Generar mi calendario**.
5. La app detecta automáticamente **las líneas que contienen tu nombre**, extrae día y hora, y solo con eso arma tu calendario semanal.
6. Pulsa una clase para **editarla**, arrástrala a otro día para **moverla** o usa **×** para quitarla; todo se guarda en tu navegador (Esc cancela una edición).

## Guardar / respaldar

- Los datos quedan guardados en el almacenamiento del navegador (`localStorage`).
- Pulsa **💾 Exportar** para descargar un archivo `mi-horario-AAAAMMDD.json` que puedes subir y guardar en este repositorio como respaldo.
- **📂 Importar** restaura un horario desde un JSON guardado.

## Publicar gratis en GitHub Pages

1. Sube estos archivos a un repositorio o crea tu propio fork.
2. En el repo: **Settings → Pages → Deploy from a branch → `main` / root**.
3. Tu horario quedará en `https://<usuario>.github.io/<repo>/`.

## Avisos

- El OCR de capturas funciona mejor con **imágenes nítidas** y con la tabla al derecho.
- Los horarios con estructura de tabla (cada celda con clase) se detectan mejor que las listas con columnas muy apretadas; si algo falla, corrige el texto en el paso 3 o añade/editita a mano en el calendario.

## ¿Por qué se aisla solo lo tuyo?

Una vez pones tu nombre, el filtro `state.name` se usa para detectar en el texto OCR solamente las líneas que contienen ese nombre. Las de tus compañeros se ignoran por completo.

## Personalizar

Abre `app.js` y busca `DAYS`, `colorClass` o `parseSchedule` para ajustar los nombres de los días, los colores de las clases o la lógica de detección.

## Tests

`node tests/schedule.test.js` comprueba el parseo del texto OCR (celdas, nombre en línea vecina, horas pegadas, formato de horas) y la saneación de datos importados.