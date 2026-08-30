import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
});

import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";

/* =========================================================
   FIREBASE ADMIN
========================================================= */

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS belum diset");
}

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: applicationDefault(),
        projectId: "noir-dasboard",
      });

const db = getFirestore(app);

/* =========================================================
   CAFE
========================================================= */

const cafe = {
  id: "black-lounge",
  name: "Black Lounge Cafe",
  email: "playbox.blacklounge@gmail.com",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/* =========================================================
   DEVICES
========================================================= */

const devices = [
  {
    id: "PS01",
    name: "BL-BOXPS01",
    tuyaDeviceId: "a3849b95d0acfacbe65lht",
    cafeId: "black-lounge",
    brand: "BARDI",
    model: "Smart Plug",
    type: "SMART_PLUG",
    active: true,
  },
  {
    id: "PS02",
    name: "BL-PSBOX02",
    tuyaDeviceId: "a32d3ce3799396b22adjmw",
    cafeId: "black-lounge",
    brand: "BARDI",
    model: "Smart Plug",
    type: "SMART_PLUG",
    active: true,
  },
  {
    id: "PS03",
    name: "BL-PSBOX03",
    tuyaDeviceId: "a38297ad04f1f774ea5v45",
    cafeId: "black-lounge",
    brand: "BARDI",
    model: "Smart Plug",
    type: "SMART_PLUG",
    active: true,
  },
  {
    id: "PS04",
    name: "BL-PSBOX04",
    tuyaDeviceId: "a33f87ac29df76e537wbqh",
    cafeId: "black-lounge",
    brand: "BARDI",
    model: "Smart Plug",
    type: "SMART_PLUG",
    active: true,
  },
  {
    id: "PS05",
    name: "BL-PSBOX05",
    tuyaDeviceId: "a3040db2a1d364439cet8b",
    cafeId: "black-lounge",
    brand: "BARDI",
    model: "Smart Plug",
    type: "SMART_PLUG",
    active: true,
  },
];

/* =========================================================
   PACKAGES
========================================================= */

const packages = [
  {
    id: "1h",
    name: "1 Jam",
    durationMinutes: 60,
    durationSeconds: 3600,
    price: 12000,
    saving: 0,
    active: true,
    sortOrder: 1,
  },
  {
    id: "2h",
    name: "2 Jam",
    durationMinutes: 120,
    durationSeconds: 7200,
    price: 22000,
    saving: 2000,
    active: true,
    sortOrder: 2,
  },
  {
    id: "3h",
    name: "3 Jam",
    durationMinutes: 180,
    durationSeconds: 10800,
    price: 30000,
    saving: 6000,
    active: true,
    sortOrder: 3,
  },
  {
    id: "5h",
    name: "5 Jam",
    durationMinutes: 300,
    durationSeconds: 18000,
    price: 45000,
    saving: 15000,
    active: true,
    sortOrder: 4,
  },
  {
    id: "10h",
    name: "10 Jam",
    durationMinutes: 600,
    durationSeconds: 36000,
    price: 80000,
    saving: 40000,
    active: true,
    sortOrder: 5,
  },
];

/* =========================================================
   SEED
========================================================= */

async function seed() {
  console.log("");
  console.log("=================================");
  console.log("🔥 NOIR PLAYBOX FIREBASE SEED");
  console.log("=================================");
  console.log("");

  /* =======================================================
     CAFE
  ======================================================= */

  console.log("🏪 Creating cafe...");

  await db.collection("cafes").doc(cafe.id).set(cafe, {
    merge: true,
  });

  console.log(`✅ Cafe: ${cafe.name}`);

  /* =======================================================
     DEVICES
  ======================================================= */

  console.log("");
  console.log("🎮 Creating devices...");

  for (const device of devices) {
    await db
      .collection("devices")
      .doc(device.id)
      .set(
        {
          ...device,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          merge: true,
        },
      );

    console.log(`✅ ${device.id} → ${device.name} → ${device.tuyaDeviceId}`);
  }

  /* =======================================================
     PACKAGES
  ======================================================= */

  console.log("");
  console.log("📦 Creating packages...");

  for (const pkg of packages) {
    await db
      .collection("packages")
      .doc(pkg.id)
      .set(
        {
          ...pkg,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          merge: true,
        },
      );

    console.log(`✅ ${pkg.name} → Rp${pkg.price.toLocaleString("id-ID")}`);
  }

  /* =======================================================
     DONE
  ======================================================= */

  console.log("");
  console.log("=================================");
  console.log("🎉 SEED SELESAI");
  console.log("=================================");
  console.log("");

  console.log("Collections:");
  console.log("📁 cafes");
  console.log("📁 devices");
  console.log("📁 packages");
  console.log("");

  process.exit(0);
}

seed().catch((error) => {
  console.error("");
  console.error("❌ SEED ERROR");
  console.error(error);
  process.exit(1);
});
