import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function operatorContext(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const decoded = await adminAuth.verifyIdToken(header.slice(7).trim());
  const snap = await adminDb.collection("users").doc(decoded.uid).get();
  if (!snap.exists) throw new Error("PROFILE_NOT_FOUND");
  const user = snap.data() || {};
  const cafeId = String(user.cafeId || user.cafe_id || "").trim();
  if (!cafeId) throw new Error("CAFE_NOT_FOUND");
  return { decoded, user, cafeId };
}

export async function POST(request: NextRequest) {
  try {
    const { decoded, user, cafeId } = await operatorContext(request);
    const body = await request.json();
    const action = String(body?.action || "").trim();
    const status = String(body?.status || "").trim();
    if (!action || !status) {
      return NextResponse.json({ success: false, error: "action dan status wajib diisi." }, { status: 400 });
    }

    const ref = adminDb.collection("cafes").doc(cafeId).collection("operatorAuditLogs").doc();
    await ref.set({
      action,
      status,
      deviceId: body?.deviceId || null,
      message: body?.message || null,
      metadata: body?.metadata || {},
      uid: decoded.uid,
      email: decoded.email || null,
      operatorName: user.name || user.displayName || null,
      role: user.role || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
