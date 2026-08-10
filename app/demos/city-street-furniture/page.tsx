import type { Metadata } from "next";
import { CityFurnitureDemo } from "./CityFurnitureDemo";

export const metadata: Metadata = {
  title: "城市街道设施 · 独立模型 Demo",
  description: "独立展示森林同款树、城市街道设施、长条花坛、居民楼和小别墅的正常与破碎版本。",
};

export default function CityStreetFurnitureDemoPage() {
  return <CityFurnitureDemo />;
}
