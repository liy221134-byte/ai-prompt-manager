import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  content: string;
  /**
   * 排版档位。
   *
   * - default：题目解析、资产详情这类「扫一眼」的场景，14px 紧凑排版
   * - reading：讲义这类「连续读几分钟」的场景，17px + 宽行高 + 表格放大
   *
   * 为什么要分档而不是把 .markdown-body 整体调大：题目解析与讲义共用一套
   * markdown 渲染，解析在一屏里要放题干、选项、结论，字放大后会挤成一片；
   * 讲义恰恰相反，它的问题就是字太小看着费劲。两个场景的最优值不一样，
   * 用一个全局值必然牺牲其中一边。
   */
  variant?: "default" | "reading";
};

export function MarkdownContent({ content, variant = "default" }: MarkdownContentProps) {
  return (
    <div className={variant === "reading" ? "markdown-body markdown-reading" : "markdown-body"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
