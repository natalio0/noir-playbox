import { NextResponse } from "next/server";
import { getTuyaDeviceState } from "@/lib/tuya";

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const deviceId = process.env.TUYA_DEVICE_ID;

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: "TUYA_DEVICE_ID belum diatur",
        },
        { status: 500 },
      );
    }

    const state = await getTuyaDeviceState(deviceId);

    return NextResponse.json({
      success: true,
      device: {
        id: deviceId,
        name: "PS01",
        status: state.switch ? "ON" : "OFF",
        switch: state.switch,
        countdown: state.countdown,
        power: state.power,
        current: state.current,
        voltage: state.voltage,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("TUYA STATE ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
