import { NextRequest, NextResponse } from "next/server";

import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      sessionId: string;
    }>;
  },
) {
  try {
    const { sessionId } = await context.params;

    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: "sessionId wajib diisi",
        },
        {
          status: 400,
        },
      );
    }

    console.log("=================================");
    console.log("🔥 COMPLETE SESSION");
    console.log("SESSION:", sessionId);
    console.log("=================================");

    /* =====================================================
       SESSION
    ===================================================== */

    const sessionRef = adminDb.collection("sessions").doc(sessionId);

    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Session tidak ditemukan",
        },
        {
          status: 404,
        },
      );
    }

    const session = sessionSnapshot.data();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: "Data session kosong",
        },
        {
          status: 404,
        },
      );
    }

    /* =====================================================
       DOUBLE COMPLETE
    ===================================================== */

    if (session.status === "COMPLETED") {
      return NextResponse.json({
        success: true,

        alreadyCompleted: true,

        sessionId,

        status: "COMPLETED",

        totalMinutes: Number(session.totalMinutes ?? 0),

        totalPrice: Number(session.totalPrice ?? 0),

        endedAt:
          session.endedAt instanceof Timestamp
            ? session.endedAt.toDate().toISOString()
            : session.endedAt?.toDate
              ? session.endedAt.toDate().toISOString()
              : null,
      });
    }

    /* =====================================================
       GET PACKAGES
    ===================================================== */

    const packagesSnapshot = await adminDb
      .collection("sessions")
      .doc(sessionId)
      .collection("packages")
      .orderBy("addedAt", "asc")
      .get();

    /* =====================================================
       CALCULATE TOTAL
    ===================================================== */

    let totalMinutes = 0;

    let totalPrice = 0;

    const packages = packagesSnapshot.docs.map((packageDoc) => {
      const packageData = packageDoc.data();

      const durationMinutes = Number(packageData.durationMinutes ?? 0);

      const price = Number(packageData.price ?? 0);

      totalMinutes += durationMinutes;

      totalPrice += price;

      return {
        id: packageDoc.id,

        name: String(packageData.name ?? ""),

        durationMinutes,

        durationSeconds: Number(
          packageData.durationSeconds ?? durationMinutes * 60,
        ),

        price,

        type: packageData.type === "INITIAL" ? "INITIAL" : "ADD_TIME",

        addedAt: packageData.addedAt?.toDate
          ? packageData.addedAt.toDate().toISOString()
          : null,
      };
    });

    /* =====================================================
       END SESSION
    ===================================================== */

    const endedAt = Timestamp.now();

    await sessionRef.update({
      status: "COMPLETED",

      endedAt,

      totalMinutes,

      totalPrice,

      updatedAt: endedAt,
    });

    /* =====================================================
       LOG
    ===================================================== */

    console.log("=================================");
    console.log("🔥 SESSION COMPLETED");
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

      sessionId,

      status: "COMPLETED",

      startedAt: session.startedAt?.toDate
        ? session.startedAt.toDate().toISOString()
        : null,

      endedAt: endedAt.toDate().toISOString(),

      totalMinutes,

      totalPrice,

      packageCount: packages.length,

      packages,
    });
  } catch (error) {
    console.error("=================================");
    console.error("🔥 COMPLETE SESSION ERROR");
    console.error(error);
    console.error("=================================");

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Gagal menyelesaikan session",
      },
      {
        status: 500,
      },
    );
  }
}
