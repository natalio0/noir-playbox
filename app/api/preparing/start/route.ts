import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);

    const body = await request.json();
    const deviceId = String(body.deviceId || "").toUpperCase();

    if (!deviceId) {
      return Response.json(
        { success: false, error: "deviceId wajib diisi" },
        { status: 400 },
      );
    }

    const existing = await adminDb
      .collection("preparing_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "PREPARING")
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      const data = doc.data();

      return Response.json({
        success: true,
        preparing: {
          id: doc.id,
          deviceId: data.deviceId,
          status: data.status,
          startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
          activatedAt: null,
          endedAt: null,
          billingSessionId: null,
          operatorUid: data.operatorUid ?? null,
        },
      });
    }

    const ref = adminDb.collection("preparing_sessions").doc();

    await ref.set({
      deviceId,
      status: "PREPARING",
      startedAt: FieldValue.serverTimestamp(),
      activatedAt: null,
      endedAt: null,
      billingSessionId: null,

      operatorUid: user.uid,
      operatorEmail: user.email,

      cafeId: user.profile?.cafeId ?? null,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const created = await ref.get();
    const data = created.data()!;

    return Response.json({
      success: true,
      preparing: {
        id: ref.id,
        deviceId,
        status: "PREPARING",
        startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
        activatedAt: null,
        endedAt: null,
        billingSessionId: null,
        operatorUid: user.uid,
      },
    });
  } catch (error) {
    console.error("START PREPARING ERROR:", error);

    const message =
      error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
