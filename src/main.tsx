console.log("Main.tsx STARTING - IF YOU SEE THIS, JS IS EXECUTING");
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);
console.log("Main.tsx - Render Called");
