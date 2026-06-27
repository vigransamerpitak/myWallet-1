// js/ui.js - โมดูลดูแลหน้าจอ สลับแท็บ ธีมสี แจ้งเตือน เอฟเฟกต์แชร์กอด และอารมณ์ผู้ใช้ (UI & Interactions)

// Global spend emotion variable to share between scripts
window.currentSpendEmotion = '';

/**
 * 🌓 สลับการแสดงผลของหน้าแท็บเมนูหลัก
 * @param {string} tabId - ไอดีของแท็บที่ต้องการเปิด ("dashboard", "history", "record", "tools")
 */
function switchTab(tabId) {
    const sections = document.querySelectorAll('.tab-section');
    sections.forEach(s => s.classList.add('d-none'));

    const activeSection = document.getElementById(`section-${tabId}`);
    if (activeSection) activeSection.classList.remove('d-none');

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));

    const activeBtn = document.getElementById(`tab-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active');

    localStorage.setItem('activeTab', tabId);
    
    // โหลดเครื่องมือเสริมอัตโนมัติเมื่อเปลี่ยนเข้าหน้าเครื่องมือ
    if (tabId === 'tools') {
        if (typeof initWheel === 'function') setTimeout(initWheel, 50);
        if (typeof calculateSplitResult === 'function') calculateSplitResult();
    }
}

/**
 * 🌓 เปิด-ปิด โหมดกลางคืน (Dark Mode)
 */
function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme);
    updateDarkModeToggleIcon(targetTheme);
}

/**
 * 🌓 อัปเดตไอคอนปุ่มเปลี่ยนโหมดกลางคืนตามธีมที่เลือก
 * @param {string} theme - ธีมสี ("light", "dark")
 */
function updateDarkModeToggleIcon(theme) {
    const toggleBtn = document.getElementById('darkModeToggle');
    if (!toggleBtn) return;
    if (theme === 'dark') {
        toggleBtn.innerHTML = '<i class="bi bi-sun-fill text-warning"></i>';
    } else {
        toggleBtn.innerHTML = '<i class="bi bi-moon-stars-fill text-dark"></i>';
    }
}

/**
 * ✨ แสดงป๊อปอัปแจ้งเตือนลอยขนาดเล็ก (Toast Notification) ด้านล่างขวาของหน้าจอ
 * @param {string} message - ข้อความที่ต้องการแสดง
 * @param {string} icon - อีโมจิหน้าข้อความ (ค่าเริ่มต้นคือ '✨')
 * @param {boolean} isError - แสดงเป็นแจ้งเตือนข้อผิดพลาดสีแดงหรือไม่ (ค่าเริ่มต้นคือ false)
 */
function showToast(message, icon = '✨', isError = false) {
    const toast = document.getElementById('toastNotification');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastIcon || !toastMessage) return;

    toastIcon.innerText = icon;
    toastMessage.innerText = message;
    
    if (isError) {
        toast.classList.remove('bg-dark');
        toast.style.backgroundColor = '#dc3545'; // สีแดงแจ้งเตือนผิดพลาด
    } else {
        toast.style.backgroundColor = '';
        toast.classList.add('bg-dark');
    }
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * 🎉 เล่นเสียงความสำเร็จ (Cash register) และยิงเอฟเฟกต์กระดาษโปรย (Confetti Effect)
 */
function triggerCelebration() {
    // 🔊 เล่นเสียงเหรียญ
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav');
        audio.volume = 0.35;
        audio.play().catch(e => console.log("Audio play blocked by browser policy"));
    } catch (e) {
        console.warn("Audio element failed to load or play", e);
    }

    if (typeof confetti !== 'function') return;

    // ยิง Confetti ผสมสัญลักษณ์ความรักและการเงิน
    try {
        const scalar = 2.5;
        const shapes = [
            confetti.shapeFromText({ text: '💰', scalar }),
            confetti.shapeFromText({ text: '❤️', scalar }),
            confetti.shapeFromText({ text: '✨', scalar }),
            confetti.shapeFromText({ text: '💵', scalar }),
            confetti.shapeFromText({ text: '🎉', scalar })
        ];

        confetti({
            particleCount: 40,
            angle: 60,
            spread: 60,
            origin: { x: 0, y: 0.75 },
            shapes: shapes,
            scalar: scalar
        });

        confetti({
            particleCount: 40,
            angle: 120,
            spread: 60,
            origin: { x: 1, y: 0.75 },
            shapes: shapes,
            scalar: scalar
        });
    } catch (err) {
        // แผนสำรอง:Confetti มาตรฐานกรณีบราวเซอร์ไม่รองรับ Font Shape
        console.warn("Falling back to standard confetti", err);
        confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
}

/**
 * ⚙️ โหลดการตั้งค่าระบบการออมเงินอัตโนมัติ (Auto-Save Settings) จากพื้นที่เก็บข้อมูล
 */
function initAutoSaveSettings() {
    const autoSaveToggle = document.getElementById('autoSaveToggle');
    const autoSavePercent = document.getElementById('autoSavePercent');
    const autoSaveSettings = document.getElementById('autoSaveSettings');
    
    if (!autoSaveToggle || !autoSavePercent) return;
    
    const enabled = localStorage.getItem('autoSaveEnabled') === 'true';
    const percent = localStorage.getItem('autoSavePercent') || '10';
    
    autoSaveToggle.checked = enabled;
    autoSavePercent.value = percent;
    
    if (enabled) {
        autoSaveSettings.classList.remove('d-none');
    } else {
        autoSaveSettings.classList.add('d-none');
    }
    
    autoSavePercent.addEventListener('change', (e) => {
        let val = parseInt(e.target.value) || 10;
        if (val < 1) val = 1;
        if (val > 100) val = 100;
        e.target.value = val;
        localStorage.setItem('autoSavePercent', val);
    });

    // แสดง/ซ่อน ช่องเลือกเป้าหมายการฝากเพิ่มเติม เฉพาะกรณีเลือกโอนเงินออมฉุกเฉิน
    const txOwner = document.getElementById('txOwner');
    if (txOwner) {
        txOwner.addEventListener('change', (e) => {
            const purposeArea = document.getElementById('emergencyPurposeArea');
            if (purposeArea) {
                if (e.target.value === 'emergency') {
                    purposeArea.classList.remove('d-none');
                } else {
                    purposeArea.classList.add('d-none');
                }
            }
        });
    }
}

/**
 * ⚙️ จัดการซ่อนหรือแสดงส่วนตั้งค่าเปอร์เซ็นต์หักออมอัตโนมัติ
 */
function toggleAutoSaveUI() {
    const autoSaveToggle = document.getElementById('autoSaveToggle');
    const autoSaveSettings = document.getElementById('autoSaveSettings');
    if (!autoSaveToggle || !autoSaveSettings) return;
    
    const enabled = autoSaveToggle.checked;
    if (enabled) {
        autoSaveSettings.classList.remove('d-none');
    } else {
        autoSaveSettings.classList.add('d-none');
    }
    localStorage.setItem('autoSaveEnabled', enabled);
}

/**
 * ⚙️ โหลดตั้งค่าชื่อของตนเองและคู่รักในช่อง Input
 */
function initDynamicNames() {
    const inputMe = document.getElementById('inputNameMe');
    const inputPartner = document.getElementById('inputNamePartner');
    
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    
    if (inputMe) inputMe.value = nameMe;
    if (inputPartner) inputPartner.value = namePartner;
    
    applyDynamicNames();
}

/**
 * ⚙️ กดบันทึกชื่อผู้ใช้และคู่รักใหม่ พร้อมรีเฟรชหน้าจอข้อมูล
 */
function saveDynamicNames() {
    const inputMe = document.getElementById('inputNameMe');
    const inputPartner = document.getElementById('inputNamePartner');
    if (!inputMe || !inputPartner) return;
    
    const nameMe = inputMe.value.trim() || 'คุณโบ๊ท';
    const namePartner = inputPartner.value.trim() || 'คุณเอิร์น';
    
    localStorage.setItem('nameMe', nameMe);
    localStorage.setItem('namePartner', namePartner);
    
    applyDynamicNames();
    
    // โหลดข้อมูลในหน้าระบบอัปเดตใหม่ทันที
    if (typeof loadTransactions === 'function') loadTransactions();
    if (typeof loadGoals === 'function') loadGoals();
}

/**
 * ⚙️ อัปเดตการแสดงผลของข้อความชื่อผู้ใช้ต่างๆ ในระบบ
 */
function applyDynamicNames() {
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    
    // การ์ดแสดงผลบน Dashboard
    const labelWalletMe = document.getElementById('labelWalletMe');
    if (labelWalletMe) labelWalletMe.innerHTML = `<i class="bi bi-person text-indigo me-2"></i> กระเป๋า${nameMe}`;
    
    const labelWalletPartner = document.getElementById('labelWalletPartner');
    if (labelWalletPartner) labelWalletPartner.innerHTML = `<i class="bi bi-person text-pink me-2"></i> กระเป๋า${namePartner}`;
    
    // ดรอปดาวน์ในฟอร์มจดบันทึก
    const optOwnerMe = document.getElementById('optOwnerMe');
    if (optOwnerMe) optOwnerMe.innerText = `👤 กระเป๋าส่วนตัว (${nameMe})`;
    
    const optOwnerPartner = document.getElementById('optOwnerPartner');
    if (optOwnerPartner) optOwnerPartner.innerText = `👤 กระเป๋าส่วนตัว (${namePartner})`;
    
    const optOwnerSharedMe = document.getElementById('optOwnerSharedMe');
    if (optOwnerSharedMe) optOwnerSharedMe.innerText = `🤝 เงินกองกลาง (${nameMe} ออกก่อน)`;
    
    const optOwnerSharedPartner = document.getElementById('optOwnerSharedPartner');
    if (optOwnerSharedPartner) optOwnerSharedPartner.innerText = `🤝 เงินกองกลาง (${namePartner} ออกก่อน)`;
    
    // ดรอปดาวน์ตัวเลือกกรอง
    const filterMe = document.querySelector("#filterOwner option[value='me']");
    if (filterMe) filterMe.innerText = `👤 เฉพาะของ${nameMe}`;
    
    const filterPartner = document.querySelector("#filterOwner option[value='partner']");
    if (filterPartner) filterPartner.innerText = `👤 เฉพาะของ${namePartner}`;
    
    // ยอดผู้เปิดใช้ระบบปัจจุบัน
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
        if (window.currentUserRole === 'me') {
            userDisplay.innerHTML = `<i class="bi bi-person-circle text-indigo me-2"></i> ผู้ใช้ปัจจุบัน: <span class="fw-bold">${nameMe}</span>`;
        } else {
            userDisplay.innerHTML = `<i class="bi bi-person-circle text-pink me-2"></i> ผู้ใช้ปัจจุบัน: <span class="fw-bold">${namePartner}</span>`;
        }
    }

    // อัปเดตรายชื่อในบิลรายรอบและถ้วยความสำเร็จคู่รัก
    if (typeof renderRecurringBills === 'function') renderRecurringBills();
    if (typeof updateMilestones === 'function') updateMilestones(loadedTxsCache);
}

// โหมดเลือกแสดงอารมณ์จ่ายเงิน
function selectSpendEmotion(emotion, element) {
    const buttons = document.querySelectorAll('.emotion-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (window.currentSpendEmotion === emotion) {
        window.currentSpendEmotion = ''; // toggle ปิด
    } else {
        window.currentSpendEmotion = emotion;
        if (element) element.classList.add('active');
    }
}

// ปิดป๊อปอัปแจ้งเตือนแชร์กอด
function closeHugNotification() {
    const overlay = document.getElementById('hugNotificationOverlay');
    if (overlay) overlay.classList.add('d-none');
}

// เช็คระบบว่ามีข้อความอ้อมกอดส่งหาแฟนตกค้างหรือใหม่หรือไม่
function handleReceivedHug(tx) {
    const lastShownId = localStorage.getItem('lastShownHugId');
    
    // อัปเดต ID ล่าสุดที่เห็นเพื่อไม่ให้ประมวลผลซ้ำ
    if (lastShownId === null) {
        localStorage.setItem('lastShownHugId', tx.id);
    } else if (tx.id > parseInt(lastShownId)) {
        localStorage.setItem('lastShownHugId', tx.id);
    }
    
    // ตรวจสอบว่าผู้รับคือผู้ใช้ปัจจุบันหรือไม่ (เพื่อไม่ให้ผู้ส่งเห็นป๊อปอัปของตัวเอง)
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    const currentUserName = window.currentUserRole === 'me' ? nameMe : namePartner;
    const cleanUserName = currentUserName.replace(/^คุณ/, '');
    
    if (!tx.note || (!tx.note.includes("มาให้" + cleanUserName) && !tx.note.includes("มาให้คุณ" + cleanUserName))) {
        return;
    }
    
    // แสดงป๊อปอัปหากเป็นธุรกรรมที่ใหม่กว่าตัวที่เคยแสดงล่าสุด
    if (lastShownId !== null && tx.id > parseInt(lastShownId)) {
        const overlay = document.getElementById('hugNotificationOverlay');
        const msgEl = document.getElementById('hugNotificationMessage');
        if (overlay && msgEl) {
            msgEl.innerText = tx.note.replace('[SYSTEM_HUG] ', '').replace('[SYSTEM_HUG]', '').trim();
            overlay.classList.remove('d-none');
            triggerCelebration();
        }
    }
}

// ส่งข้อความอ้อมกอดแชร์กำลังใจเข้ากระเป๋ารวมของแฟนทันที
async function sendSystemHugToPartner() {
    if (isSaving) return;
    
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    
    let senderName = window.currentUserRole === 'me' ? nameMe : namePartner;
    let receiverName = window.currentUserRole === 'me' ? namePartner : nameMe;
    
    let senderLabel = senderName.startsWith('คุณ') ? senderName : `คุณ${senderName}`;
    let receiverLabel = receiverName.startsWith('คุณ') ? receiverName : `คุณ${receiverName}`;
    
    const message = `${senderLabel} ส่งอ้อมกอดอุ่นๆ และกำลังใจก้อนโตมาให้${receiverLabel}นะ! ❤️💖`;
    const noteContent = `[SYSTEM_HUG] ${message}`;
    
    showToast('กำลังส่งอ้อมกอดให้แฟน...', '❤️');
    isSaving = true;
    
    try {
        const { error } = await supabaseClient
            .from('transactions')
            .insert([{
                amount: 0,
                type: 'income',
                category_name: 'ของขวัญ',
                note: noteContent,
                owner: 'shared',
                created_at: new Date().toISOString()
            }]);
            
        if (error) throw error;
        
        showToast('ส่งอ้อมกอดให้แฟนเรียบร้อยแล้วจ้า! ❤️', '💖');
        triggerCelebration();
        if (typeof loadTransactions === 'function') loadTransactions();
    } catch (err) {
        console.error(err);
        showToast(`ส่งกอดไม่สำเร็จ: ${err.message}`, '❌', true);
    } finally {
        isSaving = false;
    }
}

/**
 * 📢 แสดงกล่องคำถามกดยืนยัน (Custom Confirm Dialog) สไตล์มินิมอลพรีเมียม
 * @param {string} message - ข้อความแจ้งเตือน
 * @param {string} title - หัวข้อแจ้งเตือน (ค่าเริ่มต้น: 'ยืนยันการทำรายการ')
 * @param {string} icon - อีโมจิประจำประเภทการกระทำ (ค่าเริ่มต้น: '❓')
 * @returns {Promise<boolean>} คืนค่า true เมื่อกดตกลง และ false เมื่อกดยกเลิก
 */
function showCustomConfirm(message, title = 'ยืนยันการทำรายการ', icon = '❓') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        const titleEl = document.getElementById('customDialogTitle');
        const messageEl = document.getElementById('customDialogMessage');
        const iconEl = document.getElementById('customDialogIcon');
        const confirmBtn = document.getElementById('customDialogConfirmBtn');
        const cancelBtn = document.getElementById('customDialogCancelBtn');
        const inputArea = document.getElementById('customDialogInputArea');
        
        if (!overlay || !titleEl || !messageEl || !iconEl || !confirmBtn || !cancelBtn) {
            resolve(window.confirm ? window.confirm(message) : true);
            return;
        }

        if (inputArea) inputArea.classList.add('d-none');

        titleEl.innerText = title;
        messageEl.innerHTML = message;
        iconEl.innerText = icon;
        
        cancelBtn.classList.remove('d-none');
        confirmBtn.className = "btn btn-indigo rounded-3 px-4 py-2 fw-semibold w-50";
        cancelBtn.className = "btn btn-light rounded-3 px-4 py-2 fw-semibold w-50";

        overlay.classList.remove('d-none');

        const cleanUp = (result) => {
            overlay.classList.add('d-none');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(result);
        };

        confirmBtn.onclick = () => cleanUp(true);
        cancelBtn.onclick = () => cleanUp(false);
    });
}

/**
 * 📢 แสดงกล่องแจ้งเตือน (Custom Alert Dialog) สไตล์มินิมอลพรีเมียม
 * @param {string} message - ข้อความแจ้งเตือน
 * @param {string} title - หัวข้อแจ้งเตือน (ค่าเริ่มต้น: 'แจ้งเตือนระบบ')
 * @param {string} icon - อีโมจิประจำประเภทการกระทำ (ค่าเริ่มต้น: '⚠️')
 * @returns {Promise<void>} คืนค่าเมื่อผู้ใช้กดปิด
 */
function showCustomAlert(message, title = 'แจ้งเตือนระบบ', icon = '⚠️') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        const titleEl = document.getElementById('customDialogTitle');
        const messageEl = document.getElementById('customDialogMessage');
        const iconEl = document.getElementById('customDialogIcon');
        const confirmBtn = document.getElementById('customDialogConfirmBtn');
        const cancelBtn = document.getElementById('customDialogCancelBtn');
        const inputArea = document.getElementById('customDialogInputArea');
        
        if (!overlay || !titleEl || !messageEl || !iconEl || !confirmBtn || !cancelBtn) {
            if (window.alert) window.alert(message);
            resolve();
            return;
        }

        if (inputArea) inputArea.classList.add('d-none');

        titleEl.innerText = title;
        messageEl.innerHTML = message;
        iconEl.innerText = icon;

        cancelBtn.classList.add('d-none');
        confirmBtn.className = "btn btn-indigo rounded-3 px-4 py-2 fw-semibold w-100";

        overlay.classList.remove('d-none');

        const cleanUp = () => {
            overlay.classList.add('d-none');
            confirmBtn.onclick = null;
            resolve();
        };

        confirmBtn.onclick = () => cleanUp();
    });
}

/**
 * 📢 แสดงกล่องกรอกข้อมูลตัวเลข (Custom Prompt Dialog) สไตล์มินิมอลพรีเมียม
 * @param {string} message - ข้อความแจ้งเตือน
 * @param {string} title - หัวข้อแจ้งเตือน
 * @param {string} defaultValue - ค่าเริ่มต้นในช่องกรอก (ถ้ามี)
 * @param {string} placeholder - ข้อความ Placeholder ในช่องกรอก
 * @param {string} icon - อีโมจิประจำประเภทการกระทำ (ค่าเริ่มต้น: '📝')
 * @returns {Promise<string|null>} คืนค่าข้อความที่กรอกเมื่อกดตกลง และ null เมื่อกดยกเลิก
 */
function showCustomPrompt(message, title = 'ระบุจำนวนเงิน', defaultValue = '', placeholder = '0.00', icon = '📝') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        const titleEl = document.getElementById('customDialogTitle');
        const messageEl = document.getElementById('customDialogMessage');
        const iconEl = document.getElementById('customDialogIcon');
        const confirmBtn = document.getElementById('customDialogConfirmBtn');
        const cancelBtn = document.getElementById('customDialogCancelBtn');
        const inputArea = document.getElementById('customDialogInputArea');
        const inputEl = document.getElementById('customDialogInput');
        
        if (!overlay || !titleEl || !messageEl || !iconEl || !confirmBtn || !cancelBtn || !inputArea || !inputEl) {
            resolve(window.prompt ? window.prompt(message, defaultValue) : null);
            return;
        }

        titleEl.innerText = title;
        messageEl.innerHTML = message;
        iconEl.innerText = icon;
        
        inputEl.value = defaultValue;
        inputEl.placeholder = placeholder;
        
        // แสดงปุ่มและ Input Area
        cancelBtn.classList.remove('d-none');
        inputArea.classList.remove('d-none');
        
        confirmBtn.className = "btn btn-indigo rounded-3 px-4 py-2 fw-semibold w-50";
        cancelBtn.className = "btn btn-light rounded-3 px-4 py-2 fw-semibold w-50";

        overlay.classList.remove('d-none');
        
        // โฟกัสช่องกรอกทันที
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 100);

        const cleanUp = (result) => {
            overlay.classList.add('d-none');
            inputArea.classList.add('d-none');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            inputEl.onkeydown = null;
            resolve(result);
        };

        confirmBtn.onclick = () => {
            const val = inputEl.value.trim();
            cleanUp(val);
        };
        
        cancelBtn.onclick = () => cleanUp(null);
        
        // รองรับการกด Enter ในช่องกรอก
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        };
    });
}

/**
 * 🎯 ปรับปรุงยอดเงินในช่องกรอกเงินของ Custom Prompt Modal
 */
function adjustDialogAmount(val) {
    const inputEl = document.getElementById('customDialogInput');
    if (!inputEl) return;
    
    let currentVal = parseFloat(inputEl.value) || 0;
    currentVal += val;
    inputEl.value = currentVal;
}

/**
 * 🎯 ล้างยอดเงินในช่องกรอกเงินของ Custom Prompt Modal
 */
function clearDialogAmount() {
    const inputEl = document.getElementById('customDialogInput');
    if (inputEl) inputEl.value = '';
}

/**
 * 🎯 ปรับปรุงยอดเงินในช่องกรอกเงินหลัก
 */
function adjustAmount(val) {
    const amountInput = document.getElementById('txAmount');
    if (!amountInput) return;
    let currentVal = parseFloat(amountInput.value) || 0;
    currentVal += val;
    amountInput.value = currentVal;
}

/**
 * 🎯 ล้างยอดเงินในช่องกรอกเงินหลัก
 */
function clearAmount() {
    const amountInput = document.getElementById('txAmount');
    if (amountInput) amountInput.value = '';
}

/**
 * 🎯 เลือกและบันทึกแท็กคำจดจำด่วนลงในช่องบันทึกช่วยจำ
 */
function setNoteTag(tag) {
    const noteInput = document.getElementById('txNote');
    if (noteInput) {
        noteInput.value = tag;
    }
}

/**
 * 💖 เรนเดอร์สถิติด้านความสัมพันธ์และการเงินคู่รัก
 */
function renderRelationshipHealth() {
    const card = document.getElementById('relationshipHealthCard');
    if (!card) return;

    const allTxs = window.loadedTxsCache || [];
    const filteredTxs = window.filteredTxsCache || [];

    // 1. นับจำนวนกอดทั้งหมดในระบบ
    const totalHugs = allTxs.filter(tx => tx.note && tx.note.startsWith('[SYSTEM_HUG]')).length;

    // 2. นับยอดอารมณ์ในเดือนปัจจุบัน/ตัวกรอง
    const emotionCounts = {
        'ให้รางวัลตัวเอง': 0,
        'จำเป็นต้องใช้': 0,
        'ฟุ่มเฟือยไปนิด': 0,
        'รู้งี้ไม่ซื้อดีกว่า': 0
    };
    let totalEmotionalExpenses = 0;

    filteredTxs.forEach(item => {
        if (item.tx.type === 'expense' && item.emotion) {
            for (let key in emotionCounts) {
                if (item.emotion.includes(key)) {
                    emotionCounts[key]++;
                    totalEmotionalExpenses++;
                    break;
                }
            }
        }
    });

    // 3. คำนวณคะแนน Relationship Health Score
    let score = 65; // คะแนนตั้งต้น
    score += Math.min(25, totalHugs * 5); // กอดละ +5% (สูงสุด +25%)
    score -= (emotionCounts['รู้งี้ไม่ซื้อดีกว่า'] * 6); // เสียดายเงิน -6% ต่อรายการ
    score -= (emotionCounts['ฟุ่มเฟือยไปนิด'] * 3); // ฟุ่มเฟือย -3% ต่อรายการ
    score = Math.min(100, Math.max(20, score));

    // กำหนดป้ายสถานะรัก+การเงิน
    let loveStatus = "🌱 ความสัมพันธ์มั่นคง ร่วมสร้างตัว";
    let statusClass = "text-indigo";
    if (score >= 90) {
        loveStatus = "❤️ หวานฉ่ำดั่งน้ำผึ้งพระจันทร์ (อบอุ่น & ออมเงินได้เยี่ยม)";
        statusClass = "text-danger";
    } else if (score >= 75) {
        loveStatus = "💖 รักกันกลมเกลียว ถนอมน้ำใจและคลังออม";
        statusClass = "text-primary";
    } else if (score < 50) {
        loveStatus = "⚠️ ต้องการกอดก้อนโตและคุยเรื่องงบกันด่วนค๊าบ";
        statusClass = "text-warning";
    }

    // สร้างข้อความแนะนำคู่รัก
    let adviceText = "พฤติกรรมการเงินน่ารักมากๆ ครับ ช่วยกันจัดระเบียบและรักกันแบบนี้ต่อไปน้า! พี่หมีเป็นกำลังใจให้ค๊าบ 🐻💖";
    if (totalHugs < 3) {
        adviceText = "ช่วงนี้อาจจะยุ่งหรือเครียด ลองส่งกอดส่งความรัก 🫂 ผ่านปุ่มแชร์กอดให้แฟนเพื่อคลายเหนื่อยกันหน่อยน้า";
    } else if (emotionCounts['รู้งี้ไม่ซื้อดีกว่า'] >= 3) {
        adviceText = "เดือนนี้เริ่มมีรายจ่ายที่รู้สึกเสียดายทีหลังบ่อยขึ้น ลองตกลงและทบทวนความจำเป็นร่วมกันก่อนซื้อนะครับ";
    }

    card.classList.remove('d-none');
    card.innerHTML = `
        <div class="row g-3 align-items-center">
            <div class="col-12 col-md-6 text-center text-md-start border-end border-light border-opacity-25 pe-md-4">
                <h5 class="fw-bold text-dark mb-1 d-flex align-items-center justify-content-center justify-content-md-start">
                    <i class="bi bi-heart-pulse-fill text-danger me-2"></i> สุขภาพความสัมพันธ์การเงินคู่รัก 💖
                </h5>
                <p class="small text-secondary mb-3">ดัชนีชี้วัดความรักและการออมเงินอย่างมีความสุข</p>
                
                <div class="d-flex align-items-center justify-content-center justify-content-md-start gap-3 mb-2">
                    <div class="fs-1">🥰</div>
                    <div>
                        <div class="fs-4 fw-extrabold ${statusClass}">${score}%</div>
                        <span class="small fw-bold text-secondary">${loveStatus}</span>
                    </div>
                </div>
                <div class="progress mb-3" style="height: 8px; border-radius: 4px;">
                    <div class="progress-bar bg-danger" style="width: ${score}%; border-radius: 4px;"></div>
                </div>
                <div class="p-2.5 bg-light rounded-3 border text-secondary small" style="font-size: 0.72rem; color: var(--color-text-muted) !important;">
                    <b>💡 คำแนะนำจากพี่หมี:</b> ${adviceText}
                </div>
            </div>

            <div class="col-12 col-md-6 ps-md-4">
                <div class="row g-2 text-center text-md-start">
                    <div class="col-6">
                        <div class="p-3 bg-light rounded-4 border">
                            <h6 class="text-secondary small fw-bold mb-1">🫂 ยอดการส่งกอด</h6>
                            <span class="fs-4 fw-extrabold text-danger">${totalHugs}</span> <span class="small text-muted">ครั้ง</span>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-3 bg-light rounded-4 border text-truncate">
                            <h6 class="text-secondary small fw-bold mb-1">🎁 ให้รางวัลตัวเอง</h6>
                            <span class="fs-4 fw-extrabold text-success">${emotionCounts['ให้รางวัลตัวเอง']}</span> <span class="small text-muted">ครั้ง</span>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-3 bg-light rounded-4 border">
                            <h6 class="text-secondary small fw-bold mb-1">⚠️ เสียใจ/รู้งี้ไม่ซื้อ</h6>
                            <span class="fs-4 fw-extrabold text-warning">${emotionCounts['รู้งี้ไม่ซื้อดีกว่า']}</span> <span class="small text-muted">ครั้ง</span>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-3 bg-light rounded-4 border">
                            <h6 class="text-secondary small fw-bold mb-1">💸 ฟุ่มเฟือย/หรูหรา</h6>
                            <span class="fs-4 fw-extrabold text-dark">${emotionCounts['ฟุ่มเฟือยไปนิด']}</span> <span class="small text-muted">ครั้ง</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}


