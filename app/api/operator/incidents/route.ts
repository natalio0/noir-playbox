import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const header = request.headers.get("authorization") || "";
    if (!header.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(header.slice(7).trim());
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ success: false, error: "Profil operator tidak ditemukan." }, { status: 403 });
    }
    const user = userSnap.data() || {};
    const cafeId = String(user.cafeId || user.cafe_id || "").trim();
    if (!cafeId) {
      return NextResponse.json({ success: false, error: "Cafe operator tidak ditemukan." }, { status: 403 });
    }

    const body = await request.json();
    const type = String(body?.type || "").trim();
    const deviceId = String(body?.deviceId || "").trim().toUpperCase();
    if (!type || !deviceId) {
      return NextResponse.json({ success: false, error: "type dan deviceId wajib diisi." }, { status: 400 });
    }

    const ref = adminDb.collection("cafes").doc(cafeId).collection("operatorIncidents").doc();
    await ref.set({
      type,
      deviceId,
      sessionId: body?.sessionId || null,
      message: body?.message || null,
      status: "OPEN",
      uid: decoded.uid,
      email: decoded.email || null,
      role: user.role || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    console.error("[operator/incidents]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
