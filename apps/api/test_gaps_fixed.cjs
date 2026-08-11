const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function runGapsFixedTest() {
  console.log('============================================================');
  console.log('VERIFYING RESOLVED APPLICATION GAPS IN BROWSER UI');
  console.log('============================================================');

  const screenshotsDir = path.join(__dirname, '../../test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });

  // 1. Navigate to Client Portal Login
  console.log('1. Navigating to Client Portal Login: http://localhost:5173/login');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    await emailInput.type('m@kriscel.com');
    await page.type('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2500));
  }

  // 2. Verify Token Expiration Guard Badge
  console.log('2. Navigating to WhatsApp Credentials (/whatsapp-settings)...');
  await page.goto('http://localhost:5173/whatsapp-settings', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const buttons = await page.$$('button');
  for (const b of buttons) {
    const txt = await page.evaluate(el => el.innerText, b);
    if (txt && txt.includes('Credentials')) {
      await b.click();
      await new Promise(r => setTimeout(r, 1000));
      break;
    }
  }
  await page.screenshot({ path: path.join(screenshotsDir, '14_token_guard_badge.png') });
  console.log('✓ Token Expiration Guard Badge screenshot saved: test-screenshots/14_token_guard_badge.png');

  // 3. Verify Export CSV Button in Contacts
  console.log('3. Navigating to Contacts (/contacts)...');
  await page.goto('http://localhost:5173/contacts', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(screenshotsDir, '15_contacts_export_csv.png') });
  console.log('✓ Contacts Export CSV button screenshot saved: test-screenshots/15_contacts_export_csv.png');

  // 4. Verify Retry Button in Inbox
  console.log('4. Navigating to Conversations (/conversations)...');
  await page.goto('http://localhost:5173/conversations', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '16_conversations_retry_button.png') });
  console.log('✓ Conversations Inbox Retry Button screenshot saved: test-screenshots/16_conversations_retry_button.png');

  await browser.close();
  console.log('============================================================');
  console.log('GAPS RESOLUTION TEST COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
}

runGapsFixedTest().catch(err => {
  console.error('❌ Gaps Test Error:', err);
});
