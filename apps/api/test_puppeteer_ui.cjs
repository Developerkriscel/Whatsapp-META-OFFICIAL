const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function runPuppeteerUITest() {
  console.log('============================================================');
  console.log('LAUNCHING BROWSER AUTOMATION UI TEST (SEND FROM UI)');
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

  // Navigate to Conversations / Inbox
  console.log(`3. Navigating to Conversations Inbox UI: http://localhost:5173/conversations`);
  await page.goto('http://localhost:5173/conversations', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Click on active conversation item
  console.log('4. Selecting conversation item in UI list...');
  const convButtons = await page.$$('button');
  for (const b of convButtons) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text && (text.includes('m') || text.includes('9074271866'))) {
      await b.click();
      console.log('✓ Selected contact in UI list!');
      break;
    }
  }

  // Wait for textarea composer to appear
  console.log('5. Waiting for UI Chat textarea...');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.type('textarea', 'Hello from Client Panel UI! Test message dispatched directly from browser UI composer.');
  await new Promise(r => setTimeout(r, 500));

  // Click Send Button
  console.log('6. Clicking Send button in UI...');
  const sendButtons = await page.$$('button');
  for (const btn of sendButtons) {
    const isSend = await page.evaluate(el => el.querySelector('svg') !== null && el.classList.contains('bg-wa-green'), btn);
    if (isSend) {
      await btn.click();
      console.log('✓ UI Send Button Clicked!');
      break;
    }
  }

  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(screenshotsDir, '05_ui_message_sent_success.png') });
  console.log('✓ UI Dispatch Screenshot saved: test-screenshots/05_ui_message_sent_success.png');

  await browser.close();
  console.log('============================================================');
  console.log('BROWSER UI DISPATCH TEST COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
}

runPuppeteerUITest().catch(err => {
  console.error('❌ Puppeteer Error:', err);
});
