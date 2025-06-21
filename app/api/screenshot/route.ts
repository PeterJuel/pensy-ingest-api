import { NextRequest, NextResponse } from 'next/server';
import { captureScreenshot, captureAdminPage } from '../../../src/lib/screenshot';
import logger from '../../../src/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const emailId = searchParams.get('emailId');
    const width = parseInt(searchParams.get('width') || '1280');
    const height = parseInt(searchParams.get('height') || '720');
    const fullPage = searchParams.get('fullPage') === 'true';

    let screenshot: Buffer;

    if (emailId) {
      // Capture specific admin page
      logger.info('Capturing admin page screenshot', 'SCREENSHOT_API', { emailId });
      screenshot = await captureAdminPage(emailId);
    } else if (url) {
      // Capture arbitrary URL
      logger.info('Capturing URL screenshot', 'SCREENSHOT_API', { url });
      screenshot = await captureScreenshot(url, { width, height, fullPage });
    } else {
      // Capture main admin page
      logger.info('Capturing main admin page screenshot', 'SCREENSHOT_API');
      screenshot = await captureAdminPage();
    }

    return new NextResponse(screenshot, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    logger.error('Screenshot API failed', 'SCREENSHOT_API', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json(
      { error: 'Failed to capture screenshot' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, options = {} } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    logger.info('POST screenshot request', 'SCREENSHOT_API', { url, options });
    
    const screenshot = await captureScreenshot(url, options);
    
    return new NextResponse(screenshot, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    logger.error('POST screenshot API failed', 'SCREENSHOT_API', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json(
      { error: 'Failed to capture screenshot' },
      { status: 500 }
    );
  }
}