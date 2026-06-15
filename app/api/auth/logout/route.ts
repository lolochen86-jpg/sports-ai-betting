import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // Clear session cookie
    cookieStore.delete('session');

    return NextResponse.json({
      success: true,
      message: '成功登出',
    });
  } catch (error) {
    console.error('Logout API error:', error);
    return NextResponse.json(
      { success: false, error: '登出失敗' },
      { status: 500 }
    );
  }
}
