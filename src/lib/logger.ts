// Direct imports for Node.js environments
import * as fsModule from 'fs';
import * as pathModule from 'path';

// Use the modules directly
const fs = fsModule;
const path = pathModule;

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: string;
  metadata?: any;
  process?: string;
  pid?: number;
}

class AppLogger {
  private logDir: string = '';
  private logFile: string = '';
  private maxAge: number = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  private initialized: boolean = false;
  private processName: string = 'main';
  private processId: number = 0;

  constructor() {
    // Auto-initialize
    this.initialize();
  }

  private initialize() {
    if (this.initialized) return;
    
    try {
      
      // Set process identification
      this.processName = this.detectProcessName();
      this.processId = typeof process !== 'undefined' ? process.pid : 0;
      
      if (path) {
        this.logDir = path.join(process.cwd(), 'logs');
        // Use separate log files for different processes
        const logFileName = this.processName === 'main' || this.processName === 'nextjs' || this.processName === 'nextjs-dev' 
          ? 'application.log' 
          : `${this.processName}.log`;
        this.logFile = path.join(this.logDir, logFileName);
      }
      this.ensureLogDirectory();
      this.startCleanupInterval();
      this.initialized = true;
      
    } catch (error) {
      // Silently fail - probably in browser environment
    }
  }

  private detectProcessName(): string {
    if (typeof process === 'undefined') return 'browser';
    
    // Try to detect process type from command line arguments or file name
    const argv = process.argv || [];
    const scriptPath = argv[1] || '';
    
    
    if (scriptPath.includes('worker')) return 'worker';
    if (scriptPath.includes('next-server')) return 'nextjs';
    if (argv.some(arg => arg.includes('next') && arg.includes('dev'))) return 'nextjs-dev';
    
    return 'main';
  }

  private ensureLogDirectory() {
    if (!fs || !this.logDir) return;
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private writeLog(entry: LogEntry) {
    if (!this.initialized || !fs || !this.logFile) return;
    try {
      // Add process information to the log entry
      const enrichedEntry = {
        ...entry,
        process: this.processName,
        pid: this.processId
      };
      const logLine = JSON.stringify(enrichedEntry) + '\n';
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      // Silently fail to avoid infinite loops
    }
  }

  // Public logging methods - these will be used throughout the application
  public debug(message: string, context?: string, metadata?: any) {
    this.log('debug', message, context, metadata);
  }

  public info(message: string, context?: string, metadata?: any) {
    this.log('info', message, context, metadata);
  }

  public warn(message: string, context?: string, metadata?: any) {
    this.log('warn', message, context, metadata);
  }

  public error(message: string, context?: string, metadata?: any) {
    this.log('error', message, context, metadata);
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: string, metadata?: any) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      metadata
    };

    // Write to log file
    this.writeLog(logEntry);

    // Also output to console for terminal visibility
    const contextStr = context ? `[${context}] ` : '';
    const fullMessage = `${contextStr}${message}`;
    
    switch (level) {
      case 'debug':
        console.log(`🔍 ${fullMessage}`, metadata || '');
        break;
      case 'info':
        console.log(`ℹ️  ${fullMessage}`, metadata || '');
        break;
      case 'warn':
        console.warn(`⚠️  ${fullMessage}`, metadata || '');
        break;
      case 'error':
        console.error(`❌ ${fullMessage}`, metadata || '');
        break;
    }
  }


  private startCleanupInterval() {
    // Clean up old logs every hour
    setInterval(() => {
      this.cleanupOldLogs();
    }, 60 * 60 * 1000);

    // Also cleanup on startup
    this.cleanupOldLogs();
  }

  private cleanupOldLogs() {
    try {
      if (!this.initialized || !fs.existsSync(this.logFile)) return;

      const logs = fs.readFileSync(this.logFile, 'utf-8').split('\n').filter((line: string) => line.trim());
      const cutoff = new Date(Date.now() - this.maxAge);
      
      const recentLogs = logs.filter((line: string) => {
        try {
          const entry = JSON.parse(line) as LogEntry;
          return new Date(entry.timestamp) > cutoff;
        } catch {
          return false;
        }
      });

      fs.writeFileSync(this.logFile, recentLogs.join('\n') + (recentLogs.length > 0 ? '\n' : ''));
    } catch (error) {
      // Don't log this error to avoid infinite loops
    }
  }

  public getLogs(level?: 'debug' | 'info' | 'warn' | 'error', hours?: number): LogEntry[] {
    try {
      if (!this.initialized || !this.logDir) return [];

      // Read from all log files in the logs directory
      const allLogs: LogEntry[] = [];
      const logFiles = fs.readdirSync(this.logDir).filter((file: string) => file.endsWith('.log'));
      
      for (const logFile of logFiles) {
        const filePath = path.join(this.logDir, logFile);
        if (fs.existsSync(filePath)) {
          const logs = fs.readFileSync(filePath, 'utf-8').split('\n').filter((line: string) => line.trim());
          logs.forEach((line: string) => {
            try {
              const entry = JSON.parse(line) as LogEntry;
              allLogs.push(entry);
            } catch {
              // Skip invalid lines
            }
          });
        }
      }

      const cutoff = hours ? new Date(Date.now() - (hours * 60 * 60 * 1000)) : null;

      return allLogs
        .filter((entry: LogEntry): entry is LogEntry => {
          if (!entry) return false;
          if (level && entry.level !== level) return false;
          if (cutoff && new Date(entry.timestamp) < cutoff) return false;
          return true;
        })
        .sort((a: LogEntry, b: LogEntry) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      return [];
    }
  }

  public getLogStats(): { total: number; byLevel: Record<string, number>; oldestLog?: string; newestLog?: string } {
    const logs = this.getLogs();
    const byLevel: Record<string, number> = {};
    
    logs.forEach(log => {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
    });

    return {
      total: logs.length,
      byLevel,
      oldestLog: logs.length > 0 ? logs[logs.length - 1].timestamp : undefined,
      newestLog: logs.length > 0 ? logs[0].timestamp : undefined
    };
  }
}

// Create and export singleton logger instance
const logger = new AppLogger();

export default logger;
export type { LogEntry };