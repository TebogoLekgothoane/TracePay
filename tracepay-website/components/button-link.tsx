import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof Link> & {
  variant?: "solid" | "ghost";
  size?: "default" | "small";
};

export function ButtonLink({ variant = "solid", size = "default", className, ...rest }: Props) {
  return (
    <Link
      className={cn("btn", variant === "solid" ? "btn-solid" : "btn-ghost", size === "small" && "btn-small", className)}
      {...rest}
    />
  );
}
