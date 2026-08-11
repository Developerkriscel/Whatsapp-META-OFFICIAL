const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function extractMetaTokenAndConnect() {
  console.log('============================================================');
  console.log('LAUNCHING CHROME PROFILE (devloper1@kriscel.com)');
  console.log('============================================================');

  const userDataDir = "C:\\Users\\krisc_knym526\\AppData\Local\\Google\\Chrome\\User Data";

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    userDataDir: userDataDir,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--profile-directory=Default'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });

  const metaUrl = 'https://developers.facebook.com/apps/1502654484880767/use_cases/customize/api-testing-v2/?use_case_enum=WHATSAPP_BUSINESS_MESSAGING';

  console.log(`1. Navigating to Meta Developer Console in devloper1@kriscel.com Chrome Session: ${metaUrl}`);
  await page.goto(metaUrl, { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  const screenshotsDir = path.join(__dirname, '../../test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  await page.screenshot({ path: path.join(screenshotsDir, '13_chrome_meta_console.png') });
  console.log('✓ Meta Console Screenshot saved: test-screenshots/13_chrome_meta_console.png');

  // Extract access token from DOM inputs/textareas
  console.log('2. Extracting fresh Access Token from Meta Developer Console DOM...');
  const pageContent = await page.content();
  let token = null;

  // Search input fields or DOM text for token starting with EAAV / EAAG / EAAB
  const tokenMatch = pageContent.match(/EAAV[A-Za-z0-9]+/);
  if (tokenMatch) {
    token = tokenMatch[0];
    console.log(`✓ Found Token in DOM: ${token.substring(0, 25)}... (Length: ${token.length})`);
  } else {
    // Try finding in textareas or inputs
    const values = await page.$$eval('input, textarea', els => els.map(e => e.value).filter(v => v && v.startsWith('EAA')));
    if (values.length > 0) {
      token = values[0];
      console.log(`✓ Found Token in Input Field: ${token.substring(0, 25)}... (Length: ${token.length})`);
    }
  }

  if (!token) {
    console.log('⚠️ Could not find token string starting with EAA. Inspecting text elements...');
    const allTexts = await page.$$eval('div, span, code', els => els.map(e => e.innerText).filter(t => t && t.includes('EAAV')));
    if (allTexts.length > 0) {
      const match = allTexts[0].match(/EAAV[A-Za-z0-9]+/);
      if (match) token = match[0];
    }
  }

  if (token) {
    console.log('============================================================');
    console.log('SUCCESSFULLY EXTRACTED FRESH META TOKEN!');
    console.log(`TOKEN: ${token}`);
    console.log('============================================================');

    // Send HTTP POST to update database credentials
    console.log('3. Updating Tenant Database Credentials via local API...');
    const loginData = JSON.stringify({ email: "m@kriscel.com", password: "12345678" });
    
    // Login to local API
    const authRes = await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.write(loginData);
      req.end();
    });

    const authToken = authRes.data.accessToken;

    // Post fresh credentials
    const credData = JSON.stringify({
      appId: "1502654484880767",
      wabaId: "1029485569660598",
      accessToken: token
    });

    await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/v1/whatsapp/credentials',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Content-Length': credData.length
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('✓ Credentials Updated in DB:', data);
          resolve();
        });
      });
      req.write(credData);
      req.end();
    });

    // Send direct test message to +919074271866
    console.log('4. Dispatching live Meta Graph API message to +919074271866...');
    const sendData = JSON.stringify({
      phone: "+919074271866",
      message: "Hello from devloper1@kriscel.com Chrome Session! Real-time Meta Cloud API integration connected and live!",
      metaPhoneId: "1183576551512466"
    });

    await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/v1/messages/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Content-Length': sendData.length
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('✓ Outbound Dispatch API Response:', data);
          resolve();
        });
      });
      req.write(sendData);
      req.end();
    });
  } else {
    console.error('❌ Token not found in Meta Developer Console DOM page');
  }

  await browser.close();
}

extractMetaTokenAndConnect().catch(err => {
  console.error('❌ Error extracting Meta token:', err);
});
