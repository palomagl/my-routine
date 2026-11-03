import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { vigiarAtualizacoes } from "./lib/atualizacao";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

vigiarAtualizacoes();
