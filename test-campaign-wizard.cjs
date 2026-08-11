/**
 * Campaign Wizard Test Script
 * Tests the full campaign creation wizard flow
 */

const { chromium } = require('playwright');

async function runTests() {
  console.log('Starting Campaign Wizard Tests...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"], input[placeholder*="email" i]', 'm@kriscel.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/overview', { timeout: 10000 });
    console.log('✓ Login successful\n');

    // Step 2: Navigate to Campaigns
    console.log('Step 2: Navigating to Campaigns...');
    await page.click('button:has-text("Campaigns")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('✓ On Campaigns page\n');

    // Step 3: Click "New Campaign" button
    console.log('Step 3: Clicking New Campaign button...');
    const newCampaignBtn = page.locator('button:has-text("New Campaign")');
    await newCampaignBtn.waitFor({ state: 'visible', timeout: 5000 });
    await newCampaignBtn.click();
    await page.waitForTimeout(1500);
    console.log('✓ New Campaign wizard opened\n');

    // Step 4: Take screenshot of Step 1 - Audience
    console.log('Step 4: Audience selection (Step 1)...');
    await page.screenshot({ path: 'test-screenshots/01-audience.png' });

    // Check for segment selection options
    const segmentOptions = await page.locator('[class*="segment"], [class*="contact"], [class*="audience"]').count();
    console.log(`  Found ${segmentOptions} segment-related elements`);

    // Step 5: Proceed to Step 2 - Message
    console.log('Step 5: Message composition (Step 2)...');
    const nextBtn1 = page.locator('button:has-text("Next"), button:has-text("Continue")');
    if (await nextBtn1.count() > 0) {
      await nextBtn1.first().click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-screenshots/02-message.png' });

    // Step 6: Proceed to Step 3 - Phone
    console.log('Step 6: Phone number selection (Step 3)...');
    if (await nextBtn1.count() > 0) {
      await nextBtn1.first().click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-screenshots/03-phone.png' });

    // Step 7: Proceed to Step 4 - Schedule
    console.log('Step 7: Schedule settings (Step 4)...');
    if (await nextBtn1.count() > 0) {
      await nextBtn1.first().click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-screenshots/04-schedule.png' });

    // Step 8: Proceed to Step 5 - Review
    console.log('Step 8: Review & Launch (Step 5)...');
    if (await nextBtn1.count() > 0) {
      await nextBtn1.first().click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-screenshots/05-review.png' });

    // Step 9: Launch Campaign
    console.log('Step 9: Launching campaign...');
    const launchBtn = page.locator('button:has-text("Launch"), button:has-text("Send"), button:has-text("Start")');
    if (await launchBtn.count() > 0) {
      await launchBtn.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-screenshots/06-after-launch.png' });
      console.log('✓ Campaign launched\n');
    }

    console.log('✅ All wizard steps completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'test-screenshots/error.png' });
  } finally {
    await browser.close();
  }
}

runTests();
