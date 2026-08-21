import type { Metadata } from "next";
import { StandardResidentialCommunityDemo } from "./StandardResidentialCommunityDemo";

export const metadata: Metadata = {
  title: "清禾家园 · 普通小区独立场景",
  description: "由左右住宅组团、中央生活道路、三排双侧地面停车、30%绿化和独立室外健身院落组成的模块化普通住宅小区。",
};

export default function StandardResidentialCommunityPage() {
  return <StandardResidentialCommunityDemo />;
}
