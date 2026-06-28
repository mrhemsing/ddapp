import { EntitlementGate } from "@/components/EntitlementGate";
import { RoutePlayer } from "@/components/RoutePlayer";

export default function Home() {
  if (process.env.NODE_ENV !== "production") {
    return <RoutePlayer />;
  }

  return (
    <EntitlementGate demoEnabled={false}>
      <RoutePlayer />
    </EntitlementGate>
  );
}
