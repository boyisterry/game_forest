import type { Metadata } from "next";
import { IndustrialZoneDemo } from "../industrial-zones/IndustrialZoneDemo";

export const metadata: Metadata = {
  title: "云岚智谷 · 超现代科技园区",
  description: "包含创新研发、机器人原型、数据中心、光伏微电网、自动化仓库与无人物流的独立科技园区。",
};

export default function TechnologyParkPage() {
  return <IndustrialZoneDemo variant="technology-park" />;
}
