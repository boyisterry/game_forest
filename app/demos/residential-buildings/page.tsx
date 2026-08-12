import type { Metadata } from "next";
import { CityFurnitureDemo } from "../city-street-furniture/CityFurnitureDemo";

export const metadata: Metadata = {
  title: "居民建筑 · 独立模型 Demo",
  description: "集中展示社区居民楼、坡顶别墅、高层住宅与宽体办公园区的正常和破碎版本。",
};

export default function ResidentialBuildingsDemoPage() {
  return <CityFurnitureDemo category="residential" />;
}
