// src/app/api/contact/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Webhook failed: ${errorText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in contact API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}