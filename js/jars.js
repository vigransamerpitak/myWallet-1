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
        if (!g || !g.title) return false;
        let isSave = false;
        let goalType = g.type;
        const typeMatch = g.title.match(/^\[(save[a-zA-Z0-9_]*)\]\s*/);
        if (typeMatch || goalType === 'save') {
            isSave = true;
        }
        return isSave;
    });

    let earmarkedAmount = 0;
    const jarItems = [];

    // 4. คำนวณเงินสะสมของกระปุกย่อยแต่ละโหล
    saveGoals.forEach(goal => {
        if (!goal || !goal.title) return;
        let goalType = goal.type;
        let goalTitle = goal.title;
        const typeMatch = goalTitle.match(/^\[(save[a-zA-Z0-9_]*)\]\s*/);
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

    const hideMainEmergencyJar = localStorage.getItem('hideMainEmergencyJar') === 'true';
    let jarsHtml = '';

    // สร้างโครง HTML โหลเงินฝากทั่วไป (โหลหลัก)
    if (!hideMainEmergencyJar) {
        jarsHtml = `
            <div class="savings-jar-item p-3 mb-3 bg-light rounded-4 border" style="background-color: var(--light-bg) !important; border-color: var(--card-border) !important; color: var(--color-text);">
                <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap" style="gap: 8px;">
                    <div class="d-flex align-items-center gap-1">
                        <span class="fs-5">🚨</span>
                        <input type="text" id="emergencyTargetTitleInput"
                            onchange="updateEmergencyTargetTitle(this.value)"
                            class="form-control form-control-sm fw-bold border-0 bg-transparent p-0"
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
                            class="form-control form-control-xs py-0.5 px-2 fw-bold border-secondary"
                            style="width: 75px; font-size: 0.7rem; border-radius: 8px !important; display: inline-block; color: var(--text-dark) !important;"
                            value="${mainTargetVal}">
                        <span class="small text-muted" style="font-size: 0.7rem;">บ.</span>
                        <button onclick="confirmHideMainEmergencyJar()" class="btn btn-link text-muted p-0 px-1 ms-1 text-xs cursor-pointer" style="text-decoration:none;" title="ซ่อนโหลเงินออมฉุกเฉินหลัก">🗑️</button>
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
                        <div class="mt-2 text-xs d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div class="text-muted" style="font-size: 0.75rem;">
                                <span>สะสมแล้ว: <b class="text-success" id="emergencyProgressCurrentText">${generalBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.</b></span>
                                <span class="d-block text-secondary mt-0.5" id="emergencyProgressRemainingText" style="font-size: 0.68rem;">${generalRemaining <= 0 ? '🎉 สำเร็จ!' : `ยังขาดอีก: ${generalRemaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.`}</span>
                            </div>
                            ${generalRemaining > 0 ? `
                                <button onclick="depositToEmergencyPrompt()" class="btn btn-xs btn-outline-success rounded-pill fw-bold" style="font-size: 0.68rem; padding: 2px 10px;">
                                    💰 ฝากออมเพิ่ม
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 6. วาดโหลเป้าหมายเงินออมย่อยอื่นๆ
    jarItems.forEach(item => {
        const safeTitle = escapeForAttr(item.title || '');
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
                <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap" style="gap: 8px;">
                    <div class="d-flex align-items-center gap-1">
                        <span class="fs-5">${getGoalIcon(item.type)}</span>
                        <input type="text" id="subJarTitleInput-${item.id}"
                            onchange="triggerUpdateSubJar(${item.id}, '${item.type}')"
                            class="form-control form-control-sm fw-bold border-0 bg-transparent p-0"
                            style="font-size: 0.85rem; width: auto; max-width: 140px; box-shadow: none !important; color: var(--text-dark) !important;"
                            value="${item.title}" placeholder="พิมพ์ชื่อเป้าหมาย...">
                        <i class="bi bi-pencil-fill text-muted cursor-pointer" style="font-size: 0.65rem;"
                            onclick="document.getElementById('subJarTitleInput-${item.id}').focus()"
                            title="คลิกเพื่อแก้ไขชื่อกระปุก"></i>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        <span class="small text-muted" style="font-size: 0.7rem;">เป้าหมาย:</span>
                        <input type="number" id="subJarAmountInput-${item.id}"
                            onchange="triggerUpdateSubJar(${item.id}, '${item.type}')"
                            class="form-control form-control-xs py-0.5 px-2 fw-bold border-secondary"
                            style="width: 75px; font-size: 0.7rem; border-radius: 8px !important; display: inline-block; color: var(--text-dark) !important;"
                            value="${item.target}">
                        <span class="small text-muted" style="font-size: 0.7rem;">บ.</span>
                    </div>
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
                        <div class="mt-2 text-xs d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div class="text-muted" style="font-size: 0.75rem;">
                                <span>สะสมแล้ว: <b class="text-success">${item.accumulated.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.</b></span>
                                <span class="d-block text-secondary mt-0.5" style="font-size: 0.68rem;">${item.remaining <= 0 ? '🎉 สำเร็จ!' : `ยังขาดอีก: ${item.remaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ.`}</span>
                            </div>
                            ${item.remaining > 0 ? `
                                <button onclick="depositToJarPrompt(${item.id}, '${safeTitle}')" class="btn btn-xs btn-outline-success rounded-pill fw-bold" style="font-size: 0.68rem; padding: 2px 10px;">
                                    💰 ฝากออมเพิ่ม
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    if (hideMainEmergencyJar) {
        jarsHtml += `
            <div class="text-center py-1 mt-2" style="opacity: 0.5;">
                <button onclick="restoreMainEmergencyJar()" class="btn btn-link btn-xs text-secondary text-decoration-none" style="font-size: 0.65rem;"><i class="bi bi-eye-fill"></i> แสดงโหลหลักสำรองฉุกเฉิน</button>
            </div>
        `;
    }

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

/**
 * 💾 ฟังก์ชันบันทึกการแก้ไขชื่อเป้าหมายและจำนวนเงินเป้าหมายของกระปุกย่อยลง Supabase
 */
async function triggerUpdateSubJar(id, type) {
    const titleInput = document.getElementById(`subJarTitleInput-${id}`);
    const amountInput = document.getElementById(`subJarAmountInput-${id}`);
    if (!titleInput || !amountInput) return;

    const newTitle = titleInput.value.trim();
    const newAmount = parseFloat(amountInput.value);

    if (!newTitle) {
        showToast('กรุณากรอกชื่อกระปุกด้วยครับ', '⚠️', true);
        return;
    }
    if (isNaN(newAmount) || newAmount <= 0) {
        showToast('กรุณากรอกเป้าหมายจำนวนเงินให้ถูกต้อง', '🔢', true);
        return;
    }

    // ลบ prefix ที่ติดมากับชื่อ (เช่น [save] หรือ [save_travel]) ก่อนเพื่อป้องกันการซ้ำซ้อน
    let cleanTitle = newTitle.replace(/^(\[[a-zA-Z0-9_]+\]\s*)+/, '').trim();

    let dbTitle = cleanTitle;
    // ตรวจสอบประเภทและใส่ Prefix กลับไปเฉพาะตัวที่ไม่ใช่ 'save' หรือ 'bill' เพื่อความคงเส้นคงวาของระบบหลัก
    if (type && type !== 'save' && type !== 'bill') {
        dbTitle = `[${type}] ${cleanTitle}`;
    }

    try {
        const { error } = await supabaseClient
            .from('goals')
            .update({ title: dbTitle, amount: newAmount })
            .eq('id', id);

        if (error) {
            showToast('อัปเดตกระปุกไม่สำเร็จ: ' + error.message, '❌', true);
        } else {
            showToast('อัปเดตเป้าหมายกระปุกเงินเรียบร้อยแล้วจ้า! 🎯', '✅');
            // โหลดข้อมูลเควสและการเงินใหม่ทั้งหมด
            if (typeof loadGoals === 'function') await loadGoals();
            if (typeof loadTransactions === 'function') await loadTransactions();
        }
    } catch (err) {
        console.error("Error updating sub jar:", err);
    }
}

/**
 * 🚨 ฟังก์ชันซ่อนโหลเงินออมฉุกเฉินหลัก
 */
async function confirmHideMainEmergencyJar() {
    const confirm = await showCustomConfirm(
        'คุณต้องการลบ/ซ่อนโหลเงินออมฉุกเฉินหลักนี้ใช่หรือไม่?\n(ระบบจะซ่อนโหลนี้จากรายการ และคุณสามารถเพิ่มมันเป็นภารกิจการออมใน Checklist ด้านขวาได้ครับ)',
        'ลบโหลเงินออมฉุกเฉินหลัก',
        '🗑️'
    );
    if (confirm) {
        localStorage.setItem('hideMainEmergencyJar', 'true');
        
        const addAsMission = await showCustomConfirm(
            'ต้องการให้ระบบเพิ่ม "เงินออมสำรองฉุกเฉิน" เป็นภารกิจการออมใน Checklist ด้านขวาให้โดยอัตโนมัติเลยไหมครับ?',
            'เพิ่มเป็นภารกิจการเงิน',
            '🎯'
        );
        
        if (addAsMission) {
            const mainTargetVal = parseFloat(localStorage.getItem('emergencyTarget')) || 50000;
            const mainTargetTitle = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
            
            const currentFilterDate = window.filterDate || 'this-month';
            const now = new Date();
            let targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            if (currentFilterDate === 'last-month') {
                let prevMonth = now.getMonth() - 1;
                let prevYear = now.getFullYear();
                if (prevMonth < 0) {
                    prevMonth = 11;
                    prevYear--;
                }
                targetMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
            }
            
            const { error } = await supabaseClient.from('goals').insert([{
                title: mainTargetTitle,
                amount: mainTargetVal,
                type: 'save',
                goal_month: targetMonthStr,
                is_completed: false,
                is_failed: false
            }]);
            
            if (error) {
                showToast(`เพิ่มภารกิจล้มเหลว: ${error.message}`, '❌', true);
            } else {
                localStorage.setItem(`defaultGoalsCreated_${targetMonthStr}`, 'true');
                showToast('ย้ายโหลหลักไปเป็นภารกิจใน Checklist สำเร็จแล้ว!', '🎉');
                if (typeof loadGoals === 'function') await loadGoals();
            }
        } else {
            showToast('ซ่อนโหลเงินออมฉุกเฉินหลักเรียบร้อยแล้วครับ!', '🗑️');
        }
        
        calculateEmergencyProgress();
    }
}

/**
 * 🚨 ฟังก์ชันกู้คืนโหลเงินออมฉุกเฉินหลัก
 */
function restoreMainEmergencyJar() {
    localStorage.removeItem('hideMainEmergencyJar');
    calculateEmergencyProgress();
    showToast('แสดงโหลเงินออมฉุกเฉินหลักอีกครั้งแล้วจ้า! 🎯', '🎯');
}

/**
 * 💰 ฟังก์ชันฝากเงินสะสมเข้ากระปุกออมเงินย่อยโดยตรง
 */
async function depositToJarPrompt(goalId, title) {
    const amountStr = await showCustomPrompt(`กรุณากรอกจำนวนเงินที่ต้องการฝากสะสมเข้ากระปุก "${title}" (บาท):`, 'ฝากเงินสะสม', '', '0.00', '💰');
    if (amountStr === null || amountStr === '') return; // กดยกเลิก หรือไม่ได้กรอก
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        showToast('กรุณากรอกจำนวนเงินให้ถูกต้องครับ', '⚠️', true);
        return;
    }
    
    const finalAmount = parseFloat(amount.toFixed(2));
    const userRole = window.currentUserRole || 'me';
    
    // 1. บันทึกกระเป๋าส่วนตัว (รายจ่าย: ลงทุน)
    const expenseTx = {
        amount: finalAmount,
        type: 'expense',
        category_name: 'ลงทุน',
        owner: userRole,
        note: `[หักเงินออมภารกิจ] ${title}`,
        created_at: new Date().toISOString()
    };
    
    // 2. ฝากเข้ากระเป๋าออมฉุกเฉิน (รายรับ: ลงทุน)
    const incomeTx = {
        amount: finalAmount,
        type: 'income',
        category_name: 'ลงทุน',
        owner: 'emergency',
        note: `[ออมเพื่อ: ${title}]`,
        created_at: new Date().toISOString()
    };
    
    try {
        const { error: err1 } = await supabaseClient.from('transactions').insert([expenseTx]);
        if (err1) throw err1;
        
        const { error: err2 } = await supabaseClient.from('transactions').insert([incomeTx]);
        if (err2) throw err2;
        
        showToast(`ฝากเงินสะสมเข้ากระปุก "${title}" สำเร็จแล้ว +${finalAmount.toLocaleString('th-TH')} บ.! 💖`, '🎉');
        triggerCelebration();
        
        if (typeof loadGoals === 'function') await loadGoals();
        if (typeof loadTransactions === 'function') await loadTransactions();
    } catch (err) {
        console.error("Error depositing to jar:", err);
        showToast(`บันทึกการฝากเงินล้มเหลว: ${err.message}`, '❌', true);
    }
}

/**
 * 🚨 ฟังก์ชันฝากเงินสะสมเข้าคลังเงินออมฉุกเฉินหลักโดยตรง
 */
async function depositToEmergencyPrompt() {
    const mainTargetTitle = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
    const amountStr = await showCustomPrompt(`กรุณากรอกจำนวนเงินที่ต้องการฝากเข้า "${mainTargetTitle}" (บาท):`, 'ฝากเงินสำรองฉุกเฉิน', '', '0.00', '🚨');
    if (amountStr === null || amountStr === '') return; // กดยกเลิก หรือไม่ได้กรอก
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        showToast('กรุณากรอกจำนวนเงินให้ถูกต้องครับ', '⚠️', true);
        return;
    }
    
    const finalAmount = parseFloat(amount.toFixed(2));
    const userRole = window.currentUserRole || 'me';
    
    // 1. บันทึกกระเป๋าส่วนตัว (รายจ่าย: ลงทุน)
    const expenseTx = {
        amount: finalAmount,
        type: 'expense',
        category_name: 'ลงทุน',
        owner: userRole,
        note: `[โอนเข้าออมฉุกเฉิน] ฝากออมฉุกเฉิน`,
        created_at: new Date().toISOString()
    };
    
    // 2. ฝากเข้ากระเป๋าออมฉุกเฉิน (รายรับ: ลงทุน)
    const incomeTx = {
        amount: finalAmount,
        type: 'income',
        category_name: 'ลงทุน',
        owner: 'emergency',
        note: `[โอนเข้าออมฉุกเฉิน] ฝากออมฉุกเฉิน`,
        created_at: new Date().toISOString()
    };
    
    try {
        const { error: err1 } = await supabaseClient.from('transactions').insert([expenseTx]);
        if (err1) throw err1;
        
        const { error: err2 } = await supabaseClient.from('transactions').insert([incomeTx]);
        if (err2) throw err2;
        
        showToast(`ฝากเงินสะสมเข้า "${mainTargetTitle}" สำเร็จแล้ว +${finalAmount.toLocaleString('th-TH')} บ.! 💖`, '🎉');
        triggerCelebration();
        
        if (typeof loadGoals === 'function') await loadGoals();
        if (typeof loadTransactions === 'function') await loadTransactions();
    } catch (err) {
        console.error("Error depositing to emergency:", err);
        showToast(`บันทึกการฝากเงินล้มเหลว: ${err.message}`, '❌', true);
    }
}

