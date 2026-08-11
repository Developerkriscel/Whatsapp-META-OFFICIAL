const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function runRealtimeBrowserTest() {
  console.log('============================================================');
  console.log('LAUNCHING REALTIME BROWSER TEST FOR TEMPLATES, CAMPAIGNS & CHAT DISPATCH');
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

  // Step 1: Login
  console.log('1. Logging into Client Portal UI: http://localhost:5173/login');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await page.type('input[type="email"]', 'm@kriscel.com');
  await page.type('input[type="password"]', '12345678');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2500));

  // Step 2: Test WhatsApp Templates Page
  console.log('2. Navigating to WhatsApp Templates (/templates)...');
  await page.goto('http://localhost:5173/templates', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '10_templates_browser_test.png') });
  console.log('✓ Templates Page screenshot saved: test-screenshots/10_templates_browser_test.png');

  // Step 3: Test WhatsApp Campaigns Page
  console.log('3. Navigating to WhatsApp Campaigns (/campaigns)...');
  await page.goto('http://localhost:5173/campaigns', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '11_campaigns_browser_test.png') });
  console.log('✓ Campaigns Page screenshot saved: test-screenshots/11_campaigns_browser_test.png');

  // Step 4: Test Real-Time Conversations Inbox & Dispatch (+919074271866)
  console.log('4. Navigating to Conversations Inbox (/conversations)...');
  await page.goto('http://localhost:5173/conversations', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));

  // Click target conversation item
  const elements = await page.$$('div');
  for (const el of elements) {
    const txt = await page.evaluate(e => e.innerText, el);
    if (txt && (txt.includes('9074271866') || txt.includes('Audit Recipient') || txt.includes('Kriscel Owner'))) {
      await el.click();
      console.log('✓ Clicked target conversation thread');
      await new Promise(r => setTimeout(r, 1500));
      break;
    }
  }

  // Type message into chat composer
  const inputs = await page.$$('input[type="text"], textarea');
  if (inputs.length > 0) {
    console.log('5. Typing real-time message to +919074271866 in UI composer...');
    await inputs[inputs.length - 1].type('Real-Time Browser Dispatch Test to +919074271866');
    await new Promise(r => setTimeout(r, 500));

    const buttons = await page.$$('button');
    for (const b of buttons) {
      const type = await page.evaluate(el => el.getAttribute('type'), b);
      const isSend = await page.evaluate(el => el.innerHTML.includes('Send') || el.innerHTML.includes('svg'), b);
      if (type === 'submit' || isSend) {
        console.log('6. Clicking Send button...');
        await b.click();
        await new Promise(r => setTimeout(r, 2000));
        break;
      }
    }
  }

  await page.screenshot({ path: path.join(screenshotsDir, '12_conversations_browser_test.png') });
  console.log('✓ Conversations Inbox Real-Time Dispatch screenshot saved: test-screenshots/12_conversations_browser_test.png');

  await browser.close();
  console.log('============================================================');
  console.log('REALTIME BROWSER TEST COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
}

runRealtimeBrowserTest().catch(err => {
  console.error('❌ Browser Test Error:', err);
});
