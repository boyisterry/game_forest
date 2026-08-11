import type { Metadata } from "next";
import { HospitalCampusDemo } from "./HospitalCampusDemo";

export const metadata: Metadata = {
  title: "综合医院 · 独立模型展示区",
  description: "完整展示低模综合医院的门诊、急诊、住院病房、外观、内饰及正常与破碎版本。",
};

export default function HospitalCampusDemoPage() {
  return <HospitalCampusDemo />;
}
