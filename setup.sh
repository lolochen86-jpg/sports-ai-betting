#!/bin/bash
# NBA-MLB Platform - Complete Setup Script for Linux/macOS

echo "🚀 NBA-MLB Platform Setup Script"
echo "=================================="

# 1. Create directory structure
echo "📁 Creating directory structure..."
mkdir -p lib/sports-api utils components services types hooks prisma
mkdir -p app/api/teams app/api/games app/api/players app/api/predictions app/api/auth/{register,signin,logout}

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Initialize Prisma
echo "🔧 Initializing Prisma..."
npx prisma init

# 4. Create lib/prisma.ts
cat > lib/prisma.ts << 'EOF'
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
EOF

# 5. Create types/auth.ts
cat > types/auth.ts << 'EOF'
export interface User {
  id: number;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  user: User;
  token: string;
  expires: Date;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends AuthCredentials {
  name: string;
}
EOF

# 6. Create types/sports.ts
cat > types/sports.ts << 'EOF'
export type League = 'MLB' | 'NBA';
export type GameStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled';
export type PredictionWinner = 'home' | 'away' | 'tie';

export interface Team {
  id: number;
  league: League;
  name: string;
  code: string;
  city: string;
  state?: string;
  logo?: string;
  establishedYear?: number;
}

export interface Player {
  id: number;
  teamId: number;
  name: string;
  position: string;
  number?: number;
  height?: string;
  weight?: number;
  dateOfBirth?: Date;
  nationality?: string;
  imageUrl?: string;
}

export interface Game {
  id: number;
  league: League;
  externalId?: string;
  homeTeamId: number;
  awayTeamId: number;
  gameDate: Date;
  season: number;
  status: GameStatus;
  homeScore?: number;
  awayScore?: number;
  homeOdds?: number;
  awayOdds?: number;
  venue?: string;
  attendance?: number;
  duration?: string;
}

export interface Prediction {
  id: number;
  gameId: number;
  predictedWinner: PredictionWinner;
  confidence: number;
  modelVersion: string;
  reasoningFactors?: string;
  isCorrect?: boolean;
  accuracy?: number;
}
EOF

# 7. Copy Prisma Schema
cat > prisma/schema.prisma << 'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Team {
  id            Int     @id @default(autoincrement())
  league        String
  name          String  @unique
  code          String  @unique
  city          String
  state         String?
  logo          String?
  establishedYear Int?
  
  homeGames     Game[]  @relation("homeTeam")
  awayGames     Game[]  @relation("awayTeam")
  players       Player[]
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([league])
  @@index([code])
}

model Player {
  id            Int     @id @default(autoincrement())
  teamId        Int
  team          Team    @relation(fields: [teamId], references: [id], onDelete: Cascade)
  
  name          String
  position      String
  number        Int?
  height        String?
  weight        Int?
  dateOfBirth   DateTime?
  nationality   String?
  imageUrl      String?
  
  stats         PlayerStat[]
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([teamId, number])
  @@index([teamId])
  @@index([name])
}

model Game {
  id              Int     @id @default(autoincrement())
  league          String
  externalId      String? @unique
  
  homeTeamId      Int
  awayTeamId      Int
  homeTeam        Team    @relation("homeTeam", fields: [homeTeamId], references: [id], onDelete: Cascade)
  awayTeam        Team    @relation("awayTeam", fields: [awayTeamId], references: [id], onDelete: Cascade)
  
  gameDate        DateTime
  season          Int
  status          String
  
  homeScore       Int?
  awayScore       Int?
  homeOdds        Float?
  awayOdds        Float?
  
  venue           String?
  attendance      Int?
  duration        String?
  
  prediction      Prediction?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([league])
  @@index([gameDate])
  @@index([status])
  @@index([homeTeamId])
  @@index([awayTeamId])
}

model Prediction {
  id              Int     @id @default(autoincrement())
  gameId          Int     @unique
  game            Game    @relation(fields: [gameId], references: [id], onDelete: Cascade)
  
  predictedWinner String
  confidence      Float
  modelVersion    String
  
  reasoningFactors String?
  
  isCorrect       Boolean?
  accuracy        Float?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([gameId])
  @@index([createdAt])
}

model PlayerStat {
  id              Int     @id @default(autoincrement())
  playerId        Int
  player          Player  @relation(fields: [playerId], references: [id], onDelete: Cascade)
  
  season          Int
  league          String
  
  hits            Int?
  runs            Int?
  rbis            Int?
  homeRuns        Int?
  stolenBases     Int?
  battingAvg      Float?
  era             Float?
  strikeouts      Int?
  wins            Int?
  saves           Int?
  
  points          Int?
  rebounds        Int?
  assists         Int?
  steals          Int?
  blocks          Int?
  fieldGoalPct    Float?
  threePointPct   Float?
  freethrowPct    Float?
  
  gamesPlayed     Int?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([playerId, season])
  @@index([playerId])
  @@index([season])
}

model User {
  id              Int     @id @default(autoincrement())
  email           String  @unique
  name            String?
  password        String
  
  emailVerified   DateTime?
  image           String?
  
  favoriteTeams   String?
  preferredLeague String?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([email])
}

model Session {
  id              Int     @id @default(autoincrement())
  sessionToken    String  @unique
  userId          Int
  
  expires         DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model ApiCache {
  id              Int     @id @default(autoincrement())
  key             String  @unique
  data            String
  expiresAt       DateTime
  createdAt       DateTime @default(now())

  @@index([expiresAt])
}
EOF

echo "✅ All files created successfully!"
echo "🔗 Next steps:"
echo "1. Update DATABASE_URL in .env.local"
echo "2. Run: npx prisma migrate dev --name init"
echo "3. Run: npm run dev"
