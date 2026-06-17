# 快速參考卡 - NBA-MLB 平台

## 🚀 立即開始 (3 步)

```bash
# 1. 執行自動化腳本
setup.cmd              # Windows
chmod +x setup.sh && ./setup.sh  # macOS/Linux

# 2. 配置 .env.local
# DATABASE_URL="postgresql://..."

# 3. 啟動
npx prisma migrate dev --name init
npm run dev
```

---

## 📋 重要文件位置

| 文件 | 位置 | 說明 |
|------|------|------|
| 完整指南 | `IMPLEMENTATION_GUIDE.md` | 詳細設置說明 |
| 任務清單 | `CHECKLIST.md` | Phase 1-6 任務 |
| 項目概覽 | `FINAL_SUMMARY.md` | 本文件 |
| 快速指南 | `SETUP.md` | 快速啟動 |
| 環境配置 | `.env.local` | 敏感信息 |
| 數據庫 | `prisma/schema.prisma` | 8 個模型 |

---

## 🔌 API 端點速查

### 球隊和球員
```bash
GET /api/teams                   # 所有球隊
GET /api/teams?league=NBA        # 篩選聯盟
GET /api/players?team=LAL        # 球隊球員
GET /api/players?name=LeBron     # 搜尋球員
```

### 比賽
```bash
GET /api/games                              # 所有比賽
GET /api/games?date=2024-05-28              # 按日期
GET /api/games?league=MLB&status=completed  # 多條件
```

### 預測
```bash
GET /api/predictions                  # 預測歷史
POST /api/predictions { "gameId": 1 } # 生成預測
```

### 認證
```bash
POST /api/auth/register  # 註冊
POST /api/auth/signin    # 登入
POST /api/auth/logout    # 登出
```

---

## 🛠️ Prisma 命令

```bash
npx prisma migrate dev        # 創建遷移
npx prisma migrate deploy     # 應用遷移
npx prisma db seed           # 填充測試數據
npx prisma studio            # GUI 數據庫工具
npx prisma generate          # 重生成客戶端
npx prisma reset             # 重置數據庫 ⚠️
```

---

## 📦 npm 命令

```bash
npm install              # 安裝依賴
npm run dev             # 開發模式 (http://localhost:3000)
npm run build           # 構建生產版本
npm start               # 啟動生產服務器
npm run lint            # ESLint 檢查
npm run prisma:migrate  # 快捷命令
```

---

## 🔐 環境變數範本

```env
# 數據庫 (必需)
DATABASE_URL="postgresql://user:password@host:5432/nba_mlb"

# NextAuth (必需)
NEXTAUTH_SECRET="openssl rand -base64 32 # 生成"
NEXTAUTH_URL="http://localhost:3000"

# API (可選)
MLB_API_BASE_URL="https://statsapi.mlb.com/api/v1"
NBA_API_BASE_URL="https://stats.nba.com/api/v1"

# 環境
NODE_ENV="development"
```

---

## 📊 Prisma 模型概覽

| 模型 | 字段數 | 描述 |
|-----|--------|------|
| **Team** | 8 | 球隊信息 |
| **Player** | 10 | 球員信息 |
| **Game** | 15 | 比賽信息 |
| **Prediction** | 8 | AI 預測 |
| **PlayerStat** | 25 | 球員統計 |
| **User** | 6 | 用戶帳戶 |
| **Session** | 4 | 會話管理 |
| **ApiCache** | 4 | API 緩存 |

---

## 💻 TypeScript 類型

```typescript
type League = 'MLB' | 'NBA';
type GameStatus = 'scheduled' | 'live' | 'completed' | 'postponed';
type PredictionWinner = 'home' | 'away' | 'tie';

interface Game {
  id: number;
  league: League;
  status: GameStatus;
  homeScore?: number;
  awayScore?: number;
  gameDate: Date;
}
```

---

## 🔄 典型工作流程

### 開發新功能

1. **創建分支**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **編寫代碼**
   - 在 `app/api/` 中添加端點
   - 在 `services/` 中添加邏輯
   - 在 `types/` 中定義類型

3. **測試**
   ```bash
   npm run dev  # 訪問 http://localhost:3000
   ```

4. **提交**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   git push origin feature/new-feature
   ```

5. **提交 PR**
   - 在 GitHub 上創建 Pull Request
   - 等待代碼審查

---

## 🐛 常見問題快速解決

| 問題 | 解決方案 |
|------|---------|
| `Cannot find module '@prisma/client'` | `npm install @prisma/client` |
| `DATABASE_URL is not set` | 檢查 `.env.local` |
| `NEXTAUTH_SECRET not set` | `openssl rand -base64 32` |
| `Prisma migration fails` | `npx prisma migrate reset` |
| `Port 3000 already in use` | `PORT=3001 npm run dev` |
| `TypeScript errors` | `npx tsc --noEmit` |

---

## 📱 響應式設計斷點

使用 Tailwind CSS 內置斷點：

```css
/* 移動優先 */
base: 0px         /* 所有尺寸 */
sm:  640px        /* 小屏幕 */
md:  768px        /* 中屏幕 */
lg:  1024px       /* 大屏幕 */
xl:  1280px       /* 超大屏幕 */
2xl: 1536px       /* 巨大屏幕 */
```

---

## 🚀 部署檢查清單

- [ ] 所有環境變數設置
- [ ] 數據庫遷移完成
- [ ] 構建命令執行成功
- [ ] 類型檢查通過
- [ ] ESLint 檢查通過
- [ ] 測試用例通過
- [ ] 敏感信息未提交
- [ ] README 文檔完整

---

## 📞 獲取幫助

1. **查看文檔**
   - IMPLEMENTATION_GUIDE.md
   - CHECKLIST.md
   - FINAL_SUMMARY.md

2. **檢查官方文檔**
   - https://nextjs.org/docs
   - https://www.prisma.io/docs
   - https://next-auth.js.org

3. **調試步驟**
   - 檢查瀏覽器控制台錯誤
   - 查看終端輸出
   - 使用 Prisma Studio
   - 檢查數據庫狀態

---

## 📈 性能提示

- 使用 Prisma 的 `select` 和 `include` 優化查詢
- 添加數據庫索引到 schema
- 實施 API 響應緩存
- 使用 Next.js Image 優化圖像
- 代碼分割重組件

---

## 🎯 下一步任務

1. **立即** (5 分鐘)
   ```bash
   setup.cmd
   ```

2. **10 分鐘內**
   - 編輯 `.env.local`
   - 配置數據庫連接

3. **15 分鐘內**
   ```bash
   npx prisma migrate dev --name init
   npm run dev
   ```

4. **開始 Phase 2**
   - 實現 MLB 數據集成
   - 創建 API 端點
   - 測試數據流

---

## 💾 備份和恢復

```bash
# 備份數據庫
pg_dump -U user nba_mlb > backup.sql

# 恢復數據庫
psql -U user nba_mlb < backup.sql

# 重置 Prisma 數據庫 ⚠️
npx prisma migrate reset
```

---

## 🔒 安全最佳實踐

- 永遠不要提交 `.env.local`
- 使用強密碼和 secrets
- 定期更新依賴
- 驗證所有 API 輸入
- 實施 CORS 限制
- 使用 HTTPS 生產環境

---

## 📊 監控和日誌

```typescript
// 啟用 Prisma 查詢日誌
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

// Next.js 開發工具
// 訪問: http://localhost:3000/__next/debug
```

---

**最後更新:** 2026-05-28  
**版本:** 0.1.0 Phase 1 Complete  
**狀態:** ✅ 準備好啟動
