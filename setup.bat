@echo off
cd /d "f:\NBA-MLB.worktrees\agents-project-architecture-analysis-nextjs"

echo Creating directories...
if not exist lib mkdir lib
if not exist utils mkdir utils
if not exist components mkdir components
if not exist services mkdir services
if not exist types mkdir types
if not exist hooks mkdir hooks
if not exist prisma mkdir prisma
if not exist app\api mkdir app\api

echo Directories created successfully!
echo.
echo Next steps:
echo 1. Run: npm install
echo 2. Run: npx prisma init
echo 3. Update DATABASE_URL in .env.local
echo 4. Run: npx prisma migrate dev --name init

pause
