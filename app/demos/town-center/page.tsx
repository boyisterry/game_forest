import type { Metadata } from "next";
import { TownCenterDemo } from "./TownCenterDemo";

export const metadata: Metadata = {
  title: "溪桥市镇中心 · 独立市镇场景",
  description: "低层步行市镇中心模型，包含市政厅与钟楼、图书馆、文化礼堂、传统集市、商业街、便民服务、邮政和公共到达设施。",
};

export default function TownCenterPage() {
  return <TownCenterDemo />;
}
