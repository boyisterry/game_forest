import type { Metadata } from "next";
import { ShoppingMallDemo } from "./ShoppingMallDemo";

export const metadata: Metadata = {
  title: "都会里商业中心 · 独立大型商场场景",
  description: "开放街区式大型商业中心，包含外向首层商铺、露天中庭、餐饮街、咖啡店、汉堡店、奶茶店与空中连廊。",
};

export default function ShoppingMallPage() {
  return <ShoppingMallDemo />;
}
