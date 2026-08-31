import { notFound } from "next/navigation";

import WatchdogTestClient from "./WatchdogTestClient";

export default function WatchdogTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <WatchdogTestClient />;
}
