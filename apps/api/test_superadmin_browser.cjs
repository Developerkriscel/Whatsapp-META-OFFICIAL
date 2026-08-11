const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function runSuperAdminBrowserTest() {
  console.log('============================================================');
  console.log('LAUNCHING COMPREHENSIVE SUPERADMIN PORTAL BROWSER TEST');
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

  // 1. Superadmin Login
  console.log('1. Logging in as Superadmin: admin@whatsapp-saas.com / admin123');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    await emailInput.type('admin@whatsapp-saas.com');
    await page.type('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2500));
  }

  // 2. Superadmin Dashboard Overview
  console.log('2. Testing Superadmin Dashboard Overview (/superadmin)...');
  await page.goto('http://localhost:5173/superadmin', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '17_superadmin_overview.png') });
  console.log('✓ Superadmin Overview screenshot saved: test-screenshots/17_superadmin_overview.png');

  // 3. Superadmin Tenants Management
  console.log('3. Testing Superadmin Tenants Management (/superadmin/tenants)...');
  await page.goto('http://localhost:5173/superadmin/tenants', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '18_superadmin_tenants.png') });
  console.log('✓ Superadmin Tenants screenshot saved: test-screenshots/18_superadmin_tenants.png');

  // 4. Superadmin Billing & Revenue Analytics
  console.log('4. Testing Superadmin Billing & Revenue (/superadmin/billing)...');
  await page.goto('http://localhost:5173/superadmin/billing', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '19_superadmin_billing.png') });
  console.log('✓ Superadmin Billing screenshot saved: test-screenshots/19_superadmin_billing.png');

  // 5. Superadmin Credit Management
  console.log('5. Testing Superadmin Credits (/superadmin/credits)...');
  await page.goto('http://localhost:5173/superadmin/credits', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '20_superadmin_credits.png') });
  console.log('✓ Superadmin Credits screenshot saved: test-screenshots/20_superadmin_credits.png');

  // 6. Superadmin System Health & Infrastructure Monitoring
  console.log('6. Testing Superadmin System Infrastructure (/superadmin/system)...');
  await page.goto('http://localhost:5173/superadmin/system', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '21_superadmin_system.png') });
  console.log('✓ Superadmin System Health screenshot saved: test-screenshots/21_superadmin_system.png');

  // 7. Superadmin Tickets Support
  console.log('7. Testing Superadmin Tickets (/superadmin/tickets)...');
  await page.goto('http://localhost:5173/superadmin/tickets', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(screenshotsDir, '22_superadmin_tickets.png') });
  console.log('✓ Superadmin Tickets screenshot saved: test-screenshots/22_superadmin_tickets.png');

  await browser.close();
  console.log('============================================================');
  console.log('SUPERADMIN PORTAL BROWSER TEST COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
}

runSuperAdminBrowserTest().catch(err => {
  console.error('❌ Superadmin Test Error:', err);
});
