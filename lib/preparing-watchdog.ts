import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { resolveRegisteredDevice } from "@/lib/device-registry";
import {
  getDynamicTuyaState,
  sendTuyaStandardCommands,
} from "@/lib/tuya-cloud-dynamic";

const SUSPICIOUS_MINUTES = 60;
const CLAIM_STALE_MS = 2 * 60 * 1000;

type WatchdogResult = {
  checked: number;
  autoShutdown: number;
  failed: number;
  skipped: number;
  details: Array<{
    preparingId: string;
    deviceId: string;
    result: "AUTO_SHUTDOWN" | "TUYA_FAILED" | "VERIFY_FAILED" | "SKIPPED";
    message?: string;
  }>;
};

export async function runPreparingWatchdog(): Promise<WatchdogResult> {
  const snapshot = await adminDb
    .collection("preparing_sessions")
    .where("status", "==", "PREPARING")
    .get();

  const result: WatchdogResult = {
    checked: snapshot.size,
    autoShutdown: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const startedAtMs = data.startedAt?.toDate?.().getTime?.() ?? null;

    if (!startedAtMs) continue;
    const elapsedMinutes = Math.floor((Date.now() - startedAtMs) / 60_000);
    if (elapsedMinutes < SUSPICIOUS_MINUTES) continue;

    const claimed = await claimPreparing(doc.id);
    if (!claimed.ok) {
      result.skipped += 1;
      result.details.push({
        preparingId: doc.id,
        deviceId: String(data.deviceId ?? ""),
        result: "SKIPPED",
        message: claimed.reason,
      });
      continue;
    }

    try {
      const registered = await resolveRegisteredDevice(claimed.deviceId);
      if (!registered) throw new Error(`Device ${claimed.deviceId} belum terdaftar`);

      await sendTuyaStandardCommands(registered.tuyaDeviceId, [
        { code: "countdown_1", value: 0 },
        { code: "switch_1", value: false },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 1200));
      const state = await getDynamicTuyaState(registered.tuyaDeviceId);

      if (state.switch !== false) {
        await finalizeViolation(doc.id, claimed, elapsedMinutes, "VERIFY_FAILED",
          "Command diterima tetapi switch_1 masih ON setelah verifikasi");
        result.failed += 1;
        result.details.push({
          preparingId: doc.id,
          deviceId: claimed.deviceId,
          result: "VERIFY_FAILED",
          message: "switch_1 masih ON setelah command OFF",
        });
        continue;
      }

      await finalizeViolation(doc.id, claimed, elapsedMinutes, "SUCCESS", null);
      result.autoShutdown += 1;
      result.details.push({
        preparingId: doc.id,
        deviceId: claimed.deviceId,
        result: "AUTO_SHUTDOWN",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tuya auto shutdown gagal";
      await finalizeViolation(doc.id, claimed, elapsedMinutes, "FAILED", message);
      result.failed += 1;
      result.details.push({
        preparingId: doc.id,
        deviceId: claimed.deviceId,
        result: "TUYA_FAILED",
        message,
      });
    }
  }

  return result;
}

async function claimPreparing(preparingId: string) {
  const ref = adminDb.collection("preparing_sessions").doc(preparingId);

  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { ok: false as const, reason: "Preparing tidak ditemukan" };

    const data = snap.data()!;
    if (data.status !== "PREPARING")
      return { ok: false as const, reason: `Status sudah ${String(data.status)}` };
    if (data.billingSessionId)
      return { ok: false as const, reason: "Sudah memiliki billingSessionId" };

    const startedAtMs = data.startedAt?.toDate?.().getTime?.() ?? null;
    if (!startedAtMs)
      return { ok: false as const, reason: "startedAt belum tersedia" };

    const elapsedMinutes = Math.floor((Date.now() - startedAtMs) / 60_000);
    if (elapsedMinutes < SUSPICIOUS_MINUTES)
      return { ok: false as const, reason: "Belum mencapai 60 menit" };

    const claimMs = data.autoShutdownClaimedAt?.toDate?.().getTime?.() ?? null;
    if (claimMs && Date.now() - claimMs < CLAIM_STALE_MS)
      return { ok: false as const, reason: "Sedang diproses watchdog lain" };

    transaction.update(ref, {
      autoShutdownClaimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true as const,
      deviceId: String(data.deviceId ?? "").toUpperCase(),
      cafeId: typeof data.cafeId === "string" ? data.cafeId : null,
      operatorUid: typeof data.operatorUid === "string" ? data.operatorUid : null,
      operatorEmail: typeof data.operatorEmail === "string" ? data.operatorEmail : null,
    };
  });
}

async function finalizeViolation(
  preparingId: string,
  claimed: {
    deviceId: string;
    cafeId: string | null;
    operatorUid: string | null;
    operatorEmail: string | null;
  },
  elapsedMinutes: number,
  tuyaStatus: "SUCCESS" | "FAILED" | "VERIFY_FAILED",
  tuyaError: string | null,
) {
  const preparingRef = adminDb.collection("preparing_sessions").doc(preparingId);
  const auditRef = adminDb.collection("audit_logs").doc();
  const batch = adminDb.batch();

  batch.update(preparingRef, {
    status: "ENDED_WITHOUT_BILLING",
    endedAt: FieldValue.serverTimestamp(),
    durationMinutes: elapsedMinutes,
    riskLevel: "SUSPICIOUS",
    violation: true,
    violationType: "PREPARING_OVER_60_MINUTES",
    endReason: "AUTO_SHUTDOWN_VIOLATION",
    autoShutdown: true,
    autoShutdownTuyaStatus: tuyaStatus,
    autoShutdownTuyaError: tuyaError,
    autoShutdownCompletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(auditRef, {
    type: "PREPARING_SUSPICIOUS_AUTO_SHUTDOWN",
    violation: true,
    violationType: "PREPARING_OVER_60_MINUTES",
    preparingId,
    deviceId: claimed.deviceId,
    cafeId: claimed.cafeId,
    operatorUid: claimed.operatorUid,
    operatorEmail: claimed.operatorEmail,
    durationMinutes: elapsedMinutes,
    riskLevel: "SUSPICIOUS",
    action: "AUTO_SHUTDOWN_MONITOR",
    tuyaStatus,
    tuyaError,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
}
