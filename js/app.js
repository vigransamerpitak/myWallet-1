// js/app.js - ศูนย์ควบคุมการทำงานหลัก เชื่อมต่อฐานข้อมูล Supabase และบริหารตรรกะเบื้องหลังทั้งหมด (Database Core & API)

// === 📂 Global App State (สถานะรวมของแอปพลิเคชัน) ===
let filterOwner = 'all';
let filterType = 'all';
let filterDate = 'this-month';
var currentUserRole = window.currentUserRole || 'me';

window.initUserIdentity = function(userId) {
    const boatId = '4ffee1dd-ff34-47c0-a623-7dcc76d80c0f';
    if (userId === boatId) {
        currentUserRole = 'me';
    } else {
        currentUserRole = 'partner';
    }

    // ตรวจสอบข้อมูลอีเมลจาก local storage session เผื่อความถูกต้องในการตรวจจับคู่รัก
    try {
        const sessionTokenKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
        if (sessionTokenKey) {
            const sessionData = JSON.parse(localStorage.getItem(sessionTokenKey));
            const email = sessionData?.user?.email || '';
            if (email.includes('boat') || email.includes('vigran')) {
                currentUserRole = 'me';
            } else if (email) {
                currentUserRole = 'partner';
            }
        }
    } catch (e) {
        console.error("Error matching role from email session:", e);
    }

    if (typeof applyDynamicNames === 'function') {
        applyDynamicNames();
    }
};

let isSaving = false; // ป้องกันดับเบิลคลิกบันทึกซ้ำ
let currentSortField = 'date';
let currentSortOrder = 'desc';

// Pagination State
let currentPage = 1;
const ROWS_PER_PAGE = 5;
let filteredTxsCache = []; // ประวัติที่กรองแล้วใช้สำหรับแบ่งหน้าและส่งออก

// Data Caches
let loadedTxsCache = []; // แคชรายการเงินดิบทั้งหมด
let loadedGoalsCache = []; // แคชเป้าหมาย/ภารกิจทั้งหมด
let recurringBills = []; // รายการบิลรายเดือน
let currentTotalMePaidShared = 0; // ยอดแชร์กองกลางที่โบ๊ทสำรองจ่าย
let currentTotalPartnerPaidShared = 0; // ยอดแชร์กองกลางที่เอิร์นสำรองจ่าย

// === 🚨 Emergency Savings Goals Controllers (จัดการยอดเป้าหมายเงินออมฉุกเฉิน) ===

function updateEmergencyTarget(val) {
    let num = parseFloat(val);
    if (isNaN(num) || num <= 0) num = 50000;
    localStorage.setItem('emergencyTarget', num);
    document.getElementById('emergencyTargetInput').value = num;
    calculateEmergencyProgress();
}

function initEmergencyTargetTitle() {
    const input = document.getElementById('emergencyTargetTitleInput');
    if (!input) return;
    const saved = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
    input.value = saved;
    syncEmergencyLabels();
}

function updateEmergencyTargetTitle(val) {
    let clean = val.trim();
    if (!clean) clean = "เงินออมสำรองฉุกเฉิน";
    localStorage.setItem('emergencyTargetTitle', clean);
    const input = document.getElementById('emergencyTargetTitleInput');
    if (input) input.value = clean;
    syncEmergencyLabels();
    loadTransactions(); // โหลดประวัติใหม่เพื่อให้ Badge สะท้อนชื่อเป้าหมายใหม่ทันที
}

function syncEmergencyLabels() {
    const saved = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
    
    const labelWalletEmergency = document.getElementById('labelWalletEmergency');
    if (labelWalletEmergency) labelWalletEmergency.innerText = `${saved} 🎯`;
    
    const optOwnerEmergency = document.getElementById('optOwnerEmergency');
    if (optOwnerEmergency) optOwnerEmergency.innerText = `🚨 บัญชีออม (${saved})`;
    
    const filterEmergency = document.getElementById('filterEmergency');
    if (filterEmergency) filterEmergency.innerText = `🎯 เฉพาะ${saved}`;

    const labelChartEmergency = document.getElementById('labelChartEmergency');
    if (labelChartEmergency) labelChartEmergency.innerText = saved;
}

// === 📈 Charts & Analytics Rendering (ระบบสร้างแผนภูมิและวิเคราะห์ประวัติเงิน) ===

function renderMonthlyTrend(allTxs) {
    const area = document.getElementById('monthlyTrendArea');
    if (!area) return;

    // คำนวณ 6 เดือนย้อนหลังรวมเดือนปัจจุบัน
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth(), label: `${d.toLocaleString('th-TH', { month: 'short' })} ${d.getFullYear() + 543}` });
    }

    // สรุปยอดรายรับ/รายจ่ายแต่ละเดือน
    const monthlyData = months.map(m => ({ ...m, income: 0, expense: 0 }));
    allTxs.forEach(tx => {
        const note = tx.note || '';
        const isInternalTransfer = 
            tx.owner === 'emergency' ||
            note.includes('[โอนเข้าออมฉุกเฉิน]') ||
            note.includes('[ถอนจากออมฉุกเฉิน]') ||
            note.includes('[หักเงินออมภารกิจ]') ||
            note.includes('[ถอนเงินออมภารกิจ]') ||
            note.includes('[หักออมอัตโนมัติ') ||
            note.includes('[ออมเพื่อ:');

        if (isInternalTransfer) return; // ข้ามยอดเงินโอนออมภายใน ไม่นำมาคิดเป็นรายรับ/รายจ่ายจริงของบ้าน
        
        const txDate = new Date(tx.created_at);
        const txAmount = parseFloat(tx.amount);
        const idx = monthlyData.findIndex(m => m.year === txDate.getFullYear() && m.month === txDate.getMonth());
        if (idx === -1) return;
        if (tx.type === 'income') monthlyData[idx].income += txAmount;
        else monthlyData[idx].expense += txAmount;
    });

    const maxVal = Math.max(...monthlyData.map(m => Math.max(m.income, m.expense)), 1);
    let html = `<div class="d-flex align-items-end justify-content-between gap-1" style="height: 195px; padding-bottom: 4px;">`;

    monthlyData.forEach((m, i) => {
        const incomeH = Math.max(2, (m.income / maxVal) * 125);
        const expenseH = Math.max(2, (m.expense / maxVal) * 125);
        const isCurrentMonth = (i === monthlyData.length - 1);

        html += `<div class="d-flex flex-column align-items-center flex-fill" style="min-width: 0;">`;
        html += `<div class="d-flex flex-column align-items-center mb-1 text-center" style="font-size: 0.55rem; line-height: 1.2; min-height: 28px; justify-content: end;">`;
        if (m.income > 0) {
            html += `<span class="text-success fw-bold">+${m.income.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>`;
        } else {
            html += `<span class="text-success text-opacity-50" style="opacity: 0.4;">0</span>`;
        }
        if (m.expense > 0) {
            html += `<span class="text-danger fw-bold">-${m.expense.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>`;
        } else {
            html += `<span class="text-danger text-opacity-50" style="opacity: 0.4;">0</span>`;
        }
        html += `</div>`;

        // แท่งกราฟแท่งคู่
        html += `<div class="d-flex align-items-end gap-1 mb-1" style="height: 130px;">`;
        html += `<div title="รายรับ: ${formatBaht(m.income)}" style="width: 14px; height: ${incomeH}px; background: linear-gradient(180deg, #34d399, #059669); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>`;
        html += `<div title="รายจ่าย: ${formatBaht(m.expense)}" style="width: 14px; height: ${expenseH}px; background: linear-gradient(180deg, #f87171, #dc2626); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>`;
        html += `</div>`;
        
        html += `<span class="text-center small ${isCurrentMonth ? 'fw-bold text-primary' : 'text-muted'}" style="font-size: 0.65rem; line-height: 1.1;">${m.label}</span>`;
        html += `</div>`;
    });
    html += `</div>`;

    // อัตราการเติบโตเปรียบเทียบเดือนก่อน
    const thisMonthData = monthlyData[monthlyData.length - 1];
    const lastMonthData = monthlyData[monthlyData.length - 2];
    let trendText = '';
    if (lastMonthData && lastMonthData.expense > 0) {
        const diff = thisMonthData.expense - lastMonthData.expense;
        const pct = ((diff / lastMonthData.expense) * 100).toFixed(0);
        if (diff > 0) trendText = `<span class="text-danger">📈 รายจ่ายเดือนนี้เพิ่มขึ้น ${Math.abs(pct)}% จากเดือนก่อน</span>`;
        else if (diff < 0) trendText = `<span class="text-success">📉 รายจ่ายเดือนนี้ลดลง ${Math.abs(pct)}% จากเดือนก่อน</span>`;
        else trendText = `<span class="text-muted">➡️ รายจ่ายเท่ากับเดือนก่อน</span>`;
    }

    html += `<div class="d-flex justify-content-between align-items-center mt-2 px-1">`;
    html += `<div class="d-flex gap-3 small">`;
    html += `<span><span style="display:inline-block;width:10px;height:10px;background:#059669;border-radius:2px;margin-right:4px;"></span>รายรับ</span>`;
    html += `<span><span style="display:inline-block;width:10px;height:10px;background:#dc2626;border-radius:2px;margin-right:4px;"></span>รายจ่าย</span>`;
    html += `</div>`;
    if (trendText) html += `<span class="small fw-medium">${trendText}</span>`;
    html += `</div>`;

    area.innerHTML = html;
}

function renderAnalytics(summary, total) {
    const area = document.getElementById('analyticsArea');
    if (!area) return;
    area.innerHTML = '';
    
    const sortedCats = Object.keys(summary).map(name => ({ name: name, amount: summary[name] })).sort((a, b) => b.amount - a.amount);
    if (sortedCats.length === 0) {
        area.innerHTML = '<p class="text-center text-muted py-3 w-100 mb-0">❌ ไม่พบสัดส่วนข้อมูลรายจ่ายตามตัวกรองนี้</p>';
        return;
    }
    sortedCats.forEach(item => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
        const col = document.createElement('div');
        col.className = "col-12 col-md-6";
        col.innerHTML = `
            <div class="bg-light p-3 rounded-3 border">
                <div class="d-flex justify-content-between small fw-bold mb-1">
                    <span class="text-dark">${item.name === 'สลิปรอระบุหมวดหมู่' ? '⏳ รอระบุหมวดหมู่' : getCategoryEmoji(item.name)}</span>
                    <span class="text-secondary">${formatBaht(item.amount)} (${percentage}%)</span>
                </div>
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar ${item.name === 'สลิปรอระบุหมวดหมู่' ? 'bg-warning' : 'bg-danger'}" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
        area.appendChild(col);
    });
}

function renderSavingsTrend(allTxs) {
    const area = document.getElementById('savingsTrendArea');
    if (!area) return;

    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ 
            year: d.getFullYear(), 
            month: d.getMonth(), 
            label: `${d.toLocaleString('th-TH', { month: 'short' })} ${d.getFullYear() + 543}`,
            endTimestamp: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
        });
    }

    const savingsData = months.map(m => {
        let balance = 0;
        allTxs.forEach(tx => {
            const txTime = new Date(tx.created_at).getTime();
            if (tx.owner === 'emergency' && txTime <= m.endTimestamp) {
                const amt = parseFloat(tx.amount);
                balance += (tx.type === 'income' ? amt : -amt);
            }
        });
        return { ...m, balance: Math.max(0, balance) };
    });

    const maxVal = Math.max(...savingsData.map(m => m.balance), 1000);
    let html = `<div class="d-flex align-items-end justify-content-between gap-1" style="height: 180px; padding-bottom: 4px;">`;

    savingsData.forEach((m, i) => {
        const barH = Math.max(2, (m.balance / maxVal) * 120);
        const isCurrentMonth = (i === savingsData.length - 1);

        html += `<div class="d-flex flex-column align-items-center flex-fill" style="min-width: 0;">`;
        html += `<span class="text-success fw-bold mb-1" style="font-size: 0.65rem; white-space: nowrap;">${m.balance.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บ.</span>`;
        html += `<div title="ยอดสะสม: ${formatBaht(m.balance)}" style="width: 24px; height: ${barH}px; background: linear-gradient(180deg, #10b981, #047857); border-radius: 6px 6px 0 0; transition: height 0.4s ease; cursor: pointer;"></div>`;
        html += `<span class="text-center small mt-1 ${isCurrentMonth ? 'fw-bold text-success' : 'text-muted'}" style="font-size: 0.65rem; line-height: 1.1;">${m.label}</span>`;
        html += `</div>`;
    });
    html += `</div>`;
    
    let growthText = '';
    const firstMonth = savingsData[0];
    const lastMonth = savingsData[savingsData.length - 1];
    if (firstMonth && lastMonth) {
        const diff = lastMonth.balance - firstMonth.balance;
        if (diff > 0) {
            growthText = `<span class="text-success"><i class="bi bi-graph-up-arrow"></i> 6 เดือนที่ผ่านมาออมเพิ่มขึ้น +${diff.toLocaleString()} บาท</span>`;
        } else if (diff < 0) {
            growthText = `<span class="text-danger"><i class="bi bi-graph-down-arrow"></i> ยอดออมลดลงจาก 6 เดือนก่อน -${Math.abs(diff).toLocaleString()} บาท</span>`;
        } else {
            growthText = `<span class="text-muted">ยอดออมสะสมคงที่</span>`;
        }
    }
    
    html += `<div class="d-flex justify-content-between align-items-center mt-2 px-1">`;
    html += `<span class="small text-muted">สะสม ณ สิ้นเดือน</span>`;
    if (growthText) html += `<span class="small fw-medium">${growthText}</span>`;
    html += `</div>`;

    area.innerHTML = html;
}

// === 🔄 Sorting Operations (ระบบคลิกจัดเรียงแถวตาราง) ===

function toggleSort(field) {
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    currentPage = 1;
    loadTransactions();
}

function updateSortHeadersUI() {
    const fields = ['date', 'owner', 'type', 'category', 'amount'];
    fields.forEach(field => {
        const iconEl = document.getElementById(`sort-icon-${field}`);
        if (iconEl) {
            if (currentSortField === field) {
                iconEl.innerText = currentSortOrder === 'asc' ? ' ▲' : ' ▼';
                iconEl.className = 'text-primary fw-bold ms-1';
            } else {
                iconEl.innerText = '';
                iconEl.className = '';
            }
        }
    });
}

// === 📄 Pagination rendering (การแบ่งหน้าของตารางรายการ) ===

function renderPaginationControls(totalPages) {
    const nav = document.getElementById('paginationArea');
    if (!nav) return;
    nav.innerHTML = '';

    if (totalPages <= 1) return;

    let html = `<ul class="pagination pagination-sm mb-0 justify-content-center">`;
    
    // ปุ่มย้อนกลับ
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link cursor-pointer" onclick="changePage(${currentPage - 1})">ก่อนหน้า</a></li>`;
    
    // หมายเลขหน้า
    for (let i = 1; i <= totalPages; i++) {
        html += `<li class="page-item ${currentPage === i ? 'active' : ''}"><a class="page-link cursor-pointer" onclick="changePage(${i})">${i}</a></li>`;
    }
    
    // ปุ่มถัดไป
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link cursor-pointer" onclick="changePage(${currentPage + 1})">ถัดไป</a></li>`;
    html += `</ul>`;
    
    nav.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    loadTransactions();
}

// === 💾 Supabase CRUD Actions (ประสานงานข้อมูลกับเซิร์ฟเวอร์หลัก) ===

// 1. เรียกประวัติธุรกรรมทั้งหมดขึ้นหน้าเว็บ
async function loadTransactions() {
    const tbody = document.getElementById('transactionTableBody');
    if (tbody) {
        // วาดแถวเงาวิ่ง (Facebook Shimmering Rows) จำนวน 5 แถวระหว่างโหลดข้อมูล
        let shimmerRows = "";
        for (let i = 0; i < 5; i++) {
            shimmerRows += `
                <tr class="fb-skeleton-row">
                    <td><div class="fb-skeleton-line" style="width: 85px; height: 14px;"></div></td>
                    <td><div class="fb-skeleton-line" style="width: 110px; height: 14px;"></div></td>
                    <td><div class="fb-skeleton-line" style="width: 65px; height: 14px;"></div></td>
                    <td><div class="fb-skeleton-line" style="width: 85px; height: 14px;"></div></td>
                    <td><div class="fb-skeleton-line" style="width: 95px; height: 14px;"></div></td>
                    <td><div class="fb-skeleton-line" style="width: 160px; height: 14px;"></div></td>
                    <td><div class="fb-skeleton-line" style="width: 75px; height: 14px;"></div></td>
                </tr>
            `;
        }
        tbody.innerHTML = shimmerRows;
    }
    
    // สเกลเลตันโหลดส่วนอื่น ๆ สไตล์ Facebook
    if (typeof renderJarsLoadingSkeleton === 'function') renderJarsLoadingSkeleton();
    if (typeof renderAIInsightsLoadingSkeleton === 'function') renderAIInsightsLoadingSkeleton();
    
    const billTextEl = document.getElementById('billSummaryText');
    if (billTextEl) {
        billTextEl.innerHTML = `
            <div class="py-1">
                <div class="fb-skeleton-line" style="width: 60%; height: 14px; display: block; margin: 0 auto 8px auto;"></div>
                <div class="fb-skeleton-line" style="width: 80%; height: 12px; display: block; margin: 0 auto;"></div>
            </div>
        `;
    }
    const monthlyTrendArea = document.getElementById('monthlyTrendArea');
    if (monthlyTrendArea) {
        monthlyTrendArea.innerHTML = `
            <div class="d-flex align-items-end justify-content-between gap-2 px-3 py-4" style="height: 150px;">
                <div class="fb-skeleton-line" style="height: 40%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 70%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 55%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 90%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 30%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 80%; width: 12%; margin-bottom:0;"></div>
            </div>
        `;
    }
    const savingsTrendArea = document.getElementById('savingsTrendArea');
    if (savingsTrendArea) {
        savingsTrendArea.innerHTML = `
            <div class="d-flex align-items-end justify-content-between gap-2 px-3 py-4" style="height: 150px;">
                <div class="fb-skeleton-line" style="height: 25%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 45%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 60%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 75%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 90%; width: 12%; margin-bottom:0;"></div>
                <div class="fb-skeleton-line" style="height: 95%; width: 12%; margin-bottom:0;"></div>
            </div>
        `;
    }

    const { data: txs, error } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    if (tbody) tbody.innerHTML = '';

    let myTotal = 0; let partnerTotal = 0; let sharedTotal = 0; let emergencyTotal = 0;
    let totalMePaidShared = 0; let totalPartnerPaidShared = 0;
    let totalMeActualShare = 0; let totalPartnerActualShare = 0;
    let categorySummary = {}; let totalExpenseFiltered = 0;
    const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();

    filteredTxsCache = [];

    txs.forEach(tx => {
        const txDate = new Date(tx.created_at); const txAmount = parseFloat(tx.amount); const value = tx.type === 'income' ? txAmount : -txAmount;
        let exactOwner = tx.owner; let cleanNote = tx.note || '';
        
        // 🫂 ตรวจจับข้อความแชร์อ้อมกอดออโต้
        if (cleanNote.startsWith('[SYSTEM_HUG]')) {
            handleReceivedHug(tx);
            return;
        }

        // ดึงอารมณ์ที่บันทึก
        let emotion = '';
        const emotionMatch = cleanNote.match(/^\[อารมณ์:\s*(.*?)\]\s*/);
        if (emotionMatch) {
            emotion = emotionMatch[1];
            cleanNote = cleanNote.replace(emotionMatch[0], '');
        }

        if (tx.owner === 'shared') {
            if (cleanNote.startsWith('[จ่ายโดย: me]')) { exactOwner = 'shared-me'; cleanNote = cleanNote.replace('[จ่ายโดย: me] ', '').replace('[จ่ายโดย: me]', ''); }
            else if (cleanNote.startsWith('[จ่ายโดย: partner]')) { exactOwner = 'shared-partner'; cleanNote = cleanNote.replace('[จ่ายโดย: partner] ', '').replace('[จ่ายโดย: partner]', ''); }
        }

        if (tx.owner === 'me') myTotal += value;
        else if (tx.owner === 'partner') partnerTotal += value;
        else if (tx.owner === 'emergency') emergencyTotal += value;
        else if (tx.owner === 'shared') {
            sharedTotal += value;
            if (tx.type === 'expense') {
                if (exactOwner === 'shared-me') myTotal -= txAmount;
                else if (exactOwner === 'shared-partner') partnerTotal -= txAmount;
            }
        }

        let isCurrentFilterMonth = false;
        if (filterDate === 'this-month') { if (txDate.getMonth() !== thisMonth || txDate.getFullYear() !== thisYear) return; isCurrentFilterMonth = true; }
        else if (filterDate === 'last-month') { let targetMonth = thisMonth - 1; let targetYear = thisYear; if (targetMonth < 0) { targetMonth = 11; targetYear--; } if (txDate.getMonth() !== targetMonth || txDate.getFullYear() !== targetYear) return; isCurrentFilterMonth = true; }
        else { isCurrentFilterMonth = true; }

        if (isCurrentFilterMonth && tx.type === 'expense') {
            let mePct = 50;
            let partnerPct = 50;
            const ratioMatch = tx.note && tx.note.match(/สัดส่วน (?:โบ๊ท|คุณโบ๊ท)?\s*(\d+)\s*%\s*:\s*(?:เอิร์น|คุณเอิร์น)?\s*(\d+)\s*%/);
            if (ratioMatch) {
                mePct = parseInt(ratioMatch[1]);
                partnerPct = parseInt(ratioMatch[2]);
            }
            const meShare = txAmount * (mePct / 100);
            const partnerShare = txAmount * (partnerPct / 100);

            if (exactOwner === 'shared-me') {
                totalMePaidShared += txAmount;
                totalMeActualShare += meShare;
                totalPartnerActualShare += partnerShare;
            } else if (exactOwner === 'shared-partner') {
                totalPartnerPaidShared += txAmount;
                totalMeActualShare += meShare;
                totalPartnerActualShare += partnerShare;
            }
        }

        let passOwnerFilter = true;
        if (filterOwner !== 'all') {
            if (filterOwner === 'shared' && !(exactOwner === 'shared' || exactOwner === 'shared-me' || exactOwner === 'shared-partner')) passOwnerFilter = false;
            if (filterOwner === 'me' && exactOwner !== 'me') passOwnerFilter = false;
            if (filterOwner === 'partner' && exactOwner !== 'partner') passOwnerFilter = false;
            if (filterOwner === 'emergency' && exactOwner !== 'emergency') passOwnerFilter = false;
        }
        let passTypeFilter = true; if (filterType !== 'all' && tx.type !== filterType) passTypeFilter = false;

        if (isCurrentFilterMonth && passOwnerFilter && passTypeFilter && tx.type === 'expense') {
            const note = tx.note || '';
            const isInternalTransfer = 
                exactOwner === 'emergency' ||
                note.includes('[โอนเข้าออมฉุกเฉิน]') ||
                note.includes('[ถอนจากออมฉุกเฉิน]') ||
                note.includes('[หักเงินออมภารกิจ]') ||
                note.includes('[ถอนเงินออมภารกิจ]') ||
                note.includes('[หักออมอัตโนมัติ') ||
                note.includes('[ออมเพื่อ:');

            if (isInternalTransfer) {
                // ข้ามยอดเงินโอนออมภายใน เพื่อไม่ให้นับสะสมเป็นยอดรายจ่ายจริง
            } else {
                if (!categorySummary[tx.category_name]) categorySummary[tx.category_name] = 0;
                categorySummary[tx.category_name] += txAmount; totalExpenseFiltered += txAmount;
            }
        }

        if (!passOwnerFilter || !passTypeFilter || !isCurrentFilterMonth) return;

        filteredTxsCache.push({ tx, txDate, txAmount, exactOwner, cleanNote, emotion });
    });

    // คัดกรองและเรียงลำดับ
    filteredTxsCache.sort((a, b) => {
        let valA, valB;
        if (currentSortField === 'date') { valA = a.txDate.getTime(); valB = b.txDate.getTime(); }
        else if (currentSortField === 'owner') { valA = a.exactOwner; valB = b.exactOwner; }
        else if (currentSortField === 'type') { valA = a.tx.type; valB = b.tx.type; }
        else if (currentSortField === 'category') { valA = a.tx.category_name; valB = b.tx.category_name; }
        else if (currentSortField === 'amount') { valA = a.txAmount; valB = b.txAmount; }
        else { valA = a.txDate.getTime(); valB = b.txDate.getTime(); }

        if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.max(1, Math.ceil(filteredTxsCache.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * ROWS_PER_PAGE;
    const endIdx = startIdx + ROWS_PER_PAGE;
    const pageItems = filteredTxsCache.slice(startIdx, endIdx);

    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    const emergencyTitle = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';

    pageItems.forEach(({ tx, txDate, txAmount, exactOwner, cleanNote, emotion }) => {
        let ownerBadge = '';
        if (exactOwner === 'me') ownerBadge = `<span class="badge bg-primary-subtle text-primary">🙋‍♂️ ${nameMe}</span>`;
        else if (exactOwner === 'partner') ownerBadge = `<span class="badge bg-danger-subtle text-danger">🙋‍♀️ ${namePartner}</span>`;
        else if (exactOwner === 'emergency') ownerBadge = `<span class="badge bg-success text-white">🎯 ${emergencyTitle}</span>`;
        else if (exactOwner === 'shared-me') ownerBadge = `<span class="badge bg-warning text-dark">🤝 กองกลาง (${nameMe}จ่าย)</span>`;
        else if (exactOwner === 'shared-partner') ownerBadge = `<span class="badge bg-warning text-dark">🤝 กองกลาง (${namePartner}จ่าย)</span>`;
        else ownerBadge = '<span class="badge bg-warning text-dark">🤝 กองกลาง</span>';

        let displayNoteText = cleanNote;
        if (displayNoteText.includes('[SLIP_URL:')) {
            displayNoteText = displayNoteText.replace(/\[SLIP_URL:.*?\]/g, '').trim() || '📷 แนบไฟล์สลิป (คลิก ✏️ แก้ เพื่อลงหมวดหมู่จริง)';
        }

        const safeNote = escapeForAttr(tx.note || '');
        const safeOwner = escapeForAttr(tx.owner);
        const safeCategory = escapeForAttr(tx.category_name || 'ทั่วไป');
        const dateStr = txDate.toLocaleString('th-TH', { hour12: false });
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="small text-muted">${dateStr}</td>
            <td>${ownerBadge}</td>
            <td class="fw-medium ${tx.type === 'expense' ? 'text-danger' : 'text-success'}">${tx.type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}</td>
            <td class="fw-semibold ${tx.category_name === 'สลิปรอระบุหมวดหมู่' ? 'text-warning' : ''}">
                ${tx.category_name === 'สลิปรอระบุหมวดหมู่' ? '⏳ รอระบุหมวดหมู่' : getCategoryEmoji(tx.category_name)}
            </td>
            <td class="fw-bold">${formatBaht(txAmount)}</td>
            <td class="text-muted small">
                ${emotion ? `<span class="badge bg-light text-dark rounded-pill border me-1">${emotion}</span>` : ''}
                ${displayNoteText || '-'}
            </td>
            <td class="text-center whitespace-nowrap">
                <button onclick="enterEditMode(${tx.id}, ${txAmount}, '${safeNote}', '${safeOwner}', '${safeCategory}')" class="btn btn-outline-warning btn-sm py-0 px-2 cursor-pointer" style="border-radius:6px;">✏️ แก้</button>
                <button onclick="deleteTransaction(${tx.id})" data-delete-id="${tx.id}" class="btn btn-outline-danger btn-sm py-0 px-2 cursor-pointer" style="border-radius:6px;">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    renderPaginationControls(totalPages);

    document.getElementById('myTotal').innerText = formatBaht(myTotal);
    document.getElementById('partnerTotal').innerText = formatBaht(partnerTotal);
    document.getElementById('sharedTotal').innerText = formatBaht(sharedTotal);
    document.getElementById('emergencyTotal').innerText = formatBaht(emergencyTotal);

    const billSummaryTextEl = document.getElementById('billSummaryText');
    let monthLabel = "เดือนนี้";
    if (filterDate === 'last-month') monthLabel = "เดือนที่แล้ว";
    else if (filterDate === 'all') monthLabel = "ทั้งหมด";

    if (totalMePaidShared === 0 && totalPartnerPaidShared === 0) {
        if (billSummaryTextEl) billSummaryTextEl.innerHTML = `<div class="text-center py-2">🎉 ยังไม่มีรายจ่ายกองกลางร่วมกันใน${monthLabel}<br><span class="text-white-50 small" style="font-size: 0.8rem;">(ระบบจะช่วยหารครึ่งทันทีเมื่อจดรายการผ่านกระเป๋า "กองกลาง")</span></div>`;
    } else {
        const grandSharedExpense = totalMePaidShared + totalPartnerPaidShared;
        let settlementResultText = "";
        const netBoat = totalMePaidShared - totalMeActualShare;

        if (netBoat > 0.01) {
            settlementResultText = `🙋‍♀️ ${namePartner} ต้องโอนคืนให้ ${nameMe}: <span class="fw-bold text-warning fs-5">${formatBaht(netBoat)}</span>`;
        } else if (netBoat < -0.01) {
            const diff = Math.abs(netBoat);
            settlementResultText = `🙋‍♂️ ${nameMe} ต้องโอนคืนให้ ${namePartner}: <span class="fw-bold text-warning fs-5">${formatBaht(diff)}</span>`;
        } else {
            settlementResultText = `🤝 ยอดออกเงินสัดส่วนแชร์ร่วมกันลงตัวพอดีเป๊ะครับ!`;
        }

        if (billSummaryTextEl) billSummaryTextEl.innerHTML = `รายจ่ายกองกลาง${monthLabel}รวม: <b>${formatBaht(grandSharedExpense)}</b> (คำนวณตามสัดส่วนจริง)<br><div class="text-center mt-2 small text-white-50" style="font-size: 0.8rem;">• ${nameMe} ควักจ่ายล่วงหน้า: ${totalMePaidShared.toLocaleString()} บ. | ${namePartner} ควักจ่ายล่วงหน้า: ${totalPartnerPaidShared.toLocaleString()} บ.</div><hr class="my-2 text-white-50"><div class="text-center">${settlementResultText}</div>`;
    }
    
    renderAnalytics(categorySummary, totalExpenseFiltered);
    renderMonthlyTrend(txs);
    renderSavingsTrend(txs);
    updateMilestones(txs);

    loadedTxsCache = txs || [];
    currentTotalMePaidShared = totalMePaidShared;
    currentTotalPartnerPaidShared = totalPartnerPaidShared;
    updateInsightsAndProgress();
    updateSortHeadersUI();
}

// 2. บันทึกธุรกรรมใหม่ลงฐานข้อมูล
async function saveTransaction(categoryName, type) {
    if (isSaving) return;

    const amountInput = document.getElementById('txAmount');
    const noteInput = document.getElementById('txNote');
    const ownerInput = document.getElementById('txOwner');
    const slipInput = document.getElementById('slipInput');
    const previewArea = document.getElementById('slipPreviewArea');

    if (!ownerInput.value) return showToast('กรุณาเลือกกระเป๋าเงินด้วยครับ', '⚠️', true);
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) return showToast('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนเลือกหมวดหมู่', '🔢', true);
    const finalAmount = parseFloat(amount.toFixed(2));

    setAllCategoryButtonsLoading(true);

    let dbOwner = ownerInput.value;
    let finalNote = noteInput.value.trim();
    if (type === 'expense' && currentSpendEmotion) {
        finalNote = `[อารมณ์: ${currentSpendEmotion}] ${finalNote}`.trim();
    }

    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (dbOwner === 'emergency' && savingPurposeInput) {
        const purposeVal = savingPurposeInput.value.trim();
        if (purposeVal) {
            finalNote = finalNote ? `[ออมเพื่อ: ${purposeVal}] ${finalNote}` : `[ออมเพื่อ: ${purposeVal}]`;
        }
    }

    let isEmergencyTransfer = false;
    let emergencyTransferNote = '';
    if (dbOwner === 'emergency') {
        isEmergencyTransfer = true;
        const tag = type === 'income' ? '[โอนเข้าออมฉุกเฉิน]' : '[ถอนจากออมฉุกเฉิน]';
        finalNote = finalNote ? `${tag} ${finalNote}` : tag;
        emergencyTransferNote = finalNote;
    }

    let finalCategory = categoryName;

    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: me] ${finalNote}` : `[จ่ายโดย: me]`; }
    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: partner] ${finalNote}` : `[จ่ายโดย: partner]`; }

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{
            amount: finalAmount,
            type: type,
            category_name: finalCategory,
            note: finalNote || null,
            owner: dbOwner,
            created_at: new Date().toISOString()
        }]);

    if (error) {
        showToast(`บันทึกไม่สำเร็จ: ${error.message}`, '❌', true);
    } else {
        amountInput.value = ''; noteInput.value = ''; if (slipInput) slipInput.value = '';
        currentSpendEmotion = '';
        const emotionButtons = document.querySelectorAll('.emotion-btn');
        emotionButtons.forEach(btn => btn.classList.remove('active'));
        if (savingPurposeInput) {
            savingPurposeInput.value = '';
            document.getElementById('emergencyPurposeArea').classList.add('d-none');
        }
        if (previewArea) previewArea.classList.add('d-none');
        ownerInput.value = currentUserRole === 'me' ? 'me' : 'partner';
        showToast('จดบันทึกเรียบร้อยแล้วจ้า! 💰', '✅');
        cancelSlipPreview();

        // ฝาก/ถอนคู่กรณีเงินออมฉุกเฉิน
        if (isEmergencyTransfer) {
            const personalType = type === 'income' ? 'expense' : 'income';
            await supabaseClient.from('transactions').insert([{
                amount: finalAmount,
                type: personalType,
                category_name: 'ลงทุน',
                note: emergencyTransferNote,
                owner: currentUserRole,
                created_at: new Date().toISOString()
            }]);
            const actionText = type === 'income' ? 'นำฝากเข้า' : 'ถอนออกจาก';
            showToast(`${actionText}บัญชีออมและปรับเงินในกระเป๋าส่วนตัวเรียบร้อย! 🚨`, '🎯');
        }

        // หักออมอัตโนมัติ 10%
        const autoSaveEnabled = localStorage.getItem('autoSaveEnabled') === 'true';
        if (autoSaveEnabled && type === 'income' && (dbOwner === 'me' || dbOwner === 'partner')) {
            const pct = parseInt(localStorage.getItem('autoSavePercent')) || 10;
            const autoSaveAmt = parseFloat(((finalAmount * pct) / 100).toFixed(2));
            if (autoSaveAmt > 0) {
                const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
                const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
                const ownerName = dbOwner === 'me' ? nameMe : namePartner;
                
                // หักจ่ายส่วนตัว
                const deductNote = `[หักออมอัตโนมัติ ${pct}%] ส่งเข้าบัญชีออมฉุกเฉิน`;
                await supabaseClient.from('transactions').insert([{
                    amount: autoSaveAmt,
                    type: 'expense',
                    category_name: 'ลงทุน',
                    note: deductNote,
                    owner: dbOwner,
                    created_at: new Date().toISOString()
                }]);

                // โอนเข้าคลังออม
                const addNote = `เงินออมอัตโนมัติ ${pct}% จากรายรับของ${ownerName}`;
                await supabaseClient.from('transactions').insert([{
                    amount: autoSaveAmt,
                    type: 'income',
                    category_name: 'ลงทุน',
                    note: addNote,
                    owner: 'emergency',
                    created_at: new Date().toISOString()
                }]);
                
                showToast(`หักออมอัตโนมัติ ${pct}% (${autoSaveAmt.toLocaleString()} บ.) เข้าคลังเรียบร้อย! 🎯`, '🎯');
            }
        }

        triggerCelebration();
        await loadTransactions();
    }

    setAllCategoryButtonsLoading(false);
}

// Helper: ล็อกปุ่มป้องกันกดซ้ำ
function setAllCategoryButtonsLoading(loading) {
    isSaving = loading;
    const allBtns = document.querySelectorAll('.category-btn');
    allBtns.forEach(btn => {
        btn.disabled = loading;
        if (loading) {
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
        } else {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    });
}

// 3. เข้าสู่โหมดแก้ไขข้อมูล
function enterEditMode(id, amount, note, originalOwner, originalCategory) {
    switchTab('record');

    document.getElementById('editTxId').value = id;
    document.getElementById('txAmount').value = parseFloat(amount).toFixed(2);

    let displayOwner = originalOwner;
    let displayNote = note || '';

    let displaySavingPurpose = '';
    if (originalOwner === 'emergency') {
        const matchPurpose = displayNote.match(/\[ออมเพื่อ:\s*(.*?)\]/);
        if (matchPurpose && matchPurpose[1]) {
            displaySavingPurpose = matchPurpose[1];
            displayNote = displayNote.replace(/\[ออมเพื่อ:\s*.*?\]\s*/, '');
        }
        document.getElementById('emergencyPurposeArea').classList.remove('d-none');
    } else {
        document.getElementById('emergencyPurposeArea').classList.add('d-none');
    }
    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (savingPurposeInput) savingPurposeInput.value = displaySavingPurpose;

    if (originalOwner === 'shared') {
        if (displayNote.startsWith('[จ่ายโดย: me]')) { displayOwner = 'shared-me'; displayNote = displayNote.replace('[จ่ายโดย: me] ', '').replace('[จ่ายโดย: me]', ''); }
        else if (displayNote.startsWith('[จ่ายโดย: partner]')) { displayOwner = 'shared-partner'; displayNote = displayNote.replace('[จ่ายโดย: partner] ', '').replace('[จ่ายโดย: partner]', ''); }
    }

    const existingSlipArea = document.getElementById('existingSlipArea');
    if (existingSlipArea) existingSlipArea.remove();

    if (displayNote.includes('[SLIP_URL:')) {
        const match = displayNote.match(/\[SLIP_URL:(.*?)\]/);
        if (match && match[1]) {
            const fileName = match[1];
            const { data } = supabaseClient.storage.from('slips').getPublicUrl(fileName);

            const infoDiv = document.createElement('div');
            infoDiv.id = 'existingSlipArea';
            infoDiv.className = 'mt-2 mb-2 p-2 bg-white rounded border text-center';
            infoDiv.innerHTML = `
                <span class="text-muted small d-block mb-1">🖼️ รูปสลิปต้นฉบับสำหรับการตรวจสอบย้อนหลัง</span>
                <a href="${data.publicUrl}" target="_blank" class="btn btn-xs btn-outline-info py-0 px-2 small" style="font-size:0.75rem;"><i class="bi bi-image"></i> คลิกขยายเปิดดูรูปสลิป</a>
            `;
            document.getElementById('recordBox').appendChild(infoDiv);
        }
    }

    document.getElementById('txNote').value = displayNote;
    document.getElementById('txOwner').value = displayOwner;

    const editCategoryArea = document.getElementById('editCategoryArea');
    if (editCategoryArea) editCategoryArea.classList.remove('d-none');
    
    const txCategorySelect = document.getElementById('txCategory');
    if (txCategorySelect) txCategorySelect.value = originalCategory || 'ทั่วไป';

    const recordBox = document.getElementById('recordBox');
    recordBox.style.backgroundColor = '#fff3cd'; recordBox.style.borderColor = '#ffc107';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-pencil-fill text-warning me-1"></i> แก้ไขและระบุหมวดหมู่จริง';
    document.getElementById('categoryActionArea').classList.add('d-none');
    document.getElementById('editActionArea').classList.remove('d-none');
    window.scrollTo({ top: 100, behavior: 'smooth' });
}

function cancelEditMode() {
    document.getElementById('editTxId').value = ''; document.getElementById('txAmount').value = ''; document.getElementById('txNote').value = '';
    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (savingPurposeInput) {
        savingPurposeInput.value = '';
        document.getElementById('emergencyPurposeArea').classList.add('d-none');
    }
    document.getElementById('txOwner').value = currentUserRole === 'me' ? 'me' : 'partner';
    
    const editCategoryArea = document.getElementById('editCategoryArea');
    if (editCategoryArea) editCategoryArea.classList.add('d-none');

    const existingSlipArea = document.getElementById('existingSlipArea'); if (existingSlipArea) existingSlipArea.remove();
    const recordBox = document.getElementById('recordBox'); recordBox.style.backgroundColor = '#ffffff'; recordBox.style.borderColor = 'transparent';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-plus-square-fill text-success me-2"></i> บันทึกรายการใหม่';
    document.getElementById('categoryActionArea').classList.remove('d-none'); document.getElementById('editActionArea').classList.add('d-none');
    cancelSlipPreview();
}

// 4. อัปเดตและบันทึกการแก้ไขลงฐานข้อมูล
async function submitEditTransaction() {
    const editBtn = document.querySelector('#editActionArea .btn-warning');
    if (editBtn) { editBtn.disabled = true; editBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...'; }

    const id = document.getElementById('editTxId').value;
    const amount = parseFloat(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value.trim();
    const owner = document.getElementById('txOwner').value;

    if (!owner) { if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = '💾 บันทึกการแก้ไข'; } return showToast('กรุณาเลือกกระเป๋าเงินด้วยครับ', '⚠️', true); }
    if (isNaN(amount) || amount <= 0) { if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = '💾 บันทึกการแก้ไข'; } return showToast('กรุณากรอกยอดเงินให้ถูกต้อง', '🔢', true); }
    const finalAmount = parseFloat(amount.toFixed(2));

    const { data: currentTx } = await supabaseClient.from('transactions').select('note, amount, category_name, owner, type').eq('id', id).single();
    let fileToDelete = null;
    let oldNote = '';
    let oldAmount = 0;
    if (currentTx) {
        oldNote = currentTx.note || '';
        oldAmount = currentTx.amount || 0;
        if (currentTx.note && currentTx.note.includes('[SLIP_URL:')) {
            const match = currentTx.note.match(/\[SLIP_URL:(.*?)\]/);
            if (match && match[1]) fileToDelete = match[1];
        }
    }

    let dbOwner = owner;
    let finalNote = note;

    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (dbOwner === 'emergency' && savingPurposeInput) {
        const purposeVal = savingPurposeInput.value.trim();
        if (purposeVal) {
            finalNote = finalNote ? `[ออมเพื่อ: ${purposeVal}] ${finalNote}` : `[ออมเพื่อ: ${purposeVal}]`;
        }
    }

    const oldOwner = currentTx ? currentTx.owner : null;
    const oldType = currentTx ? currentTx.type : null;
    const wasEmergencyTransfer = (oldNote && (oldNote.includes('[โอนเข้าออมฉุกเฉิน]') || oldNote.includes('[ถอนจากออมฉุกเฉิน]')));

    if (!wasEmergencyTransfer && dbOwner === 'emergency') {
        const tag = oldType === 'income' ? '[โอนเข้าออมฉุกเฉิน]' : '[ถอนจากออมฉุกเฉิน]';
        if (!finalNote.includes(tag)) {
            finalNote = finalNote ? `${tag} ${finalNote}` : tag;
        }
    }

    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: me] ${finalNote}` : `[จ่ายโดย: me]`; }
    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: partner] ${finalNote}` : `[จ่ายโดย: partner]`; }

    const txCategorySelect = document.getElementById('txCategory');
    let finalCategory = txCategorySelect ? txCategorySelect.value : (currentTx ? currentTx.category_name : 'ทั่วไป');
    
    if (dbOwner === 'emergency') {
        finalCategory = 'ลงทุน';
    }

    if (finalCategory === "สลิปรอระบุหมวดหมู่" && !finalNote.includes('[SLIP_URL:')) {
        finalCategory = "ทั่วไป";
    }

    const { error: updateError } = await supabaseClient
        .from('transactions')
        .update({ amount: finalAmount, note: finalNote || null, owner: dbOwner, category_name: finalCategory })
        .eq('id', id);

    if (updateError) {
        showToast(`แก้ไขล้มเหลว: ${updateError.message}`, '❌', true);
    } else {
        if (fileToDelete && !finalNote.includes('[SLIP_URL:')) {
            await supabaseClient.storage.from('slips').remove([fileToDelete]);
            console.log(`[Storage Purged] ลบรูปสลิป ${fileToDelete} ออกจากระบบ Storage สำเร็จ`);
        }

        // จัดการและอัปเดตคู่โอนเงิน
        if (wasEmergencyTransfer) {
            let isBroken = false;
            if (oldOwner === 'emergency' && dbOwner !== 'emergency') {
                isBroken = true;
            } else if ((oldOwner === 'me' || oldOwner === 'partner') && (dbOwner === 'emergency' || dbOwner === 'shared')) {
                isBroken = true;
            }

            if (isBroken) {
                await supabaseClient.from('transactions').delete().eq('note', oldNote).eq('amount', oldAmount).neq('id', id);
                console.log("[Transfer Sync] Paired transaction deleted due to category conflict.");
            } else {
                let tag = oldNote.includes('[โอนเข้าออมฉุกเฉิน]') ? '[โอนเข้าออมฉุกเฉิน]' : '[ถอนจากออมฉุกเฉิน]';
                let cleanNewNote = finalNote.replace(/\[โอนเข้าออมฉุกเฉิน\]\s*/, '').replace(/\[ถอนจากออมฉุกเฉิน\]\s*/, '');
                let newNoteWithTag = cleanNewNote ? `${tag} ${cleanNewNote}` : tag;
                
                await supabaseClient.from('transactions').update({ amount: finalAmount, note: newNoteWithTag }).eq('note', oldNote).eq('amount', oldAmount).neq('id', id);
            }
        } else if (oldNote && (oldNote.startsWith('[หักเงินออมภารกิจ] ') || oldNote.startsWith('ภารกิจสำเร็จ: '))) {
            // จัดการอัปเดตคู่โอนภารกิจ
            if (oldNote.startsWith('[หักเงินออมภารกิจ] ')) {
                const oldTitle = oldNote.substring('[หักเงินออมภารกิจ] '.length);
                const newTitle = finalNote.startsWith('[หักเงินออมภารกิจ] ') ? finalNote.substring('[หักเงินออมภารกิจ] '.length) : finalNote;
                const counterpartOldNote = `ภารกิจสำเร็จ: ${oldTitle}`;
                const counterpartNewNote = `ภารกิจสำเร็จ: ${newTitle}`;
                
                await supabaseClient.from('transactions').update({ amount: finalAmount, note: counterpartNewNote }).eq('note', counterpartOldNote).eq('amount', oldAmount).neq('id', id);
            } else if (oldNote.startsWith('ภารกิจสำเร็จ: ')) {
                const oldTitle = oldNote.substring('ภารกิจสำเร็จ: '.length);
                const newTitle = finalNote.startsWith('ภารกิจสำเร็จ: ') ? finalNote.substring('ภารกิจสำเร็จ: '.length) : finalNote;
                const counterpartOldNote = `[หักเงินออมภารกิจ] ${oldTitle}`;
                const counterpartNewNote = `[หักเงินออมภารกิจ] ${newTitle}`;
                
                await supabaseClient.from('transactions').update({ amount: finalAmount, note: counterpartNewNote }).eq('note', counterpartOldNote).eq('amount', oldAmount).neq('id', id);
            }
        } else if (oldNote && (oldNote.startsWith('[หักออมอัตโนมัติ ') || oldNote.startsWith('เงินออมอัตโนมัติ '))) {
            // จัดการคู่หักออมอัตโนมัติ
            const matchOldDeduct = oldNote.match(/^\[หักออมอัตโนมัติ\s*(\d+)%\]\s*ส่งเข้าบัญชีออมฉุกเฉิน/);
            if (matchOldDeduct) {
                const pct = matchOldDeduct[1];
                const matchNewDeduct = finalNote.match(/^\[หักออมอัตโนมัติ\s*(\d+)%\]\s*ส่งเข้าบัญชีออมฉุกเฉิน/);
                const newPct = matchNewDeduct ? matchNewDeduct[1] : pct;
                
                const { data: pairedTxs } = await supabaseClient.from('transactions').select('id, note').eq('amount', oldAmount).neq('id', id);
                if (pairedTxs) {
                    const counterpart = pairedTxs.find(tx => tx.note && tx.note.startsWith(`เงินออมอัตโนมัติ ${pct}% จากรายรับของ`));
                    if (counterpart) {
                        const ownerNameMatch = counterpart.note.match(/จากรายรับของ(.*)$/);
                        const ownerName = ownerNameMatch ? ownerNameMatch[1] : '';
                        const newCounterpartNote = `เงินออมอัตโนมัติ ${newPct}% จากรายรับของ${ownerName}`;
                        await supabaseClient.from('transactions').update({ amount: finalAmount, note: newCounterpartNote }).eq('id', counterpart.id);
                    }
                }
            }
            
            const matchOldAdd = oldNote.match(/^เงินออมอัตโนมัติ\s*(\d+)%\s*จากรายรับของ/);
            if (matchOldAdd) {
                const pct = matchOldAdd[1];
                const matchNewAdd = finalNote.match(/^เงินออมอัตโนมัติ\s*(\d+)%\s*จากรายรับของ/);
                const newPct = matchNewAdd ? matchNewAdd[1] : pct;
                
                const counterpartOldNote = `[หักออมอัตโนมัติ ${pct}%] ส่งเข้าบัญชีออมฉุกเฉิน`;
                const counterpartNewNote = `[หักออมอัตโนมัติ ${newPct}%] ส่งเข้าบัญชีออมฉุกเฉิน`;
                
                await supabaseClient.from('transactions').update({ amount: finalAmount, note: counterpartNewNote }).eq('note', counterpartOldNote).eq('amount', oldAmount).neq('id', id);
            }
        } else {
            if (dbOwner === 'emergency') {
                const personalType = oldType === 'income' ? 'expense' : 'income';
                await supabaseClient.from('transactions').insert([{
                    amount: finalAmount,
                    type: personalType,
                    category_name: 'ลงทุน',
                    note: finalNote,
                    owner: currentUserRole,
                    created_at: new Date().toISOString()
                }]);
            }
        }

        cancelEditMode();
        showToast('อัปเดตข้อมูลและปรับยอดกระเป๋าเงินคู่โอนเรียบร้อยแล้วจ้า!', '💾');
        triggerCelebration();
        await loadTransactions();
    }

    if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = '💾 บันทึกการแก้ไข'; }
}

// 5. ลบแถวรายการข้อมูลออกจากฐานข้อมูล
async function deleteTransaction(id) {
    if (!(await showCustomConfirm('คุณแน่ใจใช่ไหมที่จะลบประวัติรายการเงินแถวนี้ทิ้งอย่างถาวร?\n(หากเป็นรายการโอนเงินข้ามบัญชี รายการเงินฝั่งคู่โอนจะถูกลบออกด้วยอัตโนมัติ)', 'ยืนยันการลบรายการ', '🗑️'))) return;

    const deleteBtn = document.querySelector(`[data-delete-id="${id}"]`);
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }

    const { data: currentTx } = await supabaseClient.from('transactions').select('note, amount').eq('id', id).single();
    if (currentTx) {
        if (currentTx.note && currentTx.note.includes('[SLIP_URL:')) {
            const match = currentTx.note.match(/\[SLIP_URL:(.*?)\]/);
            if (match && match[1]) await supabaseClient.storage.from('slips').remove([match[1]]);
        }
        
        // 1. ลบคู่โอนฉุกเฉิน
        if (currentTx.note && (currentTx.note.includes('[โอนเข้าออมฉุกเฉิน]') || currentTx.note.includes('[ถอนจากออมฉุกเฉิน]'))) {
            await supabaseClient.from('transactions').delete().eq('note', currentTx.note).eq('amount', currentTx.amount);
        }
        
        // 2. ลบคู่โอนภารกิจการเงิน
        if (currentTx.note) {
            if (currentTx.note.startsWith('[หักเงินออมภารกิจ] ')) {
                const title = currentTx.note.substring('[หักเงินออมภารกิจ] '.length);
                await supabaseClient.from('transactions').delete().eq('note', `ภารกิจสำเร็จ: ${title}`).eq('amount', currentTx.amount);
            } else if (currentTx.note.startsWith('ภารกิจสำเร็จ: ')) {
                const title = currentTx.note.substring('ภารกิจสำเร็จ: '.length);
                await supabaseClient.from('transactions').delete().eq('note', `[หักเงินออมภารกิจ] ${title}`).eq('amount', currentTx.amount);
            }
        }

        // 3. ลบคู่หักออมอัตโนมัติ
        if (currentTx.note) {
            const matchDeduct = currentTx.note.match(/^\[หักออมอัตโนมัติ\s*(\d+)%\]\s*ส่งเข้าบัญชีออมฉุกเฉิน/);
            if (matchDeduct) {
                const pct = matchDeduct[1];
                const { data: pairedTxs } = await supabaseClient.from('transactions').select('id, note').eq('amount', currentTx.amount);
                if (pairedTxs) {
                    const toDelete = pairedTxs.filter(tx => tx.note && tx.note.startsWith(`เงินออมอัตโนมัติ ${pct}% จากรายรับของ`));
                    if (toDelete.length > 0) {
                        const deleteIds = toDelete.map(tx => tx.id);
                        await supabaseClient.from('transactions').delete().in('id', deleteIds);
                    }
                }
            }
            
            const matchAdd = currentTx.note.match(/^เงินออมอัตโนมัติ\s*(\d+)%\s*จากรายรับของ/);
            if (matchAdd) {
                const pct = matchAdd[1];
                await supabaseClient.from('transactions').delete().eq('note', `[หักออมอัตโนมัติ ${pct}%] ส่งเข้าบัญชีออมฉุกเฉิน`).eq('amount', currentTx.amount);
            }
        }
    }

    const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
    if (error) {
        showToast(`ลบไม่สำเร็จ: ${error.message}`, '❌', true);
    } else {
        showToast('ลบรายการเงินทิ้งเรียบร้อย', '🗑️');
        await loadTransactions();
    }
}

// === 🎯 Couple Checklist Goals (จัดการภารกิจและเควสเป้าหมายของคู่รัก) ===

async function createNewGoalFrontend() {
    const titleInput = document.getElementById('newGoalTitle'); const amountInput = document.getElementById('newGoalAmount'); const typeInput = document.getElementById('newGoalType');
    const title = titleInput.value.trim(); const amount = parseFloat(amountInput.value);
    if (!title || isNaN(amount) || amount <= 0) return showToast('กรุณากรอกชื่อเควสและยอดเงินตั้งเป้าหมายให้ถูกต้องครับ', '⚠️', true);
    const now = new Date(); const targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    let dbType = typeInput.value;
    let dbTitle = title;
    if (dbType.startsWith('save_')) {
        dbTitle = `[${dbType}] ${title}`;
        dbType = 'save';
    }
    
    const { error } = await supabaseClient.from('goals').insert([{ title: dbTitle, amount: amount, type: dbType, goal_month: targetMonthStr, is_completed: false, is_failed: false }]);
    if (error) {
        showToast(`เพิ่มภารกิจล้มเหลว: ${error.message}`, '❌', true);
    } else {
        titleInput.value = ''; amountInput.value = '';
        localStorage.setItem(`defaultGoalsCreated_${targetMonthStr}`, 'true');
        showToast('เพิ่มภารกิจลงหน้าจอสำเร็จแล้ว!', '➕');
        triggerCelebration();
        await loadGoals();
    }
}

async function loadGoals() {
    const goalsList = document.getElementById('goalsList');
    if (goalsList) {
        // Facebook Shimmering lines for Goals Loading state
        goalsList.innerHTML = `
            <div class="py-2">
                <div class="fb-skeleton-line" style="width: 100%; height: 32px; border-radius: 8px; margin-bottom: 8px;"></div>
                <div class="fb-skeleton-line" style="width: 100%; height: 32px; border-radius: 8px;"></div>
            </div>
        `;
    }
    const now = new Date(); let targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (filterDate === 'last-month') { let prevMonth = now.getMonth() - 1; let prevYear = now.getFullYear(); if (prevMonth < 0) { prevMonth = 11; prevYear--; } targetMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`; }
    
    const checklistLabel = document.getElementById('checklistMonthLabel');
    if (checklistLabel) checklistLabel.innerText = filterDate === 'all' ? 'ทุกช่วงเวลา' : `ประจำเดือน ${targetMonthStr}`;
    
    let query = supabaseClient.from('goals').select('*');
    if (filterDate !== 'all') { query = query.eq('goal_month', targetMonthStr); }
    
    let { data: goals, error } = await query.order('id', { ascending: true });
    if (error) return console.error(error);
    
    // ตั้งค่าบิลเริ่มต้นหากรอบเดือนใหม่ยังว่าง
    if (goals.length === 0 && filterDate !== 'all') {
        const flagKey = `defaultGoalsCreated_${targetMonthStr}`;
        const alreadyCreated = localStorage.getItem(flagKey) === 'true';
        if (!alreadyCreated) {
            const defaultGoals = [
                { title: '[save_travel] ออมเงินกองกลางไปเที่ยวญี่ปุ่น', amount: 2000, type: 'save', goal_month: targetMonthStr },
                { title: 'จ่ายค่าส่วนกลางคอนโด', amount: 1500, type: 'bill', goal_month: targetMonthStr },
                { title: 'หยอดกระปุกสำรองฉุกเฉินเพิ่ม', amount: 1000, type: 'save', goal_month: targetMonthStr }
            ];
            const { data: insertedData, error: insertError } = await supabaseClient.from('goals').insert(defaultGoals).select();
            if (!insertError) { 
                goals = insertedData; 
                localStorage.setItem(flagKey, 'true');
                showToast(`สร้าง Checklist เดือน ${targetMonthStr} ออโต้จ้า!`, '🎉'); 
            }
        }
    }
    
    if (goalsList) goalsList.innerHTML = '';
    if (!goals || goals.length === 0) {
        if (goalsList) goalsList.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">ไม่มีภารกิจการเงินระบุไว้</p>';
        loadedGoalsCache = [];
        updateInsightsAndProgress();
        return;
    }
    
    goals.forEach(goal => {
        if (!goal || !goal.title) return;
        let goalType = goal.type;
        let goalTitle = goal.title;
        const typeMatch = goalTitle.match(/^\[(save[a-zA-Z0-9_]*)\]\s*/);
        if (typeMatch) {
            goalType = typeMatch[1];
            goalTitle = goalTitle.replace(typeMatch[0], '');
        }
        
        const safeTitle = escapeForAttr(goalTitle);
        const div = document.createElement('div');
        div.className = "list-group-item d-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded-3 border-0 text-sm shadow-2xs";
        
        let actionUI = '';
        if (goal.is_completed) {
            actionUI = `<div class="d-flex align-items-center gap-2"><span class="badge bg-success">✅ สำเร็จ</span><button onclick="resetGoalStatus(${goal.id}, '${safeTitle}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button></div>`;
        } else if (goal.is_failed) {
            actionUI = `<div class="d-flex align-items-center gap-2"><span class="badge bg-secondary text-dark">❌ ข้าม</span><button onclick="resetGoalStatus(${goal.id}, '${safeTitle}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button></div>`;
        } else {
            actionUI = `
                <div class="btn-group btn-group-sm" style="border-radius:8px; overflow:hidden;">
                    <button onclick="settleGoal(${goal.id}, 'success', '${safeTitle}', ${goal.amount}, '${goalType}')" class="btn btn-outline-success py-0.5 px-2 cursor-pointer">✅ ออมแล้ว</button>
                    <button onclick="settleGoal(${goal.id}, 'failed', '${safeTitle}', ${goal.amount}, '${goalType}')" class="btn btn-outline-danger py-0.5 px-2 cursor-pointer">❌ ข้าม</button>
                    <button onclick="deleteGoalFrontend(${goal.id})" class="btn btn-link text-muted p-0 px-1 ms-1 text-xs cursor-pointer" title="ลบถาวร">🗑️</button>
                </div>
            `;
        }
        
        div.innerHTML = `
            <div class="text-truncate me-2">
                <span class="${goal.is_completed ? 'text-decoration-line-through text-muted' : goal.is_failed ? 'text-decoration-line-through text-black-50 font-normal' : 'fw-semibold text-dark'}">
                    ${getGoalIcon(goalType)} ${goalTitle}
                </span>
            </div>
            <div class="d-flex align-items-center gap-2 shrink-0">
                <span class="fw-bold text-dark">${parseFloat(goal.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>
                ${actionUI}
            </div>
        `;
        if (goalsList) goalsList.appendChild(div);
    });
    
    loadedGoalsCache = goals || [];
    updateInsightsAndProgress();
}

async function settleGoal(id, status, title, amount, type) {
    let realTitle = title;
    let realAmount = amount;
    let realType = type;
    
    const { data: goalData, error: fetchError } = await supabaseClient.from('goals').select('title, amount, type').eq('id', id).single();
    if (!fetchError && goalData && goalData.title) {
        realTitle = goalData.title;
        realAmount = goalData.amount;
        realType = goalData.type;
        
        const typeMatch = realTitle.match(/^\[(save[a-zA-Z0-9_]*)\]\s*/);
        if (typeMatch) {
            realType = typeMatch[1];
            realTitle = realTitle.replace(typeMatch[0], '');
        }
    }

    if (status === 'success') {
        let currentAccumulated = 0;
        if (loadedTxsCache) {
            loadedTxsCache.forEach(tx => {
                if (tx.owner === 'emergency') {
                    const amt = parseFloat(tx.amount);
                    const isMatch = tx.note && (tx.note.includes(`ภารกิจสำเร็จ: ${realTitle}`) || tx.note.includes(`[ออมเพื่อ: ${realTitle}]`));
                    if (isMatch) {
                        currentAccumulated += (tx.type === 'income' ? amt : -amt);
                    }
                }
            });
        }

        const remainingAmount = Math.max(0, realAmount - currentAccumulated);
        let finalAmount = 0;
        let createTx = false;

        if (realType.startsWith('save')) {
            if (remainingAmount <= 0) {
                if (!(await showCustomConfirm(`ยืนยันทำเควสสำเร็จ: "${realTitle}"?\n(คุณได้เก็บเงินออมสะสมครบเป้าหมายแล้ว ระบบจะไม่สร้างธุรกรรมใหม่ซ้ำซ้อน)`, 'ทำภารกิจสำเร็จ', '🏆'))) return;
                createTx = false;
            } else {
                const confirmText = `ยืนยันทำเควสสำเร็จ: "${realTitle}"?\n(สะสมแล้ว ${currentAccumulated.toLocaleString('th-TH')} บ. ยังขาดอีก ${remainingAmount.toLocaleString('th-TH')} บ.)\n\nต้องการเปลี่ยนสถานะภารกิจนี้เป็นสำเร็จหรือไม่?`;
                const choice = await showCustomConfirm(confirmText, 'ทำภารกิจสำเร็จ', '🏆');
                if (!choice) return;

                const confirmTransfer = await showCustomConfirm(
                    `ต้องการให้ระบบบันทึกรายการโอนเงินจำนวน ${remainingAmount.toLocaleString('th-TH')} บ. เพื่อสมทบให้เต็มจำนวนด้วยหรือไม่?\n(เลือก 'ยกเลิก' เพื่อเปลี่ยนสถานะเป็นสำเร็จเฉยๆ โดยไม่มีรายการโอนเงินเพิ่มเติม)`,
                    'บันทึกรายการโอนเงิน',
                    '💰'
                );
                if (confirmTransfer) {
                    finalAmount = parseFloat(remainingAmount.toFixed(2));
                    createTx = true;
                } else {
                    createTx = false;
                }
            }
        } else {
            if (!(await showCustomConfirm(`ยืนยันจ่ายบิลสำเร็จ: "${realTitle}"?\nระบบจะสร้างธุรกรรมจ่ายเงินให้อัตโนมัติ`, 'จ่ายบิลสำเร็จ', '🏆'))) return;
            finalAmount = parseFloat(parseFloat(realAmount).toFixed(2));
            createTx = true;
        }

        const { error } = await supabaseClient.from('goals').update({ is_completed: true, is_failed: false }).eq('id', id);
        if (error) return showToast(error.message, '❌', true);
        
        if (createTx && finalAmount > 0) {
            if (realType.startsWith('save')) { 
                let emoji = getGoalIcon(realType);
                
                await supabaseClient.from('transactions').insert([{
                    amount: finalAmount,
                    type: 'expense',
                    category_name: 'ลงทุน',
                    owner: currentUserRole,
                    note: `[หักเงินออมภารกิจ] ${realTitle}`,
                    created_at: new Date().toISOString()
                }]);

                await supabaseClient.from('transactions').insert([{
                    amount: finalAmount,
                    type: 'income',
                    category_name: 'ลงทุน',
                    owner: 'emergency',
                    note: `ภารกิจสำเร็จ: ${realTitle}`,
                    created_at: new Date().toISOString()
                }]); 
                showToast(`ย้ายเงินส่วนที่เหลือเข้าบัญชีออมสำเร็จ ${emoji}`, '🎉'); 
            } else {
                let noteWithTag = `[จ่ายโดย: ${currentUserRole === 'me' ? 'me' : 'partner'}] จ่ายบิลออโต้: ${realTitle}`;
                await supabaseClient.from('transactions').insert([{
                    amount: finalAmount,
                    type: 'expense',
                    category_name: 'ค่าที่พัก/บ้าน',
                    owner: 'shared',
                    note: noteWithTag,
                    created_at: new Date().toISOString()
                }]);
                showToast('ตัดยอดบิลส่วนกลางเรียบร้อย 📄', '✅');
            }
        } else {
            showToast('บันทึกสถานะภารกิจสำเร็จแล้ว! 🏆', '🎉');
        }
        triggerCelebration();
    } else {
        if (!(await showCustomConfirm(`เดือนนี้ล้มเหลว/ข้ามภารกิจ: "${realTitle}" ใช่ไหม?`, 'ข้ามภารกิจ', '📁'))) return;
        const { error } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: true }).eq('id', id);
        if (error) return showToast(error.message, '❌', true);
        showToast('บันทึกสถิติข้ามเควสแล้ว ❌', '📁');
    }
    await loadGoals(); await loadTransactions();
}

async function resetGoalStatus(id, title) {
    let realTitle = title;
    const { data: goalData, error: fetchError } = await supabaseClient.from('goals').select('title').eq('id', id).single();
    if (!fetchError && goalData && goalData.title) {
        realTitle = goalData.title;
        const typeMatch = realTitle.match(/^\[(save[a-zA-Z0-9_]*)\]\s*/);
        if (typeMatch) {
            realTitle = realTitle.replace(typeMatch[0], '');
        }
    }

    if (!(await showCustomConfirm(`คุณต้องการยกเลิกสถานะของภารกิจ "${realTitle}" เพื่อกลับไปเลือกกดใหม่ ใช่หรือไม่?\n(ระบบจะลบรายการเงินที่เคยบันทึกให้อัตโนมัติ)`, 'รีเซ็ตสถานะภารกิจ', '↩️'))) return;
    
    const { error: goalError } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: false }).eq('id', id);
    if (goalError) return showToast(goalError.message, '❌', true);

    const notePattern1 = `ภารกิจสำเร็จ: ${realTitle}`;
    const notePatternDeduct = `[หักเงินออมภารกิจ] ${realTitle}`;
    const notePatternMe = `[จ่ายโดย: me] จ่ายบิลออโต้: ${realTitle}`;
    const notePatternPartner = `[จ่ายโดย: partner] จ่ายบิลออโต้: ${realTitle}`;
    
    console.log("Attempting to delete transactions with notes:", [notePattern1, notePatternDeduct, notePatternMe, notePatternPartner]);
    const { error: deleteError } = await supabaseClient.from('transactions').delete().in('note', [notePattern1, notePatternDeduct, notePatternMe, notePatternPartner]);
    if (deleteError) {
        console.error("Delete transactions error:", deleteError);
        showToast(`ลบธุรกรรมล้มเหลว: ${deleteError.message}`, '❌', true);
    } else {
        console.log("Delete transactions query completed successfully");
    }

    showToast('รีเซ็ตสถานะภารกิจและคืนยอดกระเป๋าเงินเรียบร้อย', '↩️');
    await loadGoals();
    await loadTransactions();
}

async function deleteGoalFrontend(id) {
    if (!(await showCustomConfirm('ต้องการลบภารกิจนี้ออกจากหน้าจอใช่ไหมครับ?', 'ลบภารกิจ', '🗑️'))) return;
    const now = new Date();
    const targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { error } = await supabaseClient.from('goals').delete().eq('id', id);
    if (error) showToast(error.message, '❌', true);
    else { 
        localStorage.setItem(`defaultGoalsCreated_${targetMonthStr}`, 'true');
        showToast('ลบภารกิจออกแล้ว', '🗑️'); 
        await loadGoals(); 
    }
}

// === 📅 Subscriptions & Monthly Bills (บิลบริการและรายจ่ายประจำเดือน) ===

function initRecurringBills() {
    const saved = localStorage.getItem('recurringBills');
    if (!saved) {
        const defaultBills = [
            { title: "Netflix 📺", amount: 419, dueDay: 15, share: "shared-me", history: {} },
            { title: "Spotify Family 🎵", amount: 209, dueDay: 20, share: "shared-partner", history: {} },
            { title: "ค่าไฟห้องคอนโด ⚡", amount: 1500, dueDay: 5, share: "shared-me", history: {} }
        ];
        localStorage.setItem('recurringBills', JSON.stringify(defaultBills));
        recurringBills = defaultBills;
    } else {
        try { recurringBills = JSON.parse(saved); } catch (e) { recurringBills = []; }
    }
    renderRecurringBills();
}

function toggleBillForm(show) {
    const form = document.getElementById('addBillForm');
    if (form) {
        if (show) { form.classList.remove('d-none'); }
        else {
            form.classList.add('d-none');
            document.getElementById('billTitleInput').value = '';
            document.getElementById('billAmountInput').value = '';
            document.getElementById('billDueInput').value = '15';
            document.getElementById('billShareInput').value = 'shared-me';
        }
    }
}

function saveNewBill() {
    const title = document.getElementById('billTitleInput').value.trim();
    const amount = parseFloat(document.getElementById('billAmountInput').value);
    const dueDay = parseInt(document.getElementById('billDueInput').value);
    const share = document.getElementById('billShareInput').value;

    if (!title) return showToast('กรุณากรอกชื่อบริการด้วยครับ', '⚠️', true);
    if (isNaN(amount) || amount <= 0) return showToast('กรุณากรอกยอดเงินให้ถูกต้อง', '🔢', true);
    if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) return showToast('กรุณากรอกดิววันที่ระหว่าง 1 - 31', '📅', true);

    const newBill = { title, amount: parseFloat(amount.toFixed(2)), dueDay, share, history: {} };
    recurringBills.push(newBill);
    localStorage.setItem('recurringBills', JSON.stringify(recurringBills));
    toggleBillForm(false);
    renderRecurringBills();
    showToast('เพิ่มรายการบิลประจำเรียบร้อยแล้วจ้า! 📅', '✅');
}

async function deleteBill(index) {
    if (!(await showCustomConfirm(`ต้องการลบรายการบิล "${recurringBills[index].title}" ใช่หรือไม่?`, 'ลบบิลประจำ', '🗑️'))) return;
    recurringBills.splice(index, 1);
    localStorage.setItem('recurringBills', JSON.stringify(recurringBills));
    renderRecurringBills();
    showToast('ลบรายการบิลเรียบร้อยแล้ว', '🗑️');
}

function getCategoryForBill(title) {
    const lower = title.toLowerCase();
    if (lower.includes('ไฟ') || lower.includes('น้ำ') || lower.includes('เน็ต') || lower.includes('บ้าน') || lower.includes('คอนโด') || lower.includes('📺') || lower.includes('netflix') || lower.includes('disney')) {
        return 'ค่าที่พัก/บ้าน';
    }
    if (lower.includes('รถ') || lower.includes('น้ำมัน') || lower.includes('เดินทาง') || lower.includes('⛽')) {
        return 'เดินทาง';
    }
    return 'อื่นๆ';
}

async function payBill(index) {
    const bill = recurringBills[index];
    if (!(await showCustomConfirm(`ยืนยันจ่ายบิลประจำสำหรับ: "${bill.title}" ยอดเงิน ${bill.amount.toLocaleString()} บาท?\n(ระบบจะสร้างธุรกรรมรายจ่ายให้อัตโนมัติ)`, 'ยืนยันจ่ายบิล', '💳'))) return;

    const now = new Date();
    const monthYearKey = `${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getFullYear()}`;

    let dbOwner = bill.share;
    let finalNote = `[จ่ายบิลประจำ] ${bill.title}`;
    
    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = `[จ่ายโดย: me] ${finalNote}`; }
    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = `[จ่ายโดย: partner] ${finalNote}`; }

    const { error } = await supabaseClient.from('transactions').insert([{
        amount: bill.amount,
        type: 'expense',
        category_name: getCategoryForBill(bill.title),
        note: finalNote,
        owner: dbOwner,
        created_at: now.toISOString()
    }]);

    if (error) return showToast(`บันทึกจ่ายบิลล้มเหลว: ${error.message}`, '❌', true);

    bill.history[monthYearKey] = true;
    localStorage.setItem('recurringBills', JSON.stringify(recurringBills));

    showToast(`จ่ายบิล ${bill.title} เรียบร้อย! 🎉`, '💳');
    triggerCelebration();
    renderRecurringBills();
    await loadTransactions();
}

function renderRecurringBills() {
    const list = document.getElementById('recurringBillsList');
    if (!list) return;

    if (recurringBills.length === 0) {
        list.innerHTML = `<p class="text-center text-muted py-4 small mb-0">💡 ยังไม่มีรายการบิลประจำ คลิกปุ่ม "ตั้งค่าบิล" ด้านบนเพื่อเพิ่มได้เลยครับ</p>`;
        return;
    }

    const now = new Date();
    const monthYearKey = `${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getFullYear()}`;
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';

    list.innerHTML = '';
    recurringBills.forEach((bill, idx) => {
        const isPaidThisMonth = bill.history[monthYearKey] === true;
        
        let shareText = '';
        if (bill.share === 'shared-me') shareText = `🤝 กองกลาง (${nameMe} จ่ายก่อน)`;
        else if (bill.share === 'shared-partner') shareText = `🤝 กองกลาง (${namePartner} จ่ายก่อน)`;
        else if (bill.share === 'me') shareText = `🙋‍♂️ กระเป๋า ${nameMe} จ่ายเดี่ยว`;
        else if (bill.share === 'partner') shareText = `🙋‍♀️ กระเป๋า ${namePartner} จ่ายเดี่ยว`;

        const row = document.createElement('div');
        row.className = "d-flex align-items-center justify-content-between p-2 mb-2 bg-light rounded-3 text-xs";
        row.style.backgroundColor = "var(--light-bg)";
        row.style.border = "1px solid var(--card-border)";
        
        let actionHTML = '';
        if (isPaidThisMonth) {
            actionHTML = `<span class="badge bg-success-subtle text-success py-1 px-2.5 rounded-pill fw-bold"><i class="bi bi-check-circle-fill me-1"></i> จ่ายแล้ว</span>`;
        } else {
            actionHTML = `<button onclick="payBill(${idx})" class="btn btn-success btn-xs py-1 px-2.5 fw-bold cursor-pointer rounded-pill shadow-xs">💳 จ่ายแล้ว</button>`;
        }

        row.innerHTML = `
            <div class="text-truncate me-2" style="max-width: 65%;">
                <span class="fw-bold text-dark d-flex align-items-center" style="font-size: 0.8rem; color: var(--text-dark) !important;">
                    ${bill.title}
                    <span onclick="deleteBill(${idx})" class="text-muted ms-2 cursor-pointer small" style="opacity:0.5; font-size: 0.7rem;" title="ลบบิลประจำนี้">🗑️</span>
                </span>
                <span class="text-muted small d-block mt-0.5" style="font-size: 0.65rem;">ดิววันที่ ${bill.dueDay} • ${shareText}</span>
            </div>
            <div class="d-flex align-items-center gap-2 shrink-0">
                <span class="fw-bold text-dark" style="font-size: 0.8rem; color: var(--text-dark) !important;">${parseFloat(bill.amount).toLocaleString('th-TH')} บ.</span>
                ${actionHTML}
            </div>
        `;
        list.appendChild(row);
    });
}

// === 🎰 Wheel of Fortune: savings challenge (วงล้อสุ่มประหยัดเงินคู่รัก) ===

const wheelTasks = [
    { text: "งดชาไข่มุก/กาแฟวันนี้ 🥤", val: 50, type: "saving" },
    { text: "หยอดออมฉุกเฉิน 50 บ. 💰", val: 50, type: "deposit" },
    { text: "หยอดออมฉุกเฉิน 100 บ. 💸", val: 100, type: "deposit" },
    { text: "งดฟาสต์ฟู้ด/เดลิเวอรี่ 1 วัน 🍔", val: 100, type: "saving" },
    { text: "กอดคนรักฟรี 1 ครั้ง 💖", val: 0, type: "love" },
    { text: "ทำอาหารทานเองร่วมกัน 🍱", val: 80, type: "saving" },
    { text: "งดช้อปออนไลน์ 1 วัน 🛍️", val: 150, type: "saving" },
    { text: "ทำความสะอาดบ้านร่วมกัน 🧹", val: 0, type: "chore" }
];

let isSpinning = false;
let currentAngle = 0;
let spinVelocity = 0;
let animationFrameId = null;
let activeQuestTemp = null;

function initWheel() { drawWheel(currentAngle); }

function drawWheel(angle) {
    const canvas = document.getElementById("wheelCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width; const height = canvas.height;
    const radius = width / 2; const numSegments = wheelTasks.length;
    const arcSize = (2 * Math.PI) / numSegments;

    ctx.clearRect(0, 0, width, height);
    const colors = ["#ffb7b2", "#ffdac1", "#e2f0cb", "#b5ead7", "#c7ceea", "#ff9aa2", "#e8d7ff", "#d5ebff"];

    for (let i = 0; i < numSegments; i++) {
        const segAngle = angle + i * arcSize;
        ctx.beginPath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius - 10, segAngle, segAngle + arcSize);
        ctx.lineTo(radius, radius);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = "#2d3748";
        ctx.font = "bold 11px 'Sarabun', sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.translate(radius, radius);
        ctx.rotate(segAngle + arcSize / 2);
        ctx.fillText(wheelTasks[i].text, radius - 25, 0);
        ctx.restore();
    }

    ctx.beginPath(); ctx.arc(radius, radius, 25, 0, 2 * Math.PI);
    ctx.fillStyle = "#fbbf24"; ctx.fill();
    ctx.strokeStyle = "#d97706"; ctx.lineWidth = 3; ctx.stroke();

    ctx.fillStyle = "#78350f"; ctx.font = "bold 12px 'Sarabun', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🎰", radius, radius);
}

async function spinWheel() {
    if (isSpinning) return;
    const ongoing = localStorage.getItem('ongoingQuest');
    if (ongoing) { await showCustomAlert("คุณมีภารกิจคาอยู่นะ ทำภารกิจปัจจุบันให้เสร็จ หรือกดยอมแพ้ก่อนสปินใหม่น้าา!", "มีภารกิจค้างอยู่", "🐻"); return; }
    
    isSpinning = true;
    const btn = document.getElementById("btnSpin");
    if (btn) btn.disabled = true;
    
    const activeQuestArea = document.getElementById("activeQuestArea");
    if (activeQuestArea) activeQuestArea.classList.add("d-none");
    
    spinVelocity = 0.25 + Math.random() * 0.25;
    let lastTickAngle = 0;
    
    function animateSpin() {
        currentAngle += spinVelocity;
        spinVelocity *= 0.982;
        
        const arcSize = (2 * Math.PI) / wheelTasks.length;
        const currentSegmentIdx = Math.floor(((currentAngle + Math.PI/2) % (2 * Math.PI)) / arcSize);
        const lastSegmentIdx = Math.floor(((lastTickAngle + Math.PI/2) % (2 * Math.PI)) / arcSize);
        if (currentSegmentIdx !== lastSegmentIdx) {
            playSynthSound("tick");
            lastTickAngle = currentAngle;
        }

        drawWheel(currentAngle);

        if (spinVelocity < 0.002) {
            isSpinning = false;
            if (btn) btn.disabled = false;
            cancelAnimationFrame(animationFrameId);
            determineWinningSegment();
        } else {
            animationFrameId = requestAnimationFrame(animateSpin);
        }
    }
    animateSpin();
}

function determineWinningSegment() {
    const numSegments = wheelTasks.length; const arcSize = (2 * Math.PI) / numSegments;
    let relAngle = (-Math.PI / 2 - currentAngle) % (2 * Math.PI);
    if (relAngle < 0) relAngle += 2 * Math.PI;
    
    const winningIdx = Math.floor(relAngle / arcSize) % numSegments;
    const wonQuest = wheelTasks[winningIdx];
    
    playSynthSound("success");
    activeQuestTemp = wonQuest;
    
    const activeQuestArea = document.getElementById("activeQuestArea");
    const questText = document.getElementById("questText");
    if (activeQuestArea && questText) {
        questText.innerHTML = wonQuest.text;
        activeQuestArea.classList.remove("d-none");
    }
}

function acceptQuest() {
    if (!activeQuestTemp) return;
    localStorage.setItem("ongoingQuest", JSON.stringify(activeQuestTemp));
    activeQuestTemp = null;
    document.getElementById("activeQuestArea").classList.add("d-none");
    renderQuestState();
    showToast("🎯 ยอมรับคำท้าเรียบร้อย ลุยกันเลยคู่รัก!", "✨");
}

function cancelQuest() {
    activeQuestTemp = null;
    document.getElementById("activeQuestArea").classList.add("d-none");
}

function renderQuestState() {
    const ongoing = localStorage.getItem("ongoingQuest");
    const activeArea = document.getElementById("activeQuestArea");
    const ongoingArea = document.getElementById("ongoingQuestArea");
    const ongoingText = document.getElementById("ongoingQuestText");
    
    if (ongoing) {
        const quest = JSON.parse(ongoing);
        if (ongoingArea && ongoingText) {
            ongoingText.innerHTML = quest.text;
            ongoingArea.classList.remove("d-none");
        }
        if (activeArea) activeArea.classList.add("d-none");
    } else {
        if (ongoingArea) ongoingArea.classList.add("d-none");
    }
}

async function completeQuest() {
    const ongoing = localStorage.getItem("ongoingQuest");
    if (!ongoing) return;
    const quest = JSON.parse(ongoing);
    
    if (quest.type === "deposit") {
        const amount = parseFloat(quest.val);
        const noteText = `[เควสสุ่มรายวัน] ทำสำเร็จ: ${quest.text}`;
        
        try {
            const { error } = await supabaseClient.from("transactions").insert([{
                amount: amount,
                type: "income",
                category_name: "ออมเงินสำรอง",
                note: noteText,
                owner: "emergency",
                created_at: new Date().toISOString()
            }]);
            if (error) throw error;
            showToast(`🎉 ทำสำเร็จ! หยอดกระปุกฉุกเฉิน ${amount} บ. เรียบร้อย`, "💰");
        } catch (err) {
            console.error("Error inserting quest transaction:", err);
            showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่", "❌");
            return;
        }
    } else {
        showToast(`🎉 เก่งมาก! ทำภารกิจสำเร็จ: ${quest.text}`, "✨");
    }
    
    playSynthSound("cash");
    if (typeof confetti === "function") {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
    
    localStorage.removeItem("ongoingQuest");
    renderQuestState();
    loadTransactions();
}

async function forfeitQuest() {
    if (await showCustomConfirm("แน่ใจหรอว่าจะยอมแพ้ภารกิจนี้? พี่หมีเสียใจน้าา 🐻💔", "ยอมแพ้ภารกิจ", "🐻💔")) {
        localStorage.removeItem("ongoingQuest");
        renderQuestState();
        showToast("ยกเลิกภารกิจแล้ว เริ่มหมุนใหม่ได้เลยครับ", "🍃");
    }
}

// === 💸 Couple Bill Splitter (เครื่องมือแชร์และหารยอดจ่ายส่วนกลาง) ===

function toggleCustomRatioUI() {
    const ratio = document.getElementById("splitRatio").value;
    const customArea = document.getElementById("customSplitArea");
    if (ratio === "custom") { customArea.classList.remove("d-none"); }
    else { customArea.classList.add("d-none"); }
}

function adjustPartnerPercent() {
    let mePct = parseInt(document.getElementById("splitPercentMe").value);
    if (isNaN(mePct)) mePct = 50;
    const clampedMe = Math.min(100, Math.max(0, mePct));
    document.getElementById("splitPercentMe").value = clampedMe;
    document.getElementById("splitPercentPartner").value = 100 - clampedMe;
    calculateSplitResult();
}

function adjustMePercent() {
    let partnerPct = parseInt(document.getElementById("splitPercentPartner").value);
    if (isNaN(partnerPct)) partnerPct = 50;
    const clampedPartner = Math.min(100, Math.max(0, partnerPct));
    document.getElementById("splitPercentPartner").value = clampedPartner;
    document.getElementById("splitPercentMe").value = 100 - clampedPartner;
    calculateSplitResult();
}

function calculateSplitResult() {
    const amtInput = document.getElementById("splitAmount").value;
    const summaryEl = document.getElementById("splitSummaryText");
    if (!summaryEl) return;
    
    if (!amtInput || parseFloat(amtInput) <= 0) {
        summaryEl.innerHTML = "กรุณากรอกยอดเงิน";
        return;
    }
    
    const amount = parseFloat(amtInput);
    const payer = document.getElementById("splitPayer").value;
    const ratioVal = document.getElementById("splitRatio").value;
    
    let mePct = 50; let partnerPct = 50;
    
    if (ratioVal === "50-50") { mePct = 50; partnerPct = 50; }
    else if (ratioVal === "60-40") { mePct = 60; partnerPct = 40; }
    else if (ratioVal === "40-60") { mePct = 40; partnerPct = 60; }
    else if (ratioVal === "custom") {
        mePct = parseInt(document.getElementById("splitPercentMe").value);
        if (isNaN(mePct)) mePct = 50;
        partnerPct = 100 - mePct;
    }
    
    const nameMe = localStorage.getItem("nameMe") || "คุณโบ๊ท";
    const namePartner = localStorage.getItem("namePartner") || "คุณเอิร์น";
    
    if (payer === "me") {
        const payBack = amount * (partnerPct / 100);
        summaryEl.innerHTML = `💸 ยอดรวม ${amount.toLocaleString()} บ. (${nameMe} ออกก่อน)<br><b>${namePartner} ต้องโอนคืน ${nameMe}</b> = <span class="fs-4 text-indigo fw-extrabold">${formatBaht(payBack)}</span>`;
    } else {
        const payBack = amount * (mePct / 100);
        summaryEl.innerHTML = `💸 ยอดรวม ${amount.toLocaleString()} บ. (${namePartner} ออกก่อน)<br><b>${nameMe} ต้องโอนคืน ${namePartner}</b> = <span class="fs-4 text-indigo fw-extrabold">${formatBaht(payBack)}</span>`;
    }
}

async function saveSplitBill() {
    const title = document.getElementById("splitTitle").value.trim();
    const amtInput = document.getElementById("splitAmount").value;
    
    if (!title) { await showCustomAlert("กรุณากรอกชื่อรายการค่าใช้จ่าย!", "ข้อมูลไม่ครบถ้วน", "⚠️"); return; }
    if (!amtInput || parseFloat(amtInput) <= 0) { await showCustomAlert("กรุณากรอกยอดเงินรวมให้ถูกต้อง!", "ยอดเงินไม่ถูกต้อง", "🔢"); return; }
    
    const amount = parseFloat(amtInput);
    const payer = document.getElementById("splitPayer").value;
    const ratioVal = document.getElementById("splitRatio").value;
    
    let mePct = 50; let partnerPct = 50;
    
    if (ratioVal === "50-50") { mePct = 50; partnerPct = 50; }
    else if (ratioVal === "60-40") { mePct = 60; partnerPct = 40; }
    else if (ratioVal === "40-60") { mePct = 40; partnerPct = 60; }
    else if (ratioVal === "custom") {
        mePct = parseInt(document.getElementById("splitPercentMe").value);
        if (isNaN(mePct)) mePct = 50;
        partnerPct = 100 - mePct;
    }

    const nameMe = localStorage.getItem("nameMe") || "คุณโบ๊ท";
    const namePartner = localStorage.getItem("namePartner") || "คุณเอิร์น";
    
    if (!(await showCustomConfirm(`ต้องการบันทึกค่าใช้จ่าย "${title}" ยอดเงิน ${amount.toLocaleString()} บ. (สัดส่วน โบ๊ท ${mePct}% : เอิร์น ${partnerPct}%) เข้ากองกลาง?`, 'บันทึกค่าใช้จ่ายกองกลาง', '🤝'))) return;

    let prefix = payer === "me" ? "[จ่ายโดย: me]" : "[จ่ายโดย: partner]";
    let finalNote = `${prefix} [หารค่าใช้จ่าย] ${title} (สัดส่วน โบ๊ท ${mePct}% : เอิร์น ${partnerPct}%)`;
    
    try {
        const { error } = await supabaseClient.from("transactions").insert([{
            amount: amount,
            type: "expense",
            category_name: getCategoryForBill(title),
            note: finalNote,
            owner: "shared",
            created_at: new Date().toISOString()
        }]);
        
        if (error) throw error;
        
        showToast("บันทึกค่าใช้จ่ายหารลง Supabase กองกลางสำเร็จ! 🍕", "🤝");
        playSynthSound("cash");
        
        document.getElementById("splitTitle").value = "";
        document.getElementById("splitAmount").value = "";
        calculateSplitResult();
        loadTransactions();
    } catch (err) {
        console.error("Error saving split transaction:", err);
        showToast(`เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${err.message}`, "❌", true);
    }
}

// === 📄 PDF Report Generation (ระบบแปลงและส่งพิมพ์รายงานเป็น PDF) ===

function generateMonthlyReportPDF() {
    const printContainer = document.getElementById("monthlyReportPrintLayout");
    if (!printContainer) return;
    
    const now = new Date();
    const monthsTh = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const monthTitle = `${monthsTh[now.getMonth()]} ${now.getFullYear() + 543}`;
    
    const nameMe = localStorage.getItem("nameMe") || "คุณโบ๊ท";
    const namePartner = localStorage.getItem("namePartner") || "คุณเอิร์น";
    
    const myBal = document.getElementById("myTotal")?.innerText || "0.00 บาท";
    const partnerBal = document.getElementById("partnerTotal")?.innerText || "0.00 บาท";
    const sharedBal = document.getElementById("sharedTotal")?.innerText || "0.00 บาท";
    const emergencyBal = document.getElementById("emergencyTotal")?.innerText || "0.00 บาท";
    
    let txRowsHTML = "";
    const tbody = document.getElementById("transactionTableBody");
    if (tbody) {
        const rows = tbody.querySelectorAll("tr");
        let count = 0;
        rows.forEach(r => {
            if (count >= 12) return;
            const tds = r.querySelectorAll("td");
            if (tds.length >= 6) {
                const dateText = tds[0].innerText;
                const ownerText = tds[1].innerText;
                const catText = tds[3].innerText;
                const amountText = tds[4].innerText;
                const noteText = tds[5].innerText;
                txRowsHTML += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 8px 4px; font-size: 0.8rem;">${dateText}</td>
                        <td style="padding: 8px 4px; font-size: 0.8rem;">${ownerText}</td>
                        <td style="padding: 8px 4px; font-size: 0.8rem;">${catText}</td>
                        <td style="padding: 8px 4px; font-size: 0.8rem; font-weight: bold;">${amountText}</td>
                        <td style="padding: 8px 4px; font-size: 0.8rem; color: #475569;">${noteText}</td>
                    </tr>
                `;
                count++;
            }
        });
    }
    
    if (!txRowsHTML) {
        txRowsHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">ไม่มีข้อมูลรายการเงินในรอบเดือนนี้</td></tr>`;
    }

    printContainer.innerHTML = `
        <div style="font-family: 'Sarabun', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #6366f1; padding-bottom: 15px; margin-bottom: 25px;">
                <div>
                    <h2 style="margin: 0; color: #4f46e5; font-size: 1.6rem; font-weight: 800;">👩‍❤️‍👨 รายงานการเงินคู่รักประจำเดือน</h2>
                    <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.9rem;">รอบการเงินประจำเดือน: <b>${monthTitle}</b></p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">วันที่พิมพ์เอกสาร: ${now.toLocaleDateString("th-TH")} ${now.toLocaleTimeString("th-TH")}</p>
                    <span style="display: inline-block; background: #ecfdf5; color: #047857; font-weight: bold; font-size: 0.75rem; padding: 4px 10px; border-radius: 8px; margin-top: 5px;">💰 Supabase Synced</span>
                </div>
            </div>

            <h4 style="color: #1e293b; font-weight: bold; border-left: 4px solid #6366f1; padding-left: 10px; margin-bottom: 15px;">📊 ยอดเงินคงเหลือรายกระเป๋า</h4>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 25px;">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 0.75rem; color: #64748b;">กระเป๋า ${nameMe}</p>
                    <h5 style="margin: 0; color: #1e3a8a; font-size: 0.95rem; font-weight: bold;">${myBal}</h5>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 0.75rem; color: #64748b;">กระเป๋า ${namePartner}</p>
                    <h5 style="margin: 0; color: #9f1239; font-size: 0.95rem; font-weight: bold;">${partnerBal}</h5>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 0.75rem; color: #64748b;">เงินกองกลางร่วมกัน</p>
                    <h5 style="margin: 0; color: #854d0e; font-size: 0.95rem; font-weight: bold;">${sharedBal}</h5>
                </div>
                <div style="background: #f8fafc; border: 1px solid #10b981; border-radius: 12px; padding: 12px; text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 0.75rem; color: #047857; font-weight: bold;">ออมสำรองฉุกเฉิน</p>
                    <h5 style="margin: 0; color: #065f46; font-size: 0.95rem; font-weight: bold;">${emergencyBal}</h5>
                </div>
            </div>

            <h4 style="color: #1e293b; font-weight: bold; border-left: 4px solid #6366f1; padding-left: 10px; margin-bottom: 15px;">🕒 ประวัติทำรายการการเงิน (ล่าสุด)</h4>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="border-bottom: 2px solid #cbd5e1; text-align: left; background: #f8fafc;">
                        <th style="padding: 8px 4px; font-size: 0.85rem; color: #475569;">วัน-เวลา</th>
                        <th style="padding: 8px 4px; font-size: 0.85rem; color: #475569;">บัญชี</th>
                        <th style="padding: 8px 4px; font-size: 0.85rem; color: #475569;">หมวดหมู่</th>
                        <th style="padding: 8px 4px; font-size: 0.85rem; color: #475569;">จำนวนเงิน</th>
                        <th style="padding: 8px 4px; font-size: 0.85rem; color: #475569;">บันทึกช่วยจำ</th>
                    </tr>
                </thead>
                <tbody>
                    ${txRowsHTML}
                </tbody>
            </table>

            <div style="margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center;">
                <div>
                    <div style="border-bottom: 1px solid #94a3b8; height: 40px; width: 200px; margin: 0 auto 5px auto;"></div>
                    <p style="margin: 0; font-size: 0.85rem; color: #64748b;">ลงชื่อ: <b>${nameMe}</b></p>
                </div>
                <div>
                    <div style="border-bottom: 1px solid #94a3b8; height: 40px; width: 200px; margin: 0 auto 5px auto;"></div>
                    <p style="margin: 0; font-size: 0.85rem; color: #64748b;">ลงชื่อ: <b>${namePartner}</b></p>
                </div>
            </div>
            
            <div style="margin-top: 40px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">สร้างสรรค์ขึ้นด้วยความรัก ❤️ โดยคู่รักบันทึกรายรับรายจ่าย</p>
            </div>
        </div>
    `;
    window.print();
}

// === 📷 AI Slip Reader: image compression & scanning (ระบบแสกนสลิปออโต้) ===

let pendingSlipFiles = [];

function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width; let height = img.height;

                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                ctx.canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.7);
            };
        };
    });
}

async function processSingleSlip(file, liveGeminiKey) {
    const compressedFile = await compressImage(file);
    const fileExt = compressedFile.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error: uploadError } = await supabaseClient.storage.from('slips').upload(fileName, compressedFile);
    if (uploadError) throw uploadError;

    const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(compressedFile);
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
    });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${liveGeminiKey}`;
    const promptPayload = {
        contents: [{
            parts: [
                { text: `นี่คือรูปสลิปโอนเงินของธนาคารในไทย ให้แกะข้อมูลต่อไปนี้จากสลิป:
1. "amount" — ยอดเงินสุทธิที่โอนสำเร็จ (Total/Amount) เป็นตัวเลขทศนิยม เช่น 150.00
2. "date" — วันที่ทำรายการในรูปแบบ YYYY-MM-DD (เช่น 2026-06-19) ถ้าไม่มีให้ใส่ null
3. "receiver" — ชื่อผู้รับเงินหรือชื่อร้านค้า/บัญชีปลายทาง ถ้าไม่มีให้ใส่ null
4. "bank" — ชื่อธนาคาร/ช่องทางที่โอน (เช่น กสิกร, SCB, PromptPay) ถ้าไม่มีให้ใส่ null
5. "category_suggestion" — เดาหมวดหมู่รายจ่ายที่น่าจะเป็นไปได้มากที่สุด 1 ชื่อ เช่น "อาหาร", "ค่าเช่า", "ช้อปปิ้ง", "ค่าน้ำค่าไฟ" ถ้าเดาไม่ได้ให้ใส่ null

ตอบกลับเฉพาะ JSON เท่านั้น ตัวอย่าง:
{"amount": 150.00, "date": "2026-06-19", "receiver": "นาย ก", "bank": "กสิกร", "category_suggestion": "อาหาร"}` },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
        }],
        generationConfig: { responseMimeType: "application/json" }
    };

    let resData = null;
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promptPayload) });
        resData = await response.json();
        if (response.status === 429 && attempt < MAX_RETRIES) {
            let waitSec = 30;
            const retryMatch = JSON.stringify(resData).match(/retry in ([\d.]+)s/i);
            if (retryMatch) waitSec = Math.ceil(parseFloat(retryMatch[1]));
            showToast(`⏳ API เกินโควต้า รอ ${waitSec} วินาที...`, '🔄');
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
        }
        break;
    }

    if (!resData.candidates || resData.candidates.length === 0) {
        throw new Error(resData.error?.message || "AI ปฏิเสธการแกะสลิปใบนี้");
    }

    const aiText = resData.candidates[0].content.parts[0].text.trim();
    return { ...JSON.parse(aiText), fileName };
}

async function confirmSlipScan() {
    if (pendingSlipFiles.length === 0) return;

    const previewArea = document.getElementById('slipPreviewArea');
    const statusEl = document.getElementById('slipLoadingStatus');
    const slipInput = document.getElementById('slipInput');
    const isBatch = pendingSlipFiles.length > 1;

    previewArea.classList.add('d-none');
    statusEl.classList.remove('d-none');

    try {
        const { data: secretData, error: secretError } = await supabaseClient.from('system_secrets').select('key_value').eq('key_name', 'GEMINI_API_KEY').single();
        if (secretError || !secretData) throw new Error("ระบบหา API Key ไม่เจอ กรุณาเช็คตาราง system_secrets");
        const liveGeminiKey = secretData.key_value;

        if (isBatch) {
            const totalFiles = pendingSlipFiles.length;
            let successCount = 0; let failCount = 0;
            const results = [];

            for (let i = 0; i < totalFiles; i++) {
                statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> 🤖 กำลังสแกนสลิปใบที่ ${i + 1} จาก ${totalFiles}...`;

                try {
                    const result = await processSingleSlip(pendingSlipFiles[i], liveGeminiKey);
                    let smartNote = `[SLIP_URL:${result.fileName}]`;
                    const infoParts = [];
                    if (result.receiver) infoParts.push(`ผู้รับ: ${result.receiver}`);
                    if (result.bank) infoParts.push(`ผ่าน: ${result.bank}`);
                    if (result.date) infoParts.push(`วันที่: ${result.date}`);
                    smartNote += infoParts.length > 0 ? ` ${infoParts.join(' | ')}` : ' สแกนจากสลิป (Batch)';

                    let dbOwner = document.getElementById('txOwner').value || 'me';
                    let finalNote = smartNote;
                    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = `[จ่ายโดย: me] ${finalNote}`; }
                    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = `[จ่ายโดย: partner] ${finalNote}`; }

                    await supabaseClient.from('transactions').insert([{
                        amount: parseFloat(parseFloat(result.amount).toFixed(2)),
                        type: 'expense',
                        category_name: 'สลิปรอระบุหมวดหมู่',
                        note: finalNote,
                        owner: dbOwner,
                        created_at: new Date().toISOString()
                    }]);

                    results.push({ success: true, amount: result.amount, receiver: result.receiver });
                    successCount++;
                } catch (err) {
                    console.error(`Slip ${i + 1} error:`, err);
                    results.push({ success: false, error: err.message });
                    failCount++;
                }

                if (i < totalFiles - 1) { await new Promise(r => setTimeout(r, 2000)); }
            }

            let summaryHTML = `<div class="text-center"><p class="fw-bold text-dark mb-2">📊 สรุปผลสแกน ${totalFiles} สลิป</p>`;
            summaryHTML += `<div class="d-flex justify-content-center gap-3 mb-2">`;
            summaryHTML += `<span class="badge bg-success px-3 py-2">✅ สำเร็จ ${successCount} ใบ</span>`;
            if (failCount > 0) summaryHTML += `<span class="badge bg-danger px-3 py-2">❌ ล้มเหลว ${failCount} ใบ</span>`;
            summaryHTML += `</div><div class="text-start mt-2">`;

            results.forEach((r, idx) => {
                if (r.success) {
                    summaryHTML += `<div class="small text-success mb-1">✅ ใบที่ ${idx + 1}: ${parseFloat(r.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท${r.receiver ? ` → ${r.receiver}` : ''}</div>`;
                } else {
                    summaryHTML += `<div class="small text-danger mb-1">❌ ใบที่ ${idx + 1}: ${r.error}</div>`;
                }
            });
            summaryHTML += `</div></div>`;

            previewArea.innerHTML = summaryHTML;
            previewArea.classList.remove('d-none');
            showToast(`สแกน Batch เสร็จ! สำเร็จ ${successCount}/${totalFiles} ใบ`, '🤖');
            await loadTransactions();
        } else {
            const result = await processSingleSlip(pendingSlipFiles[0], liveGeminiKey);

            document.getElementById('txAmount').value = parseFloat(result.amount).toFixed(2);
            let smartNote = `[SLIP_URL:${result.fileName}]`;
            const infoParts = [];
            if (result.receiver) infoParts.push(`ผู้รับ: ${result.receiver}`);
            if (result.bank) infoParts.push(`ผ่าน: ${result.bank}`);
            if (result.date) infoParts.push(`วันที่: ${result.date}`);
            smartNote += infoParts.length > 0 ? ` ${infoParts.join(' | ')}` : ' รอคุณระบุชื่อรายการจริง';
            document.getElementById('txNote').value = smartNote;

            let aiResultHTML = `
                <div class="mt-2 p-2 bg-success bg-opacity-10 rounded-3 border border-success border-opacity-25">
                    <p class="small fw-bold text-success mb-1">🤖 AI แกะข้อมูลสำเร็จ:</p>
                    <ul class="list-unstyled small mb-0 text-dark">
                        <li>💰 ยอดเงิน: <b>${parseFloat(result.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</b></li>`;
            if (result.receiver) aiResultHTML += `<li>👤 ผู้รับ: <b>${result.receiver}</b></li>`;
            if (result.bank) aiResultHTML += `<li>🏦 ธนาคาร: <b>${result.bank}</b></li>`;
            if (result.date) aiResultHTML += `<li>📅 วันที่: <b>${result.date}</b></li>`;
            if (result.category_suggestion) aiResultHTML += `<li>🏷️ หมวดหมู่แนะนำ: <b>${result.category_suggestion}</b></li>`;
            aiResultHTML += `</ul></div>`;

            previewArea.innerHTML = `
                <div class="text-center">
                    <span class="text-success small fw-bold">✅ สแกนเรียบร้อย กรุณาเลือกกระเป๋าเงินและหมวดหมู่เพื่อบันทึก</span>
                    ${aiResultHTML}
                </div>`;
            previewArea.classList.remove('d-none');
            showToast('AI แกะข้อมูลสลิปเรียบร้อย! กรุณากดบันทึกเลือกหมวดหมู่', '🤖');
        }
    } catch (err) {
        console.error(err);
        showToast(`ระบบสแกนสลิปขัดข้อง: ${err.message}`, '⚠️', true);
        previewArea.classList.add('d-none');
    } finally {
        statusEl.classList.add('d-none');
        statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> กำลังใช้ AI ถอดรหัสยอดเงินจากสลิปสักครู่...`;
        pendingSlipFiles = []; slipInput.value = '';
    }
}

function removeSlipFromQueue(index) {
    pendingSlipFiles.splice(index, 1);
    if (pendingSlipFiles.length === 0) { cancelSlipPreview(); }
    else { renderSlipPreviews(); }
}

function cancelSlipPreview() {
    const slipInput = document.getElementById('slipInput');
    const previewArea = document.getElementById('slipPreviewArea');
    if (slipInput) slipInput.value = '';
    pendingSlipFiles = [];
    if (previewArea) previewArea.classList.add('d-none');
}

function renderSlipPreviews() {
    const previewArea = document.getElementById('slipPreviewArea');
    const count = pendingSlipFiles.length;

    let html = `<p class="small fw-bold text-secondary mb-2 text-center">🖼️ ตรวจสอบรูปสลิป ${count} ใบก่อนส่ง AI สแกน</p>`;
    html += `<div class="d-flex flex-wrap gap-2 justify-content-center mb-3">`;

    pendingSlipFiles.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        html += `
            <div class="position-relative" style="width: 100px; height: 100px;">
                <img src="${url}" class="rounded-3 border" style="width: 100%; height: 100%; object-fit: cover;" alt="Slip ${idx + 1}">
                <button onclick="removeSlipFromQueue(${idx})" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center" style="width: 20px; height: 20px; border-radius: 50%; font-size: 0.6rem; transform: translate(30%, -30%);">✕</button>
                <span class="position-absolute bottom-0 start-50 translate-middle-x badge bg-dark bg-opacity-75 rounded-pill" style="font-size: 0.6rem;">${idx + 1}</span>
            </div>`;
    });

    html += `</div>`;
    if (count > 1) {
        html += `
            <div class="alert alert-info py-2 px-3 rounded-3 border-0 small mb-3 text-center">
                <i class="bi bi-info-circle me-1"></i> <b>โหมด Batch:</b> AI จะสแกนทีละใบและลงบันทึกให้อัตโนมัติ (รอตั้งค่าหมวดหมูภายหลัง)
            </div>`;
    }

    html += `
        <div class="d-flex justify-content-center gap-2">
            <button onclick="confirmSlipScan()" class="btn btn-success btn-sm fw-bold px-3 rounded-3">
                <i class="bi bi-robot me-1"></i> ✅ ยืนยันสแกน${count > 1 ? `ทั้ง ${count} ใบ` : ''}
            </button>
            <button onclick="cancelSlipPreview()" class="btn btn-outline-secondary btn-sm fw-bold px-3 rounded-3">
                ❌ ยกเลิก
            </button>
        </div>`;

    previewArea.innerHTML = html;
    previewArea.classList.remove('d-none');
}

function setupSlipScannerListener() {
    const slipInput = document.getElementById('slipInput');
    if (!slipInput) return;
    slipInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        pendingSlipFiles = files;
        renderSlipPreviews();
    });
}

// === 🚪 System Logouts & Filters (ระบบล็อกเอ้าท์และกรองประวัติ) ===

async function handleLogout() {
    try { await supabaseClient.auth.signOut(); }
    catch (err) { console.error("Logout Error:", err); }
    finally { window.location.href = 'login.html'; }
}

async function updateFilters() {
    filterOwner = document.getElementById('filterOwner').value;
    filterType = document.getElementById('filterType').value;
    filterDate = document.getElementById('filterDate').value;
    await Promise.all([loadGoals(), loadTransactions()]);
}

async function loadCategories() {
    const { data: categories, error } = await supabaseClient.from('categories').select('*').order('name', { ascending: true });
    if (error) return console.error(error);
    const expenseArea = document.getElementById('expenseButtons');
    const incomeArea = document.getElementById('incomeButtons');
    expenseArea.innerHTML = ''; incomeArea.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.innerText = getCategoryEmoji(cat.name);
        btn.className = cat.type === 'expense' ? "btn btn-outline-danger btn-sm category-btn" : "btn btn-outline-success btn-sm category-btn";
        btn.onclick = () => saveTransaction(cat.name, cat.type);
        if (cat.type === 'expense') expenseArea.appendChild(btn); else incomeArea.appendChild(btn);
    });

    const txCategorySelect = document.getElementById('txCategory');
    if (txCategorySelect) {
        txCategorySelect.innerHTML = '';
        const expenseGroup = document.createElement('optgroup'); expenseGroup.label = '🔴 หมวดหมู่รายจ่าย';
        const incomeGroup = document.createElement('optgroup'); incomeGroup.label = '🟢 หมวดหมู่รายรับ';
        
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.name;
            opt.innerText = getCategoryEmoji(cat.name);
            if (cat.type === 'expense') expenseGroup.appendChild(opt);
            else incomeGroup.appendChild(opt);
        });
        txCategorySelect.appendChild(expenseGroup);
        txCategorySelect.appendChild(incomeGroup);
    }
}

function updateInsightsAndProgress() {
    calculateEmergencyProgress();
    calculateAIInsights(loadedTxsCache, currentTotalMePaidShared, currentTotalPartnerPaidShared, loadedGoalsCache);
    updateBearMascotLevel(loadedTxsCache, loadedGoalsCache);
}

// === ⏳ App Initialization (สตาร์ทการตั้งค่าเริ่มต้นของระบบ) ===

window.onload = function () {
    setTimeout(async () => {
        try {
            setupSlipScannerListener();
            
            const activeTab = localStorage.getItem('activeTab') || 'dashboard';
            switchTab(activeTab);

            const savedTheme = localStorage.getItem('theme') || 'light';
            updateDarkModeToggleIcon(savedTheme);

            initAutoSaveSettings();
            initEmergencyTargetTitle();
            initDynamicNames();
            initRecurringBills();
            renderQuestState();

            await Promise.all([loadCategories(), updateFilters()]);
        } catch (err) {
            console.error("Initialization Error:", err);
            showToast("เกิดข้อผิดพลาดในการโหลดข้อมูลเริ่มต้น กรุณารีเฟรชหน้าเว็บ", "⚠️", true);
        }
    }, 400);
}
