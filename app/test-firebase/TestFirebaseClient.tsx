"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { startSession, endSession } from "@/lib/sessions";

export default function TestFirebaseClient() {
  const [status, setStatus] = useState("Loading...");
  const [lastChanged, setLastChanged] = useState("");

  useEffect(() => {
    const deviceRef = doc(db, "devices", "PS01");

    const unsubscribe = onSnapshot(
      deviceRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setStatus("DEVICE NOT FOUND");
          return;
        }

        const data = snapshot.data();

        setStatus(data.status ?? "UNKNOWN");

        if (data.lastChangedAt) {
          setLastChanged(data.lastChangedAt.toDate().toLocaleString("id-ID"));
        }
      },
      (error) => {
        console.error(error);
        setStatus("ERROR");
      },
    );

    return () => unsubscribe();
  }, []);

  async function toggleDevice() {
    try {
      const deviceRef = doc(db, "devices", "PS01");

      const newStatus = status === "ON" ? "OFF" : "ON";

      // Update device
      await updateDoc(deviceRef, {
        status: newStatus,
        lastChangedAt: new Date(),
      });

      // Start / end session
      if (newStatus === "ON") {
        await startSession("PS01");
      } else {
        await endSession("PS01");
      }
    } catch (error) {
      console.error("Toggle error:", error);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Firebase Test</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">PS01</h1>

          {/* Status */}
          <div className="mt-8">
            <p className="text-sm text-slate-500">Current Status</p>

            <p
              className={`mt-2 text-4xl font-bold ${
                status === "ON"
                  ? "text-emerald-500"
                  : status === "OFF"
                    ? "text-slate-400"
                    : "text-red-500"
              }`}
            >
              {status}
            </p>
          </div>

          {/* Last Changed */}
          <div className="mt-6">
            <p className="text-sm text-slate-500">Last Changed</p>

            <p className="mt-1 text-sm font-medium text-slate-700">
              {lastChanged || "-"}
            </p>
          </div>

          {/* Toggle */}
          <button
            onClick={toggleDevice}
            className="mt-8 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Toggle PS01
          </button>
        </div>
      </div>
    </div>
  );
}
