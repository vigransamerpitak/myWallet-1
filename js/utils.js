// js/utils.js - โมดูลรวบรวมฟังก์ชันช่วยเหลือและจัดการรูปแบบข้อมูลพื้นฐาน (Helper & Formatters)

/**
 * 💰 แปลงตัวเลขเป็นข้อความสกุลเงินบาท (เช่น 5000 -> "5,000.00 บาท")
 * @param {number} val - จำนวนเงินตัวเลข
 * @returns {string} ข้อความสกุลเงินบาทสำเร็จรูป
 */
function formatBaht(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return "0.00 บาท";
    return `${num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

/**
 * 🏷️ ส่งคืนชื่อหมวดหมู่พร้อมไอคอนอีโมจิประจำหมวดหมู่เพื่อความพรีเมียม
 * @param {string} name - ชื่อหมวดหมู่ตามจริง
 * @returns {string} ชื่อหมวดหมู่พร้อมอีโมจินำหน้า
 */
function getCategoryEmoji(name) {
    if (!name) return '📦 อื่นๆ';
    const clean = name.trim();
    const mapping = {
        'อาหาร': '🍔 อาหาร',
        'เครื่องดื่ม': '☕ เครื่องดื่ม',
        'ช้อปปิ้ง': '🛍️ ช้อปปิ้ง',
        'ชอปปิ้ง': '🛍️ ช้อปปิ้ง',
        'เดินทาง': '🚗 เดินทาง',
        'ค่าเดินทาง': '🚗 ค่าเดินทาง',
        'ค่าบ้าน': '🏠 ค่าบ้าน/ที่พัก',
        'ค่าที่พัก/บ้าน': '🏠 ค่าบ้าน/ที่พัก',
        'ค่าน้ำค่าไฟ': '💡 ค่าน้ำค่าไฟ',
        'ความบันเทิง': '🎬 ความบันเทิง',
        'สุขภาพ': '🏥 สุขภาพ',
        'ของใช้ส่วนตัว': '🧼 ของใช้ส่วนตัว',
        'ลงทุน': '📈 ลงทุน',
        'เงินเดือน': '💵 เงินเดือน',
        'โบนัส': '🎁 โบนัส',
        'สลิปรอระบุหมวดหมู่': '⏳ รอระบุหมวดหมู่',
        'ทั่วไป': '📦 ทั่วไป',
        'ท่องเที่ยว': '✈️ ท่องเที่ยว',
        'ค่าโทรศัพท์/เน็ต': '📱 ค่าโทรศัพท์/เน็ต',
        'ของใช้ในบ้าน': '🧹 ของใช้ในบ้าน',
        'ของขวัญ': '💝 ของขวัญ',
        'การศึกษา': '📚 การศึกษา',
        'อื่นๆ': '📦 อื่นๆ'
    };
    return mapping[clean] || `🏷️ ${clean}`;
}

/**
 * 🛡️ ตัวช่วยกรองและแปลงอักขระพิเศษสำหรับใช้งานใน onclick HTML Attribute ป้องกันระบบล่ม (XSS Fix)
 * @param {string} str - ข้อความปกติ
 * @returns {string} ข้อความที่ผ่านการ Escape ตัวอักษรพิเศษแล้ว
 */
function escapeForAttr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 🔊 ระบบสังเคราะห์คลื่นเสียงบี๊บออฟไลน์ผ่านบราวเซอร์ (Web Audio API Synthesizer)
 * @param {string} type - ชนิดของเสียงที่ต้องการเล่น ("tick", "success", "cash")
 */
function playSynthSound(type) {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        if (type === "tick") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
            gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.05);
        } else if (type === "success") {
            osc.type = "triangle";
            osc.frequency.setValueAtTime(261.63, audioCtx.currentTime); // C4
            osc.frequency.setValueAtTime(329.63, audioCtx.currentTime + 0.08); // E4
            osc.frequency.setValueAtTime(392.00, audioCtx.currentTime + 0.16); // G4
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime + 0.24); // C5
            gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } else if (type === "cash") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(1100, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(2200, audioCtx.currentTime + 0.08);
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        }
    } catch (e) {
        console.warn("Synth audio error:", e);
    }
}

/**
 * 🏷️ ส่งคืน HTML ของไอคอน Bootstrap สำหรับหมวดหมู่แทนการใช้อีโมจิดิบในหน้าตาราง
 * @param {string} name - ชื่อหมวดหมู่ตามจริง
 * @returns {string} โครงสร้าง HTML ของไอคอนพร้อมชื่อหมวดหมู่
 */
function getCategoryIconHtml(name) {
    if (!name) return '<i class="bi bi-box text-indigo me-1.5"></i> อื่นๆ';
    const clean = name.trim();
    const mapping = {
        'อาหาร': '<i class="bi bi-egg-fried text-indigo me-1.5"></i> อาหาร',
        'เครื่องดื่ม': '<i class="bi bi-cup-hot text-indigo me-1.5"></i> เครื่องดื่ม',
        'ช้อปปิ้ง': '<i class="bi bi-bag text-indigo me-1.5"></i> ช้อปปิ้ง',
        'ชอปปิ้ง': '<i class="bi bi-bag text-indigo me-1.5"></i> ช้อปปิ้ง',
        'เดินทาง': '<i class="bi bi-car-front text-indigo me-1.5"></i> เดินทาง',
        'ค่าเดินทาง': '<i class="bi bi-car-front text-indigo me-1.5"></i> ค่าเดินทาง',
        'ค่าบ้าน': '<i class="bi bi-house text-indigo me-1.5"></i> ค่าบ้าน/ที่พัก',
        'ค่าที่พัก/บ้าน': '<i class="bi bi-house text-indigo me-1.5"></i> ค่าบ้าน/ที่พัก',
        'ค่าน้ำค่าไฟ': '<i class="bi bi-lightning-charge text-indigo me-1.5"></i> ค่าน้ำค่าไฟ',
        'ความบันเทิง': '<i class="bi bi-film text-indigo me-1.5"></i> ความบันเทิง',
        'สุขภาพ': '<i class="bi bi-heart-pulse text-indigo me-1.5"></i> สุขภาพ',
        'ของใช้ส่วนตัว': '<i class="bi bi-stars text-indigo me-1.5"></i> ของใช้ส่วนตัว',
        'ลงทุน': '<i class="bi bi-graph-up-arrow text-indigo me-1.5"></i> ออม/ลงทุน',
        'เงินเดือน': '<i class="bi bi-cash-stack text-success me-1.5"></i> เงินเดือน',
        'โบนัส': '<i class="bi bi-gift text-success me-1.5"></i> โบนัส',
        'สลิปรอระบุหมวดหมู่': '<i class="bi bi-hourglass-split text-warning me-1.5"></i> รอระบุหมวดหมู่',
        'ทั่วไป': '<i class="bi bi-bookmark text-indigo me-1.5"></i> ทั่วไป',
        'ท่องเที่ยว': '<i class="bi bi-airplane text-indigo me-1.5"></i> ท่องเที่ยว',
        'ค่าโทรศัพท์/เน็ต': '<i class="bi bi-phone text-indigo me-1.5"></i> โทรศัพท์/เน็ต',
        'ของใช้ในบ้าน': '<i class="bi bi-brush text-indigo me-1.5"></i> ของใช้ในบ้าน',
        'ของขวัญ': '<i class="bi bi-gift text-indigo me-1.5"></i> ของขวัญ',
        'การศึกษา': '<i class="bi bi-book text-indigo me-1.5"></i> การศึกษา',
        'อื่นๆ': '<i class="bi bi-box text-indigo me-1.5"></i> อื่นๆ'
    };
    return mapping[clean] || `<i class="bi bi-tag text-indigo me-1.5"></i> ${clean}`;
}
