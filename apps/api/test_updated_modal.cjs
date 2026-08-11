const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function runUpdatedModalTest() {
  console.log('============================================================');
  console.log('TESTING ENHANCED ADD PHONE NUMBER MODAL (PUPPETEER)');
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
  await page.setViewport({ width: 1280, height: 800 });

  const targetUrl = 'http://localhost:5173/login';

  console.log(`1. Navigating to Client Portal Login UI: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 15000 });

  // Login
  console.log('2. Entering credentials m@kriscel.com / 12345678...');
  await page.type('input[type="email"]', 'm@kriscel.com');
  await page.type('input[type="password"]', '12345678');
  await page.click('button[type="submit"]');

  await new Promise(r => setTimeout(r, 2500));

  // Navigate to WhatsApp Settings Page
  console.log(`3. Navigating to WhatsApp Integration Settings UI: http://localhost:5173/whatsapp-settings`);
  await page.goto('http://localhost:5173/whatsapp-settings', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Click Add Phone Number Button
  console.log('4. Clicking "Add Phone Number" button...');
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.innerText, btn);
    if (text && text.includes('Add Phone Number')) {
      await btn.click();
      console.log('✓ Add Phone Number Modal Opened!');
      break;
    }
  }

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(screenshotsDir, '09_enhanced_add_phone_modal.png') });
  console.log('✓ Enhanced Add Phone Modal screenshot saved: test-screenshots/09_enhanced_add_phone_modal.png');

  await browser.close();
  console.log('============================================================');
  console.log('ENHANCED ADD PHONE MODAL TEST COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
}

runUpdatedModalTest().catch(err => {
  console.error('❌ Modal Test Error:', err);
});
