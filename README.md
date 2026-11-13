# 🧾 น้องจดจ่าย — จดรายจ่ายผ่าน LINE ลง Google Sheets

```
พิมพ์ "จด" / "+" ในกลุ่ม ─▶ บอทตอบพร้อมปุ่ม Quick Reply ─▶ เปิด LIFF (GitHub Pages)
   ─▶ กรอกฟอร์ม ─▶ บันทึกลง Sheet ผ่าน Apps Script ─▶ LIFF ส่งสรุปเข้ากลุ่ม (ในนามคนกรอก)
```

| โฟลเดอร์/ไฟล์ | หน้าที่ |
|---|---|
| `gas/` | โค้ด Apps Script (webhook ของ LINE + API บันทึกลงชีต) |
| `docs/` | หน้า LIFF ที่วางบน GitHub Pages (`config.js` เก็บ LIFF ID กับ URL ของ Web App) |
| `deploy.cmd` | ดับเบิลคลิก → push โค้ดขึ้น Apps Script และอัปเดต Web App (URL เดิม) |
| `watch.cmd` | ดับเบิลคลิก → push อัตโนมัติทุกครั้งที่บันทึกไฟล์ใน `gas/` |

> คำสั่งใน PowerShell ให้ใช้ `clasp.cmd` / `npm.cmd` (เครื่องนี้ปิดการรันสคริปต์ `.ps1` ไว้)

---

## ขั้นที่ 1 — Apps Script (clasp)
1. `clasp.cmd login` แล้วล็อกอินด้วยบัญชีเจ้าของ Sheet
2. เปิด https://script.google.com/home/usersettings → เปิด **Google Apps Script API**
3. ดับเบิลคลิก `deploy.cmd` → จะได้ **Web App URL** (`https://script.google.com/macros/s/AKfy.../exec`)
4. `npm.cmd run open` เพื่อเปิด Apps Script editor
   - **Project Settings ⚙️ → Script Properties** เพิ่ม:
     - `CHANNEL_ACCESS_TOKEN` = Channel access token (Messaging API)
     - `LIFF_ID` = LIFF ID (ได้จากขั้นที่ 2)
     - `LOGIN_CHANNEL_ID` = Channel ID ของ LINE Login channel (ได้จากขั้นที่ 2)
   - กลับไปหน้า Editor เลือกฟังก์ชัน `authorize` → **Run** → อนุญาตสิทธิ์ (ถ้าขึ้นว่า "Google hasn't verified this app" ให้กด Advanced → Go to ... (unsafe))

## ขั้นที่ 2 — LINE Login channel + LIFF
1. เข้า https://developers.line.biz/console/ → เลือก **Provider เดียวกับ LINE OA**
2. **Create a new channel → LINE Login**
   - Region: Thailand, App types: ✅ **Web app**, กรอกชื่อ/อีเมลให้ครบ → Create
3. ในแท็บ **Basic settings** จด **Channel ID** (ใช้เป็น `LOGIN_CHANNEL_ID`)
4. แท็บ **LIFF → Add**
   - Size: **Tall**
   - Endpoint URL: `https://<username>.github.io/nong-jod-jai/` (ได้จากขั้นที่ 3)
   - Scopes: ✅ `openid` ✅ `profile` ✅ `chat_message.write` ← จำเป็นสำหรับส่งข้อความเข้ากลุ่ม
   - Bot link feature: **On (Normal)** แล้วเลือก LINE OA ของคุณ
   - Scan QR: Off → **Add**
5. จด **LIFF ID** (เช่น `2001234567-AbCdEfGh`)
6. กลับไปที่ channel → มุมขวาบนเปลี่ยนสถานะจาก **Developing → Published** (ถ้าไม่ publish เพื่อนในกลุ่มจะเปิดไม่ได้)

## ขั้นที่ 3 — GitHub Pages (วางหน้า LIFF)
1. สมัคร https://github.com/signup (ฟรี)
2. มุมขวาบน **+ → New repository** ตั้งชื่อ `nong-jod-jai` เลือก **Public** → Create
3. ในเครื่อง (ทำครั้งแรกครั้งเดียว):
   ```powershell
   git config --global user.name "ชื่อคุณ"
   git config --global user.email "อีเมลที่ใช้สมัคร GitHub"
   git add .
   git commit -m "first commit"
   git remote add origin https://github.com/<username>/nong-jod-jai.git
   git push -u origin main
   ```
   ตอน push ครั้งแรกจะมีหน้าต่างให้ล็อกอิน GitHub
4. บน GitHub: **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / folder: **`/docs`** → Save
5. รอสัก 1–2 นาที จะได้ URL `https://<username>.github.io/nong-jod-jai/`

> Channel access token **ห้าม**ใส่ในไฟล์ใดๆ ในโปรเจกต์ (repo เป็น public) ให้เก็บไว้ใน Script Properties เท่านั้น

## ขั้นที่ 4 — ต่อทุกอย่างเข้าด้วยกัน
1. แก้ `docs/config.js` ใส่ `LIFF_ID` (`GAS_URL` ใส่ไว้ให้แล้ว) แล้วรัน:
   ```powershell
   git add . ; git commit -m "config" ; git push
   ```
2. LINE Developers → **Messaging API channel** → แท็บ Messaging API
   - **Webhook URL** = Web App URL → Update → เปิด **Use webhook**
   - (ปุ่ม Verify อาจขึ้น error เพราะ Apps Script ตอบกลับเป็น redirect 302 ไม่ต้องสนใจ เพราะใช้งานได้จริง)
   - **Allow bot to join group chats** → Enabled (กดลิงก์ไปตั้งใน LINE Official Account Manager)
3. LINE Official Account Manager → Settings → Response settings: ปิด **Auto-response** / **Greeting message** (ไม่งั้นบอทจะตอบซ้ำ) และเปิด **Webhooks**
4. เชิญ OA เข้ากลุ่ม → พิมพ์ `จด` → กดปุ่ม **📝 จดรายจ่าย** 🎉

---

## หลังจากนี้ ถ้าแก้โค้ด
- แก้ `gas/*` → ดับเบิลคลิก `deploy.cmd` (push + อัปเดต Web App, URL เดิม)
- แก้ `docs/*` → `git add . ; git commit -m "update" ; git push`

## หมายเหตุเรื่องชีต
- เขียนลงแท็บ**แรก**ของไฟล์ (เปลี่ยนได้ที่ `DATA_SHEET_NAME` ใน `gas/Code.js`)
- เขียนเฉพาะ A–E (วันที่, รายการ, จำนวนเงิน, คนออกเงิน, หารใครบ้าง) และ L (Time) ส่วน F–K ปล่อยให้สูตรของคุณคำนวณ ถ้าแถวใหม่ยังไม่มีสูตร จะคัดลอกสูตรจากแถวด้านบนลงมาให้อัตโนมัติ
- รายชื่อดึงจากแท็บ `Name` คอลัมน์ A (ถ้าแถวแรกเป็นหัวตาราง เช่น "ชื่อ" จะข้ามให้)
- แถวใหม่จะต่อจากแถวสุดท้ายที่คอลัมน์ "รายการ" (B) มีข้อมูล
