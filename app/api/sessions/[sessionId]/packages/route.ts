import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";

export async function POST(
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

    const body = await request.json();

    const { name, durationMinutes, durationSeconds, price } = body;

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "name wajib diisi",
        },
        {
          status: 400,
        },
      );
    }

    if (
      durationMinutes === undefined ||
      !Number.isFinite(Number(durationMinutes)) ||
      Number(durationMinutes) <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "durationMinutes tidak valid",
        },
        {
          status: 400,
        },
      );
    }

    if (
      price === undefined ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "price tidak valid",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       CHECK SESSION
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

    const sessionData = sessionSnapshot.data();

    if (!sessionData) {
      return NextResponse.json(
        {
          success: false,
          error: "Data session tidak ditemukan",
        },
        {
          status: 404,
        },
      );
    }

    /* =====================================================
       SESSION HARUS ACTIVE
    ===================================================== */

    if (sessionData.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: "Session sudah tidak aktif",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       CREATE PACKAGE
       
       sessions/{sessionId}/packages/{packageId}
    ===================================================== */

    const now = new Date();

    const packageRef = await sessionRef.collection("packages").add({
      name: String(name),

      durationMinutes: Number(durationMinutes),

      durationSeconds:
        durationSeconds !== undefined
          ? Number(durationSeconds)
          : Number(durationMinutes) * 60,

      price: Number(price),

      type: "ADD_TIME",

      addedAt: now,
    });

    /* =====================================================
       UPDATE SESSION TOTAL
    ===================================================== */

    const currentTotalMinutes = Number(sessionData.totalMinutes ?? 0);

    const currentTotalPrice = Number(sessionData.totalPrice ?? 0);

    const newTotalMinutes = currentTotalMinutes + Number(durationMinutes);

    const newTotalPrice = currentTotalPrice + Number(price);

    await sessionRef.update({
      totalMinutes: newTotalMinutes,

      totalPrice: newTotalPrice,

      updatedAt: now,
    });

    /* =====================================================
       LOG
    ===================================================== */

    console.log("=================================");

    console.log("🔥 PACKAGE ADDED");

    console.log("SESSION:", sessionId);

    console.log("PACKAGE:", packageRef.id);

    console.log("NAME:", name);

    console.log("DURATION:", Number(durationMinutes), "minutes");

    console.log("PRICE:", Number(price));

    console.log("TOTAL MINUTES:", newTotalMinutes);

    console.log("TOTAL PRICE:", newTotalPrice);

    console.log("=================================");

    /* =====================================================
       RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,

      sessionId,

      packageId: packageRef.id,

      package: {
        id: packageRef.id,

        name: String(name),

        durationMinutes: Number(durationMinutes),

        durationSeconds:
          durationSeconds !== undefined
            ? Number(durationSeconds)
            : Number(durationMinutes) * 60,

        price: Number(price),

        type: "ADD_TIME",

        addedAt: now.toISOString(),
      },

      session: {
        totalMinutes: newTotalMinutes,

        totalPrice: newTotalPrice,
      },
    });
  } catch (error) {
    console.error("=================================");

    console.error("🔥 ADD PACKAGE ERROR");

    console.error(error);

    console.error("=================================");

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error ? error.message : "Gagal menyimpan package",
      },
      {
        status: 500,
      },
    );
  }
}
