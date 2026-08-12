import type { Metadata } from "next";
import { CityFurnitureDemo } from "./CityFurnitureDemo";

export const metadata: Metadata = {
  title: "城市街道装饰 · 独立模型 Demo",
  description: "仅展示森林同款树、路灯、信号灯、餐车、街边亭、电话亭与花坛的正常和破碎版本。",
};

export default function CityStreetFurnitureDemoPage() {
  return <CityFurnitureDemo category="street" />;
}
