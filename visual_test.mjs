import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PDF = path.join(__dirname, 'test-fixtures', 'text_document.pdf');
const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const findings = [];

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`);
  findings.push(msg);
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
  log(`📸 Screenshot: ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Users/ernest/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  // Collect console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      log(`⚠️ Console error: ${msg.text()}`);
    }
  });

  // ────────────────────────────────────────────────────────────
  // STEP 1: Navigate to the app
  // ────────────────────────────────────────────────────────────
  log('--- STEP 1: Navigate to app ---');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    log(`❌ Failed to load page: ${e.message}`);
    await browser.close();
    process.exit(1);
  }
  await sleep(2000);
  await capture(page, '01-initial-load');

  // Check the page title
  const title = await page.title();
  log(`Page title: "${title}"`);

  // Check for visible content
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  log(`Body text preview: "${bodyText.substring(0, 200)}..."`);

  // Look for key UI elements
  const topBar = await page.$('[class*="TopBar"], nav, header');
  log(`Top bar/header found: ${!!topBar}`);

  const sidebar = await page.$('[class*="sidebar"], [class*="LeftSidebar"], aside');
  log(`Left sidebar found: ${!!sidebar}`);

  // ────────────────────────────────────────────────────────────
  // STEP 2: Find file upload mechanism
  // ────────────────────────────────────────────────────────────
  log('--- STEP 2: Find file upload ---');
  
  // Look for buttons/links
  const buttons = await page.evaluate(() => {
    const els = document.querySelectorAll('button, a, [role="button"], input[type="file"]');
    return Array.from(els).slice(0, 20).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().substring(0, 50),
      type: el.getAttribute('type'),
      visible: el.offsetParent !== null
    }));
  });
  log(`Buttons/links found: ${JSON.stringify(buttons, null, 2)}`);

  // Look for file input
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    log('✅ File input found, uploading test PDF...');
    await fileInput.setInputFiles(TEST_PDF);
    await sleep(5000);
    await capture(page, '02-after-pdf-load');
  } else {
    log('❌ No file input found on page. Trying drag-and-drop...');
    // Check if there's a drop zone
    const dropZone = await page.$('[class*="drop"], [class*="Empty"], [class*="upload"], [class*="file"]');
    log(`Drop zone / upload area found: ${!!dropZone}`);
    await capture(page, '02-no-file-input');
  }

  // ────────────────────────────────────────────────────────────
  // STEP 3: Check page layout after PDF load
  // ────────────────────────────────────────────────────────────
  log('--- STEP 3: Layout check ---');
  
  const layout = await page.evaluate(() => {
    const result = {};
    
    // Check for thumbnails
    const thumbs = document.querySelectorAll('[class*="thumbnail"], [class*="Thumbnail"], [class*="thumb"]');
    result.thumbnailCount = thumbs.length;
    
    // Check for canvas
    const canvases = document.querySelectorAll('canvas');
    result.canvasCount = canvases.length;
    canvases.forEach((c, i) => {
      result[`canvas_${i}`] = { width: c.width, height: c.height, cssWidth: c.style.width, cssHeight: c.style.height };
    });
    
    // Check for text overlays
    const textOverlays = document.querySelectorAll('[class*="ObjectOverlay"], [class*="text-overlay"]');
    result.textOverlayCount = textOverlays.length;
    
    // Check for toolbar
    const toolbar = document.querySelectorAll('[class*="tool"], [class*="Tool"], [class*="toolbar"]');
    result.toolbarElements = toolbar.length;
    
    // Check for right panel
    const rightPanel = document.querySelectorAll('[class*="RightPanel"], [class*="right-panel"], [class*="panel"]');
    result.rightPanelElements = rightPanel.length;
    
    // Check overall dimensions
    result.viewportWidth = window.innerWidth;
    result.viewportHeight = window.innerHeight;
    result.bodyOverflow = document.body.style.overflow;
    
    // Check for any elements with negative positions or extreme positions
    const allElements = document.querySelectorAll('*');
    let offScreenCount = 0;
    const offScreenDetails = [];
    allElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right < -100 || rect.left > window.innerWidth + 100 || 
          rect.bottom < -100 || rect.top > window.innerHeight + 100) {
        offScreenCount++;
        if (offScreenDetails.length < 5) {
          offScreenDetails.push({
            tag: el.tagName,
            class: el.className?.substring(0, 60),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
          });
        }
      }
    });
    result.offScreenElements = offScreenCount;
    result.offScreenDetails = offScreenDetails;
    
    return result;
  });
  log(`Layout analysis: ${JSON.stringify(layout, null, 2)}`);

  // ────────────────────────────────────────────────────────────
  // STEP 4: Check text visibility
  // ────────────────────────────────────────────────────────────
  log('--- STEP 4: Text visibility ---');
  
  await page.evaluate(() => {
    // Try to find all text-related elements
    const textEls = document.querySelectorAll('[class*="text"], [class*="Text"], span');
    return textEls.length;
  }).then(count => log(`Text elements count: ${count}`));

  // ────────────────────────────────────────────────────────────
  // STEP 5: Try to click on the main PDF page canvas (not thumbnail)
  // ────────────────────────────────────────────────────────────
  log('--- STEP 5: Interact with main PDF canvas ---');
  
  // Find the largest canvas (the main page, not thumbnails)
  const canvasResult = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const info = canvases.map((c, i) => ({
      index: i,
      width: c.width,
      height: c.height,
      cssWidth: c.clientWidth,
      cssHeight: c.clientHeight,
      rect: c.getBoundingClientRect(),
      parent: c.parentElement?.className?.substring(0, 80) || 'none',
    }));
    return info;
  });
  log(`All canvases found: ${JSON.stringify(canvasResult, null, 2)}`);
  
  // Find the largest canvas by area — this is the main PDF page
  let mainCanvas = null;
  let maxArea = 0;
  for (const c of canvasResult) {
    const area = c.cssWidth * c.cssHeight;
    if (area > maxArea) {
      maxArea = area;
      mainCanvas = c;
    }
  }
  
  if (mainCanvas && mainCanvas.rect) {
    const box = mainCanvas.rect;
    log(`Main canvas selected: index=${mainCanvas.index}, size=${mainCanvas.cssWidth}x${mainCanvas.cssHeight}, pos=(${Math.round(box.x)},${Math.round(box.y)})`);
    
    // Click at center of the canvas
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    log(`Clicking main canvas at (${Math.round(cx)}, ${Math.round(cy)})`);
    await page.mouse.click(cx, cy);
    await sleep(500);
    await capture(page, '03-after-canvas-click');
    
    // Check if any context menu appeared
    const contextMenu = await page.$('[class*="ContextMenu"], [role="menu"]');
    log(`Context menu visible after canvas click: ${!!contextMenu}`);
    if (contextMenu) {
      const menuBox = await contextMenu.boundingBox();
      log(`Context menu position: ${JSON.stringify(menuBox)}`);
    }
  } else {
    log('❌ No main canvas found');
  }

  // ────────────────────────────────────────────────────────────
  // STEP 6: Try text tool
  // ────────────────────────────────────────────────────────────
  log('--- STEP 6: Text tool ---');
  
  // Find all buttons and look for text tool
  const toolButtons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    return Array.from(btns).slice(0, 30).map((b, i) => ({
      index: i,
      text: b.textContent?.trim().substring(0, 30),
      title: b.getAttribute('title') || '',
      ariaLabel: b.getAttribute('aria-label') || '',
      class: b.className?.substring(0, 80),
      visible: b.offsetParent !== null
    }));
  });
  log(`Tool buttons: ${JSON.stringify(toolButtons, null, 2)}`);
  
  // Try to find and click a text tool button
  const textToolClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const textBtn = buttons.find(b => {
      const t = (b.textContent || '').toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return t.includes('text') || title.includes('text') || aria.includes('text') || t === 't';
    });
    if (textBtn) {
      textBtn.click();
      return true;
    }
    return false;
  });
  log(`Text tool button clicked: ${textToolClicked}`);

  // After clicking text tool, click on the MAIN canvas (not thumbnail)
  const textToolCanvasResult = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    let best = null;
    let maxArea = 0;
    for (const c of canvases) {
      const area = c.clientWidth * c.clientHeight;
      if (area > maxArea) {
        maxArea = area;
        best = c;
      }
    }
    if (best) {
      const r = best.getBoundingClientRect();
      return { x: r.x + r.width * 0.3, y: r.y + r.height * 0.3, w: r.width, h: r.height };
    }
    return null;
  });
  
  if (textToolCanvasResult) {
    log(`Clicking with text tool at (${Math.round(textToolCanvasResult.x)}, ${Math.round(textToolCanvasResult.y)}) on canvas ${Math.round(textToolCanvasResult.w)}x${Math.round(textToolCanvasResult.h)}`);
    await page.mouse.click(textToolCanvasResult.x, textToolCanvasResult.y);
    await sleep(1000);
    await capture(page, '04-after-text-tool-click');
  }

  // Check for any text input/textarea that appeared
  const textInputs = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"], [class*="TextEdit"], [class*="Edit"]');
    return Array.from(inputs).map(el => ({
      tag: el.tagName,
      class: el.className?.substring(0, 80),
      rect: el.getBoundingClientRect(),
      visible: el.offsetParent !== null
    }));
  });
  log(`Text inputs after text tool: ${JSON.stringify(textInputs, null, 2)}`);

  // ────────────────────────────────────────────────────────────
  // STEP 7: Check for overlapping elements (z-index issues)
  // ────────────────────────────────────────────────────────────
  log('--- STEP 7: Z-index & overlap check ---');
  
  const overlapInfo = await page.evaluate(() => {
    const issues = [];
    const allVisible = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    
    // Find elements with high z-index
    const highZ = [];
    allVisible.forEach(el => {
      const style = getComputedStyle(el);
      const z = parseInt(style.zIndex);
      if (!isNaN(z) && z > 10) {
        highZ.push({ tag: el.tagName, class: el.className?.substring(0, 50), zIndex: z });
      }
    });
    
    // Find elements with position fixed/absolute at extreme positions
    const extremePos = [];
    allVisible.forEach(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if ((style.position === 'fixed' || style.position === 'absolute') && 
          (rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight)) {
        if (extremePos.length < 10) {
          extremePos.push({
            tag: el.tagName,
            class: el.className?.substring(0, 60),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            position: style.position
          });
        }
      }
    });
    
    return { highZIndex: highZ.slice(0, 10), extremePositioned: extremePos };
  });
  log(`Z-index / overlap issues: ${JSON.stringify(overlapInfo, null, 2)}`);

  // ────────────────────────────────────────────────────────────
  // STEP 8: Test with multi_page.pdf
  // ────────────────────────────────────────────────────────────
  log('--- STEP 8: Test with multi_page.pdf ---');
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await sleep(1000);
  
  const fileInput2 = await page.$('input[type="file"]');
  if (fileInput2) {
    await fileInput2.setInputFiles(path.join(__dirname, 'test-fixtures', 'multi_page.pdf'));
    await sleep(5000);
    await capture(page, '05-multi-page-pdf');
    
    const thumbnails = await page.evaluate(() => {
      const thumbs = document.querySelectorAll('[class*="thumbnail"], [class*="Thumbnail"]');
      return Array.from(thumbs).map(t => ({
        rect: t.getBoundingClientRect(),
        text: t.textContent?.trim().substring(0, 20)
      }));
    });
    log(`Thumbnails visible: ${thumbnails.length}`);
    log(`Thumbnail details: ${JSON.stringify(thumbnails, null, 2)}`);
  }

  // ────────────────────────────────────────────────────────────
  // STEP 9: Final console error report
  // ────────────────────────────────────────────────────────────
  log('--- STEP 9: Console error report ---');
  const errors = consoleLogs.filter(l => l.type === 'error');
  const warnings = consoleLogs.filter(l => l.type === 'warning');
  log(`Total console errors: ${errors.length}`);
  errors.forEach(e => log(`  ERROR: ${e.text}`));
  log(`Total console warnings: ${warnings.length}`);
  warnings.slice(0, 10).forEach(w => log(`  WARN: ${w.text}`));

  // Write full findings
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'findings.json'), JSON.stringify(findings, null, 2));
  console.log('\n=== FINDINGS SUMMARY ===');
  findings.forEach(f => console.log(f));
  console.log(`\nScreenshots saved in: ${SCREENSHOT_DIR}`);
  console.log(`Findings JSON: ${path.join(SCREENSHOT_DIR, 'findings.json')}`);

  await browser.close();
})();
