import type { Metadata } from "next";
import { CityParkDemo } from "./CityParkDemo";

export const metadata: Metadata = {
  title: "云水公园 · 独立城市公园场景",
  description: "综合性城市公园模型，包含中央生态湖、景观桥、步行与骑行环路、儿童活动场、社区运动区、植物温室、露天剧场和游客服务中心。",
};

export default function CityParkPage() {
  return <CityParkDemo />;
}
