import fs from 'fs';
import path from 'path';

// 確保儲存目錄存在 (Vercel 環境下使用可寫入的 /tmp 目錄)
const isVercel = process.env.VERCEL === '1' || process.env.NOW_BUILDER === '1';
const STORE_DIR = isVercel
  ? path.join('/tmp', 'betting-store')
  : path.join(process.cwd(), 'prisma', 'betting-store');

try {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[dbFallback] Failed to create STORE_DIR:', e);
}

export const dbFallback = {
  readData<T>(fileName: string, defaultData: T): T {
    const filePath = path.join(STORE_DIR, `${fileName}.json`);
    try {
      if (!fs.existsSync(filePath)) {
        return defaultData;
      }
      const dataStr = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(dataStr) as T;
    } catch (e) {
      console.warn(`[dbFallback] Failed to read ${fileName}:`, e);
      return defaultData;
    }
  },

  writeData<T>(fileName: string, data: T): void {
    const filePath = path.join(STORE_DIR, `${fileName}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[dbFallback] Failed to write ${fileName}:`, e);
    }
  }
};
