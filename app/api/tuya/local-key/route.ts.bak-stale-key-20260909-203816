import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../lib/firebase-admin";
import { getTuyaDeviceDetail } from "../../../../lib/tuya-openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = header.slice(7).trim();
  if (!token) throw new Error("UNAUTHORIZED");
  return adminAuth.verifyIdToken(token);
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();

    const cafeId = String(body?.cafeId || "").trim();
    const tuyaDeviceId = String(body?.tuyaDeviceId || "").trim();
    const logicalDeviceId = String(body?.logicalDeviceId || "").trim().toUpperCase();
    const protocolVersion = String(body?.protocolVersion || "").trim();
    const ipAddress = String(body?.ipAddress || "").trim();

    if (!cafeId) return error("cafeId wajib diisi.");
    if (!tuyaDeviceId) return error("tuyaDeviceId wajib diisi.");

    // Never trust cafeId supplied by the client. Resolve operator ownership from Firestore.
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) return error("Profil operator tidak ditemukan.", 403);

    const user = userDoc.data() || {};
    const role = String(user.role || "").toLowerCase();
    const operatorCafeId = String(user.cafeId || user.cafe_id || "").trim();

    if (role !== "operational") return error("Akun bukan operational.", 403);
    if (!operatorCafeId || operatorCafeId !== cafeId) {
      return error("Operator tidak memiliki akses ke cafe ini.", 403);
    }

    const registryRef = adminDb
      .collection("cafes")
      .doc(cafeId)
      .collection("tuyaDevices")
      .doc(tuyaDeviceId);

    // Fast path: use existing secret and avoid unnecessary Tuya Cloud calls.
    const existing = await registryRef.get();
    const existingData = existing.data() || {};
    const existingKey = String(existingData.localKey || existingData.local_key || "").trim();
    if (existingKey) {
      return NextResponse.json({
        success: true,
        source: "firestore",
        device: {
          tuyaDeviceId,
          localKey: existingKey,
          logicalDeviceId: existingData.logicalDeviceId || logicalDeviceId || null,
          name: existingData.name || null,
          protocolVersion: existingData.protocolVersion || protocolVersion || null,
          switchDps: Number(existingData.switchDps || 1),
        },
      });
    }

    const detail = await getTuyaDeviceDetail(tuyaDeviceId);
    if (!detail.local_key) return error("Tuya tidak mengembalikan local key.", 502);

    const registryData = {
      tuyaDeviceId,
      localKey: detail.local_key,
      name: detail.name || `Tuya ${tuyaDeviceId.slice(-6)}`,
      logicalDeviceId: logicalDeviceId || null,
      protocolVersion: protocolVersion || null,
      switchDps: 1,
      lastKnownIp: ipAddress || null,
      source: "tuya-cloud",
      syncedByUid: decoded.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await registryRef.set(registryData, { merge: true });

    return NextResponse.json({
      success: true,
      source: "tuya-cloud",
      device: registryData,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "UNAUTHORIZED") return error("Firebase login diperlukan.", 401);
    console.error("[tuya/local-key]", e);
    return error(message, 500);
  }
}
