import type { Metadata } from "next";
import { SchoolCampusDemo } from "./SchoolCampusDemo";

export const metadata: Metadata = {
  title: "红砖学府 · 独立学校建筑场景",
  description: "现代高中与大学进修校园模型，包含教学楼、实验楼、教务处、学生宿舍、综合运动场、球场与室内游泳池。",
};

export default function SchoolCampusPage() {
  return <SchoolCampusDemo />;
}
