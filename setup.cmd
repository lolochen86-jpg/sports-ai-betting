@echo off
REM NBA-MLB Platform - Complete Setup Script for Windows

echo.
echo 🚀 NBA-MLB Platform Setup Script
echo ==================================
echo.

REM 1. Create directory structure
echo 📁 Creating directory structure...
if not exist lib mkdir lib
if not exist lib\sports-api mkdir lib\sports-api
if not exist utils mkdir utils
if not exist components mkdir components
if not exist services mkdir services
if not exist types mkdir types
if not exist hooks mkdir hooks
if not exist prisma mkdir prisma
if not exist app\api mkdir app\api
if not exist app\api\teams mkdir app\api\teams
if not exist app\api\games mkdir app\api\games
if not exist app\api\players mkdir app\api\players
if not exist app\api\predictions mkdir app\api\predictions
if not exist app\api\auth mkdir app\api\auth
if not exist app\api\auth\register mkdir app\api\auth\register
if not exist app\api\auth\signin mkdir app\api\auth\signin
if not exist app\api\auth\logout mkdir app\api\auth\logout

echo ✅ Directories created successfully!
echo.
echo 📦 Installing dependencies...
call npm install

echo.
echo 🔧 Initializing Prisma...
call npx prisma init

echo.
echo ✅ Setup completed!
echo.
echo 📋 Next steps:
echo 1. Update DATABASE_URL in .env.local with your PostgreSQL connection string
echo 2. Copy the Prisma schema files (see SETUP.md for details)
echo 3. Run: npx prisma migrate dev --name init
echo 4. Run: npm run dev
echo.
pause
