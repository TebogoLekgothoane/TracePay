import { Component, type ReactNode } from "react";
import { Text } from "react-native";

type Props = { children: ReactNode; label?: string };
type State = { failed: boolean };

/** Keeps one chart that fails to draw from taking the whole screen down with it. */
export class ChartBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Name the failure in the log so a broken chart is easy to trace.
    console.warn(`Chart failed to draw: ${error?.message || String(error)}`);
  }

  render() {
    if (this.state.failed) {
      return (
        <Text className="text-[13px] leading-5 text-muted-foreground">
          {this.props.label ?? "This chart could not be drawn right now."}
        </Text>
      );
    }
    return this.props.children;
  }
}
