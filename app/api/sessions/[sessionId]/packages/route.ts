import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { resolveRentalPackage } from "@/lib/rental-packages";
import { canAccessSession } from "@/lib/session-access";
import { createPerfTrace } from "@/lib/perf-trace";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const trace = createPerfTrace("api.sessions.addPackage");

  try {
    const user = await trace.measure("auth", () => requireUserFromRequest(request));
    const { sessionId } = await trace.measure("params", () => context.params);

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId wajib diisi" },
        { status: 400 },
      );
    }

    const body = await trace.measure("requestJson", () => request.json());
    const rentalPackage = resolveRentalPackage({
      packageId: body.packageId,
      name: body.name,
      durationMinutes: body.durationMinutes,
      price: body.price,
    });

    if (!rentalPackage) {
      return NextResponse.json(
        {
          success: false,
          error: "Paket tambahan tidak valid. Gunakan paket resmi Noir Playbox.",
        },
        { status: 400 },
      );
    }

    const sessionRef = adminDb.collection("sessions").doc(sessionId);
    const packageRef = sessionRef.collection("packages").doc();
    const now = FieldValue.serverTimestamp();

    let newTotalMinutes = 0;
    let newTotalPrice = 0;

    await trace.measure("firestoreTransaction", () =>
      adminDb.runTransaction(async (transaction) => {
      const sessionSnapshot = await trace.measure("tx.sessionRead", () =>
        transaction.get(sessionRef),
      );

      if (!sessionSnapshot.exists) {
        throw new Error("SESSION_NOT_FOUND");
      }

      const sessionData = sessionSnapshot.data();

      if (!sessionData) {
        throw new Error("SESSION_NOT_FOUND");
      }

      if (!canAccessSession(user, sessionData)) {
        throw new Error("SESSION_FORBIDDEN");
      }

      if (sessionData.status !== "ACTIVE") {
        throw new Error("SESSION_NOT_ACTIVE");
      }

      newTotalMinutes =
        Number(sessionData.totalMinutes ?? 0) + rentalPackage.durationMinutes;
      newTotalPrice = Number(sessionData.totalPrice ?? 0) + rentalPackage.price;

      transaction.set(packageRef, {
        packageId: rentalPackage.id,
        name: rentalPackage.name,
        durationMinutes: rentalPackage.durationMinutes,
        durationSeconds: rentalPackage.durationMinutes * 60,
        price: rentalPackage.price,
        type: "ADD_TIME",
        addedAt: now,
      });

      transaction.update(sessionRef, {
        totalMinutes: newTotalMinutes,
        totalPrice: newTotalPrice,
        updatedAt: now,
      });
    }),
    );

    trace.finish("ok");

    return NextResponse.json({
      success: true,
      sessionId,
      packageId: packageRef.id,
      package: {
        id: packageRef.id,
        packageId: rentalPackage.id,
        name: rentalPackage.name,
        durationMinutes: rentalPackage.durationMinutes,
        durationSeconds: rentalPackage.durationMinutes * 60,
        price: rentalPackage.price,
        type: "ADD_TIME",
        addedAt: new Date().toISOString(),
      },
      session: {
        totalMinutes: newTotalMinutes,
        totalPrice: newTotalPrice,
      },
    });
  } catch (error) {
    trace.finish("error");
    const message = error instanceof Error ? error.message : "Gagal menyimpan package";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    if (message === "SESSION_FORBIDDEN") {
      return NextResponse.json(
        { success: false, error: "Tidak memiliki akses ke session ini" },
        { status: 403 },
      );
    }

    if (message === "SESSION_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Session tidak ditemukan" },
        { status: 404 },
      );
    }

    if (message === "SESSION_NOT_ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Session sudah tidak aktif" },
        { status: 409 },
      );
    }

    console.error("ADD PACKAGE ERROR:", error);

    return NextResponse.json(
      { success: false, error: "Gagal menyimpan package" },
      { status: 500 },
    );
  }
}
