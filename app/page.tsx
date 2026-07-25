import type { Metadata } from "next";
import { MapStudio } from "./components/MapStudio";

export const metadata: Metadata = {
  title: "Forest Courier · Map Workshop",
  description: "Design winding forest delivery routes for a rabbit scooter courier.",
};

export default function Home() {
  return <MapStudio />;
}
