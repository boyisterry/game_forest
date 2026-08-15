import type { Metadata } from "next";
import { FireStationDemo } from "./FireStationDemo";

export const metadata: Metadata = {
  title: "赤焰消防站 · 独立消防局建筑场景",
  description: "完整城市消防局院区，包含六车位消防车库、应急指挥中心、执勤生活区、器材仓库、八层训练塔与室外专业训练场。",
};

export default function FireStationPage() {
  return <FireStationDemo />;
}
