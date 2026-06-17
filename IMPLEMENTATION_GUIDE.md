# 完整實施指南 - NBA/MLB 預測平台

## 🎯 快速開始 (5分鐘)

### Windows 用戶
```bash
# 1. 執行自動化腳本
setup.cmd

# 2. 更新 .env.local 文件中的 DATABASE_URL
# DATABASE_URL="postgresql://user:password@host:5432/nba_mlb"

# 3. 運行數據庫遷移
npx prisma migrate dev --name init

# 4. 啟動開發服務器
npm run dev
```

### macOS/Linux 用戶
```bash
# 給腳本執行權限
chmod +x setup.sh

# 執行腳本
./setup.sh

# 更新 .env.local，然後運行遷移
npx prisma migrate dev --name init

# 啟動開發服務器
npm run dev
```

---

## 📂 完整項目結構

```
nba-mlb-platform/
│
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── route.ts                 # API 主入口
│   │   ├── teams/route.ts           # 球隊 API
│   │   ├── games/route.ts           # 遊戲 API
│   │   ├── players/route.ts         # 球員 API
│   │   ├── predictions/route.ts     # 預測 API
│   │   └── auth/
│   │       ├── register/route.ts    # 註冊端點
│   │       ├── signin/route.ts      # 登入端點
│   │       └── logout/route.ts      # 登出端點
│   ├── page.tsx                     # 首頁
│   ├── layout.tsx                   # 根布局
│   ├── globals.css                  # 全局樣式
│   └── favicon.ico
│
├── lib/                              # 共享工具庫
│   ├── prisma.ts                    # Prisma 客戶端實例
│   └── sports-api/
│       ├── mlb.ts                   # MLB API 集成
│       └── nba.ts                   # NBA API 集成
│
├── services/                         # 業務邏輯層
│   ├── auth.ts                      # 認證服務
│   ├── prediction.ts                # 預測引擎
│   └── sync.ts                      # 數據同步服務
│
├── types/                            # TypeScript 類型定義
│   ├── auth.ts                      # 認證類型
│   └── sports.ts                    # 運動數據類型
│
├── components/                       # React 組件
│   ├── Header.tsx
│   ├── Navigation.tsx
│   └── ...
│
├── hooks/                            # React Hooks
│   ├── useAuth.ts                   # 認證 hook
│   ├── usePredictions.ts            # 預測 hook
│   └── ...
│
├── utils/                            # 工具函數
│   ├── formatters.ts                # 格式化工具
│   ├── validators.ts                # 驗證工具
│   └── ...
│
├── prisma/
│   ├── schema.prisma                # 完整的數據庫 Schema
│   └── seed.ts                      # 初始數據
│
├── middleware.ts                     # Next.js 中間件
├── .env.local                        # 環境變數 (本地)
├── .env.example                      # 環境變數範本
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── SETUP.md                          # 本文件
├── CLAUDE.md
├── README.md
└── ...
```

---

## 🔧 配置詳解

### 環境變數 (.env.local)

```env
# ===== 數據庫 =====
# 選項 1: PostgreSQL 本地
DATABASE_URL="postgresql://user:password@localhost:5432/nba_mlb"

# 選項 2: Supabase (推薦)
DATABASE_URL="postgresql://postgres:your_password@your_project.supabase.co:5432/postgres"

# ===== NextAuth =====
NEXTAUTH_SECRET="your-secret-key-here"  # 生成: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"

# ===== 外部 API =====
MLB_API_BASE_URL="https://statsapi.mlb.com/api/v1"
NBA_API_BASE_URL="https://stats.nba.com/api/v1"

# ===== 環境 =====
NODE_ENV="development"
```

### Prisma Schema 概述

**核心模型**:
1. **Team** - 球隊信息
2. **Player** - 球員信息
3. **Game** - 遊戲/比賽信息
4. **Prediction** - AI 預測結果
5. **PlayerStat** - 球員統計
6. **User** - 用戶帳戶
7. **Session** - 用戶會話
8. **ApiCache** - API 響應緩存

---

## 📡 數據流架構

```
┌─────────────────────────────────────────────────────────────┐
│                  外部數據源                                  │
│  MLB Stats API    NBA Stats API    ESPN API                │
└──────────┬─────────────┬──────────────┬──────────────────────┘
           │             │              │
           └─────────┬───┘──────────────┘
                     │
           ┌─────────▼──────────┐
           │   lib/sports-api/  │
           │  (MLB & NBA 客戶端)│
           └─────────┬──────────┘
                     │
        ┌────────────▼────────────┐
        │    app/api/ routes      │
        │ (數據聚合和轉換)         │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │   services/ layer       │
        │ (業務邏輯和預測)        │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │   Prisma ORM            │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  PostgreSQL/Supabase    │
        │     (數據庫)             │
        └─────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │   React Components      │
        │   (前端用戶界面)        │
        └─────────────────────────┘
```

---

## 🚀 Phase-by-Phase 實施

### Phase 1: 基礎設施 (已完成 ✅)
- ✅ 環境配置
- ✅ Prisma Schema 設計
- ✅ 目錄結構創建
- ⏳ 執行: `npm install && npx prisma migrate dev`

### Phase 2: 數據集成 (下一步)
- ⏳ MLB 數據客戶端 (lib/sports-api/mlb.ts)
- ⏳ NBA 數據客戶端 (lib/sports-api/nba.ts)
- ⏳ API 端點: GET /api/teams
- ⏳ API 端點: GET /api/games
- ⏳ API 端點: GET /api/players
- ⏳ 數據同步服務

### Phase 3: 認證系統
- ⏳ NextAuth.js 配置
- ⏳ POST /api/auth/register
- ⏳ POST /api/auth/signin
- ⏳ POST /api/auth/logout
- ⏳ 受保護的 API 路由

### Phase 4: 預測系統
- ⏳ 統計模型引擎
- ⏳ 特徵提取模塊
- ⏳ 預測計算邏輯
- ⏳ POST /api/predictions

### Phase 5: 前端頁面
- ⏳ 登錄/註冊頁面
- ⏳ 儀表板頁面
- ⏳ 遊戲列表頁面
- ⏳ 預測結果頁面
- ⏳ 統計分析頁面

### Phase 6: 進階功能
- ⏳ 實時比分更新
- ⏳ 通知系統
- ⏳ 性能優化
- ⏳ 部署

---

## 💻 開發命令

```bash
# 安裝依賴
npm install

# 開發服務器
npm run dev

# 構建生產版本
npm build

# 啟動生產服務器
npm start

# ESLint 檢查
npm run lint

# Prisma 命令
npx prisma init              # 初始化
npx prisma migrate dev       # 創建遷移
npx prisma migrate deploy    # 應用遷移
npx prisma db seed          # 運行 seed 腳本
npx prisma studio          # 打開 Prisma Studio (GUI)
npx prisma generate        # 生成客戶端
```

---

## 🔌 API 端點快速參考

### Teams
- `GET /api/teams?league=MLB` - 取得所有球隊

### Games
- `GET /api/games?league=NBA&date=2024-05-28&status=scheduled` - 取得比賽
- `GET /api/games?team=LAL` - 取得特定球隊的比賽

### Players
- `GET /api/players?team=BOS` - 取得球隊球員
- `GET /api/players?name=LeBron` - 搜尋球員

### Predictions
- `GET /api/predictions?limit=10&offset=0` - 取得預測歷史
- `POST /api/predictions` - 產生新預測
  ```json
  { "gameId": 12345 }
  ```

### Authentication
- `POST /api/auth/register` - 用戶註冊
  ```json
  { "email": "user@example.com", "password": "...", "name": "John" }
  ```
- `POST /api/auth/signin` - 用戶登入
  ```json
  { "email": "user@example.com", "password": "..." }
  ```
- `POST /api/auth/logout` - 用戶登出

---

## 🗄️ 數據庫連接指南

### 選項 1: Supabase (推薦 - 最簡單)

1. 訪問 https://supabase.com
2. 創建新項目
3. 從 "Settings" -> "Database" 複製連接字符串
4. 粘貼到 `.env.local` 的 `DATABASE_URL`

```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres"
```

### 選項 2: 本地 PostgreSQL

```bash
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Windows
# 下載安裝程序: https://www.postgresql.org/download/windows/
```

創建數據庫和用戶:
```sql
CREATE DATABASE nba_mlb;
CREATE USER nba_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE nba_mlb TO nba_user;
```

---

## 📊 Prisma Schema 摘要

### Team 模型
```prisma
model Team {
  id: Int              // 主鍵
  league: String       // "MLB" | "NBA"
  name: String         // 球隊名稱
  code: String         // 簡碼 (e.g., "LAL")
  city: String         // 城市
  logo: String?        // Logo URL
  
  // 關係
  homeGames: Game[]    // 主客場比賽
  awayGames: Game[]
  players: Player[]    // 球隊球員
}
```

### Game 模型
```prisma
model Game {
  id: Int              // 主鍵
  league: String       // 聯盟
  homeTeamId: Int      // 主隊 ID
  awayTeamId: Int      // 客隊 ID
  gameDate: DateTime   // 比賽日期
  status: String       // "scheduled" | "live" | "completed"
  
  // 比分
  homeScore: Int?
  awayScore: Int?
  
  // 關係
  prediction: Prediction?  // AI 預測
}
```

---

## ⚙️ NextAuth 配置範本

稍後需要創建 `app/auth.ts`:

```typescript
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export const { handlers, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user) return null;

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) return null;

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          image: user.image,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  }
});
```

---

## 🎓 學習資源

- **Next.js 文檔**: https://nextjs.org/docs
- **Prisma 文檔**: https://www.prisma.io/docs/
- **TypeScript 手冊**: https://www.typescriptlang.org/docs/
- **NextAuth 文檔**: https://next-auth.js.org/
- **MLB API**: https://developer.mlb.com/
- **NBA API**: https://github.com/swar/nba_api

---

## 🐛 故障排除

### "Cannot find module '@prisma/client'"
```bash
npm install @prisma/client
npx prisma generate
```

### "DATABASE_URL is not set"
檢查 `.env.local` 文件中是否設置了正確的 `DATABASE_URL`

### "NEXTAUTH_SECRET not set"
```bash
openssl rand -base64 32  # 生成密鑰
# 複製輸出並粘貼到 .env.local
```

### Prisma 遷移失敗
```bash
# 重置數據庫 (謹慎!)
npx prisma migrate reset

# 或查看詳細錯誤
npx prisma migrate dev --skip-generate
```

---

## 📝 下一步

1. ✅ **現在**: 執行 `setup.cmd` (或 `setup.sh`)
2. ✅ **配置**: 更新 `.env.local` 中的數據庫連接
3. ✅ **遷移**: 運行 `npx prisma migrate dev --name init`
4. ✅ **運行**: 執行 `npm run dev`
5. ⏳ **Phase 2**: 實現 MLB/NBA 數據集成

---

**祝你開發順利！如有任何問題，檢查 CLAUDE.md 中的 AI 助手指導。** 🚀
