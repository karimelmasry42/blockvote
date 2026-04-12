import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(request: NextRequest): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const existing = requestCounts.get(ip);

  if (!existing || existing.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  existing.count += 1;
  return false;
}

export async function POST(request: NextRequest) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const pinataJWT = process.env.PINATA_JWT;

  if (!pinataJWT) {
    console.error("[pinata/upload] PINATA_JWT environment variable is not set");
    return NextResponse.json({ error: "IPFS upload service is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { data } = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      { pinataContent: body },
      {
        headers: { Authorization: `Bearer ${pinataJWT}` },
        timeout: 30_000,
      },
    );

    console.log("[pinata/upload] Successfully pinned to IPFS:", data.IpfsHash);
    return NextResponse.json({ ipfsHash: data.IpfsHash });
  } catch (err: any) {
    const status = err?.response?.status;
    const pinataMessage = err?.response?.data?.error || err?.message || "Unknown error";

    console.error("[pinata/upload] Pinata API error:", { status, message: pinataMessage });

    if (status === 401) {
      return NextResponse.json({ error: "IPFS upload authentication failed — check PINATA_JWT" }, { status: 502 });
    }

    return NextResponse.json({ error: `IPFS upload failed: ${pinataMessage}` }, { status: 502 });
  }
}
