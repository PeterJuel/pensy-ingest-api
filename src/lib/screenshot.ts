import puppeteer from 'puppeteer';
import logger from './logger';

export interface ScreenshotOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  waitFor?: string | number;
  timeout?: number;
}

export async function captureScreenshot(
  url: string, 
  options: ScreenshotOptions = {}
): Promise<Buffer> {
  const {
    width = 1280,
    height = 720,
    fullPage = false,
    waitFor,
    timeout = 30000
  } = options;

  let browser;
  
  try {
    logger.info('Starting browser for screenshot', 'SCREENSHOT', { url, width, height });
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width, height });
    
    // Navigate to URL
    logger.info('Navigating to URL', 'SCREENSHOT', { url });
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    
    // Wait for specific element or time if specified
    if (waitFor) {
      if (typeof waitFor === 'string') {
        logger.info('Waiting for selector', 'SCREENSHOT', { selector: waitFor });
        await page.waitForSelector(waitFor, { timeout });
      } else {
        logger.info('Waiting for time', 'SCREENSHOT', { ms: waitFor });
        await new Promise(resolve => setTimeout(resolve, waitFor));
      }
    }
    
    // Take screenshot
    logger.info('Capturing screenshot', 'SCREENSHOT', { fullPage });
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage
    });
    
    logger.info('Screenshot captured successfully', 'SCREENSHOT', { 
      size: screenshot.length,
      url 
    });
    
    return screenshot as Buffer;
    
  } catch (error) {
    logger.error('Screenshot capture failed', 'SCREENSHOT', {
      url,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function captureAdminPage(emailId?: string): Promise<Buffer> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = emailId ? `${baseUrl}/admin/${emailId}` : `${baseUrl}/admin`;
  
  return captureScreenshot(url, {
    width: 1280,
    height: 1024,
    fullPage: true,
    waitFor: 2000 // Wait for page to fully load
  });
}