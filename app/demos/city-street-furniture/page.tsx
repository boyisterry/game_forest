import type { Metadata } from "next";
import { CityFurnitureDemo } from "./CityFurnitureDemo";

export const metadata: Metadata = {
  title: "城市街道设施 · 独立模型 Demo",
  description: "独立展示森林同款正常树、低模路灯、低模红绿灯和流动餐车。",
};

export default function CityStreetFurnitureDemoPage() {
  return <CityFurnitureDemo />;
}
