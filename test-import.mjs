import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => logs.push(`[ERROR] ${err.message}`));

await page.goto(`file://${process.cwd()}/newtab.html`);
await page.waitForTimeout(2000);

const appContent = await page.$eval('#app', el => el.innerHTML.substring(0, 500)).catch(() => 'NOT FOUND');
console.log('App content:', appContent.substring(0, 200));

const exportBtn = await page.$('#export-import');
console.log('Export button found:', !!exportBtn);

if (exportBtn) {
  await exportBtn.click();
  await page.waitForTimeout(500);
  
  const importBtn = await page.$('#import-bookmarks');
  console.log('Import button found:', !!importBtn);
  
  if (importBtn) {
    await importBtn.click();
    await page.waitForTimeout(3000);
    
    const importModal = await page.$('#import-modal');
    console.log('Import modal opened:', !!importModal);
    
    const selectBtn = await page.$('#select-file-btn');
    console.log('Select file button:', !!selectBtn);
  }
}

console.log('\n--- Console Logs ---');
logs.forEach(l => console.log(l));

await browser.close();
