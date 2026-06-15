import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authStore } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: '請輸入電子信箱與密碼' },
        { status: 400 }
      );
    }

    // Validate user credentials via store
    const user = await authStore.validateUser(email, password);

    if (!user) {
      return NextResponse.json(
        { success: false, error: '電子信箱或密碼錯誤' },
        { status: 401 }
      );
    }

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
      message: '登入成功！',
    });
  } catch (error) {
    console.error('Signin API error:', error);
    return NextResponse.json(
      { success: false, error: '登入失敗，伺服器錯誤' },
      { status: 500 }
    );
  }
}
