function makeEl(tag) {
  return {
    tagName: tag, children: [], value: "", textContent: "", hidden: false,
    className: "", innerHTML: "", style: {}, src: "", attrs: {},
    appendChild(c) { this.children.push(c); },
    addEventListener() {},
    setAttribute() {}, getAttribute() { return null; }
  };
}
global.document = {
  getElementById() { return makeEl("div"); },
  createElement(t) { return makeEl(t); },
  addEventListener() {}
};
global.localStorage = { getItem() { return null; }, setItem() {} };
global.window = { print() {} };

const fs = require("fs");
const path = require("path");
let src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
src = src.replace(/^\(function \(\) \{$/m, "(function () {\n  var __T = {};");
src = src.replace(/\n[ ]*\}\)\(\);\s*$/, "\n  __T = { parseSchedule, sanitize, uid, fmt, parseTable };\n  return __T;\n})();");

const api = eval(src);

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
}

// ---- sanitize ----
const filt = api.sanitize([
  { title: "Matemáticas", day: 1, start: 480, end: 600 },
  { title: "Basura", day: 99, start: 0, end: 1 },
  { title: "", day: 1, start: 0, end: 1 },
  { title: "Invertida", day: 2, start: 600, end: 480 },
  null
]);
eq("sanitize filtra inválidos (99/negativos/null)", filt.length, 2);
eq("sanitize convierte título vacío en clase genérica", filt.some(e => e.title === "Clase" && e.day === 1 && e.start === 0 && e.end === 1), true);

const san = api.sanitize([{ title: "Historia", day: "3", start: "540", end: "660" }])[0];
eq("sanitize normaliza tipos y asigna id", { t: san.title, d: san.day, s: san.start, e: san.end, idOk: typeof san.id === "string" && san.id.length > 5 }, { t: "Historia", d: 3, s: 540, e: 660, idOk: true });

// ---- parseSchedule ----
const text = [
  "Horario turno mañana",
  "Lunes",
  "08:00 - 10:00 Matemáticas Ana García",
  "Martes",
  "10:15 - 12:00 Lengua",
  "Ana García",
  "Miércoles",
  "Historia Ana García",
  "14:00 - 15:30",
  "Viernes",
  "07:45-08:30 Programación Ana García - Aula 3"
].join("\n");

const evs = api.parseSchedule(text, "Ana García");
eq("encuentra 4 clases", evs.length, 4);
eq("celda en misma línea (Lunes)", evs.some(e => e.day === 1 && e.start === 480 && e.end === 600 && e.title === "Matemáticas"), true);
eq("nombre en línea siguiente (Martes)", evs.some(e => e.day === 2 && e.start === 615 && e.end === 720 && e.title === "Lengua"), true);
eq("nombre en línea previa (Miércoles)", evs.some(e => e.day === 3 && e.start === 840 && e.end === 930 && e.title === "Historia"), true);
eq("hora pegada y texto posterior a nombre (Viernes)", evs.some(e => e.day === 5 && e.start === 465 && e.end === 510 && e.title === "Programación Aula 3"), true);

// ignorar líneas de otros
const others = api.parseSchedule("Lunes\n08:00-10:00 Biología Juan Pérez\n", "Ana García");
eq("ignora clases de otros", others.length, 0);

// ---- fmt ----
eq("fmt", [api.fmt(480), api.fmt(600), api.fmt(0), api.fmt(1439)], ["08:00", "10:00", "00:00", "23:59"]);

// ---- parseTable (reconstrucción de tabla por coordenadas) ----
// Construir palabras con bbox simulando una tabla:
//   fila 0 (header)  : Lunes Martes Miércoles Jueves Viernes
//   fila 1           : "Ana García" | "08:00-10:00 Matemáticas" | "10:15-12:00 Lengua" ...
// La primera columna (nombres) está a la izquierda (x pequeña), cada columna de día a una x mayor.
function word(text, x, y) {
  return { text: text, x: x, y: y, x2: x + 40, y2: y + 20 };
}
// Header: días espaciados 150px, empezando en x=100
var headerWords = [
  word("Lunes", 100, 0),
  word("Martes", 250, 0),
  word("Miércoles", 400, 0),
  word("Jueves", 550, 0),
  word("Viernes", 700, 0)
];
// Fila de Ana: nombre a la izquierda (x=0) y celdas bajo cada columna
var anaRow = [
  word("Ana", 0, 40), word("García", 30, 40),
  word("08:00-10:00", 100, 40), word("Matemáticas", 160, 40),
  word("10:15-12:00", 250, 40), word("Lengua", 320, 40),
  word("", 0, 0)
].filter(w => w.text);
// Fila de otro compañero (debe ignorarse)
var otherRow = [
  word("Juan", 0, 80), word("Pérez", 30, 80),
  word("07:45-08:30", 250, 80), word("Física", 320, 80)
];
var tableWords = headerWords.concat(anaRow, otherRow);

var tEvs = api.parseTable(tableWords, "Ana García");
eq("parseTable ignora a otros y encuentra solo 2 clases de Ana",
   tEvs.map(e => e.day + ":" + e.start + "-" + e.end).sort(),
   ["1:480-600", "2:615-720"].sort());
eq("parseTable asigna Lunes a día 1", tEvs.some(e => e.day === 1 && e.start === 480), true);
eq("parseTable asigna Martes a día 2", tEvs.some(e => e.day === 2 && e.start === 615), true);
eq("parseTable no devuelve nada sin encabezado de días", api.parseTable([word("Hola", 0, 0)].filter(w=>w.text), "Ana García").length, 0);

console.log("\n" + pass + " pasan, " + fail + " fallan");
process.exit(fail ? 1 : 0);
