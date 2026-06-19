// ============================================================
// REMUGEST - index.js
// Firebase Config + LocalServer API
// Version 1.3 - 2025
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyAn8YsM1TC_Ub2N0m2XX5wnMGbdlNsIp2g",
  authDomain: "ups-monitor-f9b33.firebaseapp.com",
  projectId: "ups-monitor-f9b33",
  storageBucket: "ups-monitor-f9b33.firebasestorage.app",
  messagingSenderId: "746915871851",
  appId: "1:746915871851:web:28fd4fec3a67f64d32052e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ── App State ─────────────────────────────────────────────
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
let appMode = localStorage.getItem("appMode") || (isLocalhost ? "local" : "cloud");
if (!isLocalhost) appMode = "cloud"; // Force cloud on production

let allCompanies   = [];
let selectedCompany = null;
let companyWorkers = [];
let allUsers       = [];
let liqCurrentWorker = null; // selected worker object for liquidación

const API_BASE = "";

// ── AFP Tasas 2024 / 2025 ────────────────────────────────
const AFP_RATES = {
    "Habitat":   0.1027,
    "Provida":   0.1044,
    "Capital":   0.1044,
    "Cuprum":    0.1050,
    "PlanVital": 0.1057,
    "Modelo":    0.1058,
    "Uno":       0.1049,
    "SIN AFP":   0.0000
};
const SALUD_RATE   = 0.07;   // 7% FONASA o mínimo legal Isapre
const UTM_2025     = 68306;  // UTM vigente aproximado 2025 (actualizar según SII)
const IMM_2025     = 510.966; // Ingreso Mínimo Mensual Chile 2025 en pesos (actualizar)
// Asig. Familiar 2025 - tramos (aprox)
const ASIG_FAM_TRAMO_A = 16.895; // pesos por carga tramo A (ingreso <= ~$416.667)
const ASIG_FAM_TRAMO_B = 10.362; // pesos tramo B
const ASIG_FAM_TRAMO_C = 3.196;  // pesos tramo C

// ── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    applyModeUI();

    if (appMode === "local") {
        // Local mode: bypass login immediately
        hideLoginOverlay();
        setUserDisplay("Administrador Local", "Control Total", "AL");
        document.getElementById("btn-logout").style.display = "none";
        loadAllData();
    } else {
        // Cloud mode: wait for Firebase Auth state
        auth.onAuthStateChanged(user => {
            if (user) {
                hideLoginOverlay();
                document.getElementById("btn-logout").style.display = "inline-flex";
                setUserDisplay(user.email, "Administrador Nube", user.email.substring(0, 2).toUpperCase());
                loadAllData();
            } else {
                showLoginOverlay();
                document.getElementById("btn-logout").style.display = "none";
            }
        });
    }
}

function showLoginOverlay() {
    const overlay = document.getElementById("login-overlay");
    overlay.classList.add("active");
}

function hideLoginOverlay() {
    const overlay = document.getElementById("login-overlay");
    overlay.classList.remove("active");
}

function setUserDisplay(name, role, avatarText) {
    document.getElementById("user-display-name").textContent  = name;
    document.getElementById("user-display-role").textContent  = role;
    document.getElementById("user-avatar-text").textContent   = avatarText;
}

async function loadAllData() {
    await loadCompanies();
    loadUsers();
    loadParams();
    loadComunas();
}

// ── Tab Switcher ─────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.getElementById("sec-" + tab).classList.add("active");
    document.getElementById("tab-" + tab).classList.add("active");
}

// ── Mode Switcher ────────────────────────────────────────
function applyModeUI() {
    const isCloud = appMode === "cloud";
    document.getElementById("btn-mode-local").classList.toggle("active", !isCloud);
    document.getElementById("btn-mode-cloud").classList.toggle("active", isCloud);

    // Hide mode switcher on production (non-localhost)
    const switcher = document.getElementById("mode-switcher-wrapper");
    if (switcher) switcher.style.display = isLocalhost ? "flex" : "none";

    const dot        = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");
    const versionText = document.getElementById("version-text");
    const syncCard   = document.getElementById("sync-card");
    const thClave    = document.getElementById("th-clave");

    if (isCloud) {
        dot.style.backgroundColor = "#6366F1";
        dot.style.boxShadow       = "0 0 8px #6366F1";
        statusText.textContent    = "Modo Nube (Firebase)";
        versionText.textContent   = "v1.3 (Firebase Cloud)";
        if (syncCard) syncCard.style.display = "none";
        if (thClave)  thClave.style.display  = "none";
        document.getElementById("admin-subtitle").textContent =
            "Gestión de cuentas de administrador alojadas en Firebase Firestore.";
        document.getElementById("dirname-desc").textContent =
            "Esto registrará la empresa en la base de datos centralizada de Firestore.";
    } else {
        dot.style.backgroundColor = "#10B981";
        dot.style.boxShadow       = "0 0 8px #10B981";
        statusText.textContent    = "Servidor Local Conectado";
        versionText.textContent   = "v1.3 (Access MDB)";
        if (syncCard) syncCard.style.display = "block";
        if (thClave)  thClave.style.display  = "";
        document.getElementById("admin-subtitle").textContent =
            "Gestión directa de usuarios administradores guardados de forma segura en Key.mdb.";
        document.getElementById("dirname-desc").textContent =
            "Esto creará una carpeta física en el servidor y su respectiva base de datos.";
    }
}

function setMode(mode) {
    if (mode === appMode) return;
    appMode = mode;
    localStorage.setItem("appMode", mode);
    applyModeUI();

    if (mode === "cloud") {
        const user = auth.currentUser;
        if (!user) {
            showLoginOverlay();
        } else {
            hideLoginOverlay();
            loadAllData();
        }
    } else {
        hideLoginOverlay();
        setUserDisplay("Administrador Local", "Control Total", "AL");
        document.getElementById("btn-logout").style.display = "none";
        loadAllData();
    }
}

// ── Firebase Auth ────────────────────────────────────────
async function handleFirebaseLogin(event) {
    event.preventDefault();
    const email   = document.getElementById("login-email").value.trim();
    const pass    = document.getElementById("login-password").value.trim();
    const errMsg  = document.getElementById("login-error-msg");
    const btn     = document.getElementById("btn-login-submit");

    errMsg.style.display = "none";
    btn.textContent = "Iniciando sesión...";
    btn.disabled    = true;

    try {
        await auth.signInWithEmailAndPassword(email, pass);
        // onAuthStateChanged will handle UI update
    } catch (err) {
        errMsg.textContent   = "Error: " + err.message;
        errMsg.style.display = "block";
    } finally {
        btn.textContent = "Iniciar Sesión";
        btn.disabled    = false;
    }
}

async function handleFirebaseLogout() {
    try {
        await auth.signOut();
        setMode("local");
    } catch (err) {
        alert("Error al cerrar sesión: " + err.message);
    }
}

// ══════════════════════════════════════════════════════════
//  COMPANIES
// ══════════════════════════════════════════════════════════

async function loadCompanies() {
    try {
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/empresas`);
            if (!r.ok) throw new Error("Error al cargar empresas");
            allCompanies = await r.json();
        } else {
            const snap = await db.collection("empresas").get();
            allCompanies = [];
            snap.forEach(doc => {
                const d = doc.data();
                d.DirName = doc.id;
                allCompanies.push(d);
            });
        }

        document.getElementById("stat-companies-count").textContent = allCompanies.length;
        renderQuickCompanies();
        renderFullCompanies();
        populateCompanySelectors();
    } catch (err) {
        console.error("Error loading companies:", err);
        const errHtml = `<div class="loading-spinner text-danger">Error al cargar empresas: ${err.message}</div>`;
        document.getElementById("quick-companies-list").innerHTML   = errHtml;
        document.getElementById("companies-full-list").innerHTML    = errHtml;
    }
}

function getCompanyLogoHtml(emp, size = 52) {
    if (emp.LogoBase64) {
        return `<img class="company-card-logo" src="${emp.LogoBase64}" alt="Logo" style="width:${size}px;height:${size}px;">`;
    }
    return `<div class="company-card-logo-placeholder" style="width:${size}px;height:${size}px;">🏢</div>`;
}

function renderQuickCompanies() {
    const list = document.getElementById("quick-companies-list");
    if (!allCompanies.length) {
        list.innerHTML = `<div class="loading-spinner">No hay empresas declaradas.</div>`;
        return;
    }
    list.innerHTML = allCompanies.map(emp => {
        if (emp.Error) return `<div class="company-card" style="opacity:.7;"><h4>${emp.DirName}</h4><div class="company-card-detail">Error de base de datos</div><div class="company-card-tag" style="background:rgba(239,68,68,.1);color:#F87171;">Inaccesible</div></div>`;
        return `
            <div class="company-card">
                <div onclick="selectCompany('${escapeQuote(emp.DirName)}')">
                    ${getCompanyLogoHtml(emp)}
                    <h4>${emp.Empres || emp.DirName}</h4>
                    <div class="company-card-detail">RUT: <strong>${emp.RolEmp || '-'}</strong></div>
                    <div class="company-card-detail">Giro: <strong>${emp.GiroCo || '-'}</strong></div>
                    <div class="company-card-tag">${emp.DirName}</div>
                </div>
                <div class="company-card-actions">
                    <button class="btn btn-action" onclick="openEditCompanyModal('${escapeQuote(emp.DirName)}')">✏️ Editar</button>
                    <button class="btn btn-action" onclick="selectCompany('${escapeQuote(emp.DirName)}')">👥 Personal</button>
                </div>
            </div>`;
    }).join("");
}

function renderFullCompanies() {
    const list = document.getElementById("companies-full-list");
    if (!allCompanies.length) {
        list.innerHTML = `<div class="loading-spinner">No hay empresas declaradas.</div>`;
        return;
    }
    list.innerHTML = allCompanies.map(emp => {
        if (emp.Error) return `<div class="company-card" style="opacity:.7;"><h4>${emp.DirName}</h4><div class="company-card-detail">Error: <strong>${emp.Error}</strong></div><div class="company-card-tag" style="background:rgba(239,68,68,.1);color:#F87171;">Inaccesible</div></div>`;
        return `
            <div class="company-card">
                <div onclick="selectCompany('${escapeQuote(emp.DirName)}')">
                    ${getCompanyLogoHtml(emp)}
                    <h4>${emp.Empres || emp.DirName}</h4>
                    <div class="company-card-detail">RUT: <strong>${emp.RolEmp || '-'}</strong></div>
                    <div class="company-card-detail">Dirección: <strong>${emp.Direcc || '-'}, ${emp.Comuna || '-'}</strong></div>
                    <div class="company-card-detail">Giro: <strong>${emp.GiroCo || '-'}</strong></div>
                    <div class="company-card-detail">Representante: <strong>${emp.Repres || '-'}</strong></div>
                    <div class="company-card-detail">Tel: <strong>${emp.TelEmp || '-'}</strong> | Mutualidad: <strong>${emp.Mutualidad || '-'}</strong></div>
                    <div class="company-card-tag">${emp.DirName}</div>
                </div>
                <div class="company-card-actions">
                    <button class="btn btn-action" onclick="openEditCompanyModal('${escapeQuote(emp.DirName)}')">✏️ Editar</button>
                    <button class="btn btn-action" onclick="selectCompany('${escapeQuote(emp.DirName)}')">👥 Personal</button>
                </div>
            </div>`;
    }).join("");
}

function populateCompanySelectors() {
    // Personal tab selector
    const sel = document.getElementById("company-select");
    sel.innerHTML = '<option value="">-- Selecciona Empresa --</option>';
    // Liquidaciones tab selectors
    const liqSel = document.getElementById("liq-empresa-select");
    liqSel.innerHTML = '<option value="">-- Selecciona empresa --</option>';

    allCompanies.forEach(emp => {
        if (!emp.Error) {
            const name = emp.Empres || emp.DirName;
            [sel, liqSel].forEach(s => {
                const opt = document.createElement("option");
                opt.value = emp.DirName;
                opt.textContent = name;
                s.appendChild(opt);
            });
        }
    });
}

function selectCompany(dirName) {
    selectedCompany = dirName;
    document.getElementById("company-select").value = dirName;
    switchTab("personal");
    loadWorkers(dirName);
}

function loadWorkersForSelect(dirName) {
    if (dirName) {
        selectedCompany = dirName;
        loadWorkers(dirName);
    } else {
        selectedCompany = null;
        document.getElementById("workers-table-body").innerHTML =
            `<tr><td colspan="8" class="text-center text-muted">Selecciona una empresa para cargar la planilla de personal.</td></tr>`;
        document.getElementById("selected-company-subtitle").textContent = "Selecciona una empresa para ver su personal";
        document.getElementById("btn-add-worker").style.display = "none";
    }
}

// ── Company CRUD ─────────────────────────────────────────
function openAddCompanyModal() {
    document.getElementById("company-modal-title").textContent = "Registrar Nueva Empresa";
    document.getElementById("company-form").reset();
    document.getElementById("company-mode").value = "add";
    document.getElementById("group-dirname").style.display = "flex";
    document.getElementById("comp-dirname").required = true;
    document.getElementById("btn-save-company").textContent = "Registrar Empresa";
    document.getElementById("comp-logo").value = "";
    resetLogoPreview();
    document.getElementById("company-form-modal").classList.add("active");
}

function openEditCompanyModal(dirName) {
    const emp = allCompanies.find(e => e.DirName === dirName);
    if (!emp) return;

    document.getElementById("company-modal-title").textContent = `Editar: ${emp.Empres}`;
    document.getElementById("company-mode").value = "edit";
    document.getElementById("group-dirname").style.display = "none";
    document.getElementById("comp-dirname").required = false;
    document.getElementById("comp-dirname").value = dirName;

    document.getElementById("comp-empres").value    = emp.Empres    || "";
    document.getElementById("comp-rolemp").value    = emp.RolEmp    || "";
    document.getElementById("comp-giro").value      = emp.GiroCo    || "";
    document.getElementById("comp-direcc").value    = emp.Direcc    || "";
    document.getElementById("comp-comuna").value    = emp.Comuna    || "";
    document.getElementById("comp-repres").value    = emp.Repres    || "";
    document.getElementById("comp-rolrep").value    = emp.RolRep    || "";
    document.getElementById("comp-tel").value       = emp.TelEmp    || "";
    document.getElementById("comp-email").value     = emp.EmailEmp  || "";
    document.getElementById("comp-mutualidad").value = emp.Mutualidad || "ISL";
    document.getElementById("comp-banco").value     = emp.Banco     || "";
    document.getElementById("comp-logo").value      = emp.LogoBase64 || "";

    // Show logo preview
    if (emp.LogoBase64) {
        const box = document.getElementById("logo-preview-box");
        box.innerHTML = `<img src="${emp.LogoBase64}" alt="Logo">`;
    } else {
        resetLogoPreview();
    }

    document.getElementById("btn-save-company").textContent = "Guardar Cambios";
    document.getElementById("company-form-modal").classList.add("active");
}

function closeCompanyModal() {
    document.getElementById("company-form-modal").classList.remove("active");
}

async function saveCompany(event) {
    event.preventDefault();

    const mode       = document.getElementById("company-mode").value;
    const dirname    = document.getElementById("comp-dirname").value.trim();
    const empres     = document.getElementById("comp-empres").value.trim();
    const rolemp     = document.getElementById("comp-rolemp").value.trim();
    const giro       = document.getElementById("comp-giro").value.trim();
    const direcc     = document.getElementById("comp-direcc").value.trim();
    const comuna     = document.getElementById("comp-comuna").value.trim();
    const repres     = document.getElementById("comp-repres").value.trim();
    const rolrep     = document.getElementById("comp-rolrep").value.trim();
    const tel        = document.getElementById("comp-tel").value.trim();
    const email      = document.getElementById("comp-email").value.trim();
    const mutualidad = document.getElementById("comp-mutualidad").value;
    const banco      = document.getElementById("comp-banco").value;
    const logo       = document.getElementById("comp-logo").value;

    try {
        if (appMode === "local") {
            const params = new URLSearchParams({
                dirname, empres, rolemp, giro, direcc, comuna, repres, rolrep,
                tel, email, mutualidad, banco, logo
            });
            const url = `${API_BASE}/api/empresas/${mode === "add" ? "add" : "update"}`;
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString()
            });
            if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Error servidor"); }
        } else {
            const docRef = db.collection("empresas").doc(dirname || document.getElementById("comp-dirname").value.trim());
            await docRef.set({
                Empres: empres, RolEmp: rolemp, GiroCo: giro, Direcc: direcc,
                Comuna: comuna, Repres: repres, RolRep: rolrep,
                TelEmp: tel, EmailEmp: email, Mutualidad: mutualidad,
                Banco: banco, LogoBase64: logo
            }, { merge: true });
        }

        alert(mode === "add" ? "✅ Empresa registrada con éxito!" : "✅ Empresa actualizada!");
        closeCompanyModal();
        await loadCompanies();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// ── Logo Handling (Base64) ────────────────────────────────
function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 600 * 1024) {
        alert("El logo no debe superar 600KB. Por favor usa una imagen más pequeña.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result;
        document.getElementById("comp-logo").value = base64;

        // Update preview
        const box = document.getElementById("logo-preview-box");
        box.innerHTML = `<img src="${base64}" alt="Logo Preview">`;
    };
    reader.readAsDataURL(file);
}

function resetLogoPreview() {
    const box = document.getElementById("logo-preview-box");
    box.innerHTML = "🏢";
}

// ══════════════════════════════════════════════════════════
//  WORKERS
// ══════════════════════════════════════════════════════════

async function loadWorkers(dirName) {
    const tbody = document.getElementById("workers-table-body");
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">Cargando planilla de personal...</td></tr>`;

    const empObj = allCompanies.find(e => e.DirName === dirName);
    document.getElementById("selected-company-subtitle").textContent =
        empObj ? `Mostrando personal de: ${empObj.Empres}` : `Mostrando personal de ${dirName}`;
    document.getElementById("btn-add-worker").style.display = "inline-flex";

    try {
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/personal?empresa=${encodeURIComponent(dirName)}`);
            if (!r.ok) throw new Error("Error al cargar trabajadores");
            companyWorkers = await r.json();
        } else {
            const snap = await db.collection("trabajadores").where("empresaId", "==", dirName).get();
            companyWorkers = [];
            snap.forEach(doc => {
                const d = doc.data();
                d.RolUni = doc.id;
                if (!d.Finiquito) companyWorkers.push(d);
            });
        }

        document.getElementById("stat-workers-count").textContent =
            companyWorkers.filter(w => !w.Finiquito).length;

        renderWorkers();
        // Update liquidaciones worker selector if same company selected
        if (document.getElementById("liq-empresa-select").value === dirName) {
            populateLiqWorkers();
        }
    } catch (err) {
        console.error("Error loading workers:", err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

function renderWorkers(filterText = "") {
    const tbody    = document.getElementById("workers-table-body");
    const filtered = companyWorkers.filter(w => {
        if (!filterText) return true;
        const text     = filterText.toLowerCase();
        const fullname = `${w.Nombre||''} ${w.Paterno||''} ${w.Materno||''}`.toLowerCase();
        return (w.RolUni && w.RolUni.toLowerCase().includes(text)) ||
               fullname.includes(text) ||
               (w.Ocupac && w.Ocupac.toLowerCase().includes(text));
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No se encontraron trabajadores activos.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(w => {
        const sueldo = parseInt(w.SBaseM) || 0;
        const contrato = w.TipoContrato || 'Indefinido';
        return `
            <tr>
                <td><strong>${w.RolUni || '-'}</strong></td>
                <td>${w.Nombre||''} ${w.Paterno||''} ${w.Materno||''}</td>
                <td>${w.Ocupac||'-'}${w.Depart ? `<br><small class="text-muted">${w.Depart}</small>` : ''}</td>
                <td><span style="font-size:11px; padding:2px 8px; border-radius:5px; background:rgba(99,102,241,.12); color:#A5B4FC;">${contrato}</span></td>
                <td>${formatCLP(sueldo)}</td>
                <td>${w.AFPper||'-'}</td>
                <td>${w.ISAper||'-'}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-action" onclick="viewWorkerDetails('${w.RolUni}','${escapeQuote((w.Nombre||'')+' '+(w.Paterno||''))}')">📊 Historial</button>
                        <button class="btn btn-action" onclick="openLiqWorker('${w.RolUni}')">📄 Liquidar</button>
                        <button class="btn btn-action" onclick="openEditWorkerModal('${w.RolUni}')">✏️ Editar</button>
                        <button class="btn btn-danger" onclick="deleteWorker('${w.RolUni}','${escapeQuote((w.Nombre||'')+' '+(w.Paterno||''))}')">❌ Finiquito</button>
                    </div>
                </td>
            </tr>`;
    }).join("");
}

function escapeQuote(str) {
    return (str || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function handleGlobalSearch() {
    const text = document.getElementById("global-search").value;
    if (document.getElementById("sec-personal").classList.contains("active")) {
        renderWorkers(text);
    }
}

// ── View Worker History ───────────────────────────────────
async function viewWorkerDetails(rut, fullName) {
    const w = companyWorkers.find(x => x.RolUni === rut);
    if (!w) return;

    document.getElementById("modal-worker-title").textContent = `Historial: ${fullName}`;
    document.getElementById("w-rut").textContent      = w.RolUni || '-';
    document.getElementById("w-ocupac").textContent   = w.Ocupac || '-';
    document.getElementById("w-sbase").textContent    = formatCLP(parseInt(w.SBaseM) || 0);
    document.getElementById("w-afp").textContent      = w.AFPper || '-';
    document.getElementById("w-isa").textContent      = w.ISAper || '-';
    document.getElementById("w-contrato").textContent = w.TipoContrato || 'Indefinido';
    document.getElementById("w-ingreso").textContent  = w.FecIngre ? formatDate(w.FecIngre) : '-';
    document.getElementById("w-email").textContent    = w.EMail || '-';

    const historyTbody = document.getElementById("w-history-table-body");
    historyTbody.innerHTML = `<tr><td colspan="7" class="text-center">Cargando liquidaciones históricas...</td></tr>`;
    document.getElementById("worker-modal").classList.add("active");

    try {
        let txs = [];
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/transacciones?empresa=${encodeURIComponent(selectedCompany)}&rut=${encodeURIComponent(rut)}`);
            if (!r.ok) throw new Error("Error al cargar transacciones");
            txs = await r.json();
        } else {
            const snap = await db.collection("transacciones")
                .where("RolUni", "==", rut)
                .where("empresaId", "==", selectedCompany)
                .get();
            snap.forEach(doc => txs.push(doc.data()));
            const monthOrder = { ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12 };
            txs.sort((a, b) => (monthOrder[a.MesTra]||0) - (monthOrder[b.MesTra]||0));
        }

        if (!txs.length) {
            historyTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No se registran liquidaciones históricas para este RUT.</td></tr>`;
            return;
        }

        historyTbody.innerHTML = txs.map(t => `
            <tr>
                <td><strong>${t.MesTra||'-'}</strong></td>
                <td>${t.DisTra||'0'}</td>
                <td class="text-success"><strong>${formatCLP(t.TotalH)}</strong></td>
                <td class="text-danger">${formatCLP(t.TotalD)}</td>
                <td><strong>${formatCLP(t.Liquid)}</strong></td>
                <td>${formatCLP(t.MontoA)} (${t.NomAFP||'-'})</td>
                <td>${formatCLP(t.MontoI)} (${t.NomISA||'-'})</td>
            </tr>`
        ).join("");
    } catch (err) {
        historyTbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

function closeWorkerModal() {
    document.getElementById("worker-modal").classList.remove("active");
}

// ── Worker CRUD ───────────────────────────────────────────
function openAddWorkerModal() {
    if (!selectedCompany) { alert("Primero selecciona una empresa."); return; }
    document.getElementById("worker-form-title").textContent = "Agregar Nuevo Trabajador";
    document.getElementById("worker-form").reset();
    document.getElementById("worker-mode").value   = "add";
    document.getElementById("work-rut").disabled   = false;
    document.getElementById("work-rut").required   = true;
    document.getElementById("group-worker-rut").style.opacity = "1";
    document.getElementById("work-nacionalidad").value = "CHILENA";
    document.getElementById("btn-save-worker").textContent = "Guardar Trabajador";
    document.getElementById("worker-form-modal").classList.add("active");
}

function openEditWorkerModal(rut) {
    const w = companyWorkers.find(x => x.RolUni === rut);
    if (!w) return;

    document.getElementById("worker-form-title").textContent = `Editar Ficha: ${w.Nombre} ${w.Paterno}`;
    document.getElementById("worker-mode").value = "edit";
    document.getElementById("work-rut").value    = rut;
    document.getElementById("work-rut").disabled = true;
    document.getElementById("work-rut").required = false;
    document.getElementById("group-worker-rut").style.opacity = "0.7";

    document.getElementById("work-nombre").value      = w.Nombre       || "";
    document.getElementById("work-paterno").value     = w.Paterno      || "";
    document.getElementById("work-materno").value     = w.Materno      || "";
    document.getElementById("work-fecnac").value      = w.FecNac       || "";
    document.getElementById("work-fecingre").value    = w.FecIngre     || "";
    document.getElementById("work-ocupac").value      = w.Ocupac       || "";
    document.getElementById("work-depart").value      = w.Depart       || "";
    document.getElementById("work-tipocontrato").value = w.TipoContrato || "Indefinido";
    document.getElementById("work-sbase").value       = w.SBaseM       || "0";
    document.getElementById("work-afp").value         = w.AFPper       || "SIN AFP";
    document.getElementById("work-isa").value         = w.ISAper       || "Fonasa";
    document.getElementById("work-telefono").value    = w.Telefono     || "";
    document.getElementById("work-direcc").value      = w.Direcc       || "";
    document.getElementById("work-email").value       = w.EMail        || "";
    document.getElementById("work-nacionalidad").value = w.Nacionalidad || "CHILENA";
    document.getElementById("work-sexo").value        = w.SexoPe       || "Masculino";
    document.getElementById("work-banco").value       = w.Banco        || "";
    document.getElementById("work-cuentabanco").value = w.CuentaBanco  || "";
    document.getElementById("work-cargas").value      = w.Cargas       || "0";

    document.getElementById("btn-save-worker").textContent = "Guardar Cambios";
    document.getElementById("worker-form-modal").classList.add("active");
}

function closeWorkerFormModal() {
    document.getElementById("worker-form-modal").classList.remove("active");
}

async function saveWorker(event) {
    event.preventDefault();

    const mode         = document.getElementById("worker-mode").value;
    const rut          = document.getElementById("work-rut").value.trim();
    const nombre       = document.getElementById("work-nombre").value.trim();
    const paterno      = document.getElementById("work-paterno").value.trim();
    const materno      = document.getElementById("work-materno").value.trim();
    const fecnac       = document.getElementById("work-fecnac").value;
    const fecingre     = document.getElementById("work-fecingre").value;
    const ocupac       = document.getElementById("work-ocupac").value.trim();
    const depart       = document.getElementById("work-depart").value.trim();
    const tipocontrato = document.getElementById("work-tipocontrato").value;
    const sbase        = document.getElementById("work-sbase").value.trim();
    const afp          = document.getElementById("work-afp").value;
    const isa          = document.getElementById("work-isa").value;
    const telefono     = document.getElementById("work-telefono").value.trim();
    const direcc       = document.getElementById("work-direcc").value.trim();
    const email        = document.getElementById("work-email").value.trim();
    const nacionalidad = document.getElementById("work-nacionalidad").value.trim();
    const sexo         = document.getElementById("work-sexo").value;
    const banco        = document.getElementById("work-banco").value;
    const cuentabanco  = document.getElementById("work-cuentabanco").value.trim();
    const cargas       = document.getElementById("work-cargas").value || "0";

    try {
        if (appMode === "local") {
            const params = new URLSearchParams({
                empresa: selectedCompany, rut, nombre, paterno, materno,
                fecnac, fecingre, ocupac, depart, tipocontrato, sbase,
                afp, isa, telefono, direcc, email, nacionalidad, sexo,
                banco, cuentabanco, cargas
            });
            const url = `${API_BASE}/api/personal/${mode === "add" ? "add" : "update"}?${params}`;
            const r = await fetch(url);
            if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Error servidor"); }
        } else {
            await db.collection("trabajadores").doc(rut).set({
                Nombre: nombre, Paterno: paterno, Materno: materno,
                FecNac: fecnac, FecIngre: fecingre,
                Ocupac: ocupac, Depart: depart,
                TipoContrato: tipocontrato,
                SBaseM: sbase, AFPper: afp, ISAper: isa,
                Telefono: telefono, Direcc: direcc, EMail: email,
                Nacionalidad: nacionalidad, SexoPe: sexo,
                Banco: banco, CuentaBanco: cuentabanco,
                Cargas: parseInt(cargas) || 0,
                empresaId: selectedCompany, Finiquito: false
            }, { merge: true });
        }

        alert(mode === "add" ? "✅ Trabajador registrado correctamente!" : "✅ Datos actualizados!");
        closeWorkerFormModal();
        await loadWorkers(selectedCompany);
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function deleteWorker(rut, fullName) {
    if (!confirm(`¿Estás seguro de que deseas desvincular (Finiquitar) a '${fullName}'?\nEsta acción lo marcará como inactivo.`)) return;
    try {
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/personal/delete?empresa=${encodeURIComponent(selectedCompany)}&rut=${encodeURIComponent(rut)}`);
            if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Error"); }
        } else {
            await db.collection("trabajadores").doc(rut).update({ Finiquito: true });
        }
        alert("✅ Trabajador finiquitado con éxito!");
        await loadWorkers(selectedCompany);
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// ── Quick jump to liquidaciones for a worker ─────────────
function openLiqWorker(rut) {
    const w = companyWorkers.find(x => x.RolUni === rut);
    if (!w) return;
    // Set empresa selector
    document.getElementById("liq-empresa-select").value = selectedCompany;
    onLiqEmpresaChange().then(() => {
        document.getElementById("liq-worker-select").value = rut;
        onLiqWorkerChange();
    });
    switchTab("liquidaciones");
}

// ══════════════════════════════════════════════════════════
//  LIQUIDACIONES - Cálculo y generación
// ══════════════════════════════════════════════════════════

async function onLiqEmpresaChange() {
    const empId = document.getElementById("liq-empresa-select").value;
    if (!empId) {
        document.getElementById("liq-worker-select").innerHTML = '<option value="">-- Selecciona trabajador --</option>';
        return;
    }
    // Load workers for this company if different
    if (selectedCompany !== empId || !companyWorkers.length) {
        selectedCompany = empId;
        try {
            if (appMode === "local") {
                const r = await fetch(`${API_BASE}/api/personal?empresa=${encodeURIComponent(empId)}`);
                if (r.ok) companyWorkers = await r.json();
            } else {
                const snap = await db.collection("trabajadores").where("empresaId","==",empId).get();
                companyWorkers = [];
                snap.forEach(doc => { const d=doc.data(); d.RolUni=doc.id; if(!d.Finiquito) companyWorkers.push(d); });
            }
        } catch(err) { console.error(err); }
    }
    populateLiqWorkers();
}

function populateLiqWorkers() {
    const sel = document.getElementById("liq-worker-select");
    sel.innerHTML = '<option value="">-- Selecciona trabajador --</option>';
    companyWorkers.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w.RolUni;
        opt.textContent = `${w.Nombre||''} ${w.Paterno||''} (${w.RolUni})`;
        sel.appendChild(opt);
    });
}

function onLiqWorkerChange() {
    const rut = document.getElementById("liq-worker-select").value;
    liqCurrentWorker = companyWorkers.find(x => x.RolUni === rut) || null;
    if (liqCurrentWorker) {
        document.getElementById("liq-extras-card").style.display = "block";
    } else {
        document.getElementById("liq-extras-card").style.display = "none";
    }
}

// Main liquidación generator
function generateLiquidacion() {
    const empId = document.getElementById("liq-empresa-select").value;
    const rut   = document.getElementById("liq-worker-select").value;
    if (!empId || !rut) {
        alert("Selecciona empresa y trabajador para generar la liquidación.");
        return;
    }
    const w = companyWorkers.find(x => x.RolUni === rut);
    if (!w) return;
    const emp = allCompanies.find(e => e.DirName === empId);

    const mes        = document.getElementById("liq-mes").value;
    const anio       = parseInt(document.getElementById("liq-anio").value) || 2025;
    const dias       = parseInt(document.getElementById("liq-dias").value) || 30;
    const horas50    = parseFloat(document.getElementById("liq-horas-50").value) || 0;
    const horas100   = parseFloat(document.getElementById("liq-horas-100").value) || 0;
    const colacion   = parseInt(document.getElementById("liq-colacion").value) || 0;
    const moviliz    = parseInt(document.getElementById("liq-movilizacion").value) || 0;
    const bonoImp    = parseInt(document.getElementById("liq-bono-imp").value) || 0;
    const bonoNoImp  = parseInt(document.getElementById("liq-bono-noimpo").value) || 0;
    const gratifTipo = document.getElementById("liq-gratif-tipo").value;
    const cargas     = parseInt(document.getElementById("liq-cargas").value) || parseInt(w.Cargas) || 0;
    const diasAus    = parseInt(document.getElementById("liq-dias-aus").value) || 0;

    // ── Cálculos ─────────────────────────────────────────
    const sbase = parseInt(w.SBaseM) || 0;

    // Sueldo proporcional por días ausentes
    const descDiasAus = diasAus > 0 ? Math.round((sbase / 30) * diasAus) : 0;
    const sueldoBase  = sbase - descDiasAus;

    // Valor hora (jornada 45h semanales = 180h mensuales)
    const valorHora = Math.round(sbase / 180);

    // Horas extra
    const horasExtra50  = Math.round(valorHora * 1.5 * horas50);
    const horasExtra100 = Math.round(valorHora * 2.0 * horas100);

    // Gratificación
    let gratificacion = 0;
    if (gratifTipo === "garantizada") {
        const tope = Math.round((4.75 * IMM_2025) / 12);
        gratificacion = Math.min(Math.round(sbase * 0.25), tope);
    }

    // Asignación Familiar (valores aproximados 2025)
    const asigFamiliar = cargas * ASIG_FAM_TRAMO_A;

    // ── HABERES ──────────────────────────────────────────
    const haberes = [
        { concepto: "Sueldo Base", monto: sbase, imponible: true },
    ];
    if (diasAus > 0) haberes.push({ concepto: `Desc. ${diasAus} días ausencia`, monto: -descDiasAus, imponible: true });
    if (horasExtra50 > 0) haberes.push({ concepto: `HH.EE. 50% (${horas50} hrs)`, monto: horasExtra50, imponible: true });
    if (horasExtra100 > 0) haberes.push({ concepto: `HH.EE. 100% (${horas100} hrs)`, monto: horasExtra100, imponible: true });
    if (gratificacion > 0) haberes.push({ concepto: "Gratificación Garantizada", monto: gratificacion, imponible: true });
    if (bonoImp > 0) haberes.push({ concepto: "Bono Imponible", monto: bonoImp, imponible: true });
    if (colacion > 0) haberes.push({ concepto: "Asig. Colación", monto: colacion, imponible: false });
    if (moviliz > 0) haberes.push({ concepto: "Asig. Movilización", monto: moviliz, imponible: false });
    if (bonoNoImp > 0) haberes.push({ concepto: "Bono No Imponible", monto: bonoNoImp, imponible: false });
    if (asigFamiliar > 0) haberes.push({ concepto: `Asig. Familiar (${cargas} cargas)`, monto: asigFamiliar, imponible: false });

    // Totales haberes
    const totalImponible  = haberes.filter(h => h.imponible && h.monto > 0).reduce((a, h) => a + h.monto, 0);
    const totalNoImponible = haberes.filter(h => !h.imponible).reduce((a, h) => a + h.monto, 0);
    const totalHaberes    = haberes.reduce((a, h) => a + h.monto, 0);

    // ── DESCUENTOS ───────────────────────────────────────
    const afpRate   = AFP_RATES[w.AFPper] || 0;
    const montoAFP  = Math.round(totalImponible * afpRate);
    const montoSalud = Math.round(totalImponible * SALUD_RATE);
    const baseImpuesto = totalImponible - montoAFP - montoSalud; // Base imponible 2da categoría
    const montoImpuesto = calcularImpuesto2aCategoria(baseImpuesto);

    const descuentos = [
        { concepto: `AFP ${w.AFPper||'SIN AFP'} (${(afpRate*100).toFixed(2)}%)`, monto: montoAFP, code: "AFP" },
        { concepto: `Salud ${w.ISAper||'Fonasa'} (7%)`, monto: montoSalud, code: "ISA" },
        { concepto: `Impuesto 2ª Categoría`, monto: montoImpuesto, code: "IMP" },
    ];

    const totalDescuentos = descuentos.reduce((a, d) => a + d.monto, 0);
    const liquido         = totalHaberes - totalDescuentos;

    // ── Render HTML ──────────────────────────────────────
    const logo = emp?.LogoBase64;
    const mesNombreMap = { ENE:"Enero",FEB:"Febrero",MAR:"Marzo",ABR:"Abril",MAY:"Mayo",JUN:"Junio",JUL:"Julio",AGO:"Agosto",SEP:"Septiembre",OCT:"Octubre",NOV:"Noviembre",DIC:"Diciembre" };
    const mesNombre = mesNombreMap[mes] || mes;

    const haberesRows = haberes.map(h => `
        <tr>
            <td>${h.concepto}</td>
            <td style="text-align:center; font-size:11px; color:#666;">${h.imponible ? '✓' : '—'}</td>
            <td class="liq-td-right" style="color:${h.monto < 0 ? '#DC2626' : '#059669'}">${formatCLPdoc(Math.abs(h.monto))}${h.monto < 0 ? ' (-)' : ''}</td>
        </tr>`).join("");

    const descuentosRows = descuentos.map(d => `
        <tr>
            <td>${d.concepto}</td>
            <td class="liq-td-right" style="color:#DC2626;">${formatCLPdoc(d.monto)}</td>
        </tr>`).join("");

    const liqHtml = `
        <div class="liq-doc">
            <div style="text-align:right; margin-bottom:8px;" class="liq-print-actions">
                <button onclick="printLiquidacion()" style="background:#1a1a3e;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:12px;margin-right:6px;">🖨️ Imprimir / PDF</button>
            </div>

            <!-- Header -->
            <div class="liq-header">
                <div class="liq-logo-box">
                    ${logo ? `<img src="${logo}" alt="Logo">` : `<span class="liq-logo-placeholder">🏢</span>`}
                </div>
                <div class="liq-empresa-info">
                    <h2>${emp?.Empres || 'Empresa'}</h2>
                    <p>RUT: ${emp?.RolEmp || '-'}</p>
                    <p>${emp?.Direcc || ''} ${emp?.Direcc && emp?.Comuna ? ',' : ''} ${emp?.Comuna || ''}</p>
                    <p>${emp?.GiroCo || ''}</p>
                </div>
                <div class="liq-titulo">
                    <h3>Liquidación de Sueldo</h3>
                    <p>Período:</p>
                    <div class="liq-periodo">${mesNombre} ${anio}</div>
                    <p style="margin-top:8px; font-size:11px;">Días trabajados: <strong>${dias}</strong></p>
                </div>
            </div>

            <!-- Datos del Trabajador -->
            <div class="liq-trabajador">
                <div class="liq-row"><span class="liq-lbl">Trabajador:</span><span class="liq-val">${w.Nombre||''} ${w.Paterno||''} ${w.Materno||''}</span></div>
                <div class="liq-row"><span class="liq-lbl">RUT:</span><span class="liq-val">${w.RolUni}</span></div>
                <div class="liq-row"><span class="liq-lbl">Cargo:</span><span class="liq-val">${w.Ocupac||'-'}</span></div>
                <div class="liq-row"><span class="liq-lbl">Departamento:</span><span class="liq-val">${w.Depart||'-'}</span></div>
                <div class="liq-row"><span class="liq-lbl">Fecha Ingreso:</span><span class="liq-val">${w.FecIngre ? formatDate(w.FecIngre) : '-'}</span></div>
                <div class="liq-row"><span class="liq-lbl">Tipo Contrato:</span><span class="liq-val">${w.TipoContrato||'Indefinido'}</span></div>
                <div class="liq-row"><span class="liq-lbl">AFP:</span><span class="liq-val">${w.AFPper||'SIN AFP'}</span></div>
                <div class="liq-row"><span class="liq-lbl">Salud:</span><span class="liq-val">${w.ISAper||'Fonasa'}</span></div>
            </div>

            <!-- Tablas Haberes + Descuentos lado a lado -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
                <div>
                    <table class="liq-table">
                        <thead><tr><th>Haberes</th><th style="text-align:center;">Imponible</th><th style="text-align:right;">Monto</th></tr></thead>
                        <tbody>
                            ${haberesRows}
                            <tr class="liq-total-row">
                                <td colspan="2"><strong>TOTAL HABERES</strong></td>
                                <td class="liq-td-right">${formatCLPdoc(totalHaberes)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div>
                    <table class="liq-table">
                        <thead><tr><th>Descuentos Legales</th><th style="text-align:right;">Monto</th></tr></thead>
                        <tbody>
                            ${descuentosRows}
                            <tr class="liq-total-row">
                                <td><strong>TOTAL DESCUENTOS</strong></td>
                                <td class="liq-td-right">${formatCLPdoc(totalDescuentos)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <table class="liq-table" style="margin-top:10px;">
                        <thead><tr><th>Bases de Cálculo</th><th style="text-align:right;">Monto</th></tr></thead>
                        <tbody>
                            <tr><td>Total Imponible</td><td class="liq-td-right">${formatCLPdoc(totalImponible)}</td></tr>
                            <tr><td>Total No Imponible</td><td class="liq-td-right">${formatCLPdoc(totalNoImponible)}</td></tr>
                            <tr><td>Base Imponible Impuesto</td><td class="liq-td-right">${formatCLPdoc(baseImpuesto)}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Totales -->
            <div class="liq-totales">
                <div class="liq-total-box haberes-box">
                    <div class="lbl">Total Haberes</div>
                    <div class="val">${formatCLPdoc(totalHaberes)}</div>
                </div>
                <div class="liq-total-box descuentos-box">
                    <div class="lbl">Total Descuentos</div>
                    <div class="val">${formatCLPdoc(totalDescuentos)}</div>
                </div>
                <div class="liq-total-box liquido-box">
                    <div class="lbl">LÍQUIDO A PAGO</div>
                    <div class="val">${formatCLPdoc(liquido)}</div>
                </div>
            </div>

            <!-- Footer: firmas -->
            <div class="liq-footer-info">
                <div>
                    <div class="liq-firma-box">Firma del Trabajador</div>
                    <p style="margin-top:4px; text-align:center;">${w.Nombre||''} ${w.Paterno||''} ${w.Materno||''}<br>${w.RolUni}</p>
                </div>
                <div>
                    <div class="liq-firma-box">Firma del Empleador / Rep. Legal</div>
                    <p style="margin-top:4px; text-align:center;">${emp?.Repres||'Representante Legal'}<br>${emp?.Empres||''}</p>
                </div>
            </div>

            <p style="text-align:center; font-size:10px; color:#888; margin-top:16px; border-top:1px solid #eee; padding-top:8px;">
                Liquidación generada por RemuGest v1.3 · ${new Date().toLocaleDateString('es-CL')} · ${emp?.Mutualidad||''} ${emp?.Mutualidad ? '·' : ''} Sistema de Remuneraciones
            </p>
        </div>`;

    document.getElementById("liq-preview-area").innerHTML = liqHtml;

    // Store for printing
    document.getElementById("print-area").innerHTML = document.getElementById("liq-preview-area").innerHTML;
}

// ── Impuesto 2ª Categoría (tabla SII 2025 estimada) ──────
function calcularImpuesto2aCategoria(baseImponible) {
    if (baseImponible <= 0) return 0;

    const utm = UTM_2025;
    const tramos = [
        { desde: 0,      hasta: 13.5,  factor: 0,     rebaja: 0      },
        { desde: 13.5,   hasta: 30,    factor: 0.04,  rebaja: 0.54   },
        { desde: 30,     hasta: 50,    factor: 0.08,  rebaja: 1.74   },
        { desde: 50,     hasta: 70,    factor: 0.135, rebaja: 4.49   },
        { desde: 70,     hasta: 90,    factor: 0.23,  rebaja: 11.14  },
        { desde: 90,     hasta: 120,   factor: 0.304, rebaja: 17.80  },
        { desde: 120,    hasta: 150,   factor: 0.35,  rebaja: 23.20  },
        { desde: 150,    hasta: Infinity, factor: 0.40, rebaja: 30.70 },
    ];

    const baseUtm = baseImponible / utm;
    let impuesto = 0;

    for (const t of tramos) {
        if (baseUtm > t.desde && baseUtm <= t.hasta) {
            impuesto = (baseImponible * t.factor) - (t.rebaja * utm);
            break;
        }
    }

    return Math.max(0, Math.round(impuesto));
}

// ── Print Liquidación ────────────────────────────────────
function printLiquidacion() {
    // Copy current liq into print area
    const liqContent = document.getElementById("liq-preview-area").innerHTML;
    document.getElementById("print-area").innerHTML = liqContent;
    window.print();
}

// ══════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════

async function loadUsers() {
    try {
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/usuarios`);
            if (!r.ok) throw new Error("Error al cargar usuarios");
            allUsers = await r.json();
        } else {
            const snap = await db.collection("users").get();
            allUsers = [];
            snap.forEach(doc => { const d=doc.data(); d.Codigo=doc.id; allUsers.push(d); });
        }

        document.getElementById("stat-users-count").textContent = allUsers.length;
        const tbody = document.getElementById("users-table-body");

        if (!allUsers.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">No hay usuarios configurados.</td></tr>`;
            return;
        }

        tbody.innerHTML = allUsers.map(u => {
            const claveDisplay = appMode === "local"
                ? `<code>${u.Clave}</code>`
                : `<span class="text-muted">Protegida por Auth</span>`;
            return `<tr>
                <td><strong>${u.Codigo}</strong></td>
                <td>${u.Nombre||'-'}</td>
                <td>${claveDisplay}</td>
                <td>${u.Administrador ? '<span class="text-success">Administrador</span>' : 'Usuario'}</td>
                <td><button class="btn btn-danger" onclick="deleteUser('${u.Codigo}')">Eliminar</button></td>
            </tr>`;
        }).join("");
    } catch (err) {
        console.error("Error loading users:", err);
        document.getElementById("users-table-body").innerHTML =
            `<tr><td colspan="5" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function createUser(event) {
    event.preventDefault();
    const codigo = document.getElementById("user-code").value.trim();
    const nombre = document.getElementById("user-name").value.trim();
    const clave  = document.getElementById("user-pass").value.trim();
    const admin  = document.getElementById("user-admin").checked ? "true" : "false";

    try {
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/usuarios/add?codigo=${encodeURIComponent(codigo)}&nombre=${encodeURIComponent(nombre)}&clave=${encodeURIComponent(clave)}&admin=${admin}`);
            if (!r.ok) throw new Error("Error al crear usuario");
            const res = await r.json();
            if (!res.success) throw new Error("Error al registrar");
        } else {
            await db.collection("users").doc(codigo).set({ Nombre: nombre, Administrador: admin === "true" });
        }
        alert(`✅ Usuario '${codigo}' agregado correctamente!`);
        document.getElementById("add-user-form").reset();
        await loadUsers();
    } catch (err) {
        alert(`Error al crear usuario: ${err.message}`);
    }
}

async function deleteUser(codigo) {
    if (["admin","supervisor"].includes(codigo.toLowerCase())) {
        alert("Por seguridad, no se pueden eliminar las cuentas administradoras críticas.");
        return;
    }
    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario '${codigo}'?`)) return;

    try {
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/usuarios/delete?codigo=${encodeURIComponent(codigo)}`);
            if (!r.ok) throw new Error("Error al eliminar usuario");
        } else {
            await db.collection("users").doc(codigo).delete();
        }
        alert("✅ Usuario eliminado correctamente.");
        await loadUsers();
    } catch (err) {
        alert(`Error al eliminar usuario: ${err.message}`);
    }
}

// ══════════════════════════════════════════════════════════
//  PARAMS & COMUNAS
// ══════════════════════════════════════════════════════════

async function loadParams() {
    try {
        let params = [];
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/parametros`);
            if (!r.ok) throw new Error("Error al cargar parámetros");
            params = await r.json();
        } else {
            const snap = await db.collection("parameters").get();
            snap.forEach(doc => { const d=doc.data(); d.Id_Parametro=doc.id; params.push(d); });
        }

        const tbody = document.getElementById("params-table-body");
        if (!params.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No hay parámetros globales.</td></tr>`;
            return;
        }
        tbody.innerHTML = params.map(p => `
            <tr>
                <td>${p.Id_Parametro||'-'}</td>
                <td><strong>${p.CodParametro||'-'}</strong></td>
                <td>${p.ValParametro||'-'}</td>
                <td>${p.DesParametro||'-'}</td>
            </tr>`).join("");
    } catch (err) {
        console.error("Error loading params:", err);
        document.getElementById("params-table-body").innerHTML =
            `<tr><td colspan="4" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function loadComunas() {
    try {
        let comunas = [];
        if (appMode === "local") {
            const r = await fetch(`${API_BASE}/api/comunas`);
            if (!r.ok) throw new Error("Error al cargar comunas");
            comunas = await r.json();
        } else {
            const snap = await db.collection("comunas").get();
            snap.forEach(doc => { const d=doc.data(); d.CodComuna=doc.id; comunas.push(d); });
            comunas.sort((a,b) => (a.NomComuna||"").localeCompare(b.NomComuna||""));
        }

        const tbody = document.getElementById("comunas-table-body");
        if (!comunas.length) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">No hay comunas registradas.</td></tr>`;
            return;
        }

        tbody.innerHTML = comunas.slice(0,100).map(c => `
            <tr>
                <td><code>${c.CodComuna||'-'}</code></td>
                <td><strong>${c.NomComuna||'-'}</strong></td>
            </tr>`).join("");

        if (comunas.length > 100) {
            tbody.innerHTML += `<tr><td colspan="2" class="text-center text-muted">... y ${comunas.length - 100} comunas más.</td></tr>`;
        }
    } catch (err) {
        console.error("Error loading comunas:", err);
        document.getElementById("comunas-table-body").innerHTML =
            `<tr><td colspan="2" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

// ══════════════════════════════════════════════════════════
//  MIGRATION: LOCAL → FIREBASE
// ══════════════════════════════════════════════════════════

async function migrateLocalToFirebase() {
    if (appMode !== "local") { alert("La migración solo se puede iniciar en Modo Local (MDB)."); return; }
    if (!confirm("Esto iniciará la migración de TODAS tus bases de datos locales (.mdb) a Firebase Firestore.\n¿Estás listo?")) return;

    const progressArea = document.getElementById("sync-progress-area");
    const progressBar  = document.getElementById("sync-progress-bar");
    const statusMsg    = document.getElementById("sync-status-msg");

    progressArea.style.display = "block";
    progressBar.style.width    = "0%";
    statusMsg.textContent      = "Iniciando migración, cargando empresas...";

    try {
        const compResponse = await fetch(`${API_BASE}/api/empresas`);
        if (!compResponse.ok) throw new Error("No se pudo obtener el listado de empresas locales");
        const localCompanies = await compResponse.json();

        if (!localCompanies.length) {
            statusMsg.textContent = "No hay empresas locales para migrar.";
            progressBar.style.width = "100%";
            return;
        }

        let totalSteps  = localCompanies.length * 3 + 3;
        let currentStep = 0;

        const updateProgress = (msg) => {
            currentStep++;
            const pct = Math.min(100, Math.round((currentStep / totalSteps) * 100));
            progressBar.style.width = `${pct}%`;
            statusMsg.textContent   = `[${pct}%] ${msg}`;
        };

        for (const emp of localCompanies) {
            if (emp.Error) continue;
            updateProgress(`Migrando empresa: ${emp.Empres}`);

            await db.collection("empresas").doc(emp.DirName).set({
                Empres: emp.Empres||"-", RolEmp: emp.RolEmp||"00000000-0",
                Direcc: emp.Direcc||"-", Comuna: emp.Comuna||"-",
                Ciudad: emp.Ciudad||"-", GiroCo: emp.GiroCo||"-",
                Repres: emp.Repres||"-", RolRep: emp.RolRep||"-",
                TelEmp: emp.TelEmp||"", EmailEmp: emp.EmailEmp||"",
                Mutualidad: emp.Mutualidad||"ISL", Banco: emp.Banco||"",
                LogoBase64: emp.LogoBase64||""
            }, { merge: true });

            const workersResponse = await fetch(`${API_BASE}/api/personal?empresa=${encodeURIComponent(emp.DirName)}`);
            if (workersResponse.ok) {
                const localWorkers = await workersResponse.json();
                updateProgress(`Sincronizando ${localWorkers.length} trabajadores de ${emp.DirName}`);

                for (const w of localWorkers) {
                    await db.collection("trabajadores").doc(w.RolUni).set({
                        Nombre: w.Nombre||"", Paterno: w.Paterno||"", Materno: w.Materno||"",
                        FecNac: w.FecNac||"", FecIngre: w.FecIngre||"",
                        Ocupac: w.Ocupac||"", Depart: w.Depart||"",
                        TipoContrato: w.TipoContrato||"Indefinido",
                        SBaseM: w.SBaseM||"0", AFPper: w.AFPper||"SIN AFP",
                        ISAper: w.ISAper||"Fonasa", Telefono: w.Telefono||"",
                        Direcc: w.Direcc||"", EMail: w.EMail||"",
                        Nacionalidad: w.Nacionalidad||"CHILENA", SexoPe: w.SexoPe||"Masculino",
                        Banco: w.Banco||"", CuentaBanco: w.CuentaBanco||"",
                        Cargas: parseInt(w.Cargas)||0,
                        empresaId: emp.DirName, Finiquito: w.Finiquito||false
                    }, { merge: true });

                    const txsResponse = await fetch(`${API_BASE}/api/transacciones?empresa=${encodeURIComponent(emp.DirName)}&rut=${encodeURIComponent(w.RolUni)}`);
                    if (txsResponse.ok) {
                        const localTxs = await txsResponse.json();
                        for (const t of localTxs) {
                            const txId = `${w.RolUni}_${emp.DirName}_${t.MesTra}`;
                            await db.collection("transacciones").doc(txId).set({
                                RolUni: t.RolUni, empresaId: emp.DirName, MesTra: t.MesTra,
                                DisTra: t.DisTra||"30", TotalH: parseInt(t.TotalH)||0,
                                TotalD: parseInt(t.TotalD)||0, Liquid: parseInt(t.Liquid)||0,
                                NomAFP: t.NomAFP||"-", MontoA: parseInt(t.MontoA)||0,
                                NomISA: t.NomISA||"-", MontoI: parseInt(t.MontoI)||0
                            }, { merge: true });
                        }
                    }
                }
            }
            updateProgress(`Completada empresa ${emp.DirName}`);
        }

        updateProgress("Sincronizando usuarios administradores...");
        const usersResponse = await fetch(`${API_BASE}/api/usuarios`);
        if (usersResponse.ok) {
            const localUsers = await usersResponse.json();
            for (const u of localUsers) {
                await db.collection("users").doc(u.Codigo).set({ Nombre: u.Nombre||"-", Administrador: u.Administrador||false }, { merge: true });
            }
        }

        updateProgress("Sincronizando parámetros tributarios...");
        const paramsResponse = await fetch(`${API_BASE}/api/parametros`);
        if (paramsResponse.ok) {
            const localParams = await paramsResponse.json();
            for (const p of localParams) {
                await db.collection("parameters").doc(p.Id_Parametro.toString()).set({
                    CodParametro: p.CodParametro||"", ValParametro: p.ValParametro||"", DesParametro: p.DesParametro||""
                }, { merge: true });
            }
        }

        updateProgress("Sincronizando comunas de Chile...");
        const comunasResponse = await fetch(`${API_BASE}/api/comunas`);
        if (comunasResponse.ok) {
            const localComunas = await comunasResponse.json();
            for (const c of localComunas.slice(0,150)) {
                await db.collection("comunas").doc(c.CodComuna.toString()).set({ NomComuna: c.NomComuna||"" }, { merge: true });
            }
        }

        progressBar.style.width = "100%";
        statusMsg.innerHTML = "<strong class='text-success'>🎉 ¡Migración finalizada con éxito! Todos tus datos están ahora en Firebase Cloud.</strong>";
        alert("✅ Sincronización completada! Ya puedes cambiar a 'Modo Nube' e iniciar sesión.");
    } catch (err) {
        console.error("Migration Error:", err);
        statusMsg.innerHTML = `<span class='text-danger'>Error: ${err.message}</span>`;
    }
}

// ══════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════

function formatCLP(val) {
    if (val === null || val === undefined || isNaN(val)) return "$0";
    return new Intl.NumberFormat("es-CL", { style:"currency", currency:"CLP", minimumFractionDigits:0 }).format(val);
}

// For the liquidacion document (white background, simpler)
function formatCLPdoc(val) {
    if (!val && val !== 0) return "$0";
    return "$" + Math.round(val).toLocaleString("es-CL");
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    try {
        // Handle both YYYY-MM-DD and DD/MM/YYYY
        const d = new Date(dateStr);
        if (!isNaN(d)) return d.toLocaleDateString("es-CL");
    } catch(e) { }
    return dateStr;
}
