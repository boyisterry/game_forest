import type { Metadata } from "next";
import styles from "./ModelShowcaseHome.module.css";

export const metadata: Metadata = {
  title: "城市模型展示区 · 分类入口",
  description: "按街道装饰、居民建筑、医院、大型游乐园和现代学校浏览项目内原创低模模型。",
};

const categories = [
  {
    number: "COLLECTION 01",
    title: "街道装饰",
    description: "城市行道树、路灯、交通信号、餐车、街边亭与长条花坛。",
    href: "/demos/city-street-furniture",
    visual: "street",
    tags: ["8 组模型", "正常 / 破碎", "灯光与开合交互"],
  },
  {
    number: "COLLECTION 02",
    title: "居民建筑",
    description: "社区居民楼、坡顶别墅、高层住宅，以及扩展的宽体办公园区。",
    href: "/demos/residential-buildings",
    visual: "residential",
    tags: ["4 组建筑", "完整内饰", "剖面与电梯交互"],
  },
  {
    number: "COLLECTION 03",
    title: "医院",
    description: "独立综合医院院区，完整展示门诊、急诊、住院病房及医疗内饰。",
    href: "/demos/hospital-campus",
    visual: "hospital",
    tags: ["3 大医疗分区", "独立展示区", "外观 / 内饰 / 破碎"],
  },
  {
    number: "COLLECTION 04",
    title: "大型游乐园",
    description: "独立城市娱乐区，汇集过山车、旋转木马、海盗船、摩天轮、马戏团与卡丁车赛道。",
    href: "/demos/amusement-park",
    visual: "amusement",
    tags: ["12 项游乐设施", "昼夜灯光", "动态设施与镜头导览"],
  },
  {
    number: "COLLECTION 05",
    title: "现代学校",
    description: "独立高中与大学进修校园，完整呈现教学、实验、行政、住宿、运动与室内游泳功能。",
    href: "/demos/school-campus",
    visual: "school",
    tags: ["7 栋主体建筑", "完整运动区", "外观 / 剖面 / 夜景"],
  },
] as const;

export default function ModelShowcaseHome() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>FOREST COURIER / MODEL ARCHIVE</p>
          <h1>城市模型展示区</h1>
        </div>
        <p className={styles.intro}>从街道细节到完整建筑院区、游乐园与现代校园，所有模型均在项目内独立生成，并提供结构参数与可交互状态。</p>
        <a className={styles.homeLink} href="/">← 返回地图工坊</a>
      </header>
      <section className={styles.categories} aria-label="模型分类">
        {categories.map((category) => (
          <a key={category.title} className={styles.card} href={category.href}>
            <span className={styles.number}>{category.number}</span>
            <div className={`${styles.visual} ${styles[category.visual]}`} aria-hidden="true"><i /></div>
            <div>
              <h2>{category.title}</h2>
              <p>{category.description}</p>
            </div>
            <div className={styles.tags}>{category.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            <span className={styles.arrow}>↗</span>
          </a>
        ))}
      </section>
    </main>
  );
}
