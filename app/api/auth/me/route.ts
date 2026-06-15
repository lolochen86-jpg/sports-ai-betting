import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authStore } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;

    if (!sessionCookie) {
      return NextResponse.json({
        success: false,
        error: '未登入',
      });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    let sessionUser: any;
    try {
      sessionUser = JSON.parse(sessionCookie);
    } catch {
      return NextResponse.json({
        success: false,
        error: '無效會話',
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (!sessionUser?.email) {
      return NextResponse.json({
        success: false,
        error: '會話遺失電子信箱',
      });
    }

    // Always fetch the freshest profile from authStore (either DB or Memory fallback)
    const user = await authStore.getUserByEmail(sessionUser.email);

    if (!user) {
      return NextResponse.json({
        success: false,
        error: '找不到此使用者',
      });
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Auth Me API error:', error);
    return NextResponse.json(
      { success: false, error: '會話查詢失敗' },
      { status: 500 }
    );
  }
}
