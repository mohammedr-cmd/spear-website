import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportFailure } from "../trace";

// A failure inside one part of the page stays in that part (Mo, 25 Nov 2026): the panel shows
// "Not answered" with the reason, the rest of the page keeps working, and the page never goes
// blank. Each failure is reported with the page, the last action and the response's shape.
type Props = { children: ReactNode; fallback: (retry: () => void, reported: boolean | null) => ReactNode; name: string };

export class Boundary extends Component<Props, { failed: boolean; reported: boolean | null }> {
  state = { failed: false, reported: null as boolean | null };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    const first = (info.componentStack ?? "").trim().split("\n")[0]?.trim() ?? "";
    reportFailure(error, `${this.props.name} ${first}`).then((ok) => this.setState({ reported: ok }));
  }
  render() {
    return this.state.failed
      ? this.props.fallback(() => this.setState({ failed: false, reported: null }), this.state.reported)
      : this.props.children;
  }
}
