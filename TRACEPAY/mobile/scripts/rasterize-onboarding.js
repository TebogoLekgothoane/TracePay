const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "assets", "images", "onboarding");
const files = [
  ["onb 1.svg", "onb-1.png"],
  ["onb 2.svg", "onb-2.png"],
  ["onb 3.svg", "onb-3.png"],
  ["onb 4.svg", "onb-4.png"],
];

for (const [srcName, outName] of files) {
  const src = path.join(dir, srcName);
  const out = path.join(dir, outName);
  console.log("rasterizing", srcName);
  const svg = fs.readFileSync(src);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1024 },
    background: "rgba(0,0,0,0)",
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(out, png);
  console.log("wrote", outName, png.length);
}
