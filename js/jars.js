// js/jars.js - โมดูลดูแลระบบโหลแก้วเก็บเงินสะสม คลังเป้าหมาย และการเรนเดอร์กราฟิกของเหลว (Virtual Jars)

/**
 * 💰 ส่งคืนสัญลักษณ์อีโมจิประจำเป้าหมายแต่ละแบบ
 * @param {string} type - ประเภทกระปุกออมเงิน (เช่น "save_travel", "save_shopping")
 * @returns {string} สัญลักษณ์อีโมจิประจำหมวด
 */
function getGoalIcon(type) {
    if (type === 'save') return '🎯';
    if (type === 'save_travel') return '✈️';
    if (type === 'save_shopping') return '🛍️';
    if (type === 'save_gift') return '🎁';
    if (type === 'save_investment') return '📈';
    if (type === 'save_home') return '🏠';
    if (type === 'save_car') return '🚗';
    if (type === 'save_education') return '🎓';
    if (type === 'save_health') return '🏥';
    if (type && type.startsWith('save_')) return '💰';
    return '📄';
}

/**
 * 🚨 คำนวณความคืบหน้าการออมทั้งหมดในกระเป๋าฉุกเฉินและโหลออมเงินย่อย เพื่อวาด HTML โหลแก้วขยับได้ (Dream Jars)
 */
function calculateEmergencyProgress() {
    const container = document.getElementById('savingsJarsContainer');
    if (!container) return;
    
    // 1. ยอดรวมเงินออมในคลังฉุกเฉินหลักจากฐานข้อมูล
    const totalEl = document.getElementById('emergencyTotal');
    const totalEmergencyBalance = totalEl ? (parseFloat(totalEl.innerText.replace(/[^0-9.-]+/g,"")) || 0) : 0;
    
    // 2. ดึงเป้าหมายเงินออมฉุกเฉิน
    const mainTargetVal = parseFloat(localStorage.getItem('emergencyTarget')) || 50000;
    const mainTargetTitle = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
    
    // ซิงก์ข้อมูลช่อง Input ถ้ามี
    const targetInput = document.getElementById('emergencyTargetInput');
    if (targetInput) targetInput.value = mainTargetVal;
    const titleInput = document.getElementById('emergencyTargetTitleInput');
    if (titleInput) titleInput.value = mainTargetTitle;

    // 3. กรองเฉพาะเป้าหมายย่อยที่เป็นประเภท save_* (เควสออมเงิน)
    const saveGoals = (loadedGoalsCache || []).filter(g => {
        let isSave = false;
        let goalType = g.type;
        const typeMatch = g.title.match(/^\[(save_[a-zA-Z0-9_]+)\]\s*/);
        if (typeMatch || goalType === 'save') {
            isSave = true;
        }
        return isSave;
    });

    let earmarkedAmount = 0;
    const jarItems = [];

    // 4. คำนวณเงินสะสมของกระปุกย่อยแต่ละโหล
    saveGoals.forEach(goal => {
        let goalType = goal.type;
        let goalTitle = goal.title;
        const typeMatch = goalTitle.match(/^\[(save_[a-zA-Z0-9_]+)\]\s*/);
        if (typeMatch) {
            goalType = typeMatch[1];
            goalTitle = goalTitle.replace(typeMatch[0], '');
        }

        // ค้นหาธุรกรรมที่ฝากเข้าโหลย่อยนี้จากยอดเงินคลังออม
        let accumulated = 0;
        if (loadedTxsCache) {
            loadedTxsCache.forEach(tx => {
                if (tx.owner === 'emergency') {
                    const amt = parseFloat(tx.amount);
                    const isMatch = tx.note && (tx.note.includes(`ภารกิจสำเร็จ: ${goalTitle}`) || tx.note.includes(`[ออมเพื่อ: ${goalTitle}]`));
                    if (isMatch) {
                        accumulated += (tx.type === 'income' ? amt : -amt);
                    }
                }
            });
        }

        earmarkedAmount += accumulated;
        const target = parseFloat(goal.amount) || 0;
        const pct = target > 0 ? Math.min(100, Math.max(0, (accumulated / target) * 100)).toFixed(1) : '0.0';
        const remaining = Math.max(0, target - accumulated);

        jarItems.push({
            id: goal.id,
            title: goalTitle,
            type: goalType,
            accumulated: accumulated,
            target: target,
            pct: pct,
            remaining: remaining
        });
    });

    // 5. ยอดเงินส่วนที่เหลือจะถูกนับเป็น "เงินออมทั่วไป" ของกระเป๋าฉุกเฉิน
    const generalBalance = totalEmergencyBalance - earmarkedAmount;
    const generalPct = mainTargetVal > 0 ? Math.min(100, Math.max(0, (generalBalance / mainTargetVal) * 100)).toFixed(1) : '0.0';
    const generalRemaining = Math.max(0, mainTargetVal - generalBalance);

    // สร้างโครง HTML โหลเงินฝากทั่วไป (โหลหลัก)
    let jarsHtml = `
        <div class="savings-jar-item p-3 mb-3 bg-light rounded-4 border" style="background-color: var(--light-bg) !important; border-color: var(--card-border) !important; color: var(--color-text);">
            <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap" style="gap: 8px;">
                <div class="d-flex align-items-center gap-1">
                    <span class="fs-5">🚨</span>
                    <input type="text" id="emergencyTargetTitleInput"
                        onchange="updateEmergencyTargetTitle(this.value)"
                        class="form-control form-control-sm fw-bold text-dark border-0 bg-transparent p-0"
                        style="font-size: 0.85rem; width: auto; max-width: 140px; box-shadow: none !important; color: var(--text-dark) !important;"
                        value="${mainTargetTitle}" placeholder="พิมพ์ชื่อเป้าหมาย...">
                    <i class="bi bi-pencil-fill text-muted cursor-pointer" style="font-size: 0.65rem;"
                        onclick="document.getElementById('emergencyTargetTitleInput').focus()"
                        title="คลิกเพื่อแก้ไขชื่อเป้าหมาย"></i>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <span class="small text-muted" style="font-size: 0.7rem;">เป้าหมาย:</span>
                    <input type="number" id="emergencyTargetInput"
                        onchange="updateEmergencyTarget(this.value)"
                        class="form-control form-control-xs py-0.5 px-2 fw-bold text-dark border-secondary"
                        style="width: 75px; font-size: 0.7rem; border-radius: 8px !important; display: inline-block; color: var(--text-dark) !important;"
                        value="${mainTargetVal}">
                    <span class="small text-muted" style="font-size: 0.7rem;">บ.</span>
                </div>
            </div>
            <div class="row align-items-center g-2">
                <div class="col-3 text-center">
                    <div class="dream-jar-container" style="transform: scale(0.8); margin: 0 auto; width: 60px; height: 85px;">
                        <div class="dream-jar-lid" style="width: 42px; height: 8px;"></div>
                        <div class="dream-jar-neck" style="width: 45px; height: 6px; top: 7px;"></div>
                        <div class="dream-jar" style="border-radius: 10px 10px 24px 24px;">
                            <div id="dreamJarLiquid" class="dream-jar-liquid" style="height: ${generalPct}%;"></div>
                            <div class="sparkle-particle" style="left:15px; animation-delay: 0.2s; width:4px; height:4px;"></div>
                            <div class="sparkle-particle" style="left:30px; animation-delay: 0.8s; width:5px; height:5px;"></div>
                            <div class="sparkle-particle" style="left:45px; animation-delay: 1.4s; width:4px; height:4px;"></div>
                        </div>
                    </div>
                </div>
                <div class="col-9">
                    <div class="progress" style="height: 12px; border-radius: 6px;">
                        <div id="emergencyProgressBar"
                            class="progress-bar progress-bar-striped progress-bar-animated bg-success"
                            role="progressbar"
                            style="width: ${generalPct}%; border-radius: 6px; font-size: 0.65rem; font-weight: bold; line-height: 12px;">
                            ${generalPct}%</div>
                    </div>
                    <div class="mt-2 text-xs">
                        <div class="d-flex justify-content-between text-muted" style="font-size: 0.75rem;">
                            <span>สะสมแล้ว: <b class="text-success" id="emergencyProgressCurrentText">${generalBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.</b></span>
                            <span id="emergencyProgressRemainingText">${generalRemaining <= 0 ? '🎉 สำเร็จ!' : `ยังขาดอีก: ${generalRemaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.`}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 6. วาดโหลเป้าหมายเงินออมย่อยอื่นๆ
    jarItems.forEach(item => {
        let typeClass = item.type;
        let progressBarColorClass = 'bg-success';
        if (item.type === 'save_travel') progressBarColorClass = 'bg-info';
        else if (item.type === 'save_shopping') progressBarColorClass = 'bg-danger';
        else if (item.type === 'save_gift') progressBarColorClass = 'bg-success';
        else if (item.type === 'save_investment') progressBarColorClass = 'bg-indigo';
        else if (item.type === 'save_home') progressBarColorClass = 'bg-warning';
        else if (item.type === 'save_car') progressBarColorClass = 'bg-warning';
        else if (item.type === 'save_education') progressBarColorClass = 'bg-primary';
        else if (item.type === 'save_health') progressBarColorClass = 'bg-success';

        jarsHtml += `
            <div class="savings-jar-item p-3 mb-3 bg-light rounded-4 border" style="background-color: var(--light-bg) !important; border-color: var(--card-border) !important; color: var(--color-text);">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="fw-bold text-dark d-flex align-items-center gap-1.5" style="font-size: 0.85rem; color: var(--text-dark) !important;">
                        ${getGoalIcon(item.type)} ${item.title}
                    </span>
                    <span class="small text-muted fw-bold" style="font-size: 0.7rem;">เป้าหมาย: ${item.target.toLocaleString('th-TH')} บ.</span>
                </div>
                <div class="row align-items-center g-2">
                    <div class="col-3 text-center">
                        <div class="dream-jar-container" style="transform: scale(0.8); margin: 0 auto; width: 60px; height: 85px;">
                            <div class="dream-jar-lid" style="width: 42px; height: 8px;"></div>
                            <div class="dream-jar-neck" style="width: 45px; height: 6px; top: 7px;"></div>
                            <div class="dream-jar" style="border-radius: 10px 10px 24px 24px;">
                                <div class="dream-jar-liquid ${typeClass}" style="height: ${item.pct}%;"></div>
                                <div class="sparkle-particle" style="left:15px; animation-delay: 0.2s; width:4px; height:4px;"></div>
                                <div class="sparkle-particle" style="left:30px; animation-delay: 0.8s; width:5px; height:5px;"></div>
                                <div class="sparkle-particle" style="left:45px; animation-delay: 1.4s; width:4px; height:4px;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="col-9">
                        <div class="progress" style="height: 12px; border-radius: 6px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated ${progressBarColorClass}"
                                role="progressbar"
                                style="width: ${item.pct}%; border-radius: 6px; font-size: 0.65rem; font-weight: bold; line-height: 12px;">
                                ${item.pct}%</div>
                        </div>
                        <div class="mt-2 text-xs">
                            <div class="d-flex justify-content-between text-muted" style="font-size: 0.75rem;">
                                <span>สะสมแล้ว: <b class="text-success">${item.accumulated.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.</b></span>
                                <span>${item.remaining <= 0 ? '🎉 สำเร็จ!' : `ยังขาดอีก: ${item.remaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.`}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = jarsHtml;
}

/**
 * 👥 ฟังก์ชันสำหรับเรนเดอร์ Skeleton Jars ขณะรอข้อมูลแบบ Facebook Shimmering Effect
 */
function renderJarsLoadingSkeleton() {
    const container = document.getElementById('savingsJarsContainer');
    if (!container) return;
    
    let skeletonHtml = '';
    // เจนโหลโหลดสมมติขึ้นมา 2 โหล
    for(let i=0; i<2; i++) {
        skeletonHtml += `
            <div class="savings-jar-item p-3 mb-3 bg-light rounded-4 border" style="background-color: var(--light-bg) !important; border-color: var(--card-border) !important;">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="fb-skeleton-line" style="width: 120px; height: 16px;"></div>
                    <div class="fb-skeleton-line" style="width: 80px; height: 16px;"></div>
                </div>
                <div class="row align-items-center g-2">
                    <div class="col-3 text-center">
                        <div class="dream-jar-container" style="transform: scale(0.8); margin: 0 auto; width: 60px; height: 85px; opacity: 0.35;">
                            <div class="dream-jar-lid" style="width: 42px; height: 8px;"></div>
                            <div class="dream-jar-neck" style="width: 45px; height: 6px; top: 7px;"></div>
                            <div class="dream-jar" style="border-radius: 10px 10px 24px 24px;"></div>
                        </div>
                    </div>
                    <div class="col-9">
                        <div class="fb-skeleton-line" style="width: 100%; height: 12px; border-radius: 6px;"></div>
                        <div class="d-flex justify-content-between mt-2">
                            <div class="fb-skeleton-line" style="width: 80px; height: 12px;"></div>
                            <div class="fb-skeleton-line" style="width: 60px; height: 12px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    container.innerHTML = skeletonHtml;
}
