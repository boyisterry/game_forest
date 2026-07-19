import type { Metadata } from "next";
import { MapStudio } from "./components/MapStudio";

export const metadata: Metadata = {
  title: "林间速递 · 地图工坊",
  description: "为兔子骑手设计蜿蜒、温柔又充满探索感的森林配送路线。",
};

export default function Home() {
  return <MapStudio />;
}
