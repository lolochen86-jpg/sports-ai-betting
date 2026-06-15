import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authStore } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, preferredLeague, favoriteTeams } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: '所有欄位均為必填' },
        { status: 400 }
      );
    }

    // Register user in store (either DB or Memory fallback)
    const user = await authStore.registerUser(
      email,
      password,
      name,
      preferredLeague,
      favoriteTeams
    );

    // Save session in HttpOnly Cookie
    const cookieStore = await cookies();
    cookieStore.set('session', JSON.stringify(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      data: user,
      message: '註冊成功！',
    });
  } catch (error) {
    console.error('Register API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '註冊失敗，請重試' },
      { status: 400 }
    );
  }
}
