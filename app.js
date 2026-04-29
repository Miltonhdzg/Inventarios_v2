const SHEET_ID = "1J8EC-D6jINSq1WB2EwgnRfZpdspoPEwJa0p0CctqUBA";
const SHEET_NAME = "Hoja 1";
const DATA_IVS_SHEET_NAME = "Data_ivs";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyVVqXYzN61F2WSeYOTqbThHn2qh7LfRJdGp4hK5LCcVMVor-hxxWZ7Hz4uPMbG7QhK/exec";

const STATUS_IVS = "Inventario Sin Venta";
const PHOTO_RESOLVED_DAYS = 30;
const ADJUSTMENT_GRACE_DAYS = 7;
const numericKeys = new Set(["OH", "DDI"]);

const FILTERS = {
  Cadena: document.getElementById("filterCadena"),
  NumTienda: document.getElementById("filterNumTienda"),
  NomTienda: document.getElementById("filterNomTienda"),
  Familia: document.getElementById("filterFamilia"),
  Marca: document.getElementById("filterMarca"),
  Estatus: document.getElementById("filterEstatus"),
};

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
const submitProgress = document.getElementById("submitProgress");
const submitProgressLabel = document.getElementById("submitProgressLabel");
const submitProgressValue = document.getElementById("submitProgressValue");
const submitProgressFill = document.getElementById("submitProgressFill");
const submitProgressHint = document.getElementById("submitProgressHint");
const submitOverlay = document.getElementById("submitOverlay");
const submitOverlayLabel = document.getElementById("submitOverlayLabel");
const submitOverlayFill = document.getElementById("submitOverlayFill");
const submitOverlayHint = document.getElementById("submitOverlayHint");

let nomTiendaValues = [];
let rawData = [];
let currentRows = [];
let sortKey = "Descripcion";
let sortDir = "asc";
let selectedRow = null;
let latestIvsByCase = new Map();
let isSubmitting = false;

function buildSheetUrl(sheetName) {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const params = new URLSearchParams({
    tqx: "out:json",
    sheet: sheetName,
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

async function fetchSheetRows(sheetName) {
  const response = await fetch(buildSheetUrl(sheetName));
  if (!response.ok) {
    throw new Error(`No se pudo cargar la hoja ${sheetName}`);
  }

  const text = await response.text();
  const data = parseGviz(text);
  const columns = data.table.cols || [];
  const rows = data.table.rows || [];

  return rows.map((row) => toObject(row, columns));
}

function toObject(row, columns) {
  const obj = {};

  columns.forEach((column, index) => {
    const header = column.label;
    const cell = row.c[index];

    if (!header) {
      return;
    }

    if (!cell) {
      obj[header] = "";
      return;
    }

    if (header === "FechaRegistro") {
      obj[header] = normalizeDateValue(cell.v || cell.f || "");
      return;
    }

    obj[header] = cell.v ?? cell.f ?? "";
  });

  obj.OH = Number(obj.OH || 0);
  obj.DDI = Number(obj.DDI || 0);
  obj.__rowId = buildRowId(obj);
  obj.__caseKey = buildCaseKey(obj);
  return obj;
}

function normalizeDateValue(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    const gvizMatch = trimmed.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
    if (gvizMatch) {
      const [, year, month, day, hour = "0", minute = "0", second = "0"] = gvizMatch;
      return new Date(
        Number(year),
        Number(month),
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      );
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
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

function buildCaseKey(row) {
  return [
    row.Cadena || "",
    row.NumTienda || "",
    row.NomTienda || "",
    row.Familia || "",
    row.Marca || "",
    row.Descripcion || "",
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

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(fromDate, toDate = new Date()) {
  if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = startOfDay(toDate) - startOfDay(fromDate);
  return Math.floor(diff / msPerDay);
}

function hasEvidence(record) {
  return Boolean(record.FotoExhibicionURL && record.FotoSenalizacionURL);
}

function buildIvsIndex(dataIvsRows) {
  const map = new Map();

  dataIvsRows.forEach((row) => {
    const key = buildCaseKey(row);
    if (!key.replace(/\|/g, "")) {
      return;
    }

    const current = map.get(key);
    const currentTime = current?.FechaRegistro instanceof Date ? current.FechaRegistro.getTime() : -Infinity;
    const nextTime = row.FechaRegistro instanceof Date ? row.FechaRegistro.getTime() : -Infinity;

    if (!current || nextTime >= currentTime) {
      map.set(key, row);
    }
  });

  return map;
}

function getTrackingState(row) {
  if (row.Estatus !== STATUS_IVS) {
    return {
      type: "none",
      label: row.Estatus || "",
      clickable: false,
      rowClass: "",
      pillClass: "",
      message: "",
    };
  }

  const latestRecord = latestIvsByCase.get(row.__caseKey);

  if (!latestRecord) {
    return {
      type: "unresolved",
      label: STATUS_IVS,
      clickable: true,
      rowClass: "row--alert",
      pillClass: "",
      message: "",
    };
  }

  const ageInDays = daysBetween(latestRecord.FechaRegistro);

  if (String(latestRecord.AjusteInventario).toUpperCase() === "SI") {
    if (ageInDays <= ADJUSTMENT_GRACE_DAYS) {
      return {
        type: "temp-adjustment",
        label: "Ajuste vigente",
        clickable: false,
        rowClass: "row--temp",
        pillClass: "status-pill--temp",
        message: "Ajuste vigente",
      };
    }

    return {
      type: "needs-readjustment",
      label: "Se necesita volver a hacer el ajuste",
      clickable: true,
      rowClass: "row--reopen",
      pillClass: "status-pill--reopen",
      message: "Se necesita volver a hacer el ajuste",
    };
  }

  if (hasEvidence(latestRecord)) {
    if (ageInDays <= PHOTO_RESOLVED_DAYS) {
      return {
        type: "resolved-evidence",
        label: "Resuelto con evidencia",
        clickable: false,
        rowClass: "row--resolved",
        pillClass: "status-pill--resolved",
        message: "Resuelto con evidencia",
      };
    }
  }

  return {
    type: "unresolved",
    label: STATUS_IVS,
    clickable: true,
    rowClass: "row--alert",
    pillClass: "",
    message: "",
  };
}

function createCell(content, className = "") {
  const td = document.createElement("td");
  td.textContent = content;
  if (className) {
    td.className = className;
  }
  return td;
}

function createStatusCell(row, tracking) {
  const td = document.createElement("td");

  if (!tracking.pillClass) {
    td.textContent = tracking.label || row.Estatus || "";
    return td;
  }

  const pill = document.createElement("span");
  pill.className = `status-pill ${tracking.pillClass}`;
  pill.textContent = tracking.label;
  td.appendChild(pill);
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
    const tracking = getTrackingState(row);

    if (tracking.rowClass) {
      tr.classList.add(tracking.rowClass);
    }

    if (row.Estatus === "Sin Inventario") {
      tr.classList.add("row--danger");
    }

    if (tracking.clickable) {
      tr.classList.add("row--clickable");
      tr.addEventListener("click", () => openModal(row));
    }

    tr.appendChild(createCell(row.Descripcion || ""));
    tr.appendChild(createStatusCell(row, tracking));
    tr.appendChild(createCell(String(row.OH), "num"));
    tr.appendChild(createCell(Number.isFinite(row.DDI) ? row.DDI.toFixed(0) : "", "num"));
    tableBody.appendChild(tr);
  });

  resultsMeta.textContent = `${rows.length} resultado(s). Las filas IVS resueltas con fotos duran ${PHOTO_RESOLVED_DAYS} días y los ajustes ${ADJUSTMENT_GRACE_DAYS} días.`;
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
  ].forEach(([label, value]) => {
    summaryContainer.appendChild(buildSummaryItem(label, String(value || "")));
  });
}

function setFormMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = "form-message";
  if (type) {
    formMessage.classList.add(`is-${type}`);
  }
}

function setFormBusyState(busy) {
  isSubmitting = busy;
  closeModalButton.disabled = busy;
  cancelModalButton.disabled = busy;
  submitButton.disabled = busy;
  ajusteInventario.disabled = busy;
  observaciones.disabled = busy;

  if (busy) {
    fotoExhibicion.disabled = true;
    fotoSenalizacion.disabled = true;
    return;
  }

  togglePhotoFields();
}

function updateSubmitProgress(value, label, hint = "No cierres esta ventana mientras se procesan las fotos.") {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  submitProgress.hidden = false;
  submitOverlay.hidden = false;
  submitProgressLabel.textContent = label;
  submitProgressValue.textContent = `${safeValue}%`;
  submitProgressFill.style.width = `${safeValue}%`;
  submitProgressHint.textContent = hint;
  submitOverlayLabel.textContent = `${label} (${safeValue}%)`;
  submitOverlayFill.style.width = `${safeValue}%`;
  submitOverlayHint.textContent = hint;
}

function resetSubmitProgress() {
  submitProgress.hidden = true;
  submitOverlay.hidden = true;
  submitProgressLabel.textContent = "Preparando registro...";
  submitProgressValue.textContent = "0%";
  submitProgressFill.style.width = "0%";
  submitProgressHint.textContent = "No cierres esta ventana mientras se procesan las fotos.";
  submitOverlayLabel.textContent = "Preparando registro...";
  submitOverlayFill.style.width = "0%";
  submitOverlayHint.textContent = "No cierres esta ventana mientras se procesan las fotos.";
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
  setFormBusyState(false);
  setFormMessage("");
  resetSubmitProgress();
}

function openModal(row) {
  const tracking = getTrackingState(row);
  if (row.Estatus !== STATUS_IVS || !tracking.clickable) {
    return;
  }

  selectedRow = row;
  renderModalSummary(row);
  resetModalForm();
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  if (isSubmitting) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove("modal-open");
  selectedRow = null;
  resetModalForm();
}

function attachModalHandlers() {
  ajusteInventario.addEventListener("change", togglePhotoFields);
  closeModalButton.addEventListener("click", closeModal);
  cancelModalButton.addEventListener("click", closeModal);
  backdrop.addEventListener("click", () => {
    if (!isSubmitting) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden && !isSubmitting) {
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("No se pudo convertir una de las imágenes."));
        return;
      }
      resolve(result.split(",")[1] || "");
    };

    reader.onerror = () => reject(new Error("No se pudo leer una de las imágenes comprimidas."));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, mimeType = "image/jpeg", quality = 0.72) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("No se pudo comprimir una de las imágenes."));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function calculateTargetSize(width, height, maxDimension = 1280, maxPixels = 1600000) {
  let targetWidth = width;
  let targetHeight = height;

  const dimensionScale = Math.min(1, maxDimension / Math.max(width, height));
  targetWidth = Math.max(1, Math.round(targetWidth * dimensionScale));
  targetHeight = Math.max(1, Math.round(targetHeight * dimensionScale));

  const totalPixels = targetWidth * targetHeight;
  if (totalPixels > maxPixels) {
    const pixelScale = Math.sqrt(maxPixels / totalPixels);
    targetWidth = Math.max(1, Math.round(targetWidth * pixelScale));
    targetHeight = Math.max(1, Math.round(targetHeight * pixelScale));
  }

  return { width: targetWidth, height: targetHeight };
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => resolve({ image: img, cleanup: () => URL.revokeObjectURL(objectUrl) });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          "No se pudo procesar una de las imágenes. Si fue tomada en iPhone, intenta enviarla en formato compatible o reduce la resolución."
        )
      );
    };
    img.src = objectUrl;
  });
}

async function decodeImageSource(file, targetWidth, targetHeight) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: "high",
      });
      return { image: bitmap, cleanup: () => bitmap.close() };
    } catch {
      // Fallback below for browsers with partial support.
    }
  }

  return loadImageElement(file);
}

async function compressImage(file, options = {}) {
  const { maxDimension = 1280, maxPixels = 1600000, quality = 0.72 } = options;
  const probe = await loadImageElement(file);

  try {
    const targetSize = calculateTargetSize(probe.image.naturalWidth || probe.image.width, probe.image.naturalHeight || probe.image.height, maxDimension, maxPixels);
    const decoded = await decodeImageSource(file, targetSize.width, targetSize.height);
    const canvas = document.createElement("canvas");
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;

    try {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        throw new Error("No se pudo preparar el procesamiento de imágenes.");
      }

      ctx.drawImage(decoded.image, 0, 0, targetSize.width, targetSize.height);

      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      return {
        mimeType: "image/jpeg",
        base64: await blobToBase64(blob),
      };
    } finally {
      decoded.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    probe.cleanup();
  }
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function validateImageSize(file, maxMb = 12) {
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > maxMb) {
    throw new Error(`La imagen ${file.name} supera ${maxMb} MB.`);
  }
}

async function buildPayload(row, onProgress = () => {}) {
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
    onProgress(18, "Validando fotos...");
    validateImageSize(exhibicionFile);
    validateImageSize(senalizacionFile);

    const baseName = buildFileBaseName(row);
    onProgress(35, "Comprimiendo foto de exhibición...");
    const exhibicionCompressed = await compressImage(exhibicionFile);
    await waitForNextFrame();
    onProgress(60, "Comprimiendo foto de señalización...");
    const senalizacionCompressed = await compressImage(senalizacionFile);
    onProgress(78, "Preparando archivos para envío...");

    payload.files = {
      exhibicion: {
        fileName: `${baseName}_exhibicion.jpg`,
        mimeType: "image/jpeg",
        base64: exhibicionCompressed.base64,
      },
      senalizacion: {
        fileName: `${baseName}_senalizacion.jpg`,
        mimeType: "image/jpeg",
        base64: senalizacionCompressed.base64,
      },
    };
  }

  return payload;
}

async function sendRecord(payload, onProgress = () => {}) {
  if (!SCRIPT_URL || SCRIPT_URL.includes("PEGAR_AQUI")) {
    throw new Error("Falta configurar la URL del Web App de Apps Script en app.js.");
  }

  onProgress(85, "Enviando registro...", "Las fotos ya fueron procesadas. Espera unos segundos mientras se completa el envío.");
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  onProgress(95, "Confirmando registro...");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${rawText}`);
  }

  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`Respuesta no JSON del backend: ${rawText}`);
  }

  if (!result.ok) {
    throw new Error(result.error || "El backend devolvió un error.");
  }

  return result;
}

function updateLatestCaseAfterSubmit(row, payload) {
  latestIvsByCase.set(buildCaseKey(row), {
    FechaRegistro: new Date(),
    Cadena: row.Cadena || "",
    NumTienda: row.NumTienda || "",
    NomTienda: row.NomTienda || "",
    Familia: row.Familia || "",
    Marca: row.Marca || "",
    Descripcion: row.Descripcion || "",
    AjusteInventario: payload.rowData.AjusteInventario,
    FotoExhibicionURL: payload.rowData.AjusteInventario === "SI" ? "" : "local-upload",
    FotoSenalizacionURL: payload.rowData.AjusteInventario === "SI" ? "" : "local-upload",
  });
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!selectedRow) {
    setFormMessage("No hay una fila seleccionada.", "error");
    return;
  }

  setFormBusyState(true);
  setFormMessage("Procesando evidencia...", "");
  updateSubmitProgress(8, "Preparando registro...");

  try {
    const payload = await buildPayload(selectedRow, updateSubmitProgress);
    await sendRecord(payload, updateSubmitProgress);
    updateSubmitProgress(100, "Registro guardado correctamente.", "Puedes continuar con otro registro.");
    updateLatestCaseAfterSubmit(selectedRow, payload);
    setFormMessage("Registro guardado correctamente.", "success");
    applyFilters();
    setFormBusyState(false);
    setTimeout(closeModal, 700);
  } catch (error) {
    setFormMessage(error.message, "error");
    setFormBusyState(false);
    resetSubmitProgress();
  }
}

async function init() {
  const [inventoryRows, dataIvsRows] = await Promise.all([
    fetchSheetRows(SHEET_NAME),
    fetchSheetRows(DATA_IVS_SHEET_NAME).catch(() => []),
  ]);

  rawData = inventoryRows;
  latestIvsByCase = buildIvsIndex(dataIvsRows);

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
