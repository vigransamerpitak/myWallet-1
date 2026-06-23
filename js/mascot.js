// js/mascot.js - โมดูลคำนวณเลเวล Mascot พี่หมีสะสม EXP และประมวลผลคำเตือน/คำแนะนำทางสุขภาพเงิน (Mascot & AI Insights)

/**
 * 🐻 วิเคราะห์ข้อมูลการเงินเพื่อเขียนคำแนะนำช่วยประหยัดเงินและความคืบหน้าของคู่รักจากพี่หมี AI
 * @param {Array} txs - ประวัติการทำรายการดิบ
 * @param {number} totalMePaidShared - ยอดเงินกองกลางที่เราออกล่วงหน้า
 * @param {number} totalPartnerPaidShared - ยอดเงินกองกลางที่แฟนออกล่วงหน้า
 * @param {Array} goals - รายการเควสเป้าหมายประจำเดือน
 */
function calculateAIInsights(txs, totalMePaidShared, totalPartnerPaidShared, goals) {
    const contentEl = document.getElementById('aiInsightContent');
    const bearEl = document.getElementById('bearMascot');
    const bearBadgeEl = document.getElementById('bearBadge');
    if (!contentEl) return;

    const now = new Date();
    let targetMonth = now.getMonth();
    let targetYear = now.getFullYear();
    let label = "เดือนนี้";

    if (filterDate === 'last-month') {
        targetMonth = now.getMonth() - 1;
        if (targetMonth < 0) {
            targetMonth = 11;
            targetYear = now.getFullYear() - 1;
        }
        label = "เดือนที่แล้ว";
    } else if (filterDate === 'all') {
        label = "ทั้งหมด";
    }

    // กรองเฉพาะเดือนเป้าหมายที่เป็นรายจ่าย
    const currentMonthExpenses = txs.filter(tx => {
        if (filterDate === 'all') return tx.type === 'expense';
        const d = new Date(tx.created_at);
        return d.getMonth() === targetMonth && d.getFullYear() === targetYear && tx.type === 'expense';
    });

    // 1. หาหมวดหมู่รายจ่ายที่ควักจ่ายเยอะที่สุด
    const catSum = {};
    let totalExp = 0;
    currentMonthExpenses.forEach(tx => {
        const amt = parseFloat(tx.amount);
        catSum[tx.category_name] = (catSum[tx.category_name] || 0) + amt;
        totalExp += amt;
    });

    let highestCatName = "";
    let highestCatAmt = 0;
    for (let c in catSum) {
        if (catSum[c] > highestCatAmt) {
            highestCatAmt = catSum[c];
            highestCatName = c;
        }
    }

    const insights = [];
    let bearState = "🐻"; // สภาพหน้าพี่หมี
    let bearBadge = "พี่หมี AI";

    // สถิติที่ 1: วิเคราะห์รายจ่ายท็อปฮิต
    let isWarningCategory = false;
    if (highestCatName && totalExp > 0) {
        const pct = ((highestCatAmt / totalExp) * 100).toFixed(0);
        const emoji = getCategoryEmoji(highestCatName);
        if (pct >= 30) {
            isWarningCategory = true;
            insights.push(`💡 ว๊าย! ${label}พวกเราช็อป/ใช้จ่ายกับหมวด <b>${emoji}</b> เยอะเป็นพิเศษถึง <b>${pct}%</b> ของกระเป๋ารวมเลยนะ (${highestCatAmt.toLocaleString('th-TH')} บ.) เพลาๆ กันหน่อยน้า 🐻💦`);
        } else {
            insights.push(`💡 ${label}เราใช้จ่ายกับหมวด <b>${emoji}</b> เยอะที่สุดนะ คิดเป็น <b>${pct}%</b> ของรายจ่ายรวม`);
        }
    } else {
        insights.push(`💡 บันทึกรายจ่ายเพิ่มเติมใน${label}เพื่อให้พี่หมีวิเคราะห์สถิตินะครับ`);
    }

    // สถิติที่ 2: วิเคราะห์หารบิลกองกลางส่วนเกินแชร์
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    if (totalMePaidShared > 0 || totalPartnerPaidShared > 0) {
        if (totalMePaidShared > totalPartnerPaidShared) {
            const diff = totalMePaidShared - (totalMePaidShared + totalPartnerPaidShared)/2;
            insights.push(`🤝 สำหรับ${label} ${nameMe}ช่วยจ่ายเงินกองกลางล่วงหน้าไปมากกว่า${namePartner} <b>${diff.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.</b> อย่าลืมโอนคืนกันน้า`);
        } else if (totalPartnerPaidShared > totalMePaidShared) {
            const diff = totalPartnerPaidShared - (totalMePaidShared + totalPartnerPaidShared)/2;
            insights.push(`🤝 สำหรับ${label} ${namePartner}ช่วยจ่ายเงินกองกลางล่วงหน้าไปมากกว่า${nameMe} <b>${diff.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.</b> อย่าลืมโอนคืนกันน้า`);
        } else {
            insights.push(`🤝 ยอดหารบิลกองกลางส่วนกลางแชร์กันลงตัวเท่ากันเป๊ะพอดีเลย น่ารักที่สุด!`);
        }
    }

    // สถิติที่ 3: ความสำเร็จของเควสคู่รัก
    let allGoalsDone = false;
    if (goals && goals.length > 0) {
        const completedCount = goals.filter(g => g.is_completed).length;
        if (completedCount === goals.length) {
            allGoalsDone = true;
            insights.push(`🎯 สุดยอดไปเลย! พวกเราทำภารกิจการเงินสำเร็จครบทั้งหมด <b>${completedCount} ภารกิจ</b> ใน${label}แล้วจ้า! 🎉`);
        } else if (completedCount > 0) {
            insights.push(`🎯 ดีใจด้วยจ้า! พวกเราช่วยกันฝากและเคลียร์ภารกิจสำเร็จไปแล้ว <b>${completedCount}/${goals.length} ภารกิจ</b> สู้ต่ออีกนิดนะ!`);
        } else {
            insights.push(`🎯 ตอนนี้มีภารกิจเงินรออยู่ <b>${goals.length} เควส</b> ชวนกันมาพิชิตเป้าหมายกันเถอะ!`);
        }
    }

    // 4. วัดสถานภาพเงินกองกลางเพื่อปรับอารมณ์พี่หมี Mascot
    let totalSharedExpenseThisMonth = 0;
    txs.forEach(tx => {
        const d = new Date(tx.created_at);
        const isMatch = filterDate === 'all' || (d.getMonth() === targetMonth && d.getFullYear() === targetYear);
        if (isMatch && tx.owner === 'shared' && tx.type === 'expense') {
            totalSharedExpenseThisMonth += parseFloat(tx.amount);
        }
    });

    if (totalSharedExpenseThisMonth > 10000) {
        bearState = "🐻💔";
        bearBadge = "หมีใจสลาย";
        insights.push(`🚨 <b>เตือนภัยกระเป๋าตังค์:</b> ค่าใช้จ่ายกองกลางใน${label}รวม <b>${totalSharedExpenseThisMonth.toLocaleString('th-TH')} บ.</b> เกินงบ 10,000 บ. ไปแล้วนะ! ประหยัดขึ้นด่วนจ้า!`);
    } else if (isWarningCategory) {
        bearState = "🐻⚠️";
        bearBadge = "หมีเตือนภัย";
    } else if (allGoalsDone || (txs.length > 0 && totalSharedExpenseThisMonth < 5000)) {
        bearState = "🐻🎉";
        bearBadge = "หมีอารมณ์ดี";
    } else {
        bearState = "🐻";
        bearBadge = "พี่หมี AI";
    }

    if (bearEl) bearEl.innerText = bearState;
    if (bearBadgeEl) bearBadgeEl.innerText = bearBadge;

    contentEl.innerHTML = `<ul class="mb-0 ps-3 d-flex flex-column gap-1.5">${insights.map(ins => `<li>${ins}</li>`).join('')}</ul>`;

    // 💡 สุ่มข้อคิดการเงินฉบับคู่รักวันนี้ เพื่อแสดงผลลดพื้นที่ว่างและเพิ่มความหรูหรา
    const quoteEl = document.getElementById('mascotQuoteText');
    if (quoteEl) {
        const quotes = [
            "การคุยเรื่องเงินอย่างเปิดเผย คือเคล็ดลับความรักที่ยั่งยืนที่สุดนะจ๊ะ 💖",
            "ช่วยกันออมคนละนิด เพื่อรากฐานอนาคตที่มั่นคงของเราสองคนน้า 🏡✨",
            "ก่อนจะสั่งซื้อของชิ้นใหญ่ ลองหันมาปรึกษากันก่อนนะจ๊ะคนดี 🛍️💬",
            "การออมเงินไม่ได้แปลว่าต้องอด แต่คือการวางแผนเพื่อความสุขระยะยาว 🍰☕",
            "ความรักไม่ใช่แค่การสบตา แต่คือการก้าวไปสู่อนาคตการเงินที่มั่นคงร่วมกัน 🎯👩‍❤️‍👨",
            "ความมั่นคงทางการเงินที่เราช่วยกันสร้าง คือของขวัญที่ดีที่สุดของชีวิตคู่ 🏆❤️",
            "วินัยการออมเล็กๆ ในแต่ละวัน จะพาเราไปทริปในฝันได้แน่นอนจ้า! ✈️🏖️",
            "มีคลังเงินสำรองฉุกเฉินไว้ จะช่วยปกป้องความรักของเราจากเรื่องไม่คาดฝันนะ 🛡️💖",
            "เมื่อได้รับรายรับ ลองแบ่ง 10% ไปออมทันทีสิคะ เงินออมโตวันโตคืนแน่นอน 📈💰"
        ];
        // ใช้รหัสวันปัจจุบันในการเลือกข้อคิดประจำวันเพื่อความฉลาดและเป็นธรรมชาติ
        const dayOfMonth = new Date().getDate();
        const quoteIdx = dayOfMonth % quotes.length;
        quoteEl.innerHTML = `"${quotes[quoteIdx]}"`;
    }
}

/**
 * 🐻 คำนวณเลเวลและ EXP ของพี่หมีสะสมจากการออมและทำภารกิจ
 * @param {Array} txs - ประวัติการทำรายการดิบ
 * @param {Array} goals - รายการภารกิจ
 */
function updateBearMascotLevel(txs, goals) {
    const levelTextEl = document.getElementById('mascotLevelText');
    const expProgressEl = document.getElementById('mascotExpProgress');
    if (!levelTextEl || !expProgressEl) return;
    
    // คัดกรองตัวนับธุรกรรม (ไม่รวม Hugs) เพื่อเพิ่มเลเวล (+15 XP ต่อรายการ)
    const normalTxs = txs.filter(tx => !tx.note || !tx.note.startsWith('[SYSTEM_HUG]'));
    const txCount = normalTxs.length;
    
    // คัดเควสที่ทำสำเร็จเพื่อรับ (+100 XP ต่อเป้าหมายสำเร็จ)
    const completedGoalsCount = goals ? goals.filter(g => g.is_completed).length : 0;
    
    // คำนวณยอดเงินสะสมฉุกเฉินทั้งหมด (+2 XP ทุกการฝาก 100 บาท)
    const emergencyTotalEl = document.getElementById('emergencyTotal');
    const emergencyTotal = emergencyTotalEl ? parseFloat(emergencyTotalEl.innerText.replace(/[^0-9.-]+/g,"")) || 0 : 0;
    
    const txExp = txCount * 15;
    const goalExp = completedGoalsCount * 100;
    const savingsExp = Math.floor(Math.max(0, emergencyTotal) / 100) * 2;
    const totalExp = txExp + goalExp + savingsExp;
    
    const levels = [
        { min: 0, max: 100, name: 'หมีน้อยหัดออม 🐻' },
        { min: 100, max: 300, name: 'หมีวัยรุ่นสร้างตัว 🐻👔' },
        { min: 300, max: 600, name: 'หมีนักวางแผน 🐻🎓' },
        { min: 600, max: 1000, name: 'หมีเศรษฐีคู่รัก 🐻👑' },
        { min: 1000, max: 1500, name: 'หมีนักลงทุน 🐼📈' },
        { min: 1500, max: 2100, name: 'หมีสายเปย์คู่รัก 🐼💝' },
        { min: 2100, max: 2800, name: 'หมีผู้มั่งคั่ง 🐻💰' },
        { min: 2800, max: 3600, name: 'เทพเจ้าการเงิน 🐼👑' },
        { min: 3600, max: 4500, name: 'หมีร่างทอง 👑✨' },
        { min: 4500, max: Infinity, name: 'เศรษฐีนีแอนด์บอส 💎👑' }
    ];
    
    let currentLvlIdx = 0;
    for (let i = 0; i < levels.length; i++) {
        if (totalExp >= levels[i].min && totalExp < levels[i].max) {
            currentLvlIdx = i;
            break;
        }
    }
    if (totalExp >= 4500) currentLvlIdx = levels.length - 1;
    
    const curLevel = levels[currentLvlIdx];
    const lvlNum = currentLvlIdx + 1;
    
    levelTextEl.innerText = `Lv.${lvlNum} ${curLevel.name}`;
    
    let pct = 100;
    if (curLevel.max !== Infinity) {
        const range = curLevel.max - curLevel.min;
        const currentProgress = totalExp - curLevel.min;
        pct = Math.min(100, Math.max(0, (currentProgress / range) * 100));
    }
    
    expProgressEl.style.width = `${pct}%`;
    
    const expBarContainer = document.querySelector('.mascot-exp-container');
    if (expBarContainer) {
        const nextText = curLevel.max === Infinity ? 'MAX' : `${totalExp} / ${curLevel.max}`;
        expBarContainer.title = `เลเวลพี่หมี AI: Lv.${lvlNum} (${curLevel.name})\nEXP ปัจจุบัน: ${totalExp} XP\nความก้าวหน้าเลเวลถัดไป: ${nextText} XP (บันทึก = +15 | ภารกิจสำเร็จ = +100 | ออม 100 บาท = +2)`;
    }
}

/**
 * 👥 ฟังก์ชันแสดงสถานะสำหรับหน้า AI Insights โหลดแบบเงาวิ่งสไตล์ Facebook
 */
function renderAIInsightsLoadingSkeleton() {
    const aiInsightContent = document.getElementById('aiInsightContent');
    if (aiInsightContent) {
        aiInsightContent.innerHTML = `
            <div class="py-1">
                <div class="fb-skeleton-line" style="width: 85%; height: 14px;"></div>
                <div class="fb-skeleton-line" style="width: 70%; height: 14px;"></div>
                <div class="fb-skeleton-line" style="width: 90%; height: 14px;"></div>
            </div>
        `;
    }
}

/**
 * 🏆 ถ้วยรางวัลการออมคู่รัก (Milestones & Achievements)
 * @param {Array} allTxs - ประวัติการทำรายการดิบทั้งหมด
 */
function updateMilestones(allTxs) {
    const area = document.getElementById('coupleMilestonesArea');
    if (!area) return;
    if (!allTxs) allTxs = [];

    // 1. คำนวณยอดเงินสะสมในคลังออมฉุกเฉิน
    let emergencyBalance = 0;
    allTxs.forEach(tx => {
        if (tx.owner === 'emergency') {
            const amt = parseFloat(tx.amount);
            emergencyBalance += (tx.type === 'income' ? amt : -amt);
        }
    });

    // 2. คำนวณยอดรายจ่ายแชร์ส่วนกลางประจำเดือนนี้
    const now = new Date();
    let sharedExpenseThisMonth = 0;
    allTxs.forEach(tx => {
        const txDate = new Date(tx.created_at);
        if (tx.owner === 'shared' && tx.type === 'expense' && txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
            sharedExpenseThisMonth += parseFloat(tx.amount);
        }
    });

    const emergencyTarget = parseFloat(localStorage.getItem('emergencyTarget')) || 50000;
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';

    // 3. กำหนดข้อมูล Milestone แต่ละขั้น
    const milestones = [
        {
            id: "sprout",
            icon: "🥉",
            title: "ต้นรักแรกออม",
            desc: "ออมเงินคลังแตะ 5,000 บ.",
            target: 5000,
            current: emergencyBalance,
            isUnlocked: emergencyBalance >= 5000,
            displayProgress: `สะสมแล้ว: ${Math.min(5000, Math.max(0, emergencyBalance)).toLocaleString()} บ.`
        },
        {
            id: "shield",
            icon: "🥈",
            title: "ผู้พิทักษ์กระเป๋า",
            desc: "ออมเงินคลังแตะ 20,000 บ.",
            target: 20000,
            current: emergencyBalance,
            isUnlocked: emergencyBalance >= 20000,
            displayProgress: `สะสมแล้ว: ${Math.min(20000, Math.max(0, emergencyBalance)).toLocaleString()} บ.`
        },
        {
            id: "palace",
            icon: "🥇",
            title: "เศรษฐีสร้างตัว",
            desc: `ออมเงินคลังครบเป้าหมายหลัก`,
            target: emergencyTarget,
            current: emergencyBalance,
            isUnlocked: emergencyBalance >= emergencyTarget,
            displayProgress: `สะสมแล้ว: ${Math.min(emergencyTarget, Math.max(0, emergencyBalance)).toLocaleString()} บ.`
        },
        {
            id: "frugal",
            icon: "💎",
            title: `${nameMe} & ${namePartner} ประหยัดเก่ง`,
            desc: `รายจ่ายกองกลางต่ำกว่า 10,000 บ.`,
            target: 10000,
            current: sharedExpenseThisMonth,
            isUnlocked: sharedExpenseThisMonth > 0 && sharedExpenseThisMonth < 10000,
            displayProgress: sharedExpenseThisMonth === 0 ? "ยังไม่มีรายจ่ายกองกลาง" : `รายจ่ายเดือนนี้: ${sharedExpenseThisMonth.toLocaleString()} บ.`
        }
    ];

    // 4. เรนเดอร์การ์ด Milestone
    area.innerHTML = '';
    milestones.forEach(m => {
        const card = document.createElement('div');
        
        if (m.isUnlocked) {
            card.className = "milestone-badge text-center p-2 rounded-4 shadow-xs unlocked animated-bounce";
            card.style.background = "linear-gradient(135deg, #fffbeb, #fef3c7)";
            card.style.borderColor = "#f59e0b";
            card.title = `${m.title}: ${m.desc} (ปลดล็อคสำเร็จแล้ว! 🎉)`;
            
            card.innerHTML = `
                <div class="milestone-icon fs-2">${m.icon}</div>
                <div class="fw-bold mt-1 milestone-title" style="font-size: 0.7rem; line-height: 1.1; color: #78350f;">${m.title}</div>
                <span class="small d-block text-muted mt-0.5" style="font-size: 0.55rem; color: #b45309 !important;">${m.displayProgress}</span>
                <span class="badge bg-success text-white rounded-pill mt-1" style="font-size: 0.55rem; padding: 1px 6px;">🔓 สำเร็จ</span>
            `;
        } else {
            card.className = "milestone-badge text-center p-2 rounded-4 locked";
            card.title = `${m.title}: ${m.desc} (ยังทำไม่สำเร็จ 🔒)`;
            
            let statusText = '🔒 ล็อค';
            if (m.id === 'frugal' && sharedExpenseThisMonth >= 10000) {
                statusText = '❌ เกินงบ';
            }

            card.innerHTML = `
                <div class="milestone-icon fs-2" style="opacity: 0.5;">${m.icon}</div>
                <div class="fw-bold mt-1 text-muted" style="font-size: 0.7rem; line-height: 1.1;">${m.title}</div>
                <span class="small d-block text-muted mt-0.5" style="font-size: 0.55rem; opacity: 0.75;">${m.displayProgress}</span>
                <span class="badge bg-secondary text-dark rounded-pill mt-1" style="font-size: 0.55rem; padding: 1px 6px;">${statusText}</span>
            `;
        }
        
        area.appendChild(card);
    });
}


