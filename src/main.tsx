console.log("Main.tsx STARTING");
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");
console.log("Root element:", rootElement);

if (rootElement) {
    const root = createRoot(rootElement);
    console.log("Root created. Rendering App...");
    try {
        root.render(
            <div style={{ border: '5px solid red', padding: 20 }}>
                <h1>App Wrapper</h1>
                <App />
            </div>
        );
        console.log("App mounted (async)");
    } catch (e) {
        console.error("SYNC RENDER ERROR", e);
        document.body.innerHTML = "<h1>SYNC RENDER ERROR: " + e + "</h1>";
    }
}
