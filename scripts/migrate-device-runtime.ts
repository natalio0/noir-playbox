import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const [{ adminDb }, runtimeHelpers] = await Promise.all([
    import("../lib/firebase-admin"),
    import("../lib/device-runtime"),
  ]);

  const { createEmptyDeviceRuntime, deviceRuntimeRef } = runtimeHelpers;
  const devices = await adminDb.collection("devices").get();

  let created = 0;
  let skipped = 0;

  for (const deviceDoc of devices.docs) {
    const data = deviceDoc.data();
    const deviceId = String(data.deviceId ?? deviceDoc.id).trim().toUpperCase();
    const cafeId = typeof data.cafeId === "string" ? data.cafeId : null;
    const runtimeRef = deviceRuntimeRef(deviceId);
    const existingRuntime = await runtimeRef.get();

    if (existingRuntime.exists) {
      console.log(`${deviceId}: runtime sudah ada, skip`);
      skipped += 1;
      continue;
    }

    const [activeSession, preparing, activeShutdown, pendingShutdown] =
      await Promise.all([
        adminDb
          .collection("sessions")
          .where("deviceId", "==", deviceId)
          .where("status", "==", "ACTIVE")
          .limit(1)
          .get(),
        adminDb
          .collection("preparing_sessions")
          .where("deviceId", "==", deviceId)
          .where("status", "==", "PREPARING")
          .limit(1)
          .get(),
        adminDb
          .collection("shutdown_sessions")
          .where("deviceId", "==", deviceId)
          .where("status", "==", "SHUTDOWN_ACTIVE")
          .limit(1)
          .get(),
        adminDb
          .collection("shutdown_sessions")
          .where("deviceId", "==", deviceId)
          .where("status", "==", "SHUTDOWN_PENDING")
          .limit(1)
          .get(),
      ]);

    const runtime = createEmptyDeviceRuntime(deviceId, cafeId);

    if (!activeSession.empty) {
      const doc = activeSession.docs[0];
      const session = doc.data();
      runtime.activeSessionId = doc.id;
      runtime.sessionStartedAt = session.startedAt ?? null;
      runtime.sessionTotalMinutes = Number(session.totalMinutes ?? 0);
      runtime.sessionTotalPrice = Number(session.totalPrice ?? 0);
    }

    if (!preparing.empty) {
      const doc = preparing.docs[0];
      const preparingData = doc.data();
      runtime.preparingId = doc.id;
      runtime.preparingStartedAt = preparingData.startedAt ?? null;
    }

    const shutdownDoc = !activeShutdown.empty
      ? activeShutdown.docs[0]
      : !pendingShutdown.empty
        ? pendingShutdown.docs[0]
        : null;

    if (shutdownDoc) {
      const shutdown = shutdownDoc.data();
      runtime.shutdownId = shutdownDoc.id;
      runtime.shutdownStatus =
        shutdown.status === "SHUTDOWN_ACTIVE"
          ? "SHUTDOWN_ACTIVE"
          : "SHUTDOWN_PENDING";
      runtime.shutdownStartedAt = shutdown.startedAt ?? null;
      runtime.sourceSessionId =
        typeof shutdown.sourceSessionId === "string"
          ? shutdown.sourceSessionId
          : null;
    }

    try {
      await runtimeRef.create(runtime);
      console.log(`${deviceId}: runtime dibuat`);
      created += 1;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";

      if (code === "6" || code === "already-exists") {
        console.log(`${deviceId}: runtime dibuat proses lain, skip`);
        skipped += 1;
        continue;
      }

      throw error;
    }
  }

  console.log(`Selesai. created=${created}, skipped=${skipped}`);
}

main().catch((error) => {
  console.error("MIGRATE DEVICE RUNTIME FAILED:", error);
  process.exitCode = 1;
});
