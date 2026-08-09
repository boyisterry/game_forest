import type { Metadata } from "next";
import { MapStudio } from "./components/MapStudio";

export const metadata: Metadata = {
  title: "Forest Courier · World Workshop",
  description: "Ride a rabbit scooter through a procedural forest or the streets of Rain Harbor.",
};

export default function Home() {
  return <MapStudio />;
}
