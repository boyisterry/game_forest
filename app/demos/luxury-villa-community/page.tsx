import type { Metadata } from "next";
import { LuxuryVillaCommunityDemo } from "./LuxuryVillaCommunityDemo";

export const metadata: Metadata = {
  title: "澜谷御苑 · 豪华别墅小区独立场景",
  description: "由15栋独立庭院别墅、五个林谷组团、连续曲线景观环路、80%生态风景、中央生态园与小桥流水组成的豪华别墅小区。",
};

export default function LuxuryVillaCommunityPage() {
  return <LuxuryVillaCommunityDemo />;
}
