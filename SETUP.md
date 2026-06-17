# 🚀 NBA-MLB Platform - 快速啟動指南

## 環境設置步驟

### 1. 創建目錄結構
在項目根目錄執行以下命令：

```bash
# Windows CMD
mkdir lib\sports-api utils components services types hooks prisma app\api

# Windows PowerShell
New-Item -ItemType Directory -Path lib\sports-api, utils, components, services, types, hooks, prisma, app\api -Force
```

### 2. 安裝依賴
```bash
npm install
```

### 3. 初始化 Prisma
```bash
npx prisma init
```

### 4. 配置數據庫連接
編輯 `.env.local` 文件，將 `DATABASE_URL` 設置為你的 PostgreSQL 連接字符串：

**選項 A: Supabase (推薦)**
```
DATABASE_URL="postgresql://postgres:your_password@your_project.supabase.co:5432/postgres"
```

**選項 B: 本地 PostgreSQL**
```
DATABASE_URL="postgresql://user:password@localhost:5432/nba_mlb"
```

### 5. 創建 Prisma Schema
將 `prisma/schema.prisma` 文件複製到 `prisma/` 目錄

### 6. 運行數據庫遷移
```bash
npx prisma migrate dev --name init
```

### 7. 生成 Prisma Client
```bash
npx prisma generate
```

### 8. 啟動開發服務器
```bash
npm run dev
```

訪問 http://localhost:3000

---

## 項目結構

```
project-root/
├── app/
│   ├── api/                    # API 路由 (Phase 2-3)
│   ├── (auth)/                 # 認證頁面 (Phase 3)
│   ├── (dashboard)/            # 認證後頁面 (Phase 5)
│   ├── page.tsx                # 首頁
│   ├── layout.tsx
│   ├── globals.css
│   └── favicon.ico
├── lib/
│   ├── prisma.ts               # Prisma 客戶端
│   └── sports-api/             # 外部 API 集成
│       ├── mlb.ts              # MLB API 客戶端
│       └── nba.ts              # NBA API 客戶端
├── services/                   # 業務邏輯層
│   ├── auth.ts                 # 認證服務
│   ├── prediction.ts           # 預測系統
│   └── sync.ts                 # 數據同步
├── types/
│   ├── auth.ts                 # 認證類型
│   └── sports.ts               # 運動數據類型
├── components/                 # React 組件
├── hooks/                      # React Hooks
├── utils/                      # 工具函數
├── prisma/
│   └── schema.prisma           # 數據庫 Schema
├── middleware.ts               # Next.js 中間件
├── .env.local                  # 環境變數
├── next.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 已完成的文件

✅ 已創建以下文件供複製：
- `.env.local` - 環境變數模板
- `middleware.ts` - 基礎中間件
- `setup.bat` - 批處理初始化腳本

等待複製的文件（需要手動創建目錄後）：
- `lib/prisma.ts`
- `lib/sports-api/mlb.ts`
- `lib/sports-api/nba.ts`
- `types/auth.ts`
- `types/sports.ts`
- `prisma/schema.prisma`

---

## 下一步

1. ✅ 執行上述設置命令
2. ⏳ 創建目錄後複製文件
3. ✅ 運行 `npm run dev`
4. ⏳ 開始 Phase 2 API 開發

---

**需要幫助？** 參考 README.md 或查看 plan.md 中的完整計劃。
