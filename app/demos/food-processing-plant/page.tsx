import type { Metadata } from "next";
import { IndustrialZoneDemo } from "../industrial-zones/IndustrialZoneDemo";

export const metadata: Metadata = {
  title: "澄源智造 · 现代食品加工厂",
  description: "包含洁净加工、自动包装、品质检测、冷链立库、光伏微电网与水循环处理的独立食品工厂。",
};

export default function FoodProcessingPlantPage() {
  return <IndustrialZoneDemo variant="food-processing-plant" />;
}
