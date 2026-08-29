(function () {
  "use strict";

  var DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var DAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  var DAY_KEYS = ["D", "L", "M", "X", "J", "V", "S"];

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    name: $("my-name"),
    drop: $("dropzone"),
    file: $("file-input"),
    previewWrap: $("preview-wrap"),
    preview: $("preview"),
    ocrBtn: $("btn-ocr"),
    status: $("ocr-status"),
    stepText: $("step-text"),
    ocrText: $("ocr-text"),
    parseBtn: $("btn-parse"),
    stepCal: $("step-calendar"),
    week: $("week"),
    evTitle: $("ev-title"),
    evDay: $("ev-day"),
    evStart: $("ev-start"),
    evEnd: $("ev-end"),
    addBtn: $("btn-add"),
    exportBtn: $("btn-export"),
    importBtn: $("btn-import"),
    importInput: $("import-input"),
    printBtn: $("btn-print")
  };

  var state = { name: "", events: [] };
  var editingId = null;
  var lastWords = null; // { lines: [{text, words:[{text,bbox}]}], words:[{text,bbox}] }

  function uid() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function sanitize(events) {
    var out = [];
    (events || []).forEach(function (ev) {
      if (!ev || typeof ev.title !== "string") return;
      var day = parseInt(ev.day, 10);
      var start = parseInt(ev.start, 10);
      var end = parseInt(ev.end, 10);
      if (isNaN(day) || day < 0 || day > 6) return;
      if (isNaN(start) || isNaN(end) || start < 0 || end > 24 * 60 || start >= end) return;
      out.push({
        id: ev.id !== undefined && ev.id !== null ? ev.id : uid(),
        title: ev.title.trim() || "Clase",
        day: day,
        start: start,
        end: end,
        src: ev.src || ""
      });
    });
    return out;
  }

  /* ---------------- Persistencia ---------------- */

  function save() {
    try { localStorage.setItem("miHorario", JSON.stringify(state)); } catch (e) {}
  }

  function load() {
    try {
      var raw = localStorage.getItem("miHorario");
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.events)) {
          state.name = s.name || "";
          state.events = sanitize(s.events);
          els.name.value = state.name;
        }
      }
    } catch (e) {}
  }

  /* ---------------- Utilidades ---------------- */

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  function dayIndexOf(word) {
    var w = norm(word);
    var spans = [norm(DAYS[0]), norm("lun"), norm("mar"), norm("mie"), norm("jue"), norm("vie"), norm("sab")];
    var full = DAYS.map(norm);
    for (var i = 0; i < 7; i++) {
      if (w === full[i] || w === spans[i] || full[i].indexOf(w) === 0) return i;
    }
    return -1;
  }

  function colorClass(seed) {
    var h = 0, t = String(seed);
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 997;
    return "palette-" + (h % 7);
  }

  function timeToMin(t) {
    var m = /^(\d{1,2}):?(\d{2})?$/.exec(norm(t));
    if (!m) return null;
    var h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function timeRangeOf(line) {
    var m = /(\d{1,2}(?::\d{2})?)\s*(?:-|–|—|a|al|to|hasta|hrs)\s*(\d{1,2}(?::\d{2})?)/i.exec(line);
    if (!m) return null;
    var start = timeToMin(m[1]), end = timeToMin(m[2]);
    if (start === null || end === null) return null;
    if (end <= start) end += 12 * 60;
    return { start: start, end: end };
  }

  function dayTokenDay(s) {
    var found = -1;
    s.replace(/[a-záéíóúñü]{2,}/gi, function (w) {
      if (found === -1) found = dayIndexOf(w);
      return w;
    });
    return found;
  }

  /* ---------------- OCR ---------------- */

  function setStatus(msg, cls) {
    els.status.hidden = false;
    els.status.className = "status " + (cls || "info");
    els.status.textContent = msg;
  }

  els.drop.addEventListener("click", function () { els.file.click(); });
  els.drop.addEventListener("dragover", function (e) { e.preventDefault(); els.drop.classList.add("over"); });
  els.drop.addEventListener("dragleave", function () { els.drop.classList.remove("over"); });
  els.drop.addEventListener("drop", function (e) {
    e.preventDefault();
    els.drop.classList.remove("over");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  els.file.addEventListener("change", function () {
    if (els.file.files[0]) handleFile(els.file.files[0]);
  });

  function handleFile(f) {
    if (f.type.indexOf("image/") !== 0) {
      setStatus("Ese archivo no es una imagen.", "error");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      els.preview.src = reader.result;
      els.previewWrap.hidden = false;
      setStatus("Imagen cargada. Pulsa «Reconocer horario».", "info");
    };
    reader.readAsDataURL(f);
  }

  els.ocrBtn.addEventListener("click", function () {
    if (!els.preview.src) return;
    setStatus("Reconociendo texto… ⏳", "loading");
    els.ocrBtn.disabled = true;
    lastWords = null;
    Tesseract.recognize(els.preview.src, "spa+eng", {
      logger: function (m) {
        if (m.status === "recognizing text") setStatus("Reconociendo… " + Math.round(m.progress * 100) + "%", "loading");
      }
    }).then(function (r) {
      els.ocrText.value = r.data.text;
      lastWords = {
        text: r.data.text,
        words: (r.data.words || []).map(function (w) {
          var t = (w.text || "").trim();
          return t ? { text: t, x: w.bbox.x0, y: w.bbox.y0, x2: w.bbox.x1, y2: w.bbox.y1 } : null;
        }).filter(Boolean)
      };
      els.stepText.hidden = false;
      els.ocrBtn.disabled = false;
      setStatus("¡Texto listo! Revisa el paso 3 y corrige si hace falta.", "ok");
      els.stepText.scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (err) {
      els.ocrBtn.disabled = false;
      setStatus("Error al reconocer: " + err.message, "error");
    });
  });

  /* ---------------- Parseo ---------------- */

  els.parseBtn.addEventListener("click", function () {
    state.name = els.name.value.trim();
    if (!state.name) {
      setStatus("Escribe primero tu nombre en el paso 1.", "error");
      return;
    }
    var events;
    // 1) Intento reconstruir la tabla usando las coordenadas del OCR
    if (lastWords && lastWords.words.length) {
      events = parseTable(lastWords.words, state.name);
    }
    // 2) Si no, respaldo con el parseo de texto plano
    if (!events || !events.length) {
      events = parseSchedule(els.ocrText.value, state.name);
    }
    if (!events.length) {
      setStatus("No encontré clases con tu nombre («" + state.name + "») y una hora. Revisa el texto del paso 3.", "error");
      return;
    }
    state.events = events;
    renderWeek();
    save();
    els.stepCal.hidden = false;
    setStatus("Encontré " + events.length + " clase(s) tuya(s).", "ok");
    els.stepCal.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* Reconstruye una tabla a partir de las coordenadas de palabras del OCR.
     Estructura esperada:
       fila superior  -> nombres de los días (columnas)
       columna izq.   -> nombres de las personas (cada fila)
       resto          -> celdas con horas/clases
     Devuelve los eventos SOLO de la fila cuyo nombre coincide con `name`.
  */
  function parseTable(words, name) {
    var out = [];
    var seen = {};
    var normName = norm(name);
    if (!words || !words.length) return out;

    // ---- 1) Agrupar palabras en líneas por cercanía vertical ----
    var lineGroups = [];
    var used = words.map(function () { return false; });
    var i, j;

    for (i = 0; i < words.length; i++) {
      if (used[i]) continue;
      var group = [words[i]];
      used[i] = true;
      for (j = 0; j < words.length; j++) {
        if (i === j || used[j]) continue;
        var a = (words[i].y + words[i].y2) / 2;
        var b = (words[j].y + words[j].y2) / 2;
        if (Math.abs(a - b) <= 14) { group.push(words[j]); used[j] = true; }
      }
      group.sort(function (p, q) { return (p.x + p.x2) / 2 - (q.x + q.x2) / 2; });
      lineGroups.push(group);
    }
    lineGroups.sort(function (A, B) { return (A[0].y + A[0].y2) / 2 - (B[0].y + B[0].y2) / 2; });

    // ---- 2) Detectar la fila de encabezado y las columnas de días ----
    var dayCols = null; // [{day, cx, x0, x1}] ordenados por posición
    var headerY = null;
    var L, k;
    for (L = 0; L < lineGroups.length; L++) {
      var found = [];
      lineGroups[L].forEach(function (w) {
        var d = dayIndexOf(w.text);
        if (d >= 0) found.push({ day: d, cx: (w.x + w.x2) / 2, x0: w.x, x1: w.x2 });
      });
      if (found.length >= 2) {
        found.sort(function (a, b) { return a.cx - b.cx; });
        dayCols = found;
        headerY = lineGroups[L][0].y;
        break;
      }
    }

    // Sin encabezado de días no podemos saber las columnas.
    if (!dayCols) return out;

    // Límite izquierdo de la región de columnas de día: el inicio de la 1ª columna.
    var firstDayX = dayCols[0].x0;

    // Mitad del espaciado típico entre columnas, usado para encajar celdas en su columna.
    var halfColSpacing = 60;
    if (dayCols.length >= 2) {
      var spacing = dayCols[1].cx - dayCols[0].cx;
      halfColSpacing = Math.max(40, spacing / 2);
    }

    // ---- 3) Asignar las celdas de cada fila a su columna de día ----
    for (k = 0; k < lineGroups.length; k++) {
      var line = lineGroups[k];
      if (headerY !== null && line[0].y <= headerY + 8) continue;

      var leftNames = [];
      var cells = []; // {day, text}
      var sawDay = false;

      line.forEach(function (w) {
        var cx = (w.x + w.x2) / 2;
        // Si la palabra está claramente a la izquierda de la 1ª columna de día -> nombre
        if (w.x2 <= firstDayX) {
          leftNames.push(w.text);
          return;
        }
        // En caso de solaparse con el borde, resolver por centro respecto a la columna de día
        var day = -1;
        var best = -1, bestDist = Infinity;
        for (var c = 0; c < dayCols.length; c++) {
          var dist = Math.abs(cx - dayCols[c].cx);
          if (dist < bestDist) { bestDist = dist; best = c; }
        }
        // Solo cuenta como celda de día si el centro cae dentro de la mitad de su columna
        if (bestDist < halfColSpacing) { day = dayCols[best].day; }
        if (day >= 0) {
          cells.push({ day: day, text: w.text });
          sawDay = true;
        } else {
          // texto entre columnas: acumular en la columna anterior como parte de su celda
          leftNames.push(w.text);
        }
      });

      if (!sawDay) continue;
      var rowHasUser = norm(leftNames.join(" ")).indexOf(normName) !== -1;
      if (!rowHasUser) continue;

      // Agrupar palabras por columna -> texto de cada celda
      var cellText = {};
      cells.forEach(function (cl) {
        cellText[cl.day] = (cellText[cl.day] || "") + " " + cl.text;
      });
      Object.keys(cellText).forEach(function (dk) {
        var day = parseInt(dk, 10);
        var txt = cellText[dk].trim();
        var range = timeRangeOf(txt);
        if (day < 0 || day > 6 || !range) return;
        var start = range.start, end = range.end;
        var t = cleanTitle(txt, name);
        var key = day + "|" + start + "|" + t;
        if (seen[key]) return;
        seen[key] = true;
        out.push({ id: uid(), title: t, day: day, start: start, end: end, src: txt });
      });
    }

    return out;
  }

  function parseSchedule(text, name) {
    var lines = text.split(/\r?\n/);
    var n = lines.length;
    var out = [];
    var seen = {};
    var recentDay = -1;
    var normName = norm(name);

    function push(day, start, end, title, src) {
      if (day < 0 || day > 6) return;
      if (start === null || end === null) return;
      var key = day + "|" + start + "|" + title;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ id: uid(), title: title, day: day, start: start, end: end, src: src });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var dayHere = dayTokenDay(line);
      var range = timeRangeOf(line);
      var hasUser = norm(line).indexOf(normName) !== -1;

      // encabezado de columna (solo nombres de días, sin hora ni curso)
      if (dayHere >= 0 && !range && line.split(/\s+/).length <= 4) {
        recentDay = dayHere;
        continue;
      }

      // una celda de tabla tipo "08-10 Matemáticas Ana García" en la misma línea
      if (hasUser && range) {
        var day = dayHere >= 0 ? dayHere : recentDay;
        push(day, range.start, range.end, cleanTitle(line, name), line);
        continue;
      }

      // El nombre está en la línea anterior/final y la hora en esta (o a la inversa).
      // Solo cuando la línea vecina no contiene ya ella misma una hora válida,
      // para no mezclar con clases de otros.
      var prev = i > 0 ? lines[i - 1].trim() : "";
      var next = i < n - 1 ? lines[i + 1].trim() : "";

      function nameOnlyLine(l) {
        if (!l || l.split(/\s+/).length > 4) return false;
        if (timeRangeOf(l) || dayTokenDay(l) >= 0) return false;
        return norm(l).indexOf(normName) !== -1;
      }

      var prevName = nameOnlyLine(prev);
      var nextName = nameOnlyLine(next);

      if (range && (prevName || nextName)) {
        var merged = (prevName ? prev : "") + " " + (nextName ? next : "") + " " + line;
        var srcLine = (prevName ? prev + " / " : "") + line + (nextName ? " / " + next : "");
        push(dayHere >= 0 ? dayHere : recentDay, range.start, range.end, cleanTitle(merged, name), srcLine);
      }
    }
    return out;
  }

  function cleanTitle(line, name) {
    var t = line;
    t = t.replace(/(domingo|lunes|martes|miércoles|jueves|viernes|sábado|mi[é]*r|vie|mar|lun|jue|sab|dom)/gi, " ");
    t = t.replace(/\d{1,2}(?::\d{2})?\s*(?:-|–|—|a|al|to|hasta)\s*\d{1,2}(?::\d{2})?/gi, " ");
    t = t.replace(/\s*[-–—]\s*/g, " ");
    t = t.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
    t = t.replace(/^[\s,.\-–:]+|[\s,.\-–:]+$/g, "");
    t = t.replace(/\s+/g, " ").trim();
    return t || name;
  }

  /* ---------------- Render semana ---------------- */

  function renderWeek() {
    els.stepCal.hidden = false;
    var today = new Date().getDay();

    var html = "";
    html += '<div class="corner day-head">Hora</div>';
    for (var d = 0; d < 7; d++) {
      html += '<div class="day-head' + (d === today ? " today" : "") + '">' + DAYS_SHORT[d] + "</div>";
    }
    for (var d2 = 0; d2 < 7; d2++) {
      html += '<div class="day-col" data-day="' + d2 + '" id="col-' + d2 + '"></div>';
    }
    els.week.innerHTML = html;

    var cols = [];
    for (var c = 0; c < 7; c++) {
      cols.push($("col-" + c));
    }

    cols.forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drop-hover"); });
      col.addEventListener("dragleave", function () { col.classList.remove("drop-hover"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("drop-hover");
        var id = e.dataTransfer.getData("text/plain");
        if (!id) return;
        var targetDay = parseInt(col.getAttribute("data-day"), 10);
        if (isNaN(targetDay)) return;
        state.events.forEach(function (ev) {
          if (String(ev.id) === String(id)) ev.day = targetDay;
        });
        save();
        renderWeek();
      });
    });

    state.events.forEach(function (ev) {
      if (ev.day < 0 || ev.day > 6) return;
      var div = document.createElement("div");
      div.className = "event cls " + colorClass(ev.title);
      div.style.height = Math.max(34, (ev.end - ev.start) / 12 * 14 + 14) + "px";
      div.draggable = true;
      div.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", String(ev.id));
        e.dataTransfer.effectAllowed = "move";
      });

      var x = document.createElement("span");
      x.className = "ev-x";
      x.textContent = "×";
      x.title = "Eliminar";
      x.addEventListener("click", function (e) {
        e.stopPropagation();
        state.events = state.events.filter(function (it) { return it !== ev; });
        if (editingId === ev.id) {
          editingId = null;
          els.addBtn.textContent = "＋";
          els.evTitle.value = "";
        }
        renderWeek();
        save();
      });

      var lbl = document.createElement("div");
      lbl.textContent = fmt(ev.start) + "–" + fmt(ev.end) + "  " + ev.title;
      lbl.addEventListener("click", function (e) {
        e.stopPropagation();
        editingId = ev.id;
        els.evTitle.value = ev.title;
        els.evDay.value = ev.day;
        els.evStart.value = fmt(ev.start);
        els.evEnd.value = fmt(ev.end);
        els.addBtn.textContent = "✓ Guardar";
        els.addBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });

      div.appendChild(x);
      div.appendChild(lbl);
      cols[ev.day].appendChild(div);
    });
  }

  function fmt(t) {
    var h = Math.floor(t / 60), m = t % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  /* ---------------- Añadir / editar ---------------- */

  els.addBtn.addEventListener("click", function () {
    var title = els.evTitle.value.trim();
    if (!title) return;
    var day = parseInt(els.evDay.value, 10);
    var start = timeToMin(els.evStart.value);
    var end = timeToMin(els.evEnd.value);
    if (start === null) start = 8 * 60;
    if (end === null) end = 10 * 60;
    if (end <= start) end = start + 60;

    if (editingId !== null) {
      state.events.forEach(function (ev) {
        if (String(ev.id) === String(editingId)) {
          ev.title = title;
          ev.day = day;
          ev.start = start;
          ev.end = end;
        }
      });
      editingId = null;
    } else {
      var exists = state.events.some(function (ev) {
        return norm(ev.title) === norm(title) && ev.day === day && ev.start === start && ev.end === end;
      });
      if (!exists) {
        state.events.push({ id: uid(), title: title, day: day, start: start, end: end });
      }
    }
    els.addBtn.textContent = "＋";
    els.evTitle.value = "";
    renderWeek();
    save();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && editingId !== null) {
      editingId = null;
      els.addBtn.textContent = "＋";
      els.evTitle.value = "";
    }
  });

  els.importBtn.addEventListener("click", function () { els.importInput.click(); });
  els.importInput.addEventListener("change", function () {
    if (!els.importInput.files[0]) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var s = JSON.parse(r.result);
        if (s && Array.isArray(s.events)) {
          state.name = s.name || state.name;
          state.events = sanitize(s.events);
          save();
          renderWeek();
          els.stepCal.hidden = false;
          setStatus("Horario importado correctamente (" + state.events.length + " clases).", "ok");
        } else {
          setStatus("Ese archivo no parece un horario válido.", "error");
        }
      } catch (e) {
        setStatus("No pude leer ese JSON.", "error");
      }
    };
    r.readAsText(els.importInput.files[0]);
  });

  els.exportBtn.addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ name: state.name, events: state.events }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var d = new Date(), ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    a.download = "mi-horario-" + ds + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  });

  els.printBtn.addEventListener("click", function () { window.print(); });

  /* ---------------- init ---------------- */

  (function buildDayOptions() {
    els.evDay.innerHTML = "";
    var o;
    for (var i = 1; i < 7; i++) {
      o = document.createElement("option");
      o.value = i;
      o.textContent = DAYS[i].charAt(0).toUpperCase() + DAYS[i].slice(1);
      els.evDay.appendChild(o);
    }
    o = document.createElement("option");
    o.value = 0;
    o.textContent = "Domingo";
    els.evDay.appendChild(o);
  })();

  load();
  if (state.events.length) {
    renderWeek();
    els.stepCal.hidden = false;
  }
})();