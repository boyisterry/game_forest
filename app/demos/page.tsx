import type { Metadata } from "next";
import Link from "next/link";
import styles from "./ModelShowcaseHome.module.css";

export const metadata: Metadata = {
  title: "城市模型展示区 · 分类入口",
  description: "按街道装饰、居民建筑、医院、大型游乐园、现代学校、商业中心、完整住宅社区、消防局、城市公园、体育中心、城市中心和市镇中心浏览原创低模模型的正常与破碎版本。",
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
    tags: ["4 组建筑", "完整内饰", "剖面与电梯交互", "正常 / 破碎"],
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
    tags: ["12 项游乐设施", "昼夜灯光", "动态设施与镜头导览", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 05",
    title: "现代学校",
    description: "独立高中与大学进修校园，完整呈现教学、实验、行政、住宿、运动与室内游泳功能。",
    href: "/demos/school-campus",
    visual: "school",
    tags: ["7 栋主体建筑", "完整运动区", "外观 / 剖面 / 夜景", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 06",
    title: "大型商业中心",
    description: "开放街区式商业建筑群，外圈首层临街开店，内部以露天中庭、餐饮街和空中连廊连接。",
    href: "/demos/shopping-mall",
    visual: "shopping",
    tags: ["5 栋商业建筑", "62 个首层商铺", "露天中庭 / 夜景", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 07",
    title: "完整住宅社区",
    description: "将住宅组团、开放式社区商业街和独立幼儿园整合为拥有门禁、消防环路与公共服务的完整街区。",
    href: "/demos/residential-community",
    visual: "community",
    tags: ["8 栋住宅 / 368 户", "14 个社区商铺", "160 人幼儿园", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 08",
    title: "城市消防局",
    description: "完整一级消防站院区，将消防车快速出警、应急指挥、执勤生活、装备后勤和专业训练集中组织。",
    href: "/demos/fire-station",
    visual: "fire",
    tags: ["6 个消防车库", "6 辆专业消防车", "8 层训练塔 / 警报交互", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 09",
    title: "综合城市公园",
    description: "开放式市级公园，以中央生态湖连接步行骑行环线、儿童运动设施、植物温室、露天剧场和游客服务。",
    href: "/demos/city-park",
    visual: "park",
    tags: ["185 × 140 米", "中央湖 / 4 个开放入口", "6 个功能区 / 动态水景", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 10",
    title: "城市体育中心",
    description: "市级体育建筑群，完整呈现田径足球主场、综合体育馆、公共游泳馆、全民健身和室外运动设施。",
    href: "/demos/sports-center",
    visual: "sports",
    tags: ["12,000 座主体育场", "5,200 座体育馆", "50 米泳池 / 赛事夜景", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 11",
    title: "城市中心",
    description: "高密度城市核心区，以玻璃地标建筑群和中央市民广场串联四类相互独立的交通与城市入口设施。",
    href: "/demos/city-center",
    visual: "center",
    tags: ["独立综合交通枢纽", "独立公交总站 / 出租车点", "独立城市地图入口", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 12",
    title: "市镇中心",
    description: "面向小城市与卫星镇的低层步行核心，以市政钟楼广场连接文化、集市、商业和日常公共服务。",
    href: "/demos/town-center",
    visual: "town",
    tags: ["市政厅 / 38 米钟楼", "图书馆 / 文化礼堂", "传统集市 / 商业街 / 便民服务", "正常 / 破碎"],
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
        <p className={styles.intro}>从街道细节到完整建筑院区、游乐园、现代校园、商业中心、住宅社区、消防局、城市公园、体育中心、城市中心与市镇中心，所有模型均在项目内独立生成，并提供正常与破碎双版本、结构参数与可交互状态。</p>
        <Link className={styles.homeLink} href="/">← 返回地图工坊</Link>
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
