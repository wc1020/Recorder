import Link from "next/link";

export default function NotFound() {
  return (
    <p className="empty">
      没有这条记录。<Link href="/">回首页</Link>
    </p>
  );
}
