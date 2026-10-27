import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";

type Props = {
  title: string;
  as?: "h1" | "h2";
  eyebrow?: string;
  children?: ReactNode;
  className?: string;
};

export function SectionHeading({ title, as: Tag = "h2", eyebrow, children, className }: Props) {
  return (
    <Reveal className={className}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <Tag className={Tag === "h1" ? "h1" : "h2"}>{title}</Tag>
      {children ? <p className="lead" style={{ marginTop: 22 }}>{children}</p> : null}
    </Reveal>
  );
}
