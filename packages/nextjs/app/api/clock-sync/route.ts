import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const HARDHAT_DIR = path.join(process.cwd(), "..", "hardhat");

async function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: HARDHAT_DIR,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", data => {
      stdout += data.toString();
    });

    child.stderr.on("data", data => {
      stderr += data.toString();
    });

    child.on("close", code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout));
      }
    });

    child.on("error", err => {
      reject(err);
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawSeconds = body.seconds || 3600;

    // Sanitize seconds to prevent command injection
    const seconds = rawSeconds.toString();
    if (!/^\d+$/.test(seconds)) {
      return NextResponse.json({ error: "Invalid seconds format" }, { status: 400 });
    }

    console.log(`[clock-sync] Advancing blockchain time by ${seconds} seconds`);

    await runCommand("npx", ["hardhat", "run", "scripts/advance-time.ts", seconds, "--network", "localhost"]);

    return NextResponse.json({
      success: true,
      message: `Advanced time by ${seconds} seconds`,
    });
  } catch (error: unknown) {
    console.error("[clock-sync] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to sync clock";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Clock sync endpoint - POST with { seconds: number }" });
}
