const fs = require('fs');
const { firefox } = require('playwright');

(async () => {
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://www.livescore.com/en/', { waitUntil: 'networkidle' });

    // Updated selector to match <a> with href containing "/en/football/" and class="pg"
    const matchLinkSelector = 'a.pg[href*="/en/football/"]';
    const apiPathPattern = /\/_next\/data\/([^\/]+)\/en\/football\//;

    async function clickAndWaitForKey() {
      while (true) {
        let keyExtracted = null;

        const [response] = await Promise.all([
          page.waitForResponse(
            (response) => {
              const url = response.url();
              return apiPathPattern.test(url);
            },
            { timeout: 15000 } // Increased timeout
          ).catch(() => null),
          page.click(matchLinkSelector).catch((err) => {
            console.error('Click failed:', err.message);
            return null;
          }),
        ]);

        if (response) {
          const match = apiPathPattern.exec(response.url());
          if (match && match[1]) {
            keyExtracted = match[1];
            fs.writeFileSync('key.txt', keyExtracted);
            console.log(`Key extracted and saved: ${keyExtracted}`);
            break;
          }
        }

        console.log('Retrying...');
        await page.waitForTimeout(2000);
      }
    }

    // Wait for the selector to appear
    await page.waitForSelector(matchLinkSelector, { timeout: 15000 }).catch((err) => {
      console.error('Selector not found:', err.message);
      throw new Error('Failed to find the next match link');
    });

    await clickAndWaitForKey();
  } catch (error) {
    console.error('Script failed:', error.message);
  } finally {
    await browser.close();
  }
})();
