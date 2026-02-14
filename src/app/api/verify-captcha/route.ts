import { NextRequest, NextResponse } from 'next/server';

// NOTE: hCaptcha secret key is intentionally hardcoded per user requirements
// hCaptcha secret key (hardcoded for reliability)
const HCAPTCHA_SECRET = "ES_5755497d80cc4b25a4264cc64208ffaa";

// ── hCaptcha verification ───────────────────────────────────────
async function verifyCaptcha(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${HCAPTCHA_SECRET}&response=${token}`,
    });

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('hCaptcha verification failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const isValid = await verifyCaptcha(token);

    if (isValid) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid captcha' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error verifying captcha:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
