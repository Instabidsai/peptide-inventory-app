# GEMINI.md - project-level Agent Protocols

This file contains critical instructions for any AI agent working on the **Peptide Inventory App**. 
**YOU MUST READ THIS BEFORE MAKING CHANGES.**

## 1. 🚨 CRITICAL: "Zero-Crash" Policy
The application has experienced crashes due to missing imports and bad hook usage. 
**BEFORE you confirm a task is complete, you MUST:**

### A. Verify Imports
- If you copy-paste code (especially hooks like `useDeleteMovement`, `useToast`), **CHECK THE IMPORTS**.
- Do not assume imports are auto-added.

### B. Run Build Check
- **Mandatory Step**: Run `npm run build` locally before asking the user to deploy.
- If the build fails, **DO NOT PUSH**. Fix the errors first.

### C. Smoke Test
- Navigate to the page you just edited using the browser tool.
- Click the buttons you added/modified.
- Ensure the page renders without a blank white screen.

## 2. 🏛️ Architecture Overview
- **Backend**: Supabase (PostgreSQL + Edge Functions).
- **Frontend**: distinct pages in `src/pages`.
- **State Management**: React Query (`@tanstack/react-query`).
- **Styling**: Tailwind CSS + shadcn/ui.

## 3. 📦 Database & Schema
- **Orders**: Pending inventory not yet received.
- **Lots**: Physical groups of vials (Inventory).
- **Bottles**: Individual tracked units (linked to Lots).
- **Movements**: Transactions (Sales, Giveaways) that move Bottles out of stock.
- **Client Inventory**: "Digital Fridge" for contacts.

## 4. ⚠️ Known Pitfalls
- **`useDeleteMovement`**: This hook deletes a movement AND restores bottles to `in_stock`. Ensure it is imported correctly.
- **Context Errors**: Do not use `DialogTitle` inside `AlertDialog`. Use `AlertDialogTitle`.
- **RLS Policies**: If a query returns empty data unexpectedly, check Row Level Security policies on Supabase.

- Always update `task.md` and `walkthrough.md` in the `.gemini/...` directory.
- Keep the user informed of *exactly* what you are doing (e.g., "Running build check...").

## 6. 🚨 Troubleshooting & Stability
- **STRICT PORT POLICY**: **WE ONLY RUN TERMINAL ON PORT 4550.** Do not check 5173, 3000, or others.
- **White Screen (Local Dev)**: If `npm run dev` works but the browser shows a blank white screen with NO console errors, it is likely a **Circular Dependency** or **Module Evaluation Failure**.
  - **Action**: Check recent imports in high-level Pages (e.g., `ContactDetails.tsx`).
  - **Diagnostic**: Use "Strip Down" method—comment out all child component imports in the Page to see if it renders.
- **Toxic Imports**: Avoid importing "Page" components into "Hook" files or "Form" components. This creates cycles.
- **Duplicate Identifiers**: Be careful when auto-importing; VS Code sometimes redundantly imports the same symbol (e.g., icons from `lucide-react`).

