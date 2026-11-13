// push โค้ดขึ้น Apps Script แล้วอัปเดต Web App ตัวเดิม (URL ไม่เปลี่ยน)
// ครั้งแรกจะสร้าง deployment ใหม่และจำ ID ไว้ในไฟล์ .deployment-id
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const idFile = path.join(root, '.deployment-id');
const desc = process.argv.slice(2).join(' ') || 'deploy ' + new Date().toLocaleString('th-TH');
const run = (cmd) => {
  console.log('> ' + cmd);
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
};

const pushOut = run('clasp push -f');
process.stdout.write(pushOut);

let id = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : '';
if (id) {
  process.stdout.write(run(`clasp redeploy ${id} -d "${desc}"`));
} else {
  const out = run(`clasp deploy -d "${desc}"`);
  process.stdout.write(out);
  const m = out.match(/AKfy[\w-]+/);
  if (!m) throw new Error('หา deployment ID ไม่เจอ ดูผลลัพธ์ด้านบน');
  id = m[0];
  fs.writeFileSync(idFile, id);
}
console.log('\nWeb App URL:\nhttps://script.google.com/macros/s/' + id + '/exec');
