const state = {
  payload: null,
  data: null,
  view: "overview"
};

const $ = (id) => document.getElementById(id);

async function loadPayload() {
  const response = await fetch("data/smarthub.enc.json", { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar data/smarthub.enc.json");
  state.payload = await response.json();
  $("payloadStatus").textContent = "encrypted payload ready";
}

function bytesFromBase64(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function deriveKey(passphrase, salt, iterations) {
  const encoded = new TextEncoder().encode(passphrase);
  const material = await crypto.subtle.importKey("raw", encoded, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function unlock() {
  try {
    const passphrase = $("passphraseInput").value;
    if (!passphrase) {
      $("unlockHint").textContent = "Ingresa la passphrase local.";
      return;
    }
    const salt = bytesFromBase64(state.payload.kdf.salt);
    const iv = bytesFromBase64(state.payload.iv);
    const cipher = bytesFromBase64(state.payload.ciphertext);
    const key = await deriveKey(passphrase, salt, state.payload.kdf.iterations);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    state.data = JSON.parse(new TextDecoder().decode(plain));
    $("unlockPanel").classList.add("hidden");
    $("appPanel").classList.remove("hidden");
    $("payloadStatus").textContent = `unlocked ${state.data.exportedAt ?? ""}`;
    render();
  } catch (error) {
    $("unlockHint").textContent = "No se pudo desbloquear. Revisa la passphrase.";
    console.error(error);
  }
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".tabs button").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  render();
}

function getOrders() {
  return state.data?.resourceRoot?.orders?.items ?? state.data?.resourceRoot?.orders?.Items ?? [];
}

function getQuotes() {
  return state.data?.resourceRoot?.orderQuotes?.items ?? state.data?.resourceRoot?.orderQuotes?.Items ?? [];
}

function money(value) {
  const number = Number(value ?? 0);
  return number.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function render() {
  const view = $("view");
  if (!state.data) return;
  const renderers = {
    overview: renderOverview,
    orders: renderOrders,
    breaks: renderBreaks,
    resources: renderResources,
    scripts: renderScripts,
    notes: renderNotes,
    raw: renderRaw
  };
  view.innerHTML = renderers[state.view]();
}

function renderOverview() {
  const orders = getOrders();
  const breaks = state.data.activeBreaks?.activityRecords ?? [];
  const scripts = state.data.resourceRoot?.scripts?.items ?? state.data.resourceRoot?.scripts?.Items ?? [];
  const resources = state.data.resourceRoot?.library?.items ?? state.data.resourceRoot?.library?.Items ?? [];
  return `
    <div class="grid">
      ${metric("Pedidos", orders.length)}
      ${metric("Cotizaciones", getQuotes().length)}
      ${metric("Break records", breaks.length)}
      ${metric("Scripts", scripts.length)}
      ${metric("Recursos pin", resources.length)}
      ${metric("Export", state.data.exportedAt ?? "-")}
    </div>
  `;
}

function metric(label, value) {
  return `<article class="card"><p class="muted">${label}</p><div class="metric">${value}</div></article>`;
}

function renderOrders() {
  const orders = getOrders();
  if (!orders.length) return `<p class="muted">Sin pedidos exportados.</p>`;
  return `<div class="list">${orders.map(order => {
    const number = order.orderNumber ?? order.OrderNumber ?? "sin folio";
    const name = order.name ?? order.Name ?? "Sin nombre";
    const status = order.status ?? order.Status ?? "sin status";
    const total = order.total ?? order.Total ?? 0;
    const paid = order.amountPaid ?? order.AmountPaid ?? 0;
    const delivery = order.deliveryDate ?? order.DeliveryDate ?? order.dueDate ?? order.DueDate ?? "";
    return `
      <article class="row">
        <div class="row-title">${number} | ${name}</div>
        <div><span class="pill">${status}</span></div>
        <div class="muted">Total ${money(total)} | Pagado ${money(paid)} | Resta ${money(Number(total) - Number(paid))}</div>
        <div class="muted">Entrega: ${delivery || "sin fecha"}</div>
      </article>
    `;
  }).join("")}</div>`;
}

function renderBreaks() {
  const records = state.data.activeBreaks?.activityRecords ?? [];
  const exercises = state.data.activeBreaks?.exercises ?? [];
  return `
    <div class="grid">${metric("Ejercicios", exercises.length)}${metric("Registros", records.length)}</div>
    <h2>Historial</h2>
    <div class="list">${records.slice(0, 80).map(record => `
      <article class="row">
        <div class="row-title">${record.CreatedAt ?? record.createdAt ?? ""}</div>
        <div>${record.ExerciseName ?? record.exerciseName ?? ""}</div>
        <div class="muted">${record.Status ?? record.status ?? ""} | ${record.Points ?? record.points ?? 0} pts</div>
      </article>
    `).join("") || `<p class="muted">Sin registros.</p>`}</div>
  `;
}

function renderResources() {
  const library = state.data.resourceRoot?.library ?? {};
  const bookmarks = state.data.resourceRoot?.marketBookmarks ?? {};
  const broadcaster = state.data.resourceRoot?.broadcasterProfiles ?? [];
  return `
    <div class="grid">
      ${metric("Library keys", Object.keys(library).length)}
      ${metric("Bookmarks keys", Object.keys(bookmarks).length)}
      ${metric("Broadcaster profiles", Array.isArray(broadcaster) ? broadcaster.length : 0)}
    </div>
    <pre>${escapeHtml(JSON.stringify({ library, bookmarks, broadcaster }, null, 2))}</pre>
  `;
}

function renderScripts() {
  const scripts = state.data.resourceRoot?.scripts ?? {};
  const dictionary = state.data.resourceRoot?.scriptDictionary ?? {};
  const designer = state.data.appData?.scriptDesignerDraft ?? "";
  return `<pre>${escapeHtml(JSON.stringify({ scripts, dictionary, designer }, null, 2))}</pre>`;
}

function renderNotes() {
  const notes = state.data.appData?.stickyNotes ?? {};
  return `<pre>${escapeHtml(JSON.stringify(notes, null, 2))}</pre>`;
}

function renderRaw() {
  return `<pre>${escapeHtml(JSON.stringify(state.data, null, 2))}</pre>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".tabs button").forEach(button => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  $("unlockButton").addEventListener("click", unlock);
  $("passphraseInput").addEventListener("keydown", event => {
    if (event.key === "Enter") unlock();
  });
  try {
    await loadPayload();
  } catch (error) {
    $("unlockHint").textContent = error.message;
    $("payloadStatus").textContent = "missing payload";
  }
});
