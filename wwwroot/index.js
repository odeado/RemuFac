// Firebase Config provided by User
const firebaseConfig = {
  apiKey: "AIzaSyAn8YsM1TC_Ub2N0m2XX5wnMGbdlNsIp2g",
  authDomain: "ups-monitor-f9b33.firebaseapp.com",
  projectId: "ups-monitor-f9b33",
  storageBucket: "ups-monitor-f9b33.firebasestorage.app",
  messagingSenderId: "746915871851",
  appId: "1:746915871851:web:28fd4fec3a67f64d32052e"
};

// Initialize Firebase Compat
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// App state & Localhost detection
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
let appMode = localStorage.getItem("appMode");
if (!appMode) {
    appMode = isLocalhost ? "local" : "cloud";
}
if (!isLocalhost) {
    appMode = "cloud";
}
let allCompanies = [];
let selectedCompany = null;
let companyWorkers = [];
let allUsers = [];

// Base API URL
const API_BASE = "";

// On DOM Loaded
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

// App Initialization
async function initApp() {
    // Listen to Firebase Auth state
    auth.onAuthStateChanged(user => {
        if (appMode === "cloud") {
            if (user) {
                // User is signed in in cloud mode
                document.getElementById("login-overlay").classList.remove("active");
                document.getElementById("btn-logout").style.display = "inline-flex";
                
                // Set avatar and name
                document.getElementById("user-display-name").textContent = user.email;
                document.getElementById("user-display-role").textContent = "Administrador Nube";
                document.getElementById("user-avatar-text").textContent = user.email.substring(0, 2).toUpperCase();
                
                // Load Cloud Data
                loadAllData();
            } else {
                // No user signed in, show login card
                document.getElementById("login-overlay").classList.add("active");
                document.getElementById("btn-logout").style.display = "none";
            }
        }
    });

    // Set UI according to mode
    applyModeUI();

    if (appMode === "local") {
        // In local mode, bypass login and load local data immediately
        document.getElementById("login-overlay").classList.remove("active");
        document.getElementById("btn-logout").style.display = "none";
        document.getElementById("user-display-name").textContent = "Administrador Local";
        document.getElementById("user-display-role").textContent = "Control Total";
        document.getElementById("user-avatar-text").textContent = "AL";
        
        loadAllData();
    }
}

// Load all dashboard components
async function loadAllData() {
    await loadCompanies();
    await loadUsers();
    await loadParams();
    await loadComunas();
}

// Mode UI Switcher styling changes
function applyModeUI() {
    const isCloud = appMode === "cloud";
    
    // Toggle active buttons in sidebar
    document.getElementById("btn-mode-local").classList.toggle("active", !isCloud);
    document.getElementById("btn-mode-cloud").classList.toggle("active", isCloud);

    // Hide switcher in production domains
    const switcher = document.querySelector(".mode-switcher-container");
    if (switcher) {
        switcher.style.display = isLocalhost ? "flex" : "none";
    }

    // Update status bar
    const dot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");
    const versionText = document.getElementById("version-text");
    const syncCard = document.getElementById("sync-card");

    if (isCloud) {
        dot.className = "dot online";
        dot.style.backgroundColor = "#6366F1";
        dot.style.boxShadow = "0 0 8px #6366F1";
        statusText.textContent = "Modo Nube (Firebase)";
        versionText.textContent = "v1.2 (Firebase Cloud)";
        if (syncCard) syncCard.style.display = "none"; // Hide sync tool in cloud mode
        
        // Hide password column header & password data for security in cloud mode
        document.getElementById("th-clave").style.display = "none";
        document.getElementById("admin-subtitle").textContent = "Gestión de cuentas de administrador alojadas en Firebase Firestore.";
        document.getElementById("dirname-desc").textContent = "Esto registrará la empresa en la base de datos centralizada de Firestore.";
    } else {
        dot.className = "dot online";
        dot.style.backgroundColor = "#10B981";
        dot.style.boxShadow = "0 0 8px #10B981";
        statusText.textContent = "Servidor Local Conectado";
        versionText.textContent = "v1.2 (Access MDB)";
        if (syncCard) syncCard.style.display = "block"; // Show sync tool in local mode
        
        document.getElementById("th-clave").style.display = "";
        document.getElementById("admin-subtitle").textContent = "Gestión directa de usuarios administradores guardados de forma segura en Key.mdb.";
        document.getElementById("dirname-desc").textContent = "Esto creará una carpeta física en el servidor y su respectiva base de datos.";
    }
}

// Switch Mode
function setMode(mode) {
    if (mode === appMode) return;
    appMode = mode;
    localStorage.setItem("appMode", mode);
    
    applyModeUI();

    if (mode === "cloud") {
        const user = auth.currentUser;
        if (!user) {
            document.getElementById("login-overlay").classList.add("active");
        } else {
            document.getElementById("login-overlay").classList.remove("active");
            loadAllData();
        }
    } else {
        document.getElementById("login-overlay").classList.remove("active");
        initApp(); // reload local
    }
}

// ----------------------------------------
// FIREBASE AUTHENTICATION HANDLERS
// ----------------------------------------

async function handleFirebaseLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value.trim();
    const errMsg = document.getElementById("login-error-msg");

    errMsg.style.display = "none";

    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
        console.error("Login Error:", err);
        errMsg.textContent = "Error al iniciar sesión: " + err.message;
        errMsg.style.display = "block";
    }
}

async function handleFirebaseLogout() {
    try {
        await auth.signOut();
        setMode("local"); // fallback to local on logout
    } catch (err) {
        alert("Error al cerrar sesión: " + err.message);
    }
}

// ----------------------------------------
// DATA LOADERS (LOCAL OR FIREBASE FIRESTORE)
// ----------------------------------------

async function loadCompanies() {
    try {
        if (appMode === "local") {
            const response = await fetch(`${API_BASE}/api/empresas`);
            if (!response.ok) throw new Error("Error fetching companies from local API");
            allCompanies = await response.json();
        } else {
            // Firestore Query
            const snapshot = await db.collection("empresas").get();
            allCompanies = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                data.DirName = doc.id;
                allCompanies.push(data);
            });
        }

        // Render stats
        document.getElementById("stat-companies-count").textContent = allCompanies.length;

        // Render lists
        renderQuickCompanies();
        renderFullCompanies();
        populateCompanySelectors();
    } catch (err) {
        console.error("Error loading companies:", err);
        const errHtml = `<div class="loading-spinner text-danger">Error al cargar empresas: ${err.message}</div>`;
        document.getElementById("quick-companies-list").innerHTML = errHtml;
        document.getElementById("companies-full-list").innerHTML = errHtml;
    }
}

// Render Quick Companies in Dashboard
function renderQuickCompanies() {
    const list = document.getElementById("quick-companies-list");
    if (allCompanies.length === 0) {
        list.innerHTML = `<div class="loading-spinner">No hay empresas declaradas.</div>`;
        return;
    }

    list.innerHTML = allCompanies.map(emp => {
        if (emp.Error) {
            return `
                <div class="company-card" style="opacity: 0.7;">
                    <h4>${emp.DirName}</h4>
                    <div class="company-card-detail">Error de base de datos</div>
                    <div class="company-card-tag" style="background: rgba(239, 68, 68, 0.1); color: #F87171;">Inaccesible</div>
                </div>
            `;
        }
        return `
            <div class="company-card">
                <div onclick="selectCompany('${emp.DirName}')">
                    <h4>${emp.Empres}</h4>
                    <div class="company-card-detail">RUT: <strong>${emp.RolEmp || '-'}</strong></div>
                    <div class="company-card-detail">Giro: <strong>${emp.GiroCo || '-'}</strong></div>
                    <div class="company-card-tag">${emp.DirName}</div>
                </div>
                <div class="company-card-actions">
                    <button class="btn btn-action" onclick="openEditCompanyModal('${emp.DirName}')">✏️ Editar Datos</button>
                </div>
            </div>
        `;
    }).join("");
}

// Render Full Companies list
function renderFullCompanies() {
    const list = document.getElementById("companies-full-list");
    if (allCompanies.length === 0) {
        list.innerHTML = `<div class="loading-spinner">No hay empresas declaradas.</div>`;
        return;
    }

    list.innerHTML = allCompanies.map(emp => {
        if (emp.Error) {
            return `
                <div class="company-card" style="opacity: 0.7;">
                    <h4>${emp.DirName}</h4>
                    <div class="company-card-detail">Error: <strong>${emp.Error}</strong></div>
                    <div class="company-card-tag" style="background: rgba(239, 68, 68, 0.1); color: #F87171;">Inaccesible</div>
                </div>
            `;
        }
        return `
            <div class="company-card">
                <div onclick="selectCompany('${emp.DirName}')">
                    <h4>${emp.Empres}</h4>
                    <div class="company-card-detail">RUT: <strong>${emp.RolEmp || '-'}</strong></div>
                    <div class="company-card-detail">Dirección: <strong>${emp.Direcc || '-'}, ${emp.Comuna || '-'}</strong></div>
                    <div class="company-card-detail">Giro: <strong>${emp.GiroCo || '-'}</strong></div>
                    <div class="company-card-detail">Representante: <strong>${emp.Repres || '-'} (${emp.RolRep || '-'})</strong></div>
                    <div class="company-card-tag">${emp.DirName}</div>
                </div>
                <div class="company-card-actions">
                    <button class="btn btn-action" onclick="openEditCompanyModal('${emp.DirName}')">✏️ Editar Datos</button>
                </div>
            </div>
        `;
    }).join("");
}

// Populate Company Selectors
function populateCompanySelectors() {
    const select = document.getElementById("company-select");
    select.innerHTML = '<option value="">-- Selecciona Empresa --</option>';
    allCompanies.forEach(emp => {
        if (!emp.Error) {
            const opt = document.createElement("option");
            opt.value = emp.DirName;
            opt.textContent = emp.Empres;
            select.appendChild(opt);
        }
    });
}

// Select a Company
function selectCompany(dirName) {
    selectedCompany = dirName;
    document.getElementById("company-select").value = dirName;
    switchTab("personal");
    loadWorkers(dirName);
}

// Handler for select change
function loadWorkersForSelect(dirName) {
    if (dirName) {
        selectedCompany = dirName;
        loadWorkers(dirName);
    } else {
        selectedCompany = null;
        document.getElementById("workers-table-body").innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted">Selecciona una empresa para cargar la planilla de personal.</td>
            </tr>
        `;
        document.getElementById("selected-company-subtitle").textContent = "Selecciona una empresa para ver su personal";
        document.getElementById("btn-add-worker").style.display = "none";
    }
}

// Load Workers
async function loadWorkers(dirName) {
    const tbody = document.getElementById("workers-table-body");
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">Cargando planilla de personal...</td></tr>`;

    const empObj = allCompanies.find(e => e.DirName === dirName);
    document.getElementById("selected-company-subtitle").textContent = empObj ? `Mostrando personal de: ${empObj.Empres}` : `Mostrando personal de ${dirName}`;
    
    // Show Add Worker button
    document.getElementById("btn-add-worker").style.display = "inline-flex";

    try {
        if (appMode === "local") {
            const response = await fetch(`${API_BASE}/api/personal?empresa=${encodeURIComponent(dirName)}`);
            if (!response.ok) throw new Error("Error fetching workers");
            companyWorkers = await response.json();
        } else {
            // Firestore Query
            const snapshot = await db.collection("trabajadores")
                                     .where("empresaId", "==", dirName)
                                     .get();
            companyWorkers = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                data.RolUni = doc.id;
                // Soft delete filter
                if (!data.Finiquito) {
                    companyWorkers.push(data);
                }
            });
        }

        // Update Dashboard Stats count dynamically
        const totalActives = companyWorkers.filter(w => !w.Finiquito).length;
        document.getElementById("stat-workers-count").textContent = totalActives;

        renderWorkers();
    } catch (err) {
        console.error("Error loading workers:", err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

// Format Currency
function formatCLP(val) {
    if (val === null || val === undefined || isNaN(val)) return "$0";
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(val);
}

// Render Workers Table
function renderWorkers(filterText = "") {
    const tbody = document.getElementById("workers-table-body");
    const filtered = companyWorkers.filter(w => {
        if (!filterText) return true;
        const text = filterText.toLowerCase();
        const fullname = `${w.Nombre || ''} ${w.Paterno || ''} ${w.Materno || ''}`.toLowerCase();
        return (w.RolUni && w.RolUni.toLowerCase().includes(text)) ||
               fullname.includes(text) ||
               (w.Ocupac && w.Ocupac.toLowerCase().includes(text)) ||
               (w.Depart && w.Depart.toLowerCase().includes(text));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No se encontraron trabajadores activos.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(w => {
        const baseSueldo = parseInt(w.SBaseM) || 0;
        return `
            <tr>
                <td><strong>${w.RolUni || '-'}</strong></td>
                <td>${w.Nombre || ''} ${w.Paterno || ''} ${w.Materno || ''}</td>
                <td>${w.Ocupac || '-'}</td>
                <td>${formatCLP(baseSueldo)}</td>
                <td>${w.AFPper || '-'}</td>
                <td>${w.ISAper || '-'}</td>
                <td>${w.EMail || '-'}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-action" onclick="viewWorkerDetails('${w.RolUni}', '${escapeQuote(w.Nombre || '')} ${escapeQuote(w.Paterno || '')}')">
                            📊 Ver Historial
                        </button>
                        <button class="btn btn-action" onclick="openEditWorkerModal('${w.RolUni}')">
                            ✏️ Editar
                        </button>
                        <button class="btn btn-danger" onclick="deleteWorker('${w.RolUni}', '${escapeQuote(w.Nombre || '')} ${escapeQuote(w.Paterno || '')}')">
                            ❌ Finiquito
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function escapeQuote(str) {
    return str.replace(/'/g, "\\'");
}

// Global search box handler
function handleGlobalSearch() {
    const text = document.getElementById("global-search").value;
    if (document.getElementById("sec-personal").classList.contains("active")) {
        renderWorkers(text);
    }
}

// View Employee details and history
async function viewWorkerDetails(rut, fullName) {
    document.getElementById("modal-worker-title").textContent = `Historial Salarial de: ${fullName}`;
    
    // Set basic info
    const w = companyWorkers.find(x => x.RolUni === rut);
    if (!w) return;

    document.getElementById("w-rut").textContent = w.RolUni || '-';
    document.getElementById("w-ocupac").textContent = w.Ocupac || '-';
    document.getElementById("w-sbase").textContent = formatCLP(parseInt(w.SBaseM) || 0);
    document.getElementById("w-afp").textContent = w.AFPper || '-';
    document.getElementById("w-isa").textContent = w.ISAper || '-';
    document.getElementById("w-email").textContent = w.EMail || '-';

    const historyTbody = document.getElementById("w-history-table-body");
    historyTbody.innerHTML = `<tr><td colspan="7" class="text-center">Cargando liquidaciones históricas...</td></tr>`;

    // Open Modal
    document.getElementById("worker-modal").classList.add("active");

    try {
        let txs = [];
        if (appMode === "local") {
            const response = await fetch(`${API_BASE}/api/transacciones?empresa=${encodeURIComponent(selectedCompany)}&rut=${encodeURIComponent(rut)}`);
            if (!response.ok) throw new Error("Error loading transactions");
            txs = await response.json();
        } else {
            // Firestore Query
            const snapshot = await db.collection("transacciones")
                                     .where("RolUni", "==", rut)
                                     .where("empresaId", "==", selectedCompany)
                                     .get();
            snapshot.forEach(doc => {
                txs.push(doc.data());
            });
            
            // Sort by month (since client-side sort is needed when querying Firestore without index configs)
            const monthOrder = { "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12 };
            txs.sort((a, b) => (monthOrder[a.MesTra] || 0) - (monthOrder[b.MesTra] || 0));
        }

        if (txs.length === 0) {
            historyTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No se registran liquidaciones históricas para este RUT.</td></tr>`;
            return;
        }

        historyTbody.innerHTML = txs.map(t => {
            return `
                <tr>
                    <td><strong>${t.MesTra || '-'}</strong></td>
                    <td>${t.DisTra || '0'}</td>
                    <td class="text-success"><strong>${formatCLP(t.TotalH)}</strong></td>
                    <td class="text-danger">${formatCLP(t.TotalD)}</td>
                    <td><strong>${formatCLP(t.Liquid)}</strong></td>
                    <td>${formatCLP(t.MontoA)} (${t.NomAFP || '-'})</td>
                    <td>${formatCLP(t.MontoI)} (${t.NomISA || '-'})</td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        historyTbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

function closeWorkerModal() {
    document.getElementById("worker-modal").classList.remove("active");
}

// ----------------------------------------
// COMPANY CRUD ACTIONS
// ----------------------------------------

function openAddCompanyModal() {
    document.getElementById("company-modal-title").textContent = "Registrar Nueva Empresa";
    document.getElementById("company-form").reset();
    document.getElementById("company-mode").value = "add";
    
    // Show directory key group
    document.getElementById("group-dirname").style.display = "flex";
    document.getElementById("comp-dirname").required = true;
    
    document.getElementById("btn-save-company").textContent = "Registrar Empresa";
    document.getElementById("company-form-modal").classList.add("active");
}

function openEditCompanyModal(dirName) {
    const emp = allCompanies.find(e => e.DirName === dirName);
    if (!emp) return;

    document.getElementById("company-modal-title").textContent = `Editar Empresa: ${emp.Empres}`;
    document.getElementById("company-mode").value = "edit";
    
    // Hide directory key group (primary key)
    document.getElementById("group-dirname").style.display = "none";
    document.getElementById("comp-dirname").required = false;
    document.getElementById("comp-dirname").value = dirName;

    // Populate fields
    document.getElementById("comp-empres").value = emp.Empres || "";
    document.getElementById("comp-rolemp").value = emp.RolEmp || "";
    document.getElementById("comp-giro").value = emp.GiroCo || "";
    document.getElementById("comp-direcc").value = emp.Direcc || "";
    document.getElementById("comp-comuna").value = emp.Comuna || "";
    document.getElementById("comp-repres").value = emp.Repres || "";
    document.getElementById("comp-rolrep").value = emp.RolRep || "";

    document.getElementById("btn-save-company").textContent = "Guardar Cambios";
    document.getElementById("company-form-modal").classList.add("active");
}

function closeCompanyModal() {
    document.getElementById("company-form-modal").classList.remove("active");
}

async function saveCompany(event) {
    event.preventDefault();

    const mode = document.getElementById("company-mode").value;
    const dirname = document.getElementById("comp-dirname").value.trim();
    const empres = document.getElementById("comp-empres").value.trim();
    const rolemp = document.getElementById("comp-rolemp").value.trim();
    const giro = document.getElementById("comp-giro").value.trim();
    const direcc = document.getElementById("comp-direcc").value.trim();
    const comuna = document.getElementById("comp-comuna").value.trim();
    const repres = document.getElementById("comp-repres").value.trim();
    const rolrep = document.getElementById("comp-rolrep").value.trim();

    try {
        if (appMode === "local") {
            const url = `${API_BASE}/api/empresas/${mode === "add" ? "add" : "update"}?` + 
                        `dirname=${encodeURIComponent(dirname)}` +
                        `&empres=${encodeURIComponent(empres)}` +
                        `&rolemp=${encodeURIComponent(rolemp)}` +
                        `&giro=${encodeURIComponent(giro)}` +
                        `&direcc=${encodeURIComponent(direcc)}` +
                        `&comuna=${encodeURIComponent(comuna)}` +
                        `&repres=${encodeURIComponent(repres)}` +
                        `&rolrep=${encodeURIComponent(rolrep)}`;
            const response = await fetch(url);
            if (!response.ok) {
                const errBody = await response.json();
                throw new Error(errBody.error || "Error al procesar en servidor local");
            }
        } else {
            // Firebase Cloud Mode Write
            const docRef = db.collection("empresas").doc(dirname);
            const data = {
                Empres: empres,
                RolEmp: rolemp,
                GiroCo: giro,
                Direcc: direcc,
                Comuna: comuna,
                Repres: repres,
                RolRep: rolrep
            };
            await docRef.set(data, { merge: true });
        }
        
        alert(mode === "add" ? "Empresa registrada con éxito!" : "Empresa actualizada!");
        closeCompanyModal();
        await loadCompanies();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// ----------------------------------------
// WORKER CRUD ACTIONS
// ----------------------------------------

function openAddWorkerModal() {
    if (!selectedCompany) {
        alert("Primero selecciona una empresa.");
        return;
    }
    
    document.getElementById("worker-form-title").textContent = "Agregar Nuevo Trabajador";
    document.getElementById("worker-form").reset();
    document.getElementById("worker-mode").value = "add";
    
    // Enable RUT editing
    document.getElementById("group-worker-rut").style.opacity = "1";
    document.getElementById("work-rut").disabled = false;
    document.getElementById("work-rut").required = true;
    
    // Default nationality
    document.getElementById("work-nacionalidad").value = "CHILENA";

    document.getElementById("btn-save-worker").textContent = "Guardar Trabajador";
    document.getElementById("worker-form-modal").classList.add("active");
}

function openEditWorkerModal(rut) {
    const w = companyWorkers.find(x => x.RolUni === rut);
    if (!w) return;

    document.getElementById("worker-form-title").textContent = `Editar Ficha: ${w.Nombre} ${w.Paterno}`;
    document.getElementById("worker-mode").value = "edit";
    
    // Disable RUT editing (primary key)
    document.getElementById("work-rut").value = rut;
    document.getElementById("work-rut").disabled = true;
    document.getElementById("work-rut").required = false;
    document.getElementById("group-worker-rut").style.opacity = "0.7";

    // Populate fields
    document.getElementById("work-nombre").value = w.Nombre || "";
    document.getElementById("work-paterno").value = w.Paterno || "";
    document.getElementById("work-materno").value = w.Materno || "";
    document.getElementById("work-ocupac").value = w.Ocupac || "";
    document.getElementById("work-sbase").value = w.SBaseM || "0";
    document.getElementById("work-afp").value = w.AFPper || "Fonasa";
    document.getElementById("work-isa").value = w.ISAper || "Fonasa";
    document.getElementById("work-direcc").value = w.Direcc || "";
    document.getElementById("work-email").value = w.EMail || "";
    document.getElementById("work-nacionalidad").value = w.Nacionalidad || "CHILENA";
    document.getElementById("work-sexo").value = w.SexoPe || "Masculino";

    document.getElementById("btn-save-worker").textContent = "Guardar Cambios";
    document.getElementById("worker-form-modal").classList.add("active");
}

function closeWorkerFormModal() {
    document.getElementById("worker-form-modal").classList.remove("active");
}

async function saveWorker(event) {
    event.preventDefault();

    const mode = document.getElementById("worker-mode").value;
    const rut = document.getElementById("work-rut").value.trim();
    const nombre = document.getElementById("work-nombre").value.trim();
    const paterno = document.getElementById("work-paterno").value.trim();
    const materno = document.getElementById("work-materno").value.trim();
    const ocupac = document.getElementById("work-ocupac").value.trim();
    const sbase = document.getElementById("work-sbase").value.trim();
    const afp = document.getElementById("work-afp").value;
    const isa = document.getElementById("work-isa").value;
    const direcc = document.getElementById("work-direcc").value.trim();
    const email = document.getElementById("work-email").value.trim();
    const nacionalidad = document.getElementById("work-nacionalidad").value.trim();
    const sexo = document.getElementById("work-sexo").value;

    try {
        if (appMode === "local") {
            const url = `${API_BASE}/api/personal/${mode === "add" ? "add" : "update"}?` +
                        `empresa=${encodeURIComponent(selectedCompany)}` +
                        `&rut=${encodeURIComponent(rut)}` +
                        `&nombre=${encodeURIComponent(nombre)}` +
                        `&paterno=${encodeURIComponent(paterno)}` +
                        `&materno=${encodeURIComponent(materno)}` +
                        `&ocupac=${encodeURIComponent(ocupac)}` +
                        `&sbase=${encodeURIComponent(sbase)}` +
                        `&afp=${encodeURIComponent(afp)}` +
                        `&isa=${encodeURIComponent(isa)}` +
                        `&direcc=${encodeURIComponent(direcc)}` +
                        `&email=${encodeURIComponent(email)}` +
                        `&nacionalidad=${encodeURIComponent(nacionalidad)}` +
                        `&sexo=${encodeURIComponent(sexo)}`;
            const response = await fetch(url);
            if (!response.ok) {
                const errBody = await response.json();
                throw new Error(errBody.error || "Error al procesar en servidor local");
            }
        } else {
            // Firebase Cloud Mode Write
            const docRef = db.collection("trabajadores").doc(rut);
            const data = {
                Nombre: nombre,
                Paterno: paterno,
                Materno: materno,
                Ocupac: ocupac,
                SBaseM: sbase,
                AFPper: afp,
                ISAper: isa,
                Direcc: direcc,
                EMail: email,
                Nacionalidad: nacionalidad,
                SexoPe: sexo,
                empresaId: selectedCompany,
                Finiquito: false
            };
            await docRef.set(data, { merge: true });
        }

        alert(mode === "add" ? "Trabajador registrado correctamente!" : "Datos del trabajador actualizados!");
        closeWorkerFormModal();
        await loadWorkers(selectedCompany);
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function deleteWorker(rut, fullName) {
    if (!confirm(`¿Estás seguro de que deseas desvincular (Finiquitar) al trabajador '${fullName}'?\nEsta acción lo marcará como inactivo.`)) {
        return;
    }

    try {
        if (appMode === "local") {
            const url = `${API_BASE}/api/personal/delete?empresa=${encodeURIComponent(selectedCompany)}&rut=${encodeURIComponent(rut)}`;
            const response = await fetch(url);
            if (!response.ok) {
                const errBody = await response.json();
                throw new Error(errBody.error || "Error al procesar");
            }
        } else {
            // Cloud Soft Delete
            await db.collection("trabajadores").doc(rut).update({ Finiquito: true });
        }

        alert("Trabajador finiquitado con éxito!");
        await loadWorkers(selectedCompany);
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// ----------------------------------------
// USER MANAGEMENT ACTIONS
// ----------------------------------------

async function loadUsers() {
    try {
        if (appMode === "local") {
            const response = await fetch(`${API_BASE}/api/usuarios`);
            if (!response.ok) throw new Error("Error fetching users");
            allUsers = await response.json();
        } else {
            // Firestore Query
            const snapshot = await db.collection("users").get();
            allUsers = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                data.Codigo = doc.id;
                allUsers.push(data);
            });
        }

        // Render stats
        document.getElementById("stat-users-count").textContent = allUsers.length;

        const tbody = document.getElementById("users-table-body");
        if (allUsers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">No hay usuarios configurados.</td></tr>`;
            return;
        }

        tbody.innerHTML = allUsers.map(u => {
            const claveDisplay = appMode === "local" ? `<code>${u.Clave}</code>` : '<span class="text-muted">Protegida por Auth</span>';
            return `
                <tr>
                    <td><strong>${u.Codigo}</strong></td>
                    <td>${u.Nombre || '-'}</td>
                    <td>${claveDisplay}</td>
                    <td>${u.Administrador ? '<span class="text-success">Administrador</span>' : 'Usuario'}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deleteUser('${u.Codigo}')">Eliminar</button>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        console.error("Error loading users:", err);
        document.getElementById("users-table-body").innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function createUser(event) {
    event.preventDefault();

    const codigo = document.getElementById("user-code").value.trim();
    const nombre = document.getElementById("user-name").value.trim();
    const clave = document.getElementById("user-pass").value.trim();
    const admin = document.getElementById("user-admin").checked ? "true" : "false";

    try {
        if (appMode === "local") {
            const url = `${API_BASE}/api/usuarios/add?codigo=${encodeURIComponent(codigo)}&nombre=${encodeURIComponent(nombre)}&clave=${encodeURIComponent(clave)}&admin=${admin}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Error creating user");
            const res = await response.json();
            if (!res.success) throw new Error("Failed");
        } else {
            // Write user to Firestore (Since users in Firestore Auth are created in the Firebase console,
            // we register their profiles in Firestore 'users' collection for layout mapping)
            await db.collection("users").doc(codigo).set({
                Nombre: nombre,
                Administrador: admin === "true"
            });
        }
        
        alert(`Usuario '${codigo}' agregado correctamente!`);
        document.getElementById("add-user-form").reset();
        await loadUsers();
    } catch (err) {
        alert(`Error al crear usuario: ${err.message}`);
    }
}

async function deleteUser(codigo) {
    if (codigo.toLowerCase() === "admin" || codigo.toLowerCase() === "supervisor") {
        alert("Por seguridad, no se pueden eliminar las cuentas administradoras críticas.");
        return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario '${codigo}'?`)) {
        return;
    }

    try {
        if (appMode === "local") {
            const response = await fetch(`${API_BASE}/api/usuarios/delete?codigo=${encodeURIComponent(codigo)}`);
            if (!response.ok) throw new Error("Error deleting user");
            const res = await response.json();
            if (!res.success) throw new Error("Failed");
        } else {
            // Delete from Firestore
            await db.collection("users").doc(codigo).delete();
        }

        alert("Usuario eliminado correctamente.");
        await loadUsers();
    } catch (err) {
        alert(`Error al eliminar usuario: ${err.message}`);
    }
}

// ----------------------------------------
// SYSTEM PARAMS LOADERS
// ----------------------------------------

async function loadParams() {
    try {
        let params = [];
        if (appMode === "local") {
            const response = await fetch(`${API_BASE}/api/parametros`);
            if (!response.ok) throw new Error("Error fetching params");
            params = await response.json();
        } else {
            const snapshot = await db.collection("parameters").get();
            snapshot.forEach(doc => {
                const data = doc.data();
                data.Id_Parametro = doc.id;
                params.push(data);
            });
        }

        const tbody = document.getElementById("params-table-body");
        if (params.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No hay parámetros globales.</td></tr>`;
            return;
        }

        tbody.innerHTML = params.map(p => {
            return `
                <tr>
                    <td>${p.Id_Parametro || '-'}</td>
                    <td><strong>${p.CodParametro || '-'}</strong></td>
                    <td>${p.ValParametro || '-'}</td>
                    <td>${p.DesParametro || '-'}</td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        console.error("Error loading params:", err);
        document.getElementById("params-table-body").innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function loadComunas() {
    try {
        let comunas = [];
        if (appMode === "local") {
            const response = await fetch(`${API_BASE}/api/comunas`);
            if (!response.ok) throw new Error("Error fetching comunas");
            comunas = await response.json();
        } else {
            const snapshot = await db.collection("comunas").get();
            snapshot.forEach(doc => {
                const data = doc.data();
                data.CodComuna = doc.id;
                comunas.push(data);
            });
            comunas.sort((a, b) => (a.NomComuna || "").localeCompare(b.NomComuna || ""));
        }

        const tbody = document.getElementById("comunas-table-body");
        if (comunas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">No hay comunas registradas.</td></tr>`;
            return;
        }

        tbody.innerHTML = comunas.slice(0, 100).map(c => {
            return `
                <tr>
                    <td><code>${c.CodComuna || '-'}</code></td>
                    <td><strong>${c.NomComuna || '-'}</strong></td>
                </tr>
            `;
        }).join("");

        if (comunas.length > 100) {
            tbody.innerHTML += `<tr><td colspan="2" class="text-center text-muted">... y ${comunas.length - 100} comunas más.</td></tr>`;
        }
    } catch (err) {
        console.error("Error loading comunas:", err);
        document.getElementById("comunas-table-body").innerHTML = `<tr><td colspan="2" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

// ----------------------------------------
// MIGRATION SCRIPT (LOCAL -> FIREBASE FIRESTORE SYNC)
// ----------------------------------------

async function migrateLocalToFirebase() {
    if (appMode !== "local") {
        alert("La migración solo se puede iniciar en Modo Local (MDB).");
        return;
    }

    if (!confirm("Esto iniciará la migración de TODAS tus bases de datos locales (.mdb) a Firebase Firestore.\n¿Estás listo?")) {
        return;
    }

    const progressArea = document.getElementById("sync-progress-area");
    const progressBar = document.getElementById("sync-progress-bar");
    const statusMsg = document.getElementById("sync-status-msg");

    progressArea.style.display = "block";
    progressBar.style.width = "0%";
    statusMsg.textContent = "Iniciando migración, cargando empresas...";

    try {
        // Step 1: Fetch all local companies
        const compResponse = await fetch(`${API_BASE}/api/empresas`);
        if (!compResponse.ok) throw new Error("No se pudo obtener el listado de empresas locales");
        const localCompanies = await compResponse.json();

        if (localCompanies.length === 0) {
            statusMsg.textContent = "No hay empresas locales para migrar.";
            progressBar.style.width = "100%";
            return;
        }

        let totalSteps = localCompanies.length * 3 + 3; // Companies write + workers load/write + txs load/write + params + users + comunas
        let currentStep = 0;

        const updateProgress = (msg) => {
            currentStep++;
            let pct = Math.min(100, Math.round((currentStep / totalSteps) * 100));
            progressBar.style.width = `${pct}%`;
            statusMsg.textContent = `[${pct}%] ${msg}`;
        };

        // Step 2: Migrate Companies
        for (let emp of localCompanies) {
            if (emp.Error) continue;
            updateProgress(`Migrando empresa: ${emp.Empres}`);
            
            // Upload company to Firestore
            await db.collection("empresas").doc(emp.DirName).set({
                Empres: emp.Empres || "-",
                RolEmp: emp.RolEmp || "00000000-0",
                Direcc: emp.Direcc || "-",
                Comuna: emp.Comuna || "-",
                Ciudad: emp.Ciudad || "-",
                GiroCo: emp.GiroCo || "-",
                Repres: emp.Repres || "-",
                RolRep: emp.RolRep || "-"
            }, { merge: true });

            // Fetch workers for this company
            const workersResponse = await fetch(`${API_BASE}/api/personal?empresa=${encodeURIComponent(emp.DirName)}`);
            if (workersResponse.ok) {
                const localWorkers = await workersResponse.json();
                updateProgress(`Sincronizando ${localWorkers.length} trabajadores de ${emp.DirName}`);
                
                for (let w of localWorkers) {
                    // Upload worker to Firestore
                    await db.collection("trabajadores").doc(w.RolUni).set({
                        Nombre: w.Nombre || "",
                        Paterno: w.Paterno || "",
                        Materno: w.Materno || "",
                        Ocupac: w.Ocupac || "",
                        SBaseM: w.SBaseM || "0",
                        AFPper: w.AFPper || "SIN AFP",
                        ISAper: w.ISAper || "Fonasa",
                        Direcc: w.Direcc || "",
                        EMail: w.EMail || "",
                        Nacionalidad: w.Nacionalidad || "CHILENA",
                        SexoPe: w.SexoPe || "Masculino",
                        empresaId: emp.DirName,
                        Finiquito: w.Finiquito || false
                    }, { merge: true });

                    // Fetch transactions (salary slips history) for this worker
                    const txsResponse = await fetch(`${API_BASE}/api/transacciones?empresa=${encodeURIComponent(emp.DirName)}&rut=${encodeURIComponent(w.RolUni)}`);
                    if (txsResponse.ok) {
                        const localTxs = await txsResponse.json();
                        for (let t of localTxs) {
                            // Upload transaction to Firestore
                            const txId = `${w.RolUni}_${emp.DirName}_${t.MesTra}`;
                            await db.collection("transacciones").doc(txId).set({
                                RolUni: t.RolUni,
                                empresaId: emp.DirName,
                                MesTra: t.MesTra,
                                DisTra: t.DisTra || "30",
                                TotalH: parseInt(t.TotalH) || 0,
                                TotalD: parseInt(t.TotalD) || 0,
                                Liquid: parseInt(t.Liquid) || 0,
                                NomAFP: t.NomAFP || "-",
                                MontoA: parseInt(t.MontoA) || 0,
                                NomISA: t.NomISA || "-",
                                MontoI: parseInt(t.MontoI) || 0
                            }, { merge: true });
                        }
                    }
                }
            }
            updateProgress(`Completada empresa ${emp.DirName}`);
        }

        // Step 3: Migrate Users (Key.mdb)
        updateProgress("Sincronizando usuarios administradores...");
        const usersResponse = await fetch(`${API_BASE}/api/usuarios`);
        if (usersResponse.ok) {
            const localUsers = await usersResponse.json();
            for (let u of localUsers) {
                await db.collection("users").doc(u.Codigo).set({
                    Nombre: u.Nombre || "-",
                    Administrador: u.Administrador || false
                }, { merge: true });
            }
        }

        // Step 4: Migrate parameters (NT_Main.mdb)
        updateProgress("Sincronizando parámetros tributarios...");
        const paramsResponse = await fetch(`${API_BASE}/api/parametros`);
        if (paramsResponse.ok) {
            const localParams = await paramsResponse.json();
            for (let p of localParams) {
                await db.collection("parameters").doc(p.Id_Parametro.toString()).set({
                    CodParametro: p.CodParametro || "",
                    ValParametro: p.ValParametro || "",
                    DesParametro: p.DesParametro || ""
                }, { merge: true });
            }
        }

        // Step 5: Migrate Comunas (NT_Main.mdb)
        updateProgress("Sincronizando comunas de Chile...");
        const comunasResponse = await fetch(`${API_BASE}/api/comunas`);
        if (comunasResponse.ok) {
            const localComunas = await comunasResponse.json();
            // Migrate first 150 comunas for speed limits
            for (let c of localComunas.slice(0, 150)) {
                await db.collection("comunas").doc(c.CodComuna.toString()).set({
                    NomComuna: c.NomComuna || ""
                }, { merge: true });
            }
        }

        progressBar.style.width = "100%";
        statusMsg.innerHTML = "<strong class='text-success'>🎉 ¡Migración finalizada con éxito! Todos tus datos están ahora en Firebase Cloud.</strong>";
        alert("Sincronización de datos completada! Ya puedes cambiar a 'Modo Nube' e iniciar sesión.");
    } catch (err) {
        console.error("Migration Error:", err);
        statusMsg.innerHTML = `<span class='text-danger'>Error: ${err.message}</span>`;
    }
}
