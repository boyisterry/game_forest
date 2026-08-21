import type { Metadata } from "next";
import { IndustrialZoneDemo } from "../industrial-zones/IndustrialZoneDemo";

export const metadata: Metadata = {
  title: "擎岳智造 · 机械化工厂",
  description: "包含数控加工、机器人焊接、自动总装、封闭喷涂、智能仓储与光伏储能的独立机械工厂。",
};

export default function MechanizedFactoryPage() {
  return <IndustrialZoneDemo variant="mechanized-factory" />;
}
