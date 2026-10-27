import type { MetadataRoute } from "next";
import { SITE } from "@/lib/content";

const ROUTES = ["", "/how-it-works", "/what-we-detect", "/security", "/about"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${SITE.url}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
