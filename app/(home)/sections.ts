// The launcher's section catalogue: static data shared by the welcome page and
// its loading.tsx twin (which renders every panel while the session resolves).
import type { SectionKey } from "@/lib/access";
import {
  Users,
  ShieldCheck,
  UserCog,
  LayoutDashboard,
  BarChart3,
  Settings,
  Percent,
  Wrench,
  Mail,
  Folder,
  Sparkles,
  KeyRound,
  Cog,
  Handshake,
  Boxes,
  Tags,
  RefreshCw,
  Warehouse,
  Zap,
  Blocks,
  Radar,
  SlidersHorizontal,
  FileText,
  ReceiptText,
  FileMinus,
  ClipboardList,
  Building2,
  ShoppingCart,
} from "lucide-react";

export const sections: {
  label: string;
  section: SectionKey;
  icon: React.ElementType;
  color: string;
  bg: string;
  cards: { href: string; icon: React.ElementType; title: string; desc: string; section?: SectionKey }[];
}[] = [
  {
    label: "General",
    section: "general",
    icon: Folder,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    cards: [
      { href: "/users",        icon: Users,       title: "Users",         desc: "Manage accounts and profiles" },
      { href: "/roles",        icon: ShieldCheck, title: "Access Types",  desc: "Configure permission roles", section: "access" },
      { href: "/roles/assign", icon: UserCog,     title: "Assign Access", desc: "Grant access to users", section: "access" },
    ],
  },
  {
    label: "AI",
    section: "ai",
    icon: Sparkles,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    cards: [
      { href: "/ai/dashboard", icon: LayoutDashboard, title: "AI Dashboard", desc: "Usage overview and KPIs" },
      { href: "/ai/usage",     icon: BarChart3,       title: "AI Usage",     desc: "Detailed logs and costs" },
    ],
  },
  {
    label: "Warranty",
    section: "warranty",
    icon: Wrench,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    cards: [
      { href: "/warranty",          icon: Wrench, title: "Warranty Claims", desc: "Review, triage and resolve" },
      { href: "/warranty/settings", icon: Mail,   title: "Email Settings",  desc: "Customize warranty emails" },
    ],
  },
  {
    label: "Partners",
    section: "partners",
    icon: Handshake,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    cards: [
      { href: "/partners",      icon: Handshake,  title: "Partners",       desc: "Accounts, activity and insights" },
      { href: "/partners/sync", icon: RefreshCw,  title: "Catalogue Sync", desc: "Shopify catalogue sync status" },
    ],
  },
  {
    label: "Automation",
    section: "automation",
    icon: Zap,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    cards: [
      { href: "/automation",           icon: LayoutDashboard, title: "Overview",  desc: "Both syncs + combined run history" },
      { href: "/automation/warehouse", icon: Warehouse,       title: "Warehouse", desc: "T4A stock → CREAGLOBE" },
      { href: "/automation/products",  icon: Boxes,           title: "Products",  desc: "One-way catalogue sync T4A → CREAGLOBE" },
      { href: "/automation/pricelists", icon: Tags,           title: "Pricelists", desc: "Mapped price lists T4A → CREAGLOBE" },
    ],
  },
  {
    label: "Builder",
    section: "builder",
    icon: Blocks,
    color: "text-blue-600 dark:text-blue-500",
    bg: "bg-blue-600/10",
    cards: [
      { href: "/builder/radar-chart", icon: Radar,             title: "Radar Chart",     desc: "Build a performance octagon" },
      { href: "/builder/range-bars",  icon: SlidersHorizontal, title: "Range Bars",      desc: "Build feel / rider-goal bars" },
    ],
  },
  {
    label: "Documents",
    section: "documents",
    icon: FileText,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    cards: [
      { href: "/documents/customer", icon: Building2,      title: "Customer", desc: "Customer details and account" },
      { href: "/documents/invoices", icon: ReceiptText,    title: "Invoices", desc: "Browse any customer's invoices" },
      { href: "/documents/credit-notes", icon: FileMinus,  title: "Credit notes", desc: "Browse any customer's credit notes" },
      { href: "/documents/offers",   icon: FileText,       title: "Offers",   desc: "Browse any customer's offers" },
      { href: "/documents/orders",   icon: ClipboardList,  title: "Orders",   desc: "Browse any customer's orders" },
    ],
  },
  {
    label: "Preorder",
    section: "preorder",
    icon: ShoppingCart,
    color: "text-lime-600 dark:text-lime-500",
    bg: "bg-lime-600/10",
    cards: [
      { href: "/preorder", icon: ClipboardList, title: "Campaigns", desc: "Build order sheets and review preorders" },
      { href: "/preorder/vat-rates", icon: Percent, title: "VAT rates", desc: "VAT rate per country for consumer preorders" },
    ],
  },
  {
    label: "Customers",
    section: "customers",
    icon: Users,
    color: "text-cyan-600 dark:text-cyan-500",
    bg: "bg-cyan-600/10",
    cards: [
      { href: "/customers", icon: Users, title: "All customers", desc: "Every Metakocka customer, their preorders, and the portal as they see it" },
    ],
  },
  {
    label: "System",
    section: "system",
    icon: Cog,
    color: "text-slate-500",
    bg: "bg-slate-500/10",
    cards: [
      { href: "/settings", icon: Settings, title: "Settings", desc: "App preferences and configuration" },
    ],
  },
];

