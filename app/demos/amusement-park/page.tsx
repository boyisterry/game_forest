import type { Metadata } from "next";
import { AmusementParkDemo } from "./AmusementParkDemo";

export const metadata: Metadata = {
  title: "奇境都会游乐园 · 独立城市模型展示区",
  description: "大型低多边形城市游乐园，包含过山车、旋转木马、海盗船、摩天轮、翻斗乐、马戏团、射击场和卡丁车赛道。",
};

export default function AmusementParkPage() {
  return <AmusementParkDemo />;
}
