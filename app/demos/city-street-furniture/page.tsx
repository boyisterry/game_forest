import type { Metadata } from "next";
import { CityFurnitureDemo } from "./CityFurnitureDemo";

export const metadata: Metadata = {
  title: "城市街道设施 · 独立模型 Demo",
  description: "独立展示森林同款树、城市街道设施、住宅与宽体总部办公园区的正常和破碎版本。",
};

export default function CityStreetFurnitureDemoPage() {
  return <CityFurnitureDemo />;
}
