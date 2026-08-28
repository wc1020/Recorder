export function Cover({
  url,
  title,
  size = "md",
}: {
  url: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
}) {
  const cls = `cover cover-${size}`;
  if (!url) {
    return (
      <div className={`${cls} cover-empty`} aria-hidden>
        {title.slice(0, 1)}
      </div>
    );
  }
  return (
    // 封面是外部 URL，第一版不下载、不走 next/image 优化
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cls} src={url} alt={title} />
  );
}
