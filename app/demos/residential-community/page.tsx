import type { Metadata } from "next";
import { ResidentialCommunityDemo } from "./ResidentialCommunityDemo";

export const metadata: Metadata = {
  title: "林庭社区 · 完整住宅社区建筑场景",
  description: "完整住宅社区模型，包含高层与多层住宅组团、社区商业街、独立幼儿园、地下车库、社区服务设施与全龄活动空间。",
};

export default function ResidentialCommunityPage() {
  return <ResidentialCommunityDemo />;
}
