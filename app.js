const SHEET_ID = "1J8EC-D6jINSq1WB2EwgnRfZpdspoPEwJa0p0CctqUBA";
const SHEET_NAME = "Hoja 1";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjVwWkcTXB01mCLu__0wNxF0czwQy1f2vqu_0SmC_zd7wUbjzDUrGWMhn5BGfH92OT/exec";

const FILTERS = {
  Cadena: document.getElementById("filterCadena"),
  NumTienda: document.getElementById("filterNumTienda"),
  NomTienda: document.getElementById("filterNomTienda"),
  Familia: document.getElementById("filterFamilia"),
  Marca: document.getElementById("filterMarca"),
  Estatus: document.getElementById("filterEstatus"),
};

const STATUS_IVS = "Inventario Sin Venta";
const numericKeys = new Set(["OH", "DDI"]);

const nomTiendaList = document.getElementById("listNomTienda");
const tableBody = document.getElementById("tableBody");
const resetFilters = document.getElementById("resetFilters");
const resultsMeta = document.getElementById("resultsMeta");

const modal = document.getElementById("ivsModal");
const backdrop = document.getElementById("ivsBackdrop");
const closeModalButton = document.getElementById("closeModal");
const cancelModalButton = document.getElementById("cancelModal");
const ivsForm = document.getElementById("ivsForm");
const summaryContainer = document.getElementById("modalRowSummary");
const ajusteInventario = document.getElementById("ajusteInventario");
const photoFields = document.getElementById("photoFields");
const fotoExhibicion = document.getElementById("fotoExhibicion");
const fotoSenalizacion = document.getElementById("fotoSenalizacion");
const observaciones = document.getElementById("observaciones");
const formMessage = document.getElementById("formMessage");
const submitButton = document.getElementById("submitModal");

let nomTiendaValues = [];
let rawData = [];
let currentRows = [];
let sortKey = "Descripcion";
let sortDir = "asc";
let selectedRow = null;
let resolvedRows = new Set();

function buildSheetUrl() {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const params = new URLSearchParams({
    tqx: "out:json",
    sheet: SHEET_NAME,
  });
  return `${base}?${params.toString()}`;
}

function parseGviz(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
  if (!match) {
    throw new Error("Respuesta inesperada de Google Sheets");
  }
  return JSON.parse(match[1]);
}

function toObject(row, headers) {
  const obj = {};
  headers.forEach((header, index) => {
    const cell = row.c[index];
    obj[header] = cell ? cell.v : "";
  });
  obj.OH = Number(obj.OH || 0);
  obj.DDI = Number(obj.DDI || 0);
  obj.__rowId = buildRowId(obj);
  return obj;
}

function buildRowId(row) {
  return [
    row.Cadena || "",
    row.NumTienda || "",
    row.NomTienda || "",
    row.Familia || "",
    row.Marca || "",
    row.Descripcion || "",
    row.Estatus || "",
  ].join("|");
}

function uniqSortedByKey(list, key) {
  const values = [...new Set(list.filter(Boolean))];
  if (key === "NumTienda") {
    return values.sort((a, b) => Number(a) - Number(b));
  }
  return values.sort((a, b) => String(a).localeCompare(String(b), "es"));
}

function fillSelect(select, values) {
  select.innerHTML = "";
  const optionAll = document.createElement("option");
  optionAll.value = "";
  optionAll.textContent = "Todos";
  select.appendChild(optionAll);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function fillDatalist(datalist, values) {
  datalist.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    datalist.appendChild(option);
  });
}

function getActiveFilters() {
  return Object.fromEntries(
    Object.entries(FILTERS).map(([key, input]) => {
      const rawValue = input.value.trim();
      if (key === "NomTienda") {
        return [key, nomTiendaValues.includes(rawValue) ? rawValue : ""];
      }
      return [key, rawValue];
    })
  );
}

function filterRows(filters) {
  return rawData.filter((row) => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return String(row[key]) === value;
    });
  });
}

function updateFilterOptions(currentFilters) {
  Object.entries(FILTERS).forEach(([key, input]) => {
    const filtersForKey = { ...currentFilters, [key]: "" };
    const subset = filterRows(filtersForKey);
    const values = uniqSortedByKey(subset.map((row) => row[key]), key);
    const previousValue = input.value;
    if (key === "NomTienda") {
      nomTiendaValues = values;
      fillDatalist(nomTiendaList, values);
      if (previousValue && values.includes(previousValue)) {
        input.value = previousValue;
      }
    } else {
      fillSelect(input, values);
      if (previousValue && values.includes(previousValue)) {
        input.value = previousValue;
      }
    }
  });
}

function sortRows(rows) {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (numericKeys.has(sortKey)) {
      return (Number(av) - Number(bv)) * dir;
    }
    return String(av).localeCompare(String(bv), "es", { sensitivity: "base" }) * dir;
  });
}

function createCell(content, className = "") {
  const td = document.createElement("td");
  td.textContent = content;
  if (className) {
    td.className = className;
  }
  return td;
}

function createStatusCell(row) {
  const td = document.createElement("td");
  if (resolvedRows.has(row.__rowId)) {
    const pill = document.createElement("span");
    pill.className = "status-pill status-pill--resolved";
    pill.textContent = "Resuelto";
    td.appendChild(pill);
    return td;
  }
  td.textContent = row.Estatus || "";
  return td;
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  currentRows = rows;

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No hay resultados con los filtros seleccionados.";
    tr.appendChild(td);
    tableBody.appendChild(tr);
    resultsMeta.textContent = "Sin resultados.";
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const isIvs = row.Estatus === STATUS_IVS;
    const isResolved = resolvedRows.has(row.__rowId);

    if (isIvs) {
      tr.classList.add("row--alert");
    }
    if (row.Estatus === "Sin Inventario") {
      tr.classList.add("row--danger");
    }
    if (isIvs && !isResolved) {
      tr.classList.add("row--clickable");
      tr.addEventListener("click", () => openModal(row));
    }
    if (isResolved) {
      tr.classList.add("row--resolved");
    }

    tr.appendChild(createCell(row.Descripcion || ""));
    tr.appendChild(createStatusCell(row));
    tr.appendChild(createCell(String(row.OH), "num"));
    tr.appendChild(createCell(Number.isFinite(row.DDI) ? row.DDI.toFixed(0) : "", "num"));
    tableBody.appendChild(tr);
  });

  resultsMeta.textContent = `${rows.length} resultado(s). Las filas con Inventario Sin Venta se pueden registrar.`;
}

function applyFilters() {
  const firstPass = getActiveFilters();
  updateFilterOptions(firstPass);
  const finalFilters = getActiveFilters();
  const hasPrimaryFilter = finalFilters.Cadena || finalFilters.NumTienda || finalFilters.NomTienda;
  if (!hasPrimaryFilter) {
    tableBody.innerHTML = '<tr><td colspan="4">Selecciona cadena, núm. tienda o nom. tienda para ver resultados.</td></tr>';
    resultsMeta.textContent = "Selecciona una cadena, número o nombre de tienda.";
    currentRows = [];
    return;
  }
  renderTable(sortRows(filterRows(finalFilters)));
}

function attachSortHandlers() {
  document.querySelectorAll("th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = numericKeys.has(key) ? "desc" : "asc";
      }
      applyFilters();
    });
  });
}

function attachFilterHandlers() {
  Object.entries(FILTERS).forEach(([key, input]) => {
    const eventName = key === "NomTienda" ? "input" : "change";
    input.addEventListener(eventName, applyFilters);
  });
  resetFilters.addEventListener("click", () => {
    Object.values(FILTERS).forEach((input) => {
      input.value = "";
    });
    applyFilters();
  });
}

function buildSummaryItem(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "summary__item";

  const labelNode = document.createElement("span");
  labelNode.className = "summary__label";
  labelNode.textContent = label;

  const valueNode = document.createElement("strong");
  valueNode.className = "summary__value";
  valueNode.textContent = value;

  wrapper.append(labelNode, valueNode);
  return wrapper;
}

function renderModalSummary(row) {
  summaryContainer.innerHTML = "";
  [
    ["Cadena", row.Cadena],
    ["NumTienda", row.NumTienda],
    ["NomTienda", row.NomTienda],
    ["Familia", row.Familia],
    ["Marca", row.Marca],
    ["Descripcion", row.Descripcion],
    ["Estatus", row.Estatus],
    ["OH", row.OH],
    ["DDI", Number.isFinite(row.DDI) ? row.DDI.toFixed(0) : ""],
  ].forEach(([label, value]) => summaryContainer.appendChild(buildSummaryItem(label, String(value || ""))));
}

function setFormMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = "form-message";
  if (type) {
    formMessage.classList.add(`is-${type}`);
  }
}

function togglePhotoFields() {
  const hidePhotos = ajusteInventario.checked;
  photoFields.hidden = hidePhotos;
  fotoExhibicion.disabled = hidePhotos;
  fotoSenalizacion.disabled = hidePhotos;
  if (hidePhotos) {
    fotoExhibicion.value = "";
    fotoSenalizacion.value = "";
  }
}

function resetModalForm() {
  ivsForm.reset();
  togglePhotoFields();
  setFormMessage("");
  submitButton.disabled = false;
}

function openModal(row) {
  if (row.Estatus !== STATUS_IVS || resolvedRows.has(row.__rowId)) {
    return;
  }
  selectedRow = row;
  renderModalSummary(row);
  resetModalForm();
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  selectedRow = null;
  resetModalForm();
}

function attachModalHandlers() {
  ajusteInventario.addEventListener("change", togglePhotoFields);
  closeModalButton.addEventListener("click", closeModal);
  cancelModalButton.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });
  ivsForm.addEventListener("submit", handleSubmit);
}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildFileBaseName(row) {
  const datePart = new Date().toISOString().slice(0, 10);
  return [
    datePart,
    sanitizeFileNamePart(row.NumTienda),
    sanitizeFileNamePart(row.Marca),
    sanitizeFileNamePart(row.Descripcion),
  ]
    .filter(Boolean)
    .join("_");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("No se pudo leer una de las imágenes."));
    reader.readAsDataURL(file);
  });
}

async function buildPayload(row) {
  const ajuste = ajusteInventario.checked;
  const exhibicionFile = fotoExhibicion.files[0];
  const senalizacionFile = fotoSenalizacion.files[0];

  if (!ajuste && (!exhibicionFile || !senalizacionFile)) {
    throw new Error("Debes capturar foto de exhibicion y foto de señalizacion, o marcar Ajuste de Inventario.");
  }

  const payload = {
    rowData: {
      Cadena: row.Cadena || "",
      NumTienda: row.NumTienda || "",
      NomTienda: row.NomTienda || "",
      Familia: row.Familia || "",
      Marca: row.Marca || "",
      Descripcion: row.Descripcion || "",
      EstatusInventario: row.Estatus || "",
      OH: row.OH || 0,
      DDI: row.DDI || 0,
      AjusteInventario: ajuste ? "SI" : "NO",
      Observaciones: observaciones.value.trim(),
      Origen: "WebApp",
    },
  };

  if (!ajuste) {
    const baseName = buildFileBaseName(row);
    payload.files = {
      exhibicion: {
        fileName: `${baseName}_exhibicion.jpg`,
        mimeType: exhibicionFile.type || "image/jpeg",
        base64: await fileToBase64(exhibicionFile),
      },
      senalizacion: {
        fileName: `${baseName}_senalizacion.jpg`,
        mimeType: senalizacionFile.type || "image/jpeg",
        base64: await fileToBase64(senalizacionFile),
      },
    };
  }

  return payload;
}

async function sendRecord(payload) {
  if (!SCRIPT_URL || SCRIPT_URL.includes("PEGAR_AQUI")) {
    throw new Error("Falta configurar la URL del Web App de Apps Script en app.js.");
  }

  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el registro al backend.");
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "El backend devolvió un error.");
  }
  return result;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!selectedRow) {
    setFormMessage("No hay una fila seleccionada.", "error");
    return;
  }

  submitButton.disabled = true;
  setFormMessage("Enviando registro...", "");

  try {
    const payload = await buildPayload(selectedRow);
    await sendRecord(payload);
    resolvedRows.add(selectedRow.__rowId);
    setFormMessage("Registro guardado correctamente.", "success");
    applyFilters();
    setTimeout(closeModal, 700);
  } catch (error) {
    setFormMessage(error.message, "error");
    submitButton.disabled = false;
  }
}

async function init() {
  const response = await fetch(buildSheetUrl());
  if (!response.ok) {
    throw new Error("No se pudo cargar la hoja de Google Sheets");
  }

  const text = await response.text();
  const data = parseGviz(text);
  const headers = data.table.cols.map((col) => col.label);
  rawData = data.table.rows.map((row) => toObject(row, headers));

  fillSelect(FILTERS.Cadena, uniqSortedByKey(rawData.map((row) => row.Cadena), "Cadena"));
  fillSelect(FILTERS.NumTienda, uniqSortedByKey(rawData.map((row) => row.NumTienda), "NumTienda"));
  nomTiendaValues = uniqSortedByKey(rawData.map((row) => row.NomTienda), "NomTienda");
  fillDatalist(nomTiendaList, nomTiendaValues);
  fillSelect(FILTERS.Familia, uniqSortedByKey(rawData.map((row) => row.Familia), "Familia"));
  fillSelect(FILTERS.Marca, uniqSortedByKey(rawData.map((row) => row.Marca), "Marca"));
  fillSelect(FILTERS.Estatus, uniqSortedByKey(rawData.map((row) => row.Estatus), "Estatus"));

  attachSortHandlers();
  attachFilterHandlers();
  attachModalHandlers();
  togglePhotoFields();
  applyFilters();
}

init().catch((error) => {
  tableBody.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`;
  resultsMeta.textContent = "No fue posible cargar la información.";
});
