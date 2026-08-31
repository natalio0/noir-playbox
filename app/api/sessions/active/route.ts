import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { canAccessDevice, resolveRegisteredDevice } from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const deviceId = String(searchParams.get("deviceId") ?? "").trim().toUpperCase();
    const includePackages = searchParams.get("includePackages") === "1";

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId wajib diisi" }, { status: 400 });
    }

    const registered = await resolveRegisteredDevice(deviceId);
    if (!registered || !registered.active) {
      return NextResponse.json({ success: false, error: "PlayBox tidak ditemukan" }, { status: 404 });
    }
    if (!canAccessDevice(user.profile, registered)) {
      return NextResponse.json({ success: false, error: "Tidak memiliki akses ke device ini" }, { status: 403 });
    }

    const snapshot = await adminDb
      .collection("sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "ACTIVE")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ success: true, active: false, session: null, packages: [] });
    }

    const sessionDoc = snapshot.docs[0];
    const data = sessionDoc.data();

    let packages: Array<Record<string, unknown>> = [];
    if (includePackages) {
      const packageSnapshot = await sessionDoc.ref.collection("packages").get();
      packages = packageSnapshot.docs
        .map((packageDoc) => {
          const packageData = packageDoc.data();
          const addedAt = packageData.addedAt?.toDate?.() ?? null;
          return {
            id: packageDoc.id,
            name: String(packageData.name ?? ""),
            durationMinutes: Number(packageData.durationMinutes ?? 0),
            durationSeconds: Number(packageData.durationSeconds ?? Number(packageData.durationMinutes ?? 0) * 60),
            price: Number(packageData.price ?? 0),
            type: packageData.type === "ADD_TIME" ? "ADD_TIME" : packageData.type === "INITIAL" ? "INITIAL" : "UNKNOWN",
            addedAt: addedAt instanceof Date ? addedAt.toISOString() : null,
          };
        })
        .sort((a, b) => String(a.addedAt ?? "").localeCompare(String(b.addedAt ?? "")));
    }

    const session = {
      id: sessionDoc.id,
      deviceId: String(data.deviceId ?? deviceId),
      status: "ACTIVE" as const,
      startedAt: data.startedAt?.toDate?.() ? data.startedAt.toDate().toISOString() : null,
      endedAt: null,
      totalMinutes: Number(data.totalMinutes ?? 0),
      totalPrice: Number(data.totalPrice ?? 0),
    };

    return NextResponse.json({ success: true, active: true, session, packages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengambil active session";
    return NextResponse.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
