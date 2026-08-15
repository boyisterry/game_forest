import type { Metadata } from "next";
import { SportsCenterDemo } from "./SportsCenterDemo";

export const metadata: Metadata = {
  title: "凌峰体育中心 · 独立体育建筑场景",
  description: "城市级体育中心模型，包含田径足球主体育场、综合体育馆、50 米公共游泳馆、全民健身中心、室外球场、滑板公园和赛事服务区。",
};

export default function SportsCenterPage() {
  return <SportsCenterDemo />;
}
