import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/DBarb/valley-shore-website/images';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('Loading valleyshoreservices.com...');
  await page.goto('https://www.valleyshoreservices.com/', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for all images to load
  await page.waitForTimeout(3000);

  // Get all visible img elements with their bounding boxes
  const images = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map((img, i) => ({
      index: i,
      src: img.src,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      alt: img.alt,
    })).filter(img => img.naturalW > 100 && img.naturalH > 100);
  });

  console.log(`Found ${images.length} images:`);
  images.forEach(img => console.log(`  [${img.index}] ${img.naturalW}x${img.naturalH} — ${img.src.slice(0, 80)}...`));

  // Screenshot each image element at full resolution by navigating directly to its src
  // and capturing the page (browser will render the image since it's already cached)
  const names = ['hero.jpg', 'sup.jpg', 'kayak.jpg', 'delivery.jpg'];

  for (let i = 0; i < Math.min(images.length, names.length); i++) {
    const img = images[i];
    const filename = names[i];

    // Open image directly — browser has it cached from the page visit
    const imgPage = await browser.newPage({ viewport: { width: img.naturalW || 1280, height: img.naturalH || 800 } });
    await imgPage.goto(img.src, { waitUntil: 'load', timeout: 15000 }).catch(() => {});

    // Try to get image bytes via canvas
    const bytes = await imgPage.evaluate(async (src) => {
      return new Promise((resolve) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => {
          const c = document.createElement('canvas');
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          c.getContext('2d').drawImage(im, 0, 0);
          const data = c.toDataURL('image/jpeg', 0.92).split(',')[1];
          resolve(data);
        };
        im.onerror = () => resolve(null);
        im.src = src;
      });
    }, img.src);

    if (bytes) {
      fs.writeFileSync(`${OUT}/${filename}`, Buffer.from(bytes, 'base64'));
      console.log(`✓ ${filename} saved via canvas`);
    } else {
      // Fallback: screenshot the element on the original page
      const el = await page.$(`img:nth-child(${img.index + 1})`).catch(() => null)
               || await page.locator('img').nth(i);
      if (el) {
        await el.screenshot({ path: `${OUT}/${filename}` });
        console.log(`✓ ${filename} saved via element screenshot`);
      } else {
        console.log(`✗ ${filename} — could not capture`);
      }
    }
    await imgPage.close();
  }

  await browser.close();
  console.log('Done.');
})();
