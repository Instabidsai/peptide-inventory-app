console.log("Main.tsx STARTING");
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
    const root = createRoot(rootElement);
    try {
        root.render(<App />);
        console.log("App mounted");
    } catch (e) {
        console.error("SYNC RENDER ERROR", e);
    }
}
