import type { Metadata } from "next";
import { TransportationDemo } from "./TransportationDemo";

export const metadata: Metadata = {
  title: "交通工具 · 精细城市载具模型展示区",
  description: "完整展示原创纯电公交、专用校车、出租车、私家小轿车和SUV的外观、内饰、动态部件以及正常与破碎版本。",
};

export default function TransportationDemoPage() {
  return <TransportationDemo />;
}
