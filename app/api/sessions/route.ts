import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { resolveRentalPackage } from "@/lib/rental-packages";
import { createPerfTrace } from "@/lib/perf-trace";
import {
  createEmptyDeviceRuntime,
  deviceRuntimeRef,
  parseDeviceRuntime,
  type DeviceRuntimeData,
} from "@/lib/device-runtime";

type PerfTrace = ReturnType<typeof createPerfTrace>;

async function hydrateRuntimeInsideTransaction(
  transaction: FirebaseFirestore.Transaction,
  trace: PerfTrace,
  deviceId: string,
  clientPreparingId: string,
): Promise<DeviceRuntimeData> {
  /*
   * Jalur ini hanya dipakai untuk device lama yang belum punya
   * device_runtime/{deviceId}. Setelah transaksi pertama sukses,
   * operasi berikutnya hanya membaca satu runtime document.
   */
  const deviceRef = adminDb.collection("devices").doc(deviceId);
  const deviceDoc = await trace.measure("tx.legacyDeviceRead", () =>
    transaction.get(deviceRef),
  );

  if (!deviceDoc.exists) {
    throw new Error("DEVICE_NOT_FOUND");
  }

  const deviceData = deviceDoc.data()!;
  const cafeId = typeof deviceData.cafeId === "string" ? deviceData.cafeId : "";

  if (!cafeId) {
    throw new Error("DEVICE_CAFE_MISSING");
  }

  const activeQuery = adminDb
    .collection("sessions")
    .where("deviceId", "==", deviceId)
    .where("status", "==", "ACTIVE")
    .limit(1);

  const activeShutdownQuery = adminDb
    .collection("shutdown_sessions")
    .where("deviceId", "==", deviceId)
    .where("status", "==", "SHUTDOWN_ACTIVE")
    .limit(1);

  const pendingShutdownQuery = adminDb
    .collection("shutdown_sessions")
    .where("deviceId", "==", deviceId)
    .where("status", "==", "SHUTDOWN_PENDING")
    .limit(1);

  const activeSnapshot = await trace.measure("tx.legacyActiveSession", () =>
    transaction.get(activeQuery),
  );
  const activeShutdownSnapshot = await trace.measure(
    "tx.legacyActiveShutdown",
    () => transaction.get(activeShutdownQuery),
  );
  const pendingShutdownSnapshot = await trace.measure(
    "tx.legacyPendingShutdown",
    () => transaction.get(pendingShutdownQuery),
  );

  let preparingDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  if (clientPreparingId) {
    preparingDoc = await trace.measure("tx.legacyPreparingDoc", () =>
      transaction.get(
        adminDb.collection("preparing_sessions").doc(clientPreparingId),
      ),
    );
  } else {
    const preparingQuery = adminDb
      .collection("preparing_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "PREPARING")
      .limit(1);

    const preparingSnapshot = await trace.measure(
      "tx.legacyPreparingQuery",
      () => transaction.get(preparingQuery),
    );

    preparingDoc = preparingSnapshot.empty ? null : preparingSnapshot.docs[0];
  }

  const activeSessionDoc = activeSnapshot.empty ? null : activeSnapshot.docs[0];
  const activeSessionData = activeSessionDoc?.data();
  const activeShutdownDoc = activeShutdownSnapshot.empty
    ? null
    : activeShutdownSnapshot.docs[0];
  const pendingShutdownDoc = pendingShutdownSnapshot.empty
    ? null
    : pendingShutdownSnapshot.docs[0];
  const shutdownDoc = activeShutdownDoc ?? pendingShutdownDoc;
  const shutdownData = shutdownDoc?.data();
  const preparingData = preparingDoc?.exists ? preparingDoc.data() : undefined;

  const runtime = createEmptyDeviceRuntime(deviceId, cafeId);

  runtime.activeSessionId = activeSessionDoc?.id ?? null;
  runtime.sessionStartedAt = activeSessionData?.startedAt ?? null;
  runtime.sessionTotalMinutes = Number(activeSessionData?.totalMinutes ?? 0);
  runtime.sessionTotalPrice = Number(activeSessionData?.totalPrice ?? 0);

  if (preparingDoc?.exists && preparingData?.status === "PREPARING") {
    runtime.preparingId = preparingDoc.id;
    runtime.preparingStartedAt = preparingData.startedAt ?? null;
  }

  if (shutdownDoc && shutdownData) {
    runtime.shutdownId = shutdownDoc.id;
    runtime.shutdownStatus =
      shutdownData.status === "SHUTDOWN_ACTIVE"
        ? "SHUTDOWN_ACTIVE"
        : "SHUTDOWN_PENDING";
    runtime.shutdownStartedAt = shutdownData.startedAt ?? null;
    runtime.sourceSessionId =
      typeof shutdownData.sourceSessionId === "string"
        ? shutdownData.sourceSessionId
        : null;
  }

  return runtime;
}

export async function POST(request: Request) {
  const trace = createPerfTrace("api.sessions.create");

  try {
    const user = await trace.measure("auth", () => requireUserFromRequest(request));
    const body = await trace.measure("requestJson", () => request.json());

    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();
    const clientPreparingId = String(body.preparingId ?? "").trim();
    const rentalPackage = resolveRentalPackage({
      packageId: body.packageId,
      name: body.packageName,
      durationMinutes: body.durationMinutes,
      price: body.price,
    });

    if (!deviceId) {
      return Response.json(
        { success: false, error: "deviceId wajib diisi" },
        { status: 400 },
      );
    }

    if (!rentalPackage) {
      return Response.json(
        {
          success: false,
          error: "Paket rental tidak valid. Gunakan paket resmi Noir Playbox.",
        },
        { status: 400 },
      );
    }

    const sessionRef = adminDb.collection("sessions").doc();
    const packageRef = sessionRef.collection("packages").doc();
    const runtimeRef = deviceRuntimeRef(deviceId);

    let cafeId = "";
    let preparingConverted = false;
    let runtimeHydrated = false;
    const startedAt = Timestamp.now();

    await trace.measure("firestoreTransaction", () =>
      adminDb.runTransaction(async (transaction) => {
        const runtimeSnapshot = await trace.measure("tx.runtimeRead", () =>
          transaction.get(runtimeRef),
        );

        let runtime = parseDeviceRuntime(deviceId, runtimeSnapshot.data());

        if (!runtime) {
          runtime = await hydrateRuntimeInsideTransaction(
            transaction,
            trace,
            deviceId,
            clientPreparingId,
          );
          runtimeHydrated = true;
        }

        cafeId = runtime.cafeId ?? "";

        if (!cafeId) {
          throw new Error("DEVICE_CAFE_MISSING");
        }

        if (
          user.profile.role === "operational" &&
          user.profile.cafeId !== cafeId
        ) {
          throw new Error("DEVICE_FORBIDDEN");
        }

        if (runtime.activeSessionId) {
          throw new Error("SESSION_ACTIVE");
        }

        if (runtime.shutdownStatus === "SHUTDOWN_ACTIVE") {
          throw new Error("SHUTDOWN_ACTIVE");
        }

        if (
          clientPreparingId &&
          runtime.preparingId &&
          clientPreparingId !== runtime.preparingId
        ) {
          throw new Error("PREPARING_MISMATCH");
        }

        if (clientPreparingId && !runtime.preparingId) {
          throw new Error("PREPARING_NOT_ACTIVE");
        }

        const resolvedPreparingId = runtime.preparingId;

        transaction.set(sessionRef, {
          deviceId,
          cafeId,
          status: "ACTIVE",
          startedAt,
          endedAt: null,
          totalMinutes: rentalPackage.durationMinutes,
          totalPrice: rentalPackage.price,
          operatorUid: user.uid,
          operatorEmail: user.email ?? null,
          createdAt: startedAt,
          updatedAt: startedAt,
        });

        transaction.set(packageRef, {
          packageId: rentalPackage.id,
          name: rentalPackage.name,
          durationMinutes: rentalPackage.durationMinutes,
          durationSeconds: rentalPackage.durationMinutes * 60,
          price: rentalPackage.price,
          type: "INITIAL",
          addedAt: startedAt,
        });

        if (runtime.shutdownStatus === "SHUTDOWN_PENDING" && runtime.shutdownId) {
          transaction.update(
            adminDb.collection("shutdown_sessions").doc(runtime.shutdownId),
            {
              status: "SHUTDOWN_SKIPPED_REUSED",
              endedAt: startedAt,
              updatedAt: startedAt,
            },
          );
        }

        if (resolvedPreparingId) {
          transaction.update(
            adminDb.collection("preparing_sessions").doc(resolvedPreparingId),
            {
              status: "CONVERTED_TO_BILLING",
              billingSessionId: sessionRef.id,
              activatedAt: startedAt,
              updatedAt: startedAt,
            },
          );

          preparingConverted = true;
        }

        transaction.set(
          runtimeRef,
          {
            ...runtime,
            schemaVersion: 1,
            deviceId,
            cafeId,

            preparingId: null,
            preparingStartedAt: null,

            activeSessionId: sessionRef.id,
            sessionStartedAt: startedAt,
            sessionTotalMinutes: rentalPackage.durationMinutes,
            sessionTotalPrice: rentalPackage.price,

            shutdownId: null,
            shutdownStatus: null,
            shutdownStartedAt: null,
            sourceSessionId: null,

            updatedAt: startedAt,
          },
          { merge: true },
        );
      }),
    );

    trace.finish("ok", { preparingConverted, runtimeHydrated });

    return Response.json({
      success: true,
      sessionId: sessionRef.id,
      cafeId,
      preparingConverted,
      session: {
        id: sessionRef.id,
        deviceId,
        status: "ACTIVE",
        startedAt: startedAt.toDate().toISOString(),
        endedAt: null,
        totalMinutes: rentalPackage.durationMinutes,
        totalPrice: rentalPackage.price,
      },
      package: {
        id: packageRef.id,
        packageId: rentalPackage.id,
        name: rentalPackage.name,
        durationMinutes: rentalPackage.durationMinutes,
        durationSeconds: rentalPackage.durationMinutes * 60,
        price: rentalPackage.price,
        type: "INITIAL",
        addedAt: startedAt.toDate().toISOString(),
      },
    });
  } catch (error) {
    trace.finish("error");
    const message = error instanceof Error ? error.message : "Gagal membuat session";

    if (message === "DEVICE_NOT_FOUND") {
      return Response.json(
        { success: false, error: "PlayBox belum terdaftar" },
        { status: 400 },
      );
    }

    if (message === "DEVICE_CAFE_MISSING") {
      return Response.json(
        { success: false, error: "PlayBox belum memiliki cafeId" },
        { status: 400 },
      );
    }

    if (message === "DEVICE_FORBIDDEN") {
      return Response.json(
        { success: false, error: "Tidak memiliki akses ke PlayBox ini" },
        { status: 403 },
      );
    }

    if (message === "SESSION_ACTIVE") {
      return Response.json(
        { success: false, error: "PlayBox masih memiliki session ACTIVE" },
        { status: 409 },
      );
    }

    if (message === "SHUTDOWN_ACTIVE") {
      return Response.json(
        {
          success: false,
          error: "Shutdown Mode masih aktif. Selesaikan shutdown terlebih dahulu.",
        },
        { status: 409 },
      );
    }

    if (message === "PREPARING_NOT_ACTIVE") {
      return Response.json(
        { success: false, error: "PREPARING sudah tidak aktif" },
        { status: 409 },
      );
    }

    if (message === "PREPARING_MISMATCH") {
      return Response.json(
        { success: false, error: "PREPARING tidak sesuai dengan PlayBox" },
        { status: 409 },
      );
    }

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
