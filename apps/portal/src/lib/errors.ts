import { NextResponse } from 'next/server';

export const asApiError = (msg: string, code = 500, detail?: string) =>
  NextResponse.json({ error: msg, detail }, { status: code });
