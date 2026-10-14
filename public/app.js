/**
 * PURE Energy | PuREPower Lead Router & MIS Dashboard
 * Author: VENU GOPAL REDDY PALUGULLA (pvgreddy3@gmail.com)
 * Plant Location: Kandi, Sangareddy, Telangana
 */

// Dealer Directory Definition (from dealers.csv)
const DEALERS_CONFIG = [
  { id: "D01", name: "Sri Sai Power Solutions", city: "Hyderabad", prefixes: ["500"], email: "d01@example.com" },
  { id: "D02", name: "Kandi Energy Point", city: "Sangareddy", prefixes: ["502"], email: "d02@example.com" },
  { id: "D03", name: "Warangal Green Systems", city: "Warangal", prefixes: ["506"], email: "d03@example.com" },
  { id: "D04", name: "Karimnagar Solar Hub", city: "Karimnagar", prefixes: ["505"], email: "d04@example.com" },
  { id: "D05", name: "Vizag Home Power", city: "Visakhapatnam", prefixes: ["530", "531"], email: "d05@example.com" },
  { id: "D06", name: "Krishna Energy Store", city: "Vijayawada", prefixes: ["520", "521"], email: "d06@example.com" },
  { id: "D07", name: "Guntur Battery World", city: "Guntur", prefixes: ["522"], email: "d07@example.com" },
  { id: "D08", name: "Tirupati PowerHouse", city: "Tirupati", prefixes: ["517"], email: "d08@example.com" }
];

const INHOUSE_DEALER = {
  id: "INHOUSE",
  name: "In-house Sales",
  city: "Headquarters",
  email: "sales@purenergy.co.in"
};

// Global App State
let appState = {
  leads: [],
  isFirebaseActive: false,
  firestoreDb: null,
  filters: {
    search: "",
    dealer: "ALL",
    status: "ALL"
  }
};

// DOM Elements
const elements = {
  // Tabs
  tabButtons: document.querySelectorAll(".tab-btn"),
  tabContents: document.querySelectorAll(".tab-content"),
  tabTotalBadge: document.getElementById("tab-total-badge"),
  
  // Header / Backend Status
  backendStatus: document.getElementById("backend-status"),
  backendStatusText: document.getElementById("backend-status-text"),
  toggleConfigBtn: document.getElementById("toggle-config-btn"),
  
  // Lead Form
  leadForm: document.getElementById("lead-form"),
  nameInput: document.getElementById("lead-name"),
  phoneInput: document.getElementById("lead-phone"),
  pincodeInput: document.getElementById("lead-pincode"),
  productSelect: document.getElementById("lead-product"),
  sourceSelect: document.getElementById("lead-source"),
  routingPreview: document.getElementById("routing-preview"),
  routingPreviewText: document.getElementById("routing-preview-text"),
  warnDuplicate: document.getElementById("warn-duplicate"),
  errName: document.getElementById("err-name"),
  errPhone: document.getElementById("err-phone"),
  errPincode: document.getElementById("err-pincode"),
  
  // Dashboard KPIs
  kpiTotal: document.getElementById("kpi-total"),
  kpiNew: document.getElementById("kpi-new"),
  kpiContacted: document.getElementById("kpi-contacted"),
  kpiConverted: document.getElementById("kpi-converted"),
  kpiLost: document.getElementById("kpi-lost"),
  dealerStatsContainer: document.getElementById("dealer-stats-container"),
  
  // Table & Filters
  leadsTbody: document.getElementById("leads-tbody"),
  searchInput: document.getElementById("search-input"),
  filterDealer: document.getElementById("filter-dealer"),
  filterStatus: document.getElementById("filter-status"),
  
  // Dealers Table
  dealersTbody: document.getElementById("dealers-tbody"),
  
  // Toast
  toast: document.getElementById("toast"),
  
  // Modal
  configModal: document.getElementById("config-modal"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  fbConfigJson: document.getElementById("fb-config-json"),
  saveConfigBtn: document.getElementById("save-config-btn"),
  resetDemoBtn: document.getElementById("reset-demo-btn")
};

// --- ROUTING ENGINE ---
function resolveDealer(pincode) {
  if (!pincode || pincode.length < 3) {
    return null;
  }
  const prefix = pincode.substring(0, 3);
  for (const dealer of DEALERS_CONFIG) {
    if (dealer.prefixes.includes(prefix)) {
      return {
        matched: true,
        prefix: prefix,
        ...dealer
      };
    }
  }
  return {
    matched: false,
    prefix: prefix,
    ...INHOUSE_DEALER
  };
}

// Update routing preview UI as user types pincode
function updateRoutingPreview() {
  const pincode = elements.pincodeInput.value.trim();
  const box = elements.routingPreview;
  const resultText = elements.routingPreviewText;

  if (pincode.length < 3) {
    box.className = "routing-preview-box info";
    resultText.textContent = "Enter customer pincode above to preview routing...";
    return;
  }

  const routing = resolveDealer(pincode);
  if (routing.matched) {
    box.className = "routing-preview-box matched";
    resultText.innerHTML = `<strong>${routing.name}</strong> (${routing.city}) &bull; Matched prefix: <code>${routing.prefix}</code>`;
  } else {
    box.className = "routing-preview-box inhouse";
    resultText.innerHTML = `<strong>In-house Sales</strong> &bull; Pincode prefix <code>${routing.prefix}</code> is outside dealer territories`;
  }
}

// Check for duplicate phone
function checkDuplicatePhone() {
  const phone = elements.phoneInput.value.trim().replace(/\D/g, "");
  const warn = elements.warnDuplicate;
  
  if (phone.length === 10) {
    const existing = appState.leads.find(l => l.phone === phone);
    if (existing) {
      warn.textContent = `⚠️ Duplicate Warning: Active lead "${existing.name}" (${existing.lead_id}) already exists with this phone!`;
      warn.classList.add("visible");
      return true;
    }
  }
  warn.textContent = "";
  warn.classList.remove("visible");
  return false;
}

// Show Toast
function showToast(msg, duration = 3000) {
  const toast = elements.toast;
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, duration);
}

// --- FORM SUBMISSION ---
async function handleLeadSubmit(e) {
  e.preventDefault();
  
  // Clear errors
  elements.errName.classList.remove("visible");
  elements.errPhone.classList.remove("visible");
  elements.errPincode.classList.remove("visible");
  
  const name = elements.nameInput.value.trim();
  let phone = elements.phoneInput.value.trim().replace(/\D/g, "");
  const pincode = elements.pincodeInput.value.trim();
  const product = elements.productSelect.value;
  const source = elements.sourceSelect.value;
  
  let hasError = false;
  
  if (!name) {
    elements.errName.textContent = "Please enter customer name";
    elements.errName.classList.add("visible");
    hasError = true;
  }
  
  if (phone.startsWith("91") && phone.length === 12) {
    phone = phone.substring(2);
  }
  
  const phoneRegex = /^[6-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    elements.errPhone.textContent = "Please enter a valid 10-digit Indian mobile number (starts with 6-9)";
    elements.errPhone.classList.add("visible");
    hasError = true;
  }
  
  const pincodeRegex = /^[1-9]\d{5}$/;
  if (!pincodeRegex.test(pincode)) {
    elements.errPincode.textContent = "Please enter a valid 6-digit postal pincode";
    elements.errPincode.classList.add("visible");
    hasError = true;
  }
  
  // Duplicate check
  const duplicate = appState.leads.find(l => l.phone === phone);
  if (duplicate) {
    elements.errPhone.textContent = `Submission Blocked: Duplicate mobile already registered under ${duplicate.name} (${duplicate.lead_id})`;
    elements.errPhone.classList.add("visible");
    hasError = true;
  }
  
  if (hasError) return;
  
  // Resolve Dealer
  const routing = resolveDealer(pincode);
  const nextLeadNum = 1000 + appState.leads.length + 1;
  const leadId = `L${nextLeadNum}`;
  const today = new Date().toISOString().split("T")[0];
  
  const newLead = {
    lead_id: leadId,
    name: name,
    phone: phone,
    pincode: pincode,
    pincode_prefix: pincode.substring(0, 3),
    product: product,
    source: source,
    created_on: today,
    status: "New",
    dealer_id: routing.id,
    dealer_name: routing.name,
    dealer_city: routing.city
  };
  
  if (appState.isFirebaseActive && appState.firestoreDb) {
    try {
      await appState.firestoreDb.collection("leads").doc(leadId).set(newLead);
      showToast(`⚡ Lead ${leadId} successfully routed to ${routing.name} & saved to Firestore!`);
    } catch (err) {
      console.error("Firestore save error:", err);
      showToast(`Saved locally (Firestore error: ${err.message})`);
      saveLocalLead(newLead);
    }
  } else {
    saveLocalLead(newLead);
    showToast(`⚡ Lead ${leadId} routed to ${routing.name} (Saved Locally)`);
  }
  
  elements.leadForm.reset();
  updateRoutingPreview();
  renderApp();
  
  // Switch to dashboard tab to show newly routed lead
  switchTab("dashboard-section");
}

function saveLocalLead(newLead) {
  appState.leads.unshift(newLead);
  localStorage.setItem("pure_energy_leads", JSON.stringify(appState.leads));
}

// --- STATUS UPDATE ---
async function handleStatusChange(leadId, newStatus) {
  const lead = appState.leads.find(l => l.lead_id === leadId);
  if (!lead) return;
  
  lead.status = newStatus;
  
  if (appState.isFirebaseActive && appState.firestoreDb) {
    try {
      await appState.firestoreDb.collection("leads").doc(leadId).update({ status: newStatus });
      showToast(`Status for ${leadId} updated to ${newStatus}`);
    } catch (err) {
      console.error("Firestore status update error:", err);
      showToast(`Status updated locally (${err.message})`);
      localStorage.setItem("pure_energy_leads", JSON.stringify(appState.leads));
    }
  } else {
    localStorage.setItem("pure_energy_leads", JSON.stringify(appState.leads));
    showToast(`Status for ${leadId} updated to ${newStatus}`);
  }
  
  renderApp();
}

// --- RENDER DASHBOARD & TABLES ---
function renderApp() {
  const leads = appState.leads;
  
  // 1. Total counts
  elements.tabTotalBadge.textContent = leads.length;
  elements.kpiTotal.textContent = leads.length;
  
  const statusCounts = { New: 0, Contacted: 0, Converted: 0, Lost: 0 };
  const dealerCounts = {};
  
  // Initialize dealer counts
  DEALERS_CONFIG.forEach(d => { dealerCounts[d.name] = 0; });
  dealerCounts[INHOUSE_DEALER.name] = 0;
  
  leads.forEach(l => {
    if (statusCounts[l.status] !== undefined) {
      statusCounts[l.status]++;
    }
    const dName = l.dealer_name || INHOUSE_DEALER.name;
    dealerCounts[dName] = (dealerCounts[dName] || 0) + 1;
  });
  
  elements.kpiNew.textContent = statusCounts.New;
  elements.kpiContacted.textContent = statusCounts.Contacted;
  elements.kpiConverted.textContent = statusCounts.Converted;
  elements.kpiLost.textContent = statusCounts.Lost;
  
  // 2. Dealer Distribution Cards
  elements.dealerStatsContainer.innerHTML = "";
  const maxDealerLeads = Math.max(1, ...Object.values(dealerCounts));
  
  Object.entries(dealerCounts).forEach(([name, count]) => {
    const pct = Math.round((count / (leads.length || 1)) * 100);
    const fillPct = Math.round((count / maxDealerLeads) * 100);
    const isSpecial = name === INHOUSE_DEALER.name;
    
    const card = document.createElement("div");
    card.className = "dealer-stat-item";
    card.innerHTML = `
      <div class="dealer-stat-header">
        <span class="dealer-stat-name">${isSpecial ? "🏢 " + name : "📍 " + name}</span>
        <span class="dealer-stat-count">${count} <small style="font-weight:normal;color:#64748b">(${pct}%)</small></span>
      </div>
      <div class="dealer-progress-bar">
        <div class="dealer-progress-fill" style="width: ${fillPct}%; ${isSpecial ? 'background-color:#991b1b' : ''}"></div>
      </div>
    `;
    elements.dealerStatsContainer.appendChild(card);
  });
  
  // 3. Filter Options in Dropdown
  const currentDealerSelection = elements.filterDealer.value;
  elements.filterDealer.innerHTML = '<option value="ALL">All Dealers</option>';
  Object.keys(dealerCounts).forEach(dName => {
    const opt = document.createElement("option");
    opt.value = dName;
    opt.textContent = `${dName} (${dealerCounts[dName]})`;
    if (dName === currentDealerSelection) opt.selected = true;
    elements.filterDealer.appendChild(opt);
  });
  
  // 4. Filter & Render Lead Rows
  renderLeadsTable();
}

function renderLeadsTable() {
  const searchTerm = elements.searchInput.value.toLowerCase().trim();
  const selectedDealer = elements.filterDealer.value;
  const selectedStatus = elements.filterStatus.value;
  
  const filtered = appState.leads.filter(lead => {
    // Search
    const matchesSearch = !searchTerm || 
      (lead.name && lead.name.toLowerCase().includes(searchTerm)) ||
      (lead.phone && lead.phone.includes(searchTerm)) ||
      (lead.lead_id && lead.lead_id.toLowerCase().includes(searchTerm));
      
    // Dealer filter
    const matchesDealer = selectedDealer === "ALL" || lead.dealer_name === selectedDealer;
    
    // Status filter
    const matchesStatus = selectedStatus === "ALL" || lead.status === selectedStatus;
    
    return matchesSearch && matchesDealer && matchesStatus;
  });
  
  elements.leadsTbody.innerHTML = "";
  
  if (filtered.length === 0) {
    elements.leadsTbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: #64748b; padding: 2rem;">
          No matching leads found.
        </td>
      </tr>
    `;
    return;
  }
  
  filtered.forEach(lead => {
    const tr = document.createElement("tr");
    
    const isSpecial = lead.dealer_name === INHOUSE_DEALER.name;
    const dealerPill = isSpecial 
      ? `<span class="badge-tag badge-inhouse">In-house Sales</span>`
      : `<strong>${lead.dealer_name}</strong> <small style="color:#64748b">(${lead.dealer_city})</small>`;
      
    const statusClass = `status-badge-${lead.status ? lead.status.toLowerCase() : "new"}`;
    
    tr.innerHTML = `
      <td><code>${lead.lead_id}</code></td>
      <td><strong>${lead.name}</strong></td>
      <td>+91 ${lead.phone}</td>
      <td><code>${lead.pincode}</code></td>
      <td>${dealerPill}</td>
      <td><small>${lead.product}</small></td>
      <td><span class="badge-tag" style="background:#f1f5f9;color:#334155">${lead.source}</span></td>
      <td><small style="color:#64748b">${lead.created_on}</small></td>
      <td>
        <select class="status-select ${statusClass}" data-lead-id="${lead.lead_id}">
          <option value="New" ${lead.status === "New" ? "selected" : ""}>New</option>
          <option value="Contacted" ${lead.status === "Contacted" ? "selected" : ""}>Contacted</option>
          <option value="Converted" ${lead.status === "Converted" ? "selected" : ""}>Converted</option>
          <option value="Lost" ${lead.status === "Lost" ? "selected" : ""}>Lost</option>
        </select>
      </td>
    `;
    elements.leadsTbody.appendChild(tr);
  });
  
  // Attach status change events
  elements.leadsTbody.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const leadId = e.target.getAttribute("data-lead-id");
      const newStatus = e.target.value;
      handleStatusChange(leadId, newStatus);
    });
  });
}

// Render Authorized Dealers Directory
function renderDealersDirectory() {
  elements.dealersTbody.innerHTML = "";
  DEALERS_CONFIG.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${d.id}</code></td>
      <td><strong>${d.name}</strong></td>
      <td>${d.city}</td>
      <td><code>${d.prefixes.join(", ")}</code></td>
      <td><a href="mailto:${d.email}" style="color:var(--primary);text-decoration:none">${d.email}</a></td>
    `;
    elements.dealersTbody.appendChild(tr);
  });
  
  // Add in-house
  const inTr = document.createElement("tr");
  inTr.style.backgroundColor = "#fff7ed";
  inTr.innerHTML = `
    <td><code>INHOUSE</code></td>
    <td><strong>In-house Sales</strong></td>
    <td>Headquarters (Sangareddy)</td>
    <td><em>All unmatched / unserviced pincodes</em></td>
    <td><a href="mailto:sales@purenergy.co.in" style="color:var(--primary);text-decoration:none">sales@purenergy.co.in</a></td>
  `;
  elements.dealersTbody.appendChild(inTr);
}

// Tab Switching
function switchTab(tabId) {
  elements.tabButtons.forEach(btn => {
    if (btn.getAttribute("data-tab") === tabId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  
  elements.tabContents.forEach(sec => {
    if (sec.id === tabId) {
      sec.classList.add("active");
    } else {
      sec.classList.remove("active");
    }
  });
}

// --- DATA INITIALIZATION ---
async function initData() {
  renderDealersDirectory();
  
  // Check if Firebase config is stored
  const savedFbConfig = localStorage.getItem("pure_firebase_config");
  if (savedFbConfig && typeof firebase !== "undefined") {
    try {
      const config = JSON.parse(savedFbConfig);
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      appState.firestoreDb = firebase.firestore();
      appState.isFirebaseActive = true;
      
      elements.backendStatus.className = "status-pill status-live";
      elements.backendStatusText.textContent = "Firestore Connected";
      
      // Real-time listener
      appState.firestoreDb.collection("leads").onSnapshot((snapshot) => {
        const liveLeads = [];
        snapshot.forEach(doc => {
          liveLeads.push(doc.data());
        });
        if (liveLeads.length > 0) {
          appState.leads = liveLeads;
          renderApp();
        }
      }, (error) => {
        console.warn("Firestore listener fallback to local:", error);
        loadLocalFallback();
      });
      return;
    } catch (e) {
      console.warn("Firebase init failed:", e);
    }
  }
  
  // Fallback to local data
  await loadLocalFallback();
}

async function loadLocalFallback() {
  const localSaved = localStorage.getItem("pure_energy_leads");
  if (localSaved) {
    try {
      appState.leads = JSON.parse(localSaved);
      renderApp();
      return;
    } catch (e) {}
  }
  
  // Fetch pre-sanitized clean_leads.json
  try {
    const res = await fetch("clean_leads.json");
    if (res.ok) {
      const cleanLeads = await res.json();
      appState.leads = cleanLeads;
      localStorage.setItem("pure_energy_leads", JSON.stringify(cleanLeads));
      renderApp();
      return;
    }
  } catch (e) {
    console.log("clean_leads.json fetch note:", e);
  }
  
  renderApp();
}

// Event Listeners Setup
function setupEventListeners() {
  // Tabs
  elements.tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.getAttribute("data-tab"));
    });
  });
  
  // Pincode live routing update
  elements.pincodeInput.addEventListener("input", updateRoutingPreview);
  
  // Phone duplicate check
  elements.phoneInput.addEventListener("input", checkDuplicatePhone);
  
  // Lead Form Submit
  elements.leadForm.addEventListener("submit", handleLeadSubmit);
  
  // Filters & Search
  elements.searchInput.addEventListener("input", renderLeadsTable);
  elements.filterDealer.addEventListener("change", renderLeadsTable);
  elements.filterStatus.addEventListener("change", renderLeadsTable);
  
  // Modal Settings
  elements.toggleConfigBtn.addEventListener("click", () => {
    const saved = localStorage.getItem("pure_firebase_config");
    if (saved) elements.fbConfigJson.value = saved;
    elements.configModal.classList.remove("hidden");
  });
  
  elements.closeModalBtn.addEventListener("click", () => {
    elements.configModal.classList.add("hidden");
  });
  
  elements.saveConfigBtn.addEventListener("click", () => {
    const raw = elements.fbConfigJson.value.trim();
    if (raw) {
      try {
        JSON.parse(raw);
        localStorage.setItem("pure_firebase_config", raw);
        elements.configModal.classList.add("hidden");
        showToast("Firebase Config saved. Reloading page...");
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        alert("Invalid JSON format. Please verify your Firebase config object.");
      }
    }
  });
  
  elements.resetDemoBtn.addEventListener("click", async () => {
    localStorage.removeItem("pure_firebase_config");
    localStorage.removeItem("pure_energy_leads");
    elements.configModal.classList.add("hidden");
    showToast("Reset to default demo data. Reloading...");
    setTimeout(() => window.location.reload(), 1000);
  });
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initData();
});
