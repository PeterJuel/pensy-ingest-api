'use client';

import { useState } from 'react';

interface ScreenshotPreviewProps {
  emailId?: string;
  url?: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  className?: string;
}

export default function ScreenshotPreview({
  emailId,
  url,
  width = 1280,
  height = 720,
  fullPage = false,
  className = ''
}: ScreenshotPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const captureScreenshot = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      
      if (emailId) {
        params.append('emailId', emailId);
      } else if (url) {
        params.append('url', url);
      }
      
      params.append('width', width.toString());
      params.append('height', height.toString());
      params.append('fullPage', fullPage.toString());
      
      const response = await fetch(`/api/screenshot?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to capture screenshot');
      }
      
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      setScreenshotUrl(imageUrl);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const refreshScreenshot = () => {
    if (screenshotUrl) {
      URL.revokeObjectURL(screenshotUrl);
      setScreenshotUrl(null);
    }
    captureScreenshot();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center space-x-2">
        <button
          onClick={captureScreenshot}
          disabled={loading}
          className="btn btn-primary btn-sm"
        >
          {loading ? 'Capturing...' : screenshotUrl ? 'Refresh Screenshot' : 'Take Screenshot'}
        </button>
        
        {screenshotUrl && (
          <button
            onClick={() => {
              const link = document.createElement('a');
              link.href = screenshotUrl;
              link.download = `screenshot-${emailId || 'admin'}-${Date.now()}.png`;
              link.click();
            }}
            className="btn btn-outline btn-sm"
          >
            Download
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span>Capturing screenshot...</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Error: {error}
        </div>
      )}

      {screenshotUrl && (
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="p-3 bg-gray-50 border-b">
            <h4 className="text-sm font-medium text-gray-700">
              Screenshot Preview {emailId && `(Email: ${emailId})`}
            </h4>
          </div>
          <div className="p-4">
            <img
              src={screenshotUrl}
              alt="Page screenshot"
              className="max-w-full h-auto border rounded shadow-sm"
              style={{ maxHeight: '600px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}