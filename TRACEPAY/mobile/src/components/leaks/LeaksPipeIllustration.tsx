import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

type Props = {
  accent: string;
  primary: string;
  highlight: string;
};

export function LeaksPipeIllustration({ accent, primary, highlight }: Props) {
  return (
    <Svg width={110} height={120} viewBox="0 0 110 120">
      <Ellipse cx="55" cy="108" rx="28" ry="8" fill={accent} opacity={0.35} />
      <Ellipse cx="55" cy="106" rx="18" ry="5" fill={accent} opacity={0.5} />
      <Rect x="38" y="18" width="34" height="12" rx="6" fill={primary} />
      <Rect x="48" y="30" width="14" height="52" rx="7" fill={highlight} />
      <Path
        d="M48 58 Q42 62 44 68 Q46 74 52 72"
        stroke={accent}
        strokeWidth={2}
        fill="none"
      />
      <Circle cx="43" cy="72" r="3" fill={accent} opacity={0.9} />
      <Circle cx="40" cy="82" r="2.5" fill={accent} opacity={0.75} />
      <Circle cx="46" cy="90" r="2" fill={accent} opacity={0.6} />
      <Circle cx="38" cy="96" r="2.5" fill={accent} opacity={0.5} />
      <Path
        d="M55 30 L55 82"
        stroke={highlight}
        strokeWidth={1.5}
        opacity={0.4}
      />
    </Svg>
  );
}
