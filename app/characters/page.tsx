import type { Metadata } from "next";
import { CharacterShowcase } from "./CharacterShowcase";

export const metadata: Metadata = {
  title: "森林信使 · 角色档案馆",
  description: "浏览森林信使动物角色、切换角色动作，并检查绑定骨架与纯骨架动画。",
};

export default function CharactersPage() {
  return <CharacterShowcase />;
}
