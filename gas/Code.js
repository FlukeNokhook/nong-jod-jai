/**
 * น้องจดจ่าย - LINE OA + LIFF + Google Sheets
 *
 * Script Properties ที่ต้องตั้ง (Project Settings > Script Properties):
 *   CHANNEL_ACCESS_TOKEN  : Channel access token ของ Messaging API
 *   LIFF_ID               : LIFF ID (เช่น 2001234567-AbCdEfGh)
 *   LOGIN_CHANNEL_ID      : Channel ID ของ LINE Login channel (ใช้ตรวจ ID token กันคนนอกยิง API)
 */

const SPREADSHEET_ID = '12uilPxtPO2h9-DAFwD51rpNWYgY93NmznDhNhw-E06g';
const DATA_SHEET_NAME = ''; // เว้นว่าง = ใช้แท็บแรกของไฟล์ ถ้าไม่ใช่ให้ใส่ชื่อแท็บ
const NAME_SHEET_NAME = 'Name';
const CONCLUSION_SHEET_NAME = 'Conclusion';
const TRIGGER_WORDS = ['จด', '+', 'จดจ่าย', 'บันทึก'];
const SUMMARY_WORDS = ['สรุป', 'สรุปยอด', 'ยอด'];

// คอลัมน์ในแท็บข้อมูล (1-based)
const COL = {
  DATE: 1,      // A วันที่
  ITEM: 2,      // B รายการ
  AMOUNT: 3,    // C จำนวนเงิน
  PAYER: 4,     // D คนออกเงิน
  SPLIT: 5,     // E หารใครบ้าง
  CALC_FROM: 6, // F..K คอลัมน์สูตร (หารคนที่ 1-4, หารกี่คน, คนละเท่าไหร่)
  CALC_TO: 11,
  TIME: 12,     // L Time
};

function props_() {
  return PropertiesService.getScriptProperties();
}

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function dataSheet_() {
  const ss = ss_();
  return DATA_SHEET_NAME ? ss.getSheetByName(DATA_SHEET_NAME) : ss.getSheets()[0];
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** อ่านรายชื่อจากแท็บ Name คอลัมน์ A (ข้ามหัวตารางอัตโนมัติ) */
function getNames_() {
  const sh = ss_().getSheetByName(NAME_SHEET_NAME);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 1) return [];
  const headers = ['ชื่อ', 'name', 'names', 'รายชื่อ', 'สมาชิก'];
  return sh.getRange(1, 1, last, 1).getDisplayValues()
    .map(r => String(r[0]).trim())
    .filter((v, i) => v && !(i === 0 && headers.indexOf(v.toLowerCase()) >= 0));
}

// ---------------------------------------------------------------- GET
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'names') {
    return json_({ ok: true, names: getNames_() });
  }
  return json_({ ok: true, service: 'nong-jod-jai' });
}

// ---------------------------------------------------------------- POST
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid json' });
  }

  // 1) Webhook จาก LINE
  if (Array.isArray(body.events)) {
    body.events.forEach(ev => {
      try { handleLineEvent_(ev); } catch (err) { console.error(err); }
    });
    return json_({ ok: true });
  }

  // 2) ส่งฟอร์มจาก LIFF
  if (body.action === 'add') {
    try {
      return json_(addExpense_(body));
    } catch (err) {
      console.error(err);
      return json_({ ok: false, error: String(err.message || err) });
    }
  }

  return json_({ ok: false, error: 'unknown request' });
}

// ---------------------------------------------------------------- LINE webhook
function handleLineEvent_(ev) {
  if (ev.type === 'join') {
    replyWithButton_(ev.replyToken, 'สวัสดีจ้า น้องจดจ่ายมาแล้ว 🧾\nพิมพ์ "จด" เพื่อบันทึกรายจ่าย หรือ "สรุป" เพื่อดูยอด');
    return;
  }
  if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
    const text = String(ev.message.text).trim();
    if (TRIGGER_WORDS.indexOf(text) >= 0) {
      replyWithButton_(ev.replyToken, 'กดปุ่มด้านล่างได้เลย 👇');
    } else if (SUMMARY_WORDS.indexOf(text) >= 0) {
      replyWithButton_(ev.replyToken, buildSummaryText_());
    }
  }
}

function replyWithButton_(replyToken, text) {
  const liffId = props_().getProperty('LIFF_ID');
  const message = {
    type: 'text',
    text: text,
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'uri', label: '📝 จดรายจ่าย', uri: 'https://liff.line.me/' + liffId },
        },
        {
          type: 'action',
          action: { type: 'message', label: '📊 สรุปยอด', text: 'สรุป' },
        },
      ],
    },
  };
  lineApi_('https://api.line.me/v2/bot/message/reply', { replyToken: replyToken, messages: [message] });
}

// ---------------------------------------------------------------- สรุปยอดจากแท็บ Conclusion
function parseNum_(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const n = Number(String(val || '').replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function fmtMoney_(n) {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function calcTransfers_(people) {
  const creditors = [];
  const debtors = [];
  people.forEach(p => {
    if (p.net > 0.005) creditors.push({ name: p.name, amount: p.net });
    else if (p.net < -0.005) debtors.push({ name: p.name, amount: -p.net });
  });
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0.005) {
      transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: pay });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount <= 0.005) i++;
    if (creditors[j].amount <= 0.005) j++;
  }
  return transfers;
}

function buildSummaryText_() {
  const sh = ss_().getSheetByName(CONCLUSION_SHEET_NAME);
  if (!sh) return 'ไม่พบแท็บ "' + CONCLUSION_SHEET_NAME + '" ใน Google Sheet';

  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return 'ยังไม่มีข้อมูลสรุปในแท็บ ' + CONCLUSION_SHEET_NAME;

  const people = [];
  let total = null;
  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i][0] || '').trim();
    if (!name) continue;
    const paid = parseNum_(rows[i][1]);
    const used = parseNum_(rows[i][2]);
    const net = parseNum_(rows[i][3]);
    if (/^total/i.test(name)) {
      total = paid || used;
      continue;
    }
    people.push({ name: name, paid: paid, used: used, net: net });
  }

  if (!people.length) return 'ยังไม่มีรายชื่อในแท็บ ' + CONCLUSION_SHEET_NAME;
  if (total === null) total = people.reduce((sum, p) => sum + p.paid, 0);

  const lines = [
    '📊 สรุปยอดใช้จ่ายทั้งหมด',
    '💰 รวมทั้งหมด: ' + fmtMoney_(total) + ' บาท',
    '',
    '👤 รายละเอียดรายคน:',
  ];
  people.forEach(p => {
    lines.push('• ' + p.name + ': ออก ' + fmtMoney_(p.paid) + ' | ใช้ ' + fmtMoney_(p.used));
  });

  const transfers = calcTransfers_(people);
  lines.push('', '💸 สรุปยอดที่ต้องโอน:');
  if (!transfers.length) {
    lines.push('• เคลียร์ยอดครบแล้ว 🎉');
  } else {
    transfers.forEach(t => {
      lines.push('• ' + t.from + ' ➜ ' + t.to + ': ' + fmtMoney_(t.amount) + ' บาท');
    });
  }
  return lines.join('\n');
}

function lineApi_(url, payload) {
  const token = props_().getProperty('CHANNEL_ACCESS_TOKEN');
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) console.error('LINE API error', res.getResponseCode(), res.getContentText());
  return res;
}

// ---------------------------------------------------------------- บันทึกรายการ
function verifyIdToken_(idToken) {
  const channelId = props_().getProperty('LOGIN_CHANNEL_ID');
  if (!channelId) return { name: '' }; // ยังไม่ตั้งค่า = ข้ามการตรวจ
  if (!idToken) throw new Error('กรุณาเปิดฟอร์มผ่าน LINE');
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('ยืนยันตัวตน LINE ไม่ผ่าน กรุณาเปิดฟอร์มใหม่');
  return JSON.parse(res.getContentText());
}

function addExpense_(d) {
  verifyIdToken_(d.idToken);

  const names = getNames_();
  const item = String(d.item || '').trim();
  const amount = Number(d.amount);
  const payer = String(d.payer || '').trim();
  const split = (Array.isArray(d.split) ? d.split : []).map(s => String(s).trim()).filter(Boolean);

  if (!item) throw new Error('กรุณากรอกรายการ');
  if (!(amount > 0)) throw new Error('จำนวนเงินไม่ถูกต้อง');
  if (names.length && names.indexOf(payer) < 0) throw new Error('ไม่พบชื่อคนออกเงิน');
  if (!split.length) throw new Error('กรุณาเลือกคนหารอย่างน้อย 1 คน');
  if (names.length && split.some(s => names.indexOf(s) < 0)) throw new Error('มีชื่อคนหารที่ไม่อยู่ในแท็บ Name');

  const m = String(d.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('วันที่ไม่ถูกต้อง');
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const time = /^\d{2}:\d{2}$/.test(String(d.time || '')) ? d.time : Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HH:mm');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = dataSheet_();
    const row = findNextRow_(sh);

    sh.getRange(row, COL.DATE, 1, 5).setValues([[date, item, amount, payer, split.join(', ')]]);
    sh.getRange(row, COL.TIME).setValue(time);
    copyFormulasIfMissing_(sh, row);
    SpreadsheetApp.flush();

    return {
      ok: true,
      row: row,
      item: item,
      amount: amount,
      payer: payer,
      split: split,
      perPerson: Math.round((amount / split.length) * 100) / 100,
    };
  } finally {
    lock.releaseLock();
  }
}

/** หาแถวว่างแถวแรกต่อจากรายการสุดท้าย โดยดูจากคอลัมน์ "รายการ" (ไม่สนแถวที่มีแต่สูตร) */
function findNextRow_(sh) {
  const last = Math.max(sh.getLastRow(), 1);
  const vals = sh.getRange(1, COL.ITEM, last, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() !== '') return i + 2;
  }
  return 2;
}

/** ถ้าแถวใหม่ยังไม่มีสูตรในคอลัมน์ F-K ให้คัดลอกสูตรจากแถวด้านบน (ถ้าแถวบนมีสูตรและไม่ใช่ ARRAYFORMULA) */
function copyFormulasIfMissing_(sh, row) {
  if (row <= 2) return;
  const width = COL.CALC_TO - COL.CALC_FROM + 1;
  const target = sh.getRange(row, COL.CALC_FROM, 1, width);
  const targetFormulas = target.getFormulas()[0];
  const targetValues = target.getValues()[0];
  const prevFormulas = sh.getRange(row - 1, COL.CALC_FROM, 1, width).getFormulas()[0];

  prevFormulas.forEach((f, i) => {
    if (!f || /ARRAYFORMULA/i.test(f)) return;
    if (targetFormulas[i] || targetValues[i] !== '') return;
    sh.getRange(row - 1, COL.CALC_FROM + i).copyTo(sh.getRange(row, COL.CALC_FROM + i), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
  });
}

// ---------------------------------------------------------------- ใช้ตอนตั้งค่า
/** กด Run ฟังก์ชันนี้ครั้งแรกใน Apps Script editor เพื่ออนุญาตสิทธิ์ และเช็คว่าอ่านชีตได้ */
function authorize() {
  console.log('แท็บข้อมูล:', dataSheet_().getName());
  console.log('รายชื่อ:', getNames_());
  UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: 'Bearer ' + props_().getProperty('CHANNEL_ACCESS_TOKEN') },
    muteHttpExceptions: true,
  });
  console.log('OK');
}
