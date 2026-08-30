import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const deviceId = searchParams.get("deviceId");

    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: "deviceId wajib diisi",
        },
        { status: 400 },
      );
    }

    console.log("=================================");
    console.log("🔥 GET ACTIVE SESSION");
    console.log("DEVICE:", deviceId);
    console.log("=================================");

    /* =====================================================
       GET SESSION
    ===================================================== */

    const sessionsSnapshot = await adminDb
      .collection("sessions")
      .where("deviceId", "==", deviceId)
      .get();

    /* =====================================================
       FIND ACTIVE SESSION
    ===================================================== */

    const activeDocs = sessionsSnapshot.docs
      .filter((sessionDoc) => {
        const data = sessionDoc.data();

        return data.status === "ACTIVE";
      })
      .sort((a, b) => {
        const aData = a.data();
        const bData = b.data();

        const aTime = aData.startedAt?.toMillis?.() ?? 0;
        const bTime = bData.startedAt?.toMillis?.() ?? 0;

        return bTime - aTime;
      });

    /* =====================================================
       NO ACTIVE SESSION
    ===================================================== */

    if (activeDocs.length === 0) {
      console.log("NO ACTIVE SESSION");

      return NextResponse.json({
        success: true,
        active: false,
        session: null,
        packages: [],
      });
    }

    /* =====================================================
       GET ACTIVE SESSION
    ===================================================== */

    const sessionDoc = activeDocs[0];

    const sessionId = sessionDoc.id;

    const sessionData = sessionDoc.data();

    console.log("=================================");
    console.log("🔥 ACTIVE SESSION FOUND");
    console.log("SESSION:", sessionId);
    console.log("DEVICE:", sessionData.deviceId);
    console.log("STATUS:", sessionData.status);
    console.log("=================================");

    /* =====================================================
       GET PACKAGES

       sessions/{sessionId}/packages
    ===================================================== */

    const packagesSnapshot = await adminDb
      .collection("sessions")
      .doc(sessionId)
      .collection("packages")
      .get();

    const packages = packagesSnapshot.docs
      .map((packageDoc) => {
        const packageData = packageDoc.data();

        return {
          id: packageDoc.id,

          name: String(packageData.name ?? ""),

          durationMinutes: Number(packageData.durationMinutes ?? 0),

          durationSeconds: Number(
            packageData.durationSeconds ??
              Number(packageData.durationMinutes ?? 0) * 60,
          ),

          price: Number(packageData.price ?? 0),

          type:
            packageData.type === "ADD_TIME"
              ? "ADD_TIME"
              : packageData.type === "INITIAL"
                ? "INITIAL"
                : "UNKNOWN",

          addedAt: packageData.addedAt?.toDate?.()
            ? packageData.addedAt.toDate().toISOString()
            : null,
        };
      })
      .sort((a, b) => {
        const aTime = a.addedAt ? new Date(a.addedAt).getTime() : 0;

        const bTime = b.addedAt ? new Date(b.addedAt).getTime() : 0;

        return aTime - bTime;
      });

    /* =====================================================
       CALCULATE TOTAL
    ===================================================== */

    let totalMinutes = 0;

    let totalPrice = 0;

    for (const pkg of packages) {
      totalMinutes += pkg.durationMinutes;
      totalPrice += pkg.price;
    }

    /* =====================================================
       SESSION OBJECT
    ===================================================== */

    const session = {
      id: sessionId,

      deviceId: String(sessionData.deviceId ?? deviceId),

      status: sessionData.status === "COMPLETED" ? "COMPLETED" : "ACTIVE",

      startedAt: sessionData.startedAt?.toDate?.()
        ? sessionData.startedAt.toDate().toISOString()
        : null,

      endedAt: sessionData.endedAt?.toDate?.()
        ? sessionData.endedAt.toDate().toISOString()
        : null,

      totalMinutes,

      totalPrice,
    };

    /* =====================================================
       LOG
    ===================================================== */

    console.log("=================================");
    console.log("🔥 ACTIVE SESSION FOUND");
    console.log("SESSION:", sessionId);
    console.log("PACKAGES:", packages.length);
    console.log("TOTAL MINUTES:", totalMinutes);
    console.log("TOTAL PRICE:", totalPrice);
    console.log("=================================");

    /* =====================================================
       RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,

      active: true,

      session,

      packages,
    });
  } catch (error) {
    console.error("=================================");
    console.error("🔥 GET ACTIVE SESSION ERROR");
    console.error(error);
    console.error("=================================");

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Gagal mengambil active session",
      },
      { status: 500 },
    );
  }
}
