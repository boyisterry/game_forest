import type { Metadata } from "next";
import { MapLibraryApp } from "./components/MapLibraryApp";

export const metadata: Metadata = {
  title: "Forest Courier · Map Library",
  description: "Create, edit and ride through your own city maps or the Deep Forest.",
};

export default function Home() {
  return <MapLibraryApp />;
}
