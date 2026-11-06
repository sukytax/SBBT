// ============ STATE ============
let people = [];
let items = [];         // { name, price, qty }
let extraCosts = [];    // { name, amount }
let taxType = 'percent';
let discountType = 'percent';
let assignments = {};   // itemIndex -> { personIndex: portionsCount }
let currentStep = 1;

const stepNames = [
  'Anggota Grup',
  'Item Belanjaan',
  'Biaya Tambahan',
  'Diskon',
  'Pilih Pemesan Tiap Item',
  'Hasil Perhitungan'
];

// ============ CENTER MODAL NOTIFICATION (Built-in, Zero Dependency) ============
function notify(title, htmlOrText, iconType = 'warning') {
  return new Promise(resolve => {
    const overlay = document.getElementById('appModalOverlay');
    const iconEl = document.getElementById('appModalIcon');
    const titleEl = document.getElementById('appModalTitle');
    const bodyEl = document.getElementById('appModalBody');
    const actionsEl = document.getElementById('appModalActions');

    // Setup icon
    iconEl.className = 'custom-modal-icon ' + iconType;
    if (iconType === 'success') {
      iconEl.innerHTML = '&#10003;';
    } else if (iconType === 'error') {
      iconEl.innerHTML = '&#10005;';
    } else if (iconType === 'info') {
      iconEl.innerHTML = 'i';
    } else {
      iconEl.innerHTML = '!';
    }

    titleEl.textContent = title;
    bodyEl.innerHTML = htmlOrText;

    actionsEl.innerHTML = `
      <button class="custom-modal-btn custom-modal-btn-primary" id="modalConfirmBtn">Mengerti</button>
    `;

    overlay.classList.add('active');

    function closeModal() {
      overlay.classList.remove('active');
      document.removeEventListener('keydown', handleKey);
      resolve();
    }

    function handleKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        closeModal();
      }
    }

    document.getElementById('modalConfirmBtn').onclick = closeModal;
    document.addEventListener('keydown', handleKey);
  });
}

function confirmDialog(title, text) {
  return new Promise(resolve => {
    const overlay = document.getElementById('appModalOverlay');
    const iconEl = document.getElementById('appModalIcon');
    const titleEl = document.getElementById('appModalTitle');
    const bodyEl = document.getElementById('appModalBody');
    const actionsEl = document.getElementById('appModalActions');

    iconEl.className = 'custom-modal-icon warning';
    iconEl.innerHTML = '?';

    titleEl.textContent = title;
    bodyEl.textContent = text;

    actionsEl.innerHTML = `
      <button class="custom-modal-btn custom-modal-btn-cancel" id="modalCancelBtn">Batal</button>
      <button class="custom-modal-btn custom-modal-btn-danger" id="modalActionBtn">Ya, Mulai Ulang</button>
    `;

    overlay.classList.add('active');

    function close(confirmed) {
      overlay.classList.remove('active');
      document.removeEventListener('keydown', handleKey);
      resolve(confirmed);
    }

    function handleKey(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    }

    document.getElementById('modalCancelBtn').onclick = () => close(false);
    document.getElementById('modalActionBtn').onclick = () => close(true);
    document.addEventListener('keydown', handleKey);
  });
}

// ============ HELPERS ============
function formatRp(num) {
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

function formatThousands(numStr) {
  const digits = String(numStr).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function parseNumber(str) {
  if (!str) return 0;
  return Number(String(str).replace(/\D/g, '')) || 0;
}

// Auto-format currency inputs while typing
function initCurrencyFormat(input) {
  input.addEventListener('input', function () {
    const pos = this.selectionStart;
    const oldLen = this.value.length;
    this.value = formatThousands(this.value);
    const newLen = this.value.length;
    const newPos = Math.max(0, pos + (newLen - oldLen));
    this.setSelectionRange(newPos, newPos);
  });
}

// ============ STEP NAVIGATION ============
function goToStep(step) {
  // Validasi Step 1
  if (step > 1 && currentStep === 1) {
    collectPeople();
    if (people.length < 2) {
      notify('Anggota Kurang', 'Minimal harus ada 2 orang untuk split bill ya!', 'warning');
      return;
    }
    if (people.some(p => !p.trim())) {
      notify('Nama Belum Lengkap', 'Semua nama anggota wajib diisi ya.', 'warning');
      return;
    }
  }

  // Validasi Step 2
  if (step > 2 && items.length === 0) {
    notify('Item Belanjaan Kosong', 'Tambahkan minimal 1 item belanjaan terlebih dahulu sebelum lanjut.', 'warning');
    return;
  }

  // Auto-save form Biaya Tambahan jika user mengetik tapi lupa klik "+ Tambah Biaya"
  if (currentStep === 3 && step > 3) {
    autoSaveExtraCost();
  }

  // Update estimasi pajak jika masuk ke Step 3
  if (step === 3) {
    updateTaxLiveEstimate();
  }

  // Persiapan Step 5
  if (step === 5) {
    buildAssignments();
  }

  currentStep = step;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('step-' + step).classList.add('active');

  // Update Progress Bar & Teks Proses
  const stepLabel = document.getElementById('stepLabel');
  if (stepLabel) {
    stepLabel.innerHTML = `Langkah ${step} dari 6 &middot; <span>${stepNames[step - 1]}</span>`;
  }

  document.querySelectorAll('.step-dot').forEach(d => {
    const s = parseInt(d.dataset.step);
    d.classList.remove('active', 'done');
    if (s === step) d.classList.add('active');
    else if (s < step) d.classList.add('done');
  });
}

// ============ STEP 1: People ============
function renderPeopleInputs() {
  const select = document.getElementById('peopleCount');
  const div = document.getElementById('peopleNames');
  const count = parseInt(select.value) || 2;
  let html = '';
  for (let i = 0; i < count; i++) {
    const val = people[i] || '';
    html += `
      <div class="people-name-row">
        <div class="num">${i + 1}</div>
        <input type="text" class="person-name-input" value="${val}" placeholder="Nama orang ke-${i + 1}">
      </div>`;
  }
  div.innerHTML = html;
}

function collectPeople() {
  people = Array.from(document.querySelectorAll('.person-name-input')).map(i => i.value.trim());
}

// ============ STEP 2: Items ============
function updateItemLiveTotal() {
  const priceInput = document.getElementById('itemPrice');
  const qtyInput = document.getElementById('itemQty');
  const hintEl = document.getElementById('itemLiveTotal');

  const price = parseNumber(priceInput.value);
  const qty = parseInt(qtyInput.value) || 1;

  if (price > 0 && qty > 1) {
    const total = price * qty;
    hintEl.style.display = 'inline-block';
    hintEl.textContent = `Total item: ${formatRp(total)} (${qty} × ${formatRp(price)})`;
  } else {
    hintEl.style.display = 'none';
  }
}

function addItem() {
  const nameInput = document.getElementById('itemName');
  const priceInput = document.getElementById('itemPrice');
  const qtyInput = document.getElementById('itemQty');

  const name = nameInput.value.trim();
  const price = parseNumber(priceInput.value);
  const qty = parseInt(qtyInput.value) || 1;

  if (!name) {
    notify('Input Kosong', 'Harap masukkan nama item belanjaan.', 'warning');
    nameInput.focus();
    return;
  }
  if (price <= 0) {
    notify('Harga Tidak Valid', 'Masukkan nominal harga yang benar.', 'warning');
    priceInput.focus();
    return;
  }
  if (qty <= 0) {
    notify('Jumlah Tidak Valid', 'Jumlah item minimal 1.', 'warning');
    qtyInput.focus();
    return;
  }

  // Jika nama dan harga sama persis, gabungkan ke item yang sudah ada
  const existingIndex = items.findIndex(
    it => it.name.toLowerCase() === name.toLowerCase() && it.price === price
  );

  if (existingIndex !== -1) {
    items[existingIndex].qty += qty;
    notify(
      'Item Digabungkan',
      `<b>${items[existingIndex].name}</b> dengan harga sama sudah ada di daftar.<br>Jumlah item otomatis digabungkan menjadi <b>${items[existingIndex].qty} item</b>.`,
      'info'
    );
  } else {
    items.push({ name, price, qty });
  }

  nameInput.value = '';
  priceInput.value = '';
  qtyInput.value = '1';
  updateItemLiveTotal();
  nameInput.focus();

  renderItems();
}

function removeItem(idx) {
  items.splice(idx, 1);
  delete assignments[idx];

  // Re-index assignments
  const newAssign = {};
  Object.keys(assignments).forEach(k => {
    const ki = parseInt(k);
    if (ki > idx) newAssign[ki - 1] = assignments[ki];
    else if (ki < idx) newAssign[ki] = assignments[ki];
  });
  assignments = newAssign;

  renderItems();
}

function renderItems() {
  const div = document.getElementById('itemList');
  if (items.length === 0) {
    div.innerHTML = '<div class="empty-state">Belum ada item ditambahkan</div>';
    return;
  }

  div.innerHTML = items.map((item, i) => {
    const total = item.price * item.qty;
    return `
      <div class="list-item">
        <div class="item-info">
          <span class="name">${item.name}</span>
          <span class="sub-desc">${item.qty > 1 ? `${item.qty} × ${formatRp(item.price)}` : formatRp(item.price)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="price">${formatRp(total)}</span>
          <button class="btn btn-danger" onclick="removeItem(${i})" title="Hapus item">&#10005;</button>
        </div>
      </div>`;
  }).join('');
}

// ============ STEP 3: Extra Costs & Tax ============
function setTaxType(type) {
  taxType = type;
  const group = document.getElementById('taxToggleGroup');
  if (group) {
    group.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('active'));
  }
  const btn = type === 'percent' ? document.getElementById('taxTogglePercent') : document.getElementById('taxToggleNominal');
  if (btn) btn.classList.add('active');

  const label = document.getElementById('taxLabel');
  const input = document.getElementById('taxValue');
  if (label && input) {
    if (type === 'percent') {
      label.textContent = 'Pajak (%)';
      input.placeholder = 'cth: 10 atau 11';
      input.setAttribute('inputmode', 'decimal');
    } else {
      label.textContent = 'Pajak (Rp)';
      input.placeholder = 'cth: 15.000';
      input.setAttribute('inputmode', 'numeric');
    }
    input.value = '';
  }
  updateTaxLiveEstimate();
}

function updateTaxLiveEstimate() {
  const input = document.getElementById('taxValue');
  const hintEl = document.getElementById('taxLiveEstimate');
  if (!input || !hintEl) return;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const valStr = input.value.trim();
  if (!valStr || subtotal <= 0) {
    hintEl.style.display = 'none';
    return;
  }

  if (taxType === 'percent') {
    const pct = parseFloat(valStr.replace(',', '.')) || 0;
    if (pct > 0) {
      const estimated = subtotal * (pct / 100);
      hintEl.style.display = 'inline-block';
      hintEl.textContent = `Estimasi Pajak: ${formatRp(estimated)} (${pct}% dari subtotal ${formatRp(subtotal)})`;
    } else {
      hintEl.style.display = 'none';
    }
  } else {
    const nom = parseNumber(valStr);
    if (nom > 0) {
      const pct = (nom / subtotal) * 100;
      hintEl.style.display = 'inline-block';
      hintEl.textContent = `Pajak: ${formatRp(nom)} (~${pct.toFixed(1)}% dari subtotal)`;
    } else {
      hintEl.style.display = 'none';
    }
  }
}

function addExtraCost() {
  const nameInput = document.getElementById('extraName');
  const amountInput = document.getElementById('extraAmount');

  const name = nameInput.value.trim();
  const amount = parseNumber(amountInput.value);

  if (!name) {
    notify('Input Kosong', 'Harap masukkan nama biaya tambahan.', 'warning');
    nameInput.focus();
    return;
  }
  if (amount <= 0) {
    notify('Nominal Tidak Valid', 'Masukkan nominal biaya yang benar.', 'warning');
    amountInput.focus();
    return;
  }

  extraCosts.push({ name, amount });

  nameInput.value = '';
  amountInput.value = '';
  nameInput.focus();

  renderExtraCosts();
}

function autoSaveExtraCost() {
  const nameInput = document.getElementById('extraName');
  const amountInput = document.getElementById('extraAmount');
  if (!nameInput || !amountInput) return;

  const name = nameInput.value.trim();
  const amount = parseNumber(amountInput.value);

  if (name && amount > 0) {
    extraCosts.push({ name, amount });
    nameInput.value = '';
    amountInput.value = '';
    renderExtraCosts();
  }
}

function removeExtraCost(idx) {
  extraCosts.splice(idx, 1);
  renderExtraCosts();
}

function renderExtraCosts() {
  const div = document.getElementById('extraCostsList');
  if (extraCosts.length === 0) {
    div.innerHTML = '<div class="empty-state">Tidak ada biaya tambahan lainnya</div>';
    return;
  }

  div.innerHTML = extraCosts.map((ec, i) => `
    <div class="list-item">
      <div class="item-info">
        <span class="name">${ec.name}</span>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="price">${formatRp(ec.amount)}</span>
        <button class="btn btn-danger" onclick="removeExtraCost(${i})" title="Hapus biaya">&#10005;</button>
      </div>
    </div>`).join('');
}

// ============ STEP 4: Discount ============
function setDiscountType(type) {
  discountType = type;
  const group = document.getElementById('discountToggleGroup');
  if (group) {
    group.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('active'));
  }
  const btn = type === 'percent' ? document.getElementById('discountTogglePercent') : document.getElementById('discountToggleNominal');
  if (btn) btn.classList.add('active');

  const label = document.getElementById('discountLabel');
  const input = document.getElementById('discountValue');
  if (label && input) {
    if (type === 'percent') {
      label.textContent = 'Diskon (%)';
      input.placeholder = 'cth: 10';
      input.setAttribute('inputmode', 'decimal');
    } else {
      label.textContent = 'Diskon (Rp)';
      input.placeholder = 'cth: 15.000';
      input.setAttribute('inputmode', 'numeric');
    }
    input.value = '';
  }
}

// ============ STEP 5: Assignments (Quota & Portion Based) ============
function buildAssignments() {
  const div = document.getElementById('assignList');

  items.forEach((_, i) => {
    if (!assignments[i] || typeof assignments[i] !== 'object' || Array.isArray(assignments[i])) {
      assignments[i] = {};
    }
  });

  div.innerHTML = items.map((item, i) => {
    const totalAssigned = Object.values(assignments[i] || {}).reduce((sum, count) => sum + count, 0);
    const sisa = Math.max(0, item.qty - totalAssigned);
    const isComplete = sisa === 0;
    const totalItemPrice = item.price * item.qty;

    return `
      <div class="assign-card ${isComplete ? 'complete' : ''}">
        <div class="assign-card-header">
          <div>
            <div class="item-name">${item.name}</div>
            <div class="item-unit-price">${item.qty > 1 ? `${item.qty} × ${formatRp(item.price)}` : formatRp(item.price)}</div>
          </div>
          <div class="item-price">${formatRp(totalItemPrice)}</div>
        </div>

        <div class="assign-status-row">
          ${isComplete
        ? `<span class="assign-badge complete">&#10003; Lengkap (${item.qty}/${item.qty} item)</span>`
        : `<span class="assign-badge pending">Sisa ${sisa} dari ${item.qty} item</span>`
      }
        </div>

        <div class="chip-group">
          ${people.map((personName, pi) => {
        const porsi = assignments[i][pi] || 0;

        if (porsi === 0) {
          if (sisa > 0) {
            return `<div class="chip" onclick="assignPortion(${i}, ${pi}, 1)">${personName}</div>`;
          } else {
            return `<div class="chip disabled" title="Kuota item ini sudah habis">${personName}</div>`;
          }
        }

        if (item.qty === 1) {
          return `<div class="chip selected" onclick="assignPortion(${i}, ${pi}, 0)" title="Klik untuk membatalkan">${personName} &#10003;</div>`;
        }

        return `
              <div class="chip selected chip-multi">
                <span class="chip-btn" onclick="assignPortion(${i}, ${pi}, ${porsi - 1})" title="Kurangi item">&minus;</span>
                <span>${personName}${porsi > 1 ? ` (${porsi})` : ''}</span>
                ${sisa > 0
            ? `<span class="chip-btn" onclick="assignPortion(${i}, ${pi}, ${porsi + 1})" title="Tambah item">&plus;</span>`
            : `<span class="chip-btn disabled">&plus;</span>`
          }
              </div>`;
      }).join('')}
        </div>
      </div>`;
  }).join('');
}

function assignPortion(itemIdx, personIdx, newCount) {
  const item = items[itemIdx];
  if (!item) return;

  if (!assignments[itemIdx]) assignments[itemIdx] = {};

  let otherAssigned = 0;
  Object.keys(assignments[itemIdx]).forEach(k => {
    if (parseInt(k) !== personIdx) {
      otherAssigned += assignments[itemIdx][k];
    }
  });

  const maxAllowed = item.qty - otherAssigned;
  const targetCount = Math.max(0, Math.min(newCount, maxAllowed));

  if (targetCount > 0) {
    assignments[itemIdx][personIdx] = targetCount;
  } else {
    delete assignments[itemIdx][personIdx];
  }

  buildAssignments();
}

// ============ STEP 6: Calculate ============
function calculate() {
  const incompleteItems = [];
  items.forEach((item, i) => {
    const totalAssigned = Object.values(assignments[i] || {}).reduce((sum, count) => sum + count, 0);
    const sisa = item.qty - totalAssigned;
    if (sisa > 0) {
      incompleteItems.push(`<b>${item.name}</b> (sisa ${sisa} item)`);
    }
  });

  if (incompleteItems.length > 0) {
    notify(
      'Item Belum Lengkap',
      `Masih ada item yang belum selesai dipilih:<br><br><div style="text-align:left; background:#242018; padding:12px 16px; border-radius:8px; border:1px solid #3A3228; line-height:1.8;">` +
      incompleteItems.map(it => `&bull; ${it}`).join('<br>') +
      `</div><br><span style="color:#BFB89E; font-size:0.85rem;">Silakan pilih anggota sampai semua item terisi.</span>`,
      'warning'
    );
    return;
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Pajak (proporsional: semakin besar harga pesanan, semakin besar porsi pajaknya)
  let taxVal = 0;
  const taxInputEl = document.getElementById('taxValue');
  const taxInputVal = taxInputEl ? taxInputEl.value.trim() : '';
  if (taxType === 'percent') {
    taxVal = parseFloat(taxInputVal.replace(',', '.')) || 0;
  } else {
    taxVal = parseNumber(taxInputVal);
  }
  const totalTax = taxType === 'percent'
    ? subtotal * (taxVal / 100)
    : taxVal;

  // Diskon (proporsional)
  let discountVal = 0;
  const discountInputEl = document.getElementById('discountValue');
  const discountInputVal = discountInputEl ? discountInputEl.value.trim() : '';
  if (discountType === 'percent') {
    discountVal = parseFloat(discountInputVal.replace(',', '.')) || 0;
  } else {
    discountVal = parseNumber(discountInputVal);
  }
  const discountAmount = discountType === 'percent'
    ? subtotal * (Math.min(discountVal, 100) / 100)
    : Math.min(discountVal, subtotal);

  // Biaya tambahan lainnya (misal: Ongkir) dibagi rata ke seluruh anggota
  const totalExtra = extraCosts.reduce((sum, ec) => sum + ec.amount, 0);

  const grandTotal = subtotal + totalTax - discountAmount + totalExtra;

  const personBreakdown = people.map((name, pi) => {
    const personItems = [];
    let personSubtotal = 0;

    items.forEach((item, ii) => {
      const porsi = (assignments[ii] && assignments[ii][pi]) || 0;
      if (porsi > 0) {
        const cost = porsi * item.price;
        personItems.push({
          name: item.name,
          porsi: porsi,
          pricePerUnit: item.price,
          cost: cost
        });
        personSubtotal += cost;
      }
    });

    // Pajak proporsional: semakin besar belanjaan, semakin besar pajaknya
    const personTax = subtotal > 0 ? (personSubtotal / subtotal) * totalTax : 0;

    // Diskon proporsional (semakin besar belanja, semakin besar diskonnya)
    const personDiscount = subtotal > 0 ? (personSubtotal / subtotal) * discountAmount : 0;

    // Biaya tambahan lainnya (misal: Ongkir) dibagi rata ke seluruh anggota
    const personExtra = people.length > 0 ? (totalExtra / people.length) : 0;

    const personTotal = personSubtotal + personTax - personDiscount + personExtra;

    return {
      name,
      items: personItems,
      subtotal: personSubtotal,
      tax: personTax,
      discount: personDiscount,
      extra: personExtra,
      total: personTotal
    };
  });

  renderResult(subtotal, totalTax, discountAmount, totalExtra, grandTotal, personBreakdown);
  goToStep(6);
}

function renderResult(subtotal, totalTax, discountAmount, totalExtra, grandTotal, breakdown) {
  const extraLabel = extraCosts.length === 1 ? extraCosts[0].name : 'Biaya Lain';

  document.getElementById('resultSummary').innerHTML = `
    <div class="result-summary">
      <div class="total-label">Total Keseluruhan</div>
      <div class="total-amount">${formatRp(grandTotal)}</div>
      <div class="total-breakdown">
        Subtotal ${formatRp(subtotal)}
        ${totalTax > 0 ? ' &middot; Pajak +' + formatRp(totalTax) : ''}
        ${discountAmount > 0 ? ' &middot; Diskon -' + formatRp(discountAmount) : ''}
        ${totalExtra > 0 ? ` &middot; ${extraLabel} +` + formatRp(totalExtra) : ''}
      </div>
    </div>`;

  document.getElementById('resultList').innerHTML = breakdown.map(p => {
    const extraNameDisplay = extraCosts.length === 1 ? `${extraCosts[0].name}` : 'Biaya lain / Ongkir';
    return `
    <div class="result-person">
      <div class="result-person-header">
        <span class="result-person-name">${p.name}</span>
        <span class="result-person-total">${formatRp(p.total)}</span>
      </div>
      ${p.items.length === 0 ? '<div class="result-detail"><span>Tidak ada item</span><span>Rp 0</span></div>' : ''}
      ${p.items.map(it => `
        <div class="result-detail">
          <span>${it.name}${it.porsi > 1 ? ` (${it.porsi} item)` : ''}</span>
          <span>${formatRp(it.cost)}</span>
        </div>`).join('')}
      ${p.tax > 0 ? `<div class="result-detail result-detail-tax"><span>Pajak</span><span>+${formatRp(p.tax)}</span></div>` : ''}
      ${p.discount > 0 ? `<div class="result-detail result-detail-discount"><span>Diskon</span><span>-${formatRp(p.discount)}</span></div>` : ''}
      ${p.extra > 0 ? `<div class="result-detail result-detail-extra"><span>${extraNameDisplay}</span><span>+${formatRp(p.extra)}</span></div>` : ''}
    </div>`;
  }).join('');

  window._lastResult = { subtotal, totalTax, discountAmount, totalExtra, grandTotal, breakdown };
}

// ============ DOWNLOAD AS PNG ============
function downloadResult() {
  const r = window._lastResult;
  if (!r) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const W = 800;
  const pad = 48;
  const innerW = W - pad * 2;
  const lineH = 28;

  let totalLines = 0;
  totalLines += 6;
  totalLines += 4;
  if (r.totalTax > 0) totalLines++;
  if (r.discountAmount > 0) totalLines++;
  if (r.totalExtra > 0) totalLines++;
  totalLines += 3;
  totalLines += 2;
  r.breakdown.forEach(p => {
    totalLines += 2;
    totalLines += Math.max(1, p.items.length);
    if (p.tax > 0) totalLines++;
    if (p.discount > 0) totalLines++;
    if (p.extra > 0) totalLines++;
    totalLines += 2;
  });
  totalLines += 3;

  const H = Math.max(600, (totalLines * lineH) + 240);

  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#110E08');
  bgGrad.addColorStop(1, '#060504');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 0);
  ctx.fill();

  // Border utama
  ctx.strokeStyle = '#3A3228';
  ctx.lineWidth = 1;
  roundRect(ctx, 16, 16, W - 32, H - 32, 16);
  ctx.stroke();

  // Garis aksen atas
  ctx.fillStyle = '#7B5A30';
  ctx.fillRect(pad, 50, innerW, 2);

  let y = 82;

  // Title
  ctx.fillStyle = '#F0E6C4';
  ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPLITBILLIES', W / 2, y);
  y += 22;
  ctx.fillStyle = '#BFB89E';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('SPLIT BILL RECEIPT', W / 2, y);
  y += 14;

  ctx.fillStyle = '#7B5A30';
  ctx.fillRect(pad, y, innerW, 1);
  y += 24;

  // Date & Time
  ctx.textAlign = 'left';
  ctx.fillStyle = '#BFB89E';
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(dateStr, pad, y);
  ctx.textAlign = 'right';
  ctx.fillText(timeStr, W - pad, y);
  y += 32;

  // Summary Card Box
  const sumBoxH = 92 + (r.totalTax > 0 ? 20 : 0) + (r.discountAmount > 0 ? 20 : 0) + (r.totalExtra > 0 ? 20 : 0);
  const sumGrad = ctx.createLinearGradient(pad, y, pad, y + sumBoxH);
  sumGrad.addColorStop(0, '#302414');
  sumGrad.addColorStop(1, '#1A1610');
  ctx.fillStyle = sumGrad;
  roundRect(ctx, pad, y, innerW, sumBoxH, 10);
  ctx.fill();
  ctx.strokeStyle = '#4A4035';
  ctx.lineWidth = 1;
  roundRect(ctx, pad, y, innerW, sumBoxH, 10);
  ctx.stroke();

  y += 28;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#BFB89E';
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('TOTAL KESELURUHAN', W / 2, y);
  y += 32;
  ctx.fillStyle = '#F0E6C4';
  ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(formatRp(r.grandTotal), W / 2, y);
  y += 22;

  ctx.fillStyle = '#BFB89E';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  const parts = ['Subtotal ' + formatRp(r.subtotal)];
  if (r.totalTax > 0) parts.push('Pajak +' + formatRp(r.totalTax));
  if (r.discountAmount > 0) parts.push('Diskon -' + formatRp(r.discountAmount));
  if (r.totalExtra > 0) {
    const extraLabel = extraCosts.length === 1 ? extraCosts[0].name : 'Biaya Lain';
    parts.push(extraLabel + ' +' + formatRp(r.totalExtra));
  }
  ctx.fillText(parts.join('   ·   '), W / 2, y);

  y += sumBoxH - 74;

  // Rincian per orang
  y += 20;
  ctx.fillStyle = '#7B5A30';
  ctx.fillRect(pad, y, innerW, 1);
  y += 24;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#D4C28E';
  ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('RINCIAN PER ORANG', pad, y);
  y += 22;

  r.breakdown.forEach(p => {
    const itemCount = Math.max(1, p.items.length);
    const extraLines = (p.tax > 0 ? 1 : 0) + (p.discount > 0 ? 1 : 0) + (p.extra > 0 ? 1 : 0);
    const cardH = 44 + (itemCount + extraLines) * 24 + 28;

    ctx.fillStyle = '#1A1610';
    roundRect(ctx, pad, y, innerW, cardH, 8);
    ctx.fill();
    ctx.strokeStyle = '#3A3228';
    ctx.lineWidth = 0.5;
    roundRect(ctx, pad, y, innerW, cardH, 8);
    ctx.stroke();

    y += 28;

    // Nama & total orang
    ctx.fillStyle = '#F2EDE0';
    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.name, pad + 16, y);
    ctx.fillStyle = '#D4C28E';
    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatRp(p.total), W - pad - 16, y);
    y += 8;

    // Separator line
    ctx.fillStyle = '#3A3228';
    ctx.fillRect(pad + 16, y, innerW - 32, 1);
    y += 16;

    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    if (p.items.length === 0) {
      ctx.fillStyle = '#8E8672';
      ctx.textAlign = 'left';
      ctx.fillText('Tidak ada item', pad + 16, y);
      ctx.textAlign = 'right';
      ctx.fillText('Rp 0', W - pad - 16, y);
      y += 24;
    } else {
      p.items.forEach(it => {
        ctx.fillStyle = '#BFB89E';
        ctx.textAlign = 'left';
        const label = it.name + (it.porsi > 1 ? ` (${it.porsi} item)` : '');
        ctx.fillText(label, pad + 16, y);
        ctx.textAlign = 'right';
        ctx.fillText(formatRp(it.cost), W - pad - 16, y);
        y += 24;
      });
    }

    if (p.tax > 0) {
      ctx.fillStyle = '#D99B38';
      ctx.textAlign = 'left';
      ctx.fillText('Pajak (proporsional)', pad + 16, y);
      ctx.textAlign = 'right';
      ctx.fillText('+' + formatRp(p.tax), W - pad - 16, y);
      y += 24;
    }

    if (p.discount > 0) {
      ctx.fillStyle = '#6DA64E';
      ctx.textAlign = 'left';
      ctx.fillText('Diskon', pad + 16, y);
      ctx.textAlign = 'right';
      ctx.fillText('-' + formatRp(p.discount), W - pad - 16, y);
      y += 24;
    }

    if (p.extra > 0) {
      ctx.fillStyle = '#A8833E';
      ctx.textAlign = 'left';
      const label = extraCosts.length === 1 ? `${extraCosts[0].name} (bagi rata)` : 'Biaya lain / Ongkir';
      ctx.fillText(label, pad + 16, y);
      ctx.textAlign = 'right';
      ctx.fillText('+' + formatRp(p.extra), W - pad - 16, y);
      y += 24;
    }

    y += 16;
  });

  // Footer
  y += 4;
  ctx.fillStyle = '#7B5A30';
  ctx.fillRect(pad, y, innerW, 1);
  y += 22;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4A4035';
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('SBBT · Made by Bimo Bagas', W / 2, y);

  // Resize canvas ke final height
  const finalCanvas = document.createElement('canvas');
  const finalH = y + 40;
  finalCanvas.width = W * 2;
  finalCanvas.height = finalH * 2;
  const fctx = finalCanvas.getContext('2d');
  fctx.drawImage(canvas, 0, 0, W * 2, finalH * 2, 0, 0, W * 2, finalH * 2);

  finalCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'splitbill_' + now.toISOString().slice(0, 10) + '.png';
    a.click();
    URL.revokeObjectURL(url);

    notify('Berhasil Diunduh', 'Struk split bill berhasil disimpan ke perangkat dalam format PNG.', 'success');
  }, 'image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============ RESET ============
async function resetAll() {
  const confirmed = await confirmDialog('Mulai Ulang?', 'Semua data nama, item, dan perhitungan akan direset kembali ke awal.');
  if (!confirmed) return;

  people = [];
  items = [];
  extraCosts = [];
  assignments = {};
  taxType = 'percent';
  discountType = 'percent';
  const taxInput = document.getElementById('taxValue');
  if (taxInput) taxInput.value = '';
  setTaxType('percent');
  const taxHint = document.getElementById('taxLiveEstimate');
  if (taxHint) taxHint.style.display = 'none';

  document.getElementById('discountValue').value = '';
  setDiscountType('percent');
  document.getElementById('peopleCount').value = '2';
  document.getElementById('itemName').value = '';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemQty').value = '1';
  document.getElementById('extraName').value = '';
  document.getElementById('extraAmount').value = '';
  updateItemLiveTotal();
  renderPeopleInputs();
  renderItems();
  renderExtraCosts();
  goToStep(1);
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  // Dropdown jumlah orang
  document.getElementById('peopleCount').addEventListener('change', () => {
    collectPeople();
    renderPeopleInputs();
  });

  // Enter to add item
  document.getElementById('itemName').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
  document.getElementById('itemPrice').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
  document.getElementById('itemQty').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });

  // Live item total calculation on typing
  document.getElementById('itemPrice').addEventListener('input', updateItemLiveTotal);
  document.getElementById('itemQty').addEventListener('input', updateItemLiveTotal);

  // Live formatting & estimate for tax
  const taxInput = document.getElementById('taxValue');
  if (taxInput) {
    taxInput.addEventListener('input', function () {
      if (taxType === 'nominal') {
        const pos = this.selectionStart;
        const oldLen = this.value.length;
        this.value = formatThousands(this.value);
        const newLen = this.value.length;
        const newPos = Math.max(0, pos + (newLen - oldLen));
        this.setSelectionRange(newPos, newPos);
      }
      updateTaxLiveEstimate();
    });
    taxInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const extraNameInput = document.getElementById('extraName');
        if (extraNameInput) extraNameInput.focus();
      }
    });
  }

  // Live formatting for discount
  const discountInput = document.getElementById('discountValue');
  if (discountInput) {
    discountInput.addEventListener('input', function () {
      if (discountType === 'nominal') {
        const pos = this.selectionStart;
        const oldLen = this.value.length;
        this.value = formatThousands(this.value);
        const newLen = this.value.length;
        const newPos = Math.max(0, pos + (newLen - oldLen));
        this.setSelectionRange(newPos, newPos);
      }
    });
  }

  // Enter to add extra cost
  document.getElementById('extraName').addEventListener('keydown', e => { if (e.key === 'Enter') addExtraCost(); });
  document.getElementById('extraAmount').addEventListener('keydown', e => { if (e.key === 'Enter') addExtraCost(); });

  // Currency formatting untuk semua input berkelas .currency-input
  document.querySelectorAll('.currency-input').forEach(initCurrencyFormat);

  renderPeopleInputs();
  renderItems();
  renderExtraCosts();
});

// ============ MAIN TABS (Hitung Bill, Deskripsi, Cara Penggunaan) ============
function switchTab(tabId) {
  const calcView = document.getElementById('calcView');
  const descView = document.getElementById('descView');
  const guideView = document.getElementById('guideView');

  const tabBtnCalc = document.getElementById('tabBtnCalc');
  const tabBtnDesc = document.getElementById('tabBtnDesc');
  const tabBtnGuide = document.getElementById('tabBtnGuide');

  [tabBtnCalc, tabBtnDesc, tabBtnGuide].forEach(btn => btn && btn.classList.remove('active'));

  if (tabId === 'calc') {
    calcView.style.display = 'block';
    descView.style.display = 'none';
    guideView.style.display = 'none';
    if (tabBtnCalc) tabBtnCalc.classList.add('active');
  } else if (tabId === 'desc') {
    calcView.style.display = 'none';
    descView.style.display = 'block';
    guideView.style.display = 'none';
    if (tabBtnDesc) tabBtnDesc.classList.add('active');
  } else if (tabId === 'guide') {
    calcView.style.display = 'none';
    descView.style.display = 'none';
    guideView.style.display = 'block';
    if (tabBtnGuide) tabBtnGuide.classList.add('active');
  }
}
