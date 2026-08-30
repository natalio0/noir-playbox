import { NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase-admin";
import { getServerUserProfile } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization) {
      return NextResponse.json(
        {
          success: false,
          error: "Authorization token tidak ditemukan.",
        },
        { status: 401 },
      );
    }

    if (!authorization.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Format authorization token tidak valid.",
        },
        { status: 401 },
      );
    }

    const idToken = authorization.substring(7);

    const decodedToken = await adminAuth.verifyIdToken(idToken);

    const uid = decodedToken.uid;

    console.log("🔥 VERIFIED UID:", uid);

    const profile = await getServerUserProfile(uid);

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error: "Profile user tidak ditemukan.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("PROFILE API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Gagal mengambil profile.",
      },
      { status: 500 },
    );
  }
}
