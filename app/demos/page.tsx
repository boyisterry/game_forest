import type { Metadata } from "next";
import Link from "next/link";
import styles from "./ModelShowcaseHome.module.css";

export const metadata: Metadata = {
  title: "城市模型展示区 · 分类入口",
  description: "按街道装饰、交通工具、居民建筑、医院、游乐园、学校、商业中心、住宅社区、科技园区、食品加工厂、机械化工厂和城市公共建筑浏览原创低模模型的正常与破碎版本。",
};

const categories = [
  {
    number: "CHARACTER ARCHIVE",
    title: "动物角色",
    description: "浏览兔子、狐狸与虎子信使，检查角色动作、绑定骨架与纯骨架动画。",
    href: "/characters",
    visual: "character",
    tags: ["3 个动物角色", "4 组角色动作", "骨骼可视化", "纯骨架模式"],
  },
  {
    number: "COLLECTION 01",
    title: "街道装饰",
    description: "城市行道树、路灯、交通信号、餐车、街边亭与长条花坛。",
    href: "/demos/city-street-furniture",
    visual: "street",
    tags: ["8 组模型", "正常 / 破碎", "灯光与开合交互"],
  },
  {
    number: "COLLECTION 13",
    title: "交通工具",
    description: "面向城市道路系统的精细载具，包含纯电公交、专用校车、营运出租车、私家小轿车与SUV，并完整设计驾驶区和乘坐空间。",
    href: "/demos/transportation",
    visual: "transport",
    tags: ["公交 / 校车 / 出租车 / 轿车 / SUV", "完整精细内饰", "车门 / 尾门 / 灯光交互", "正常 / 破碎"],
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
    number: "COLLECTION 07A",
    title: "普通住宅小区",
    description: "由18栋统一社区居民楼组成的模块化普通小区，三排住宅均配置路边地面停车，并提供30%绿化与室外健身花园。",
    href: "/demos/standard-residential-community",
    visual: "community",
    tags: ["18 栋住宅 / 360 户", "3 排停车 / 66 个车位", "30% 绿化 / 室外健身", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 07B",
    title: "豪华别墅小区",
    description: "15栋独立庭院别墅沿连续曲线景观环路组成五个林谷组团，中央生态园集中布置网球、户外娱乐与小桥流水。",
    href: "/demos/luxury-villa-community",
    visual: "community",
    tags: ["15 栋一户一院别墅", "五组团 / 有机景观环路", "80% 生态景观", "中央网球 / 娱乐 / 正常 / 破碎"],
  },
  {
    number: "COLLECTION 08A",
    title: "超现代科技园区",
    description: "大型独立研发制造园区，以创新研发、数据中心和机器人原型制造连接智慧仓储、无人物流与清洁能源。",
    href: "/demos/technology-park",
    visual: "center",
    tags: ["260 × 180 米", "2 条柔性自动线", "光伏微电网 / 立体仓库", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 08B",
    title: "现代食品加工厂",
    description: "按原料、洁净加工、品质检测、自动包装与冷链出货组织的超现代食品工厂，配置水循环和光伏储能。",
    href: "/demos/food-processing-plant",
    visual: "shopping",
    tags: ["280 × 200 米", "3 条自动化流水线", "冷链立库 / CIP / 水回收", "正常 / 破碎"],
  },
  {
    number: "COLLECTION 08C",
    title: "超现代机械化工厂",
    description: "面向重型装备制造的数控加工、机器人焊接、自动总装和封闭喷涂园区，配置龙门吊与智慧能源系统。",
    href: "/demos/mechanized-factory",
    visual: "fire",
    tags: ["300 × 210 米", "8 台 CNC / 3 条自动线", "20 吨龙门吊 / AGV", "正常 / 破碎"],
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
        <p className={styles.intro}>从街道细节、交通工具到完整建筑院区、游乐园、现代校园、商业中心、住宅社区、超现代工业园区与城市公共中心，所有模型均在项目内独立生成，并提供正常与破碎双版本、结构参数与可交互状态。</p>
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
