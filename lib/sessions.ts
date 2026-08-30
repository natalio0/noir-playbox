import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  addDoc,
} from "firebase/firestore";

import { db } from "./firebase";

export async function startSession(deviceId: string) {
  const sessionsRef = collection(db, "sessions");

  const existingQuery = query(
    sessionsRef,
    where("deviceId", "==", deviceId),
    where("status", "==", "ACTIVE"),
  );

  const existingSnapshot = await getDocs(existingQuery);

  if (!existingSnapshot.empty) {
    return;
  }

  await addDoc(sessionsRef, {
    deviceId,
    startedAt: serverTimestamp(),
    endedAt: null,
    durationSeconds: 0,
    status: "ACTIVE",
  });
}

export async function endSession(deviceId: string) {
  const sessionsRef = collection(db, "sessions");

  const activeQuery = query(
    sessionsRef,
    where("deviceId", "==", deviceId),
    where("status", "==", "ACTIVE"),
  );

  const snapshot = await getDocs(activeQuery);

  if (snapshot.empty) {
    return;
  }

  const sessionDoc = snapshot.docs[0];

  const data = sessionDoc.data();

  const startedAt = data.startedAt?.toDate();

  if (!startedAt) {
    return;
  }

  const endedAt = new Date();

  const durationSeconds = Math.floor(
    (endedAt.getTime() - startedAt.getTime()) / 1000,
  );

  await updateDoc(doc(db, "sessions", sessionDoc.id), {
    endedAt,
    durationSeconds,
    status: "COMPLETED",
  });
}
