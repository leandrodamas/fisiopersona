const XLSX = require("xlsx");

const sourcePath = process.argv[2];
const outputPath = process.argv[3];

if (!sourcePath || !outputPath) {
  console.error("Uso: node adapt_excel_saas.js <origem.xlsx> <saida.xlsx>");
  process.exit(1);
}

const wb = XLSX.readFile(sourcePath, { cellDates: true });

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toIsoDate(dateStr) {
  if (!dateStr) return "";
  const m = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return "";
  let [, d, mo, y] = m;
  if (y.length === 2) y = `20${y}`;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function monthYearToIso(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{1,2})\/(\d{2,4})$/);
  if (!m) return "";
  let [, mo, y] = m;
  if (y.length === 2) y = `20${y}`;
  return `${y}-${mo.padStart(2, "0")}-01`;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstTime(value) {
  const m = String(value || "").match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

function parsePatientCell(raw) {
  const text = cleanText(raw);
  if (!text || /não preencher/i.test(text)) return null;

  const name = cleanText(text.split(/\s+-\s+/)[0]);
  const origMatch = text.match(/\b(RE|VE|NISA|GT|GR)\b/i);
  const prescMatch = text.match(/(?:\/|\b)(\d{1,3})\s*s\b/i);
  const dateMatches = [...text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)].map((m) => m[0]);
  const altaDateMatch = text.match(/ALTA\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const altaMonthMatch = text.match(/ALTA\s+(\d{1,2}\/\d{2,4})/i);

  return {
    nome: name,
    orig: origMatch ? origMatch[1].toUpperCase() : "RE",
    presc: prescMatch ? Number(prescMatch[1]) : 20,
    adm: dateMatches[0] ? toIsoDate(dateMatches[0]) : "",
    alta: altaDateMatch
      ? toIsoDate(altaDateMatch[1])
      : altaMonthMatch
        ? monthYearToIso(altaMonthMatch[1])
        : "",
    obs: text,
  };
}

function buildReportIndex(sheetName) {
  if (!wb.SheetNames.includes(sheetName)) return new Map();
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const index = new Map();
  for (const row of rows) {
    const patient = cleanText(row[3]);
    if (!patient || /paciente/i.test(patient)) continue;
    const key = normalizeName(patient);
    if (!index.has(key)) {
      index.set(key, {
        tel: cleanText(row[4]),
        diag: cleanText(row[5]),
        obs: cleanText(row[9]),
      });
    }
  }
  return index;
}

const reportIndex = new Map([
  ...buildReportIndex("Relatório de agendamento2022"),
  ...buildReportIndex("Relatório de agendamento"),
]);

const agendaRows = XLSX.utils.sheet_to_json(wb.Sheets["Agenda"], { header: 1, defval: "", blankrows: true });

function extractEstColumns(headerRow, dataRows) {
  const cols = [];
  for (let col = 1; col < headerRow.length; col++) {
    const nome = cleanText(headerRow[col]);
    if (!nome) continue;
    const hasUsefulData = dataRows.some((row) => {
      const cell = cleanText(row[col]);
      return cell && !/não preencher/i.test(cell);
    });
    if (hasUsefulData) cols.push({ nome, col });
  }
  return cols;
}

const leandroDataRows = agendaRows.slice(6, 9);
const leticiaDataRows = agendaRows.slice(14, 17);

const professorSections = [
  {
    id: "leandro",
    nome: cleanText(agendaRows[0]?.[2] || "Leandro Damas"),
    cns: "",
    cor: "#00d4ff",
    dias: "SEG|TER",
    estagiarios: extractEstColumns(agendaRows[5] || [], leandroDataRows),
    rowStart: 6,
    rowEnd: 8,
  },
  {
    id: "leticia",
    nome: cleanText(agendaRows[9]?.[2] || "Letícia de Araújo"),
    cns: "",
    cor: "#c77dff",
    dias: "QUA|QUI",
    estagiarios: extractEstColumns(agendaRows[13] || [], leticiaDataRows),
    rowStart: 14,
    rowEnd: 16,
  },
];

const professors = professorSections.map((p) => ({
  id: p.id,
  nome: p.nome,
  cns: p.cns,
  cor: p.cor,
  dias: p.dias,
  estagiarios: p.estagiarios.map((x) => x.nome).join("|"),
  origem_planilha: "Agenda",
}));

const patients = [];
const usedIds = new Map();

function nextId(base) {
  const current = usedIds.get(base) || 0;
  const next = current + 1;
  usedIds.set(base, next);
  return next === 1 ? base : `${base}-${next}`;
}

for (const section of professorSections) {
  const estagiarios = section.estagiarios;
  for (let rowIndex = section.rowStart; rowIndex <= section.rowEnd; rowIndex++) {
    const row = agendaRows[rowIndex] || [];
    const horario = firstTime(row[0]);
    estagiarios.forEach(({ nome: est, col }) => {
      const rawCell = row[col];
      const parsed = parsePatientCell(rawCell);
      if (!parsed) return;
      const enrich = reportIndex.get(normalizeName(parsed.nome)) || {};
      const pid = nextId(`p-${slugify(parsed.nome)}`);
      patients.push({
        id: pid,
        prof: section.id,
        nome: parsed.nome,
        cid: "",
        diag: enrich.diag || "",
        orig: parsed.orig,
        tel: enrich.tel || "",
        adm: parsed.adm,
        alta: parsed.alta,
        presc: parsed.presc,
        real: 0,
        est,
        hor: horario,
        ativo: true,
        obs: [parsed.obs, enrich.obs].filter(Boolean).join(" | "),
      });
    });
  }
}

const sessoes = [{
  id: "s-modelo-1",
  pid: "",
  prof: "",
  data: "",
  status: "P",
  est: "",
  obs: "Use P, F, FJ, AV, D ou TM",
}];

const instrucoes = [
  ["PLANILHA ADAPTADA PARA O FISIO SAAS"],
  [""],
  ["Abas criadas:"],
  ["SAAS_Professores", "Cadastro dos professores no formato do SaaS"],
  ["SAAS_Pacientes", "Pacientes extraídos da aba Agenda e enriquecidos quando possível"],
  ["SAAS_Sessoes", "Modelo para carga de sessões/chamada"],
  [""],
  ["Observações:"],
  ["1.", "O CNS agora pertence ao professor, não ao paciente."],
  ["2.", "Campos não encontrados na planilha original foram deixados em branco."],
  ["3.", "As colunas 'dias' e 'estagiarios' usam | como separador."],
  ["4.", "A coluna 'obs' preserva o texto original da agenda para conferência."],
];

function replaceSheet(name, rows) {
  if (wb.SheetNames.includes(name)) {
    delete wb.Sheets[name];
    wb.SheetNames = wb.SheetNames.filter((n) => n !== name);
  }
  if (Array.isArray(rows) && (!rows.length || Array.isArray(rows[0]))) {
    wb.Sheets[name] = XLSX.utils.aoa_to_sheet(rows);
  } else {
    wb.Sheets[name] = XLSX.utils.json_to_sheet(rows);
  }
  wb.SheetNames.push(name);
}

replaceSheet("SAAS_Instrucoes", instrucoes);
replaceSheet("SAAS_Professores", professors);
replaceSheet("SAAS_Pacientes", patients);
replaceSheet("SAAS_Sessoes", sessoes);

XLSX.writeFile(wb, outputPath);

console.log(JSON.stringify({
  outputPath,
  professores: professors.length,
  pacientes: patients.length,
  sheetsAdded: ["SAAS_Instrucoes", "SAAS_Professores", "SAAS_Pacientes", "SAAS_Sessoes"],
}, null, 2));
