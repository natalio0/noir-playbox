import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function GET(
  request: Request,
) {
  try {
    const user =
      await requireUserFromRequest(
        request,
      );

    if (
      user.profile?.role !==
      "admin"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Akses hanya untuk admin",
        },
        { status: 403 },
      );
    }

    const snapshot =
      await adminDb
        .collection("cafes")
        .get();

    const cafes =
      snapshot.docs
        .map((doc) => {
          const data =
            doc.data();

          return {
            id: doc.id,
            name: String(
              data.name ??
                doc.id,
            ),
            revenueShareNoir:
              Number(
                data.revenueShareNoir ??
                  70,
              ),
            revenueShareCafe:
              Number(
                data.revenueShareCafe ??
                  30,
              ),
            active:
              data.active !==
              false,
          };
        })
        .sort((a, b) =>
          a.name.localeCompare(
            b.name,
          ),
        );

    return Response.json({
      success: true,
      cafes,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: Request,
) {
  try {
    const user =
      await requireUserFromRequest(
        request,
      );

    if (
      user.profile?.role !==
      "admin"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Akses hanya untuk admin",
        },
        { status: 403 },
      );
    }

    const body =
      await request.json();

    const name =
      String(
        body.name ?? "",
      ).trim();

    const requestedId =
      String(
        body.cafeId ?? "",
      ).trim();

    const cafeId =
      requestedId ||
      slugify(name);

    const noirShare =
      Number(
        body.revenueShareNoir ??
          70,
      );

    const cafeShare =
      Number(
        body.revenueShareCafe ??
          30,
      );

    if (!name) {
      return Response.json(
        {
          success: false,
          error:
            "Nama cafe wajib diisi",
        },
        { status: 400 },
      );
    }

    if (!cafeId) {
      return Response.json(
        {
          success: false,
          error:
            "Cafe ID tidak valid",
        },
        { status: 400 },
      );
    }

    if (
      noirShare < 0 ||
      cafeShare < 0 ||
      noirShare +
        cafeShare !==
        100
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Revenue share harus total 100%",
        },
        { status: 400 },
      );
    }

    const ref =
      adminDb
        .collection("cafes")
        .doc(cafeId);

    const existing =
      await ref.get();

    if (existing.exists) {
      return Response.json(
        {
          success: false,
          error:
            "Cafe ID sudah digunakan",
        },
        { status: 409 },
      );
    }

    await ref.set({
      name,
      active: true,
      revenueShareNoir:
        noirShare,
      revenueShareCafe:
        cafeShare,
      createdBy:
        user.uid,
      createdAt:
        FieldValue.serverTimestamp(),
      updatedAt:
        FieldValue.serverTimestamp(),
    });

    return Response.json({
      success: true,
      cafe: {
        id: cafeId,
        name,
        revenueShareNoir:
          noirShare,
        revenueShareCafe:
          cafeShare,
        active: true,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

function slugify(
  value: string,
) {
  return value
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(/^-+|-+$/g, "");
}

function handleError(
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message
      : "Internal server error";

  return Response.json(
    {
      success: false,
      error:
        message ===
        "UNAUTHORIZED"
          ? "Unauthorized"
          : message,
    },
    {
      status:
        message ===
        "UNAUTHORIZED"
          ? 401
          : 500,
    },
  );
}
