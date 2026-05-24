import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info);
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem("chunk-reload");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A0A0F",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <img
            src="https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA.png"
            alt="AuraIA"
            width={64}
            height={64}
            style={{ margin: "0 auto 1rem", display: "block" }}
          />
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Algo deu errado
          </h1>
          <p style={{ color: "#a1a1aa", fontSize: 14, margin: "0 0 1.5rem" }}>
            Encontramos um problema inesperado. Recarregue a página para continuar.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: "#6C47FF",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}