import type { Metadata } from "next";
import { CityCenterDemo } from "./CityCenterDemo";

export const metadata: Metadata = {
  title: "云港城市中心 · 独立城市核心区",
  description: "城市中心独立模型，包含地标建筑群、综合交通枢纽、公共汽车总站、出租车停车点、城市地图入口和中央市民广场。",
};

export default function CityCenterPage() {
  return <CityCenterDemo />;
}
