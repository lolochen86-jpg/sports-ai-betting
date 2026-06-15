# 🏀⚾ NBA-MLB 預測平台

AI 驅動的 NBA 和 MLB 遊戲預測平台。使用高級統計模型和機器學習預測體育比賽結果。

## ✨ 特性

- 🤖 **AI 預測系統** - 使用統計模型和機器學習
- 📊 **實時賽事數據** - 集成 MLB 和 NBA 官方 API
- 👥 **用戶認證** - 安全的登錄和個人化儀表板
- 📈 **統計分析** - 球隊和球員詳細統計
- 🎯 **準確預測** - 高置信度的比賽結果預測
- 📱 **響應式設計** - 完全支持移動設備

## 🚀 快速開始

### 環境要求
- Node.js 18+
- PostgreSQL 或 Supabase
- Git

### 安裝步驟

1. **執行自動化設置** (Windows)
   ```bash
   setup.cmd
   ```
   
   或 (macOS/Linux)
   ```bash
   chmod +x setup.sh && ./setup.sh
   ```

2. **配置數據庫**
   編輯 `.env.local`，設置 `DATABASE_URL`

3. **運行遷移**
   ```bash
   npx prisma migrate dev --name init
   ```

4. **啟動開發服務器**
   ```bash
   npm run dev
   ```

訪問 [http://localhost:3000](http://localhost:3000)

## 📚 完整文檔

- **[實施指南](./IMPLEMENTATION_GUIDE.md)** - 詳細的設置和開發指南
- **[檢查清單](./CHECKLIST.md)** - Phase 1-6 任務進度
- **[設置指南](./SETUP.md)** - 快速啟動指南

## 🛠️ 技術棧

**前端:** Next.js 16.2.6 • React 19.2.4 • TypeScript • Tailwind CSS  
**後端:** Node.js • Prisma • NextAuth.js • PostgreSQL  
**API:** MLB Stats API • NBA Stats API

## 📡 主要 API 端點

```
GET  /api/teams              # 獲取球隊
GET  /api/games              # 獲取比賽
GET  /api/players            # 獲取球員
GET  /api/predictions        # 預測歷史
POST /api/predictions        # 生成預測

POST /api/auth/register      # 用戶註冊
POST /api/auth/signin        # 用戶登入
POST /api/auth/logout        # 用戶登出
```

## 🎯 開發路線圖

- ✅ Phase 1: 基礎設施
- ⏳ Phase 2: 數據集成 (MLB/NBA API)
- ⏳ Phase 3: 認證系統
- ⏳ Phase 4: 預測引擎
- ⏳ Phase 5: 前端頁面
- ⏳ Phase 6: 進階功能 (實時更新、通知等)

## 📖 常用命令

```bash
npm run dev                  # 開發模式
npm run build               # 構建生產版本
npm start                   # 啟動生產服務器
npm run lint                # 代碼檢查

npx prisma migrate dev      # 創建遷移
npx prisma studio          # 打開數據庫管理工具
```

## 🔐 環境配置

```env
DATABASE_URL="postgresql://user:password@host:5432/nba_mlb"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

## 📄 項目狀態

**版本:** 0.1.0  
**狀態:** 🚧 開發中 (Phase 1 完成)

## 📞 獲取幫助

查看 [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) 或 [CHECKLIST.md](./CHECKLIST.md)

---

**構建於 2026 年 | 使用 ❤️ 開發**

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
