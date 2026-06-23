// js/ui.js - โมดูลดูแลหน้าจอ สลับแท็บ ธีมสี แจ้งเตือน เอฟเฟกต์แชร์กอด และอารมณ์ผู้ใช้ (UI & Interactions)

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
    const nameMe = document.getElementById('inputNameMe').value.trim() || 'คุณโบ๊ท';
    const namePartner = document.getElementById('inputNamePartner').value.trim() || 'คุณเอิร์น';
    
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
    if (labelWalletMe) labelWalletMe.innerText = `กระเป๋า${nameMe} 🙋‍♂️`;
    
    const labelWalletPartner = document.getElementById('labelWalletPartner');
    if (labelWalletPartner) labelWalletPartner.innerText = `กระเป๋า${namePartner} 🙋‍♀️`;
    
    // ดรอปดาวน์ในฟอร์มจดบันทึก
    const optOwnerMe = document.getElementById('optOwnerMe');
    if (optOwnerMe) optOwnerMe.innerText = `🙋‍♂️ กระเป๋าส่วนตัว (${nameMe})`;
    
    const optOwnerPartner = document.getElementById('optOwnerPartner');
    if (optOwnerPartner) optOwnerPartner.innerText = `🙋‍♀️ กระเป๋าส่วนตัว (${namePartner})`;
    
    const optOwnerSharedMe = document.getElementById('optOwnerSharedMe');
    if (optOwnerSharedMe) optOwnerSharedMe.innerText = `🤝 เงินกองกลาง (${nameMe} ออกก่อน)`;
    
    const optOwnerSharedPartner = document.getElementById('optOwnerSharedPartner');
    if (optOwnerSharedPartner) optOwnerSharedPartner.innerText = `🤝 เงินกองกลาง (${namePartner} ออกก่อน)`;
    
    // ดรอปดาวน์ตัวเลือกกรอง
    const filterMe = document.querySelector("#filterOwner option[value='me']");
    if (filterMe) filterMe.innerText = `🙋‍♂️ เฉพาะของ${nameMe}`;
    
    const filterPartner = document.querySelector("#filterOwner option[value='partner']");
    if (filterPartner) filterPartner.innerText = `🙋‍♀️ เฉพาะของ${namePartner}`;
    
    // ยอดผู้เปิดใช้ระบบปัจจุบัน
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
        if (currentUserRole === 'me') {
            userDisplay.innerHTML = `🙋‍♂️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-primary">${nameMe}</span>`;
        } else {
            userDisplay.innerHTML = `🙋‍♀️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-danger">${namePartner}</span>`;
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
    
    if (currentSpendEmotion === emotion) {
        currentSpendEmotion = ''; // toggle ปิด
    } else {
        currentSpendEmotion = emotion;
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
    if (lastShownId === null) {
        localStorage.setItem('lastShownHugId', tx.id);
        return;
    }
    
    if (tx.id > parseInt(lastShownId)) {
        const overlay = document.getElementById('hugNotificationOverlay');
        const msgEl = document.getElementById('hugNotificationMessage');
        if (overlay && msgEl) {
            msgEl.innerText = tx.note.replace('[SYSTEM_HUG] ', '').replace('[SYSTEM_HUG]', '').trim();
            overlay.classList.remove('d-none');
            triggerCelebration();
            localStorage.setItem('lastShownHugId', tx.id);
        }
    }
}

// ส่งข้อความอ้อมกอดแชร์กำลังใจเข้ากระเป๋ารวมของแฟนทันที
async function sendSystemHugToPartner() {
    if (isSaving) return;
    
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    
    let senderName = currentUserRole === 'me' ? nameMe : namePartner;
    let receiverName = currentUserRole === 'me' ? namePartner : nameMe;
    
    const message = `คุณ${senderName} ส่งอ้อมกอดอุ่นๆ และกำลังใจก้อนโตมาให้คุณ${receiverName}นะ! 🫂💖`;
    const noteContent = `[SYSTEM_HUG] ${message}`;
    
    showToast('กำลังส่งอ้อมกอดให้แฟน...', '🫂');
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
        
        showToast('ส่งอ้อมกอดให้แฟนเรียบร้อยแล้วจ้า! 🫂❤️', '💖');
        triggerCelebration();
        if (typeof loadTransactions === 'function') loadTransactions();
    } catch (err) {
        console.error(err);
        showToast(`ส่งกอดไม่สำเร็จ: ${err.message}`, '❌', true);
    } finally {
        isSaving = false;
    }
}
