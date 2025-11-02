// src/app/api/contact/route.ts
import { NextRequest, NextResponse } from "next/server";

interface ContactPayload {
  name: string;
  phone: string;
  locality: string;
  email?: string;
  message?: string;
  serviceType?: "design" | "maintenance" | string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<ContactPayload>;

    if (!body.name || !body.phone || !body.locality) {
      return NextResponse.json(
        { errors: { general: "Missing required fields: name, phone, locality." } },
        { status: 400 }
      );
    }

    const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: "Webhook URL not configured" }, { status: 500 });
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Webhook failed: ${errorText}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in contact API:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}