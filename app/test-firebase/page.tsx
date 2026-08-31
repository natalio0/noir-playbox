import { notFound } from "next/navigation";

import TestFirebaseClient from "./TestFirebaseClient";

export default function TestFirebasePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <TestFirebaseClient />;
}
