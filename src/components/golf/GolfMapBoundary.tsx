import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  error: Error | null;
}

/** MapLibre can throw on WebGL init; don't take down the whole Golf screen. */
export class GolfMapBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}
