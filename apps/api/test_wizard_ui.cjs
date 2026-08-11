const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function runWizardTest() {
  console.log('============================================================');
  console.log('LAUNCHING WHATSAPP SETUP WIZARD BROWSER UI TEST');
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
  await page.screenshot({ path: path.join(screenshotsDir, '06_whatsapp_settings_banner.png') });
  console.log('✓ WhatsApp Settings page & Wizard Banner screenshot saved: test-screenshots/06_whatsapp_settings_banner.png');

  // Click Launch Setup Wizard
  console.log('4. Clicking "Start Setup Wizard" button...');
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.innerText, btn);
    if (text && (text.includes('Start Setup Wizard') || text.includes('Launch Setup Wizard'))) {
      await btn.click();
      console.log('✓ Setup Wizard Modal Opened!');
      break;
    }
  }

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(screenshotsDir, '07_wizard_step1.png') });
  console.log('✓ Wizard Step 1 screenshot saved: test-screenshots/07_wizard_step1.png');

  // Click Next Step
  console.log('5. Navigating through Wizard Steps...');
  for (let step = 0; step < 3; step++) {
    const allButtons = await page.$$('button');
    for (const b of allButtons) {
      const txt = await page.evaluate(el => el.innerText, b);
      if (txt && txt.includes('Next Step')) {
        await b.click();
        await new Promise(r => setTimeout(r, 800));
        break;
      }
    }
  }

  await page.screenshot({ path: path.join(screenshotsDir, '08_wizard_step4_phone_id.png') });
  console.log('✓ Wizard Step 4 (Phone ID & Facebook Preview) screenshot saved: test-screenshots/08_wizard_step4_phone_id.png');

  await browser.close();
  console.log('============================================================');
  console.log('WHATSAPP SETUP WIZARD BROWSER TEST COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
}

runWizardTest().catch(err => {
  console.error('❌ Wizard Test Error:', err);
});
